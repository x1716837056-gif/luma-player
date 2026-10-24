const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{setTimeout:delay}=require('node:timers/promises');
const {MetadataNetwork}=require('../electron/metadata-network.cjs'),{LibraryService}=require('../electron/library-service.cjs'),{openLibraryDatabase}=require('../electron/database.cjs');
const picture=()=>new Response(new Uint8Array([255,216,255,217]));
const movie=(id,extra={})=>({id,title:'Feature',originalTitle:'Feature',kind:'movie',year:2024,path:`cloud://a/Feature.2024.${id}.mkv`,remote:{accountId:'a',path:`/Feature.2024.${id}.mkv`},genre:[],duration:60,poster:'',backdrop:'',rating:'',certification:'',description:'',technical:{durationSeconds:3600},imported:true,addedAt:1,...extra});
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function waiting(gate,signal){return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason);signal?.addEventListener('abort',abort,{once:true});gate.promise.then(value=>{signal?.removeEventListener('abort',abort);resolve(value);});if(signal?.aborted)abort();});}
async function until(check){const end=Date.now()+5000;while(!await check()){if(Date.now()>end)throw Error('Expected metadata state did not settle');await delay(10);}}
async function library(t,media,fetcher,options={}){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'luma-metadata-test-')),db=openLibraryDatabase(directory);db.save({demo:false,sources:[],media});const prefs={autoScrape:true,watchFolders:false,tmdbToken:'test',metadataLanguage:'zh-CN'},service=new LibraryService({database:db,directory,getSettings:()=>prefs,notify(){},authorize(){},fetcher,...options});await service.init();t.after(async()=>{await service.close();db.close();await fs.rm(directory,{recursive:true,force:true});});return {directory,db,prefs,service};}
function response(url){const u=new URL(url),tv=u.pathname.includes('/tv'),query=u.searchParams.get('query'),id=tv?2:1,title=tv?'Show':'Feature',record={id,...(tv?{name:title,original_name:title,first_air_date:'2024-01-01'}:{title,original_title:title,release_date:'2024-01-01'}),runtime:130,overview:'Matched',genres:[],credits:{cast:[],crew:[]},release_dates:{results:[]},content_ratings:{results:[]},poster_path:'/poster.jpg'};return new Response(JSON.stringify(query?{results:[record]}:record));}

test('metadata is visible while images and probes are pending; versions and episodes share one lookup and retain file identity',async t=>{
  const images=deferred(),probe=deferred();let searches=0,details=0;
  const records=[movie('a',{progress:.2,notes:'keep'}),movie('b',{duration:120,technical:{durationSeconds:7200},progress:.7,preferredVersion:true}),...Array.from({length:4},(_,i)=>movie('ep'+i,{kind:'tv',title:'Show',originalTitle:'Show',seriesTitle:'Show',season:1,episodeNumber:i+1,episodeTitle:'Episode '+i,path:`cloud://a/Show/S01E0${i+1}.mkv`,duration:40+i,technical:{durationSeconds:(40+i)*60},progress:i/10})),movie('local',{remote:undefined,technical:undefined,path:'C:/missing-fixture.mkv'})];
  const {service,db}=await library(t,records,async(url,options)=>{if(new URL(url).hostname==='image.tmdb.org'){await waiting(images,options.signal);return picture();}if(new URL(url).pathname.includes('/search/'))searches++;else details++;return response(url);},{getInput:async(media,signal)=>{await waiting(probe,signal);return media.path;}});
  try{service.enqueue(records,true);await until(()=>db.load().media.every(m=>m.tmdbId));assert.equal(searches,2);assert.equal(details,2);assert.ok(service.status().probeActive);assert.ok(service.status().artworkActive);assert.equal(service.status().running,true);
    service.personal('a',{notes:'live note',personalRating:8});service.patch('a',{tmdbId:999,title:'Live manual',poster:'custom.jpg',metadataOrigin:'manual'});
  }finally{images.resolve();probe.resolve();}
  await service.onIdle();const stored=db.load().media;assert.equal(stored.find(m=>m.id==='a').title,'Live manual');assert.equal(stored.find(m=>m.id==='a').poster,'custom.jpg');assert.equal(stored.find(m=>m.id==='a').notes,'live note');assert.equal(stored.find(m=>m.id==='b').personalRating,8);assert.equal(stored.find(m=>m.id==='b').duration,120);assert.equal(stored.find(m=>m.id==='b').preferredVersion,true);
  for(let i=0;i<4;i++){const ep=stored.find(m=>m.id==='ep'+i);assert.equal(ep.episodeNumber,i+1);assert.equal(ep.duration,40+i);assert.equal(ep.episodeTitle,'Episode '+i);assert.equal(ep.progress,i/10);assert.match(ep.poster,/^luma-media:/);}
});

