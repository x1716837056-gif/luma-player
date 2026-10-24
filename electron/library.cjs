const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { XMLParser } = require('fast-xml-parser');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v', '.ts', '.m2ts', '.wmv', '.flv']);
const stableId = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 20);

const { parseRelease } = require('../shared/filename.mjs');
const { episodeIdentity } = require('../shared/series.mjs');
const {recognitionHints}=require('../shared/recognition.mjs');
function parseFilename(filename) {
  const {title,originalTitle,year,kind,episode}=parseRelease(filename);
  return {title,originalTitle,year,kind,episode};
}

async function readSmallFile(filename, maxBytes = 2 * 1024 * 1024) {
  const info = await fs.stat(filename);
  if (!info.isFile() || info.size > maxBytes) throw new Error('Metadata file exceeds size limit');
  return fs.readFile(filename, 'utf8');
}

const mediaUrl = filename => `luma-media://local/${encodeURIComponent(filename)}`;
async function readNfo(videoPath) {
  const directory = path.dirname(videoPath);
  const stem = path.parse(videoPath).name;
  const parser = new XMLParser({ ignoreAttributes: false, processEntities: false, htmlEntities: false });
  let data = {};
  for (const filename of [`${stem}.nfo`, 'movie.nfo', 'tvshow.nfo']) {
    try {
      const document = parser.parse(await readSmallFile(path.join(directory, filename)));
      const node = document.movie || document.episodedetails || document.tvshow;
      if (node && typeof node === 'object') {
        const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
        const values = value => (Array.isArray(value) ? value : value === undefined ? [] : [value]);
        data = {
          ...(text(node.title) ? document.episodedetails ? {episodeTitle:text(node.title)} : {title:text(node.title)} : {}),
          ...(text(node.originaltitle) ? { originalTitle: text(node.originaltitle) } : {}),
          ...(Number(node.year) ? { year: Number(node.year) } : {}),
          ...(text(node.plot) ? { description: text(node.plot) } : {}),
          ...(document.episodedetails&&text(node.plot)?{episodeDescription:text(node.plot)}:{}),
          ...(Number(node.runtime) ? { duration: Number(node.runtime) } : {}),
          ...(Number(node.rating) ? { rating: Number(node.rating).toFixed(1) } : {}),
          ...(text(node.director) ? { director: text(node.director) } : {}),
          ...(node.director?{directors:values(node.director).map(text).filter(Boolean)}:{}),
          ...(text(node.set)||text(node.set?.name)?{collection:{name:text(node.set)||text(node.set?.name)}}:{}),
          ...(text(node.mpaa) ? { certification: text(node.mpaa) } : {}),
          ...(node.genre ? { genre: values(node.genre).map(text).filter(Boolean) } : {}),
          ...(node.actor ? { cast: values(node.actor).map(actor => text(actor?.name)).filter(Boolean).slice(0, 8) } : {}),
          ...(document.episodedetails || document.tvshow ? { kind: 'tv' } : {}),
          ...(document.episodedetails&&text(node.season)!==''&&Number.isInteger(Number(node.season))?{season:Number(node.season)}:{}),
          ...(document.episodedetails&&text(node.episode)!==''&&Number.isInteger(Number(node.episode))?{episodeNumber:Number(node.episode)}:{}),
        };
        break;
      }
    } catch { /* Missing or malformed sidecar falls back to the filename. */ }
  }
  for (const [key, candidates] of Object.entries({ poster: [`${stem}-poster.jpg`, `${stem}-poster.png`, 'poster.jpg', 'poster.png', 'folder.jpg'], backdrop: [`${stem}-fanart.jpg`, 'fanart.jpg', 'fanart.png', 'backdrop.jpg'] })) {
    for (const candidate of candidates) {
      try { const filename = path.join(directory, candidate); const info = await fs.stat(filename); if (info.isFile()) { data[key] = mediaUrl(filename); break; } }
      catch { /* Continue to the next artwork naming convention. */ }
    }
  }
  return data;
}

