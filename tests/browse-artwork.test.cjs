const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {resolveMetadata,cacheArtwork}=require('../electron/metadata.cjs');
const {LibraryService}=require('../electron/library-service.cjs');
const {openLibraryDatabase}=require('../electron/database.cjs');
const {browseGroups}=require('../shared/browse-artwork.mjs');
const film=(id,extra={})=>({id,tmdbId:10,kind:'movie',title:'Manual title',originalTitle:'Manual original',year:2024,path:`C:/Movies/Example.2024.${id}.mkv`,genre:[],technical:{durationSeconds:7200},director:'Director',cast:['Actor'],metadataOrigin:'manual',...extra});
const details={id:10,title:'Online title',original_title:'Online title',release_date:'2024-01-01',credits:{cast:[{id:1,name:'Actor',profile_path:'/actor.jpg'},{id:2,name:'No photo',profile_path:null}],crew:[{id:3,name:'Director',job:'Director',profile_path:'/director.jpg'},{id:4,name:'Producer',job:'Producer',profile_path:'/producer.jpg'}]},belongs_to_collection:{id:20,name:'Official collection',poster_path:'/collection.jpg',backdrop_path:'/collection-wide.jpg'}};
async function temporary(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'luma-browse-art-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
function picture(){return new Response(new Uint8Array([255,216,255,217]));}
test('matched credits retain real person identity, role and profile; collections retain their own artwork',async()=>{
  const m=await resolveMetadata(film('a'),{kind:'movie',tmdbId:10},'test','zh-CN',async()=>new Response(JSON.stringify(details)));
  assert.equal(m.people.length,3);assert.equal(m.people.find(p=>p.role==='director').id,3);assert.match(m.people.find(p=>p.name==='Actor').photo,/w500\/actor.jpg$/);assert.equal(m.people.find(p=>p.name==='No photo').photo,undefined);assert.match(m.collection.backdrop,/w780\/collection-wide.jpg$/);assert.ok(m.browseArtworkCheckedAt);
});
test('nested image caching deduplicates requests, survives offline reuse and retains unavailable URLs',async t=>{
  const directory=await temporary(t),url='https://image.tmdb.org/t/p/w500/same.jpg',media={poster:url,people:[{name:'A',role:'actor',photo:url},{name:'B',role:'director',photo:'https://image.tmdb.org/t/p/w500/missing.jpg'}],collection:{name:'C',poster:url}};let calls=0;
  const cached=await cacheArtwork(media,directory,async u=>{calls++;return u.endsWith('/missing.jpg')?new Response('',{status:404}):picture();});
  assert.equal(calls,2);assert.match(cached.people[0].photo,/^luma-media:/);assert.equal(cached.people[0].photo,cached.collection.poster);assert.equal(cached.poster,cached.collection.poster);assert.match(cached.people[1].photo,/^https:/);assert.equal(media.poster,url);
  const offline=await cacheArtwork({...cached,people:[cached.people[0]]},directory,()=>{throw Error('offline');});assert.equal(offline.people[0].photo,cached.people[0].photo);assert.equal((await fs.readdir(directory)).length,1);
});
test('legacy artwork backfill shares a work request, caches photos and never overwrites live manual or personal data',async t=>{
  const dir=await temporary(t),db=openLibraryDatabase(dir);db.save({demo:false,sources:[],media:[film('a',{progress:.25,notes:'Keep',personalRating:9,collectionName:'My set'}),film('b',{progress:.7})]});let requests=0,service;
  service=new LibraryService({database:db,directory:dir,getSettings:()=>({watchFolders:false,autoScrape:true,tmdbToken:'test'}),authorize(){},notify(){},fetcher:async url=>{
    if(String(url).startsWith('https://image.tmdb.org/'))return picture();requests++;await new Promise(r=>setTimeout(r,20));service.personal('a',{notes:'Live edit',personalRating:8.5});return new Response(JSON.stringify(details));
  }});await service.init();
  try{await Promise.all([service.loadBrowseArtwork(),service.loadBrowseArtwork()]);assert.equal(requests,1);const [a,b]=db.load().media;for(const m of [a,b]){assert.equal(m.title,'Manual title');assert.equal(m.notes,'Live edit');assert.equal(m.personalRating,8.5);assert.match(m.people[0].photo,/^luma-media:/);assert.match(m.collection.poster,/^luma-media:/);}assert.equal(a.progress,.25);assert.equal(b.progress,.7);assert.equal(a.collectionName,'My set');await service.loadBrowseArtwork();assert.equal(requests,1);}
  finally{await service.close();db.close();}
});
test('artwork errors and disabled automatic matching do not invalidate matched metadata or viewing records',async t=>{
  const dir=await temporary(t),db=openLibraryDatabase(dir),prefs={watchFolders:false,autoScrape:false,tmdbToken:'test'};db.save({demo:false,sources:[],media:[film('a',{progress:.4,metadataStatus:'matched'})]});let requests=0;
  const service=new LibraryService({database:db,directory:dir,getSettings:()=>prefs,authorize(){},notify(){},fetcher:async()=>{requests++;return new Response('{}',{status:401});}});await service.init();
  try{assert.equal((await service.loadBrowseArtwork()).disabled,true);assert.equal(requests,0);assert.equal((await service.loadBrowseArtwork(true)).failed,1);const m=db.load().media[0];assert.equal(m.metadataStatus,'matched');assert.equal(m.progress,.4);assert.ok(m.browseArtworkError);prefs.tmdbToken='';assert.equal((await service.loadBrowseArtwork(true)).needsToken,true);assert.equal(requests,1);}
  finally{await service.close();db.close();}
});
test('browse artwork respects person roles, deduplicates version counts, and uses film posters for custom collections',()=>{
  const a=film('a',{people:[{name:'Director',role:'director',photo:'director.jpg'},{name:'Actor',role:'actor',photo:'actor.jpg'}],collection:{name:'Official collection',backdrop:'official.jpg'},collectionName:'My set',poster:'film-a.jpg'}),b=film('b',{people:a?.people,collectionName:'My set',poster:'film-b.jpg'});
  const directors=browseGroups([a,b],'directors');assert.equal(directors[0].count,1);assert.deepEqual(directors[0].images,['director.jpg']);assert.deepEqual(browseGroups([a,b],'actors')[0].images,['actor.jpg']);const custom=browseGroups([a,b],'collections')[0];assert.deepEqual(custom.images,['film-a.jpg','film-b.jpg']);assert.equal(custom.collage,true);
  assert.deepEqual(browseGroups([film('none')],'actors')[0].images,[]);assert.deepEqual(browseGroups([{...a,collectionName:''}],'collections')[0].images,['official.jpg','film-a.jpg']);
});
