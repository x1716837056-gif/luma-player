import {seriesFor,episodeIdentity} from './series.mjs';
import {movieFor} from './movies.mjs';
export const personalFields=['favorite','watchlist','personalRating','notes','collectionName','personalUpdatedAt'];
export const userFields=[...personalFields,'progress','watched','watchedMarkedAt','lastPlayedAt','preferredVersion','editionLabel','contentHash','hashSize','hashModifiedAt'];
export function workMembers(items,id){return seriesFor(items,id)?.media||movieFor(items,id)?.media||items.filter(m=>m.id===id);}
export function itemVersions(items,id){
  const members=workMembers(items,id),current=items.find(m=>m.id===id),identity=current&&episodeIdentity(current);
  if(!identity)return members;
  if(identity.season===null||identity.number===null)return current?[current]:[];
  return members.filter(m=>{const i=episodeIdentity(m);return i?.season===identity.season&&i?.number===identity.number;});
}
export function validatePersonal(patch){
  if(!patch||typeof patch!=='object')throw new Error('观影记录格式无效。');
  const result={};
  for(const key of ['favorite','watchlist'])if(key in patch){if(typeof patch[key]!=='boolean')throw new Error('清单状态无效。');result[key]=patch[key];}
  if('personalRating' in patch){const value=patch.personalRating;if(!Number.isFinite(value)||value<0||value>10||value*2%1)throw new Error('个人评分需为 0–10 分，以 0.5 分为单位。');result.personalRating=value;}
  for(const [key,max] of [['notes',10000],['collectionName',120]])if(key in patch){if(typeof patch[key]!=='string'||patch[key].length>max)throw new Error(key==='notes'?'笔记最多 10000 字。':'系列名称最多 120 字。');result[key]=patch[key];}
  return result;
}
export function applyPersonal(items,id,patch,now=Date.now()){
  const safe=validatePersonal(patch),members=workMembers(items,id);if(!members.length)throw new Error('影片不在影音库中。');
  for(const m of members)Object.assign(m,safe,{personalUpdatedAt:now});return members;
}
export function metadataOnly(value){return Object.fromEntries(Object.entries(value).filter(([key])=>!userFields.includes(key)&&!['id','path','sourceId','videoUrl'].includes(key)));}
