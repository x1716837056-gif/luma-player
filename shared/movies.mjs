import {parseRelease} from './filename.mjs';
const norm=s=>String(s||'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const stem=m=>String(m.path||'').split(/[\\/]/).at(-1)||m.title||'';
const clean=s=>String(s||'').replace(/[ ._-]*(?:IMAX|DIRECTOR'?S[ ._-]*CUT|EXTENDED(?:[ ._-]*CUT)?|THEATRICAL(?:[ ._-]*CUT)?|FINAL[ ._-]*CUT|UNCUT|UNRATED|导演剪辑版|加长版|院线版)$/i,'').trim();
export const isWatched=m=>m.watched===true||(m.progress||0)>=.96;
export const hasResume=m=>(m.progress||0)>0&&(m.progress||0)<.96&&!(m.watched&&m.watchedMarkedAt&&(m.lastPlayedAt||0)<=m.watchedMarkedAt);
export const shouldRestart=m=>(m.progress||0)>=.96||Boolean(m.watched&&(!m.progress||(m.watchedMarkedAt&&(m.lastPlayedAt||0)<=m.watchedMarkedAt)));
export function editionLabel(m){
  if(m.editionLabel)return m.editionLabel;
  const name=stem(m);
  return /director.?s[ ._-]*cut|导演剪辑/i.test(name)?'导演剪辑版':/extended|加长/i.test(name)?'加长版':/final[ ._-]*cut|最终剪辑/i.test(name)?'最终剪辑版':/theatrical|院线/i.test(name)?'院线版':/unrated|未分级/i.test(name)?'未分级版':/uncut|未删减/i.test(name)?'未删减版':'未标注剪辑版';
}
export function versionLabel(m){return [m.technical?.width>=3800?'4K':m.technical?.height>=1000?'1080p':m.quality||'分辨率未识别',/imax/i.test(stem(m))?'IMAX':'',editionLabel(m),m.technical?.hdr?'HDR':''].filter(Boolean).join(' · ');}
export function chooseVersion(media){
  const duration=Math.max(...media.map(m=>m.technical?.durationSeconds||m.duration*60||0));
  const sample=m=>duration>1800&&(m.technical?.durationSeconds||m.duration*60||duration)<600;
  const resolution=m=>m.technical?.width||(/4k|2160/i.test(m.quality||stem(m))?3840:/1080/i.test(m.quality||stem(m))?1920:0);
  return [...media].sort((a,b)=>Number(Boolean(a.missing))-Number(Boolean(b.missing))||Number(Boolean(b.preferredVersion))-Number(Boolean(a.preferredVersion))||Number(sample(a))-Number(sample(b))||resolution(b)-resolution(a)||(b.lastPlayedAt||0)-(a.lastPlayedAt||0)||a.id.localeCompare(b.id))[0];
}
export function groupMovies(items){
  const movies=items.filter(m=>m.kind!=='tv'),parents=movies.map((_,i)=>i),keys=new Map(),aliases=new Map();
  const root=i=>parents[i]===i?i:(parents[i]=root(parents[i]));const join=(i,j)=>{parents[root(i)]=root(j);};
  const identities=movies.map(m=>{const parsed=parseRelease(stem(m)),name=norm(clean(m.originalTitle||m.title||parsed.title)),year=m.year||parsed.year||0;return {name,year,alias:`${name}:${year}`,key:m.tmdbId?`movie:tmdb:${m.tmdbId}`:year&&name?`movie:${name}:${year}`:`movie:file:${m.id}`};});
  for(let i=0;i<movies.length;i++){const m=movies[i],identity=identities[i];if(m.tmdbId){if(!aliases.has(identity.alias))aliases.set(identity.alias,new Set());aliases.get(identity.alias).add(identity.key);}}
  for(let i=0;i<movies.length;i++){
    const m=movies[i],identity=identities[i],matching=aliases.get(identity.alias);
    const identityKey=!m.tmdbId&&matching?.size===1?[...matching][0]:identity.key;
    const hashes=m.contentHash&&m.hashSize===m.fileSize&&m.hashModifiedAt===m.modifiedAt?[`hash:${m.contentHash}`]:[];
    for(const key of [identityKey,...hashes]){if(keys.has(key))join(i,keys.get(key));else keys.set(key,i);}
  }
  const groups=new Map();for(let i=0;i<movies.length;i++){const key=root(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(movies[i]);}
  return [...groups.values()].map(media=>{
    const preferred=chooseVersion(media),info=[...media].sort((a,b)=>Number(Boolean(b.tmdbId))-Number(Boolean(a.tmdbId))||Number(Boolean(b.poster))-Number(Boolean(a.poster)))[0],identity=identities[movies.indexOf(info)];
    const personal=[...media].sort((a,b)=>(b.personalUpdatedAt||0)-(a.personalUpdatedAt||0))[0];
    const representative={...preferred,title:clean(info.title)||info.title,originalTitle:clean(info.originalTitle)||info.originalTitle,poster:info.poster||preferred.poster,backdrop:info.backdrop||preferred.backdrop,favorite:media.some(m=>m.favorite),watched:media.some(isWatched)};
    for(const key of ['director','directors','cast','collection'])if(!representative[key]&&info[key])representative[key]=info[key];
    for(const key of ['watchlist','personalRating','notes','collectionName','personalUpdatedAt'])if(personal[key]!==undefined)representative[key]=personal[key];
    return {id:identity.key,title:representative.title,year:info.year,media,representative};
  });
}
export function movieFor(items,id,groups=groupMovies(items)){return groups.find(g=>g.media.some(m=>m.id===id));}
export function collectionName(m){return m.collectionName||m.collection?.name||'';}
export function facetNames(m,kind){return kind==='directors'?[...new Set(m.directors?.length?m.directors:(m.director?[m.director]:[]))]:kind==='actors'?m.cast||[]:[collectionName(m)].filter(Boolean);}
