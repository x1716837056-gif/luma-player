const {recognitionHints}=require('../shared/recognition.mjs');
const {searchMetadata,resolveMetadata}=require('./metadata.cjs');
let convert;const normalizedCache=new Map();
function simplify(value){if(!convert)convert=require('opencc-js/t2cn').Converter({from:'t',to:'cn'});return convert(String(value||'').normalize('NFKC'));}
function normalize(value){const key=String(value||'');if(normalizedCache.has(key))return normalizedCache.get(key);const result=simplify(key).toLowerCase().replace(/\band\b/g,'&').replace(/[^\p{L}\p{N}]/gu,'');normalizedCache.set(key,result);if(normalizedCache.size>4096)normalizedCache.delete(normalizedCache.keys().next().value);return result;}
function compatible(context,candidate){if(!context.year)return true;if(!candidate.year)return false;return context.kind==='tv'&&(context.season||1)>1?candidate.year<=context.year+1:Math.abs(context.year-candidate.year)<=1;}
function score(context,candidate,aliases=[]){if(candidate.kind!==context.kind||!compatible(context,candidate))return 0;const names=[candidate.title,candidate.originalTitle,...aliases].map(normalize);return [...new Set(context.titles.map(normalize))].filter(t=>t&&names.includes(t)).length;}
async function recognize(media,token,language,fetcher,signal){
  const context=recognitionHints(media),candidates=new Map(),queries=[...new Set(context.queries.flatMap(query=>[query.trim(),simplify(query).trim(),query.replace(/\band\b/gi,'&').trim()]).filter(Boolean))].slice(0,4);
  if(!queries.length)return {state:'not-found',message:'文件名和所在文件夹都没有可用片名，请手动填写片名。'};
  const ranked=()=>[...candidates.values()].map(value=>({...value,score:score(context,value.candidate,value.aliases)})).sort((a,b)=>b.score-a.score);
  for(const query of queries){
    signal?.throwIfAborted();const found=await searchMetadata(media,query,context.kind,token,language,fetcher,signal);
    for(const candidate of found){const key=candidate.kind+':'+candidate.tmdbId;if(!candidates.has(key))candidates.set(key,{candidate,rank:found.indexOf(candidate)});}
    const rows=ranked(),strong=rows.filter(row=>row.score>0);
    // An earlier result may match only a regional alias: verify it before selecting a lower-ranked literal-title result.
    if(strong.length===1&&strong[0].rank===0)return {candidate:strong[0].candidate};
    if(strong.length>1&&strong[0].score>strong[1].score)return {candidate:strong[0].candidate};
  }
  let rows=ranked();
  const plausible=rows.filter(row=>compatible(context,row.candidate)&&!row.score).sort((a,b)=>a.rank-b.rank).slice(0,2);
  for(const row of plausible){
    signal?.throwIfAborted();const details=await resolveMetadata(media,row.candidate,token,language,fetcher,signal,true);row.details=details;row.aliases=details.matchingAliases||[];candidates.set(row.candidate.kind+':'+row.candidate.tmdbId,row);
  }
  rows=ranked();const strong=rows.filter(row=>row.score>0);
  if(strong.length===1||strong.length>1&&strong[0].score>strong[1].score)return {candidate:strong[0].candidate,details:strong[0].details};
  if(strong.length>1)return {state:'review',message:'找到多个同名或同年候选，已保留供你确认。'};
  if(rows.some(row=>score({...context,year:0},row.candidate,row.aliases)>0))return {state:'review',message:'片名相符，但年份存在冲突，需要手动确认。'};
  return {state:'not-found',message:'已尝试清理后的文件名、文件夹片名和可用别名，仍未找到可信匹配。'};
}
module.exports={recognize,normalize};
