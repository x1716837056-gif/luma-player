import { filenameParse } from '@ctrl/video-filename-parser';

const extensions=/\.(?:mp4|mkv|webm|mov|avi|m4v|ts|m2ts|wmv|flv|iso|folder)$/i;
const technical=/^(?:\d{3,4}p|[48]k(?:hdr)?(?:[ ._-].*)?|hdr(?:10\+?)?|dv|dovi|hevc|avc|x26[45]|h[ .]?26[45]|web[ .-]?dl|bluray|blu[ .-]?ray|remux|rarbg|rartv|tgx|内封.*|内嵌.*|外挂.*|简(?:中|英).*|繁(?:中|英).*|中英.*|国粤.*|国语.*|粤语.*|双语.*|多音轨.*|特效字幕.*|蓝光原盘|中字|中文字幕|高清修复|高清|超清|原盘)$/i;
export function chineseNumber(value){if(/^\d+$/.test(value))return Number(value);const digits={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9},units={十:10,百:100};let total=0,current=0;for(const char of value){if(char in digits)current=digits[char];else if(char in units){total+=(current||1)*units[char];current=0;}else return undefined;}return total+current;}
function stripBrackets(value){return value.replace(/[\[【{]([^\]】}]+)[\]】}]/g,(_,inside)=>{const content=inside.trim();return /www\.|https?:|\.(?:com|net|org)\b|公众号|资源发布|电影下载/i.test(content)||technical.test(content)?' ':' '+content+' ';});}
export function titleVariants(value){
  const title=String(value||'').normalize('NFKC').trim(),variants=[title];
  const chinese=title.match(/[\p{Script=Han}][\p{Script=Han}\d\s·：:，、!！?？-]*[\p{Script=Han}\d]/u)?.[0]?.trim(),latin=title.match(/[A-Za-z][A-Za-z\d\s'’:&.,-]{2,}/)?.[0]?.trim();
  if(chinese&&latin&&/\p{Script=Han}{2}/u.test(chinese)&&latin.replace(/[^A-Za-z]/g,'').length>=3)variants.push(chinese,latin);
  return [...new Set(variants.filter(Boolean))];
}
export function genericTitle(value){return !value||/^(?:movies?|films?|videos?|tv[ ._-]?shows?|series|media|downloads?|bdmv|stream|certificate|backup|clipinf|playlist|season[ ._-]*\d+|s\d+|ep?\d+|\d{1,3}|\d{5,}|[a-f\d]{6,64}|电影|電影|电视剧|電視劇|影视|影視|剧集|劇集|合集|全集|正片|视频|視頻|影片|完整版|蓝光原盘|藍光原盤|第[\d一二三四五六七八九十]+季)$/i.test(String(value).trim())||technical.test(String(value).trim());}

// Release tags are search hints, never verified codec information. Keep bracketed film names and numerical titles.
const releaseCache=new Map();
export function parseRelease(filename){const key=new Date().getFullYear()+'\0'+String(filename||''),cached=releaseCache.get(key);if(cached)return {...cached,release:{...cached.release}};const value=parseUncached(filename);releaseCache.set(key,value);if(releaseCache.size>4096)releaseCache.delete(releaseCache.keys().next().value);return {...value,release:{...value.release}};}
function parseUncached(filename) {
  const stem=String(filename||'').replace(/^.*[\\/]/,'').replace(extensions,'').normalize('NFKC');
  const clean=stripBrackets(stem).replace(/[《》]/g,' ').replace(/\s+/g,' ').trim()||stem;
  const episode=clean.match(/(?:^|[.\s_-])S(\d{1,2})[. _-]*E(\d{1,3})(?=[.\s_-]|$)/i)||clean.match(/(?:^|[.\s_-])(\d{1,2})x(\d{1,3})(?=[.\s_-]|$)/i);
  const seasonZh=clean.match(/第([\d零〇一二两三四五六七八九十百]+)季/),episodeZh=clean.match(/第([\d零〇一二两三四五六七八九十百]+)集/);
  const seasonOnly=clean.match(/(?:^|[.\s_-])(?:S(\d{1,2})|Season[ ._-]*(\d{1,2}))(?=[.\s_-]|$)/i);
  const parsed=filenameParse(clean,Boolean(episode||seasonZh||episodeZh));
  const years=[...clean.matchAll(/(?:^|[.\s_([\]{-]|(?<=\p{Script=Han}))((?:19|20)\d{2})(?=[.\s_)\] }-]|\p{Script=Han}|$)/gu)].filter(m=>+m[1]<=new Date().getFullYear()+2&&clean.trim()!==m[1]);
  const year=years.at(-1),tag=clean.search(/(?:^|[.\s_([{-]|(?<=\p{Script=Han}))(?:2160p|1080p|720p|[48]k|bluray|blu-ray|webrip|web-dl|x265|x264|hevc|remux|hdr10\+?|国语中字|国粤双语|中英双字|蓝光原盘|内封|内嵌)(?=[.\s_)\] }-]|\p{Script=Han}|$)/iu);
  const cuts=[year?.index,episode?.index,seasonOnly?.index,seasonZh?.index,episodeZh?.index,tag].filter(n=>n!==undefined&&n>=0);
  let title=clean.slice(0,Math.min(...cuts,clean.length)).replace(/[._]/g,' ').replace(/[\s([\]{}-]+$/,'').trim();
  title=title.replace(/(?:[ ._-]*(?:国语中字|国粤双语|中英双字|简英双语|中文字幕|导演剪辑版|加长版|未删减版|蓝光原盘|高清修复|修复版))+$/,'').trim()||parsed.title||clean;
  const variants=titleVariants(title),chinese=variants.slice(1).find(v=>/\p{Script=Han}/u.test(v)),latin=variants.slice(1).find(v=>/[A-Za-z]/.test(v));
  const season=episode?+episode[1]:seasonZh?chineseNumber(seasonZh[1]):parsed.seasons?.[0],episodeNumber=episode?+episode[2]:episodeZh?chineseNumber(episodeZh[1]):parsed.episodeNumbers?.[0];
  return {title:chinese||title,originalTitle:latin||title,year:year?+year[1]:/^\d{4}$/.test(clean)?0:Number(parsed.year)||0,kind:episodeNumber!==undefined||season!==undefined?'tv':'movie',episode:episodeNumber!==undefined?`第 ${season??1} 季 · 第 ${episodeNumber} 集`:undefined,season,episodeNumber,release:{resolution:parsed.resolution,videoCodec:parsed.videoCodec,audioCodec:parsed.audioCodec,source:parsed.sources?.join(' / ')}};
}
