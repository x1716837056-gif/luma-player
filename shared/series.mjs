import {parseRelease} from './filename.mjs';
import {groupMovies,hasResume} from './movies.mjs';
const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const seasonNumber=value=>{
  const match=String(value||'').match(/^(?:season[ ._-]*|s)(\d{1,2})$/i)||String(value||'').match(/^第?([一二三四五六七八九十\d]+)季$/);
  if(match){const chinese={一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10},value=match[1];if(/^\d+$/.test(value))return Number(value);if(value.includes('十')){const [tens,ones]=value.split('十');return (chinese[tens]||1)*10+(chinese[ones]||0);}return chinese[value]??null;}
  return /^(specials?|extras?|特别篇|特別篇|特典)$/i.test(value)?0:null;
};
const validNumber=value=>Number.isInteger(value)&&value>=0;
const generic=value=>/^(tv|tvshows?|shows?|series|movies?|media|videos?|电视剧|電視劇|剧集|劇集|影音库|影视)$/i.test(value);
const bare=value=>!value||/^(?:s\d{1,2}[ ._-]*e\d{1,3}|\d{1,2}x\d{1,3}|e(?:p(?:isode)?)?[ ._-]*\d{1,3}|\d+)\b/i.test(value)||/^第[\d一二三四五六七八九十]+集/.test(value);
function folderTitle(name){
  const stripped=name.replace(/第[一二三四五六七八九十\d]+季|\bS\d{1,2}\b|\bSeason[ ._-]*\d{1,2}\b/gi,' ').trim();
  return parseRelease(stripped+'.folder').title.replace(/\s+/g,' ').trim();
}

