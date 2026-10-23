export const genreGroups = [
  {id:'action',label:'动作与冒险',genres:['动作','冒险','Action','Adventure','Action & Adventure']},
  {id:'scifi',label:'科幻与奇幻',genres:['科幻','奇幻','Science Fiction','Fantasy','Sci-Fi & Fantasy']},
  {id:'thriller',label:'悬疑与惊悚',genres:['悬疑','惊悚','Mystery','Thriller']},
  {id:'comedy',label:'喜剧',genres:['喜剧','Comedy']},
  {id:'drama',label:'剧情',genres:['剧情','Drama']},
  {id:'romance',label:'爱情',genres:['爱情','Romance']},
  {id:'crime',label:'犯罪',genres:['犯罪','Crime']},
  {id:'horror',label:'恐怖',genres:['恐怖','Horror']},
  {id:'animation',label:'动画',genres:['动画','Animation']},
  {id:'family',label:'儿童与家庭',genres:['家庭','儿童','Family','Kids']},
  {id:'documentary',label:'纪录片',genres:['纪录','纪录片','Documentary']},
  {id:'war',label:'战争',genres:['战争','War','War & Politics']},
  {id:'history',label:'历史',genres:['历史','History']},
  {id:'music',label:'音乐与歌舞',genres:['音乐','歌舞','Music','Musical']},
  {id:'western',label:'西部',genres:['西部','Western']},
  {id:'unknown',label:'待分类',genres:[]},
];
export const ageGroups=[{id:'all-ages',label:'全年龄'},{id:'7',label:'7+'},{id:'10',label:'10+'},{id:'13',label:'13+'},{id:'16',label:'16+'},{id:'18',label:'18+'},{id:'unknown',label:'未分级'}];
const common={G:0,PG:7,'PG-13':13,R:17,'NC-17':18,'TV-Y':0,'TV-Y7':7,'TV-Y7-FV':7,'TV-G':0,'TV-PG':7,'TV-14':14,'TV-MA':18,U:0,'PG12':12,'R15+':15,'R18+':18};
const regional={HK:{I:0,II:12,IIA:12,IIB:15,III:18},TW:{'普遍級':0,'普遍级':0,'保護級':6,'保护级':6,'輔12級':12,'辅12级':12,'輔15級':15,'辅15级':15,'限制級':18,'限制级':18}};
export function certificationAge(value,region='') {
  const raw=String(value||'').trim().replace(/^(?:USA|US|Rated)\s*[:：]?\s*/i,'');
  if(!raw || /^(NR|N\/A|UNRATED|NOT RATED|未分级)$/i.test(raw))return null;
  const code=raw.toUpperCase();
  if(regional[region]?.[raw]!==undefined)return regional[region][raw];
  if(common[code]!==undefined)return common[code];
  // Explicit numerical age labels are useful across many regional schemes.
  const numeric=/^(?:FSK\s*)?(0|6|7|10|12|13|14|15|16|17|18|19|20|21)(?:\+|A|歲|岁)?$/i.exec(raw);
  return numeric?Number(numeric[1]):null;
}
export function minimumAge(media) {
  return Number.isInteger(media.minimumAge)&&media.minimumAge>=0?media.minimumAge:certificationAge(media.certification,media.certificationRegion);
}
export function ageGroup(media) {
  const age=minimumAge(media);
  if(age===null)return 'unknown';
  if(age===0)return 'all-ages';
  return String([7,10,13,16,18].find(limit=>age<=limit)||18);
}
export function matchesGenre(media,id) {
  if(id==='all')return true;
  const genres=(media.genre||[]).map(g=>g.toLowerCase());
  if(id==='unknown')return !genres.length || !genreGroups.some(group=>group.genres.some(g=>genres.includes(g.toLowerCase())));
  return genreGroups.find(group=>group.id===id)?.genres.some(g=>genres.includes(g.toLowerCase()))||false;
}
export function matchesYear(media,value,now=new Date().getFullYear()) {
  if(value==='all')return true;
  if(value==='unknown')return !media.year;
  if(!media.year)return false;
  if(value==='recent')return media.year>=now-4&&media.year<=now;
  if(value==='before-1980')return media.year<1980;
  if(value.startsWith('decade:')){const start=Number(value.slice(7));return media.year>=start&&media.year<start+10;}
  return media.year===Number(value);
}
export function matchesCatalog(media,filters) {
  return matchesGenre(media,filters.genre)&&(filters.age==='all'||ageGroup(media)===filters.age)&&matchesYear(media,filters.year);
}
export function extractCertification(details,kind,language='zh-CN') {
  const regionOrder=language==='zh-TW'?['TW','HK','US','GB']:language==='en-US'?['US','GB','HK','TW']:['CN','HK','TW','US','GB'];
  const records=kind==='tv'?(details.content_ratings?.results||[]).map(r=>({region:r.iso_3166_1,value:r.rating,type:3})):
    (details.release_dates?.results||[]).flatMap(r=>(r.release_dates||[]).map(d=>({region:r.iso_3166_1,value:d.certification,type:d.type})));
  for(const region of regionOrder){
    const available=records.filter(r=>r.region===region&&certificationAge(r.value,region)!==null).sort((a,b)=>(a.type===3?0:1)-(b.type===3?0:1)||certificationAge(b.value,region)-certificationAge(a.value,region));
    if(available[0])return {certification:available[0].value,certificationRegion:region,minimumAge:certificationAge(available[0].value,region)};
  }
  return {};
}
