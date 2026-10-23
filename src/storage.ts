import type { Library, Media, Settings } from './types';
import { demoLibrary } from './data';

const LIBRARY_KEY = 'luma.library.v1';
const SETTINGS_KEY = 'luma.settings.v1';
export const defaultSettings: Settings = { tmdbToken: '', metadataLanguage: 'zh-CN', autoplay: true, defaultPlayer: 'native', mpvPath: '' };

export async function loadLibrary(): Promise<Library> {
  if (window.desktop) return (await window.desktop.loadLibrary()) ?? structuredClone(demoLibrary);
  try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) || 'null') ?? structuredClone(demoLibrary); }
  catch { return structuredClone(demoLibrary); }
}

export async function saveLibrary(library: Library) {
  if (window.desktop) return window.desktop.saveLibrary(library);
  const serializable = { ...library, media: library.media.map(({ videoUrl, ...media }) => ({ ...media, ...(videoUrl?.startsWith('blob:') ? {} : { videoUrl }) })) };
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(serializable));
}

export async function loadSettings(): Promise<Settings> {
  if (window.desktop) return { ...defaultSettings, ...await window.desktop.loadSettings() };
  try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return defaultSettings; }
}

export async function saveSettings(settings: Settings) {
  if (window.desktop) return window.desktop.saveSettings(settings);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function parseFilename(name: string): Pick<Media, 'title' | 'originalTitle' | 'year' | 'kind' | 'episode'> {
  const stem = name.replace(/\.[^.]+$/, '');
  const year = [...stem.matchAll(/(?:^|[.\s_([])((?:19|20)\d{2})(?=[.\s_)\]]|$)/g)].filter(match => Number(match[1]) <= new Date().getFullYear() + 2).at(-1);
  const episode = stem.match(/\bS(\d{1,2})[. _-]*E(\d{1,3})\b/i);
  const cut = Math.min(...[year?.index, episode?.index, stem.search(/\b(?:2160p|1080p|720p|bluray|webrip|web-dl|x265|x264)\b/i)].filter((n): n is number => n !== undefined && n >= 0), stem.length);
  const title = stem.slice(0, cut).replace(/[._]/g, ' ').replace(/[\s([\]-]+$/, '').trim() || stem;
  return { title, originalTitle: title, year: year ? Number(year[1]) : 0, kind: episode ? 'tv' : 'movie', episode: episode ? `第 ${Number(episode[1])} 季 · 第 ${Number(episode[2])} 集` : undefined };
}

export function importBrowserFiles(files: FileList): Library {
  const media: Media[] = Array.from(files).filter(file => /\.(mp4|mkv|webm|mov|avi|m4v|ts|m2ts|wmv|flv)$/i.test(file.name)).map((file, index) => ({
    id: `local-${Date.now()}-${index}`, ...parseFilename(file.name), genre: [], duration: 0,
    rating: '', certification: '', poster: '', backdrop: '', description: '尚未匹配影片资料。可以在影片详情中手动匹配元数据。',
    sourceId: 'browser-local', path: file.webkitRelativePath || file.name,
    videoUrl: URL.createObjectURL(file), quality: /2160p|4k/i.test(file.name) ? '4K' : /1080p/i.test(file.name) ? '1080P' : '本地',
    addedAt: Date.now(), imported: true,
  }));
  return { demo: false, media, sources: [{ id: 'browser-local', name: files[0]?.webkitRelativePath.split('/')[0] || '本地影片', path: '浏览器选取的文件夹', type: 'local', status: 'online' }] };
}

export async function searchMetadata(item: Media, query: string, kind: Media['kind'], settings: Settings): Promise<Media[]> {
  if (window.desktop) return window.desktop.scrape(item, query, kind);
  if (!settings.tmdbToken.trim()) throw new Error('请先在设置中填写 TMDB API Read Access Token。');
  const url = new URL(`https://api.themoviedb.org/3/search/${kind}`);
  url.searchParams.set('query', query);
  url.searchParams.set('language', settings.metadataLanguage);
  url.searchParams.set('include_adult', 'false');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${settings.tmdbToken.trim()}` } });
  if (!response.ok) throw new Error(response.status === 401 ? 'TMDB 凭据无效，请检查 Read Access Token。' : `TMDB 请求失败（${response.status}），请检查网络后重试。`);
  const data = await response.json();
  return data.results.slice(0, 8).map((result: Record<string, any>): Media => ({ ...item,
    tmdbId: result.id, kind, title: result.title || result.name, originalTitle: result.original_title || result.original_name,
    year: Number((result.release_date || result.first_air_date || '').slice(0, 4)),
    description: result.overview || '暂无中文简介。', rating: Number(result.vote_average).toFixed(1),
    poster: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : '',
    backdrop: result.backdrop_path ? `https://image.tmdb.org/t/p/w1280${result.backdrop_path}` : '',
  }));
}
