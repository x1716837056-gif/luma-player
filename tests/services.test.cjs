const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const {openLibraryDatabase}=require('../electron/database.cjs');
const {LibraryService}=require('../electron/library-service.cjs');
const {cacheArtwork}=require('../electron/metadata.cjs');
async function temporary(t) {const root=await fs.mkdtemp(path.join(os.tmpdir(),'luma-services-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
async function until(check,timeout=12000) {const deadline=Date.now()+timeout;while(!check()){if(Date.now()>deadline)throw new Error('Timed out waiting for expected state');await delay(100);}}
const media={id:'movie',path:'D:/Movies/Dune.mkv',sourceId:'local',title:'Dune',originalTitle:'Dune',kind:'movie',year:2021,genre:[],description:'',duration:1,poster:'',backdrop:'',quality:'4K',rating:'',certification:'',addedAt:1,technical:{durationSeconds:60},imported:true};
test('SQLite migrates legacy JSON once, retains original backup, and survives reopen',async t=>{
  const directory=await temporary(t);
  const legacy={demo:false,media:[{...media,favorite:true,progress:.42}],sources:[]};
  await fs.writeFile(path.join(directory,'library.json'),JSON.stringify(legacy));
  let db=openLibraryDatabase(directory);
  assert.deepEqual(db.load(),legacy);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory,'library.json.pre-sqlite.bak'),'utf8')),legacy);
  db.save({...legacy,media:[{...legacy.media[0],progress:.6}]});db.close();
  db=openLibraryDatabase(directory);assert.equal(db.load().media[0].progress,.6);db.close();
});
test('automatic TMDB matching hydrates details, preserves live progress, and caches artwork',async t=>{
  const directory=await temporary(t),db=openLibraryDatabase(directory);
  db.save({demo:false,media:[{...media}],sources:[]});
  let service;
  const fetcher=async url=>{
    const u=new URL(url);
    if(u.hostname==='image.tmdb.org')return new Response(new Uint8Array([255,216,255,217]));
    if(u.pathname.includes('/search/')){
      await delay(100);service.patch('movie',{favorite:true,progress:.55});
      return new Response(JSON.stringify({results:[{id:1,title:'Dune',original_title:'Dune',release_date:'2021-01-01',vote_average:8,poster_path:'/test.jpg'}]}));
    }
    return new Response(JSON.stringify({id:1,title:'沙丘',original_title:'Dune',release_date:'2021-01-01',overview:'matched',runtime:155,genres:[{name:'科幻'}],credits:{cast:[{name:'Actor'}],crew:[{name:'Director',job:'Director'}]},poster_path:'/test.jpg'}));
  };
  service=new LibraryService({database:db,directory,getSettings:()=>({autoScrape:true,watchFolders:false,tmdbToken:'test',metadataLanguage:'zh-CN'}),notify(){},authorize(){},fetcher});
  await service.init();service.enqueue(service.library.media);
  await until(()=>!service.jobs.size);
  const result=service.library.media[0];
  assert.equal(result.title,'沙丘');assert.equal(result.favorite,true);assert.equal(result.progress,.55);
  assert.equal(result.duration,1);assert.deepEqual(result.genre,['科幻']);assert.equal(result.director,'Director');
  assert.match(result.poster,/^luma-media:/);assert.equal(service.status().matched,1);
  const file=decodeURIComponent(new URL(result.poster).pathname.slice(1));
  assert.equal((await fs.stat(file)).size,4);
  // Local cached art requires no network on subsequent reads.
  const cached=await cacheArtwork(result,directory,()=>{throw new Error('should not fetch local artwork');});
  assert.equal(cached.poster,result.poster);
  await service.close();db.close();
});
test('ambiguous matches remain for review and queued scraping can be cancelled',async t=>{
  const directory=await temporary(t),db=openLibraryDatabase(directory);
  db.save({demo:false,media:[{...media}],sources:[]});
  const fetcher=async()=>new Response(JSON.stringify({results:[1,2].map(id=>({id,title:'Dune',original_title:'Dune',release_date:'2021-01-01'}))}));
  const service=new LibraryService({database:db,directory,getSettings:()=>({autoScrape:true,watchFolders:false,tmdbToken:'test'}),notify(){},authorize(){},fetcher});
  await service.init();service.enqueue(service.library.media);await until(()=>!service.jobs.size);
  assert.equal(service.library.media[0].metadataStatus,'review');assert.equal(service.library.media[0].tmdbId,undefined);
  service.fetcher=async (url,options)=>{await delay(5000,undefined,{signal:options.signal});return new Response('{}');};
  service.enqueue(service.library.media,true);await delay(50);service.cancel();await until(()=>!service.jobs.size);
  assert.equal(service.library.media[0].tmdbId,undefined);assert.equal(service.status().failed,0);
  await service.close();db.close();
});
test('directory watching imports new files; missing or offline sources retain favorites and resume',async t=>{
  const directory=await temporary(t),movies=path.join(directory,'Movies');await fs.mkdir(movies);
  await fs.copyFile('public/demo.mp4',path.join(movies,'First.2024.mp4'));
  const db=openLibraryDatabase(path.join(directory,'profile'));
  const prefs={autoScrape:false,watchFolders:true};
  const service=new LibraryService({database:db,directory,getSettings:()=>prefs,notify(){},authorize(){}});
  await service.init();await service.scan(movies,'local');await delay(500);
  const first=service.library.media[0];service.patch(first.id,{favorite:true,progress:.45});
  await fs.copyFile('public/demo.mp4',path.join(movies,'Second.2025.mp4'));
  await until(()=>service.library.media.length===2);
  assert.equal(service.library.media.find(m=>m.id===first.id).favorite,true);
  prefs.watchFolders=false;await service.syncWatchers();await service.queue.onIdle();
  await fs.unlink(path.join(movies,'First.2024.mp4'));await service.scan(movies,'local');
  assert.equal(service.library.media.find(m=>m.id===first.id).missing,true);
  await service.queue.onIdle();
  await fs.rename(movies,movies+'-offline');await assert.rejects(service.scan(movies,'local'),/无法访问/);
  assert.equal(service.library.sources[0].status,'offline');assert.equal(service.library.media.length,2);
  assert.equal(db.load().media.find(m=>m.id===first.id).progress,.45);
  await service.close();db.close();
});

test('backfilling an existing match changes only certificate fields and keeps manual metadata and progress',async t=>{
  const directory=await temporary(t),db=openLibraryDatabase(directory);
  db.save({demo:false,media:[{...media,tmdbId:123,metadataOrigin:'manual',metadataStatus:'matched',title:'手动片名',favorite:true,progress:.42}],sources:[]});
  let calls=0;
  const service=new LibraryService({database:db,directory,getSettings:()=>({autoScrape:true,watchFolders:false,tmdbToken:'test'}),notify(){},authorize(){},fetcher:async url=>{
    calls++;assert.equal(url.pathname,'/3/movie/123/release_dates');
    return new Response(JSON.stringify({results:[{iso_3166_1:'HK',release_dates:[{type:3,certification:'IIB'}]}]}));
  }});
  await service.init();service.enqueue(service.library.media);await until(()=>!service.jobs.size);
  const item=db.load().media[0];assert.equal(item.minimumAge,15);assert.equal(item.certificationRegion,'HK');assert.ok(item.certificationCheckedAt);
  assert.equal(item.title,'手动片名');assert.equal(item.progress,.42);assert.equal(item.favorite,true);assert.equal(item.metadataStatus,'matched');
  service.enqueue(service.library.media);await until(()=>!service.jobs.size);assert.equal(calls,1);
  await service.close();db.close();
});
