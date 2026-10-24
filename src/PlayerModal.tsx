import {useEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {ArrowLeft, AudioLines, Check, Film, LoaderCircle, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Subtitles, Volume2, VolumeX, X, Minus,SkipForward} from 'lucide-react';
import type {Media} from './types';
import {MediaContextMenu,MediaInfoDialog,type MediaInfoView} from './MediaActions';
import {languageName} from './track-label';
import {usePopoverDismiss} from './usePopoverDismiss';
import {useSubtitleSafeArea} from './useSubtitleSafeArea';
type BrowserAudioTrack={id:string;label:string;language:string;enabled:boolean};
type BrowserAudioList=ArrayLike<BrowserAudioTrack>&EventTarget;
const audioList=(video:HTMLVideoElement|null)=>(video as (HTMLVideoElement&{audioTracks?:BrowserAudioList})|null)?.audioTracks;

export const playbackTime = (value = 0) => {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${seconds >= 3600 ? `${Math.floor(seconds / 3600)}:` : ''}${String(Math.floor(seconds / 60) % 60).padStart(seconds >= 3600 ? 2 : 1, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
export const rangeStyle = (value: number, max: number): CSSProperties => ({'--range-fill': `${max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0}%`} as CSSProperties);
function Control({label, children, onClick, className = '', expanded, backAction=false}: {label: string; children: ReactNode; onClick: () => void; className?: string; expanded?: boolean; backAction?: boolean}) {
  return <button type="button" className={`cinema-button ${className}`} data-back-control={backAction||undefined} aria-label={label} title={label} aria-expanded={expanded} onClick={onClick}>{children}</button>;
}

export function PlayerModal({media, demo, onClose, onProgress,onEnded,onNext}: {media: Media; demo: boolean; onClose: () => void; onProgress: (progress: number, minutes: number) => void;onEnded?:()=>void;onNext?:()=>void}) {
  const video = useRef<HTMLVideoElement>(null), container = useRef<HTMLDivElement>(null), picker = useRef<HTMLInputElement>(null);
  const [paused, setPaused] = useState(false), [elapsed, setElapsed] = useState(0), [length, setLength] = useState(0);
  const [volume, setVolume] = useState(.8), [speed, setSpeed] = useState(1), [fullscreen, setFullscreen] = useState(false);
  const [menu, setMenu] = useState<'speed' | 'audio' | 'subtitles' | null>(null), [visible, setVisible] = useState(true);
  const [audioTracks,setAudioTracks]=useState<BrowserAudioTrack[]>([]);
  const [contextMenu,setContextMenu]=useState<{x:number;y:number}|null>(null),[info,setInfo]=useState<MediaInfoView|null>(null);
  const [subtitle, setSubtitle] = useState(''), [subtitleName, setSubtitleName] = useState(''), [subtitleEnabled, setSubtitleEnabled] = useState(true);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [switching, setSwitching] = useState(false);
  const [preview, setPreview] = useState<{percent: number; seconds: number} | null>(null);
  const lastSave = useRef(0), lastVolume = useRef(.8), lastActivity = useRef(Date.now()), hovering = useRef(false), fallback = useRef(false), disposed = useRef(false);
  const playbackRecord=useRef({progress:media.progress||0,minutes:media.duration,seen:false});
  const src = demo ? window.__LUMA_ASSETS?.['./demo.mp4'] || './demo.mp4' : media.videoUrl || (media.path ? `luma-media://local/${encodeURIComponent(media.path)}` : '');
  const controlsShown=Boolean(visible||paused||error||loading||menu||contextMenu||info);
  useSubtitleSafeArea(video,controlsShown,subtitle);
  const reveal = () => { lastActivity.current = Date.now(); setVisible(true); };
  usePopoverDismiss(menu,container,()=>setMenu(null),'.cinema-menu-anchor:has([role="menu"])');
  function back() {
    const event=new Event('luma:back',{cancelable:true});document.dispatchEvent(event);if(event.defaultPrevented)return;
    if(info){setInfo(null);return;}
    if(contextMenu){setContextMenu(null);return;}
    if(menu){setMenu(null);return;}
    if(document.fullscreenElement){void document.exitFullscreen();return;}
    onClose();
  }
  async function unsupported() {
    if (fallback.current || disposed.current) return;
    setLoading(false);
    if (!demo && window.desktop) {
      fallback.current = true; setSwitching(true); video.current?.pause();
      try { await window.desktop.playMpv(media); onClose(); }
      catch { setSwitching(false); setError('无法打开影片，请检查文件连接和播放设置中的播放器路径。'); }
    } else setError('当前浏览器无法解码此影片，请使用桌面版播放。');
  }
  useEffect(() => {
    disposed.current = false; container.current?.focus();
    const record={progress:media.progress||0,minutes:media.duration,seen:false};playbackRecord.current=record;
    setElapsed(0);setLength(0);setPaused(false);setLoading(true);setError('');setSwitching(false);setMenu(null);setContextMenu(null);setInfo(null);setSubtitle('');setSubtitleName('');setAudioTracks([]);fallback.current=false;lastSave.current=0;reveal();
    const player = video.current;
    if (player) { player.src = src;player.playbackRate=speed;void player.play().catch(() => {}); }
    return () => {
      disposed.current = true;
      if (!demo && record.seen && record.minutes>0) onProgress(record.progress,record.minutes);
      if (player) { player.pause(); player.removeAttribute('src'); player.load(); }
    };
  }, [media.id]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!paused && !loading && !error && !menu && !contextMenu && !info && !hovering.current && !container.current?.querySelector('.cinema-dock :focus-visible, .cinema-heading :focus-visible') && Date.now() - lastActivity.current > 2800) setVisible(false);
    }, 200);
    return () => clearInterval(timer);
  }, [paused, loading, error, menu, contextMenu, info]);
  useEffect(() => { if (paused || menu || contextMenu || info) reveal(); }, [paused, menu, contextMenu, info]);
  useEffect(() => { const change = () => setFullscreen(Boolean(document.fullscreenElement)); document.addEventListener('fullscreenchange', change); return () => document.removeEventListener('fullscreenchange', change); }, []);
  useEffect(() => () => { if (subtitle) URL.revokeObjectURL(subtitle); }, [subtitle]);
  useEffect(() => {
    if (!loading || paused) return;
    const timer = setTimeout(() => { if ((video.current?.readyState || 0) < 2) void unsupported(); }, 15000);
    return () => clearTimeout(timer);
  }, [loading, paused]);
  function readAudioTracks() {const list=audioList(video.current);setAudioTracks(list?Array.from(list).map(t=>({id:t.id,label:t.label,language:t.language,enabled:t.enabled})):[]);}
  async function moreAudioOptions() {
    const player=video.current;if(!window.desktop||!player)return;
    try {if(length>0)await window.desktop.updateMedia(media.id,{progress:elapsed/length});await window.desktop.playMpv(media);onClose();}
    catch {setError('无法切换播放器，请检查片源连接。');}
  }
  function toggle() {
    const player = video.current; if (!player) return;
    reveal();
    if (player.paused) void player.play().catch(() => unsupported()); else player.pause();
  }
  function seek(seconds: number) {
    if (!video.current || !length) return;
    const next = Math.max(0, Math.min(length, seconds)); video.current.currentTime = next; setElapsed(next); reveal();
  }
  function changeVolume(value: number) {
    const next = Math.max(0, Math.min(1, value)); setVolume(next); if (next) lastVolume.current = next;
    if (video.current) { video.current.volume = next; video.current.muted = false; } reveal();
  }
  function toggleFullscreen() {
    void (document.fullscreenElement ? document.exitFullscreen() : container.current?.requestFullscreen())?.catch(() => {}); reveal();
  }
  return <div className={`player-overlay cinema-player ${controlsShown ? 'show-controls' : ''}`} role="dialog" aria-modal="true" aria-label={`播放 ${media.title}`} ref={container} tabIndex={0}
    onContextMenu={e=>{e.preventDefault();e.stopPropagation();setMenu(null);setContextMenu({x:e.clientX,y:e.clientY});reveal();}}
    onAuxClick={e=>{if(e.button===3){e.preventDefault();e.stopPropagation();back();}}} onPointerMove={reveal} onPointerDown={e => { if (e.target === video.current) setMenu(null); }} onKeyDown={e => {
      reveal();
      if (e.key === 'Escape' || (e.altKey && e.key==='ArrowLeft')) { e.preventDefault();e.stopPropagation();back();return; }
      if ((e.target as HTMLElement).closest('input,button')) return;
      if (e.key === ' ') { e.preventDefault(); toggle(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); seek(elapsed + (e.key === 'ArrowRight' ? 10 : -10)); }
      if (e.key.toLowerCase() === 'f') toggleFullscreen();
      if (e.key.toLowerCase() === 'm') changeVolume(volume ? 0 : lastVolume.current);
    }}>
    <video ref={video} src={src} autoPlay playsInline onClick={toggle} onDoubleClick={toggleFullscreen}
      onPlay={() => { setPaused(false); reveal(); }} onPlaying={() => setLoading(false)} onWaiting={() => setLoading(true)} onPause={() => setPaused(true)} onError={() => void unsupported()}
      onLoadedMetadata={() => { readAudioTracks(); const p = video.current!; setLength(Number.isFinite(p.duration) ? p.duration : 0); p.volume = volume; if (!demo && media.progress && media.progress < .96) p.currentTime = p.duration * media.progress; }}
      onTimeUpdate={() => { const p = video.current!; setElapsed(p.currentTime);if(p.duration>0)Object.assign(playbackRecord.current,{progress:p.currentTime/p.duration,minutes:p.duration/60,seen:true}); if (!demo && p.duration > 0 && Date.now() - lastSave.current > 5000) { lastSave.current = Date.now(); onProgress(p.currentTime / p.duration, p.duration / 60); } }}
      onEnded={() => { setPaused(true); setLoading(false); reveal();Object.assign(playbackRecord.current,{progress:1,minutes:length/60,seen:true}); if (!demo) onProgress(1, length / 60);onEnded?.(); }}>
      {subtitle && <track key={subtitle} kind="subtitles" src={subtitle} srcLang="und" label={subtitleName} default onLoad={() => { if (video.current?.textTracks[0]) video.current.textTracks[0].mode = subtitleEnabled ? 'showing' : 'disabled'; }} />}
    </video>
    <div className="cinema-shade" />
    <header className="cinema-heading">
      <Control label="返回上一层" backAction onClick={back} className="cinema-back"><ArrowLeft size={21} /></Control>
      <div className="cinema-title"><span>{paused ? '已暂停' : '正在播放'}</span><strong>{media.title}</strong><small>{demo ? 'Big Buck Bunny · 演示片段' : [media.year, media.episode, media.quality].filter(Boolean).join(' · ')}</small></div>
      <div className="cinema-window-actions">{window.desktop&&<Control label="最小化播放器" onClick={()=>window.desktop?.windowAction('minimize')}><Minus size={18}/></Control>}<Control label="关闭播放器" onClick={onClose}><X size={18}/></Control></div>
    </header>
    {(loading || switching) && !error && <div className="cinema-loading" role="status"><LoaderCircle className="spinning" size={25} /><span>{switching ? '正在切换兼容播放器' : '正在准备影片'}</span></div>}
    {error && <div className="cinema-error"><Film size={35} strokeWidth={1.3} /><h2>暂时无法播放</h2><p>{error}</p><button onClick={onClose}>返回影音库</button></div>}
    {!error && !switching && <div className="cinema-dock" onMouseEnter={() => { hovering.current = true; reveal(); }} onMouseLeave={() => { hovering.current = false; reveal(); }} onFocusCapture={reveal}>
      <div className="cinema-timeline" onPointerLeave={() => setPreview(null)} onPointerMove={e => { const bounds = e.currentTarget.getBoundingClientRect(); const percent = Math.max(0, Math.min(100, (e.clientX - bounds.left) / bounds.width * 100)); setPreview({percent, seconds: length * percent / 100}); }}>
        {preview && <span className="cinema-seek-preview" style={{left: `${preview.percent}%`}}>{playbackTime(preview.seconds)}</span>}
        <input className="cinema-range" aria-label="播放进度" type="range" min="0" max={length || 1} step=".1" value={Math.min(elapsed, length || 1)} style={rangeStyle(elapsed, length)} onChange={e => seek(+e.target.value)} />
      </div>
      <div className="cinema-timestamps"><span>{playbackTime(elapsed)}</span><span>{onNext?<button className="cinema-next-episode" onClick={onNext} aria-label="播放下一集"><SkipForward size={12}/>下一集</button>:paused ? '已暂停' : media.episode || ''}</span><span>−{playbackTime(length - elapsed)}</span></div>
      <div className="cinema-dock-row">
        <div className="cinema-volume"><Control label={volume ? '静音' : '取消静音'} onClick={() => changeVolume(volume ? 0 : lastVolume.current)}>{volume ? <Volume2 size={19} /> : <VolumeX size={19} />}</Control><input className="cinema-range" aria-label="音量" type="range" min="0" max="1" step=".01" value={volume} style={rangeStyle(volume, 1)} onChange={e => changeVolume(+e.target.value)} /></div>
        <div className="cinema-transport"><Control label="后退 10 秒" onClick={() => seek(elapsed - 10)} className="cinema-skip"><RotateCcw size={26} /><span>10</span></Control><Control label={paused ? '播放' : '暂停'} onClick={toggle} className="cinema-toggle">{paused ? <Play size={27} fill="currentColor" /> : <Pause size={27} fill="currentColor" />}</Control><Control label="前进 10 秒" onClick={() => seek(elapsed + 10)} className="cinema-skip"><RotateCw size={26} /><span>10</span></Control></div>
        <div className="cinema-options">
          <div className="cinema-menu-anchor"><Control label="播放速度" expanded={menu === 'speed'} onClick={() => setMenu(menu === 'speed' ? null : 'speed')} className={menu === 'speed' ? 'is-active' : ''}><span className="cinema-speed">{speed}×</span></Control>{menu === 'speed' && <div className="cinema-menu" role="menu" aria-label="播放速度"><h3>播放速度</h3>{[.5, .75, 1, 1.25, 1.5, 2].map(rate => <button role="menuitemradio" aria-checked={speed === rate} key={rate} onClick={() => { setSpeed(rate); if (video.current) video.current.playbackRate = rate; setMenu(null); }}><span>{rate === 1 ? '正常速度' : `${rate}×`}</span>{rate === speed && <Check size={15} />}</button>)}</div>}</div>
          <div className="cinema-menu-anchor"><Control label="音轨语言" expanded={menu==='audio'} onClick={()=>{readAudioTracks();setMenu(menu==='audio'?null:'audio');}} className={`cinema-track-button ${menu==='audio'?'is-active':''}`}><AudioLines size={19}/><small>语言</small></Control>{menu==='audio'&&<div className="cinema-menu cinema-audio" role="menu" aria-label="音轨语言"><h3>音轨语言</h3>{audioTracks.length?audioTracks.map((t,index)=><button key={t.id||index} role="menuitemradio" aria-checked={t.enabled} onClick={()=>{const list=audioList(video.current);if(list)Array.from(list).forEach((track,i)=>{track.enabled=i===index;});readAudioTracks();setMenu(null);}}><span>{[languageName(t.language),t.label].filter(Boolean).join(' · ')||`音轨 ${index+1}`}</span>{t.enabled&&<Check size={15}/>}</button>):<button role="menuitemradio" aria-checked="true" onClick={()=>setMenu(null)}><span>原始音轨</span><Check size={15}/></button>}{!demo&&window.desktop&&<button role="menuitem" onClick={()=>void moreAudioOptions()}><span>更多音轨选项</span></button>}</div>}</div>
          <div className="cinema-menu-anchor"><Control label="字幕选项" expanded={menu === 'subtitles'} onClick={() => setMenu(menu === 'subtitles' ? null : 'subtitles')} className={`cinema-track-button ${menu === 'subtitles' ? 'is-active' : ''}`}><Subtitles size={19} /><small>字幕</small></Control>{menu === 'subtitles' && <div className="cinema-menu cinema-subtitles" role="menu" aria-label="字幕选项"><h3>字幕</h3><button role="menuitemradio" aria-checked={!subtitleName||!subtitleEnabled} onClick={()=>{setSubtitleEnabled(false);if(video.current?.textTracks[0])video.current.textTracks[0].mode='disabled';setMenu(null);}}><span>关闭字幕</span>{(!subtitleName||!subtitleEnabled)&&<Check size={15}/>}</button>{subtitleName && <button role="menuitemradio" aria-checked={subtitleEnabled} onClick={() => { setSubtitleEnabled(true); if (video.current?.textTracks[0]) video.current.textTracks[0].mode = 'showing'; setMenu(null); }}><span>{subtitleName}</span>{subtitleEnabled && <Check size={15} />}</button>}<button role="menuitem" aria-label="加载 VTT 字幕" onClick={() => { picker.current?.click(); setMenu(null); }}><span>加载外挂字幕</span><small>VTT</small></button></div>}</div>
          <Control label={fullscreen ? '退出全屏' : '全屏'} onClick={toggleFullscreen}>{fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}</Control>
        </div>
      </div>
    </div>}
    {contextMenu&&<MediaContextMenu title={media.title} x={contextMenu.x} y={contextMenu.y} cinematic onClose={()=>setContextMenu(null)} onChoose={view=>{setInfo(view);setContextMenu(null);}}/>}
    {info&&<MediaInfoDialog media={media} view={info} cinematic onClose={()=>setInfo(null)}/>}
    <input className="hidden" ref={picker} type="file" accept=".vtt" aria-label="选择 VTT 字幕" onChange={e => { const file = e.target.files?.[0]; if (file) { setSubtitle(URL.createObjectURL(file)); setSubtitleName(file.name); setSubtitleEnabled(true); } }} />
  </div>;
}
