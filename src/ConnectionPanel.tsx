import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ChevronRight,Cloud,Folder,FolderOpen,HardDrive,LoaderCircle,LogIn,LogOut,Plus,Server,ShieldCheck,Wifi} from 'lucide-react';
import type {CloudAccount,CloudPage,CloudProgress,CloudProvider} from './types';
const providers:{id:CloudProvider;name:string;mark:string;description:string}[]=[{id:'115',name:'115 网盘',mark:'115',description:'登录官方授权页，连接你的影视收藏'},{id:'baidu',name:'百度网盘',mark:'百度',description:'通过官方授权连接个人网盘'},{id:'quark',name:'夸克网盘',mark:'夸克',description:'在官方网盘窗口扫码或登录'}];
const emptyPage:CloudPage={entries:[],total:0,page:1,nextPage:null};
export function ConnectionPanel({onLocal,busy:outerBusy,error:outerError,onAdded,onBackReady}:{onLocal:()=>void;busy:boolean;error:string;onAdded:(count:number,background?:boolean)=>void;onBackReady:(handler:()=>boolean)=>void}){
  const [tab,setTab]=useState<'local'|'nas'|'cloud'>('local'),[path,setPath]=useState(''),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[remember,setRemember]=useState(false),[accounts,setAccounts]=useState<CloudAccount[]>([]),[account,setAccount]=useState<CloudAccount|null>(null),[folder,setFolder]=useState('/'),[listing,setListing]=useState<CloudPage>(emptyPage),[loading,setLoading]=useState(false),[importing,setImporting]=useState(false),[progress,setProgress]=useState<CloudProgress|null>(null),[authenticating,setAuthenticating]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
  const alive=useRef(true),request=useRef(0),operation=useRef<{id:string;folder:string}|null>(null),busy=loading||outerBusy;
  function stopRead(){const active=operation.current;operation.current=null;if(active)void window.desktop?.cancelCloudRead(active.id,active.folder).catch(()=>{});}
  function cancelRead(){request.current++;stopRead();setLoading(false);setImporting(false);setProgress(null);setError('已取消读取，已有片库和观影进度已保留。');}
  function background(){operation.current=null;onAdded(progress?.files||0,true);}
  useEffect(()=>{
    alive.current=true;void window.desktop?.cloudAccounts().then(setAccounts).catch(()=>{});
    const off=window.desktop?.onCloudProgress(next=>{const active=operation.current;if(alive.current&&active?.id===next.accountId&&active.folder===next.folder)setProgress(next);});
    return()=>{alive.current=false;request.current++;stopRead();off?.();void window.desktop?.cancelCloudLogin();};
  },[]);
  async function browse(a:CloudAccount,p:string,page=1){
    stopRead();const ticket=++request.current;operation.current={id:a.id,folder:p};setAccount(a);setFolder(p);setListing({...emptyPage,page});setLoaded(false);setProgress(null);setLoading(true);setError('');
    try{const data=await window.desktop!.cloudList(a.id,p,page);if(alive.current&&ticket===request.current){setListing(data);setLoaded(true);}}
    catch(e){if(alive.current&&ticket===request.current)setError((e as Error).message);}
    finally{if(alive.current&&ticket===request.current){setLoading(false);operation.current=null;}}
  }
  function back(){
    if(authenticating){void window.desktop?.cancelCloudLogin();return true;}
    if(loading&&operation.current){cancelRead();return true;}
    if(account){if(folder!=='/')void browse(account,folder.slice(0,folder.lastIndexOf('/'))||'/');else{request.current++;setAccount(null);setListing(emptyPage);setLoading(false);}return true;}
    return false;
  }
  useEffect(()=>onBackReady(back),[account,folder,authenticating,loading]);
  async function login(provider:CloudProvider,id?:string){
    if(!window.desktop){setError('网盘登录需要 Windows 桌面版。');return;}setAuthenticating(true);setError('');
    try{const a=await window.desktop.cloudLogin(provider,id);if(!alive.current)return;setAccounts(await window.desktop.cloudAccounts());await browse(a,'/');}
    catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setAuthenticating(false);}
  }
  async function add(){
    if(!account||!window.desktop)return;const ticket=++request.current;operation.current={id:account.id,folder};setLoading(true);setImporting(true);setProgress(null);setError('');
    try{const result=await window.desktop.addCloudFolder(account.id,folder);if(alive.current&&ticket===request.current)onAdded(result.media.length);}
    catch(e){if(alive.current&&ticket===request.current)setError((e as Error).message);}
    finally{if(alive.current&&ticket===request.current){setLoading(false);setImporting(false);operation.current=null;}}
  }
  async function smb(e:FormEvent){e.preventDefault();if(!window.desktop){setError('SMB 连接需要 Windows 桌面版。');return;}setLoading(true);setError('');try{const result=await window.desktop.connectSmb({path,username,password,remember});setPassword('');if(alive.current)onAdded(result.media.length);}catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setLoading(false);}}
  function switchTab(next:typeof tab){if(busy||authenticating)return;setTab(next);setError('');setAccount(null);}
  return <><span className="modal-illustration"><FolderOpen size={31} strokeWidth={1.5}/><i><Plus size={12}/></i></span><h1>让好故事，住进来。</h1><p className="modal-intro">连接硬盘、局域网共享或你的网盘。</p>
    <div className="segmented-control connection-tabs"><button className={tab==='local'?'active':''} onClick={()=>switchTab('local')}><HardDrive size={15}/>本地文件夹</button><button className={tab==='nas'?'active':''} onClick={()=>switchTab('nas')}><Server size={15}/>NAS / SMB</button><button className={tab==='cloud'?'active':''} onClick={()=>switchTab('cloud')}><Cloud size={15}/>网盘</button></div>
    {tab==='local'?<button className="folder-dropzone" onClick={onLocal} disabled={busy}>{busy?<LoaderCircle size={34} className="spinning"/>:<FolderOpen size={35} strokeWidth={1.25}/>}<strong>{busy?'正在整理你的影片…':'选择影片所在的文件夹'}</strong><span>自动扫描文件夹内的电影和电视剧</span><span className="folder-types">MKV · MP4 · MOV · AVI · WEBM</span></button>:tab==='nas'?<form className="nas-form smb-form" onSubmit={smb}>
      <label htmlFor="nas-path">共享文件夹路径</label><div className="input-with-icon"><Server size={17}/><input id="nas-path" placeholder="\\NAS\Movies 或 smb://NAS/Movies" value={path} onChange={e=>setPath(e.target.value)} required disabled={busy}/></div>
      <div className="smb-fields"><label>用户名<input aria-label="SMB 用户名" autoComplete="off" value={username} onChange={e=>setUsername(e.target.value)} placeholder="留空使用 Windows 当前连接" disabled={busy}/></label><label>密码<input aria-label="SMB 密码" type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label></div>
      <label className="connection-check"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} disabled={busy}/>在这台电脑加密记住登录信息</label><p>支持 Windows 共享路径与 smb:// 地址。已连接的共享可以直接访问。</p><button className="button-primary" disabled={busy}>{busy?<LoaderCircle size={16} className="spinning"/>:<Wifi size={16}/>} {busy?'正在连接并扫描…':'连接并扫描'}</button>
    </form>:<section className="cloud-connect" aria-label="网盘连接">
      {account?<>
        <div className="cloud-folder-heading"><button aria-label="返回上级网盘目录" onClick={back}><ArrowLeft size={16}/></button><div><strong>{account.label}</strong><small title={folder}>{folder}</small></div></div>
        <div className="cloud-directory" aria-busy={loading}>
          {loading?<div className="cloud-read-status" role="status"><LoaderCircle size={18} className="spinning"/><strong>{importing?'正在扫描影视目录…':'正在读取目录…'}</strong><small>{importing&&progress?`已发现 ${progress.files} 个影视文件 · 已读取 ${progress.folders} 个目录`:'首次读取大目录可能需要一些时间，可随时取消。'}</small>{importing&&<button onClick={background}>返回片库，继续后台扫描</button>}<button onClick={cancelRead}>取消读取</button></div>:<>
            {listing.entries.filter(e=>e.isDirectory).map(e=><button key={e.path} onClick={()=>void browse(account,e.path)}><Folder size={18}/><span>{e.name}</span><ChevronRight size={15}/></button>)}
            {!listing.entries.some(e=>e.isDirectory)&&<p>{error?'目录尚未读完，可重新读取':'此页没有子文件夹'}</p>}
            {loaded&&<small>目录共 {listing.total} 项 · 本页 {listing.entries.filter(e=>!e.isDirectory).length} 个文件。加入后扫描整个目录及其子目录。</small>}
          </>}
        </div>
        {!loading&&loaded&&<nav className="cloud-pagination" aria-label="网盘目录分页"><button disabled={listing.page===1} onClick={()=>void browse(account,folder,listing.page-1)}>上一页</button><span>第 {listing.page} / {Math.max(1,Math.ceil(listing.total/200))} 页</span><button disabled={!listing.nextPage} onClick={()=>void browse(account,folder,listing.nextPage!)}>下一页</button></nav>}
        {!loading&&!loaded&&<button className="cloud-retry" onClick={()=>void browse(account,folder)}>重新读取目录</button>}
        <button className="button-primary cloud-add" onClick={()=>void add()} disabled={busy||!loaded}><Plus size={15}/>{importing?'正在扫描…':'将此目录加入影音库'}</button>
        <p className="connection-help">先整理目录与文件名，播放时再读取视频，避免逐部探测拖慢导入。</p>
      </>:<>
        <div className="cloud-providers">{providers.map(p=><button key={p.id} className={'cloud-provider provider-'+p.id} disabled={authenticating||busy||!window.desktop} onClick={()=>void login(p.id)}><span>{p.mark}</span><div><strong>{p.name}</strong><small>{p.description}</small></div><LogIn size={17}/></button>)}</div>
        {authenticating&&<div className="cloud-auth-wait"><LoaderCircle size={16} className="spinning"/><span>请在登录窗口中完成授权</span><button onClick={()=>void window.desktop?.cancelCloudLogin()}>取消</button></div>}
        {accounts.length>0&&<div className="cloud-accounts"><h2>已连接的网盘</h2>{accounts.map(a=><article key={a.id}><button onClick={()=>void browse(a,'/')} disabled={authenticating||busy||a.connected===false}><Cloud size={17}/><span>{a.label}{a.connected===false?' · 已退出':''}</span><ChevronRight size={15}/></button><button title="重新登录此账号" aria-label={`重新登录 ${a.label}`} disabled={authenticating||busy} onClick={()=>void login(a.provider,a.id)}><LogIn size={15}/></button><button title="退出网盘，保留片库资料" aria-label={`退出 ${a.label}`} disabled={authenticating||busy} onClick={async()=>{try{await window.desktop!.cloudLogout(a.id);setAccounts(await window.desktop!.cloudAccounts());}catch(e){setError((e as Error).message);}}}><LogOut size={15}/></button></article>)}</div>}
        {!window.desktop&&<p className="connection-help">网盘登录与播放需要 Windows 桌面版。</p>}
      </>}
    </section>}
    {(error||outerError)&&<p className="form-error" role="alert">{error||outerError}</p>}<div className="privacy-note"><ShieldCheck size={16}/><p>{tab==='cloud'?'通过授权访问你的网盘，登录信息在本机加密保存。原文件保留在网盘中。':'直接读取原文件，影片无需上传。已有的 NFO 和海报也会一并读取。'}</p></div>
  </>;
}
