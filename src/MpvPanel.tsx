import { Pause, Play, X,SkipForward } from 'lucide-react';
import type { PlayerState } from './types';
import {TrackMenu} from './MediaActions';
import {AudioStatus} from './AudioStatus';
const clock=(s=0)=>`${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
export function MpvPanel({state,onError,hasNext=false}:{state:PlayerState;onError:(message:string)=>void;hasNext?:boolean}) {
  function control(action:'pause'|'seek'|'aid'|'sid'|'stop'|'next'|'audio-pcm'|'audio-default',value?:number|boolean|'no') {
    void window.desktop?.playerControl(action,value).catch(error=>onError(error.message));
  }
  if(!state.active)return null;
  const audio=(state.tracks||[]).filter(t=>t.type==='audio'),subtitles=(state.tracks||[]).filter(t=>t.type==='sub');
  const progress=Math.min(100,Math.max(0,(state.position||0)/(state.duration||1)*100));
  return <section className="mpv-panel" aria-label="mpv 播放控制">
    <div className="mpv-panel-row"><div className="mpv-panel-title"><strong>{state.title}</strong>{state.audio?<AudioStatus key={state.mediaId} audio={state.audio} onRecover={useDefault=>control(useDefault?'audio-default':'audio-pcm')}/>:<small>{state.paused?'已暂停':'影院正在播放'} · 进度自动保存</small>}</div>
      <button className="mpv-panel-toggle" aria-label={state.paused?'继续 mpv 播放':'暂停 mpv 播放'} onClick={()=>control('pause',!state.paused)}>{state.paused?<Play size={22}/>:<Pause size={22}/>}</button>
      <div className="mpv-panel-options"><TrackMenu kind="audio" tracks={audio} value={audio.find(t=>t.selected)?.id??'no'} onSelect={value=>control('aid',value)}/>
        {hasNext&&<button aria-label="播放下一集" onClick={()=>control('next')}><SkipForward size={18}/></button>}
        <TrackMenu kind="subtitle" tracks={subtitles} value={subtitles.find(t=>t.selected)?.id??'no'} onSelect={value=>control('sid',value)}/>
        <button aria-label="停止 mpv 播放" onClick={()=>control('stop')}><X size={19}/></button></div>
    </div>
    <input className="cinema-range" aria-label="mpv 播放进度" type="range" min="0" max={state.duration||1} value={Math.min(state.position||0,state.duration||1)} style={{'--range-fill':`${progress}%`} as import('react').CSSProperties} onChange={e=>control('seek',+e.target.value)}/>
    <div className="mpv-panel-time"><span>{clock(state.position)}</span><span>−{clock(Math.max(0,(state.duration||0)-(state.position||0)))}</span></div>
  </section>;
}
