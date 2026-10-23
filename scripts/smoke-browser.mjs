import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch(process.platform === 'win32' ? {channel:'msedge'} : {executablePath:'/usr/bin/chromium'});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1060 } });
  const errors = [];
  const failed = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'reference/home.png' });
  await page.getByRole('textbox', { name: '搜索影音库' }).fill('Interstellar');
  await expect(page.locator('.poster-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '查看 星际穿越', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '搜索影音库' }).fill('no-such-movie');
  await expect(page.getByText('还没找到这个故事', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '清除搜索', exact: true }).last().click();
  console.log('PASS: bilingual library search and empty state');

  await page.getByRole('button', { name: '影片详情', exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'reference/detail.png' });
  await page.getByRole('button', { name: '取消收藏', exact: true }).click();
  await expect(page.getByRole('button', { name: '收藏影片', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '我的收藏', exact: true }).click();
  await expect(page.locator('.poster-card')).toHaveCount(3);
  console.log('PASS: favorite changes survive reload');

  await page.getByRole('button', { name: '电影', exact: true }).click();
  await expect(page.locator('.poster-card')).toHaveCount(10);
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'reference/library.png' });
  await page.getByRole('button', { name: '列表视图', exact: true }).click();
  await expect(page.locator('.media-list-row')).toHaveCount(10);
  await page.getByRole('button', { name: '海报视图', exact: true }).click();
  await page.getByRole('button', { name: '科幻与奇幻', exact: true }).click();
  assert.equal(await page.locator('.poster-card').count(), 6);
  console.log('PASS: media type, genre filtering and list/grid views');

  await page.getByRole('button', { name: '添加影片', exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'reference/add-source.png' });
  await page.getByRole('button', { name: 'NAS / SMB', exact: true }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'reference/add-nas.png' });
  await page.getByRole('textbox', { name: '共享文件夹路径', exact: true }).fill('\\\\NAS\\Movies');
  await page.getByRole('button', { name: '连接并扫描', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('需要 Windows 桌面版');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  console.log('PASS: NAS form correctly reports browser limitations');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '首页', exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'reference/mobile.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  console.log('PASS: compact layout has no horizontal overflow');
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  console.log('PASS: no JavaScript errors or failed resource requests');
} finally { await browser.close(); }