async function readSeriesNfo(directory,root,cache){
  if(cache.has(directory))return cache.get(directory);
  const work=(async()=>{
    try{
      const doc=new XMLParser({ignoreAttributes:false,processEntities:false}).parse(await readSmallFile(path.join(directory,'tvshow.nfo'))),node=doc.tvshow;
      if(node&&typeof node==='object'){
        const text=value=>['string','number'].includes(typeof value)?String(value):'';
        const artwork=await readNfo(path.join(directory,'__series__.mkv'));
        return {...artwork,kind:'tv',seriesTitle:text(node.title)||text(node.originaltitle),seriesOriginalTitle:text(node.originaltitle)||text(node.title),seriesYear:Number(node.year)||0,seriesDescription:text(node.plot)};
      }
    }catch{/* No series sidecar at this level. */}
    const parent=path.dirname(directory);
    return directory!==root&&parent!==directory&&path.relative(root,parent)!=='..'&&!path.relative(root,parent).startsWith('..'+path.sep)?readSeriesNfo(parent,root,cache):{};
  })();cache.set(directory,work);return work;
}

async function scanFolder(folder, type = 'local') {
  if (typeof folder !== 'string' || !path.isAbsolute(folder)) throw new Error('请选择有效的完整文件夹路径。');
  const root = path.resolve(folder);
  try { if (!(await fs.stat(root)).isDirectory()) throw new Error(); }
  catch { throw new Error('无法访问这个文件夹。请检查路径、NAS 连接和读取权限。'); }
  const sourceId = stableId(root.toLowerCase());
  const source = { id: sourceId, name: path.basename(root) || root, path: root, type, status: 'online' };
  const media = [];
  const warnings = [];
  const pending = [root];
  const seriesCache=new Map();
  while (pending.length) {
    const directory = pending.pop();
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch { warnings.push(directory); continue; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || ['$RECYCLE.BIN', 'System Volume Information', '@eaDir'].includes(entry.name)) continue;
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { pending.push(filename); continue; }
      if (!entry.isFile() || !VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      const parsed = parseRelease(entry.name);
      const info = await fs.stat(filename).catch(() => null);
      const sidecar = await readNfo(filename);
      const inherited=await readSeriesNfo(directory,root,seriesCache);
      const identity=episodeIdentity({...parsed,...inherited,...sidecar,path:filename});
      const series=identity?{kind:'tv',seriesTitle:inherited.seriesTitle||identity.title,seriesOriginalTitle:inherited.seriesOriginalTitle||identity.originalTitle,seriesYear:identity.year,season:identity.season??undefined,episodeNumber:identity.number??undefined,episode:identity.number!==null?`第 ${identity.season??1} 季 · 第 ${identity.number} 集`:undefined}:{};
      const item={
        id: stableId(filename.toLowerCase()), ...parsed, genre: [], duration: 0, rating: '', certification: '', poster: '', backdrop: '',
        description: '尚未匹配影片资料。可以在影片详情中手动匹配元数据。',
        fileSize: info?.size, modifiedAt: info?.mtimeMs, sourceId, path: filename, videoUrl: mediaUrl(filename), quality: /2160p|4k/i.test(entry.name) ? '4K' : /1080p/i.test(entry.name) ? '1080P' : /720p/i.test(entry.name) ? '720P' : '本地',
        addedAt: info?.birthtimeMs || Date.now(), imported: true, ...inherited,...sidecar,...series, ...(Object.keys(sidecar).some(key => !['poster','backdrop'].includes(key))||inherited.seriesTitle ? {metadataOrigin:'nfo',metadataStatus:'matched'} : {}),
        ...(identity?{title:inherited.seriesTitle||identity.title,originalTitle:inherited.seriesOriginalTitle||identity.originalTitle}:{}),
      };
      if(!item.metadataOrigin){const hint=recognitionHints(item);Object.assign(item,{title:hint.title,originalTitle:hint.originalTitle,year:hint.year,kind:hint.kind});}
      media.push(item);
    }
  }
  return { media, source, warnings };
}

function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return false;
  let start, end;
  if (!match[1]) { const suffix = Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix <= 0) return false; start = Math.max(size - suffix, 0); end = size - 1; }
  else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return false;
  return { start, end };
}

const { searchMetadata } = require('./metadata.cjs');

module.exports = { parseFilename, readNfo, scanFolder, parseRange, searchMetadata, mediaUrl };
