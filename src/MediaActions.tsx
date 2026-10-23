import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {AlignLeft,AudioLines,Check,FileVideo,FolderOpen,Subtitles,X} from 'lucide-react';
import type {Media,Source} from './types';
import {trackName} from './track-label';
export type MediaInfoView='overview'|'source';

export function MediaContextMenu({title,x,y,onChoose,onClose,cinematic=false}:{title:string;x:number;y:number;onChoose:(view:MediaInfoView)=>void;onClose:()=>void;cinematic?:boolean}) {
  const ref=useRef<HTMLDivElement>(null);
  const previousFocus=useRef(document.activeElement as HTMLElement);
  const closeRef=useRef(onClose);closeRef.current=onClose;
  const [position,setPosition]=useState({x,y});
  useLayoutEffect(()=>{const r=ref.current!.getBoundingClientRect();setPosition({x:Math.max(12,Math.min(x,innerWidth-r.width-12)),y:Math.max(12,Math.min(y,innerHeight-r.height-12))});ref.current!.querySelector<HTMLButtonElement>('button')?.focus();},[x,y]);
  useEffect(()=>{
    const dismiss=(event:PointerEvent)=>{if(!ref.current?.contains(event.target as Node))closeRef.current();};
    const close=()=>closeRef.current();document.addEventListener('pointerdown',dismiss);window.addEventListener('resize',close);window.addEventListener('scroll',close,true);
    return()=>{document.removeEventListener('pointerdown',dismiss);window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true);if(previousFocus.current?.isConnected)previousFocus.current.focus();};
  },[]);
  return <div ref={ref} role="menu" aria-label="影片快捷菜单" className={`media-context-menu ${cinematic?'cinematic-surface':''}`} style={{left:position.x,top:position.y}} onContextMenu={e=>e.preventDefault()} onKeyDown={e=>{
    const buttons=Array.from(ref.current!.querySelectorAll('button'));
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}
    if(['ArrowUp','ArrowDown','Home','End','Tab'].includes(e.key)){e.preventDefault();const current=buttons.indexOf(document.activeElement as HTMLButtonElement);const index=e.key==='Home'?0:e.key==='End'?buttons.length-1:(current+(e.key==='ArrowUp'||(e.key==='Tab'&&e.shiftKey)?-1:1)+buttons.length)%buttons.length;buttons[index]?.focus();}
  }}><span className="media-context-title" title={title}>{title}</span><button role="menuitem" onClick={()=>onChoose('overview')}><AlignLeft size={17}/><span>影片简介<small>故事、导演与演职人员</small></span></button><button role="menuitem" onClick={()=>onChoose('source')}><FileVideo size={17}/><span>片源信息<small>视频、音轨、字幕与文件位置</small></span></button></div>;
}

