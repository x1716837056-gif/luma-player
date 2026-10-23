const path=require('node:path');
const { scanFolder }=require('./library.cjs');
const { probeMedia }=require('./probe.cjs');
const { searchMetadata, resolveMetadata, cacheArtwork, confidence, refreshCertification }=require('./metadata.cjs');
class LibraryService {
  constructor({database,directory,getSettings,notify,authorize,fetcher=fetch}) {
    this.db=database;this.directory=directory;this.getSettings=getSettings;this.notify=notify;this.authorize=authorize;this.fetcher=fetcher;
    this.library=database.load();this.watchers=new Map();this.debounce=new Map();this.scans=new Map();
    this.jobs=new Set();this.stats={running:false,completed:0,matched:0,review:0,failed:0,total:0,queued:0};this.controller=new AbortController();
  }
  async init({watchFolders=true}={}) {
    const {default:PQueue}=await import('p-queue');this.queue=new PQueue({concurrency:2});
    this.tmdbQueue=new PQueue({concurrency:1,intervalCap:3,interval:1000});
    if(watchFolders)await this.syncWatchers();
  }
  publish() { this.authorize(this.library?.media);this.notify('library:changed',this.library); }
  save() { this.db.save(this.library);this.publish(); }
  patch(id,patch) {
    const item=this.library?.media.find(m=>m.id===id);if(!item)return;
    Object.assign(item,patch);this.save();return item;
  }
  replace(library) {
    this.library=library;this.save();void this.syncWatchers();
  }
  async scan(folder,type) {
    const key=path.resolve(folder).toLowerCase();
    if(this.scans.has(key)) return this.scans.get(key);
    const work=this.performScan(folder,type).catch(error=>{
      if(this.library){this.library.sources=this.library.sources.map(s=>path.resolve(s.path).toLowerCase()===key?{...s,status:'offline'}:s);this.save();}
      throw error;
    }).finally(()=>this.scans.delete(key));this.scans.set(key,work);return work;
  }
  async performScan(folder,type) {
    const result=await scanFolder(folder,type);
    const current=this.library?.demo?null:this.library;
    const existing=new Map((current?.media||[]).map(m=>[m.path?.toLowerCase(),m]));
    const found=new Set(result.media.map(m=>m.path.toLowerCase()));
    const fresh=result.media.map(m=>{
      const old=existing.get(m.path.toLowerCase());
      return old?{...m,...old,missing:false,videoUrl:m.videoUrl,fileSize:m.fileSize,modifiedAt:m.modifiedAt,
        // A changed file needs a fresh probe, but keeps user metadata and viewing history.
        technical:old.fileSize===m.fileSize && old.modifiedAt===m.modifiedAt?old.technical:undefined}:m;
    });
    const retained=(current?.media||[]).filter(m=>!found.has(m.path?.toLowerCase())).map(m=>m.sourceId===result.source.id?{...m,...(!result.warnings.length?{missing:true}:{})}:m);
    this.library={demo:false,media:[...retained,...fresh],sources:[...(current?.sources||[]).filter(s=>s.id!==result.source.id),result.source]};
    this.save();await this.syncWatchers();
    this.enqueue(fresh.filter(m=>!m.technical || (this.getSettings().autoScrape && !m.metadataOrigin && !m.tmdbId)));
    return result;
  }
  status() { return {...this.stats,queued:this.queue?.size||0,active:this.queue?.pending||0}; }
  emitStatus() { this.notify('tasks:changed',this.status()); }
  enqueue(items,force=false) {
    if(this.controller.signal.aborted)this.controller=new AbortController();
    if(!this.queue.pending && !this.queue.size) this.stats={running:true,completed:0,matched:0,review:0,failed:0,total:0,queued:0};
    const signal=this.controller.signal;
    for(const media of items) {
      if(this.jobs.has(media.id) || media.missing)continue;
      this.jobs.add(media.id);this.stats.total++;this.stats.running=true;this.db.job(media.id,'queued');
      const task=this.queue.add(async()=>{
        if(signal.aborted)throw new Error('任务已取消');
        this.db.job(media.id,'running');
        let current=this.library.media.find(m=>m.id===media.id);if(!current)return;
        if(!current.technical) {
          try { const probe=await probeMedia(current.path,undefined,signal);if(!signal.aborted)this.patch(current.id,probe); }
          catch(error) { if(!signal.aborted)this.patch(current.id,{probeError:error.message}); }
        }
        current=this.library.media.find(m=>m.id===media.id);
        if(!current || signal.aborted)return;
        const prefs=this.getSettings();
        if((force||prefs.autoScrape) && !current.metadataOrigin && !current.tmdbId) {
          if(!prefs.tmdbToken) {this.patch(current.id,{metadataStatus:'needs-token'});this.db.job(current.id,'needs-token');return;}
          const candidates=await this.tmdbQueue.add(()=>searchMetadata(current,current.title,current.kind,prefs.tmdbToken,prefs.metadataLanguage,this.fetcher,signal),{signal});
          const ranked=candidates.map(item=>({item,score:confidence(current,item)})).sort((a,b)=>b.score-a.score);
          if(!ranked[0] || ranked[0].score<.95 || (ranked[1]?.score>=.95)) {
            this.patch(current.id,{metadataStatus:'review'});this.stats.review++;this.db.job(current.id,'review');return;
          }
          const details=await this.tmdbQueue.add(()=>resolveMetadata(current,ranked[0].item,prefs.tmdbToken,prefs.metadataLanguage,this.fetcher,signal),{signal});
          const cached=await cacheArtwork(details,path.join(this.directory,'artwork'),this.fetcher,signal);
          if(!signal.aborted && !this.library.media.find(m=>m.id===current.id)?.metadataOrigin) { const {id,path:filename,sourceId,videoUrl,progress,favorite,watched,...metadata}=cached;this.patch(current.id,metadata);this.stats.matched++; }
        }
        current=this.library.media.find(m=>m.id===media.id);
        if(current?.tmdbId && !current.certificationCheckedAt && prefs.tmdbToken && (force||prefs.autoScrape)) {
          try {
            const ratings=await this.tmdbQueue.add(()=>refreshCertification(current,prefs.tmdbToken,prefs.metadataLanguage,this.fetcher,signal),{signal});
            if(!signal.aborted)this.patch(current.id,ratings);
          } catch(error) {error.certificationOnly=true;throw error;}
        }
        this.db.job(current.id,'complete');
      },{signal});
      task.catch(error=>{
        if(signal.aborted)this.db.job(media.id,'cancelled');
        else {this.stats.failed++;this.db.job(media.id,'failed',error.message);this.patch(media.id,error.certificationOnly?{certificationError:error.message}:{metadataStatus:'failed',metadataError:error.message});}
      }).finally(()=>{this.jobs.delete(media.id);this.stats.completed++;if(!this.jobs.size)this.stats.running=false;this.emitStatus();});
    }
    this.stats.running=this.jobs.size>0;this.emitStatus();return this.status();
  }
  cancel() { this.controller.abort();this.stats.running=false;this.emitStatus(); }
  async match(id,candidate) {
    const media=this.library?.media.find(m=>m.id===id);
    if(!media || !Number.isInteger(candidate.tmdbId)||!['movie','tv'].includes(candidate.kind))throw new Error('请选择有效的影片。');
    const prefs=this.getSettings();
    const details=await this.tmdbQueue.add(()=>resolveMetadata(media,candidate,prefs.tmdbToken,prefs.metadataLanguage,this.fetcher));
    const cached=await cacheArtwork(details,path.join(this.directory,'artwork'),this.fetcher);
    const {id:unused,path:filename,sourceId,videoUrl,progress,favorite,watched,...patch}=cached;
    return this.patch(id,{...patch,metadataOrigin:'manual'});
  }
  async syncWatchers() {
    if(!this.queue)return;
    const chokidar=await import('chokidar');
    const sources=this.getSettings().watchFolders===false?[]:(this.library?.sources||[]);
    for(const [id,watcher] of this.watchers) if(!sources.some(s=>s.id===id)){await watcher.close();this.watchers.delete(id);clearTimeout(this.debounce.get(id));}
    for(const source of sources) {
      if(this.watchers.has(source.id))continue;
      const options={ignoreInitial:true,followSymlinks:false,ignored:/(^|[\\/])(\.[^\\/]+|\$RECYCLE.BIN|System Volume Information|@eaDir)([\\/]|$)/,awaitWriteFinish:{stabilityThreshold:2500,pollInterval:500}};
      if(source.type==='nas') {options.backend='polling';options.pollingInterval=30000;options.pollingBinaryInterval=30000;}
      const watcher=chokidar.watch(source.path,options);
      const refresh=()=>{
        clearTimeout(this.debounce.get(source.id));this.debounce.set(source.id,setTimeout(()=>{
          void this.scan(source.path,source.type).catch(()=>{
            if(this.library){this.library.sources=this.library.sources.map(s=>s.id===source.id?{...s,status:'offline'}:s);this.save();}
          });
        },2500));
      };
      watcher.on('all',refresh);watcher.on('error',refresh);this.watchers.set(source.id,watcher);
    }
  }
  async close() {this.cancel();for(const timer of this.debounce.values())clearTimeout(timer);await Promise.all([...this.watchers.values()].map(w=>w.close()));await this.queue?.onIdle();await this.tmdbQueue?.onIdle();}
}
module.exports={LibraryService};
