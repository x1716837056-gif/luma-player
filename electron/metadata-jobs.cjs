const path=require('node:path');
const {probeMedia}=require('./probe.cjs');
const {MetadataNetwork}=require('./metadata-network.cjs');
const {searchMetadata,resolveMetadata,resolveBrowseArtwork,cacheArtwork,confidence,refreshCertification}=require('./metadata.cjs');
const {groupMovies,movieFor}=require('../shared/movies.mjs');
const {groupSeries,seriesFor}=require('../shared/series.mjs');
const fields=['kind','title','originalTitle','year','genre','rating','description','poster','backdrop','tmdbId','certification','certificationRegion','minimumAge','certificationCheckedAt','certificationError','cast','director','directors','people','collection','browseArtworkCheckedAt','browseArtworkError','metadataStatus','metadataOrigin','metadataError','seriesTitle','seriesOriginalTitle','seriesYear','seriesDescription'];
const pick=value=>Object.fromEntries(fields.filter(key=>key in value).map(key=>[key,value[key]]));
const emptyStats=()=>({running:false,completed:0,matched:0,review:0,failed:0,total:0,queued:0});

class MetadataJobs{
  constructor(service){this.service=service;this.jobs=service.jobs=new Set();this.active=new Map();this.images=new Map();this.artworkJobs=service.artworkJobs=new Map();this.controller=new AbortController();this.manualController=new AbortController();this.manual=new Set();this.manualRevisions=new Map();this.manualRevision=0;this.run=0;this.stats=service.stats=emptyStats();this.closing=false;}
  async init(){
    const {default:PQueue}=await import('p-queue');this.queue=this.service.queue=new PQueue({concurrency:8});this.probeQueue=new PQueue({concurrency:2});this.nasQueue=new PQueue({concurrency:1});this.imageQueue=new PQueue({concurrency:6});
    this.network=new MetadataNetwork((url,options)=>this.service.fetcher(url,options));await this.network.init();
    this.fetch=(url,options)=>this.network.fetch(url,options);this.interactiveFetch=(url,options)=>this.network.fetch(url,{...options,priority:10});
  }
  begin(force=false){
    if(this.closing)throw Error('资料任务正在关闭。');
    if(this.controller.signal.aborted||!this.jobs.size){this.controller=new AbortController();this.run++;this.stats=this.service.stats=emptyStats();}
    if(force)this.network.clearCache();return {signal:this.controller.signal,run:this.run};
  }
  status(){const queues=[this.queue,this.probeQueue,this.nasQueue,this.imageQueue].filter(Boolean);return {...this.stats,running:[...this.jobs].some(job=>job.run===this.run&&!job.signal.aborted),queued:queues.reduce((n,q)=>n+q.size,0),active:queues.reduce((n,q)=>n+q.pending,0),probeActive:(this.probeQueue?.pending||0)+(this.nasQueue?.pending||0),artworkActive:this.imageQueue?.pending||0,artworkQueued:this.imageQueue?.size||0};}
  emit(){this.service.notify('tasks:changed',this.status());}
  track(kind,key,queue,fn,run,failed){
    const existing=this.active.get(kind+':'+key);if(existing&&!existing.signal.aborted)return existing.promise;
    const job={key:kind+':'+key,kind,...run};this.active.set(job.key,job);this.jobs.add(job);if(job.run===this.run){this.stats.total++;this.stats.running=true;}this.service.db.job(job.key,'queued');
    const perform=async()=>{job.signal.throwIfAborted();this.service.db.job(job.key,'running');const result=await fn(job.signal);job.signal.throwIfAborted();this.service.db.job(job.key,'complete');return result;};
    job.promise=(queue?queue.add(perform,{signal:job.signal}):Promise.resolve().then(perform)).catch(error=>{
      if(job.signal.aborted){if(this.active.get(job.key)===job)this.service.db.job(job.key,'cancelled');}
      else{if(this.active.get(job.key)===job)this.service.db.job(job.key,'failed',error.message);if(job.run===this.run)this.stats.failed++;failed?.(error);}
      return false;
    }).finally(()=>{
      this.jobs.delete(job);if(this.active.get(job.key)===job)this.active.delete(job.key);
      if(job.run===this.run){this.stats.completed++;this.stats.running=[...this.jobs].some(entry=>entry.run===this.run);if(!this.stats.running)try{this.service.flushUpdates();}catch{this.stats.error='整理结果暂时无法保存，请检查磁盘空间。';}this.emit();}
    });return job.promise;
  }
  current(id){return this.service.library?.media.find(m=>m.id===id);}
  eligible(media){return media&&!media.missing&&!media.metadataOrigin&&!media.tmdbId;}
  needsArtwork(media){return Boolean(media?.tmdbId&&[media.poster,media.backdrop,...(media.people||[]).map(p=>p.photo),media.collection?.poster,media.collection?.backdrop].some(url=>typeof url==='string'&&url.startsWith('https://image.tmdb.org/t/p/')));}
  metadata(ids,value,{manual=false}={}){
    for(const id of ids){const current=this.current(id);if(!current||(!manual&&!this.eligible(current)))continue;
      const patch=pick(value);if(manual)patch.metadataOrigin='manual';
      // A series shares show metadata, while runtime, season/episode identity and file technical data remain independent.
      if(value.kind==='movie'&&value.duration&&!current.technical?.durationSeconds)patch.duration=value.duration;
      this.service.stage(id,patch);
    }
  }
  imagesFor(ids,base,run){
    const key=base.kind+':'+base.tmdbId,existing=this.images.get(key);
    if(existing&&!existing.run.signal.aborted){for(const id of ids)existing.ids.add(id);return existing.promise;}
    const entry={ids:new Set(ids),run,base};this.images.set(key,entry);
    entry.promise=this.track('images',key,this.imageQueue,async signal=>{
      const cached=await cacheArtwork(base,path.join(this.service.directory,'artwork'),this.fetch,signal);signal.throwIfAborted();for(const id of entry.ids)this.applyImages(id,base,cached);return true;
    },run,error=>{for(const id of entry.ids)if(this.current(id)?.tmdbId===base.tmdbId&&this.current(id)?.kind===base.kind)this.service.stage(id,{browseArtworkError:'图片缓存未完成，可稍后补全。'});}).finally(()=>{if(this.images.get(key)===entry)this.images.delete(key);});entry.promise.catch(()=>{});return entry.promise;
  }
  applyImages(id,base,cached){
    const current=this.current(id);if(!current||current.tmdbId!==base.tmdbId||current.kind!==base.kind)return;
    const patch={};for(const key of ['poster','backdrop'])if(current[key]===base[key]&&cached[key]!==base[key])patch[key]=cached[key];
    if(current.people&&base.people)patch.people=current.people.map(person=>{const old=base.people.find(p=>p.role===person.role&&(p.id&&p.id===person.id||p.name===person.name)),next=cached.people?.find(p=>p.role===person.role&&(p.id&&p.id===person.id||p.name===person.name));return old&&next&&person.photo===old.photo?{...person,photo:next.photo}:person;});
    if(current.collection&&base.collection&&(current.collection.id===base.collection.id||current.collection.name===base.collection.name)){
      const collection={...current.collection};for(const key of ['poster','backdrop'])if(collection[key]===base.collection[key]&&cached.collection?.[key]!==base.collection[key])collection[key]=cached.collection?.[key];patch.collection=collection;
    }
    if(Object.keys(patch).length)this.service.stage(id,patch);
  }
  enqueue(items,force=false){
    const run=this.begin(force),prefs={...this.service.getSettings()},wanted=new Set(items.map(m=>m.id)),library=this.service.library?.media||[];
    const sources=new Map((this.service.library?.sources||[]).map(s=>[s.id,s]));
    for(const media of items)if(!media.missing&&!media.remote&&!media.technical){
      const queue=sources.get(media.sourceId)?.type==='nas'?this.nasQueue:this.probeQueue;
      this.track('probe',media.id,queue,async signal=>{const current=this.current(media.id);if(!current||current.missing||current.technical)return;try{const probe=await probeMedia(await this.service.getInput(current,signal),undefined,signal);signal.throwIfAborted();this.service.stage(current.id,probe);}catch(error){if(signal.aborted)throw error;this.service.stage(current.id,{probeError:error.message});}return true;},run);
    }
    if((force||prefs.autoScrape)&&prefs.tmdbToken){
      const series=groupSeries(library),episodes=new Set(series.flatMap(s=>s.media.map(m=>m.id))),groups=[...series,...groupMovies(library.filter(m=>!episodes.has(m.id)))];
      for(const group of groups){
        if(!group.media.some(m=>wanted.has(m.id)&&!m.missing))continue;
        const pending=group.media.filter(m=>this.eligible(m)),ratings=group.media.filter(m=>!m.missing&&m.tmdbId&&!m.certificationCheckedAt);
        if(!pending.length&&!ratings.length){const art=group.media.find(m=>!m.missing&&this.needsArtwork(m));if(art)this.imagesFor(group.media.map(m=>m.id),art,run);continue;}
        const ids=group.media.map(m=>m.id),representative=pending[0]||ratings[0];
        this.track('metadata',group.id,this.queue,async signal=>{
          const live=()=>ids.map(id=>this.current(id)).filter(Boolean),samePrefs=()=>{const current=this.service.getSettings();return current.tmdbToken===prefs.tmdbToken&&(current.metadataLanguage||'zh-CN')===(prefs.metadataLanguage||'zh-CN');};
          let members=live(),unmatched=members.filter(m=>this.eligible(m));
          if(unmatched.length){
            const donor=members.find(m=>m.tmdbId&&m.metadataOrigin),current=this.current(representative.id)||unmatched[0];let details;
            if(donor)details={...donor,duration:undefined};
            else{
              const candidates=await searchMetadata(current,current.seriesTitle||current.title,current.kind,prefs.tmdbToken,prefs.metadataLanguage,this.fetch,signal),ranked=candidates.map(item=>({item,score:confidence(current,item)})).sort((a,b)=>b.score-a.score);
              signal.throwIfAborted();if(!samePrefs())return;
              if(!ranked[0]||ranked[0].score<.95||ranked[1]?.score>=.95){for(const m of unmatched)if(this.eligible(this.current(m.id)))this.service.stage(m.id,{metadataStatus:'review'});if(run.run===this.run)this.stats.review++;return;}
              details=await resolveMetadata(current,ranked[0].item,prefs.tmdbToken,prefs.metadataLanguage,this.fetch,signal);
            }
            signal.throwIfAborted();if(!samePrefs())return;
            this.metadata(ids,details);if(run.run===this.run)this.stats.matched++;this.imagesFor(ids,details,run);
          }
          members=live();const byWork=new Map(members.filter(m=>!m.missing&&m.tmdbId&&!m.certificationCheckedAt).map(m=>[m.kind+':'+m.tmdbId,m]));
          for(const media of byWork.values()){
            const identity={...media};
            try{const rating=await refreshCertification(identity,prefs.tmdbToken,prefs.metadataLanguage,this.fetch,signal);signal.throwIfAborted();if(!samePrefs())return;for(const m of live())if(m.tmdbId===identity.tmdbId&&m.kind===identity.kind&&!m.certificationCheckedAt)this.service.stage(m.id,rating);}
            catch(error){error.certificationOnly=true;error.certificationId=identity.tmdbId;error.certificationKind=identity.kind;throw error;}
          }
          return true;
        },run,error=>{for(const id of ids){const m=this.current(id);if(!m)continue;if(error.certificationOnly){if(m.tmdbId===error.certificationId&&m.kind===error.certificationKind)this.service.stage(id,{certificationError:error.message});}else if(this.eligible(m))this.service.stage(id,{metadataStatus:'failed',metadataError:error.message});}});
      }
    }else if(force||prefs.autoScrape){for(const m of items)if(this.eligible(m)&&!m.remote)this.service.stage(m.id,{metadataStatus:'needs-token'});}
    this.emit();return this.status();
  }
  cancel(){this.controller.abort();this.stats.running=false;this.service.flushUpdates();this.emit();}
  async loadBrowseArtwork(force=false){
    const prefs={...this.service.getSettings()};if(!prefs.tmdbToken)return {completed:0,failed:0,needsToken:true};if(!force&&prefs.autoScrape===false)return {completed:0,failed:0,disabled:true};
    const run=this.begin(force),works=new Map();for(const m of this.service.library?.media||[])if(Number.isInteger(m.tmdbId)&&(!m.browseArtworkCheckedAt||force))works.set(m.kind+':'+m.tmdbId,m);
    const jobs=[...works].map(([key,media])=>{
      const existing=this.artworkJobs.get(key);if(existing&&!existing.signal.aborted)return existing.promise;
      const entry={signal:run.signal};this.artworkJobs.set(key,entry);
      entry.promise=this.track('artwork',key,null,async signal=>{
        const art=await this.queue.add(()=>resolveBrowseArtwork(media,prefs.tmdbToken,prefs.metadataLanguage,this.fetch,signal),{signal});signal.throwIfAborted();
        const ids=[];
        for(const current of this.service.library?.media||[])if(current.kind+':'+current.tmdbId===key){
          const people=art.people.map(person=>{const old=current.people?.find(p=>p.role===person.role&&(p.id&&p.id===person.id||p.name===person.name));return {...person,photo:!force&&old?.photo?.startsWith('luma-media:')?old.photo:person.photo||old?.photo};}),patch={people,browseArtworkCheckedAt:art.browseArtworkCheckedAt,browseArtworkError:''};
          if(art.collection&&(!current.collection||current.collection.id===art.collection.id||current.collection.name===art.collection.name))patch.collection={...current.collection,...art.collection};
          this.service.stage(current.id,patch);ids.push(current.id);
        }
        const base={...art,kind:media.kind,tmdbId:media.tmdbId},cached=await this.imageQueue.add(()=>cacheArtwork(base,path.join(this.service.directory,'artwork'),this.fetch,signal),{signal});signal.throwIfAborted();for(const id of ids)this.applyImages(id,base,cached);return true;
      },run,()=>{for(const m of this.service.library?.media||[])if(m.kind+':'+m.tmdbId===key)this.service.stage(m.id,{browseArtworkError:'图片补全失败，可稍后重试。'});}).finally(()=>{if(this.artworkJobs.get(key)===entry)this.artworkJobs.delete(key);});return entry.promise;
    });
    const results=await Promise.all(jobs);this.service.flushUpdates();return {completed:results.filter(Boolean).length,failed:results.filter(r=>!r).length};
  }
  match(id,candidate){
    const work=this.performMatch(id,candidate);this.manual.add(work);work.finally(()=>this.manual.delete(work)).catch(()=>{});return work;
  }
  search(media,query,kind){return searchMetadata(media,query,kind,this.service.getSettings().tmdbToken,this.service.getSettings().metadataLanguage,this.interactiveFetch,this.manualController.signal);}
  async performMatch(id,candidate){
    const media=this.current(id);if(!media||!Number.isInteger(candidate.tmdbId)||!['movie','tv'].includes(candidate.kind))throw Error('请选择有效的影片。');
    const series=media.kind==='tv'&&candidate.kind==='tv'?seriesFor(this.service.library.media,id):null,movie=media.kind!=='tv'&&candidate.kind==='movie'?movieFor(this.service.library.media,id):null,ids=(series?.media||movie?.media||[media]).map(m=>m.id),revision=++this.manualRevision;
    for(const member of ids)this.manualRevisions.set(member,revision);
    this.network.clearCache();
    const prefs={...this.service.getSettings()},signal=this.manualController.signal,details=await resolveMetadata(media,candidate,prefs.tmdbToken,prefs.metadataLanguage,this.interactiveFetch,signal);signal.throwIfAborted();
    const currentPrefs=this.service.getSettings();if(currentPrefs.tmdbToken!==prefs.tmdbToken||currentPrefs.metadataLanguage!==prefs.metadataLanguage)throw Error('刮削设置已更改，请重新匹配。');
    if(ids.some(member=>this.manualRevisions.get(member)!==revision))return this.current(id);
    this.metadata(ids,details,{manual:true});this.service.flushUpdates();
    const cached=await this.imageQueue.add(()=>cacheArtwork(details,path.join(this.service.directory,'artwork'),this.interactiveFetch,signal),{signal,priority:10});signal.throwIfAborted();for(const member of ids)this.applyImages(member,details,cached);this.service.flushUpdates();return this.current(id);
  }
  async onIdle(){do{await Promise.all([this.queue.onIdle(),this.probeQueue.onIdle(),this.nasQueue.onIdle(),this.imageQueue.onIdle(),...this.manual]);}while(this.jobs.size);await this.network.onIdle();this.service.flushUpdates();}
  async close(){this.closing=true;this.controller.abort();this.manualController.abort();await Promise.allSettled([this.onIdle()]);await this.network.close();this.service.flushUpdates();}
}
module.exports={MetadataJobs};
