import { parseRelease as parseFilename } from '../shared/filename.mjs';
import { TMDB } from 'tmdb-ts';
import { tmdbRequest } from '../shared/tmdb-auth.mjs';
import type { Library, Media, Settings } from './types';
import { demoLibrary } from './data';

const LIBRARY_KEY = 'luma.library.v1';
const SETTINGS_KEY = 'luma.settings.v1';
export const defaultSettings: Settings = { theme: 'dark', tmdbToken: '', metadataLanguage: 'zh-CN', autoplay: true, defaultPlayer: 'auto', mpvPath: '', autoScrape: true, watchFolders: true };

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

export { parseRelease as parseFilename } from '../shared/filename.mjs';

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
  if (!settings.tmdbToken.trim()) throw new Error('请先在设置中填写 TMDB API Key 或读取令牌。');
  const tmdb = new TMDB(settings.tmdbToken, {fetch: (url, options) => {
    const request = tmdbRequest(String(url), options, settings.tmdbToken);
    return fetch(request.url, request.options);
  }});
  const language = settings.metadataLanguage === 'en-US' ? 'en-US' : settings.metadataLanguage === 'zh-TW' ? 'zh-TW' : 'zh-CN';
  const options = {query,language: language as 'zh-CN' | 'zh-TW' | 'en-US',include_adult:false};
  const data = await (kind === 'movie' ? tmdb.search.movies(options) : tmdb.search.tvShows(options));
  return data.results.slice(0, 8).map((result: Record<string, any>): Media => ({ ...item,
    tmdbId: result.id, kind, title: result.title || result.name, originalTitle: result.original_title || result.original_name,
    year: Number((result.release_date || result.first_air_date || '').slice(0, 4)),
    description: result.overview || '暂无中文简介。', rating: Number(result.vote_average).toFixed(1),
    poster: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : '',
    backdrop: result.backdrop_path ? `https://image.tmdb.org/t/p/w1280${result.backdrop_path}` : '',
  }));
}
