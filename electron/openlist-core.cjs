const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net');
const {spawn,execFile}=require('node:child_process');
const {runtimeFile}=require('./runtime-file.cjs');
const runFile=(file,args)=>new Promise((resolve,reject)=>execFile(file,args,{windowsHide:true,timeout:10000,maxBuffer:1024*1024,encoding:'utf8'},(e,out)=>e?reject(e):resolve(out)));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function binary(){const roots=[process.resourcesPath,path.join(__dirname,'..')].filter(Boolean);return roots.map(p=>path.join(p,'tools/openlist/openlist.exe')).find(p=>require('node:fs').existsSync(p));}
async function freePort(){const server=net.createServer();await new Promise((r,j)=>server.once('error',j).listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}
class OpenListCore{
  constructor({directory,vault,executable=binary(),fetcher=fetch}){Object.assign(this,{directory,vault,executable,fetcher});this.mounts=new Map();this.pending=new Map();this.stopping=false;}
  async start(){if(this.stopping)throw Error('网盘服务正在关闭。');if(this.starting)return this.starting;if(this.child?.exitCode===null)return;
    this.starting=this.boot().catch(async()=>{await this.dispose();throw Error('网盘连接组件未能启动，请检查安装是否完整。');}).finally(()=>{this.starting=null;});return this.starting;}
  async boot(){if(!this.executable)throw Error('Missing OpenList');const root=path.join(this.directory,'cloud-runtime');await fs.mkdir(root,{recursive:true});
    if(process.platform==='win32'){const sid=String(await runFile('whoami.exe',['/user','/fo','csv','/nh'])).match(/S-1-(?:\d+-)+\d+/i)?.[0];if(!sid)throw Error('Cannot protect connection runtime');await runFile('icacls.exe',[root,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F']);}
    // This directory belongs exclusively to this connection component. Credentials persist only in the encrypted vault.
    for(const name of await fs.readdir(root))if(/^run-[a-f0-9-]+$/.test(name))await fs.rm(path.join(root,name),{recursive:true,force:true});
    this.run=path.join(root,'run-'+crypto.randomUUID());await fs.mkdir(this.run,{mode:0o700});
    const port=await freePort();this.base=`http://127.0.0.1:${port}`;
    await fs.writeFile(path.join(this.run,'config.json'),JSON.stringify({force:true,scheme:{address:'127.0.0.1',http_port:port,https_port:-1},jwt_secret:crypto.randomBytes(32).toString('hex'),log:{enable:false},max_concurrency:8,auto_memory_limit:0,s3:{enable:false},ftp:{enable:false},sftp:{enable:false},mcp:{enable:false},cors:{allow_origins:['http://127.0.0.1']}}));
    const password=crypto.randomBytes(32).toString('base64url');
    this.child=spawn(process.execPath,[runtimeFile('core-host.cjs')],{cwd:this.directory,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});this.child.on('error',()=>{});this.child.on('message',()=>{});this.child.send({action:'start',parentPid:process.pid,executable:this.executable,run:this.run,root,password});this.child.once('exit',()=>{this.mounts.clear();this.token=null;});
    const end=Date.now()+30000;while(true){if(this.child.exitCode!==null||Date.now()>end)throw Error('Core startup timeout');try{const r=await this.fetcher(this.base+'/ping',{signal:AbortSignal.timeout(1000)});if(r.ok)break;}catch{}await delay(100);}
    const response=await this.request('/auth/login',{username:'admin',password},false);this.token=response.token;
    this.timer=setInterval(()=>void this.snapshot().catch(()=>{}),15000);this.timer.unref();
  }
  async request(route,body,auth=true){const r=await this.fetcher(this.base+'/api'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:this.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(90000)});let value;try{value=await r.json();}catch{throw Error('网盘服务响应无效。');}if(!r.ok||value.code!==200){const e=Error(`网盘服务请求未完成（${Number(value.code)||r.status}），请重新登录或稍后重试。`);e.status=r.status;throw e;}return value.data;}
  async api(route,body){await this.start();return this.request(route,body);}
  async ensure(account){await this.start();if(this.mounts.has(account.id))return this.mounts.get(account.id);if(this.pending.has(account.id))return this.pending.get(account.id);
    const work=(async()=>{const drivers={'115':'115 Open',baidu:'BaiduNetdisk',quark:'Quark'};if(!drivers[account.provider])throw Error('不支持的网盘。');const mount='/luma/'+account.id;
      await this.request('/admin/storage/create',{mount_path:mount,driver:drivers[account.provider],cache_expiration:5,web_proxy:true,webdav_policy:'native_proxy',addition:JSON.stringify(account.addition),enable_sign:true,disabled:false});
      const all=await this.request('/admin/storage/list?page=1&per_page=0');const storage=all.content.find(s=>s.mount_path===mount);if(!storage)throw Error('网盘连接未创建。');this.mounts.set(account.id,{mount,storageId:storage.id});return this.mounts.get(account.id);
    })().finally(()=>this.pending.delete(account.id));this.pending.set(account.id,work);return work;}
  async snapshot(){if(!this.token||!this.child||this.child.exitCode!==null)return;const all=await this.request('/admin/storage/list?page=1&per_page=0');let changed=false;for(const [id,{storageId}]of this.mounts){const account=this.vault.account(id),storage=all.content.find(s=>s.id===storageId);if(account&&storage){const addition=JSON.parse(storage.addition);if(JSON.stringify(account.addition)!==JSON.stringify(addition)){account.addition=addition;changed=true;}}}if(changed)await this.vault.save();}
  async forget(id){const m=this.mounts.get(id);if(m&&this.token)await this.request('/admin/storage/delete?id='+encodeURIComponent(m.storageId),{});this.mounts.delete(id);}
  async dispose(){clearInterval(this.timer);const child=this.child;this.child=null;this.token=null;this.mounts.clear();if(child&&child.exitCode===null){if(child.connected)child.send({action:'stop'},()=>{});else child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),delay(4000).then(()=>{if(child.exitCode===null)child.kill();})]);}if(this.run){const target=path.resolve(this.run),root=path.resolve(this.directory,'cloud-runtime')+path.sep;if(target.startsWith(root))await fs.rm(target,{recursive:true,force:true});this.run=null;}}
  async close(){this.stopping=true;await this.starting?.catch(()=>{});await this.snapshot().catch(()=>{});await this.dispose();}
}
module.exports={OpenListCore};
