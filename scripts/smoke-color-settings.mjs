import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import fixtures from './media-fixtures.cjs';
const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'luma-color-settings-'));let app;
try{
  app=await electron.launch({env:{...process.env,LUMA_TEST_AUDIO_OUTPUT:'null'},...(process.env.LUMA_PACKAGED_EXE?{executablePath:process.env.LUMA_PACKAGED_EXE}:{}),args:[...(process.env.LUMA_PACKAGED_EXE?[]:['.']),`--user-data-dir=${fixture}`],timeout:30000});
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:900});
  await page.waitForFunction(()=>document.documentElement.dataset.lumaReady==='true');
  await page.locator('.profile-row').click();await page.getByRole('button',{name:'播放设置',exact:true}).click();
  await page.getByLabel('输出方式',{exact:true}).selectOption('hdr');await page.getByLabel('屏幕峰值亮度',{exact:true}).selectOption('600');await page.getByLabel('亮度映射',{exact:true}).selectOption('bt.2446a');
  await page.getByLabel('按场景分析亮度',{exact:true}).uncheck();await page.getByRole('button',{name:'保存设置',exact:true}).click();
  await page.waitForFunction(async()=>((await window.desktop.loadSettings()).colorMapping?.peakNits===600));
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.lumaReady==='true');
  await page.locator('.profile-row').click();await page.getByRole('button',{name:'播放设置',exact:true}).click();
  assert.equal(await page.getByLabel('输出方式',{exact:true}).inputValue(),'hdr');assert.equal(await page.getByLabel('屏幕峰值亮度',{exact:true}).inputValue(),'600');assert.equal(await page.getByLabel('亮度映射',{exact:true}).inputValue(),'bt.2446a');assert.equal(await page.getByLabel('按场景分析亮度',{exact:true}).isChecked(),false);
  await fs.mkdir('reference',{recursive:true});await page.getByLabel('亮度映射',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'reference/color-settings-dark.png'});
  await page.getByLabel('输出方式',{exact:true}).selectOption('sdr');assert.equal(await page.getByLabel('屏幕峰值亮度',{exact:true}).count(),0);
  await page.getByRole('button',{name:'保存设置',exact:true}).click();await page.getByRole('dialog',{name:'设置',exact:true}).waitFor({state:'detached'});
  await page.getByRole('button',{name:'切换到浅色模式',exact:true}).click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await page.locator('.profile-row').click();await page.getByRole('button',{name:'播放设置',exact:true}).click();await page.setViewportSize({width:920,height:650});await page.getByLabel('亮度映射',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'reference/color-settings-light-920.png'});
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  // Capture the internal adapter's options, then run the real player; no testing API in the product.
  await app.evaluate(({app})=>{const {MpvPlayer}=process.mainModule.require(app.getAppPath()+'/electron/mpv.cjs');const original=MpvPlayer.prototype.start;MpvPlayer.prototype.start=function(executable,media,options){globalThis.colorTestOptions=options;return original.call(this,executable,media,options);};});
  const movie=fixtures.selectFixture('browser-ui');assert.ok(movie,'Private real-media fixture is required');
  await page.evaluate(async folder=>{await window.desktop.saveSettings({...await window.desktop.loadSettings(),autoScrape:false,watchFolders:false,defaultPlayer:'mpv'});await window.desktop.scanFolder(folder,'local');},path.dirname(movie.path));
  await page.waitForFunction(async()=>Boolean((await window.desktop.loadLibrary()).media[0]?.technical));
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.lumaReady==='true');await page.locator('.poster-card').first().click();await page.getByRole('button',{name:'立即播放',exact:true}).click();
  await page.waitForFunction(async()=>(await window.desktop.playerState()).active);
  const options=await app.evaluate(()=>globalThis.colorTestOptions);assert.deepEqual(options.colorMapping,{output:'sdr',curve:'bt.2446a',peakNits:600,dynamicPeak:false});
  await page.getByRole('button',{name:'停止 mpv 播放',exact:true}).click();assert.deepEqual(errors,[]);
  console.log('PASS color settings UI, HDR-only peak, dark/light narrow layout, persistence and forwarding into real playback');
}finally{await app?.close();await fs.rm(fixture,{recursive:true,force:true});}
