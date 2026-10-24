"""Read-only inventory of explicitly supplied local media roots. Outputs stay local."""
import argparse
import concurrent.futures
import datetime
import fractions
import json
import os
from pathlib import Path
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')
parser=argparse.ArgumentParser()
parser.add_argument('--roots',required=True,help='Local JSON array of authorized media directories/files')
parser.add_argument('--output',default='verification-local/media-fixtures.json')
args=parser.parse_args()
project=Path(__file__).resolve().parents[1]
output=(project/args.output).resolve()
if not output.is_relative_to(project/'verification-local'):
    raise SystemExit('Keep the private inventory inside verification-local/.')
probe=project/'tools/ffmpeg/ffmpeg-master-latest-win64-lgpl/bin/ffprobe.exe'
video_extensions={'.mkv','.mp4','.m4v','.ts','.m2ts','.avi','.webm','.mov'}
roots=json.loads(Path(args.roots).read_text(encoding='utf-8'))
catalog=[]
for number,root_name in enumerate(roots):
    root=Path(root_name)
    item={'id':f'root-{number+1}','label':root.name,'root':str(root),'exists':root.exists(),'files':[],'sidecars':[],'opticalImages':[],'playlistCount':0}
    if root.is_file():item['files']=[root]
    elif root.is_dir():
        for directory,folders,names in os.walk(root,followlinks=False):
            folders[:]=[name for name in folders if not name.startswith('.') and not os.path.islink(Path(directory)/name)]
            for name in names:
                file=Path(directory)/name
                if file.suffix.lower() in video_extensions:item['files'].append(file)
                elif file.suffix.lower() in {'.srt','.ass','.ssa','.vtt','.nfo','.sup'}:item['sidecars'].append(str(file))
                elif file.suffix.lower()=='.iso':item['opticalImages'].append({'path':str(file),'bytes':file.stat().st_size})
                elif file.suffix.lower()=='.mpls':item['playlistCount']+=1
    item['videoCount']=len(item['files'])
    item['discLayout']=any('BDMV' in file.parts for file in item['files'])
    # Largest stream is a representative clip, not a claim to resolve the feature playlist.
    if item['discLayout']:item['files']=sorted(item['files'],key=lambda file:file.stat().st_size,reverse=True)[:1]
    else:item['files']=sorted(item['files'])
    catalog.append(item)

def rate(value):
    try:return round(float(fractions.Fraction(value)),3)
    except (ValueError,ZeroDivisionError,TypeError):return None