export function MediaInfoDialog({media,source,view,onClose,cinematic=false}:{media:Media;source?:Source;view:MediaInfoView;onClose:()=>void;cinematic?:boolean}) {
  const ref=useRef<HTMLDivElement>(null),[error,setError]=useState('');
  useEffect(()=>{const previous=document.activeElement as HTMLElement;ref.current!.querySelector<HTMLButtonElement>('button')?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
  const technical=media.technical,audio=technical?.tracks.filter(t=>t.type==='audio')||[],subtitles=technical?.tracks.filter(t=>t.type==='subtitle')||[];
  const poster=window.__LUMA_ASSETS?.[media.poster]||media.poster;
  const resolution=technical?.width&&technical?.height?`${technical.width} × ${technical.height}`:'尚未探测';
  const size=media.fileSize?`${(media.fileSize/1024**3).toFixed(2)} GB`:'尚未记录';
  return <div className="media-info-scrim" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();}} onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}
    if(e.key==='Tab'){const buttons=Array.from(ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled),a[href]'));const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  }}><div ref={ref} role="dialog" aria-modal="true" aria-label={view==='overview'?'影片简介':'片源信息'} className={`media-info-dialog ${cinematic?'cinematic-surface':''}`}>
    <button className="media-info-close" aria-label="关闭影片信息" onClick={onClose}><X size={18}/></button>
    <header>{poster?<img src={poster} alt=""/>:<span className="media-info-poster"><FileVideo size={28}/></span>}<div><span className="media-info-eyebrow">{view==='overview'?'影片简介':'片源信息'}</span><h1>{media.title}</h1><p>{[media.year,media.originalTitle].filter(Boolean).join(' · ')}</p></div></header>
    {view==='overview'?<><p className="media-synopsis">{media.description||'暂无影片简介，请先匹配影片资料。'}</p><div className="media-facts"><div><span>类型</span><strong>{media.genre.join(' / ')||'待匹配'}</strong></div><div><span>导演</span><strong>{media.director||'暂无资料'}</strong></div><div><span>时长</span><strong>{media.duration>0?`${Math.round(media.duration)} 分钟`:'未知'}</strong></div><div><span>分级</span><strong>{media.certification||'未分级'}</strong></div></div>{Boolean(media.cast?.length)&&<section className="media-track-section"><h2>演职人员</h2><p className="media-cast-names">{media.cast!.join(' / ')}</p></section>}</>:<>
      <div className="media-facts"><div><span>分辨率</span><strong>{resolution}</strong></div><div><span>视频编码</span><strong>{technical?.videoCodec?.toUpperCase()||'尚未探测'}</strong></div><div><span>封装格式</span><strong>{technical?.container||'尚未探测'}</strong></div><div><span>动态范围</span><strong>{technical?technical.hdr?'HDR 片源':'SDR / 未标注 HDR':'尚未探测'}</strong></div><div><span>文件大小</span><strong>{size}</strong></div><div><span>文件来源</span><strong>{source?.name||'未关联来源'}{media.missing||source?.status==='offline'?' · 离线':''}</strong></div></div>
      <section className="media-track-section"><h2><AudioLines size={16}/>音轨语言<span>{audio.length}</span></h2>{audio.length?audio.map(t=><div className="media-track-row" key={t.index}><strong>{trackName(t,'audio')}</strong><small>{[t.codec?.toUpperCase(),t.channels?`${t.channels} 声道`:''].filter(Boolean).join(' · ')}</small></div>):<p>尚未检测到音轨信息</p>}</section>
      <section className="media-track-section"><h2><Subtitles size={16}/>字幕<span>{subtitles.length}</span></h2>{subtitles.length?subtitles.map(t=><div className="media-track-row" key={t.index}><strong>{trackName(t,'subtitle')}</strong><small>{t.codec?.toUpperCase()}</small></div>):<p>尚未检测到内封字幕</p>}</section>
      <div className="media-file-location"><FolderOpen size={17}/><span>{media.path||'示例影片，未关联本地片源'}</span>{media.path&&window.desktop&&<button onClick={()=>{void window.desktop!.revealFile(media.path!).catch(()=>setError('文件位置暂时无法打开，请检查片源连接。'));}}>打开位置</button>}</div>{error&&<p role="alert">{error}</p>}
    </>}
  </div></div>;
}

export function TrackMenu({kind,tracks,value,onSelect}:{kind:'audio'|'subtitle';tracks:{id:number;title?:string;lang?:string;selected?:boolean}[];value:number|'no';onSelect:(value:number|'no')=>void}) {
  const [open,setOpen]=useState(false),ref=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{if(open)ref.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();},[open]);
  useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[open]);
  const label=kind==='audio'?'音轨语言':'字幕';const Icon=kind==='audio'?AudioLines:Subtitles;
  return <div className="mpv-track-picker" ref={ref} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);ref.current?.querySelector('button')?.focus();}if(open&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const items=Array.from(ref.current!.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));const i=items.indexOf(document.activeElement as HTMLButtonElement);items[(i+(e.key==='ArrowUp'?-1:1)+items.length)%items.length]?.focus();}}}>
    <button className="mpv-track-button" aria-label={`mpv ${label}`} aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(!open)}><Icon size={17}/><span>{label}<small>{value==='no'?'关闭':trackName(tracks.find(t=>t.id===value)||{},kind)}</small></span></button>
    {open&&<div className="cinema-menu mpv-track-menu" role="menu" aria-label={`mpv ${label}`}><h3>{label}</h3>{[{id:'no' as const,title:kind==='audio'?'关闭音轨':'关闭字幕'},...tracks].map(t=><button key={t.id} role="menuitemradio" aria-checked={value===t.id} onClick={()=>{onSelect(t.id);setOpen(false);}}><span>{t.id==='no'?t.title:trackName(t,kind)}</span>{value===t.id&&<Check size={15}/>}</button>)}</div>}
  </div>;
}
