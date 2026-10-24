// Uses the owner's private, read-only media inventory and an isolated application profile.
import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import fixtures from './media-fixtures.cjs';
const inventory=JSON.parse(await fs.readFile('verification-local/media-fixtures.json','utf8'));
const movies=inventory.entries.filter(e=>e.available&&/captain[ .]marvel/i.test(e.path));
assert.equal(movies.length,2,'The two authorized versions must be available');
const tv=fixtures.selectFixture('season-episode-parsing');assert.ok(tv);
const originals=[...movies,tv],before=await Promise.all(originals.map(m=>fs.stat(m.path)));
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'luma-management-ui-'));let app,page;
async function until(check,timeout=45000){const end=Date.now()+timeout;while(!await check()){if(Date.now()>end)throw Error('Management state did not settle');await new Promise(r=>setTimeout(r,100));}}
async function ready(){await page.waitForFunction(()=>document.documentElement.dataset.lumaReady==='true');}
async function library(){return page.evaluate(()=>window.desktop.loadLibrary());}
async function closeDetails(){await page.getByRole('dialog',{name:/影片详情$/}).getByRole('button',{name:'关闭',exact:true}).click();}
try{
  await fs.mkdir('reference',{recursive:true});
  app=await electron.launch({env:{...process.env,LUMA_TEST_AUDIO_OUTPUT:'null'},...(process.env.LUMA_PACKAGED_EXE?{executablePath:process.env.LUMA_PACKAGED_EXE}:{}),args:[...(process.env.LUMA_PACKAGED_EXE?[]:['.']),`--user-data-dir=${profile}`],timeout:30000});
  page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:900});await ready();
  await page.evaluate(async roots=>{await window.desktop.saveSettings({...await window.desktop.loadSettings(),watchFolders:false,autoScrape:false,defaultPlayer:'mpv'});for(const folder of roots)await window.desktop.scanFolder(folder,'local');},movies.map(m=>path.dirname(m.path)));
  await until(()=>page.evaluate(async()=>{const l=await window.desktop.loadLibrary();return l.media.length===2&&l.media.every(m=>m.technical);}));
  // Controlled manual metadata for offline UI acceptance; live scraping has its own smoke test.
  await page.evaluate(async()=>{const l=await window.desktop.loadLibrary();await window.desktop.saveLibrary({...l,media:l.media.map(m=>({...m,metadataOrigin:'manual',metadataStatus:'matched'}))});});
  await page.reload();await ready();await page.getByRole('button',{name:'电影',exact:true}).click();assert.equal(await page.locator('.poster-card').count(),1);assert.match(await page.locator('.series-count').innerText(),/2 个版本/);
  const initial=await library(),first=initial.media[0],second=initial.media[1];assert.notEqual(first.fileSize,second.fileSize);
  await page.locator('.poster-art').click();assert.equal(await page.locator('.version-row').count(),2);
  await page.getByRole('button',{name:'加入想看清单',exact:true}).click();await until(async()=>(await library()).media.every(m=>m.watchlist));
  await page.getByRole('button',{name:'编辑评分和笔记',exact:true}).click();await page.getByRole('combobox',{name:'我的评分',exact:true}).selectOption('8.5');await until(async()=>(await library()).media.every(m=>m.personalRating===8.5));
  await page.getByRole('textbox',{name:'观影笔记',exact:true}).fill('观影管理测试：两个版本共享笔记，进度分别保存。');await page.getByRole('textbox',{name:'电影系列',exact:true}).fill('我的测试系列');
  // Draft survives switching the preferred version inside the same movie.
  await page.getByRole('button',{name:`首选版本 ${second.id}`,exact:true}).click();await until(async()=>(await library()).media.find(m=>m.id===second.id).preferredVersion);
  assert.match(await page.getByRole('textbox',{name:'观影笔记',exact:true}).inputValue(),/两个版本共享笔记/);await page.getByRole('button',{name:'保存笔记',exact:true}).click();await until(async()=>(await library()).media.every(m=>m.notes?.includes('两个版本')));
  await page.screenshot({animations:'disabled',path:'reference/management-detail-dark.png'});
  await page.setViewportSize({width:920,height:650});await page.screenshot({animations:'disabled',path:'reference/management-detail-920.png'});assert.equal(await page.evaluate(()=>document.querySelector('.detail-modal').scrollWidth>document.querySelector('.detail-modal').clientWidth+1),false);await closeDetails();
  await page.getByRole('button',{name:'观影管理',exact:true}).click();assert.equal(await page.locator('.poster-card').count(),1);for(const name of ['我的评分','观影笔记']){await page.getByRole('navigation',{name:'观影管理分类'}).getByRole('button',{name,exact:true}).click();assert.equal(await page.locator('.poster-card').count(),1);}
  await page.evaluate(async id=>{await window.desktop.updateMedia(id,{progress:.27,lastPlayedAt:100});},first.id);await page.evaluate(async id=>{await window.desktop.updateMedia(id,{progress:.63,lastPlayedAt:200});},second.id);
  await page.locator('.poster-art').click();await page.getByRole('button',{name:'标记已看',exact:true}).click();await until(async()=>(await library()).media.every(m=>m.watched));let saved=await library();assert.equal(saved.media.find(m=>m.id===first.id).progress,.27);assert.equal(saved.media.find(m=>m.id===second.id).progress,.63);await closeDetails();
  await page.getByRole('navigation',{name:'观影管理分类'}).getByRole('button',{name:'已看',exact:true}).click();assert.equal(await page.locator('.poster-card').count(),1);await page.getByRole('navigation',{name:'观影管理分类'}).getByRole('button',{name:'未看',exact:true}).click();assert.equal(await page.locator('.poster-card').count(),0);
  await page.evaluate(async()=>{for(const m of (await window.desktop.loadLibrary()).media)await window.desktop.scanFolder(m.path.replace(/[\\/][^\\/]+$/,''),'local');});await page.reload();await ready();saved=await library();assert.ok(saved.media.every(m=>m.watchlist&&m.notes&&m.personalRating===8.5));assert.equal(saved.media.find(m=>m.id===first.id).progress,.27);
  // Isolated facet metadata exercises browsing without claiming online metadata availability.
  await page.evaluate(async()=>{const l=await window.desktop.loadLibrary();await window.desktop.saveLibrary({...l,media:l.media.map(m=>({...m,directors:['测试导演'],cast:['测试演员']}))});});
  await page.getByRole('button',{name:'人物与系列',exact:true}).click();await page.locator('.browse-card').filter({hasText:'测试导演'}).click();assert.equal(await page.locator('.poster-card').count(),1);await page.getByRole('button',{name:'返回上一页',exact:true}).click();await page.getByRole('navigation',{name:'浏览方式'}).getByRole('button',{name:'演员',exact:true}).click();assert.match(await page.locator('.browse-card').innerText(),/测试演员/);await page.getByRole('navigation',{name:'浏览方式'}).getByRole('button',{name:'电影系列',exact:true}).click();await page.locator('.browse-card').filter({hasText:'我的测试系列'}).click();assert.equal(await page.locator('.poster-card').count(),1);
  await page.getByRole('button',{name:'切换到浅色模式',exact:true}).click();await page.getByRole('button',{name:'版本与重复',exact:true}).click();assert.equal(await page.locator('.version-row').count(),2);await page.screenshot({animations:'disabled',path:'reference/management-versions-light-920.png'});
  await page.getByRole('button',{name:'重复文件检查',exact:true}).click();await page.getByRole('button',{name:'扫描重复文件',exact:true}).click();await until(()=>page.evaluate(async()=>{const s=await window.desktop.duplicateStatus();return !s.running&&s.phase==='complete';}));const duplicates=await page.evaluate(()=>window.desktop.duplicateStatus());assert.equal(duplicates.groups.length,0);assert.equal(duplicates.errors.length,0);
  // Play selected/preferred real files through main, then stop before continuing GUI checks.
  await app.evaluate(({app})=>{const {MpvPlayer}=process.mainModule.require(app.getAppPath()+'/electron/mpv.cjs'),start=MpvPlayer.prototype.start;MpvPlayer.prototype.start=function(...args){globalThis.managementTestPlayer=this;return start.apply(this,args);};});
  await page.getByRole('button',{name:'多个版本 · 1',exact:true}).click();await page.getByRole('button',{name:`播放版本 ${second.id}`,exact:true}).click();await until(()=>page.evaluate(async()=>{const s=await window.desktop.playerState();return s.active&&s.tracks?.length>0;}));assert.equal((await page.evaluate(()=>window.desktop.playerState())).mediaId,second.id);assert.ok((await page.evaluate(()=>window.desktop.playerState())).position<10);await page.evaluate(()=>window.desktop.playerControl('stop'));
  await page.getByRole('button',{name:'电影',exact:true}).click();await page.locator('.poster-art').click();await page.getByRole('button',{name:'标记未看',exact:true}).click();await until(async()=>(await library()).media.every(m=>!m.watched&&m.progress===0));await closeDetails();
  await page.evaluate(async folder=>window.desktop.scanFolder(folder,'local'),path.dirname(tv.path));await until(()=>page.evaluate(async()=>{const l=await window.desktop.loadLibrary();return l.media.filter(m=>m.kind==='tv').length===6&&l.media.every(m=>m.technical);}));await page.evaluate(async()=>{const l=await window.desktop.loadLibrary();await window.desktop.saveLibrary({...l,media:l.media.map(m=>({...m,metadataOrigin:'manual',metadataStatus:'matched'}))});});await page.getByRole('button',{name:'电视剧',exact:true}).click();assert.equal(await page.locator('.poster-card').count(),1);await page.locator('.poster-art').click();await page.getByRole('button',{name:'查看第 4 季',exact:true}).click();
  const eps=(await library()).media.filter(m=>m.kind==='tv').sort((a,b)=>a.episodeNumber-b.episodeNumber);await page.evaluate(async ids=>{await window.desktop.updateMedia(ids[0],{progress:.24,lastPlayedAt:100});await window.desktop.updateMedia(ids[1],{progress:.61,lastPlayedAt:200});},eps.map(m=>m.id));await page.getByRole('button',{name:'第 3 集标记已看',exact:true}).click();await until(async()=>(await library()).media.find(m=>m.id===eps[0].id).watched);saved=await library();assert.equal(saved.media.find(m=>m.id===eps[0].id).progress,.24);assert.equal(saved.media.find(m=>m.id===eps[1].id).progress,.61);assert.ok(!saved.media.find(m=>m.id===eps[1].id).watched);
  await page.setViewportSize({width:1440,height:900});await page.screenshot({animations:'disabled',path:'reference/management-episode-light.png'});await page.getByRole('button',{name:'第 3 集标记未看',exact:true}).click();await until(async()=>(await library()).media.find(m=>m.id===eps[0].id).progress===0);assert.equal((await library()).media.find(m=>m.id===eps[1].id).progress,.61);
  assert.deepEqual(errors,[]);console.log('PASS real two-version aggregation/preference/playback, watchlist/rating/notes persistence/rescan, facet browsing, duplicate negative scan, independent TV progress/watched and light/narrow UI');
}catch(error){await page?.screenshot({animations:'disabled',path:'reference/management-failure.png'});throw error;}
finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});for(let i=0;i<originals.length;i++){const after=await fs.stat(originals[i].path);assert.equal(after.size,before[i].size);assert.equal(after.mtimeMs,before[i].mtimeMs);}}