// Works for existing libraries too: parsing paths requires no file access or rescan.
export function episodeIdentity(media){
  if(media.kind==='tv'&&media.seriesTitle&&validNumber(media.season)&&validNumber(media.episodeNumber)){
    const title=media.seriesTitle,original=media.seriesOriginalTitle||media.originalTitle||title,year=media.seriesYear||0,tmdb=Number.isInteger(media.tmdbId)?media.tmdbId:null;
    return {title,originalTitle:original,year,season:media.season,number:media.episodeNumber,tmdb,aliases:[title,original].map(normalize).filter(Boolean),key:tmdb?`tv:tmdb:${tmdb}`:`tv:${normalize(title)}${year?':'+year:''}`};
  }
  const parts=String(media.path||'').split(/[\\/]/).filter(Boolean),filename=parts.at(-1)||'';
  const parsed=parseRelease(filename||media.title||'');
  let season=validNumber(media.season)?media.season:parsed.season;
  let number=validNumber(media.episodeNumber)?media.episodeNumber:parsed.episodeNumber;
  let folder='',folderYear;
  for(const part of parts.slice(0,-1).reverse()){
    const s=seasonNumber(part);if(s!==null){season??=s;continue;}
    const embedded=part.match(/第[一二三四五六七八九十\d]+季|\bSeason[ ._-]*\d{1,2}\b|\bS\d{1,2}\b/i);if(embedded)season??=seasonNumber(embedded[0]);
    if(!generic(part)&&!/^\w:$/.test(part)){folder=folderTitle(part);folderYear=part.match(/\b((?:19|20)\d{2})\b/)?.[1];break;}
  }
  if(number===undefined&&(media.kind==='tv'||season!==undefined)){
    const match=filename.match(/^(?:E(?:P(?:ISODE)?)?[ ._-]*)?(\d{1,3})(?:[ ._-]|\.[^.]+$)/i)||filename.match(/第(\d{1,3})集/);
    if(match)number=Number(match[1]);
  }
  const tv=media.kind==='tv'||parsed.kind==='tv'||(season!==undefined&&number!==undefined);
  if(!tv)return null;
  if(season===undefined&&number!==undefined)season=1;
  const title=media.seriesTitle||(media.tmdbId?media.title:'')||(!bare(parsed.title)?parsed.title:folder)||(!bare(media.originalTitle)?media.originalTitle:'')||(!bare(media.title)?media.title:'')||folder||'未命名剧集';
  const original=media.seriesOriginalTitle||(!bare(media.originalTitle)?media.originalTitle:'')||title;
  const year=media.seriesYear||Number(folderYear)||0;
  const tmdb=Number.isInteger(media.tmdbId)?media.tmdbId:null;
  const aliases=[title,original,folder,!bare(parsed.title)?parsed.title:''].map(normalize).filter(Boolean);
  const name=normalize(title);
  const fallback=name&&title!=='未命名剧集'?`${name}${year?':'+year:''}`:`path:${parts.slice(0,-1).join('/').toLowerCase()||media.sourceId||media.id}`;
  return {title,originalTitle:original,year,season:validNumber(season)?season:null,number:validNumber(number)?number:null,tmdb,aliases,key:tmdb?`tv:tmdb:${tmdb}`:`tv:${fallback}`};
}
const available=media=>!media.missing&&(Boolean(media.path)||Boolean(media.videoUrl));
const completed=media=>Boolean(media.watched)||(media.progress||0)>=.96;
export function preferredVersion(episode,sourceId){
  return [...episode.media].sort((a,b)=>Number(available(b))-Number(available(a))||Number(Boolean(b.preferredVersion))-Number(Boolean(a.preferredVersion))||Number(b.sourceId===sourceId)-Number(a.sourceId===sourceId)||(b.lastPlayedAt||0)-(a.lastPlayedAt||0)||a.id.localeCompare(b.id))[0];
}
export function groupSeries(items){
  const records=items.map(media=>({media,identity:episodeIdentity(media)})).filter(r=>r.identity);
  const aliases=new Map();
  for(const {identity:i} of records)if(i.tmdb)for(const alias of i.aliases){if(!aliases.has(alias))aliases.set(alias,new Set());aliases.get(alias).add(i.key);}
  const groups=new Map();
  for(const {media,identity:i} of records){
    const ids=new Set(i.aliases.flatMap(alias=>[...(aliases.get(alias)||[])]));
    const key=i.tmdb||ids.size!==1?i.key:[...ids][0];
    if(!groups.has(key))groups.set(key,{id:key,title:i.title,originalTitle:i.originalTitle,year:i.year,media:[],seasons:[]});
    const group=groups.get(key);group.media.push(media);
    if(i.tmdb){group.title=media.seriesTitle||media.title||i.title;group.originalTitle=media.seriesOriginalTitle||media.originalTitle||i.originalTitle;group.year=media.seriesYear||media.year||group.year;}
  }
  for(const group of groups.values()){
    const seasons=new Map();
    for(const media of group.media){
      const identity=episodeIdentity(media),seasonKey=identity.season??'unknown';
      if(!seasons.has(seasonKey))seasons.set(seasonKey,{number:identity.season,episodes:[]});
      const season=seasons.get(seasonKey),key=identity.number===null?`file:${media.id}`:`episode:${identity.number}`;
      let episode=season.episodes.find(e=>e.id===key);
      if(!episode){episode={id:key,number:identity.number,media:[]};season.episodes.push(episode);}episode.media.push(media);
    }
    group.seasons=[...seasons.values()].sort((a,b)=>(a.number??Infinity)-(b.number??Infinity));
    for(const season of group.seasons)season.episodes.sort((a,b)=>(a.number??Infinity)-(b.number??Infinity)||a.id.localeCompare(b.id));
    group.episodeCount=group.seasons.reduce((n,s)=>n+s.episodes.length,0);
    group.representative=[...group.media].sort((a,b)=>Number(Boolean(b.tmdbId))-Number(Boolean(a.tmdbId))||Number(Boolean(b.poster))-Number(Boolean(a.poster)))[0];
  }
  return [...groups.values()];
}
export function seriesFor(items,id,groups=groupSeries(items)){return groups.find(group=>group.media.some(media=>media.id===id));}
export function resumeEpisode(series){
  const files=[...series.seasons.filter(s=>s.number!==0),...series.seasons.filter(s=>s.number===0)].flatMap(s=>s.episodes.map(e=>preferredVersion(e))).filter(available);
  const active=files.filter(hasResume).sort((a,b)=>(b.lastPlayedAt||0)-(a.lastPlayedAt||0)||(episodeIdentity(b)?.season||0)-(episodeIdentity(a)?.season||0)||(episodeIdentity(b)?.number||0)-(episodeIdentity(a)?.number||0));
  return active[0]||files.find(m=>!completed(m))||files[0];
}
export function nextEpisode(items,current,groups){
  const series=seriesFor(items,current.id,groups),identity=episodeIdentity(current);
  if(!series||identity?.season===null||identity?.number===null)return {media:null,reason:'unidentified'};
  const season=series.seasons.find(s=>s.number===identity.season);
  const later=season.episodes.filter(e=>e.number!==null&&e.number>identity.number);
  let target=later.find(e=>e.number===identity.number+1);
  if(!target&&later.length)return {media:null,reason:'gap'};
  if(!target&&identity.season!==0){const following=series.seasons.find(s=>s.number===identity.season+1);target=following?.episodes.find(e=>e.number===1);if((following&&!target)||(!following&&series.seasons.some(s=>s.number>identity.season+1)))return {media:null,reason:'gap'};}
  if(!target)return {media:null,reason:'end'};
  const media=preferredVersion(target,current.sourceId);
  return available(media)?{media,reason:'next'}:{media:null,reason:'offline'};
}
export function libraryEntries(items){
  const series=groupSeries(items),byId=new Map(series.flatMap(s=>s.media.map(m=>[m.id,s]))),movies=new Map(groupMovies(items.filter(m=>!byId.has(m.id))).flatMap(g=>g.media.map(m=>[m.id,g]))),seen=new Set();
  return items.flatMap(media=>{const group=byId.get(media.id);if(!group){const movie=movies.get(media.id);if(!movie)return [{id:media.id,media}];if(seen.has(movie.id))return [];seen.add(movie.id);return [{id:movie.id,media:movie.representative,movie}];}if(seen.has(group.id))return [];seen.add(group.id);return [{id:group.id,media:{...group.representative,title:group.title,originalTitle:group.originalTitle,year:group.year||group.representative.year,favorite:group.media.some(m=>m.favorite),watched:group.seasons.every(s=>s.episodes.every(e=>e.media.some(completed)))},series:group}];});
}
