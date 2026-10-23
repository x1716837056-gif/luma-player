const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { XMLParser } = require('fast-xml-parser');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v', '.ts', '.m2ts', '.wmv', '.flv']);
const stableId = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 20);

function parseFilename(filename) {
  const stem = path.parse(filename).name;
  const year = [...stem.matchAll(/(?:^|[.\s_([])((?:19|20)\d{2})(?=[.\s_)\]]|$)/g)].filter(match => Number(match[1]) <= new Date().getFullYear() + 2).at(-1);
  const episode = stem.match(/(?:^|[.\s_-])S(\d{1,2})[. _-]*E(\d{1,3})(?=[.\s_-]|$)/i);
  const tokens = [year?.index, episode?.index, stem.search(/\b(?:2160p|1080p|720p|bluray|webrip|web-dl|x265|x264)\b/i)].filter(index => index !== undefined && index >= 0);
  const cut = Math.min(...tokens, stem.length);
  const title = stem.slice(0, cut).replace(/[._]/g, ' ').replace(/[\s([\]-]+$/, '').trim() || stem;
  return { title, originalTitle: title, year: year ? Number(year[1]) : 0, kind: episode ? 'tv' : 'movie', episode: episode ? `第 ${Number(episode[1])} 季 · 第 ${Number(episode[2])} 集` : undefined };
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
          ...(text(node.title) ? { title: text(node.title) } : {}),
          ...(text(node.originaltitle) ? { originalTitle: text(node.originaltitle) } : {}),
          ...(Number(node.year) ? { year: Number(node.year) } : {}),
          ...(text(node.plot) ? { description: text(node.plot) } : {}),
          ...(Number(node.runtime) ? { duration: Number(node.runtime) } : {}),
          ...(Number(node.rating) ? { rating: Number(node.rating).toFixed(1) } : {}),
          ...(text(node.director) ? { director: text(node.director) } : {}),
          ...(text(node.mpaa) ? { certification: text(node.mpaa) } : {}),
          ...(node.genre ? { genre: values(node.genre).map(text).filter(Boolean) } : {}),
          ...(node.actor ? { cast: values(node.actor).map(actor => text(actor?.name)).filter(Boolean).slice(0, 8) } : {}),
          ...(document.episodedetails || document.tvshow ? { kind: 'tv' } : {}),
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
      const parsed = parseFilename(entry.name);
      const info = await fs.stat(filename).catch(() => null);
      media.push({
        id: stableId(filename.toLowerCase()), ...parsed, genre: [], duration: 0, rating: '', certification: '', poster: '', backdrop: '',
        description: '尚未匹配影片资料。可以在影片详情中手动匹配元数据。',
        sourceId, path: filename, videoUrl: mediaUrl(filename), quality: /2160p|4k/i.test(entry.name) ? '4K' : /1080p/i.test(entry.name) ? '1080P' : /720p/i.test(entry.name) ? '720P' : '本地',
        addedAt: info?.birthtimeMs || Date.now(), imported: true, ...await readNfo(filename),
      });
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

async function searchMetadata(media, query, kind, token, language = 'zh-CN', fetcher = fetch) {
  if (!token?.trim()) throw new Error('请先在设置中填写 TMDB API Read Access Token。');
  if (!['movie', 'tv'].includes(kind) || typeof query !== 'string' || query.length > 500) throw new Error('影片搜索条件无效。');
  const url = new URL(`https://api.themoviedb.org/3/search/${kind}`);
  url.search = new URLSearchParams({ query, language, include_adult: 'false' }).toString();
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${token.trim()}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(response.status === 401 ? 'TMDB 凭据无效，请检查 Read Access Token。' : `TMDB 请求失败（${response.status}）。`);
  const data = await response.json();
  return data.results.slice(0, 8).map(result => ({ ...media, tmdbId: result.id, kind,
    title: result.title || result.name, originalTitle: result.original_title || result.original_name,
    year: Number((result.release_date || result.first_air_date || '').slice(0, 4)), description: result.overview || '暂无中文简介。',
    rating: Number(result.vote_average).toFixed(1), poster: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : '', backdrop: result.backdrop_path ? `https://image.tmdb.org/t/p/w1280${result.backdrop_path}` : '',
  }));
}

module.exports = { parseFilename, readNfo, scanFolder, parseRange, searchMetadata, mediaUrl };
