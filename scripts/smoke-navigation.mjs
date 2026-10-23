import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'luma-navigation-'));
let app;
try {
  app=await electron.launch({...(process.env.LUMA_PACKAGED_EXE?{executablePath:process.env.LUMA_PACKAGED_EXE}:{}),args:[...(process.env.LUMA_PACKAGED_EXE?[]:['.']),`--user-data-dir=${fixture}`],timeout:30000});
  const page=await app.firstWindow();await page.setViewportSize({width:1440,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(()=>document.documentElement.dataset.lumaReady==='true');
  const back=page.getByRole('button',{name:'返回上一页',exact:true});assert.ok(await back.isDisabled());
  await page.getByRole('button',{name:'电影',exact:true}).click();await page.getByRole('button',{name:'科幻与奇幻',exact:true}).click();await page.getByLabel('上映年份分类',{exact:true}).selectOption('2016');await page.getByRole('button',{name:'列表视图',exact:true}).click();await page.getByLabel('影片排序',{exact:true}).selectOption('title');
  await page.getByRole('button',{name:'我的收藏',exact:true}).click();await page.getByLabel('搜索影音库',{exact:true}).fill('Dune');await back.click();assert.equal(await page.getByLabel('搜索影音库',{exact:true}).inputValue(),'');assert.equal(await page.locator('.toolbar-title').innerText(),'我的收藏');
  await back.click();assert.equal(await page.locator('.toolbar-title').innerText(),'电影');assert.equal(await page.getByLabel('影片类型分类',{exact:true}).inputValue(),'scifi');assert.equal(await page.getByLabel('上映年份分类',{exact:true}).inputValue(),'2016');assert.equal(await page.getByLabel('影片排序',{exact:true}).inputValue(),'title');assert.equal(await page.locator('.media-list-row').count(),1);
  await page.keyboard.press('Alt+ArrowLeft');await page.locator('.hero').waitFor();assert.ok(await back.isDisabled());
  await page.getByLabel('搜索影音库',{exact:true}).fill('Arrival');await page.getByRole('button',{name:'我的收藏',exact:true}).click();await back.click();assert.equal(await page.getByLabel('搜索影音库',{exact:true}).inputValue(),'Arrival');await back.click();assert.equal(await page.getByLabel('搜索影音库',{exact:true}).inputValue(),'');
  await page.getByRole('button',{name:'影片详情',exact:true}).click();await page.getByRole('button',{name:'重新匹配资料',exact:true}).click();await page.locator('.match-section').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.match-section').count(),0);assert.equal(await page.locator('.detail-modal').count(),1);await page.keyboard.press('Alt+ArrowLeft');assert.equal(await page.locator('.detail-modal').count(),0);
  await page.locator('.profile-row').click();await page.getByRole('button',{name:'关于 Luma',exact:true}).click();await page.keyboard.press('Escape');await page.getByLabel('TMDB API Key / 读取令牌',{exact:true}).waitFor();assert.equal(await page.locator('.settings-modal').count(),1);await page.keyboard.press('Escape');assert.equal(await page.locator('.settings-modal').count(),0);
  await page.getByRole('button',{name:'影片详情',exact:true}).click();await page.locator('.detail-actions .button-primary').click();await page.locator('.cinema-player').waitFor();
  const audio=page.getByRole('button',{name:'音轨语言',exact:true}),subtitles=page.getByRole('button',{name:'字幕选项',exact:true});
  for(const button of [audio,subtitles,page.getByRole('button',{name:'播放速度',exact:true}),page.getByRole('button',{name:'全屏',exact:true})]){const box=await button.boundingBox();assert.equal(box.width,40);assert.equal(box.height,40);}
  await audio.click();const menu=page.getByRole('menu',{name:'音轨语言',exact:true});await menu.waitFor();let a=await audio.boundingBox(),m=await menu.boundingBox();assert.ok(m.y+m.height<a.y);assert.ok(Math.abs(m.x+m.width/2-a.x-a.width/2)<2);
  await page.mouse.move(a.x+a.width/2,a.y-4);await page.mouse.move(m.x+m.width/2,m.y+m.height-8,{steps:8});await page.waitForTimeout(230);assert.equal(await menu.count(),1);
  await page.mouse.move(10,200);await menu.waitFor({state:'detached'});assert.equal(await page.locator('.cinema-player').count(),1);
  await audio.click();await subtitles.click();assert.equal(await page.getByRole('menu').count(),1);await page.keyboard.press('Escape');assert.equal(await page.getByRole('menu').count(),0);assert.equal(await page.locator('.cinema-player').count(),1);
  await page.getByRole('button',{name:'全屏',exact:true}).click();await page.waitForFunction(()=>Boolean(document.fullscreenElement));await audio.click();await page.keyboard.press('Escape');assert.ok(await page.evaluate(()=>Boolean(document.fullscreenElement)));await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.fullscreenElement);assert.equal(await page.locator('.cinema-player').count(),1);
  await page.locator('video').click({button:'right'});await page.getByRole('menuitem',{name:/影片简介/}).click();await page.getByRole('dialog',{name:'影片简介',exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.cinema-player').count(),1);
  await page.keyboard.press('Alt+ArrowLeft');await page.locator('.detail-modal').waitFor();assert.equal(await page.locator('.cinema-player').count(),0);await page.keyboard.press('Escape');assert.equal(await page.locator('.detail-modal').count(),0);
  await page.getByRole('button',{name:'电影',exact:true}).click();await page.setViewportSize({width:960,height:650});await page.getByRole('button',{name:'列表视图',exact:true}).click();await page.locator('.main-scroll').evaluate(el=>{el.scrollTop=220;});const top=await page.locator('.main-scroll').evaluate(el=>el.scrollTop);assert.ok(top>100);await page.getByRole('button',{name:'电视剧',exact:true}).click();await back.click();assert.ok(Math.abs(await page.locator('.main-scroll').evaluate(el=>el.scrollTop)-top)<2);
  await fs.mkdir('reference',{recursive:true});await page.screenshot({path:'reference/navigation-restored.png',animations:'disabled'});assert.deepEqual(errors,[]);
  console.log('PASS: route history, filters/layout/sort/scroll restoration, search back, nested modal back, equal control sizes, anchored menus, pointer bridge/leave, single menu and fullscreen/player/detail back layers');
} finally {await app?.close();await fs.rm(fixture,{recursive:true,force:true});}
