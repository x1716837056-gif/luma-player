const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {groupMovies,chooseVersion,editionLabel,versionLabel,isWatched,hasResume,shouldRestart,facetNames}=require('../shared/movies.mjs');
const {applyPersonal,validatePersonal,metadataOnly,itemVersions}=require('../shared/user-library.mjs');
const {libraryEntries,groupSeries,resumeEpisode}=require('../shared/series.mjs');
const {LibraryService}=require('../electron/library-service.cjs');
const {openLibraryDatabase}=require('../electron/database.cjs');
const {DuplicateScanner}=require('../electron/duplicates.cjs');
const film=(id,extra={})=>({id,kind:'movie',title:'Example',originalTitle:'Example',year:2024,path:`C:/Movies/Example.2024.${id}.mkv`,duration:120,quality:'4K',genre:[],...extra});
const ep=(id,n,extra={})=>film(id,{kind:'tv',seriesTitle:'Example Show',seriesOriginalTitle:'Example Show',season:1,episodeNumber:n,path:`C:/Example Show/S01E0${n}.${id}.mkv`,...extra});
async function temporary(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'luma-management-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}

test('movie versions share a card, while remakes, conflicting identities and unknown years stay separate',()=>{
  const a=film('4k',{tmdbId:10}),b=film('1080',{title:'Example IMAX',originalTitle:'Example IMAX',quality:'1080p'}),c=film('cut',{tmdbId:10,title:'不同语言',originalTitle:'Different Language'});
  assert.equal(groupMovies([a,b,c]).length,1);assert.equal(libraryEntries([a,b,c]).length,1);
  assert.equal(groupMovies([a,film('remake',{year:1990,tmdbId:11})]).length,2);
  assert.equal(groupMovies([a,film('conflict',{tmdbId:11}),b]).length,3);
  assert.equal(groupMovies([film('unknown1',{year:0,path:'C:/Unknown/Example.mkv'}),film('unknown2',{year:0,path:'D:/Example.mkv'})]).length,2);
});
test('preferred version honors availability, quality, feature length and known editions',()=>{
  const full=film('feature',{technical:{width:1920,durationSeconds:7200}}),sample=film('sample',{technical:{width:3840,durationSeconds:93}}),cut=film('cut',{path:'C:/Example.2024.Directors.Cut.mkv',quality:'1080p',preferredVersion:true});
  assert.equal(chooseVersion([sample,full]).id,'feature');assert.equal(chooseVersion([full,cut]).id,'cut');assert.equal(chooseVersion([full,{...cut,missing:true}]).id,'feature');
  assert.equal(editionLabel(cut),'导演剪辑版');assert.match(versionLabel(cut),/1080p.*导演剪辑版/);
});
test('content identity is accepted only with the exact size and modification signature',()=>{
  const a=film('a',{contentHash:'verified',fileSize:5,modifiedAt:10,hashSize:5,hashModifiedAt:10}),b=film('b',{title:'Other',originalTitle:'Other',year:2001,contentHash:'verified',fileSize:5,modifiedAt:10,hashSize:5,hashModifiedAt:10});
  assert.equal(groupMovies([a,b]).length,1);assert.equal(groupMovies([a,{...b,modifiedAt:11}]).length,2);assert.equal(groupMovies([a,{...b,fileSize:6}]).length,2);
});
test('personal data is work-wide; progress, technical metadata and preferences remain per file or episode',()=>{
  const a=film('a',{progress:.2}),b=film('b',{progress:.8}),e1=ep('e1',1,{progress:.3}),e2=ep('e2',2,{progress:.6}),items=[a,b,e1,e2];
  applyPersonal(items,a.id,{watchlist:true,notes:'镜头笔记',personalRating:8.5},99);assert.equal(b.notes,'镜头笔记');assert.equal(b.personalRating,8.5);assert.equal(b.progress,.8);assert.equal(e1.notes,undefined);
  applyPersonal(items,e1.id,{notes:'整剧笔记',favorite:true},100);assert.equal(e2.notes,'整剧笔记');assert.equal(e2.progress,.6);assert.deepEqual(itemVersions(items,e1.id).map(m=>m.id),['e1']);
  assert.throws(()=>validatePersonal({personalRating:8.2}));assert.throws(()=>validatePersonal({notes:'x'.repeat(10001)}));assert.throws(()=>validatePersonal({watchlist:'yes'}));assert.deepEqual(validatePersonal({personalRating:0,progress:1}),{personalRating:0});
  assert.deepEqual(metadataOnly({...a,notes:'stale',progress:0,preferredVersion:true,watchlist:false}),{kind:'movie',title:'Example',originalTitle:'Example',year:2024,duration:120,quality:'4K',genre:[]});
});
test('manual watched status suppresses obsolete resume but preserves legacy partial rewatches',()=>{
  const legacy=ep('legacy',1,{watched:true,progress:.3,lastPlayedAt:10}),manual=ep('manual',2,{watched:true,progress:.6,lastPlayedAt:20,watchedMarkedAt:30});
  assert.equal(hasResume(legacy),true);assert.equal(shouldRestart(legacy),false);assert.equal(hasResume(manual),false);assert.equal(shouldRestart(manual),true);assert.equal(isWatched(manual),true);
  assert.equal(resumeEpisode(groupSeries([legacy,manual])[0]).id,'legacy');assert.equal(libraryEntries([legacy,{...manual,watched:false,progress:0}])[0].media.watched,false);
});
test('people and collection facets use real metadata and manual collection overrides',()=>{
  const m=film('a',{directors:['One','Two'],director:'One',cast:['Actor'],collection:{id:1,name:'Original collection'},collectionName:'My series'});
  assert.deepEqual(facetNames(m,'directors'),['One','Two']);assert.deepEqual(facetNames(m,'actors'),['Actor']);assert.deepEqual(facetNames(m,'collections'),['My series']);
});
test('SQLite retains personal data and each episode progress through rescan and newly imported versions',async t=>{
  const dir=await temporary(t),movies=path.join(dir,'movies');await fs.mkdir(movies);const first=path.join(movies,'Example.2024.1080p.mp4');await fs.copyFile('public/demo.mp4',first);
  const db=openLibraryDatabase(path.join(dir,'profile')),service=new LibraryService({database:db,directory:dir,getSettings:()=>({autoScrape:false,watchFolders:false}),authorize(){},notify(){}});await service.init();
  try{
    await service.scan(movies,'local');await service.onIdle();const a=service.library.media[0];service.personal(a.id,{watchlist:true,personalRating:9,notes:'保留我的笔记'});service.patch(a.id,{progress:.42});service.prefer(a.id);
    await fs.copyFile('public/demo.mp4',path.join(movies,'Example.2024.2160p.mp4'));await service.scan(movies,'local');await service.onIdle();assert.equal(service.library.media.length,2);
    for(const m of service.library.media){assert.equal(m.notes,'保留我的笔记');assert.equal(m.watchlist,true);assert.equal(m.personalRating,9);}const b=service.library.media.find(m=>m.id!==a.id);assert.equal(b.progress,undefined);assert.equal(b.preferredVersion,undefined);service.prefer(b.id);assert.equal(service.library.media.find(m=>m.id===a.id).preferredVersion,false);
    service.markWatched(a.id,true);assert.equal(service.library.media.find(m=>m.id===a.id).progress,.42);assert.ok(service.library.media.every(isWatched));service.markWatched(a.id,false);assert.ok(service.library.media.every(m=>!isWatched(m)&&m.progress===0));
    service.replace({demo:false,sources:[],media:[ep('e1',1,{progress:.25}),ep('e2',2,{progress:.75})]});service.personal('e1',{notes:'整剧'});service.markWatched('e1',true);assert.equal(service.library.media[0].progress,.25);assert.equal(service.library.media[1].watched,undefined);assert.equal(service.library.media[1].progress,.75);
    service.markWatched('e1',false);assert.equal(service.library.media[1].progress,.75);assert.equal(db.load().media[1].notes,'整剧');
  }finally{await service.close();db.close();}
  const reopened=openLibraryDatabase(path.join(dir,'profile'));assert.equal(reopened.load().media[1].progress,.75);reopened.close();
});
test('online matching cannot overwrite live personal notes, ratings or preferred version',async t=>{
  const dir=await temporary(t),db=openLibraryDatabase(dir);db.save({demo:false,sources:[],media:[film('a',{technical:{durationSeconds:7200}}),film('b',{technical:{durationSeconds:7300}})]});let service;
  const fetcher=async url=>{if(String(url).includes('/search/'))return new Response(JSON.stringify({results:[{id:10,title:'Example',original_title:'Example',release_date:'2024-01-01'}]}));service.personal('a',{notes:'新笔记',personalRating:7.5,watchlist:true});service.prefer('b');service.patch('a',{progress:.6});return new Response(JSON.stringify({id:10,title:'匹配片名',original_title:'Example',release_date:'2024-01-01',credits:{cast:[{name:'Actor'}],crew:[{name:'Director',job:'Director'}]},belongs_to_collection:{id:20,name:'Example collection'},genres:[]}));};
  service=new LibraryService({database:db,directory:dir,getSettings:()=>({watchFolders:false,autoScrape:true,tmdbToken:'test'}),fetcher,authorize(){},notify(){}});await service.init();
  try{await service.match('a',{tmdbId:10,kind:'movie'});const [a,b]=db.load().media;assert.equal(a.notes,'新笔记');assert.equal(b.notes,'新笔记');assert.equal(a.progress,.6);assert.equal(b.preferredVersion,true);assert.equal(b.technical.durationSeconds,7300);assert.deepEqual(a.directors,['Director']);assert.deepEqual(a.collection,{id:20,name:'Example collection'});}finally{await service.close();db.close();}
});
test('duplicate scanner confirms full bytes, rejects same-size/sample collisions and never modifies media',async t=>{
  const dir=await temporary(t),bytes=Buffer.alloc(8*1024*1024,17),paths=['a','b','c','d'].map(s=>path.join(dir,s+'.mkv'));
  await fs.writeFile(paths[0],bytes);await fs.writeFile(paths[1],bytes);const different=Buffer.from(bytes);different[2*1024*1024]=18;await fs.writeFile(paths[2],different);await fs.writeFile(paths[3],Buffer.alloc(bytes.length,19));
  const before=await Promise.all(paths.map(p=>fs.stat(p))),hashes=[];const scanner=new DuplicateScanner({getMedia:()=>paths.map((p,i)=>film(String(i),{path:p})),notify(){},onHash:(f,h)=>hashes.push([f.id,h])});scanner.start();await scanner.work;
  assert.equal(scanner.state.phase,'complete');assert.equal(scanner.state.groups.length,1);assert.deepEqual(scanner.state.groups[0].files.map(f=>f.id),['0','1']);assert.equal(hashes.length,3);assert.equal(scanner.state.bytesRead,bytes.length*3);assert.equal(scanner.state.errors.length,0);
  for(let i=0;i<paths.length;i++){const after=await fs.stat(paths[i]);assert.equal(after.size,before[i].size);assert.equal(after.mtimeMs,before[i].mtimeMs);}
});
test('duplicate scan cancellation is safe and file changes invalidate confirmation',async t=>{
  const dir=await temporary(t),a=path.join(dir,'a'),b=path.join(dir,'b');await fs.writeFile(a,'same bytes');await fs.writeFile(b,'same bytes');const getMedia=()=>[film('a',{path:a}),film('b',{path:b})];
  const cancelled=new DuplicateScanner({getMedia,notify(){}});cancelled.start();cancelled.cancel();await cancelled.work;assert.equal(cancelled.state.phase,'cancelled');assert.equal(cancelled.state.running,false);
  const changing=new DuplicateScanner({getMedia,notify(){},onHash:async file=>{if(file.id==='a')await fs.appendFile(b,' changed');}});changing.start();await changing.work;assert.equal(changing.state.groups.length,0);assert.equal(changing.state.errors.length,1);
});
