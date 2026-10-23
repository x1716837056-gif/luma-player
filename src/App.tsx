import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownWideNarrow, ArrowLeft, ArrowUpRight, Bookmark, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clapperboard, Clock3, Film, Folder, FolderOpen, Grid2X2, HardDrive, Heart, Home, List, LoaderCircle, Maximize, Minus, Monitor, MoreHorizontal, Play, Plus, RefreshCw, Search, Server, Settings2, ShieldCheck, Sparkles, Sun, Moon, Star, Subtitles, Tv, Wifi, X, type LucideIcon } from 'lucide-react';
import { MpvPanel } from './MpvPanel';
import {MediaContextMenu,MediaInfoDialog,type MediaInfoView} from './MediaActions';
import {trackName} from './track-label';
import { PlayerModal } from './PlayerModal';
import {MovieFilters,emptyCatalogFilters} from './MovieFilters';
import {matchesCatalog,ageGroup,ageGroups, type CatalogFilters} from '../shared/catalog.mjs';
import type { Library, Media, Settings, Source, TaskStatus, PlayerState } from './types';
import { demoLibrary } from './data';
import { defaultSettings, importBrowserFiles, loadLibrary, loadSettings, saveLibrary, saveSettings, searchMetadata } from './storage';

const duration = (minutes: number) => { const rounded = Math.round(minutes); return minutes > 0 ? rounded < 1 ? '不到 1 分钟' : `${Math.floor(rounded / 60) ? `${Math.floor(rounded / 60)} 小时 ` : ''}${rounded % 60} 分钟` : '时长未知'; };
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const localAsset = (src: string) => window.__LUMA_ASSETS?.[src] || src;
const navItems: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: '首页', icon: Home }, { id: 'recent', label: '最近添加', icon: Clock3 },
  { id: 'movies', label: '电影', icon: Clapperboard }, { id: 'tv', label: '电视剧', icon: Tv },
  { id: 'favorites', label: '我的收藏', icon: Heart }, { id: 'unwatched', label: '尚未观看', icon: Bookmark },
];

