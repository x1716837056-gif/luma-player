import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
async function until(check){const deadline=Date.now()+25000;while(!await check()){if(Date.now()>deadline)throw new Error('Player state timed out');await new Promise(r=>setTimeout(r,100));}}
const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'luma-mpv-ui-'));
const movies=path.join(fixture,'Movies');await fs.mkdir(movies);await fs.mkdir('reference',{recursive:true});
await exec(path.resolve('tools/ffmpeg/ffmpeg-master-latest-win64-lgpl/bin/ffmpeg.exe'),['-v','error','-y','-i',path.resolve('public/demo.mp4'),'-an','-c:v','copy',path.join(movies,'Resume.2024.mkv')],{windowsHide:true});
let app;
try {
  app=await electron.launch({...(process.env.LUMA_PACKAGED_EXE ? {executablePath:process.env.LUMA_PACKAGED_EXE} : {}),args:[...(process.env.LUMA_PACKAGED_EXE ? [] : ['.']),`--user-data-dir=${path.join(fixture,'profile')}`],timeout:30000});
  const page=await app.firstWindow(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('button',{name:'影片详情',exact:true}).waitFor();
  await page.evaluate(async folder=>{
    const settings=await window.desktop.loadSettings();
    await window.desktop.saveSettings({...settings,watchFolders:false,autoScrape:false,defaultPlayer:'mpv'});
    await window.desktop.scanFolder(folder,'local');
  },movies);
  // Reload fetches settings, as it would after saving them from the settings modal.
  await page.reload();
  await until(()=>page.evaluate(async()=>Boolean((await window.desktop.loadLibrary())?.media[0]?.technical)));
  await page.getByRole('button',{name:'查看 Resume',exact:true}).click();
  await page.getByRole('button',{name:'立即播放',exact:true}).click();
  await page.getByRole('region',{name:'mpv 播放控制'}).waitFor();
  await until(()=>page.evaluate(async()=>{const state=await window.desktop.playerState();return state.active && state.duration>10;}));
  await page.getByRole('button',{name:'暂停 mpv 播放',exact:true}).click();
  await until(()=>page.evaluate(async()=>(await window.desktop.playerState()).paused));
  await page.evaluate(()=>window.desktop.playerControl('seek',15));
  await until(()=>page.evaluate(async()=>(await window.desktop.playerState()).position>=14));
  await page.screenshot({path:'reference/desktop-mpv-panel.png'});
  await page.getByRole('button',{name:'停止 mpv 播放',exact:true}).click();
  await until(()=>page.evaluate(async()=>!(await window.desktop.playerState()).active));
  const lib=await page.evaluate(()=>window.desktop.loadLibrary());
  assert.ok(lib.media[0].progress>0);assert.ok(lib.media[0].technical);
  assert.deepEqual(errors,[]);
  console.log('PASS: sandboxed Electron UI, live library events, ffprobe task, mpv controls and final progress persistence');
} finally {await app?.close();await fs.rm(fixture,{recursive:true,force:true});}
