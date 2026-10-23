import {useEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {ArrowLeft, Check, ChevronDown, Film, LoaderCircle, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Subtitles, Volume2, VolumeX} from 'lucide-react';
import type {Media} from './types';

export const playbackTime = (value = 0) => {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${seconds >= 3600 ? `${Math.floor(seconds / 3600)}:` : ''}${String(Math.floor(seconds / 60) % 60).padStart(seconds >= 3600 ? 2 : 1, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
export const rangeStyle = (value: number, max: number): CSSProperties => ({'--range-fill': `${max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0}%`} as CSSProperties);
function Control({label, children, onClick, className = '', expanded}: {label: string; children: ReactNode; onClick: () => void; className?: string; expanded?: boolean}) {
  return <button type="button" className={`cinema-button ${className}`} aria-label={label} title={label} aria-expanded={expanded} onClick={onClick}>{children}</button>;
}

export function PlayerModal({media, demo, onClose, onProgress}: {media: Media; demo: boolean; onClose: () => void; onProgress: (progress: number, minutes: number) => void}) {
  const video = useRef<HTMLVideoElement>(null), container = useRef<HTMLDivElement>(null), picker = useRef<HTMLInputElement>(null);
  const [paused, setPaused] = useState(false), [elapsed, setElapsed] = useState(0), [length, setLength] = useState(0);
  const [volume, setVolume] = useState(.8), [speed, setSpeed] = useState(1), [fullscreen, setFullscreen] = useState(false);
  const [menu, setMenu] = useState<'speed' | 'subtitles' | null>(null), [visible, setVisible] = useState(true);
  const [subtitle, setSubtitle] = useState(''), [subtitleName, setSubtitleName] = useState(''), [subtitleEnabled, setSubtitleEnabled] = useState(true);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [switching, setSwitching] = useState(false);
  const [preview, setPreview] = useState<{percent: number; seconds: number} | null>(null);
  const lastSave = useRef(0), lastVolume = useRef(.8), lastActivity = useRef(Date.now()), hovering = useRef(false), fallback = useRef(false), disposed = useRef(false);
  const src = demo ? window.__LUMA_ASSETS?.['./demo.mp4'] || './demo.mp4' : media.videoUrl || (media.path ? `luma-media://local/${encodeURIComponent(media.path)}` : '');
  const reveal = () => { lastActivity.current = Date.now(); setVisible(true); };
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
    const player = video.current;
    if (player && !player.getAttribute('src')) { player.src = src; void player.play().catch(() => {}); }
    return () => {
      disposed.current = true;
      if (!demo && player && Number.isFinite(player.duration) && player.duration > 0) onProgress(player.currentTime / player.duration, player.duration / 60);
      if (player) { player.pause(); player.removeAttribute('src'); player.load(); }
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!paused && !loading && !error && !menu && !hovering.current && !container.current?.querySelector('.cinema-dock :focus-visible') && Date.now() - lastActivity.current > 2800) setVisible(false);
    }, 200);
    return () => clearInterval(timer);
  }, [paused, loading, error, menu]);
  useEffect(() => { if (paused || menu) reveal(); }, [paused, menu]);
  useEffect(() => { const change = () => setFullscreen(Boolean(document.fullscreenElement)); document.addEventListener('fullscreenchange', change); return () => document.removeEventListener('fullscreenchange', change); }, []);
  useEffect(() => () => { if (subtitle) URL.revokeObjectURL(subtitle); }, [subtitle]);
  useEffect(() => {
    if (!loading || paused) return;
    const timer = setTimeout(() => { if ((video.current?.readyState || 0) < 2) void unsupported(); }, 15000);
    return () => clearTimeout(timer);
  }, [loading, paused]);
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
  return <div className={`player-overlay cinema-player ${visible || paused || error || loading ? 'show-controls' : ''}`} role="dialog" aria-modal="true" aria-label={`播放 ${media.title}`} ref={container} tabIndex={0}
    onPointerMove={reveal} onPointerDown={e => { if (e.target === video.current) setMenu(null); }} onKeyDown={e => {
      reveal();
      if (e.key === 'Escape') { if (menu) setMenu(null); else if (!document.fullscreenElement) onClose(); return; }
      if ((e.target as HTMLElement).closest('input,button')) return;
      if (e.key === ' ') { e.preventDefault(); toggle(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); seek(elapsed + (e.key === 'ArrowRight' ? 10 : -10)); }
      if (e.key.toLowerCase() === 'f') toggleFullscreen();
      if (e.key.toLowerCase() === 'm') changeVolume(volume ? 0 : lastVolume.current);
    }}>
    <video ref={video} src={src} autoPlay playsInline onClick={toggle} onDoubleClick={toggleFullscreen}
      onPlay={() => { setPaused(false); reveal(); }} onPlaying={() => setLoading(false)} onWaiting={() => setLoading(true)} onPause={() => setPaused(true)} onError={() => void unsupported()}
      onLoadedMetadata={() => { const p = video.current!; setLength(Number.isFinite(p.duration) ? p.duration : 0); p.volume = volume; if (!demo && media.progress && media.progress < .96) p.currentTime = p.duration * media.progress; }}
      onTimeUpdate={() => { const p = video.current!; setElapsed(p.currentTime); if (!demo && p.duration > 0 && Date.now() - lastSave.current > 5000) { lastSave.current = Date.now(); onProgress(p.currentTime / p.duration, p.duration / 60); } }}
      onEnded={() => { setPaused(true); setLoading(false); reveal(); if (!demo) onProgress(1, length / 60); }}>
      {subtitle && <track key={subtitle} kind="subtitles" src={subtitle} srcLang="zh" label={subtitleName} default onLoad={() => { if (video.current?.textTracks[0]) video.current.textTracks[0].mode = subtitleEnabled ? 'showing' : 'disabled'; }} />}
    </video>
    <div className="cinema-shade" />
    <header className="cinema-heading">
      <Control label="关闭播放器" onClick={onClose} className="cinema-back"><ArrowLeft size={21} /></Control>
      <div className="cinema-title"><span>{paused ? '已暂停' : '正在播放'}</span><strong>{media.title}</strong><small>{demo ? 'Big Buck Bunny · 演示片段' : [media.year, media.episode, media.quality].filter(Boolean).join(' · ')}</small></div>
      <span className="cinema-wordmark">Luma<span>影院</span></span>
    </header>
    {(loading || switching) && !error && <div className="cinema-loading" role="status"><LoaderCircle className="spinning" size={25} /><span>{switching ? '正在切换兼容播放器' : '正在准备影片'}</span></div>}
    {error && <div className="cinema-error"><Film size={35} strokeWidth={1.3} /><h2>暂时无法播放</h2><p>{error}</p><button onClick={onClose}>返回影音库</button></div>}
    {!error && !switching && <div className="cinema-dock" onMouseEnter={() => { hovering.current = true; reveal(); }} onMouseLeave={() => { hovering.current = false; reveal(); }} onFocusCapture={reveal}>
      <div className="cinema-dock-row">
        <div className="cinema-volume"><Control label={volume ? '静音' : '取消静音'} onClick={() => changeVolume(volume ? 0 : lastVolume.current)}>{volume ? <Volume2 size={19} /> : <VolumeX size={19} />}</Control><input className="cinema-range" aria-label="音量" type="range" min="0" max="1" step=".01" value={volume} style={rangeStyle(volume, 1)} onChange={e => changeVolume(+e.target.value)} /></div>
        <div className="cinema-transport"><Control label="后退 10 秒" onClick={() => seek(elapsed - 10)} className="cinema-skip"><RotateCcw size={26} /><span>10</span></Control><Control label={paused ? '播放' : '暂停'} onClick={toggle} className="cinema-toggle">{paused ? <Play size={27} fill="currentColor" /> : <Pause size={27} fill="currentColor" />}</Control><Control label="前进 10 秒" onClick={() => seek(elapsed + 10)} className="cinema-skip"><RotateCw size={26} /><span>10</span></Control></div>
        <div className="cinema-options">
          <div className="cinema-menu-anchor"><Control label="播放速度" expanded={menu === 'speed'} onClick={() => setMenu(menu === 'speed' ? null : 'speed')} className={menu === 'speed' ? 'is-active' : ''}><span className="cinema-speed">{speed}×</span><ChevronDown size={11} /></Control>{menu === 'speed' && <div className="cinema-menu" role="menu" aria-label="播放速度"><h3>播放速度</h3>{[.5, .75, 1, 1.25, 1.5, 2].map(rate => <button role="menuitemradio" aria-checked={speed === rate} key={rate} onClick={() => { setSpeed(rate); if (video.current) video.current.playbackRate = rate; setMenu(null); }}><span>{rate === 1 ? '正常速度' : `${rate}×`}</span>{rate === speed && <Check size={15} />}</button>)}</div>}</div>
          <div className="cinema-menu-anchor"><Control label="字幕选项" expanded={menu === 'subtitles'} onClick={() => setMenu(menu === 'subtitles' ? null : 'subtitles')} className={menu === 'subtitles' ? 'is-active' : ''}><Subtitles size={21} /></Control>{menu === 'subtitles' && <div className="cinema-menu cinema-subtitles" role="menu" aria-label="字幕选项"><h3>字幕</h3>{subtitleName && <button role="menuitemcheckbox" aria-checked={subtitleEnabled} onClick={() => { setSubtitleEnabled(!subtitleEnabled); if (video.current?.textTracks[0]) video.current.textTracks[0].mode = subtitleEnabled ? 'disabled' : 'showing'; setMenu(null); }}><span>{subtitleName}</span>{subtitleEnabled && <Check size={15} />}</button>}<button role="menuitem" aria-label="加载 VTT 字幕" onClick={() => { picker.current?.click(); setMenu(null); }}><span>加载外挂字幕</span><small>VTT</small></button></div>}</div>
          <Control label={fullscreen ? '退出全屏' : '全屏'} onClick={toggleFullscreen}>{fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}</Control>
        </div>
      </div>
      <div className="cinema-timeline" onPointerLeave={() => setPreview(null)} onPointerMove={e => { const bounds = e.currentTarget.getBoundingClientRect(); const percent = Math.max(0, Math.min(100, (e.clientX - bounds.left) / bounds.width * 100)); setPreview({percent, seconds: length * percent / 100}); }}>
        {preview && <span className="cinema-seek-preview" style={{left: `${preview.percent}%`}}>{playbackTime(preview.seconds)}</span>}
        <input className="cinema-range" aria-label="播放进度" type="range" min="0" max={length || 1} step=".1" value={Math.min(elapsed, length || 1)} style={rangeStyle(elapsed, length)} onChange={e => seek(+e.target.value)} />
      </div>
      <div className="cinema-timestamps"><span>{playbackTime(elapsed)}</span><span>{paused ? '已暂停' : media.episode || ''}</span><span>−{playbackTime(length - elapsed)}</span></div>
    </div>}
    <input className="hidden" ref={picker} type="file" accept=".vtt" aria-label="选择 VTT 字幕" onChange={e => { const file = e.target.files?.[0]; if (file) { setSubtitle(URL.createObjectURL(file)); setSubtitleName(file.name); setSubtitleEnabled(true); } }} />
  </div>;
}
