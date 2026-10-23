import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownWideNarrow, ArrowLeft, ArrowUpRight, Bookmark, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clapperboard, Clock3, Film, Folder, FolderOpen, Grid2X2, HardDrive, Heart, Home, List, LoaderCircle, Maximize, Minus, Monitor, MoreHorizontal, Pause, Play, Plus, RefreshCw, Search, Server, Settings2, ShieldCheck, SkipBack, SkipForward, Sparkles, Star, Subtitles, Tv, Volume2, VolumeX, Wifi, X, type LucideIcon } from 'lucide-react';
import type { Library, Media, Settings, Source } from './types';
import { demoLibrary } from './data';
import { defaultSettings, importBrowserFiles, loadLibrary, loadSettings, saveLibrary, saveSettings, searchMetadata } from './storage';

const duration = (minutes: number) => minutes ? `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} 小时 ` : ''}${minutes % 60} 分钟` : '时长未知';
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
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = container.current!;
    const focusables = () => Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, a[href], video[controls], [tabindex="0"]'));
    (focusables()[0] || el).focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const items = focusables(); const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    el.addEventListener('keydown', keydown);
    return () => { el.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-scrim" onMouseDown={event => event.target === event.currentTarget && onClose()}><div ref={container} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`modal ${className}`}><IconButton className="modal-close" label="关闭" onClick={onClose}><X size={19} /></IconButton>{children}</div></div>;
}

function PosterCard({ media, onClick, onFavorite, compact = false }: { media: Media; onClick: () => void; onFavorite: () => void; compact?: boolean }) {
  return <article className={`poster-card ${compact ? 'compact' : ''}`}>
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
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState('home');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('added');
  const [genre, setGenre] = useState('全部类型');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Media | null>(null);
  const [dialog, setDialog] = useState<'source' | 'settings' | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLElement>(null);

  useEffect(() => { Promise.all([loadLibrary(), loadSettings()]).then(([lib, prefs]) => { setLibrary(lib); setSettings(prefs); setReady(true); }).catch(() => { setError('无法读取已保存的影音库。请检查本地存储权限。'); setReady(true); }); }, []);
  useEffect(() => { if (ready) saveLibrary(library).catch(() => setToast('保存失败，请检查磁盘空间和文件权限。')); }, [library, ready]);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(''), 4200); return () => clearTimeout(timeout); }, [toast]);
  useEffect(() => { scroll.current?.scrollTo({ top: 0 }); }, [view, query]);
  useEffect(() => {
    function keydown(event: KeyboardEvent) { if ((event.ctrlKey || event.metaKey) && event.key === 'k') { event.preventDefault(); searchInput.current?.focus(); } }
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, []);

  function navigate(id: string) { setView(id); setQuery(''); setGenre('全部类型'); }
  function patchMedia(id: string, patch: Partial<Media>) { setLibrary(prev => ({ ...prev, media: prev.media.map(item => item.id === id ? { ...item, ...patch } : item) })); }
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
    if (library.demo) { setToast('当前为示例影音库，添加你的文件夹即可开始扫描。'); setDialog('source'); return; }
    if (!window.desktop) { setToast('网页预览需要重新选择文件夹，Windows 桌面版支持直接刷新。'); fileInput.current?.click(); return; }
    setBusy(true); let count = 0;
    try {
      for (const source of library.sources) {
        try {
          const result = await window.desktop.scanFolder(source.path, source.type);
          setLibrary(prev => {
            const existing = new Map(prev.media.map(item => [item.path, item]));
            const next = result.media.map(item => existing.get(item.path) ? { ...item, ...existing.get(item.path)! } : item);
            const nextPaths = new Set(next.map(item => item.path));
            return { ...prev, media: [...prev.media.filter(item => item.sourceId !== source.id || !nextPaths.has(item.path)), ...next], sources: prev.sources.map(item => item.id === source.id ? { ...item, status: 'online' } : item) };
          }); count += result.media.length;
        } catch { setLibrary(prev => ({ ...prev, sources: prev.sources.map(item => item.id === source.id ? { ...item, status: 'offline' } : item) })); }
      }
      setToast(`扫描完成，读取 ${count} 个文件。离线来源的资料已保留。`);
    } finally { setBusy(false); }
  }
  async function play(media: Media) {
    if (!library.demo && window.desktop && settings.defaultPlayer === 'mpv') { try { await window.desktop.playMpv(media); } catch (err) { setToast((err as Error).message); } return; }
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
      if (view === 'tv' && item.kind !== 'tv') return false;
      if (view === 'favorites' && !item.favorite) return false;
      if (view === 'unwatched' && (item.watched || item.progress)) return false;
      if (view.startsWith('source:') && item.sourceId !== view.slice(7)) return false;
      return true;
    }).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN') : sort === 'year' ? b.year - a.year : sort === 'rating' ? Number(b.rating) - Number(a.rating) : b.addedAt - a.addedAt);
  }, [library, query, view, genre, sort]);
  const pageTitle = query ? '搜索结果' : navItems.find(item => item.id === view)?.label || (view === 'folders' ? '文件来源' : library.sources.find(source => `source:${source.id}` === view)?.name || '影音库');
  const isHome = view === 'home' && !query;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><img src={localAsset('./luma.svg')} width="34" height="34" alt="" /><span>Luma<span className="brand-dot">.</span></span></div>
      <div className="sidebar-section-title">影音库</div>
      <nav aria-label="主导航">{navItems.map(({ id, label, icon: Icon }) => <button key={id} aria-label={label} className={`nav-item ${view === id && !query ? 'active' : ''}`} onClick={() => navigate(id)}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{id === 'favorites' && <span className="nav-count">{library.media.filter(item => item.favorite).length}</span>}</button>)}</nav>
      <div className="sidebar-section-title source-heading">文件来源<button aria-label="添加文件来源" onClick={() => { setError(''); setDialog('source'); }}><Plus size={14} /></button></div>
      <nav aria-label="文件来源">{library.sources.map(source => <button key={source.id} aria-label={source.name} className={`nav-item source-item ${view === `source:${source.id}` ? 'active' : ''}`} onClick={() => navigate(`source:${source.id}`)}>{source.type === 'nas' ? <Server size={17} /> : <HardDrive size={17} />}<span>{source.name}</span><i className={`status-dot ${source.status}`} /></button>)}<button aria-label="所有文件来源" className={`nav-item ${view === 'folders' ? 'active' : ''}`} onClick={() => navigate('folders')}><Folder size={17} /><span>所有文件来源</span></button></nav>
      <div className="sidebar-bottom"><div className="library-health"><span className="health-icon"><CheckCheck size={16} /></span><div><span>{library.demo ? '示例影音库' : '你的私人影音库'}</span><small>{library.media.length} 部影片 · {library.sources.length} 个来源</small></div><button aria-label="刷新影音库" onClick={rescan} disabled={busy}><RefreshCw size={13} className={busy ? 'spinning' : ''} /></button></div><button className="profile-row" onClick={() => setDialog('settings')}><span className="profile-avatar">L</span><span>我的空间<small>让收藏，成为影院</small></span><Settings2 size={17} /></button></div>
    </aside>

    <div className="main-shell">
      <div className="window-bar"><span>Luma</span><div><button aria-label="最小化窗口" onClick={() => window.desktop?.windowAction('minimize')}><Minus size={13} /></button><button aria-label="最大化窗口" onClick={() => window.desktop?.windowAction('maximize')}><span className="maximize-icon" /></button><button aria-label="关闭窗口" className="window-close" onClick={() => window.desktop?.windowAction('close')}><X size={14} /></button></div></div>
      <header className="toolbar"><div className="toolbar-location"><IconButton label="返回首页" onClick={() => navigate('home')} disabled={isHome}><ChevronLeft size={21} /></IconButton><span>{pageTitle}</span>{library.demo && <span className="demo-indicator">示例</span>}</div><div className="toolbar-actions"><label className="search-box"><Search size={16} /><input ref={searchInput} aria-label="搜索影音库" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索你的影音库" />{query ? <button aria-label="清除搜索" onClick={() => setQuery('')}><X size={13} /></button> : <kbd>Ctrl K</kbd>}</label><IconButton label="刷新影音库" onClick={rescan} disabled={busy}><RefreshCw size={17} className={busy ? 'spinning' : ''} /></IconButton><span className="toolbar-divider" /><button className="add-button" onClick={() => { setError(''); setDialog('source'); }}><Plus size={17} /><span>添加影片</span></button></div></header>

      <main className="main-scroll" ref={scroll}>
        {isHome && hero && <section className="hero" aria-label="精选影片"><div className="hero-image"><Artwork key={hero.id} media={hero} backdrop /></div><div className="hero-vignette" /><div className="hero-content"><span className="hero-eyebrow"><Sparkles size={13} /> 值得重温的好故事</span><span className="hero-original">{hero.originalTitle}</span><h1>{hero.title}</h1><div className="hero-meta"><span>{hero.year}</span><span>{hero.genre.join(' / ')}</span><span>{duration(hero.duration)}</span></div><div className="hero-badges"><span className="score"><Star size={13} fill="currentColor" /> {hero.rating}</span><span className="technical-badge">4K</span><span className="technical-badge hdr">HDR</span><span className="technical-badge">Dolby Atmos</span></div><p>{hero.description}</p><div className="hero-buttons"><button className="button-primary play-button" onClick={() => play(hero)}><Play size={17} fill="currentColor" />{hero.progress ? '继续播放' : '立即播放'}</button><button className="button-glass" onClick={() => setSelected(hero.id)}>影片详情<ArrowUpRight size={15} /></button><IconButton label={hero.favorite ? '取消收藏精选影片' : '收藏精选影片'} className={`hero-heart ${hero.favorite ? 'favorite' : ''}`} onClick={() => toggleFavorite(hero)}><Heart size={18} fill={hero.favorite ? 'currentColor' : 'none'} /></IconButton></div></div><div className="hero-bottom"><span className="hero-source"><Server size={12} />{library.sources.find(source => source.id === hero.sourceId)?.name || '影音库'}</span><div className="hero-pagination">{heroCandidates.map((item, index) => <button key={item.id} className={index === heroIndex ? 'active' : ''} aria-label={`精选影片 ${item.title}`} onClick={() => setHeroIndex(index)} />)}<span>0{heroIndex + 1}<i> / 0{heroCandidates.length}</i></span></div></div></section>}

        {isHome && continueWatching.length > 0 && <section className="content-section watching-section"><div className="section-heading"><h2>继续观看<span>好故事，接着看</span></h2><button className="text-button" onClick={() => { navigate('recent'); }}>查看全部<ChevronRight size={14} /></button></div><div className="continue-grid">{continueWatching.map(media => <article className="continue-card" key={media.id}><button className="continue-art" onClick={() => play(media)} aria-label={`继续播放 ${media.title}`}><Artwork media={media} backdrop /><span className="continue-shade" /><span className="continue-play"><Play size={18} fill="currentColor" /></span><span className="continue-remaining">{media.kind === 'tv' ? media.episode : `剩余 ${Math.ceil(media.duration * (1 - media.progress!))} 分钟`}</span><span className="continue-progress"><i style={{ width: `${media.progress! * 100}%` }} /></span></button><div className="continue-caption"><button onClick={() => setSelected(media.id)}>{media.title}</button><span>{media.kind === 'tv' ? '电视剧' : `${media.year} · 电影`}</span></div></article>)}</div></section>}

        {view === 'folders' && !query ? <section className="content-section collection-section"><div className="collection-heading"><div><span className="page-eyebrow">YOUR CONNECTIONS</span><h1>文件来源</h1><p>把散落各处的收藏，放进同一间影院。</p></div><button className="button-primary" onClick={() => { setError(''); setDialog('source'); }}><Plus size={16} />添加来源</button></div><div className="sources-grid">{library.sources.map(source => <button className="source-card" key={source.id} onClick={() => navigate(`source:${source.id}`)}><span className={`source-card-icon ${source.type}`}>{source.type === 'nas' ? <Server size={29} /> : <HardDrive size={29} />}</span><i className={`status-dot ${source.status}`} /><h3>{source.name}</h3><p>{source.path}</p><div><span>{library.media.filter(item => item.sourceId === source.id).length} 部影片</span><span>{source.status === 'online' ? '已连接' : '离线 · 已保留资料'}<ChevronRight size={14} /></span></div></button>)}<button className="source-card add-source-card" onClick={() => { setError(''); setDialog('source'); }}><Plus size={26} /><span>添加本地或 NAS 文件夹</span></button></div><div className="source-note"><ShieldCheck size={18} /><p>影片留在原来的位置。Luma 只整理资料，播放时直接读取文件。</p></div></section> : <section className={`content-section ${isHome ? 'recent-section' : 'collection-section'}`}><div className={isHome ? 'section-heading' : 'collection-heading'}>{isHome ? <h2>最近添加<span>新加入你的影院</span></h2> : <div><span className="page-eyebrow">{query ? 'FIND YOUR NEXT STORY' : 'YOUR PERSONAL COLLECTION'}</span><h1>{pageTitle}</h1><p>{query ? `“${query}” · 找到 ${visibleMedia.length} 部影片` : `${visibleMedia.length} 部影片，随时准备好下一场放映。`}</p></div>}{isHome ? <button className="text-button" onClick={() => navigate('movies')}>浏览影音库<ChevronRight size={14} /></button> : <div className="view-switch"><IconButton label="海报视图" className={layout === 'grid' ? 'selected' : ''} onClick={() => setLayout('grid')}><Grid2X2 size={17} /></IconButton><IconButton label="列表视图" className={layout === 'list' ? 'selected' : ''} onClick={() => setLayout('list')}><List size={18} /></IconButton></div>}</div>
        {!isHome && <div className="collection-filters"><div className="filter-pills">{['全部类型', ...genres.filter(item => item !== '全部类型').slice(0, 5)].map(item => <button key={item} onClick={() => setGenre(item)} className={genre === item ? 'selected' : ''}>{item}</button>)}</div><label className="sort-select"><ArrowDownWideNarrow size={14} /><select aria-label="影片排序" value={sort} onChange={event => setSort(event.target.value)}><option value="added">按添加时间</option><option value="title">按影片名称</option><option value="year">按上映年份</option><option value="rating">按评分高低</option></select><ChevronDown size={13} /></label></div>}
        {visibleMedia.length === 0 ? <div className="empty-state">{query ? <Search size={40} strokeWidth={1} /> : view === 'favorites' ? <Heart size={40} strokeWidth={1} /> : <Film size={40} strokeWidth={1} />}<h3>{query ? '还没找到这个故事' : view === 'favorites' ? '把喜欢的故事留在这里' : '你的影院，等你开场'}</h3><p>{query ? '试试影片原名、中文名或上映年份。' : view === 'favorites' ? '点击影片上的爱心，就能随时在这里找到它。' : '添加本地文件夹或 NAS，共同组成你的私人影音库。'}</p><button className="button-glass" onClick={() => query ? setQuery('') : setDialog('source')}>{query ? '清除搜索' : '添加文件来源'}</button></div> : !isHome && layout === 'list' ? <div className="media-list">{visibleMedia.map(media => <button className="media-list-row" onClick={() => setSelected(media.id)} key={media.id}><Artwork media={media} /><div><strong>{media.title}</strong><span>{media.originalTitle}</span></div><span>{media.year || '—'}</span><span>{media.genre.join(' / ') || '待匹配'}</span><span className="list-quality">{media.quality}</span><span className="list-rating"><Star size={12} />{media.rating || '—'}</span><ChevronRight size={16} /></button>)}</div> : <div className="poster-grid">{(isHome ? visibleMedia.filter(item => item.kind === 'movie').slice(0, 6) : visibleMedia).map(media => <PosterCard key={media.id} media={media} onClick={() => setSelected(media.id)} onFavorite={() => toggleFavorite(media)} />)}</div>}
        </section>}
        <footer className="content-footer"><span><i className="status-dot online" />{library.demo ? '正在浏览示例影音库' : '所有美好，都在你的收藏里'}</span><span>{library.media.length} 部影片<span className="footer-dot">·</span>本地与 NAS 直读</span></footer>
      </main>
    </div>

    <input ref={fileInput} type="file" className="hidden" aria-label="导入视频文件夹" multiple {...({ webkitdirectory: '', directory: '' } as object)} onChange={event => { if (event.target.files?.length) { const imported = importBrowserFiles(event.target.files); if (imported.media.length) mergeImport(imported); else setError('这个文件夹中没有找到支持的视频文件。'); } event.target.value = ''; }} />
    {error && !dialog && <div className="error-toast" role="alert">{error}<button onClick={() => setError('')} aria-label="关闭错误"><X size={15} /></button></div>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={16} />{toast}</div>}
    {activeMedia && !playing && <DetailModal media={activeMedia} source={library.sources.find(item => item.id === activeMedia.sourceId)} settings={settings} onClose={() => setSelected(null)} onPlay={() => play(activeMedia)} onFavorite={() => toggleFavorite(activeMedia)} onUpdate={patch => patchMedia(activeMedia.id, patch)} onToast={setToast} onSettings={() => setDialog('settings')} />}
    {dialog === 'source' && <SourceModal onClose={() => setDialog(null)} onImport={importFolder} busy={busy} error={error} />}
    {dialog === 'settings' && <SettingsModal settings={settings} demo={library.demo} onClose={() => setDialog(null)} onSave={async next => { await saveSettings(next); setSettings(next); setToast('设置已保存'); setDialog(null); }} onClearDemo={() => { setLibrary({ demo: false, media: [], sources: [] }); setDialog(null); navigate('home'); setToast('已准备好，添加你的第一个文件夹吧。'); }} />}
    {playing && <PlayerModal media={playing} demo={library.demo} onClose={() => setPlaying(null)} onProgress={(progress, minutes) => patchMedia(playing.id, { progress, ...(minutes ? { duration: minutes } : {}), ...(progress > 0.96 ? { watched: true } : {}) })} />}
  </div>;
}

function DetailModal({ media, source, settings, onClose, onPlay, onFavorite, onUpdate, onToast, onSettings }: { media: Media; source?: Source; settings: Settings; onClose: () => void; onPlay: () => void; onFavorite: () => void; onUpdate: (patch: Partial<Media>) => void; onToast: (text: string) => void; onSettings: () => void }) {
  const [matching, setMatching] = useState(false);
  const [query, setQuery] = useState(media.title);
  const [kind, setKind] = useState(media.kind);
  const [results, setResults] = useState<Media[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function search(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { setResults(await searchMetadata(media, query, kind, settings)); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }
  return <Modal label={`${media.title} 影片详情`} className="detail-modal" onClose={onClose}><div className="detail-backdrop"><Artwork media={media} backdrop /><div /></div><div className="detail-main"><div className="detail-poster"><Artwork media={media} /></div><div className="detail-info"><span className="detail-original">{media.originalTitle}</span><h1>{media.title}</h1><div className="detail-meta"><span>{media.year || '年份未知'}</span><span>{duration(media.duration)}</span><span>{media.genre.join(' / ') || '待匹配'}</span></div><div className="detail-badges">{media.rating && <span className="score"><Star size={14} fill="currentColor" /> {media.rating}</span>}<span className="technical-badge">{media.quality}</span>{media.quality.includes('HDR') && <span className="technical-badge">HDR10</span>}<span className="technical-badge">{media.certification || '未分级'}</span></div><div className="detail-actions"><button className="button-primary" onClick={onPlay}><Play size={16} fill="currentColor" />{media.progress ? `继续播放 · ${time(media.duration * 60 * media.progress)}` : '立即播放'}</button><IconButton label={media.favorite ? '取消收藏' : '收藏影片'} className={`button-glass ${media.favorite ? 'favorite' : ''}`} onClick={onFavorite}><Heart size={18} fill={media.favorite ? 'currentColor' : 'none'} /></IconButton><IconButton label={media.watched ? '标记为未观看' : '标记为已观看'} className={`button-glass ${media.watched ? 'favorite' : ''}`} onClick={() => onUpdate({ watched: !media.watched, progress: 0 })}><Check size={19} /></IconButton><IconButton label="重新匹配影片资料" className="button-glass" onClick={() => setMatching(!matching)}><MoreHorizontal size={19} /></IconButton></div></div></div><div className="detail-body"><div className="detail-description"><h2>故事简介</h2><p>{media.description || '暂无影片简介，可以手动匹配影片资料。'}</p></div><div className="detail-side-info"><div><span>导演</span><strong>{media.director || '暂无资料'}</strong></div><div><span>文件来源</span><strong>{source?.name || '本地影片'}</strong></div><button className="text-button" onClick={() => setMatching(!matching)}><RefreshCw size={13} />重新匹配资料</button></div></div>{media.cast && <div className="cast-section"><h2>演职人员</h2><div className="cast-list">{media.cast.map((name, index) => <div key={name}><span className={`cast-avatar cast-${index}`}><span>{name.replace('·', '').slice(0, 1)}</span></span><strong>{name}</strong><small>主演</small></div>)}</div></div>}{matching && <section className="match-section"><h2>匹配影片资料</h2><p>使用 TMDB 搜索并更正海报、片名、简介和评分。</p><form className="match-form" onSubmit={search}><input aria-label="影片匹配名称" value={query} onChange={event => setQuery(event.target.value)} required /><select aria-label="匹配影片类型" value={kind} onChange={event => setKind(event.target.value as Media['kind'])}><option value="movie">电影</option><option value="tv">电视剧</option></select><button className="button-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spinning" /> : <Search size={16} />}搜索</button></form>{error && <p className="form-error">{error}{!settings.tmdbToken && <button onClick={onSettings}>前往设置</button>}</p>}{results?.length === 0 && <p>未找到匹配结果，请尝试原名或减少关键词。</p>}<div className="match-results">{results?.map(item => <button key={item.tmdbId} onClick={() => { onUpdate(item); setMatching(false); onToast('影片资料已更新'); }}><Artwork media={item} /><span><strong>{item.title}</strong><small>{item.year} · {item.originalTitle}</small></span><Check size={17} /></button>)}</div></section>}<div className="detail-file"><FolderOpen size={14} /><span>{media.path || `${source?.path || 'D:\\Movies'}\\${media.originalTitle}.${media.year}.2160p.mkv`}</span>{media.path && window.desktop && <button onClick={() => window.desktop?.revealFile(media.path!)}>在文件夹中显示<ArrowUpRight size={12} /></button>}</div></Modal>;
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
  return <Modal label="设置" className="settings-modal" onClose={onClose}><div className="settings-nav"><h2>设置</h2>{[{ id: 'library', label: '影音库与刮削', icon: Clapperboard }, { id: 'playback', label: '播放设置', icon: Play }, { id: 'about', label: '关于 Luma', icon: CircleHelp }].map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={17} />{label}</button>)}</div><div className="settings-content"><h1>{tab === 'library' ? '影音库与刮削' : tab === 'playback' ? '播放设置' : '关于 Luma'}</h1>{tab === 'library' ? <><p>让每一部收藏，都有自己的封面。</p><label className="field-label" htmlFor="tmdb-token">TMDB Read Access Token</label><input id="tmdb-token" type="password" autoComplete="off" value={next.tmdbToken} placeholder="填写 API 读取访问令牌" onChange={event => setNext({ ...next, tmdbToken: event.target.value })} /><p className="field-help">用于搜索影片资料和获取海报。<a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">获取令牌<ArrowUpRight size={11} /></a></p><label className="field-label" htmlFor="metadata-language">资料语言</label><select id="metadata-language" value={next.metadataLanguage} onChange={event => setNext({ ...next, metadataLanguage: event.target.value })}><option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="en-US">English</option></select><div className="settings-callout"><ShieldCheck size={17} /><p>本地 NFO 优先。在线匹配只发送片名，不上传视频。</p></div>{demo && <button className="text-button clear-demo" onClick={onClearDemo}>清空示例库，开始使用<ChevronRight size={14} /></button>}</> : tab === 'playback' ? <><p>按照你的习惯，享受每一场放映。</p><label className="field-label" htmlFor="player-engine">播放器</label><select id="player-engine" value={next.defaultPlayer} onChange={event => setNext({ ...next, defaultPlayer: event.target.value as Settings['defaultPlayer'] })}><option value="native">内置播放器（MP4 / WebM 等浏览器支持的格式）</option><option value="mpv">外部 mpv（MKV / HEVC 等更多格式）</option></select>{next.defaultPlayer === 'mpv' && <><label className="field-label" htmlFor="mpv-path">mpv.exe 路径</label><input id="mpv-path" placeholder="例如 C:\Program Files\mpv\mpv.exe" value={next.mpvPath} onChange={event => setNext({ ...next, mpvPath: event.target.value })} /><p className="field-help">需要 Windows 桌面版；影片将在外部 mpv 窗口播放。</p></>}<div className="settings-callout"><Subtitles size={18} /><p>内置播放器支持加载外挂 WebVTT 字幕。高级编解码与内封字幕请使用 mpv。</p></div></> : <div className="about-content"><img src="./luma.svg" width="64" height="64" alt="Luma" /><h2>Luma</h2><p>让收藏，成为影院。</p><small>Windows 界面预览 · 0.1.0</small><div>为本地硬盘和 NAS 打造的私人影音库。<br />影片始终留在你的设备上。</div><p className="tmdb-credit">This product uses the TMDB API but is not endorsed or certified by TMDB.</p><a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="tmdb-logo">THE MOVIE DB</a></div>}{error && <p className="form-error">{error}</p>}{tab !== 'about' && <div className="settings-footer"><button className="button-glass" onClick={onClose}>取消</button><button className="button-primary" disabled={saving} onClick={async () => { setSaving(true); try { await onSave(next); } catch { setError('设置保存失败，请检查本地存储权限。'); } finally { setSaving(false); } }}>{saving ? '保存中…' : '保存设置'}</button></div>}</div></Modal>;
}

function PlayerModal({ media, demo, onClose, onProgress }: { media: Media; demo: boolean; onClose: () => void; onProgress: (progress: number, minutes: number) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const subtitlePicker = useRef<HTMLInputElement>(null);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [length, setLength] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [speed, setSpeed] = useState('1');
  const [error, setError] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [controlsVisible, setControlsVisible] = useState(true);
  const lastSave = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const controlsHovered = useRef(false);
  const src = demo ? localAsset('./demo.mp4') : media.videoUrl || (media.path ? `luma-media://local/${encodeURIComponent(media.path)}` : '');
  function showControls() { clearTimeout(hideTimer.current); setControlsVisible(true); if (!paused && !error && !controlsHovered.current) hideTimer.current = setTimeout(() => setControlsVisible(false), 3000); }
  useEffect(() => { showControls(); return () => clearTimeout(hideTimer.current); }, [paused, error]);
  useEffect(() => { container.current?.focus(); }, []);
  useEffect(() => { const player = video.current; return () => { if (!demo && player && player.duration && Number.isFinite(player.duration)) onProgress(player.currentTime / player.duration, Math.round(player.duration / 60)); }; }, []);
  useEffect(() => () => { if (subtitle) URL.revokeObjectURL(subtitle); }, [subtitle]);
  function toggle() { if (!video.current) return; if (video.current.paused) video.current.play().catch(() => setError('播放失败。该编码可能需要使用外部 mpv 播放。')); else video.current.pause(); }
  function fullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else container.current?.requestFullscreen(); }
  return <div className={`player-overlay ${controlsVisible || paused || error ? 'show-controls' : ''}`} role="dialog" aria-modal="true" aria-label={`播放 ${media.title}`} ref={container} tabIndex={0} onMouseMove={showControls} onKeyDown={event => { if (event.key === 'Escape') onClose(); if ((event.target as HTMLElement).tagName === 'SELECT' || (event.target as HTMLElement).tagName === 'INPUT') return; if (event.key === ' ') { event.preventDefault(); toggle(); } if (event.key === 'ArrowRight' && video.current) video.current.currentTime += 10; if (event.key === 'ArrowLeft' && video.current) video.current.currentTime -= 10; }}><video ref={video} src={src} autoPlay playsInline onClick={toggle} onDoubleClick={fullscreen} onPlay={() => setPaused(false)} onPause={() => setPaused(true)} onError={() => setError('当前文件无法在内置播放器中解码。可在设置中选择外部 mpv 播放 MKV、HEVC 等格式。')} onLoadedMetadata={() => { const player = video.current!; setLength(player.duration); player.volume = volume; if (!demo && media.progress && media.progress < 0.96) player.currentTime = player.duration * media.progress; }} onTimeUpdate={() => { const player = video.current!; setElapsed(player.currentTime); if (!demo && player.duration && Date.now() - lastSave.current > 5000) { lastSave.current = Date.now(); onProgress(player.currentTime / player.duration, Math.round(player.duration / 60)); } }} onEnded={() => { setPaused(true); setControlsVisible(true); if (!demo) onProgress(1, Math.round(length / 60)); }}>{subtitle && <track kind="subtitles" src={subtitle} srcLang="zh" label="外挂字幕" default />}</video><div className="player-top"><IconButton label="关闭播放器" onClick={onClose}><ChevronLeft size={25} /></IconButton><div><strong>{media.title}</strong><span>{demo ? '界面预览 · Big Buck Bunny 演示片段' : media.originalTitle}</span></div><span className="technical-badge">{demo ? 'DEMO' : media.quality}</span></div>{error ? <div className="player-error"><Film size={42} strokeWidth={1} /><h2>换一种方式，继续欣赏</h2><p>{error}</p><button className="button-primary" onClick={onClose}>返回影音库</button></div> : paused && <button className="player-center" aria-label="继续播放" onClick={toggle}><Play size={40} fill="currentColor" /></button>}<div className="player-bottom" onMouseEnter={() => { controlsHovered.current = true; showControls(); }} onMouseLeave={() => { controlsHovered.current = false; showControls(); }}><div className="player-time"><span>{time(elapsed)}</span><input aria-label="播放进度" type="range" min="0" max={length || 1} step="0.1" value={elapsed} onChange={event => { if (video.current) video.current.currentTime = Number(event.target.value); setElapsed(Number(event.target.value)); }} /><span>−{time(Math.max(length - elapsed, 0))}</span></div><div className="player-controls"><div className="player-volume"><IconButton label={volume ? '静音' : '取消静音'} onClick={() => { const next = volume ? 0 : 0.8; setVolume(next); if (video.current) video.current.volume = next; }}>{volume ? <Volume2 size={20} /> : <VolumeX size={20} />}</IconButton><input aria-label="音量" type="range" min="0" max="1" step="0.01" value={volume} onChange={event => { setVolume(Number(event.target.value)); if (video.current) video.current.volume = Number(event.target.value); }} /></div><div className="player-transport"><IconButton label="后退 10 秒" onClick={() => { if (video.current) video.current.currentTime -= 10; }}><SkipBack size={22} /></IconButton><IconButton className="player-toggle" label={paused ? '播放' : '暂停'} onClick={toggle}>{paused ? <Play size={28} fill="currentColor" /> : <Pause size={28} fill="currentColor" />}</IconButton><IconButton label="前进 10 秒" onClick={() => { if (video.current) video.current.currentTime += 10; }}><SkipForward size={22} /></IconButton></div><div className="player-options"><select aria-label="播放速度" value={speed} onChange={event => { setSpeed(event.target.value); if (video.current) video.current.playbackRate = Number(event.target.value); }}><option value="0.75">0.75×</option><option value="1">1.0×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2.0×</option></select><IconButton label="加载 VTT 字幕" onClick={() => subtitlePicker.current?.click()}><Subtitles size={21} /></IconButton><IconButton label="全屏" onClick={fullscreen}><Maximize size={19} /></IconButton></div></div></div><input className="hidden" ref={subtitlePicker} type="file" accept=".vtt" aria-label="选择 VTT 字幕" onChange={event => { const file = event.target.files?.[0]; if (file) setSubtitle(URL.createObjectURL(file)); }} /></div>;
}