def inspect(task):
    group,file=task
    before=file.stat()
    entry={'rootId':group['id'],'label':group['label'],'path':str(file),'bytes':before.st_size,'mtimeNs':before.st_mtime_ns,'discLayout':group['discLayout'],'roles':[]}
    try:
        result=subprocess.run([str(probe),'-v','error','-probesize','32M','-analyzeduration','8000000','-show_format','-show_streams','-of','json',str(file)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=35,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        if result.returncode:raise RuntimeError('ffprobe could not read this file')
        data=json.loads(result.stdout)
        streams=data.get('streams',[])
        video=next((s for s in streams if s.get('codec_type')=='video' and not s.get('disposition',{}).get('attached_pic')),None)
        if not video:raise RuntimeError('No video stream found')
        side_data=video.get('side_data_list',[])
        dovi=next((s for s in side_data if 'dovi' in s.get('side_data_type','').lower()),None)
        entry['container']=data.get('format',{}).get('format_name')
        entry['durationSeconds']=float(data.get('format',{}).get('duration') or video.get('duration') or 0)
        entry['video']={'codec':video.get('codec_name'),'profile':video.get('profile'),'width':video.get('width'),'height':video.get('height'),'pixelFormat':video.get('pix_fmt'),'fps':rate(video.get('avg_frame_rate')) or rate(video.get('r_frame_rate')),'colorTransfer':video.get('color_transfer'),'colorPrimaries':video.get('color_primaries'),'sideData':side_data,'dolbyVision':dovi}
        entry['audio']=[{'index':s['index'],'codec':s.get('codec_name'),'profile':s.get('profile'),'channels':s.get('channels'),'layout':s.get('channel_layout'),'sampleRate':s.get('sample_rate'),'language':s.get('tags',{}).get('language'),'title':s.get('tags',{}).get('title')} for s in streams if s.get('codec_type')=='audio']
        entry['subtitles']=[{'index':s['index'],'codec':s.get('codec_name'),'language':s.get('tags',{}).get('language'),'title':s.get('tags',{}).get('title'),'forced':bool(s.get('disposition',{}).get('forced'))} for s in streams if s.get('codec_type')=='subtitle']
        entry['fonts']=[s.get('tags',{}).get('filename') for s in streams if s.get('codec_type')=='attachment' and (s.get('codec_name') in {'ttf','otf'} or s.get('tags',{}).get('mimetype') in {'application/x-truetype-font','application/vnd.ms-opentype','font/ttf','font/otf'})]
        roles=entry['roles']
        if video.get('codec_name')=='h264' and file.suffix.lower()=='.mp4' and all(a['codec']=='aac' for a in entry['audio']):roles.extend(['browser-ui','h264-aac-baseline'])
        if video.get('codec_name')=='hevc':roles.append('hevc-decoding')
        if video.get('color_transfer') in {'smpte2084','arib-std-b67'}:roles.append('hdr-source')
        if dovi:roles.append('dolby-vision-profile-'+str(dovi.get('dv_profile')))
        if (entry['video']['fps'] or 0)>=50:roles.append('high-frame-rate')
        if len(entry['audio'])>1:roles.append('audio-switching')
        if any(s['codec']=='ass' for s in entry['subtitles']):roles.extend(['ass-subtitles','native-ui'])
        if any(s['codec']=='hdmv_pgs_subtitle' for s in entry['subtitles']):roles.append('pgs-subtitles')
        if entry['fonts']:roles.append('embedded-fonts')
        if any(Path(p).suffix.lower() in {'.srt','.ass','.ssa','.vtt','.sup'} for p in group['sidecars']):roles.append('external-subtitles')
        if any(a['codec'] in {'truehd','dts','eac3'} for a in entry['audio']):roles.append('advanced-audio-tracks')
        if group['discLayout']:roles.extend(['bdmv-directory','m2ts-clip']);entry['note']='Representative largest clip; complete disc navigation/playlist aggregation is not implied.'
        if file.name.startswith('S04E'):roles.append('season-episode-parsing')
        entry['available']=True
    except Exception as error:entry.update(available=False,error=f'{type(error).__name__}: {error}')
    after=file.stat()
    entry['unchanged']=before.st_size==after.st_size and before.st_mtime_ns==after.st_mtime_ns
    if not entry['unchanged']:raise RuntimeError('Media changed during read-only inspection')
    return entry

tasks=[(group,file) for group in catalog for file in group['files']]
entries=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
    for entry in executor.map(inspect,tasks):
        entries.append(entry)
        print(json.dumps({'file':Path(entry['path']).name,'available':entry['available'],'video':{k:v for k,v in entry.get('video',{}).items() if k in {'codec','width','height','fps','colorTransfer'}},'dvProfile':(entry.get('video',{}).get('dolbyVision') or {}).get('dv_profile'),'audio':len(entry.get('audio',[])),'subtitles':len(entry.get('subtitles',[])),'fonts':len(entry.get('fonts',[])),'roles':entry['roles'],'error':entry.get('error')},ensure_ascii=False),flush=True)
for group in catalog:group.pop('files')
result={'inspectedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'roots':catalog,'entries':entries,'limits':['Metadata inspection does not certify HDR/Dolby Vision display output or Atmos bitstream passthrough.','HDR10+ and Atmos claims in filenames require additional frame/audio evidence; filenames are not treated as proof.','A sampled M2TS clip is not a complete Blu-ray playlist. ISO files are inventoried without mounting.']}
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
role_names={'browser-ui':'内置播放与界面','h264-aac-baseline':'普通 MP4 兼容基线','hevc-decoding':'HEVC 解码','hdr-source':'HDR 色调映射','high-frame-rate':'高帧率与跳转','audio-switching':'多音轨切换与菜单分页','ass-subtitles':'ASS 特效与位置','native-ui':'原生播放界面','pgs-subtitles':'PGS 图形字幕','embedded-fonts':'内嵌字体','external-subtitles':'外挂字幕','advanced-audio-tracks':'高级音频解码','bdmv-directory':'蓝光目录识别','m2ts-clip':'M2TS 片段读取','season-episode-parsing':'季集识别'}
lines=['# 本地测试片库（私有，不上传）','',f"读取时间：{result['inspectedAt']}",'','仅只读分析；下表来自流元数据，不代表完整播放或 HDR／Atmos 设备输出认证。原文件大小与修改时间均保持不变。','','| 片源 | 实测格式 | 音轨／字幕／字体 | 测试用途 |','|---|---|---|---|']
for entry in entries:
    if not entry['available']:
        lines.append(f"| {Path(entry['path']).name} | 读取失败 | — | 重新检查可访问性 |")
        continue
    v=entry['video'];dv=v.get('dolbyVision') or {}
    fmt=f"{v['codec']} {v['width']}×{v['height']} · {v['fps']}fps · {entry['durationSeconds']:.1f}s"
    if dv:fmt+=f" · DV P{dv['dv_profile']}"
    elif v.get('colorTransfer')=='smpte2084':fmt+=' · PQ HDR'
    tracks=f"{len(entry['audio'])} 音轨 / {len(entry['subtitles'])} 字幕 / {len(entry['fonts'])} 字体"
    uses=[role_names.get(role,'杜比视界 P'+role.removeprefix('dolby-vision-profile-') if role.startswith('dolby-vision-profile-') else role) for role in entry['roles']]
    lines.append(f"| {Path(entry['path']).name} | {fmt} | {tracks} | {'、'.join(uses)} |")
lines+=['','## 目录与边界','']
for group in catalog:
    lines.append(f"- {group['label']}：发现 {group['videoCount']} 个视频，{group['playlistCount']} 个蓝光播放列表，{len(group['sidecars'])} 个外挂资料文件。")
    if not group['videoCount']:lines.append('  当前没有可识别的视频，不能作为播放样本；重新提供完整片源后再测试。')
    if group['discLayout']:lines.append('  蓝光原盘只探测最大 M2TS 代表片段；不把它当成完整主影片，未实现菜单导航或播放列表聚合。')
lines+=['','## 使用规则','','- 内置播放器：browser-ui（H.264／AAC MP4）。','- 原生控件／字幕安全区：native-ui、ass-subtitles、embedded-fonts。ASS 作者指定位置仍需保留。','- 音轨和字幕独立切换、菜单分页：audio-switching、pgs-subtitles、external-subtitles。','- 杜比视界兼容性：分别选 P5、P7、P8，不能相互替代。','- 高帧率／快进／短片结束：high-frame-rate；93 秒短片与完整电影分开测试。','- 测试只使用临时配置，关闭自动刮削与目录监视；不复制或修改媒体。','','## 验证限制','']
lines+=['- '+limit for limit in result['limits']]
output.with_suffix('.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(f'Private inventory saved: {output}',flush=True)
