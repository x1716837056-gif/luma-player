import {parseRelease,genericTitle,titleVariants} from './filename.mjs';
export const RECOGNITION_VERSION=1;
const compact=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const unique=values=>[...new Set(values.filter(Boolean))];
export function recognitionHints(media){
  const parts=String(media.remote?.path||media.path||'').split(/[\\/]/).filter(Boolean),file=parseRelease(parts.at(-1)||media.title||''),parents=parts.slice(0,-1).reverse().filter(p=>!/^\d{4}$|^[a-z]:$/i.test(p)).map(p=>parseRelease(p+'.folder')).filter(p=>!genericTitle(p.title));
  const disc=media.remote?.discRoot&&parseRelease(media.remote.discRoot.split('/').filter(Boolean).at(-1)+'.folder'),parent=disc||parents[0];
  const abbreviated=/^[a-z]{2,5}$/.test(file.title)&&parent&&/\p{Script=Han}/u.test(parent.title),bare=genericTitle(file.title)||abbreviated,kind=media.kind==='tv'||file.kind==='tv'?'tv':'movie';
  let primary=kind==='tv'&&media.seriesTitle&&!genericTitle(media.seriesTitle)?parseRelease(media.seriesTitle+'.folder'):bare&&parent?parent:file;
  if(kind==='movie'&&!bare&&!file.year&&media.year&&!genericTitle(media.title))primary=parseRelease(media.title+'.folder');
  const year=kind==='tv'?(media.seriesYear||primary.year||parent?.year||media.year||0):(primary.year||file.year||parent?.year||media.year||0);
  const names=unique([primary.title,primary.originalTitle].flatMap(titleVariants)).filter(t=>!genericTitle(t)),parentNames=parent?[parent.title,parent.originalTitle].flatMap(titleVariants).filter(t=>!genericTitle(t)):[];
  const sameScript=parent&&/\p{Script=Han}/u.test(primary.title)===/\p{Script=Han}/u.test(parent.title),different=parent&&!parentNames.some(t=>names.some(n=>compact(t)===compact(n)));
  const parentConflict=!bare&&different&&sameScript&&Boolean(primary.year&&parent.year&&Math.abs(primary.year-parent.year)>1);
  const trusted=unique([...names,...(!parentConflict&&parent&&(bare||!sameScript||!different||parent.year)?parentNames:[])]).filter(t=>!/^\d{1,3}$/.test(t));
  return {title:primary.title,originalTitle:primary.originalTitle,kind,year,season:media.season??file.season,episodeNumber:media.episodeNumber??file.episodeNumber,titles:trusted,queries:unique([...trusted,...(!parentConflict?parentNames:[])]).map(t=>t.slice(0,240)).slice(0,4),parentConflict:Boolean(parentConflict)};
}
export function recognitionState(media){if(media.tmdbId||media.metadataOrigin==='nfo'||media.metadataOrigin==='manual')return 'matched';return media.metadataStatus==='review'?'review':media.metadataStatus==='not-found'?'not-found':media.metadataStatus==='failed'?'failed':'pending';}
export function shouldRecognize(media,force=false){return recognitionState(media)!=='matched'&&(force||!['review','not-found'].includes(media.metadataStatus)||(media.recognitionVersion||0)<RECOGNITION_VERSION);}
export function recognitionGroups(entries,demo=false){
  const matched=new Set(),pending=new Map();for(const entry of entries){const members=entry.series?.media||entry.movie?.media||[entry.media];if(demo||members.some(m=>recognitionState(m)==='matched'))for(const m of members)matched.add(m.id);else{const states=members.map(recognitionState),state=['failed','review','not-found','pending'].find(value=>states.includes(value));for(const m of members)pending.set(m.id,state);}}
  return {matched,pending};
}
