const path=require('node:path');
const { scanFolder }=require('./library.cjs');
const { probeMedia }=require('./probe.cjs');
const { searchMetadata, resolveMetadata, resolveBrowseArtwork, cacheArtwork, confidence, refreshCertification }=require('./metadata.cjs');
const {seriesFor,episodeIdentity}=require('../shared/series.mjs');
const {movieFor,groupMovies}=require('../shared/movies.mjs');
const {applyPersonal,itemVersions,personalFields,metadataOnly}=require('../shared/user-library.mjs');
class LibraryService {
  constructor({database,directory,getSettings,notify,authorize,fetcher=fetch,getInput=async media=>media.path,connectSource=async()=>{}}) {
    this.db=database;this.directory=directory;this.getSettings=getSettings;this.notify=notify;this.authorize=authorize;this.fetcher=fetcher;this.getInput=getInput;this.connectSource=connectSource;
    this.library=database.load();this.watchers=new Map();this.debounce=new Map();this.scans=new Map();
    let hydrated=false;
    for(const media of this.library?.media||[]){const identity=episodeIdentity(media);if(!identity||media.seriesTitle)continue;Object.assign(media,{kind:'tv',seriesTitle:identity.title,seriesOriginalTitle:identity.originalTitle,seriesYear:identity.year,season:media.season??identity.season??undefined,episodeNumber:media.episodeNumber??identity.number??undefined,episode:media.episode||(identity.number!==null?`第 ${identity.season??1} 季 · 第 ${identity.number} 集`:undefined)});if(!media.metadataOrigin&&!media.tmdbId){media.title=identity.title;media.originalTitle=identity.originalTitle;}hydrated=true;}
    if(hydrated)database.save(this.library);
    this.jobs=new Set();this.artworkJobs=new Map();this.stats={running:false,completed:0,matched:0,review:0,failed:0,total:0,queued:0};this.controller=new AbortController();
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
  personal(id,patch){applyPersonal(this.library.media,id,patch);this.save();return this.library.media.find(m=>m.id===id);}
  prefer(id){const versions=itemVersions(this.library.media,id);if(!versions.length)throw new Error('影片不在影音库中。');for(const m of versions)m.preferredVersion=m.id===id;this.save();return this.library.media.find(m=>m.id===id);}
  markWatched(id,watched,scope='item'){
    if(typeof watched!=='boolean')throw new Error('观看状态无效。');
    const group=scope==='series'?seriesFor(this.library.media,id)?.media:itemVersions(this.library.media,id);
    if(!group?.length)throw new Error('影片不在影音库中。');
    for(const m of group){m.watched=watched;m.watchedMarkedAt=Date.now();if(!watched){m.progress=0;m.lastPlayedAt=0;}}
    this.save();return this.library.media.find(m=>m.id===id);
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
  status() { return {...this.stats,queued:this.queue?.size||0,active:this.queue?.pending||0}; }
  emitStatus() { this.notify('tasks:changed',this.status()); }
  enqueue(items,force=false) {
    if(this.controller.signal.aborted)this.controller=new AbortController();
    if(!this.queue.pending && !this.queue.size) this.stats={running:true,completed:0,matched:0,review:0,failed:0,total:0,queued:0};
    const signal=this.controller.signal;
    for(const media of items) {
      if(this.jobs.has(media.id) || media.missing)continue;
      // Cloud imports index names, not video bytes. Fetch remote technical tracks only on an explicit probe/playback.
      if(media.remote&&!((force||(this.getSettings().autoScrape&&this.getSettings().tmdbToken))&&((!media.metadataOrigin&&!media.tmdbId)||(media.tmdbId&&!media.certificationCheckedAt))))continue;
      this.jobs.add(media.id);this.stats.total++;this.stats.running=true;this.db.job(media.id,'queued');
      const task=this.queue.add(async()=>{
        if(signal.aborted)throw new Error('任务已取消');
        this.db.job(media.id,'running');
        let current=this.library.media.find(m=>m.id===media.id);if(!current)return;
        if(!current.technical&&!current.remote) {
          try { const probe=await probeMedia(await this.getInput(current),undefined,signal);if(!signal.aborted)this.patch(current.id,probe); }
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
          if(!signal.aborted && !this.library.media.find(m=>m.id===current.id)?.metadataOrigin) {this.patch(current.id,metadataOnly(cached));this.stats.matched++; }
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
  async loadBrowseArtwork(force=false){
    const prefs=this.getSettings();if(!prefs.tmdbToken)return {completed:0,failed:0,needsToken:true};
    if(!force&&prefs.autoScrape===false)return {completed:0,failed:0,disabled:true};
    if(this.controller.signal.aborted)this.controller=new AbortController();const signal=this.controller.signal,works=new Map();
    for(const m of this.library?.media||[])if(Number.isInteger(m.tmdbId)&&(!m.browseArtworkCheckedAt||force))works.set(`${m.kind}:${m.tmdbId}`,m);
    const jobs=[...works].map(([key,media])=>{
      if(this.artworkJobs.has(key))return this.artworkJobs.get(key);
      const work=this.queue.add(async()=>{
        const art=await this.tmdbQueue.add(()=>resolveBrowseArtwork(media,prefs.tmdbToken,prefs.metadataLanguage,this.fetcher,signal),{signal});
        const cached=await cacheArtwork(art,path.join(this.directory,'artwork'),this.fetcher,signal);if(signal.aborted)return false;
        for(const current of this.library?.media||[])if(`${current.kind}:${current.tmdbId}`===key){
          current.people=cached.people.map(person=>{const old=current.people?.find(p=>p.role===person.role&&(p.id&&p.id===person.id||p.name===person.name));return {...person,photo:person.photo||old?.photo};});
          const collection=cached.collection;
          if(collection&&(!current.collection||current.collection.id===collection.id||current.collection.name===collection.name))current.collection={...collection,...current.collection,poster:collection.poster||current.collection?.poster,backdrop:collection.backdrop||current.collection?.backdrop};
          current.browseArtworkCheckedAt=cached.browseArtworkCheckedAt;current.browseArtworkError='';
        }
        this.save();return true;
      },{signal}).catch(()=>{if(!signal.aborted){for(const m of this.library?.media||[])if(`${m.kind}:${m.tmdbId}`===key)m.browseArtworkError='图片补全失败，可稍后重试。';this.save();}return false;}).finally(()=>this.artworkJobs.delete(key));
      this.artworkJobs.set(key,work);return work;
    });
    const results=await Promise.all(jobs);return {completed:results.filter(Boolean).length,failed:results.filter(r=>!r).length};
  }
  async match(id,candidate) {
    const media=this.library?.media.find(m=>m.id===id);
    if(!media || !Number.isInteger(candidate.tmdbId)||!['movie','tv'].includes(candidate.kind))throw new Error('请选择有效的影片。');
    const series=media.kind==='tv'?seriesFor(this.library.media,id):null;
    const movie=media.kind!=='tv'?movieFor(this.library.media,id):null;
    const prefs=this.getSettings();
    const details=await this.tmdbQueue.add(()=>resolveMetadata(media,candidate,prefs.tmdbToken,prefs.metadataLanguage,this.fetcher));
    const cached=await cacheArtwork(details,path.join(this.directory,'artwork'),this.fetcher);
    const patch=metadataOnly(cached);
    if(series&&candidate.kind==='tv'){
      const fields=['title','originalTitle','seriesTitle','seriesOriginalTitle','seriesYear','seriesDescription','tmdbId','year','description','poster','backdrop','genre','rating','certification','certificationRegion','minimumAge','certificationCheckedAt','cast','director','directors','people','browseArtworkCheckedAt','browseArtworkError','metadataStatus','metadataError'];
      const seriesPatch=Object.fromEntries(fields.filter(key=>patch[key]!==undefined).map(key=>[key,patch[key]]));
      for(const episode of series.media)Object.assign(episode,seriesPatch,{metadataOrigin:'manual'});
      this.save();return this.library.media.find(m=>m.id===id);
    }
    if(movie&&candidate.kind==='movie'){
      const fields=['title','originalTitle','tmdbId','year','description','poster','backdrop','genre','rating','certification','certificationRegion','minimumAge','certificationCheckedAt','cast','director','directors','people','collection','browseArtworkCheckedAt','browseArtworkError','metadataStatus','metadataError'];
      const values=Object.fromEntries(fields.filter(key=>patch[key]!==undefined).map(key=>[key,patch[key]]));
      values.collection=patch.collection;
      for(const version of movie.media)Object.assign(version,values,{metadataOrigin:'manual'});this.save();return this.library.media.find(m=>m.id===id);
    }
    return this.patch(id,{...patch,metadataOrigin:'manual'});
  }
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
  async close() {this.cancel();for(const timer of this.debounce.values())clearTimeout(timer);await Promise.all([...this.watchers.values()].map(w=>w.close()));await this.queue?.onIdle();await this.tmdbQueue?.onIdle();}
}
module.exports={LibraryService};
