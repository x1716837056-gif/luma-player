import {useEffect,useState} from 'react';
import {AudioLines,RefreshCw} from 'lucide-react';
import {audioCodecs,normalizeAudioOutput} from '../shared/audio.mjs';
import type {Settings,AudioOutput,AudioDevice} from './types';
export function PlaybackAudioSettings({settings,onChange}:{settings:Settings;onChange:(next:Settings)=>void}){
  const audio=normalizeAudioOutput(settings.audioOutput),[devices,setDevices]=useState<AudioDevice[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const update=(patch:Partial<AudioOutput>)=>onChange({...settings,audioOutput:{...audio,...patch}});
  async function refresh(){if(!window.desktop)return;setBusy(true);setError('');try{setDevices(await window.desktop.audioDevices());}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  useEffect(()=>{let active=true;if(window.desktop){setBusy(true);window.desktop.audioDevices().then(rows=>{if(active)setDevices(rows);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});}return()=>{active=false;};},[]);
  return <section className="playback-audio-settings" aria-label="家庭影院音频输出"><h2><AudioLines size={16}/>音频与家庭影院</h2>
    <p className="field-help">选择 HDMI 直连功放可发送原始编码流；功放负责解码和音量。保存后重新打开影片生效。</p>
    <label className="field-label" htmlFor="audio-mode">输出模式</label><select id="audio-mode" value={audio.mode} onChange={e=>update({mode:e.target.value as AudioOutput['mode'],...(e.target.value!=='auto'&&audio.channels==='system'?{channels:'7.1' as const}:{})})}><option value="auto">兼容模式 · 系统音频</option><option value="pcm">高品质 PCM · WASAPI 独占</option><option value="hdmi">家庭影院 · HDMI 源码直通</option></select>
    <div className="audio-device-heading"><label className="field-label" htmlFor="audio-device">输出设备</label><button type="button" className="text-button" onClick={()=>void refresh()} disabled={busy||!window.desktop}><RefreshCw size={12} className={busy?'spinning':''}/>{busy?'读取中…':'刷新设备'}</button></div>
    <select id="audio-device" value={audio.device} onChange={e=>update({device:e.target.value})}><option value="auto">系统默认设备</option>{devices.filter(d=>d.name!=='auto').map(d=><option key={d.name} value={d.name}>{d.description}</option>)}{audio.device!=='auto'&&!devices.some(d=>d.name===audio.device)&&<option value={audio.device}>已保存设备 · 当前未连接</option>}</select>
    <p className="field-help">请选择显卡 HDMI 对应的功放输出。设备名称不代表它支持所有编码；拔掉所选设备时会暂停并提示。</p>
    <label className="field-label" htmlFor="audio-channels">PCM 声道上限</label><select id="audio-channels" value={audio.channels} onChange={e=>update({channels:e.target.value as AudioOutput['channels']})}><option value="system">跟随系统扬声器配置</option><option value="stereo">立体声</option><option value="5.1">最高 5.1 · 保留立体声</option><option value="7.1">最高 7.1 · 保留 5.1 / 立体声</option></select>
    {audio.mode==='hdmi'&&<><p className="field-label">功放支持的直通格式</p><div className="audio-codecs">{audioCodecs.map(([id,label])=><label className="settings-check" key={id}><input type="checkbox" checked={audio.codecs.includes(id)} onChange={e=>update({codecs:e.target.checked?[...audio.codecs,id]:audio.codecs.filter(c=>c!==id)})}/>{label}</label>)}</div><p className="field-help">Atmos / DTS:X 需片源携带对应信息、功放支持并成功建立直通。AAC / FLAC / LPCM 等仍解码为 PCM；PCM 声道上限不会改变已直通的编码流。</p></>}
    {audio.mode!=='auto'&&<><label className="settings-check"><input type="checkbox" checked={audio.fallback} onChange={e=>update({fallback:e.target.checked})}/>输出失败时允许兼容 PCM 回退</label><p className="field-help">回退会明确显示。关闭后，所选编码未能直通或设备打不开时暂停；不会擅自切到其他扬声器。直通时固定正常速度，音量由功放调节。</p></>}
    {error&&<p className="form-error">{error}</p>}{!window.desktop&&<p className="field-help">网页预览仅保存设置，设备与直通需要 Windows 桌面版。</p>}
  </section>;
}
