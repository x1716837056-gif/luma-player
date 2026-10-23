// Opt-in read-only media test. The supplied profile is read, never changed.
import {_electron as electron} from 'playwright';
import Database from 'better-sqlite3';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const source=process.argv[2];if(!source)throw new Error('Provide the existing profile directory.');
async function until(check,timeout=25000){const deadline=Date.now()+timeout;while(!await check()){if(Date.now()>deadline)throw new Error('Timed out waiting for library/player state');await new Promise(r=>setTimeout(r,200));}}
const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'luma-user-library-'));
const db=new Database(path.join(source,'library.sqlite'),{readonly:true});
const media=db.prepare('SELECT data FROM media').all().map(row=>JSON.parse(row.data)).filter(m=>/磐石|captain.*marvel/i.test(m.title+' '+m.path));db.close();
assert.equal(media.length,2);
const before=await Promise.all(media.map(m=>fs.stat(m.path)));
await fs.copyFile(path.join(source,'Local State'),path.join(fixture,'Local State'));
const settings=JSON.parse(await fs.readFile(path.join(source,'settings.json'),'utf8'));
await fs.writeFile(path.join(fixture,'settings.json'),JSON.stringify({...settings,defaultPlayer:'native',autoScrape:true,watchFolders:false}));
let app;
try {
  app=await electron.launch({...(process.env.LUMA_PACKAGED_EXE?{executablePath:process.env.LUMA_PACKAGED_EXE}:{}),args:[...(process.env.LUMA_PACKAGED_EXE?[]:['.']),`--user-data-dir=${fixture}`],timeout:30000});
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('button',{name:'影片详情',exact:true}).waitFor();
  for(const item of media)await page.evaluate(folder=>window.desktop.scanFolder(folder,'nas'),path.dirname(item.path));
  await until(()=>page.evaluate(async()=>{const library=await window.desktop.loadLibrary();return library?.media.length===2&&library.media.every(m=>m.metadataStatus==='matched'&&m.technical?.videoCodec==='hevc');}),90000);
  const library=await page.evaluate(()=>window.desktop.loadLibrary());
  console.log(library.media.map(m=>({title:m.title,origin:m.metadataOrigin,posterLocal:m.poster?.startsWith('luma-media:'),cast:m.cast?.length,error:m.metadataError,certification:m.certification,region:m.certificationRegion,recommendedAge:m.minimumAge})));
  assert.ok(library.media.every(m=>m.poster.startsWith('luma-media:')&&m.cast.length>0&&!m.metadataError));
  console.log('PASS: live API Key authentication, automatic matching, details and local artwork for both imported HEVC movies');
  await fs.mkdir('reference',{recursive:true});
  await page.screenshot({path:'reference/user-library-scraped.png'});
  await page.getByRole('button',{name:'电影',exact:true}).click();
  await page.getByRole('combobox',{name:'建议观看年龄分类',exact:true}).selectOption('16');
  await page.getByRole('combobox',{name:'上映年份分类',exact:true}).selectOption('2023');
  assert.equal(await page.locator('.poster-card').count(),1);
  assert.equal(await page.getByRole('button',{name:'查看 坚如磐石',exact:true}).count(),1);
  await page.screenshot({path:'reference/user-movie-categories.png'});
  await page.getByRole('button',{name:'重置分类',exact:true}).click();
  console.log('PASS: real regional certificates drive the combined recommended-age and release-year filters');
  for(const item of library.media) {
    await page.getByRole('button',{name:`查看 ${item.title}`,exact:true}).click();
    await page.getByRole('dialog',{name:`${item.title} 影片详情`}).getByRole('button',{name:/立即播放|继续播放 ·/}).click();
    await page.getByRole('region',{name:'mpv 播放控制'}).waitFor({timeout:25000});
    await until(()=>page.evaluate(async()=>{const state=await window.desktop.playerState();return state.active&&state.position>0;}));
    await page.getByRole('button',{name:'暂停 mpv 播放',exact:true}).click();
    await until(()=>page.evaluate(async()=>(await window.desktop.playerState()).paused));
    await page.evaluate(()=>window.desktop.playerControl('seek',90));
    await until(()=>page.evaluate(async()=>(await window.desktop.playerState()).position>89));
    await page.getByRole('button',{name:'停止 mpv 播放',exact:true}).click();
    await until(()=>page.evaluate(async()=>!(await window.desktop.playerState()).active));
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    console.log(`PASS: ${item.title} routes from the legacy native setting to HEVC playback, pause, seek and stop`);
  }
  assert.deepEqual(errors,[]);
  for(let i=0;i<media.length;i++){const after=await fs.stat(media[i].path);assert.equal(after.size,before[i].size);assert.equal(after.mtimeMs,before[i].mtimeMs);}
  console.log('PASS: original files unchanged; no renderer exceptions');
}finally{await app?.close();await fs.rm(fixture,{recursive:true,force:true});}