function IconButton({ children, label, onClick, className = '', disabled = false }: { children: ReactNode; label: string; onClick?: () => void; className?: string; disabled?: boolean }) {
  return <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Artwork({ media, backdrop = false, className = '' }: { media: Media; backdrop?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = localAsset(backdrop ? media.backdrop || media.poster : media.poster);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? <img className={className} src={src} alt={backdrop ? '' : media.title} loading="lazy" onError={() => setFailed(true)} /> : <div className={`artwork-placeholder ${className}`}><Film size={backdrop ? 42 : 32} strokeWidth={1.2} /><span>{media.title}</span></div>;
}

function Modal({ children, label, onClose, className = '' }: { children: ReactNode; label: string; onClose: () => void; className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = container.current!;
    const focusables = () => Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, a[href], video[controls], [tabindex="0"]'));
    (focusables()[0] || el).focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.stopPropagation(); closeRef.current(); }
      if (event.key === 'Tab') {
        const items = focusables(); const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    el.addEventListener('keydown', keydown);
    return () => { el.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  return <div className="modal-scrim" onMouseDown={event => event.target === event.currentTarget && onClose()}><div ref={container} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`modal ${className}`}><IconButton className="modal-close" label="关闭" onClick={onClose}><X size={19} /></IconButton>{children}</div></div>;
}

function PosterCard({ media, onClick, onFavorite, compact = false }: { media: Media; onClick: () => void; onFavorite: () => void; compact?: boolean }) {
  return <article data-media-id={media.id} className={`poster-card ${compact ? 'compact' : ''}`}>
    <button className="poster-art" onClick={onClick} aria-label={`查看 ${media.title}`}>
      <Artwork media={media} />
      <span className="poster-shade" />
      <span className="quality-badge">{media.quality.includes('4K') ? '4K' : media.quality}</span>
      {media.watched && <span className="watched-badge"><Check size={12} /></span>}
      <span className="poster-play"><Play size={22} fill="currentColor" strokeWidth={1.5} /></span>
      {Boolean(media.progress) && <span className="poster-progress"><i style={{ width: `${media.progress! * 100}%` }} /></span>}
    </button>
    <button className="poster-title" onClick={onClick}>{media.title}</button>
    <div className="poster-subtitle"><span>{media.year || '未匹配'}</span>{media.rating && <span className="poster-rating"><Star size={10} fill="currentColor" />{media.rating}</span>}</div>
    <button className={`poster-favorite ${media.favorite ? 'is-favorite' : ''}`} onClick={onFavorite} title={media.favorite ? '取消收藏' : '收藏'} aria-label={`${media.favorite ? '取消收藏' : '收藏'} ${media.title}`}><Heart size={15} fill={media.favorite ? 'currentColor' : 'none'} /></button>
  </article>;
}

export default function App() {
  const [library, setLibrary] = useState<Library>(structuredClone(demoLibrary));
  const [settings, setSettings] = useState<Settings>(()=>{try{return {...defaultSettings,theme:localStorage.getItem('luma.theme.v1')==='light'?'light':'dark'};}catch{return defaultSettings;}});
  const [tasks, setTasks] = useState<TaskStatus>({running:false,completed:0,total:0,matched:0,review:0,failed:0,queued:0});
  const [mpv, setMpv] = useState<PlayerState>({active:false});
  const [ready, setReady] = useState(false);
  const [view, setView] = useState('home');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('added');
  const [genre, setGenre] = useState('全部类型');
  const [movieFilters,setMovieFilters]=useState<CatalogFilters>(emptyCatalogFilters);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<string | null>(null);
  const [contextMenu,setContextMenu]=useState<{id:string;x:number;y:number}|null>(null);
  const [info,setInfo]=useState<{id:string;view:MediaInfoView}|null>(null);
  const [playing, setPlaying] = useState<Media | null>(null);
  const [dialog, setDialog] = useState<'source' | 'settings' | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const [error, setError] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLElement>(null);

  useLayoutEffect(() => { const theme=settings.theme === 'light' ? 'light' : 'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('luma.theme.v1',theme);}catch{/* The main settings store remains available. */} }, [settings.theme]);
  async function toggleTheme() {
    const next: Settings = {...settings, theme: settings.theme === 'light' ? 'dark' : 'light'};
    setSettings(next); setThemeSaving(true);
    try { await saveSettings(next); }
    catch { setSettings(settings); setToast('主题设置保存失败，请重试。'); }
    finally { setThemeSaving(false); }
  }

  useEffect(() => { Promise.all([loadLibrary(), loadSettings()]).then(([lib, prefs]) => { setLibrary(lib); setSettings(prefs); setReady(true); }).catch(() => { setError('无法读取已保存的影音库。请检查本地存储权限。'); setReady(true); }); }, []);
  useEffect(() => {
    if(!ready)return;
    let painted=0;
    const first=requestAnimationFrame(()=>{painted=requestAnimationFrame(()=>{document.documentElement.dataset.lumaReady='true';window.desktop?.ready();});});
    return ()=>{cancelAnimationFrame(first);cancelAnimationFrame(painted);};
  }, [ready]);
  useEffect(() => { if (ready && !window.desktop) saveLibrary(library).catch(() => setToast('保存失败，请检查磁盘空间和文件权限。')); }, [library, ready]);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(''), 4200); return () => clearTimeout(timeout); }, [toast]);
  useEffect(() => { scroll.current?.scrollTo({ top: 0 }); }, [view, query]);
  useEffect(() => {
    function keydown(event: KeyboardEvent) { if ((event.ctrlKey || event.metaKey) && event.key === 'k') { event.preventDefault(); searchInput.current?.focus(); } }
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, []);

  useEffect(() => {
    const desktop=window.desktop;
    if(!desktop)return;
    const offLibrary=desktop.onLibraryChanged(next=>{if(next)setLibrary(next);});
    const offTasks=desktop.onTasksChanged(setTasks);
    const offPlayer=desktop.onPlayerChanged(state=>{setMpv(state);if(state.error)setToast(state.error);});
    void desktop.taskStatus().then(setTasks).catch(()=>{});
    void desktop.playerState().then(setMpv).catch(()=>{});
    return ()=>{offLibrary();offTasks();offPlayer();};
  }, []);
  async function startTasks() {
    try { if(window.desktop) setTasks(await window.desktop.startTasks()); }
    catch(error) {setToast((error as Error).message);if(!settings.tmdbToken)setDialog('settings');}
  }

  function navigate(id: string) { setView(id); setQuery(''); setGenre('全部类型');setMovieFilters(emptyCatalogFilters); }
  function patchMedia(id: string, patch: Partial<Media>) {
    setLibrary(prev => ({ ...prev, media: prev.media.map(item => item.id === id ? { ...item, ...patch } : item) }));
    if(window.desktop) void window.desktop.updateMedia(id,patch).catch(error=>setToast(error.message));
  }
  function toggleFavorite(media: Media) { patchMedia(media.id, { favorite: !media.favorite }); setToast(media.favorite ? '已从收藏中移除' : '已加入我的收藏'); }
  function mergeImport(imported: Library) {
    setLibrary(prev => {
      const base = prev.demo ? { media: [], sources: [] } : prev;
      const incoming = new Map(imported.media.filter(item => item.path).map(item => [item.path, item]));
      const paths = new Set(base.media.map(item => item.path));
      const retained = base.media.map(item => { const fresh = incoming.get(item.path); return fresh ? { ...fresh, ...item, videoUrl: fresh.videoUrl } : item; });
      return { demo: false, media: [...retained, ...imported.media.filter(item => !item.path || !paths.has(item.path))], sources: [...base.sources.filter(source => !imported.sources.some(next => next.id === source.id)), ...imported.sources] };
    });
    navigate('recent'); setDialog(null); setToast(`已扫描到 ${imported.media.length} 个视频文件`);
  }
  async function importFolder(path?: string, type: Source['type'] = 'local') {
    setError('');
    if (!window.desktop) { if (type === 'nas') { setError('NAS 路径需要 Windows 桌面版读取。网页预览中可以先选择本地文件夹。'); return; } fileInput.current?.click(); return; }
    const folder = path || await window.desktop.selectFolder();
    if (!folder) return;
    setBusy(true);
    try { const result = await window.desktop.scanFolder(folder, type); mergeImport({ demo: false, media: result.media, sources: [result.source] }); if (result.warnings.length) setToast(`扫描完成，${result.warnings.length} 个目录无法读取。请检查权限。`); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function rescan() {
    if(library.demo) {setToast('添加你的文件夹即可开始扫描。');setDialog('source');return;}
    if(!window.desktop) {fileInput.current?.click();return;}
    setBusy(true);let count=0,offline=0;
    try {
      for(const source of library.sources) {
        try { const result=await window.desktop.scanFolder(source.path,source.type);count+=result.media.length; }
        catch {offline++;}
      }
      const next=await window.desktop.loadLibrary();if(next)setLibrary(next);
      setToast(`扫描完成，读取 ${count} 个文件。${offline?'离线来源的资料已保留。':''}`);
    } finally {setBusy(false);}
  }
  async function play(media: Media) {
    if(media.missing){setToast('文件暂不可用，请检查片源连接后刷新。');return;}
    const browserCompatible = /\.(mp4|webm)$/i.test(media.path || '') && (!media.technical?.videoCodec || ['h264','vp8','vp9','av1'].includes(media.technical.videoCodec));
    if (!library.demo && window.desktop && (settings.defaultPlayer !== 'native' || !browserCompatible)) { try { setMpv(await window.desktop.playMpv(media)); } catch (err) { setToast((err as Error).message); } return; }
    if (!library.demo && !media.videoUrl && !window.desktop) { setToast('浏览器重启后需要重新选择本地文件夹，才能恢复播放权限。'); fileInput.current?.click(); return; }
    setPlaying(media);
  }

  const activeMedia = library.media.find(item => item.id === selected);
  const heroCandidates = library.media.filter(item => item.backdrop && item.kind === 'movie').slice(0, 3);
  const hero = heroCandidates[heroIndex % Math.max(heroCandidates.length, 1)];
  const continueWatching = library.media.filter(item => item.progress && item.progress > 0 && item.progress < 0.96).slice(0, 4);
  const genres = ['全部类型', ...new Set(library.media.flatMap(item => item.genre))];
  const visibleMedia = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return library.media.filter(item => {
      if (normalized && !`${item.title} ${item.originalTitle} ${item.year} ${item.director || ''}`.toLocaleLowerCase().includes(normalized)) return false;
      if (genre !== '全部类型' && !item.genre.includes(genre)) return false;
      if (view === 'movies' && item.kind !== 'movie') return false;
      if (view === 'movies' && !matchesCatalog(item,movieFilters)) return false;
      if (view === 'tv' && item.kind !== 'tv') return false;
      if (view === 'favorites' && !item.favorite) return false;
      if (view === 'unwatched' && (item.watched || item.progress)) return false;
      if (view.startsWith('source:') && item.sourceId !== view.slice(7)) return false;
      return true;
    }).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN') : sort === 'year' ? b.year - a.year : sort === 'rating' ? Number(b.rating) - Number(a.rating) : b.addedAt - a.addedAt);
  }, [library, query, view, genre, sort, movieFilters]);
  const catalogFiltered=view==='movies'&&(movieFilters.genre!=='all'||movieFilters.age!=='all'||movieFilters.year!=='all');
  const pageTitle = query ? '搜索结果' : navItems.find(item => item.id === view)?.label || (view === 'folders' ? '文件来源' : library.sources.find(source => `source:${source.id}` === view)?.name || '影音库');
  const isHome = view === 'home' && !query;

  const contextMedia=library.media.find(item=>item.id===contextMenu?.id);
  const infoMedia=library.media.find(item=>item.id===info?.id);
  return <div className="app-shell" onContextMenu={event=>{
    const target=(event.target as HTMLElement).closest<HTMLElement>('[data-media-id]');
    if(target?.dataset.mediaId){event.preventDefault();setContextMenu({id:target.dataset.mediaId,x:event.clientX,y:event.clientY});}
  }} onKeyDown={event=>{
    if(event.key!=='ContextMenu'&&!(event.shiftKey&&event.key==='F10'))return;
    const target=(event.target as HTMLElement).closest<HTMLElement>('[data-media-id]');
    if(target?.dataset.mediaId){event.preventDefault();const bounds=target.getBoundingClientRect();setContextMenu({id:target.dataset.mediaId,x:bounds.left+20,y:bounds.top+20});}
  }}>
    <aside className="sidebar">
      <div className="brand"><img src={localAsset('./luma.svg')} width="34" height="34" alt="" /><span>Luma<span className="brand-dot">.</span></span></div>
      <div className="sidebar-section-title">影音库</div>
      <nav aria-label="主导航">{navItems.map(({ id, label, icon: Icon }) => <button key={id} aria-label={label} className={`nav-item ${view === id && !query ? 'active' : ''}`} onClick={() => navigate(id)}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{id === 'favorites' && <span className="nav-count">{library.media.filter(item => item.favorite).length}</span>}</button>)}</nav>
      <div className="sidebar-section-title source-heading">文件来源<button aria-label="添加文件来源" onClick={() => { setError(''); setDialog('source'); }}><Plus size={14} /></button></div>
      <nav aria-label="文件来源" className="source-navigation"><div className="source-scroll">{library.sources.map(source => <button key={source.id} aria-label={source.name} title={`${source.name}\n${source.path}`} className={`nav-item source-item ${view === `source:${source.id}` ? 'active' : ''}`} onClick={() => navigate(`source:${source.id}`)}>{source.type === 'nas' ? <Server size={17} /> : <HardDrive size={17} />}<span className="source-label">{source.name}</span><i aria-label={source.status === 'online' ? '已连接' : '离线'} className={`status-dot ${source.status}`} /></button>)}</div><button aria-label="所有文件来源" className={`nav-item ${view === 'folders' ? 'active' : ''}`} onClick={() => navigate('folders')}><Folder size={17} /><span>所有文件来源</span></button></nav>
      <div className="sidebar-bottom"><div className="library-health"><span className="health-icon"><CheckCheck size={16} /></span><div><span>{library.demo ? '示例影音库' : '你的私人影音库'}</span><small>{library.media.length} 部影片 · {library.sources.length} 个来源</small></div><button aria-label="刷新影音库" onClick={rescan} disabled={busy}><RefreshCw size={13} className={busy ? 'spinning' : ''} /></button></div><button className="profile-row" onClick={() => setDialog('settings')}><span className="profile-avatar">L</span><span>我的空间<small>让收藏，成为影院</small></span><Settings2 size={17} /></button></div>
    </aside>

    <div className="main-shell">
      <div className="window-bar"><span>Luma</span><div><button aria-label="最小化窗口" onClick={() => window.desktop?.windowAction('minimize')}><Minus size={13} /></button><button aria-label="最大化窗口" onClick={() => window.desktop?.windowAction('maximize')}><span className="maximize-icon" /></button><button aria-label="关闭窗口" className="window-close" onClick={() => window.desktop?.windowAction('close')}><X size={14} /></button></div></div>
      <header className="toolbar"><div className="toolbar-location"><IconButton label="返回首页" onClick={() => navigate('home')} disabled={isHome}><ChevronLeft size={21} /></IconButton><span className="toolbar-title" title={pageTitle}>{pageTitle}</span>{library.demo && <span className="demo-indicator">示例</span>}</div><div className="toolbar-actions"><label className="search-box"><Search size={16} /><input ref={searchInput} aria-label="搜索影音库" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索你的影音库" />{query ? <button aria-label="清除搜索" onClick={() => setQuery('')}><X size={13} /></button> : <kbd>Ctrl K</kbd>}</label><IconButton label={settings.theme === 'light' ? '切换到深色模式' : '切换到浅色模式'} className="theme-toggle" onClick={toggleTheme} disabled={!ready || themeSaving}>{settings.theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</IconButton><IconButton label="刷新影音库" onClick={rescan} disabled={busy}><RefreshCw size={17} className={busy ? 'spinning' : ''} /></IconButton><span className="toolbar-divider" /><button className="add-button" onClick={() => { setError(''); setDialog('source'); }}><Plus size={17} /><span>添加影片</span></button></div></header>

      <main className="main-scroll" ref={scroll}>
        {isHome && hero && <section className="hero" data-media-id={hero.id} aria-label="精选影片"><div className="hero-image"><Artwork key={hero.id} media={hero} backdrop /></div><div className="hero-vignette" /><div className="hero-content"><span className="hero-eyebrow"><Sparkles size={13} /> 值得重温的好故事</span><span className="hero-original">{hero.originalTitle}</span><h1>{hero.title}</h1><div className="hero-meta"><span>{hero.year}</span><span>{hero.genre.join(' / ')}</span><span>{duration(hero.duration)}</span></div><div className="hero-badges"><span className="score"><Star size={13} fill="currentColor" /> {hero.rating}</span><span className="technical-badge">{hero.quality}</span>{hero.technical?.hdr && <span className="technical-badge hdr">HDR 片源</span>}</div><p>{hero.description}</p><div className="hero-buttons"><button className="button-primary play-button" onClick={() => play(hero)}><Play size={17} fill="currentColor" />{hero.progress ? '继续播放' : '立即播放'}</button><button className="button-glass" onClick={() => setSelected(hero.id)}>影片详情<ArrowUpRight size={15} /></button><IconButton label={hero.favorite ? '取消收藏精选影片' : '收藏精选影片'} className={`hero-heart ${hero.favorite ? 'favorite' : ''}`} onClick={() => toggleFavorite(hero)}><Heart size={18} fill={hero.favorite ? 'currentColor' : 'none'} /></IconButton></div></div><div className="hero-bottom"><span className="hero-source"><Server size={12} /><span title={library.sources.find(source => source.id === hero.sourceId)?.path}>{library.sources.find(source => source.id === hero.sourceId)?.name || '影音库'}</span></span><div className="hero-pagination">{heroCandidates.map((item, index) => <button key={item.id} className={index === heroIndex ? 'active' : ''} aria-label={`精选影片 ${item.title}`} onClick={() => setHeroIndex(index)} />)}<span>0{heroIndex + 1}<i> / 0{heroCandidates.length}</i></span></div></div></section>}

        {isHome && continueWatching.length > 0 && <section className="content-section watching-section"><div className="section-heading"><h2>继续观看<span>好故事，接着看</span></h2><button className="text-button" onClick={() => { navigate('recent'); }}>查看全部<ChevronRight size={14} /></button></div><div className="continue-grid">{continueWatching.map(media => <article className="continue-card" data-media-id={media.id} key={media.id}><button className="continue-art" onClick={() => play(media)} aria-label={`继续播放 ${media.title}`}><Artwork media={media} backdrop /><span className="continue-shade" /><span className="continue-play"><Play size={18} fill="currentColor" /></span><span className="continue-remaining">{media.kind === 'tv' ? media.episode : `剩余 ${Math.ceil(media.duration * (1 - media.progress!))} 分钟`}</span><span className="continue-progress"><i style={{ width: `${media.progress! * 100}%` }} /></span></button><div className="continue-caption"><button onClick={() => setSelected(media.id)}>{media.title}</button><span>{media.kind === 'tv' ? '电视剧' : `${media.year} · 电影`}</span></div></article>)}</div></section>}

        {view === 'folders' && !query ? <section className="content-section collection-section"><div className="collection-heading"><div><span className="page-eyebrow">YOUR CONNECTIONS</span><h1>文件来源</h1><p>把散落各处的收藏，放进同一间影院。</p></div><button className="button-primary" onClick={() => { setError(''); setDialog('source'); }}><Plus size={16} />添加来源</button></div><div className="sources-grid">{library.sources.map(source => <button className="source-card" key={source.id} onClick={() => navigate(`source:${source.id}`)}><span className={`source-card-icon ${source.type}`}>{source.type === 'nas' ? <Server size={29} /> : <HardDrive size={29} />}</span><i className={`status-dot ${source.status}`} /><h3 title={source.name}>{source.name}</h3><p title={source.path}>{source.path}</p><div><span>{library.media.filter(item => item.sourceId === source.id).length} 部影片</span><span>{source.status === 'online' ? '已连接' : '离线 · 已保留资料'}<ChevronRight size={14} /></span></div></button>)}<button className="source-card add-source-card" onClick={() => { setError(''); setDialog('source'); }}><Plus size={26} /><span>添加本地或 NAS 文件夹</span></button></div><div className="source-note"><ShieldCheck size={18} /><p>影片留在原来的位置。Luma 只整理资料，播放时直接读取文件。</p></div></section> : <section className={`content-section ${isHome ? 'recent-section' : 'collection-section'}`}><div className={isHome ? 'section-heading' : 'collection-heading'}>{isHome ? <h2>最近添加<span>新加入你的影院</span></h2> : <div><span className="page-eyebrow">{query ? 'FIND YOUR NEXT STORY' : 'YOUR PERSONAL COLLECTION'}</span><h1 title={pageTitle}>{pageTitle}</h1><p>{query ? `“${query}” · 找到 ${visibleMedia.length} 部影片` : `${visibleMedia.length} 部影片，随时准备好下一场放映。`}</p></div>}{isHome ? <button className="text-button" onClick={() => navigate('movies')}>浏览影音库<ChevronRight size={14} /></button> : <div className="view-switch"><IconButton label="海报视图" className={layout === 'grid' ? 'selected' : ''} onClick={() => setLayout('grid')}><Grid2X2 size={17} /></IconButton><IconButton label="列表视图" className={layout === 'list' ? 'selected' : ''} onClick={() => setLayout('list')}><List size={18} /></IconButton></div>}</div>
        {view === 'movies' && <MovieFilters media={library.media.filter(m=>m.kind==='movie')} value={movieFilters} onChange={setMovieFilters}/>}
        {!isHome && <div className={`collection-filters ${view==='movies'?'movie-sort':''}`}>{view!=='movies' && <div className="filter-pills">{['全部类型', ...genres.filter(item => item !== '全部类型').slice(0, 5)].map(item => <button key={item} onClick={() => setGenre(item)} className={genre === item ? 'selected' : ''}>{item}</button>)}</div>}<label className="sort-select"><ArrowDownWideNarrow size={14} /><select aria-label="影片排序" value={sort} onChange={event => setSort(event.target.value)}><option value="added">按添加时间</option><option value="title">按影片名称</option><option value="year">按上映年份</option><option value="rating">按评分高低</option></select><ChevronDown size={13} /></label></div>}
        {visibleMedia.length === 0 ? <div className="empty-state">{query ? <Search size={40} strokeWidth={1} /> : view === 'favorites' ? <Heart size={40} strokeWidth={1} /> : <Film size={40} strokeWidth={1} />}<h3>{catalogFiltered ? '没有符合分类的影片' : query ? '还没找到这个故事' : view === 'favorites' ? '把喜欢的故事留在这里' : '你的影院，等你开场'}</h3><p>{catalogFiltered ? '调整影片类型、建议观看年龄或年份，试试其他组合。' : query ? '试试影片原名、中文名或上映年份。' : view === 'favorites' ? '点击影片上的爱心，就能随时在这里找到它。' : '添加本地文件夹或 NAS，共同组成你的私人影音库。'}</p><button className="button-glass" onClick={() => catalogFiltered ? setMovieFilters(emptyCatalogFilters) : query ? setQuery('') : setDialog('source')}>{catalogFiltered ? '清除分类' : query ? '清除搜索' : '添加文件来源'}</button></div> : !isHome && layout === 'list' ? <div className="media-list">{visibleMedia.map(media => <button className="media-list-row" data-media-id={media.id} onClick={() => setSelected(media.id)} key={media.id}><Artwork media={media} /><div><strong>{media.title}</strong><span>{media.originalTitle}</span></div><span>{media.year || '—'}</span><span>{media.genre.join(' / ') || '待匹配'}</span><span className="list-quality">{media.quality}</span><span className="list-rating"><Star size={12} />{media.rating || '—'}</span><ChevronRight size={16} /></button>)}</div> : <div className="poster-grid">{(isHome ? visibleMedia.filter(item => item.kind === 'movie').slice(0, 6) : visibleMedia).map(media => <PosterCard key={media.id} media={media} onClick={() => setSelected(media.id)} onFavorite={() => toggleFavorite(media)} />)}</div>}
        </section>}
        <footer className="content-footer"><span><i className="status-dot online" />{library.demo ? '正在浏览示例影音库' : '所有美好，都在你的收藏里'}</span><span>{library.media.length} 部影片<span className="footer-dot">·</span>本地与 NAS 直读</span></footer>
      </main>
    </div>

    {window.desktop && !library.demo && <section className="library-taskbar" aria-label="影音库任务"><span>{tasks.running ? `正在整理 ${tasks.completed} / ${tasks.total}` : tasks.total ? `整理完成 ${tasks.completed} / ${tasks.total}` : '片库整理'}{tasks.review > 0 ? ` · ${tasks.review} 部需要手动匹配` : ''}{tasks.failed > 0 ? ` · ${tasks.failed} 项失败，可重试` : ''}</span>{!settings.tmdbToken && <button onClick={()=>setDialog('settings')}>设置在线刮削</button>}<button onClick={startTasks} disabled={tasks.running}>自动匹配未整理影片</button>{tasks.running && <button onClick={()=>void window.desktop?.cancelTasks()}>取消任务</button>}</section>}
    <MpvPanel state={mpv} onError={setToast}/>
    {contextMenu&&contextMedia&&<MediaContextMenu title={contextMedia.title} x={contextMenu.x} y={contextMenu.y} onClose={()=>setContextMenu(null)} onChoose={view=>{setInfo({id:contextMedia.id,view});setContextMenu(null);}}/>}
    {info&&infoMedia&&<MediaInfoDialog media={infoMedia} source={library.sources.find(s=>s.id===infoMedia.sourceId)} view={info.view} onClose={()=>setInfo(null)}/>}
    <input ref={fileInput} type="file" className="hidden" aria-label="导入视频文件夹" multiple {...({ webkitdirectory: '', directory: '' } as object)} onChange={event => { if (event.target.files?.length) { const imported = importBrowserFiles(event.target.files); if (imported.media.length) mergeImport(imported); else setError('这个文件夹中没有找到支持的视频文件。'); } event.target.value = ''; }} />
    {error && !dialog && <div className="error-toast" role="alert">{error}<button onClick={() => setError('')} aria-label="关闭错误"><X size={15} /></button></div>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={16} />{toast}</div>}
    {activeMedia && !playing && <DetailModal media={activeMedia} source={library.sources.find(item => item.id === activeMedia.sourceId)} settings={settings} onClose={() => setSelected(null)} onPlay={() => play(activeMedia)} onFavorite={() => toggleFavorite(activeMedia)} onUpdate={async patch => {if(window.desktop && patch.tmdbId){await window.desktop.applyMetadata(activeMedia.id,patch as Media);}else patchMedia(activeMedia.id,patch);}} onToast={setToast} onSettings={() => setDialog('settings')} />}
    {dialog === 'source' && <SourceModal onClose={() => setDialog(null)} onImport={importFolder} busy={busy} error={error} />}
    {dialog === 'settings' && <SettingsModal settings={settings} demo={library.demo} onClose={() => setDialog(null)} onSave={async next => { await saveSettings(next); setSettings(next); setToast('设置已保存'); setDialog(null); }} onClearDemo={() => { const empty: Library={ demo:false,media:[],sources:[] }; setLibrary(empty); if(window.desktop)void saveLibrary(empty).catch(error=>setToast(error.message)); setDialog(null); navigate('home'); setToast('已准备好，添加你的第一个文件夹吧。'); }} />}
    {playing && <PlayerModal media={playing} demo={library.demo} onClose={() => setPlaying(null)} onProgress={(progress, minutes) => patchMedia(playing.id, { progress, ...(minutes ? { duration: minutes } : {}), ...(progress > 0.96 ? { watched: true } : {}) })} />}
  </div>;
}

function DetailModal({ media, source, settings, onClose, onPlay, onFavorite, onUpdate, onToast, onSettings }: { media: Media; source?: Source; settings: Settings; onClose: () => void; onPlay: () => void; onFavorite: () => void; onUpdate: (patch: Partial<Media>) => void | Promise<void>; onToast: (text: string) => void; onSettings: () => void }) {
  const [matching, setMatching] = useState(false);
  const [query, setQuery] = useState(media.title);
  const [kind, setKind] = useState(media.kind);
  const [results, setResults] = useState<Media[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function search(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { setResults(await searchMetadata(media, query, kind, settings)); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }
  return <Modal label={`${media.title} 影片详情`} className="detail-modal" onClose={onClose}><div className="detail-backdrop"><Artwork media={media} backdrop /><div /></div><div className="detail-main"><div className="detail-poster"><Artwork media={media} /></div><div className="detail-info"><span className="detail-original">{media.originalTitle}</span><h1>{media.title}</h1><div className="detail-meta"><span>{media.year || '年份未知'}</span><span>{duration(media.duration)}</span><span>{media.genre.join(' / ') || '待匹配'}</span></div><div className="detail-badges">{media.rating && <span className="score"><Star size={14} fill="currentColor" /> {media.rating}</span>}<span className="technical-badge">{media.quality}</span>{media.technical?.hdr && <span className="technical-badge">HDR 片源</span>}<span className="technical-badge" title={media.certificationRegion ? `分级地区：${media.certificationRegion}` : undefined}>{media.certification || '未分级'}</span>{ageGroup(media)!=='unknown' && <span className="technical-badge">建议 {ageGroups.find(g=>g.id===ageGroup(media))?.label}</span>}</div><div className="detail-actions"><button className="button-primary" onClick={onPlay}><Play size={16} fill="currentColor" />{media.progress ? `继续播放 · ${time(media.duration * 60 * media.progress)}` : '立即播放'}</button><IconButton label={media.favorite ? '取消收藏' : '收藏影片'} className={`button-glass ${media.favorite ? 'favorite' : ''}`} onClick={onFavorite}><Heart size={18} fill={media.favorite ? 'currentColor' : 'none'} /></IconButton><IconButton label={media.watched ? '标记为未观看' : '标记为已观看'} className={`button-glass ${media.watched ? 'favorite' : ''}`} onClick={() => onUpdate({ watched: !media.watched, progress: 0 })}><Check size={19} /></IconButton><IconButton label="重新匹配影片资料" className="button-glass" onClick={() => setMatching(!matching)}><MoreHorizontal size={19} /></IconButton></div></div></div><div className="detail-body"><div className="detail-description"><h2>故事简介</h2><p>{media.description || '暂无影片简介，可以手动匹配影片资料。'}</p></div><div className="detail-side-info"><div><span>导演</span><strong>{media.director || '暂无资料'}</strong></div><div><span>文件来源</span><strong>{source?.name || '本地影片'}</strong></div><button className="text-button" onClick={() => setMatching(!matching)}><RefreshCw size={13} />重新匹配资料</button></div></div>{media.cast && <div className="cast-section"><h2>演职人员</h2><div className="cast-list">{media.cast.map((name, index) => <div key={name}><span className={`cast-avatar cast-${index}`}><span>{name.replace('·', '').slice(0, 1)}</span></span><strong>{name}</strong><small>主演</small></div>)}</div></div>}{matching && <section className="match-section"><h2>匹配影片资料</h2><p>使用 TMDB 搜索并更正海报、片名、简介和评分。</p><form className="match-form" onSubmit={search}><input aria-label="影片匹配名称" value={query} onChange={event => setQuery(event.target.value)} required /><select aria-label="匹配影片类型" value={kind} onChange={event => setKind(event.target.value as Media['kind'])}><option value="movie">电影</option><option value="tv">电视剧</option></select><button className="button-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spinning" /> : <Search size={16} />}搜索</button></form>{error && <p className="form-error">{error}{!settings.tmdbToken && <button onClick={onSettings}>前往设置</button>}</p>}{results?.length === 0 && <p>未找到匹配结果，请尝试原名或减少关键词。</p>}<div className="match-results">{results?.map(item => <button key={item.tmdbId} disabled={busy} onClick={async () => { setBusy(true); try { await onUpdate(item); setMatching(false); onToast('影片资料已更新'); } catch(err) { setError((err as Error).message); } finally {setBusy(false);} }}><Artwork media={item} /><span><strong>{item.title}</strong><small>{item.year} · {item.originalTitle}</small></span><Check size={17} /></button>)}</div></section>}{media.missing && <p className="form-error">文件暂不可用，已保留收藏与观看记录。</p>}{media.metadataStatus === 'review' && <p className="field-help">发现多个候选，请使用「重新匹配资料」确认。</p>}{media.technical && <section className="technical-summary"><h2>媒体信息</h2><p>{media.technical.width} × {media.technical.height} · {media.technical.videoCodec?.toUpperCase()} · {media.technical.hdr ? 'HDR 片源' : 'SDR / 未标注 HDR'}</p><div className="detail-track-groups"><div><h3>音轨语言</h3><p>{media.technical.tracks.filter(t=>t.type==='audio').map(t=>`${trackName(t,'audio')} · ${t.codec?.toUpperCase()||''}`).join(' / ')||'没有检测到音轨'}</p></div><div><h3>字幕</h3><p>{media.technical.tracks.filter(t=>t.type==='subtitle').map(t=>`${trackName(t,'subtitle')} · ${t.codec?.toUpperCase()||''}`).join(' / ')||'没有检测到内封字幕'}</p></div></div></section>}<div className="detail-file"><FolderOpen size={14} /><span>{media.path || `${source?.path || 'D:\\Movies'}\\${media.originalTitle}.${media.year}.2160p.mkv`}</span>{media.path && window.desktop && <button onClick={() => window.desktop?.revealFile(media.path!)}>在文件夹中显示<ArrowUpRight size={12} /></button>}</div></Modal>;
}

function SourceModal({ onClose, onImport, busy, error }: { onClose: () => void; onImport: (path?: string, type?: Source['type']) => void; busy: boolean; error: string }) {
  const [tab, setTab] = useState<'local' | 'nas'>('local');
  const [path, setPath] = useState('');
  return <Modal label="添加文件来源" className="source-modal" onClose={onClose}><span className="modal-illustration"><FolderOpen size={31} strokeWidth={1.5} /><i><Plus size={12} /></i></span><h1>让好故事，住进来。</h1><p className="modal-intro">连接你的硬盘或 NAS，建立自己的影音库。</p><div className="segmented-control"><button className={tab === 'local' ? 'active' : ''} onClick={() => setTab('local')}><HardDrive size={16} />本地文件夹</button><button className={tab === 'nas' ? 'active' : ''} onClick={() => setTab('nas')}><Server size={16} />NAS / SMB</button></div>{tab === 'local' ? <button className="folder-dropzone" onClick={() => onImport()} disabled={busy}>{busy ? <LoaderCircle size={34} className="spinning" /> : <FolderOpen size={35} strokeWidth={1.25} />}<strong>{busy ? '正在整理你的影片…' : '选择影片所在的文件夹'}</strong><span>自动扫描文件夹内的电影和电视剧</span><span className="folder-types">MKV · MP4 · MOV · AVI · WEBM</span></button> : <form onSubmit={event => { event.preventDefault(); onImport(path, 'nas'); }} className="nas-form"><label htmlFor="nas-path">共享文件夹路径</label><div className="input-with-icon"><Server size={17} /><input id="nas-path" placeholder="\\NAS\Movies" value={path} onChange={event => setPath(event.target.value)} required pattern="\\\\.+" /></div><p>输入 Windows 共享路径。请先在资源管理器中连接共享文件夹，并保存登录凭据。</p><button className="button-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spinning" /> : <Wifi size={16} />}{busy ? '正在连接并扫描…' : '连接并扫描'}</button></form>}{error && <p className="form-error" role="alert">{error}</p>}<div className="privacy-note"><ShieldCheck size={16} /><p>直接读取原文件，影片无需上传。已有的 NFO 和海报也会一并读取。</p></div></Modal>;
}

function SettingsModal({ settings, demo, onClose, onSave, onClearDemo }: { settings: Settings; demo: boolean; onClose: () => void; onSave: (next: Settings) => Promise<void>; onClearDemo: () => void }) {
  const [next, setNext] = useState(settings);
  const [tab, setTab] = useState('library');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  return <Modal label="设置" className="settings-modal" onClose={onClose}><div className="settings-nav"><h2>设置</h2>{[{ id: 'library', label: '影音库与刮削', icon: Clapperboard }, { id: 'playback', label: '播放设置', icon: Play }, { id: 'about', label: '关于 Luma', icon: CircleHelp }].map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={17} />{label}</button>)}</div><div className="settings-content"><h1>{tab === 'library' ? '影音库与刮削' : tab === 'playback' ? '播放设置' : '关于 Luma'}</h1>{tab === 'library' ? <><p>让每一部收藏，都有自己的封面。</p><label className="field-label" htmlFor="tmdb-token">TMDB API Key / 读取令牌</label><input id="tmdb-token" type="password" autoComplete="off" value={next.tmdbToken} placeholder="粘贴 API Key 或 API Read Access Token" onChange={event => setNext({ ...next, tmdbToken: event.target.value })} /><p className="field-help">支持 32 位 API Key 和读取访问令牌，用于匹配影片与下载海报。<a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">获取令牌<ArrowUpRight size={11} /></a></p><label className="field-label" htmlFor="metadata-language">资料语言</label><select id="metadata-language" value={next.metadataLanguage} onChange={event => setNext({ ...next, metadataLanguage: event.target.value })}><option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="en-US">English</option></select><label className="settings-check"><input type="checkbox" checked={next.autoScrape} onChange={e=>setNext({...next,autoScrape:e.target.checked})}/>导入后自动匹配影片资料</label><label className="settings-check"><input type="checkbox" checked={next.watchFolders} onChange={e=>setNext({...next,watchFolders:e.target.checked})}/>监视文件夹变化并刷新影音库</label><div className="settings-callout"><ShieldCheck size={17} /><p>本地 NFO 优先。在线匹配只发送片名，不上传视频。</p></div>{demo && <button className="text-button clear-demo" onClick={onClearDemo}>清空示例库，开始使用<ChevronRight size={14} /></button>}</> : tab === 'playback' ? <><p>按照你的习惯，享受每一场放映。</p><label className="field-label" htmlFor="player-engine">播放器</label><select id="player-engine" value={next.defaultPlayer} onChange={event => setNext({ ...next, defaultPlayer: event.target.value as Settings['defaultPlayer'] })}><option value="auto">自动选择（推荐，使用完整解码内核）</option><option value="native">优先内置播放器（不兼容时自动切换）</option><option value="mpv">Luma 影院（HEVC / MKV 等）</option></select>{next.defaultPlayer === 'mpv' && <><label className="field-label" htmlFor="mpv-path">mpv.exe 路径</label><input id="mpv-path" placeholder="留空使用随程序提供的 mpv" value={next.mpvPath} onChange={event => setNext({ ...next, mpvPath: event.target.value })} /><p className="field-help">支持 HEVC、MKV 和内封字幕。播放窗口内可直接切换音轨、字幕和速度。</p></>}<div className="settings-callout"><Subtitles size={18} /><p>内置播放器支持加载外挂 WebVTT 字幕。高级编解码与内封字幕请使用 mpv。</p></div></> : <div className="about-content"><img src="./luma.svg" width="64" height="64" alt="Luma" /><h2>Luma</h2><p>让收藏，成为影院。</p><small>Windows 桌面版 · 0.1.2</small><div>为本地硬盘和 NAS 打造的私人影音库。<br />影片始终留在你的设备上。</div><p className="tmdb-credit">This product uses the TMDB API but is not endorsed or certified by TMDB.</p><a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="tmdb-logo">THE MOVIE DB</a></div>}{error && <p className="form-error">{error}</p>}{tab !== 'about' && <div className="settings-footer"><button className="button-glass" onClick={onClose}>取消</button><button className="button-primary" disabled={saving} onClick={async () => { setSaving(true); try { await onSave(next); } catch { setError('设置保存失败，请检查本地存储权限。'); } finally { setSaving(false); } }}>{saving ? '保存中…' : '保存设置'}</button></div>}</div></Modal>;
}
