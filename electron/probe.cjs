const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
function toolPath(name, override) {
  if (override && path.isAbsolute(override) && fs.existsSync(override)) return override;
  const root = process.resourcesPath && fs.existsSync(path.join(process.resourcesPath,'tools')) ? path.join(process.resourcesPath,'tools') : path.join(__dirname,'../tools');
  const candidates = name === 'mpv' ? [path.join(root,'mpv/mpv.exe')] :
    [path.join(root,'ffmpeg/bin/ffprobe.exe'), path.join(root,'ffmpeg/ffmpeg-master-latest-win64-lgpl/bin/ffprobe.exe')];
  return candidates.find(p=>fs.existsSync(p));
}
function probeMedia(filename, executable=toolPath('ffprobe'), signal) {
  if (!executable) return Promise.reject(new Error('未找到 ffprobe，无法探测媒体信息。'));
  return new Promise((resolve,reject)=>execFile(executable,['-v','error','-show_format','-show_streams','-of','json',filename],
    {windowsHide:true,timeout:30000,maxBuffer:4*1024*1024,encoding:'utf8',signal},(error,stdout)=>{
      if (error) return reject(new Error(error.killed ? '媒体探测超时。' : '无法读取媒体信息。'));
      try {
        const data=JSON.parse(stdout), video=data.streams?.find(s=>s.codec_type==='video' && !s.disposition?.attached_pic);
        const seconds=Number(data.format?.duration || video?.duration) || 0;
        const tracks=(data.streams||[]).filter(s=>['audio','subtitle'].includes(s.codec_type)).map(s=>({
          index:s.index,type:s.codec_type,codec:s.codec_name,language:s.tags?.language||'',title:s.tags?.title||'',channels:s.channels,
        }));
        resolve({duration:seconds/60,quality:video?.width>=3800?'4K':video?.height>=1000?'1080P':video?.height>=700?'720P':'本地',
          technical:{container:data.format?.format_name,videoCodec:video?.codec_name,width:video?.width,height:video?.height,
            colorTransfer:video?.color_transfer,hdr:['smpte2084','arib-std-b67'].includes(video?.color_transfer),
            durationSeconds:seconds,tracks,probedAt:Date.now()}});
      } catch { reject(new Error('媒体信息格式无效。')); }
    }));
}
module.exports={probeMedia,toolPath};
