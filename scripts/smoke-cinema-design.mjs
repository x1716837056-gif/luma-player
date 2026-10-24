import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fixtures from './media-fixtures.cjs';
const movie=fixtures.selectFixture('browser-ui');
const original=movie?await fs.stat(movie.path):null;
const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'luma-cinema-design-'));
let app;
try {
  app=await electron.launch({...(process.env.LUMA_PACKAGED_EXE?{executablePath:process.env.LUMA_PACKAGED_EXE}:{}),args:[...(process.env.LUMA_PACKAGED_EXE?[]:['.']),`--user-data-dir=${fixture}`],timeout:30000});
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:900});await page.waitForFunction(()=>document.documentElement.dataset.lumaReady==='true');
  if(movie){
    await page.evaluate(async folder=>{await window.desktop.saveSettings({...await window.desktop.loadSettings(),autoScrape:false,watchFolders:false,defaultPlayer:'native'});await window.desktop.scanFolder(folder,'local');},path.dirname(movie.path));
    await page.waitForFunction(async()=>Boolean((await window.desktop.loadLibrary()).media.find(m=>m.technical)),null,{timeout:30000});
    await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.lumaReady==='true');
    await page.locator('.poster-card').first().click();await page.getByRole('button',{name:'立即播放',exact:true}).click();
  }else await page.locator('.hero .play-button').click();
  console.log('Browser interface coverage:',movie?'private real-media library':'synthetic demo (no private inventory)');
  await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2,null,{timeout:30000});
  await page.locator('video').evaluate(v=>{v.pause();v.currentTime=16;});
  await page.getByLabel('选择 VTT 字幕',{exact:true}).setInputFiles({name:'safe-area.vtt',mimeType:'text/vtt',buffer:Buffer.from('WEBVTT\n\nauto\n00:00.000 --> 00:30.000\nGood stories deserve a little more room.\n\nfixed\n00:31.000 --> 00:32.000 line:10%\nAuthored subtitle position\n')});
  await page.waitForFunction(()=>document.querySelector('video')?.textTracks[0]?.cues?.length===2);
  await page.waitForFunction(()=>typeof document.querySelector('video').textTracks[0].cues[0].line==='number');
  await fs.mkdir('reference',{recursive:true});
  const sizes=[[1920,1080],[1440,900],[920,650],[640,360],[420,360]];
  for(const [width,height] of sizes){
    await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const dock=page.locator('.cinema-dock'),box=await dock.boundingBox(),timeline=await page.locator('.cinema-timeline').boundingBox(),row=await page.locator('.cinema-dock-row').boundingBox();
    assert.ok(box.width<=1120&&box.x>=15&&box.x+box.width<=width-15);assert.equal(box.height,90);assert.ok(Math.abs(height-box.y-box.height-24)<2);assert.ok(timeline.y+timeline.height<row.y);
    const style=await dock.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,border:s.borderTopWidth,blur:s.backdropFilter};});assert.equal(style.background,'rgba(0, 0, 0, 0)');assert.equal(style.border,'0px');assert.equal(style.blur,'none');assert.equal(await page.locator('.cinema-wordmark').count(),0);
    const controls=await page.locator('.cinema-dock-row .cinema-button:visible').evaluateAll(items=>items.map(el=>{const b=el.getBoundingClientRect();return {label:el.getAttribute('aria-label'),x:b.x,y:b.y,w:b.width,h:b.height};}));
    for(const control of controls){const primary=['播放','暂停'].includes(control.label);assert.equal(control.w,primary?44:40);assert.equal(control.h,primary?44:40);assert.ok(control.x>=box.x-1&&control.x+control.w<=box.x+box.width+1);}
    for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];assert.ok(a.x+a.w<=b.x+.5||b.x+b.w<=a.x+.5,`Overlapping controls at ${width}: ${a.label}, ${b.label}`);}
    const cues=await page.locator('video').evaluate(v=>Array.from(v.textTracks[0].cues).map(c=>({id:c.id,line:c.line,align:c.lineAlign,snap:c.snapToLines})));assert.ok(cues[0].line>10&&cues[0].line<95);assert.equal(cues[0].align,'end');assert.equal(cues[1].line,10);
    await page.screenshot({path:`reference/cinema-apple-${width}x${height}.png`,animations:'disabled'});
    for(const name of ['播放速度','音轨语言','字幕选项']){
      const trigger=page.getByRole('button',{name,exact:true});await trigger.click();const menu=page.locator('.cinema-dock [role=menu]');await menu.waitFor();const a=await trigger.boundingBox(),m=await menu.boundingBox();assert.ok(m.y+m.height<a.y);assert.ok(m.x>=11&&m.x+m.width<=width-11);
      await page.mouse.move(m.x+m.width/2,m.y+m.height-8,{steps:5});await page.waitForTimeout(230);assert.equal(await menu.count(),1);
      if(name==='字幕选项'&&[1440,640].includes(width))await page.screenshot({path:`reference/cinema-apple-menu-${width}.png`,animations:'disabled'});
      await page.mouse.move(5,height/2);await menu.waitFor({state:'detached'});
    }
  }
  await page.setViewportSize({width:1440,height:900});await page.locator('.cinema-player').focus();await page.locator('video').evaluate(v=>v.play());await page.mouse.move(700,350);
  await page.waitForFunction(()=>!document.querySelector('.cinema-player').classList.contains('show-controls'),null,{timeout:7000});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.cinema-shade')).opacity==='0');
  const restored=await page.locator('video').evaluate(v=>({line:v.textTracks[0].cues[0].line,snap:v.textTracks[0].cues[0].snapToLines,fixed:v.textTracks[0].cues[1].line}));assert.equal(restored.line,'auto');assert.equal(restored.snap,true);assert.equal(restored.fixed,10);
  await page.screenshot({path:'reference/cinema-apple-hidden.png',animations:'disabled'});
  await page.keyboard.press('Tab');await page.waitForFunction(()=>document.querySelector('.cinema-player').classList.contains('show-controls'));await page.waitForTimeout(3200);assert.ok(await page.locator('.cinema-player').evaluate(el=>el.classList.contains('show-controls')));
  await page.locator('video').evaluate(v=>v.pause());await page.mouse.move(720,790);await page.screenshot({path:'reference/cinema-apple-timeline-hover.png',animations:'disabled'});
  await page.getByRole('button',{name:'关闭播放器',exact:true}).click();assert.deepEqual(errors,[]);
  console.log('PASS: Apple TV overlay, 1920/1440/920/640/420 layouts, independent anchored menus, VTT safe-area/restoration, authored cue preservation, keyboard focus and idle fade');
} finally {await app?.close();await fs.rm(fixture,{recursive:true,force:true});if(movie){const after=await fs.stat(movie.path);assert.equal(after.size,original.size);assert.equal(after.mtimeMs,original.mtimeMs);}}
