const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseFilename, scanFolder, parseRange, searchMetadata } = require('../electron/library.cjs');

test('识别电影年份、发行标签和电视剧季集，保留片名中的数字', () => {
  assert.deepEqual(parseFilename('Dune.Part.Two.2024.2160p.BluRay.mkv'), { title: 'Dune Part Two', originalTitle: 'Dune Part Two', year: 2024, kind: 'movie', episode: undefined });
  assert.deepEqual(parseFilename('Severance.S01E04.1080p.WEB-DL.mkv'), { title: 'Severance', originalTitle: 'Severance', year: 0, kind: 'tv', episode: '第 1 季 · 第 4 集' });
  assert.equal(parseFilename('2001.A.Space.Odyssey.1968.1080p.mkv').year, 1968);
  assert.equal(parseFilename('2001.A.Space.Odyssey.1968.1080p.mkv').title, '2001 A Space Odyssey');
  assert.equal(parseFilename('Blade.Runner.2049.2017.2160p.mkv').title, 'Blade Runner 2049');
});

test('扫描嵌套目录、读取 NFO 和海报，忽略软链接与非视频文件', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'luma-scan-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'Movies'));
  await fs.writeFile(path.join(root, 'Movies', 'Arrival.2016.2160p.mkv'), 'video');
  await fs.writeFile(path.join(root, 'Movies', 'movie.nfo'), '<movie><title>降临</title><originaltitle>Arrival</originaltitle><year>2016</year><plot>语言与时间。</plot><runtime>116</runtime><rating>7.8</rating><genre>科幻</genre><genre>剧情</genre><actor><name>艾米·亚当斯</name></actor></movie>');
  await fs.writeFile(path.join(root, 'Movies', 'poster.jpg'), 'image');
  await fs.writeFile(path.join(root, 'readme.txt'), 'ignored');
  await fs.symlink(root, path.join(root, 'loop'));
  const result = await scanFolder(root, 'nas');
  assert.equal(result.media.length, 1);
  assert.equal(result.source.type, 'nas');
  assert.equal(result.media[0].title, '降临');
  assert.equal(result.media[0].duration, 116);
  assert.deepEqual(result.media[0].genre, ['科幻', '剧情']);
  assert.deepEqual(result.media[0].cast, ['艾米·亚当斯']);
  assert.match(result.media[0].poster, /^luma-media:\/\/local\//);
  assert.equal((await scanFolder(root)).media[0].id, result.media[0].id);
});

test('拒绝不存在的来源，允许空目录', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'luma-empty-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  assert.equal((await scanFolder(root)).media.length, 0);
  await assert.rejects(scanFolder(path.join(root, 'missing')), /无法访问/);
});

test('播放拖动所需的 HTTP Range：完整、开放、后缀、越界与空文件', () => {
  assert.equal(parseRange(null, 100), null);
  assert.deepEqual(parseRange('bytes=10-29', 100), { start: 10, end: 29 });
  assert.deepEqual(parseRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-20', 100), { start: 80, end: 99 });
  assert.deepEqual(parseRange('bytes=0-999', 100), { start: 0, end: 99 });
  for (const header of ['bytes=100-', 'bytes=80-20', 'bytes=-0', 'bytes=-', 'bytes=0-1,4-6']) assert.equal(parseRange(header, 100), false);
  assert.equal(parseRange('bytes=0-', 0), false);
});

test('TMDB 凭据错误不伪造结果，影片匹配保留本地路径', async () => {
  const item = { id: 'original', title: 'Dune', path: '/movies/Dune.mkv' };
  await assert.rejects(searchMetadata(item, 'Dune', 'movie', ''), /Token/);
  await assert.rejects(searchMetadata(item, 'Dune', 'movie', 'invalid', 'zh-CN', async () => ({ ok: false, status: 401 })), /凭据无效/);
  const results = await searchMetadata(item, 'Dune', 'movie', 'test', 'zh-CN', async (url, options) => {
    assert.equal(url.searchParams.get('query'), 'Dune');
    assert.equal(options.headers.Authorization, 'Bearer test');
    return { ok: true, json: async () => ({ results: [{ id: 438631, title: '沙丘', original_title: 'Dune', release_date: '2021-09-15', overview: '沙丘的故事。', vote_average: 7.8, poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg' }] }) };
  });
  assert.equal(results[0].id, 'original');
  assert.equal(results[0].path, item.path);
  assert.equal(results[0].title, '沙丘');
  assert.equal(results[0].year, 2021);
});
