import { filenameParse } from '@ctrl/video-filename-parser';

// Shared by Vite and Electron: release tags are hints, not verified stream metadata.
export function parseRelease(filename) {
  const stem = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const clean = stem.replace(/^(?:(?:\[[^\]]*\]|【[^】]*】)\s*)+/, '').trim() || stem;
  const episode = clean.match(/(?:^|[.\s_-])S(\d{1,2})[. _-]*E(\d{1,3})(?=[.\s_-]|$)/i)||clean.match(/(?:^|[.\s_-])(\d{1,2})x(\d{1,3})(?=[.\s_-]|$)/i)||clean.match(/第(\d{1,2})季[ ._-]*第?(\d{1,3})集/);
  const parsed = filenameParse(clean, Boolean(episode || /\d+x\d+/i.test(clean)));
  const years = [...clean.matchAll(/(?:^|[.\s_([])((?:19|20)\d{2})(?=[.\s_)\]]|$)/g)]
    .filter(m => +m[1] <= new Date().getFullYear() + 2);
  const year = years.at(-1);
  const cuts = [year?.index, episode?.index, clean.search(/\b(?:2160p|1080p|720p|bluray|webrip|web-dl|x265|x264)\b/i)]
    .filter(n => n !== undefined && n >= 0);
  const fallback = clean.slice(0, Math.min(...cuts, clean.length)).replace(/[._]/g, ' ').replace(/[\s([\]-]+$/, '').trim();
  // Preserve numerical titles that release parsers sometimes mistake for years.
  const title = (year ? fallback : parsed.title || fallback) || clean;
  const season = episode ? +episode[1] : parsed.seasons?.[0];
  const episodeNumber = episode ? +episode[2] : parsed.episodeNumbers?.[0];
  return {
    title, originalTitle: title, year: year ? +year[1] : Number(parsed.year) || 0,
    kind: episodeNumber !== undefined ? 'tv' : 'movie',
    episode: episodeNumber !== undefined ? `第 ${season ?? 1} 季 · 第 ${episodeNumber} 集` : undefined,
    season, episodeNumber,
    release: { resolution: parsed.resolution, videoCodec: parsed.videoCodec, audioCodec: parsed.audioCodec, source: parsed.sources?.join(' / ') },
  };
}
