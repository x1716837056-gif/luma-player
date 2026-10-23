import { Pause, Play, X } from 'lucide-react';
import type { PlayerState } from './types';
import {TrackMenu} from './MediaActions';
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
    <TrackMenu kind="audio" tracks={audio} value={audio.find(t=>t.selected)?.id??'no'} onSelect={value=>control('aid',value)}/>
    <TrackMenu kind="subtitle" tracks={subtitles} value={subtitles.find(t=>t.selected)?.id??'no'} onSelect={value=>control('sid',value)}/>
    <button aria-label="停止 mpv 播放" onClick={()=>control('stop')}><X size={18}/></button>
  </section>;
}