test('shared requests have independent consumer cancellation, bounded session caching and credential isolation',async t=>{
  const gate=deferred();let calls=0;const network=new MetadataNetwork(async(_,options)=>{calls++;await waiting(gate,options.signal);return new Response('{"id":1}');});await network.init();t.after(()=>network.close());
  const one=new AbortController(),two=new AbortController(),url='https://api.themoviedb.org/3/movie/1';const a=network.fetch(url,{headers:{Authorization:'Bearer first-credential'},signal:one.signal}),b=network.fetch(url,{headers:{Authorization:'Bearer first-credential'},signal:two.signal});const rejected=assert.rejects(a,{name:'AbortError'});one.abort();gate.resolve();await rejected;assert.equal((await(await b).json()).id,1);assert.equal(calls,1);
  await network.fetch(url,{headers:{Authorization:'Bearer first-credential'}});assert.equal(calls,1);await network.fetch(url,{headers:{Authorization:'Bearer different-credential'}});assert.equal(calls,2);assert.ok(network.metrics.sharedRequests);assert.equal(JSON.stringify([...network.cache.keys()]).includes('credential'),false);
});

test('canceling all request consumers aborts upstream work and does not poison the next attempt',async t=>{
  const gate=deferred();let aborted=0,calls=0;const network=new MetadataNetwork(async(_,options)=>{calls++;try{await waiting(gate,options.signal);return new Response('{}');}catch(error){aborted++;throw error;}});await network.init();t.after(()=>network.close());
  const c=new AbortController(),pending=network.fetch('https://api.themoviedb.org/3/movie/2',{signal:c.signal});await until(()=>calls===1);const rejected=assert.rejects(pending,{name:'AbortError'});c.abort();await rejected;await network.onIdle();assert.equal(aborted,1);gate.resolve();assert.equal((await network.fetch('https://api.themoviedb.org/3/movie/2')).status,200);assert.equal(calls,2);
});

test('HTTP 429 postpones subsequent TMDB requests using Retry-After and error responses are not cached',async t=>{
  const times=[];const network=new MetadataNetwork(async()=>{times.push(Date.now());return times.length===1?new Response('{}',{status:429,headers:{'Retry-After':'1'}}):new Response('{}');});await network.init();t.after(()=>network.close());const url='https://api.themoviedb.org/3/movie/3';assert.equal((await network.fetch(url)).status,429);await network.fetch(url);assert.ok(times[1]-times[0]>=950);assert.equal(network.metrics.rateLimits,1);await network.fetch(url);assert.equal(times.length,2);
});

test('TMDB transport runs concurrent requests while keeping a rolling rate budget',async t=>{
  const times=[];let active=0,peak=0;const network=new MetadataNetwork(async(_,options)=>{times.push(Date.now());active++;peak=Math.max(peak,active);try{await delay(25,undefined,{signal:options.signal});return new Response('{}');}finally{active--;}});await network.init();t.after(()=>network.close());await Promise.all(Array.from({length:10},(_,i)=>network.fetch('https://api.themoviedb.org/3/movie/'+i)));assert.ok(peak>=2&&peak<=6);for(const time of times)assert.ok(times.filter(value=>value>=time&&value<time+990).length<=8);
});

test('requests recovering from a shared cooldown still respect the actual dispatch budget',async t=>{
  const times=[];const network=new MetadataNetwork(async()=>{times.push(Date.now());return times.length===1?new Response('{}',{status:429,headers:{'Retry-After':'1'}}):new Response('{}');});await network.init();t.after(()=>network.close());await network.fetch('https://api.themoviedb.org/3/movie/first');await Promise.all(Array.from({length:10},(_,i)=>network.fetch('https://api.themoviedb.org/3/movie/after-'+i)));for(const time of times)assert.ok(times.filter(value=>value>=time&&value<time+990).length<=8);
});

test('cancel and immediate retry cannot let stale tasks overwrite new results or counters',async t=>{
  const held=deferred();let started=0;const {service,db}=await library(t,[movie('a'),movie('b')],async(_,options)=>{started++;await waiting(held,options.signal);return new Response('{}');});service.enqueue(service.library.media,true);await until(()=>started>0);const began=Date.now();service.cancel();service.fetcher=async url=>new URL(url).hostname==='image.tmdb.org'?picture():response(url);service.enqueue(service.library.media,true);await service.onIdle();assert.ok(Date.now()-began<2000,'Immediate retry must not wait for the obsolete request timeout');assert.ok(db.load().media.every(m=>m.metadataOrigin==='tmdb'));assert.equal(service.status().failed,0);assert.equal(service.status().running,false);assert.equal(service.status().completed,service.status().total);assert.equal(service.jobs.size,0);
});

