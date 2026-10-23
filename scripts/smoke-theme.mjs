import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'luma-theme-'));
let app;
async function launch(){app=await electron.launch({...(process.env.LUMA_PACKAGED_EXE?{executablePath:process.env.LUMA_PACKAGED_EXE}:{}),args:[...(process.env.LUMA_PACKAGED_EXE?[]:['.']),`--user-data-dir=${fixture}`],timeout:30000});const page=await app.firstWindow();await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'影片详情',exact:true}).waitFor();return page;}
try {
  let page=await launch();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('button',{name:'切换到浅色模式',exact:true}).click();
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await page.getByRole('button',{name:'切换到深色模式',exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.theme-toggle').disabled);
  assert.equal((await page.evaluate(()=>window.desktop.loadSettings())).theme,'light');
  await fs.mkdir('reference',{recursive:true});await page.screenshot({path:'reference/theme-light-home.png'});
  await page.getByRole('button',{name:'影片详情',exact:true}).click();await page.waitForTimeout(150);await page.screenshot({path:'reference/theme-light-detail.png'});
  assert.equal(await page.locator('.detail-modal').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(253, 253, 254)');
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'添加影片',exact:true}).click();await page.waitForTimeout(250);await page.screenshot({path:'reference/theme-light-import.png'});await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.locator('.profile-row').click();await page.waitForTimeout(250);await page.screenshot({path:'reference/theme-light-settings.png'});await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'所有文件来源',exact:true}).click();await page.screenshot({path:'reference/theme-light-sources.png'});
  await page.reload();await page.getByRole('button',{name:'切换到深色模式',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
  await app.close();app=null;page=await launch();await page.getByRole('button',{name:'切换到深色模式',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
  await page.getByRole('button',{name:'切换到深色模式',exact:true}).click();await page.getByRole('button',{name:'切换到浅色模式',exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.theme-toggle').disabled);
  assert.equal((await page.evaluate(()=>window.desktop.loadSettings())).theme,'dark');
  await page.screenshot({path:'reference/theme-dark-home.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: one-click light/dark themes, light home/detail/import/settings, persisted preference across reload and app restart');
}finally{await app?.close();await fs.rm(fixture,{recursive:true,force:true});}
