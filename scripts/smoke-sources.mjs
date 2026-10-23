import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'luma-sources-'));
let app;
try {
  app=await electron.launch({args:['.',`--user-data-dir=${fixture}`],timeout:30000});
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('button',{name:'影片详情',exact:true}).waitFor();
  await page.evaluate(async()=>{
    await window.desktop.saveSettings({...await window.desktop.loadSettings(),autoScrape:false,watchFolders:false});
    await window.desktop.saveLibrary({demo:false,media:[],sources:Array.from({length:24},(_,i)=>({id:`long-source-${i}`,name:`${i+1} · ${'[4K影音收藏] 坚如磐石 Captain.Marvel.2019.2160p.BluRay.REMUX.HEVC.DTS-HD.MA.TrueHD.7.1.Atmos '.repeat(2)}`,path:`Z:\\Movies\\${'Long folder name · '.repeat(12)}${i}`,type:i%2?'nas':'local',status:i%3?'online':'offline'}))});
  });
  await page.locator('.source-item').first().waitFor();
  const rows=await page.locator('.source-item').evaluateAll(items=>items.map(item=>{
    const label=item.querySelector('.source-label'),icon=item.querySelector('svg'),dot=item.querySelector('.status-dot');
    return {height:item.getBoundingClientRect().height,labelHeight:label.getBoundingClientRect().height,nowrap:getComputedStyle(label).whiteSpace,iconWidth:icon.getBoundingClientRect().width,dotWidth:dot.getBoundingClientRect().width,title:item.title};
  }));
  assert.equal(rows.length,24);
  assert.ok(rows.every(row=>row.height===43&&row.labelHeight<=20&&row.nowrap==='nowrap'&&row.iconWidth===17&&row.dotWidth===5&&row.title.includes('Z:')));
  assert.equal(await page.locator('.source-scroll').evaluate(el=>el.scrollHeight>el.clientHeight),true);
  const all=page.getByRole('button',{name:'所有文件来源',exact:true});
  assert.ok((await all.boundingBox()).y<950);
  await page.locator('.source-item').last().click();
  await page.locator('.toolbar-title').waitFor();
  assert.ok(await page.locator('.toolbar-title').evaluate(el=>el.scrollWidth>el.clientWidth));
  await all.click();
  assert.ok(await page.locator('.source-card').first().evaluate(el=>el.scrollWidth<=el.clientWidth));
  await fs.mkdir('reference',{recursive:true});await page.screenshot({path:'reference/sources-fixed.png'});
  await page.setViewportSize({width:960,height:650});
  await page.waitForTimeout(150);
  const compact=await all.boundingBox();assert.ok(compact.y>=0&&compact.y+compact.height<=650);
  assert.ok((await page.locator('.library-taskbar').boundingBox()).x>=180);
  assert.equal(await page.locator('.source-label').first().isVisible(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'reference/sources-compact.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: 24 long source names, stable icons/status, full-path tooltips, independent scrolling, truncated page title/cards and compact layout');
}finally{await app?.close();await fs.rm(fixture,{recursive:true,force:true});}
