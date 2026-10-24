const { TMDB } = require('tmdb-ts');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {tmdbRequest} = require('../shared/tmdb-auth.mjs');
const {extractCertification} = require('../shared/catalog.mjs');
function client(token, fetcher=fetch, signal) {
  if (!token?.trim()) throw new Error('请先在设置中填写 TMDB API Key 或读取令牌。');
  return new TMDB(token.trim(),{fetch:async (url,options)=>{
    const request=tmdbRequest(url,options,token);
    let response;
    for(let attempt=0;attempt<3;attempt++) {
      try {
        response=await fetcher(request.url,{...request.options,signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000)});
        if(response.status!==429 && (response.status||200)<500)break;
      } catch(error) { if(signal?.aborted)throw error; if(attempt===2)throw new Error('无法连接 TMDB，请检查网络或系统代理后重试。'); }
      if(attempt<2) await require('node:timers/promises').setTimeout(500*2**attempt,undefined,{signal});
    }
    if(!response)throw new Error('无法连接 TMDB，请检查网络。');
    if (!response.ok) {
      const error=new Error(response.status===401?'TMDB 凭据无效，请检查 API Key 或读取令牌。':`TMDB 请求失败（${response.status}）。`);
      error.status=response.status; throw error;
    }
    return response;
  }});
}
function basic(media,r,kind) {
  return {...media,tmdbId:r.id,kind,title:r.title||r.name,originalTitle:r.original_title||r.original_name,
    ...(kind==='tv'?{seriesTitle:r.name,seriesOriginalTitle:r.original_name,seriesYear:Number((r.first_air_date||'').slice(0,4)),seriesDescription:r.overview||''}:{}),
    year:Number((r.release_date||r.first_air_date||'').slice(0,4)),description:r.overview||'暂无中文简介。',
    rating:Number(r.vote_average||0).toFixed(1),
    poster:r.poster_path?`https://image.tmdb.org/t/p/w500${r.poster_path}`:'',
    backdrop:r.backdrop_path?`https://image.tmdb.org/t/p/w1280${r.backdrop_path}`:''};
}
async function searchMetadata(media,query,kind,token,language='zh-CN',fetcher=fetch,signal) {
  if (!['movie','tv'].includes(kind)||typeof query!=='string'||query.length>500) throw new Error('影片搜索条件无效。');
  const api=client(token,fetcher,signal);
  const options={query,language,include_adult:false};
  const data=await (kind==='movie'?api.search.movies(options):api.search.tvShows(options));
  return data.results.slice(0,8).map(r=>basic(media,r,kind));
}
function normalized(s) { return String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,''); }
function confidence(media,candidate) {
  const queries=[media.title,media.originalTitle].map(normalized).filter(Boolean);
  const titles=[candidate.title,candidate.originalTitle].map(normalized);
  const exact=queries.some(q=>titles.includes(q));
  // Bilingual release names may combine localized and original titles.
  const bilingual=queries.some(q=>titles.some(t=>t.length>=4 && q.endsWith(t) && q.length>t.length));
  const yearOk=!media.year || Math.abs(media.year-candidate.year)<=1;
  return exact && yearOk ? 1 : bilingual && yearOk ? .95 : 0;
}
const imageUrl=(value,size)=>typeof value==='string'&&value.startsWith('/')?`https://image.tmdb.org/t/p/${size}${value}`:undefined;
function browseArtwork(result){
  const people=[...(result.credits?.crew||[]).filter(p=>p.job==='Director').map(p=>({...p,role:'director'})),...(result.credits?.cast||[]).slice(0,12).map(p=>({...p,role:'actor'}))];
  return {people:people.filter(p=>typeof p.name==='string').map(p=>({id:p.id,name:p.name,role:p.role,photo:imageUrl(p.profile_path,'w500')})),
    collection:result.belongs_to_collection?{id:result.belongs_to_collection.id,name:result.belongs_to_collection.name,poster:imageUrl(result.belongs_to_collection.poster_path,'w500'),backdrop:imageUrl(result.belongs_to_collection.backdrop_path,'w780')}:undefined,
    browseArtworkCheckedAt:Date.now(),browseArtworkError:''};
}
async function resolveBrowseArtwork(media,token,language='zh-CN',fetcher=fetch,signal){
  const api=client(token,fetcher,signal),data=await(media.kind==='tv'?api.tvShows.details(media.tmdbId,['credits'],language):api.movies.details(media.tmdbId,['credits'],language));
  return browseArtwork(data);
}
async function resolveMetadata(media,candidate,token,language='zh-CN',fetcher=fetch,signal) {
  const api=client(token,fetcher,signal);
  const r=await (candidate.kind==='tv'?api.tvShows.details(candidate.tmdbId,['credits','content_ratings'],language):api.movies.details(candidate.tmdbId,['credits','release_dates'],language));
  const next=basic(media,r,candidate.kind);
  next.genre=(r.genres||[]).map(g=>g.name);
  Object.assign(next,extractCertification(r,candidate.kind,language),{certificationCheckedAt:Date.now(),certificationError:''});
  next.cast=(r.credits?.cast||[]).slice(0,12).map(p=>p.name);
  next.director=(r.credits?.crew||[]).find(p=>p.job==='Director')?.name;
  next.directors=[...new Set((r.credits?.crew||[]).filter(p=>p.job==='Director').map(p=>p.name))];
  Object.assign(next,browseArtwork(r));
  if (candidate.kind==='movie' && r.runtime && !media.technical?.durationSeconds) next.duration=r.runtime;
  next.metadataStatus='matched'; next.metadataOrigin='tmdb'; next.metadataError='';
  return next;
}
async function cacheArtwork(media,directory,fetcher=fetch,signal) {
  const next={...media,people:media.people?.map(p=>({...p})),collection:media.collection?{...media.collection}:undefined};
  await fs.mkdir(directory,{recursive:true});
  const assets=[[next,'poster'],[next,'backdrop'],...(next.people||[]).map(p=>[p,'photo']),...(next.collection?[[next.collection,'poster'],[next.collection,'backdrop']]:[])],pending=new Map();
  async function cache(url){
    if(typeof url!=='string'||!url.startsWith('https://image.tmdb.org/t/p/'))return url;
    if(pending.has(url))return pending.get(url);
    const work=(async()=>{
    let temporary;
    try {
      const filename=path.join(directory,crypto.createHash('sha256').update(url).digest('hex')+'.jpg');
      try { await fs.access(filename); } catch {
        const response=await fetcher(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
        if (!response.ok) return url;
        const data=Buffer.from(await response.arrayBuffer());
        if (!data.length||data.length>15*1024*1024) return url;
        temporary=filename+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(temporary,data);await fs.rename(temporary,filename);temporary=undefined;
      }
      return `luma-media://local/${encodeURIComponent(filename)}`;
    } catch { return url; /* Online metadata remains usable if artwork caching fails. */ }
    finally{if(temporary)await fs.unlink(temporary).catch(()=>{});}
    })();pending.set(url,work);return work;
  }
  let index=0;await Promise.all(Array.from({length:Math.min(4,assets.length)},async()=>{while(index<assets.length){const [target,key]=assets[index++];if(target[key])target[key]=await cache(target[key]);}}));
  return next;
}
async function refreshCertification(media,token,language='zh-CN',fetcher=fetch,signal) {
  const api=client(token,fetcher,signal);
  const data=media.kind==='tv'?await api.tvShows.contentRatings(media.tmdbId):await api.movies.releaseDates(media.tmdbId);
  return {...extractCertification(media.kind==='tv'?{content_ratings:data}:{release_dates:data},media.kind,language),certificationCheckedAt:Date.now(),certificationError:''};
}
module.exports={searchMetadata,resolveMetadata,resolveBrowseArtwork,cacheArtwork,confidence,refreshCertification};
