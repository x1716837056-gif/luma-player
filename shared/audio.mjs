export const audioCodecs=[['ac3','Dolby Digital'],['eac3','Dolby Digital Plus / Atmos'],['dts','DTS Core'],['dts-hd','DTS-HD MA / DTS:X'],['truehd','Dolby TrueHD / Atmos']];
export function normalizeAudioOutput(value){
  const v=value&&typeof value==='object'?value:{};
  return {mode:['auto','pcm','hdmi'].includes(v.mode)?v.mode:'auto',device:typeof v.device==='string'&&/^wasapi\/[^\x00-\x1f]{1,500}$/.test(v.device)?v.device:'auto',
    channels:['system','stereo','5.1','7.1'].includes(v.channels)?v.channels:'system',codecs:audioCodecs.map(([id])=>id).filter(id=>!Array.isArray(v.codecs)||v.codecs.includes(id)),fallback:v.fallback!==false};
}
export function needsNativeAudio(value){const a=normalizeAudioOutput(value);return a.mode!=='auto'||a.device!=='auto'||a.channels!=='system';}
export function browserPlaybackCompatible(media){
  const tech=media.technical,audio=(tech?.tracks||[]).filter(t=>t.type==='audio');
  return Boolean(tech&&!tech.hdr&&/\.(mp4|webm)$/i.test(media.path||'')&&['h264','vp8','vp9','av1'].includes(tech.videoCodec)&&audio.length<=1&&audio.every(t=>['aac','mp3','opus','vorbis'].includes(t.codec)&&[1,2].includes(t.channels)));
}
export function codecLabel(codec=''){return ({ac3:'Dolby Digital',eac3:'Dolby Digital Plus',truehd:'Dolby TrueHD',dts:'DTS',aac:'AAC',flac:'FLAC',alac:'ALAC',mp3:'MP3',opus:'Opus',vorbis:'Vorbis'})[codec]||(/pcm/.test(codec)?'LPCM':codec.toUpperCase());}
