import { Pause, Play, X } from 'lucide-react';
import type { PlayerState } from './types';
const clock=(s=0)=>`${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
export function MpvPanel({state,onError}:{state:PlayerState;onError:(message:string)=>void}) {
  function control(action:'pause'|'seek'|'aid'|'sid'|'stop',value?:number|boolean|'no') {
    void window.desktop?.playerControl(action,value).catch(error=>onError(error.message));
  }
  if(!state.active)return null;
  const audio=(state.tracks||[]).filter(t=>t.type==='audio'),subtitles=(state.tracks||[]).filter(t=>t.type==='sub');
  return <section className="mpv-panel" aria-label="mpv 播放控制">
    <div><strong>{state.title}</strong><small>{state.paused?'已暂停':'影院正在播放'} · 进度自动保存</small></div>
    <button aria-label={state.paused?'继续 mpv 播放':'暂停 mpv 播放'} onClick={()=>control('pause',!state.paused)}>{state.paused?<Play size={18}/>:<Pause size={18}/>}</button>
    <span>{clock(state.position)}</span><input aria-label="mpv 播放进度" type="range" min="0" max={state.duration||1} value={Math.min(state.position||0,state.duration||1)} onChange={e=>control('seek',+e.target.value)}/><span>{clock(state.duration)}</span>
    <select aria-label="mpv 音轨" value={audio.find(t=>t.selected)?.id??'no'} onChange={e=>control('aid',e.target.value==='no'?'no':+e.target.value)}><option value="no">关闭音轨</option>{audio.map(t=><option key={t.id} value={t.id}>{t.title||t.lang||`音轨 ${t.id}`}</option>)}</select>
    <select aria-label="mpv 字幕" value={subtitles.find(t=>t.selected)?.id??'no'} onChange={e=>control('sid',e.target.value==='no'?'no':+e.target.value)}><option value="no">关闭字幕</option>{subtitles.map(t=><option key={t.id} value={t.id}>{t.title||t.lang||`字幕 ${t.id}`}</option>)}</select>
    <button aria-label="停止 mpv 播放" onClick={()=>control('stop')}><X size={18}/></button>
  </section>;
}
