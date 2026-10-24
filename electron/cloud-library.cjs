const http=require('node:http'),crypto=require('node:crypto'),{Readable}=require('node:stream');
const {parseRelease}=require('../shared/filename.mjs');
const {episodeIdentity}=require('../shared/series.mjs');
const {recognitionHints}=require('../shared/recognition.mjs');
const video=/\.(mp4|mkv|webm|mov|avi|m4v|ts|m2ts|wmv|flv)$/i;
const stable=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,20);
function cleanPath(value){if(typeof value!=='string'||value.length>4096||/[\x00-\x1f\\]/.test(value))throw Error('网盘目录无效。');const p=value.startsWith('/')?value:'/'+value;if(p.split('/').some(s=>s==='.'||s==='..'))throw Error('网盘目录无效。');return p.replace(/\/+$/,'')||'/';}
const below=(child,parent)=>parent==='/'||child===parent||child.startsWith(parent+'/');
class CloudLibrary{
  constructor({core,vault,getLibrary,fetcher=fetch,onProgress=()=>{}}){Object.assign(this,{core,vault,getLibrary,fetcher,onProgress});this.links=new Map();this.scans=new Map();this.operations=new Map();this.streams=new Map();this.capability=crypto.randomBytes(32).toString('hex');}
  async account(id){const account=this.vault.account(id);if(!account)throw Error('此网盘已退出登录，请重新连接。');const mount=await this.core.ensure(account);return {account,...mount};}
  operation(id,folder){const key=id+cleanPath(folder),controller=new AbortController();if(!this.operations.has(key))this.operations.set(key,new Set());this.operations.get(key).add(controller);return {signal:controller.signal,done:()=>{this.operations.get(key)?.delete(controller);if(!this.operations.get(key)?.size)this.operations.delete(key);}};}
  cancel(id,folder='/'){for(const controller of this.operations.get(id+cleanPath(folder))||[])controller.abort();}
  async page(id,folder='/',page=1,{refresh=false,signal}={}){
    folder=cleanPath(folder);if(!Number.isInteger(page)||page<1||page>1000)throw Error('网盘页码无效。');signal?.throwIfAborted();
    const {mount}=await this.account(id);signal?.throwIfAborted();
    // OpenList lists the upstream directory before slicing its cached result. Refreshing every page repeats that entire operation.
    const data=await this.core.api('/fs/list',{path:mount+(folder==='/'?'':folder),password:'',page,per_page:200,refresh:refresh&&page===1},{signal,timeout:300000});signal?.throwIfAborted();
    const chunk=data.content||[],total=Math.max(0,Number(data.total)||chunk.length),entries=chunk.filter(f=>typeof f.name==='string'&&f.name&&!/[\/\\\x00-\x1f]/.test(f.name)&&!['.','..'].includes(f.name)).map(f=>({name:f.name,path:cleanPath((folder==='/'?'':folder)+'/'+f.name),isDirectory:Boolean(f.is_dir),size:Number(f.size)||0,modifiedAt:Date.parse(f.modified)||0}));
    return {entries,total,page,nextPage:chunk.length&&page*200<total?page+1:null,count:chunk.length};
  }
  async browse(id,folder='/',page=1){folder=cleanPath(folder);const op=this.operation(id,folder);try{return await this.page(id,folder,page,{signal:op.signal});}finally{op.done();}}
  async *pages(id,folder,refresh,signal){let page=1,loaded=0;while(true){const result=await this.page(id,folder,page,{refresh,signal});loaded+=result.count;yield result;if(!result.count||loaded>=result.total)break;if(++page>1000)throw Error('网盘目录文件过多，请选择更小的目录。');}}
  async list(id,folder='/',refresh=false){const entries=[];for await(const result of this.pages(id,cleanPath(folder),refresh))entries.push(...result.entries);return entries;}
  async scan(location,{onBatch}={}){const u=new URL(location);if(u.protocol!=='cloud:')throw Error('网盘来源无效。');const id=u.hostname,folder=cleanPath(decodeURIComponent(u.pathname)),key=id+folder;if(this.scans.has(key))return this.scans.get(key);const op=this.operation(id,folder);const work=this.walk(id,folder,op.signal,onBatch).finally(()=>{op.done();this.scans.delete(key);});this.scans.set(key,work);return work;}
  async walk(id,folder,signal,onBatch){
    let files=0,folders=0,entries=0;const report=phase=>this.onProgress({accountId:id,folder,phase,files,folders,entries});report('scanning');
    try{
      const {account}=await this.account(id),source={id:stable('cloud:'+id+folder),name:account.label+(folder==='/'?'':' · '+folder.split('/').at(-1)),path:`cloud://${id}${folder.split('/').map(encodeURIComponent).join('/')}`,type:'cloud',accountId:id,remotePath:folder,status:'online'},media=[],todo=[{path:folder,depth:0}],visited=new Set(),discRoots=new Set();let flushed=0,lastFlush=0;
      // Finish a movie subtree before traversing its siblings, so the first films appear without waiting for thousands of parent directories.
      while(todo.length){
        signal?.throwIfAborted();const dir=todo.pop();if(visited.has(dir.path))continue;
        if(/\/CERTIFICATE$/i.test(dir.path)&&discRoots.has(dir.path.slice(0,dir.path.lastIndexOf('/'))||'/'))continue;
        visited.add(dir.path);
        if(dir.depth>64||visited.size>10000)throw Error('目录过大，请选择更小的影视目录。');
        for await(const result of this.pages(id,dir.path,true,signal)){
          for(const f of result.entries){
            if(!below(f.path,folder))throw Error('网盘返回了目录范围以外的文件。');
            if(f.isDirectory){
              if(/\/BDMV$/i.test(dir.path)&&f.name.toUpperCase()!=='STREAM')continue;
              if(/\/BDMV\/STREAM$/i.test(dir.path))continue;
              if(f.name.toUpperCase()==='BDMV')discRoots.add(dir.path);
              if(todo.length>=10000)throw Error('目录过大，请选择更小的影视目录。');todo.push({path:f.path,depth:dir.depth+1});
            }
            else if(video.test(f.name)){
              if(media.length>=100000)throw Error('目录过大，请选择更小的影视目录。');
              const parsed=parseRelease(f.name),logical=`cloud://${id}${f.path}`,m={id:stable(logical),...parsed,genre:[],duration:0,rating:'',certification:'',poster:'',backdrop:'',description:'尚未匹配影片资料。',sourceId:source.id,path:logical,remote:{accountId:id,path:f.path},fileSize:f.size,modifiedAt:f.modifiedAt,quality:/2160|4k/i.test(f.name)?'4K':/1080/i.test(f.name)?'1080P':'网盘',imported:true,addedAt:Date.now()};
              const disc=f.path.match(/^(.*)\/BDMV\/STREAM\/[^/]+$/i);
              if(disc){const title=parseRelease(disc[1].split('/').at(-1)||account.label);Object.assign(m,title,{kind:'movie',editionLabel:'蓝光片段 · '+f.name,description:'蓝光原盘的视频片段；当前不支持网盘原盘菜单及完整播放列表导航。'});m.remote.discRoot=disc[1]||'/';}
              const i=!disc&&episodeIdentity(m);if(i)Object.assign(m,{kind:'tv',title:i.title,originalTitle:i.originalTitle,seriesTitle:i.title,seriesOriginalTitle:i.originalTitle,seriesYear:i.year,year:m.year||i.year,season:i.season??undefined,episodeNumber:i.number??undefined});const hint=recognitionHints(m);Object.assign(m,{title:hint.title,originalTitle:hint.originalTitle,year:hint.year,kind:hint.kind});media.push(m);
            }
          }
          files=media.length;entries+=result.count;report('scanning');
          if(onBatch&&media.length>flushed&&(Date.now()-lastFlush>=1500||media.length-flushed>=1000)){signal?.throwIfAborted();await onBatch({source,media:media.slice(flushed),warnings:[]});flushed=media.length;lastFlush=Date.now();}
          await new Promise(resolve=>setImmediate(resolve));
        }
        folders++;report('scanning');
      }
      signal?.throwIfAborted();report('complete');return {source,media,warnings:[]};
    }catch(error){report(signal?.aborted?'cancelled':'failed');throw error;}
  }
  async startGateway(){if(this.gateway)return;if(this.gatewayStarting)return this.gatewayStarting;this.gatewayStarting=(async()=>{const server=http.createServer((req,res)=>void this.serve(req,res));await new Promise((r,j)=>server.once('error',j).listen(0,'127.0.0.1',r));this.gateway=server;this.base=`http://127.0.0.1:${server.address().port}`;})().finally(()=>this.gatewayStarting=null);return this.gatewayStarting;}
  async input(media){if(!media.remote)return media.path;await this.account(media.remote.accountId);await this.startGateway();return `${this.base}/${this.capability}/${encodeURIComponent(media.id)}`;}
  async prepare(media){return media.remote?{...media,displayPath:media.remote.path,path:await this.input(media)}:media;}
  async link(media,refresh=false){const {mount}=await this.account(media.remote.accountId),existing=this.links.get(media.id);if(!refresh&&existing&&existing.expires>Date.now())return existing;const info=await this.core.api('/fs/get',{path:mount+cleanPath(media.remote.path),password:''});let headers={};try{headers=typeof info.header==='string'?JSON.parse(info.header):info.header||{};}catch{}const u=new URL(info.raw_url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('网盘未返回可用的播放地址。');const link={url:u.href,headers,expires:Date.now()+30000};this.links.set(media.id,link);await this.core.snapshot();return link;}
  async serve(req,res){const controller=new AbortController();res.on('close',()=>controller.abort());try{if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}const parts=(req.url||'').split('/');if(parts.length!==3||parts[1]!==this.capability){res.writeHead(403);res.end();return;}const media=this.getLibrary()?.media.find(m=>m.id===decodeURIComponent(parts[2])&&m.remote);if(!media)throw Error();const id=media.remote.accountId;if(!this.streams.has(id))this.streams.set(id,new Set());this.streams.get(id).add(controller);res.on('close',()=>{this.streams.get(id)?.delete(controller);if(!this.streams.get(id)?.size)this.streams.delete(id);});let response;
      for(let attempt=0;attempt<2;attempt++){const link=await this.link(media,attempt>0),headers=new Headers(link.headers);for(const key of ['host','connection'])headers.delete(key);headers.set('Accept-Encoding','identity');if(req.headers.range)headers.set('Range',req.headers.range);response=await this.fetcher(link.url,{method:req.method,headers,signal:controller.signal,redirect:'follow'});if(![401,403].includes(response.status)||attempt===1)break;await response.body?.cancel();}
      const out={};for(const key of ['content-type','content-length','content-range','accept-ranges','etag','last-modified']){const value=response.headers.get(key);if(value)out[key]=value;}res.writeHead(response.status,out);if(req.method==='HEAD'||!response.body){res.end();return;}const stream=Readable.fromWeb(response.body);stream.on('error',()=>res.destroy());controller.signal.addEventListener('abort',()=>stream.destroy(),{once:true});stream.pipe(res);
    }catch{if(!res.headersSent)res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'});res.end('网盘文件暂时无法读取，请重新登录或稍后重试。');}}
  async close(){for(const controllers of this.operations.values())for(const controller of controllers)controller.abort();await this.gatewayStarting?.catch(()=>{});if(this.gateway){this.gateway.closeAllConnections();await new Promise(r=>this.gateway.close(r));this.gateway=null;}}
  disconnect(id){for(const controller of this.streams.get(id)||[])controller.abort();this.streams.delete(id);for(const m of this.getLibrary()?.media||[])if(m.remote?.accountId===id)this.links.delete(m.id);}
}
module.exports={CloudLibrary,cleanPath,below};
