import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'luma-native-'));
const movies = path.join(fixture, 'Movies');
await fs.mkdir(movies);
await fs.copyFile('public/demo.mp4', path.join(movies, 'Arrival.2016.1080p.mp4'));
await fs.copyFile('public/artwork/arrival.jpg', path.join(movies, 'poster.jpg'));
await fs.writeFile(path.join(movies, 'movie.nfo'), '<movie><title>测试影片 · 降临</title><originaltitle>Arrival</originaltitle><year>2016</year><plot>用于验证本地 NFO、海报与实际视频播放。</plot><runtime>1</runtime><rating>7.8</rating><genre>科幻</genre></movie>');

let app;
try {
  app = await electron.launch({ args: ['.', '--no-sandbox', '--ozone-platform=headless', '--disable-gpu', `--user-data-dir=${path.join(fixture, 'profile')}`], timeout: 30000 });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: '影片详情', exact: true }).waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'reference/desktop-native.png' });

  await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, movies);
  await page.getByRole('button', { name: '添加影片', exact: true }).click();
  await page.getByRole('button', { name: /选择影片所在的文件夹/ }).click();
  await page.getByRole('button', { name: '查看 测试影片 · 降临', exact: true }).waitFor();
  assert.equal(await page.locator('.poster-card').count(), 1);
  console.log('PASS: native folder import, recursive scan, NFO title, source creation and demo removal');

  const poster = page.locator('.poster-art img');
  assert.equal(await poster.evaluate(image => image.complete && image.naturalWidth > 0), true);
  const stored = await page.evaluate(() => window.desktop.loadLibrary());
  assert.equal(stored.demo, false);
  assert.equal(stored.media[0].title, '测试影片 · 降临');
  console.log('PASS: custom local-image protocol and library persistence');

  await page.getByRole('button', { name: '查看 测试影片 · 降临', exact: true }).click();
  await page.getByRole('button', { name: '立即播放', exact: true }).click();
  await page.waitForFunction(() => { const player = document.querySelector('video'); return player && player.readyState >= 2 && player.currentTime > 0; }, { timeout: 15000 });
  const videoDuration = await page.locator('video').evaluate(video => video.duration);
  assert.ok(videoDuration > 10);
  await page.locator('video').evaluate(video => { video.currentTime = 15; });
  await page.waitForFunction(() => { const video = document.querySelector('video'); return video.currentTime >= 15 && !video.seeking; });
  await page.mouse.move(500, 800);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'reference/native-player.png' });
  assert.equal(await page.locator('video').evaluate(video => video.paused), true);
  await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
  await page.waitForTimeout(250);
  const afterPlayback = await page.evaluate(() => window.desktop.loadLibrary());
  assert.ok(afterPlayback.media[0].progress > 0);
  const persisted = JSON.parse(await fs.readFile(path.join(fixture, 'profile', 'library.json'), 'utf8'));
  assert.ok(persisted.media[0].progress > 0);
  console.log('PASS: real local MP4 playback, byte ranges, seeking, pause and resume persistence');

  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await fs.rename(movies, `${movies}-offline`);
  await page.getByRole('button', { name: '刷新影音库', exact: true }).first().click();
  await page.getByRole('status').filter({ hasText: '离线来源的资料已保留' }).waitFor();
  const offline = await page.evaluate(() => window.desktop.loadLibrary());
  assert.equal(offline.media.length, 1);
  assert.equal(offline.sources[0].status, 'offline');
  console.log('PASS: unavailable source keeps existing movie metadata and marks source offline');
  assert.deepEqual(errors, []);
  console.log('PASS: no renderer exceptions');
} finally {
  await app?.close();
  await fs.rm(fixture, { recursive: true, force: true });
}
