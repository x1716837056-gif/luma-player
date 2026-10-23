// Measures the actual packaged app, including process launch, library hydration and two painted frames.
// A fresh profile is not the same as an OS cold boot; antivirus, disk and hardware affect other PCs.
import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const executable=process.argv[2]||process.env.LUMA_PACKAGED_EXE;
if(!executable)throw new Error('Pass the installed or unpacked Luma.exe, not the installer.');
const limit=Number(process.env.LUMA_STARTUP_LIMIT_MS||3000);
const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'luma-startup-'));
const samples=[];
let app;
async function measure(label,profile) {
  const started=performance.now();
  app=await electron.launch({executablePath:path.resolve(executable),args:[`--user-data-dir=${profile}`],timeout:60000});
  const page=await app.firstWindow();
  await page.waitForFunction(()=>document.documentElement.dataset.lumaReady==='true');
  await page.getByRole('button',{name:'添加影片',exact:true}).waitFor();
  assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()));
  const elapsedMs=Math.round(performance.now()-started);
  samples.push({scenario:label,elapsedMs});
  console.log(`${label}: ${elapsedMs} ms`);
  if(label==='offline-nas')assert.equal((await page.evaluate(()=>window.desktop.loadLibrary())).media[0].title,'离线影片');
  await app.close();app=null;
}
try {
  for(let i=1;i<=3;i++)await measure(`fresh-profile-${i}`,path.join(fixture,`fresh-${i}`));
  for(let i=1;i<=3;i++)await measure(`existing-profile-${i}`,path.join(fixture,'fresh-1'));
  const offline=path.join(fixture,'offline');await fs.mkdir(offline);
  await fs.writeFile(path.join(offline,'settings.json'),JSON.stringify({autoScrape:false,watchFolders:true}));
  const sourcePath='\\\\127.0.0.1\\Luma-unavailable-startup';
  // Use the application's migration path rather than fabricating its SQLite schema.
  await fs.writeFile(path.join(offline,'library.json'),JSON.stringify({demo:false,sources:[{id:'offline-nas',name:'离线 NAS',path:sourcePath,type:'nas',status:'offline'}],media:[{
    id:'offline-movie',sourceId:'offline-nas',path:sourcePath+'\\Movie.mkv',title:'离线影片',originalTitle:'Offline Movie',year:2023,kind:'movie',genre:['剧情'],duration:100,rating:'',certification:'',poster:'',backdrop:'',description:'离线时仍能浏览缓存资料。',quality:'4K',addedAt:1,favorite:true,progress:.4,missing:true
  }]}));
  await measure('offline-nas',offline);
  const report={version:JSON.parse(await fs.readFile('package.json','utf8')).version,executable:path.resolve(executable),platform:process.platform,release:os.release(),cpu:os.cpus()[0]?.model,samples,maxMs:Math.max(...samples.map(s=>s.elapsedMs)),limitMs:limit};
  await fs.mkdir('reference',{recursive:true});
  await fs.writeFile(`reference/startup-${report.version}.json`,JSON.stringify(report,null,2)+'\n');
  assert.ok(report.maxMs<=limit,`Startup exceeded ${limit} ms: ${report.maxMs} ms`);
  console.log(`PASS: loaded, visible library in <= ${limit} ms for all ${samples.length} launches; includes offline NAS`);
} finally {
  await app?.close();await fs.rm(fixture,{recursive:true,force:true});
}
