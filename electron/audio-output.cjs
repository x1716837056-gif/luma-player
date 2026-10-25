const {execFile}=require('node:child_process');
const {normalizeAudioOutput,codecLabel}=require('../shared/audio.mjs');
const layouts={system:'auto-safe',stereo:'stereo','5.1':'5.1,5.1(side),stereo','7.1':'7.1,5.1,5.1(side),stereo'};
function audioArguments(value,{testNull=false}={}){
  const a=normalizeAudioOutput(value),args=[`--audio-spdif=${a.mode==='hdmi'?a.codecs.join(','):''}`,`--audio-channels=${layouts[a.channels]}`,'--audio-fallback-to-null=no','--gapless-audio=no','--replaygain=no','--ad-lavc-downmix=no','--video-sync=audio'];
  args.push(`--audio-exclusive=${!testNull&&a.mode!=='auto'?'yes':'no'}`);
  if(testNull)args.push('--ao=null');else if(a.device==='auto')args.push('--ao=wasapi');else args.push(`--audio-device=${a.device}`);
  if(a.mode==='hdmi')args.push('--speed=1','--volume=100','--volume-max=100');
  return args;
}
function passthroughExpected(settings,track){const a=normalizeAudioOutput(settings);return a.mode==='hdmi'&&Boolean(track)&&(a.codecs.includes(track.codec)||track.codec==='dts'&&a.codecs.includes('dts-hd'));}
function audioSnapshot(settings,raw,{testNull=false,fallback=false,disabled=false,technical}={}){
  const a=normalizeAudioOutput(settings),tracks=(raw.tracks||[]).filter(t=>t.type==='audio'),track=tracks.find(t=>t.selected),deviceMissing=a.device!=='auto'&&Array.isArray(raw.devices)&&!raw.devices.some(d=>d.name===a.device),output=deviceMissing?undefined:raw.output;
  const encoded=Boolean(output&&/^spdif[-_]/.test(output.format||'')),available=Boolean(output&&raw.driver&&raw.driver!=='null'),passthrough=encoded&&available&&raw.driver==='wasapi';
  const source=technical?.tracks?.find(t=>t.type==='audio'&&Number.isInteger(track?.['ff-index'])&&t.index===track['ff-index']),sourceRate=track?.['demux-samplerate']||source?.sampleRate,profile=source?.codecProfile||track?.['codec-profile'],sourceLabel=profile&&profile!=='unknown'?(profile.includes('DTS')||profile.includes('Dolby')?profile:codecLabel(track?.codec)+' · '+profile):codecLabel(track?.codec);
  let status=disabled?'disabled':!tracks.length?'no-track':!output||!raw.driver?'unavailable':testNull||raw.driver==='null'?'test':passthrough?'passthrough':'pcm';
  const expected=passthroughExpected(a,track),downmixed=!encoded&&Boolean(track?.['demux-channel-count']>output?.['channel-count']);
  let message=status==='passthrough'?'编码音频已交给 WASAPI，音量请在功放调节。':status==='test'?'测试空输出，不代表功放收到音频。':status==='disabled'?'音轨已关闭。':status==='no-track'?'此文件没有音轨。':status==='unavailable'?'未建立音频输出，请检查设备连接或尝试兼容 PCM。':expected?'当前为 PCM，未建立所选格式的源码直通。':'由播放器解码为 PCM 输出。';
  if(fallback)message='本次播放已回退兼容 PCM；没有建立源码直通。';
  if(deviceMissing)message='所选音频设备未连接，请检查功放和 HDMI 连接。';
  if(downmixed)message+=' 当前输出声道少于片源，请检查声道配置。';
  const resampled=!encoded&&Boolean(sourceRate&&output?.samplerate&&sourceRate!==output.samplerate),coreOnly=Boolean(profile?.includes('DTS-HD')&&output?.format==='spdif-dts');
  if(resampled)message+=' 当前输出采样率与片源不同。';
  if(coreOnly)message+=' 当前仅发送 DTS Core，DTS-HD 扩展未直通。';
  const device=(raw.devices||[]).find(d=>d.name===a.device);
  return {status,passthrough,encoded,expected,fallback,downmixed,resampled,coreOnly,sourceCodec:track?.codec||'',sourceLabel,sourceChannels:track?.['demux-channel-count']||source?.channels,sourceRate,sourceBitDepth:source?.bitDepth,outputFormat:output?.format,outputChannels:output?.['channel-count'],outputLayout:output?.['hr-channels']||output?.channels,outputRate:output?.samplerate,driver:raw.driver||'',device:a.device,deviceLabel:device?.description||(a.device==='auto'?'系统默认设备':a.device),message};
}
function deviceList(list){return (Array.isArray(list)?list:[]).filter(d=>d&&typeof d.name==='string'&&(d.name==='auto'||/^wasapi\//.test(d.name))).slice(0,128).map(d=>({name:d.name,description:String(d.description||d.name).slice(0,500)}));}
const requests=new Map();
function readAudioDevices(executable){
  if(requests.has(executable))return requests.get(executable);
  const work=new Promise((resolve,reject)=>execFile(executable,['--no-config','--audio-device=help'],{windowsHide:true,timeout:7000,maxBuffer:1024*1024,encoding:'utf8'},(error,stdout,stderr)=>{
    if(error)return reject(Error('无法读取音频设备，请检查播放器路径后重试。'));
    const rows=String(stdout+'\n'+stderr).split(/\r?\n/).map(line=>line.match(/^\s*'([^']+)'\s+\((.*)\)\s*$/)).filter(Boolean).map(m=>({name:m[1],description:m[2]}));
    resolve(deviceList(rows));
  })).finally(()=>requests.delete(executable));requests.set(executable,work);return work;
}
module.exports={audioArguments,audioSnapshot,passthroughExpected,readAudioDevices,deviceList};
