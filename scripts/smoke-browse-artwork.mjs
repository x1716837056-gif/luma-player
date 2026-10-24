// Test credentials come from the environment; all settings, artwork and library data are temporary.
import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const token=process.env.LUMA_TEST_TMDB_TOKEN;if(!token)throw Error('A privately supplied test credential is required.');
const inventory=JSON.parse(await fs.readFile('verification-local/media-fixtures.json','utf8')),movies=inventory.entries.filter(m=>m.available&&/captain[ .]marvel/i.test(m.path));assert.equal(movies.length,2);
const before=await Promise.all(movies.map(m=>fs.stat(m.path))),profile=await fs.mkdtemp(path.join(os.tmpdir(),'luma-browse-ui-'));let app,page;
async function until(check,ms=90000){const end=Date.now()+ms;while(!await check()){if(Date.now()>end)throw Error('Artwork state did not settle');await new Promise(r=>setTimeout(r,100));}}
async function ready(){await page.waitForFunction(()=>document.documentElement.dataset.lumaReady==='true');}
async function loaded(){await until(()=>page.locator('.browse-card img').evaluateAll(imgs=>imgs.length>0&&imgs.every(img=>img.complete&&img.naturalWidth>0)));}
try{
  await fs.mkdir('reference',{recursive:true});
  app=await electron.launch({...(process.env.LUMA_PACKAGED_EXE?{executablePath:process.env.LUMA_PACKAGED_EXE}:{}),args:[...(process.env.LUMA_PACKAGED_EXE?[]:['.']),`--user-data-dir=${profile}`],timeout:30000});page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:900});await ready();
  await page.evaluate(async({token,roots})=>{await window.desktop.saveSettings({...await window.desktop.loadSettings(),tmdbToken:token,autoScrape:false,watchFolders:false});for(const folder of roots)await window.desktop.scanFolder(folder,'local');},{token,roots:movies.map(m=>path.dirname(m.path))});
  await until(()=>page.evaluate(async()=>(await window.desktop.loadLibrary()).media.every(m=>m.technical)));
  await page.evaluate(async()=>{const l=await window.desktop.loadLibrary();await window.desktop.applyMetadata(l.media[0].id,{tmdbId:299537,kind:'movie'});});
  const matched=await page.evaluate(()=>window.desktop.loadLibrary());assert.ok(matched.media.every(m=>m.people?.some(p=>p.role==='director'&&p.photo?.startsWith('luma-media:'))));assert.ok(matched.media[0].collection?.poster?.startsWith('luma-media:'));
  // Remove only derived artwork to emulate a library created before people photos were supported.
  await page.evaluate(async()=>{const l=await window.desktop.loadLibrary();await window.desktop.saveLibrary({...l,media:l.media.map(m=>({...m,notes:'Keep my viewing note',progress:.35,people:undefined,browseArtworkCheckedAt:undefined,collection:m.collection?{id:m.collection.id,name:m.collection.name}:undefined}))});});
  await page.reload();await ready();await page.getByRole('button',{name:'人物与系列',exact:true}).click();await page.getByRole('button',{name:'补全图片',exact:true}).waitFor();await page.getByRole('button',{name:'补全图片',exact:true}).click();await page.getByRole('button',{name:'补全图片',exact:true}).waitFor();await loaded();
  assert.equal(await page.locator('.browse-card').count(),matched.media[0].directors.length);await page.screenshot({animations:'disabled',path:'reference/browse-directors-dark.png'});
  await page.locator('.browse-card').first().click();assert.equal(await page.locator('.poster-card').count(),1);await page.getByRole('button',{name:'返回上一页',exact:true}).click();
  await page.getByRole('navigation',{name:'浏览方式'}).getByRole('button',{name:'演员',exact:true}).click();await loaded();await page.setViewportSize({width:1920,height:1080});await page.screenshot({animations:'disabled',path:'reference/browse-actors-1920.png'});
  await page.getByRole('button',{name:'切换到浅色模式',exact:true}).click();await page.setViewportSize({width:920,height:650});await page.screenshot({animations:'disabled',path:'reference/browse-actors-light-920.png'});
  assert.equal(await page.evaluate(()=>document.querySelector('.main-scroll').scrollWidth>document.querySelector('.main-scroll').clientWidth+1),false);
  await page.getByRole('navigation',{name:'浏览方式'}).getByRole('button',{name:'电影系列',exact:true}).click();await loaded();assert.equal(await page.locator('.browse-card').count(),1);await page.screenshot({animations:'disabled',path:'reference/browse-collection-light.png'});
  await page.evaluate(async()=>{const l=await window.desktop.loadLibrary();await window.desktop.updatePersonal(l.media[0].id,{collectionName:'我的电影系列'});});await loaded();assert.equal(await page.locator('.is-collage').count(),1);await page.screenshot({animations:'disabled',path:'reference/browse-custom-collection.png'});
  // Cached local artwork remains usable when online requests are unavailable.
  await page.context().setOffline(true);await page.reload();await ready();await page.getByRole('button',{name:'人物与系列',exact:true}).click();await loaded();
  const stored=await page.evaluate(()=>window.desktop.loadLibrary());assert.ok(stored.media.every(m=>m.notes==='Keep my viewing note'&&m.progress===.35));
  await page.setViewportSize({width:420,height:650});await page.screenshot({animations:'disabled',path:'reference/browse-people-420.png'});assert.equal(await page.evaluate(()=>document.querySelector('.main-scroll').scrollWidth>document.querySelector('.main-scroll').clientWidth+1),false);
  await page.evaluate(async()=>{const l=await window.desktop.loadLibrary();await window.desktop.saveLibrary({...l,media:l.media.map(m=>({...m,people:m.people.map(p=>({...p,photo:'data:image/png;base64,broken'}))}))});});await until(()=>page.locator('.browse-card img').count().then(n=>n===0));assert.equal(await page.locator('.browse-no-image').count(),await page.locator('.browse-card').count());assert.deepEqual(errors,[]);
  console.log('PASS real TMDB director/actor photos and collection images, legacy backfill, nested local protocol/cache, offline display, preserved notes/progress, facet navigation and dark/light/narrow layouts');
}catch(error){await page?.screenshot({animations:'disabled',path:'reference/browse-artwork-failure.png'});throw error;}
finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});for(let i=0;i<movies.length;i++){const after=await fs.stat(movies[i].path);assert.equal(after.size,before[i].size);assert.equal(after.mtimeMs,before[i].mtimeMs);}}