test('canceling image enrichment preserves matched metadata and a later task can cache remaining images without querying TMDB',async t=>{
  const gate=deferred();let api=0;const {service,db}=await library(t,[movie('a')],async(url,options)=>{if(new URL(url).hostname==='image.tmdb.org'){await waiting(gate,options.signal);return picture();}api++;return response(url);});service.enqueue(service.library.media,true);await until(()=>service.library.media[0].metadataOrigin==='tmdb');service.cancel();await service.onIdle();assert.equal(db.load().media[0].metadataStatus,'matched');assert.match(db.load().media[0].poster,/^https:/);gate.resolve();service.enqueue(service.library.media,true);await service.onIdle();assert.match(db.load().media[0].poster,/^luma-media:/);assert.equal(api,2);
});

test('a trusted existing work supplies metadata to a new version without network or copying another file runtime',async t=>{
  const first=movie('a',{metadataOrigin:'manual',tmdbId:1,certificationCheckedAt:1,poster:'',duration:180,description:'Existing match'}),second=movie('b',{technical:undefined,duration:0});let requests=0;const {service,db}=await library(t,[first,second],async()=>{requests++;throw Error('Network must not be used');});service.enqueue([second],true);await service.onIdle();assert.equal(requests,0);const next=db.load().media.find(m=>m.id==='b');assert.equal(next.tmdbId,1);assert.equal(next.description,'Existing match');assert.equal(next.duration,0);assert.equal(next.path,second.path);
});

test('late certification failures cannot mark a newly chosen manual match as broken',async t=>{
  const gate=deferred();let started=false;const {service,db}=await library(t,[movie('a',{tmdbId:1,metadataOrigin:'manual',metadataStatus:'matched'})],async(_,options)=>{started=true;await waiting(gate,options.signal);return new Response('{}',{status:401});});service.enqueue(service.library.media,true);await until(()=>started);service.patch('a',{tmdbId:999,title:'New manual match'});gate.resolve();await service.onIdle();const saved=db.load().media[0];assert.equal(saved.tmdbId,999);assert.equal(saved.certificationError,undefined);assert.equal(saved.metadataStatus,'matched');
});

test('overlapping manual choices keep the newest choice across versions when the old response arrives last',async t=>{
  const gate=deferred();let started=false;const {service,db}=await library(t,[movie('a'),movie('b')],async(url,options)=>{const id=Number(new URL(url).pathname.split('/').at(-1));if(id===1){started=true;await waiting(gate,options.signal);}return new Response(JSON.stringify({id,title:'Choice '+id,original_title:'Feature',release_date:'2024-01-01',credits:{cast:[],crew:[]},genres:[]}));});
  const old=service.match('a',{tmdbId:1,kind:'movie'});await until(()=>started);await service.match('b',{tmdbId:2,kind:'movie'});gate.resolve();await old;await service.onIdle();assert.ok(db.load().media.every(m=>m.tmdbId===2&&m.title==='Choice 2'));assert.equal(service.status().failed,0);
});

test('SQLite incremental saves avoid rewriting unrelated rows and rollback does not advance saved snapshots',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'luma-delta-db-')),db=openLibraryDatabase(directory),Database=require('better-sqlite3'),inspect=new Database(path.join(directory,'library.sqlite'));t.after(async()=>{inspect.close();db.close();await fs.rm(directory,{recursive:true,force:true});});const media=Array.from({length:500},(_,i)=>movie('item'+i));db.save({demo:false,sources:[],media});
  inspect.exec("CREATE TABLE audit(id TEXT); CREATE TRIGGER watch_updates AFTER UPDATE ON media BEGIN INSERT INTO audit VALUES(new.id); END; CREATE TRIGGER reject_title BEFORE UPDATE ON media WHEN new.title='reject' BEGIN SELECT RAISE(ABORT,'reject'); END;");
  const changed={...media[0],notes:'updated',progress:.4};db.saveMedia([changed]);assert.deepEqual(inspect.prepare('SELECT id FROM audit').all(),[{id:changed.id}]);assert.equal(db.load().media.length,500);const second={...media[1],title:'reject'};assert.throws(()=>db.saveMedia([{...changed,notes:'rollback'},second]),/reject/);assert.equal(db.load().media[0].notes,'updated');db.saveMedia([{...changed,notes:'rollback'}]);assert.equal(db.load().media[0].notes,'rollback');assert.equal(inspect.prepare('SELECT count(*) AS count FROM audit').get().count,2);db.save({demo:false,sources:[],media:[{...changed,notes:'rollback'},...media.slice(1)]});assert.equal(inspect.prepare('SELECT count(*) AS count FROM audit').get().count,2);
});
