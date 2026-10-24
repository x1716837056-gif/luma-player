const crypto=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises');
const cooling=Symbol('cooling');

// One scheduler per library service: all actual attempts (including retries) share the same budgets.
class MetadataNetwork{
  constructor(fetcher){this.fetcher=fetcher;this.pending=new Map();this.cache=new Map();this.cacheBytes=0;this.cooldownUntil=0;this.metrics={apiRequests:0,imageRequests:0,cacheHits:0,sharedRequests:0,rateLimits:0};}
  async init(){const {default:PQueue}=await import('p-queue');this.apiQueue=new PQueue({concurrency:6,intervalCap:8,interval:1000,strict:true});this.imageQueue=new PQueue({concurrency:6});}
  clearCache(){this.cache.clear();this.cacheBytes=0;}
  key(url,options){const target=new URL(url),credential=target.searchParams.get('api_key')||new Headers(options.headers).get('Authorization')||'';target.searchParams.delete('api_key');target.searchParams.sort();return crypto.createHash('sha256').update(target.href+'\0'+credential).digest('hex');}
  response(value){return new Response(value.body.slice(),{status:value.status,headers:value.headers});}
  async dispatch(api,controller,priority,work){
    while(true){
      while(api&&Date.now()<this.cooldownUntil)await delay(Math.min(30000,Math.max(1,this.cooldownUntil-Date.now())),undefined,{signal:controller.signal});
      const value=await(api?this.apiQueue:this.imageQueue).add(()=>api&&Date.now()<this.cooldownUntil?cooling:work(),{signal:controller.signal,priority});
      if(value!==cooling)return value;
    }
  }
  async fetch(url,options={}){
    const target=new URL(url),image=target.origin==='https://image.tmdb.org',api=target.origin==='https://api.themoviedb.org';
    if(!api&&!image)return this.fetcher(url,options);
    const {signal,priority=0,...request}=options;signal?.throwIfAborted();const key=this.key(url,request),cached=api&&this.cache.get(key);
    if(cached&&cached.expires>Date.now()){this.cache.delete(key);this.cache.set(key,cached);this.metrics.cacheHits++;return this.response(cached);}
    if(cached){this.cache.delete(key);this.cacheBytes-=cached.body.byteLength;}
    let entry=this.pending.get(key);
    if(entry?.controller.signal.aborted){this.pending.delete(key);entry=null;}
    if(!entry){
      const controller=new AbortController();entry={controller,users:0,settled:false};this.pending.set(key,entry);
      entry.promise=this.dispatch(api,controller,priority,async()=>{
        this.metrics[api?'apiRequests':'imageRequests']++;
        const response=await this.fetcher(url,{...request,signal:controller.signal});
        if(api&&response.status===429){this.metrics.rateLimits++;const retry=response.headers.get('Retry-After'),seconds=Number(retry),until=retry&&Number.isFinite(seconds)?Date.now()+Math.max(0,seconds)*1000:Date.parse(retry);this.cooldownUntil=Math.max(this.cooldownUntil,Number.isFinite(until)?until:Date.now()+2000);}
        const limit=image?15*1024*1024:4*1024*1024,chunks=[];let bytes=0;
        if(response.body){for await(const chunk of response.body){bytes+=chunk.byteLength;if(bytes>limit){controller.abort();throw Error('资料响应超过大小限制。');}chunks.push(chunk);}}
        controller.signal.throwIfAborted();const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');
        const value={body:Buffer.concat(chunks,bytes),status:response.status,headers:[...headers],expires:Date.now()+30*60*1000};
        if(api&&response.ok){this.cache.set(key,value);this.cacheBytes+=bytes;while(this.cache.size>256||this.cacheBytes>8*1024*1024){const oldest=this.cache.keys().next().value;this.cacheBytes-=this.cache.get(oldest).body.byteLength;this.cache.delete(oldest);}}
        return value;
      }).finally(()=>{entry.settled=true;if(this.pending.get(key)===entry)this.pending.delete(key);});
      // All consumers can cancel before the queued operation starts.
      entry.promise.catch(()=>{});
    }else this.metrics.sharedRequests++;
    entry.users++;
    let released=false;const release=()=>{if(released)return;released=true;if(--entry.users===0&&!entry.settled)entry.controller.abort();};
    try{
      const value=await new Promise((resolve,reject)=>{
        // Release synchronously on abort, before an immediate retry can join an obsolete transport.
        const aborted=()=>{signal?.removeEventListener('abort',aborted);release();reject(signal.reason);};signal?.addEventListener('abort',aborted,{once:true});
        entry.promise.then(value=>{signal?.removeEventListener('abort',aborted);resolve(value);},error=>{signal?.removeEventListener('abort',aborted);reject(error);});
        if(signal?.aborted)aborted();
      });signal?.throwIfAborted();return this.response(value);
    }finally{release();}
  }
  async onIdle(){await Promise.allSettled([...this.pending.values()].map(entry=>entry.promise));await Promise.all([this.apiQueue.onIdle(),this.imageQueue.onIdle()]);}
  async close(){for(const entry of this.pending.values())entry.controller.abort();await this.onIdle();this.clearCache();}
}
module.exports={MetadataNetwork};
