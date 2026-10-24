const path=require('node:path');
const { scanFolder }=require('./library.cjs');
const {MetadataJobs}=require('./metadata-jobs.cjs');
const {seriesFor,episodeIdentity}=require('../shared/series.mjs');
const {movieFor,groupMovies}=require('../shared/movies.mjs');
const {applyPersonal,itemVersions,personalFields}=require('../shared/user-library.mjs');
class LibraryService {
  constructor({database,directory,getSettings,notify,authorize,fetcher=fetch,getInput=async media=>media.path,connectSource=async()=>{}}) {
    this.db=database;this.directory=directory;this.getSettings=getSettings;this.notify=notify;this.authorize=authorize;this.fetcher=fetcher;this.getInput=getInput;this.connectSource=connectSource;
    this.library=database.load();this.watchers=new Map();this.debounce=new Map();this.scans=new Map();
    let hydrated=false;
    for(const media of this.library?.media||[]){const identity=episodeIdentity(media);if(!identity||media.seriesTitle)continue;Object.assign(media,{kind:'tv',seriesTitle:identity.title,seriesOriginalTitle:identity.originalTitle,seriesYear:identity.year,season:media.season??identity.season??undefined,episodeNumber:media.episodeNumber??identity.number??undefined,episode:media.episode||(identity.number!==null?`第 ${identity.season??1} 季 · 第 ${identity.number} 集`:undefined)});if(!media.metadataOrigin&&!media.tmdbId){media.title=identity.title;media.originalTitle=identity.originalTitle;}hydrated=true;}
    if(hydrated)database.save(this.library);
    this.dirty=new Set();this.tasks=new MetadataJobs(this);
  }
  async init({watchFolders=true}={}) {
    await this.tasks.init();
    if(watchFolders)await this.syncWatchers();
  }
  publish() { this.authorize(this.library?.media);this.notify('library:changed',this.library); }
  save(items) {
    if(items&&this.db.saveMedia){const ids=new Set([...this.dirty,...items.map(m=>m.id)]);this.db.saveMedia(this.library.media.filter(m=>ids.has(m.id)));}
    else this.db.save(this.library);
    clearTimeout(this.flushTimer);this.flushTimer=null;this.dirty.clear();this.publish();
  }
  stage(id,patch){
    const item=this.library?.media.find(m=>m.id===id);if(!item)return;Object.assign(item,patch);this.dirty.add(id);
    if(!this.flushTimer){this.flushTimer=setTimeout(()=>{this.flushTimer=null;try{this.flushUpdates();}catch{this.stats.error='整理结果暂时无法保存，请检查磁盘空间。';this.emitStatus();}},300);this.flushTimer.unref?.();}return item;
  }
  flushUpdates(){if(this.dirty.size)this.save([]);}
  patch(id,patch) {
    const item=this.library?.media.find(m=>m.id===id);if(!item)return;
    Object.assign(item,patch);this.save([item]);return item;
  }
  personal(id,patch){const members=applyPersonal(this.library.media,id,patch);this.save(members);return this.library.media.find(m=>m.id===id);}
  prefer(id){const versions=itemVersions(this.library.media,id);if(!versions.length)throw new Error('影片不在影音库中。');for(const m of versions)m.preferredVersion=m.id===id;this.save(versions);return this.library.media.find(m=>m.id===id);}
  markWatched(id,watched,scope='item'){
    if(typeof watched!=='boolean')throw new Error('观看状态无效。');
    const group=scope==='series'?seriesFor(this.library.media,id)?.media:itemVersions(this.library.media,id);
    if(!group?.length)throw new Error('影片不在影音库中。');
    for(const m of group){m.watched=watched;m.watchedMarkedAt=Date.now();if(!watched){m.progress=0;m.lastPlayedAt=0;}}
    this.save(group);return this.library.media.find(m=>m.id===id);
  }
  replace(library) {
    this.library=library;this.save();void this.syncWatchers();
  }
  async scan(folder,type) {
    const key=String(folder).startsWith('cloud:')?folder:path.resolve(folder).toLowerCase();
    if(this.scans.has(key)) return this.scans.get(key);
    const work=this.performScan(folder,type).catch(error=>{
      if(error.name==='AbortError')throw error;
      if(this.library){this.library.sources=this.library.sources.map(s=>(s.type==='cloud'?s.path:path.resolve(s.path).toLowerCase())===key?{...s,status:'offline'}:s);this.save();}
      throw error;
    }).finally(()=>this.scans.delete(key));this.scans.set(key,work);return work;
  }
  async performScan(folder,type) {
    if(type==='nas')await this.connectSource(folder);
    const result=type==='cloud'?await this.remote.scan(folder,{onBatch:batch=>this.mergeScan(batch,false)}):await scanFolder(folder,type);
    const fresh=this.mergeScan(result,true);await this.syncWatchers();
    this.enqueue(fresh.filter(m=>!m.technical || (this.getSettings().autoScrape && !m.metadataOrigin && !m.tmdbId)));
    return result;
  }
  mergeScan(result,complete=true){
    const current=this.library?.demo?null:this.library;
    const fileKey=value=>value?.startsWith('cloud:')?value:value?.toLowerCase();
    const existing=new Map((current?.media||[]).map(m=>[fileKey(m.path),m]));
    const found=new Set(result.media.map(m=>fileKey(m.path)));
    const fresh=result.media.map(m=>{
      const old=existing.get(fileKey(m.path));
      return old?{...m,...old,missing:false,videoUrl:m.videoUrl,fileSize:m.fileSize,modifiedAt:m.modifiedAt,
        seriesTitle:old.seriesTitle||m.seriesTitle,seriesOriginalTitle:old.seriesOriginalTitle||m.seriesOriginalTitle,seriesYear:old.seriesYear||m.seriesYear,season:old.season??m.season,episodeNumber:old.episodeNumber??m.episodeNumber,episode:old.episode||m.episode,
        // A changed file needs a fresh probe, but keeps user metadata and viewing history.
        technical:old.fileSize===m.fileSize && old.modifiedAt===m.modifiedAt?old.technical:undefined}:m;
    });
    const retained=(current?.media||[]).filter(m=>!found.has(fileKey(m.path))).map(m=>complete&&m.sourceId===result.source.id?{...m,...(!result.warnings.length?{missing:true}:{})}:m);
    this.library={demo:false,media:[...retained,...fresh],sources:[...(current?.sources||[]).filter(s=>s.id!==result.source.id),result.source]};
    const oldIds=new Set((current?.media||[]).map(m=>m.id));
    for(const group of [...groupMovies(this.library.media),...require('../shared/series.mjs').groupSeries(this.library.media)]){
      const donor=group.media.filter(m=>oldIds.has(m.id)).sort((a,b)=>(b.personalUpdatedAt||0)-(a.personalUpdatedAt||0))[0];
      if(donor)for(const m of group.media)if(!oldIds.has(m.id))for(const key of personalFields)if(donor[key]!==undefined)m[key]=donor[key];
    }
    this.save();return fresh;
  }
  status(){return this.tasks.status();}
  emitStatus(){this.tasks.emit();}
  enqueue(items,force=false){return this.tasks.enqueue(items,force);}
  cancel(){this.tasks.cancel();}
  loadBrowseArtwork(force=false){return this.tasks.loadBrowseArtwork(force);}
  match(id,candidate){return this.tasks.match(id,candidate);}
  search(media,query,kind){return this.tasks.search(media,query,kind);}
  needsArtwork(media){return this.tasks.needsArtwork(media);}
  onIdle(){return this.tasks.onIdle();}
  async syncWatchers() {
    if(!this.queue)return;
    const chokidar=await import('chokidar');
    const sources=this.getSettings().watchFolders===false?[]:(this.library?.sources||[]).filter(s=>s.type!=='cloud');
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
  async close() {this.cancel();for(const timer of this.debounce.values())clearTimeout(timer);await Promise.all([...this.watchers.values()].map(w=>w.close()));await this.tasks.close();}
}
module.exports={LibraryService};
