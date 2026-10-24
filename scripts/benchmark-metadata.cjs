// Controlled latency and synthetic records measure the pipeline, not TMDB/Internet speed or decoder compatibility.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks'),{setTimeout:delay}=require('node:timers/promises');
async function run(root){
  const {LibraryService}=require(path.resolve(root,'electron/library-service.cjs')),{openLibraryDatabase}=require(path.resolve(root,'electron/database.cjs'));
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'luma-metadata-bench-')),db=openLibraryDatabase(directory);let service;
  const base={kind:'movie',year:2024,genre:[],description:'',rating:'',certification:'',duration:60,poster:'',backdrop:'',addedAt:1,imported:true,sourceId:'bench',technical:{durationSeconds:3600},remote:{accountId:'bench',path:'/fixture.mkv'}};
  const targets=[];for(let movie=1;movie<=8;movie++)for(let version=0;version<2;version++)targets.push({...base,id:`movie-${movie}-${version}`,title:`BenchMovie${movie}`,originalTitle:`BenchMovie${movie}`,path:`cloud://bench/BenchMovie${movie}.2024.${version?'2160p':'1080p'}.mkv`,progress:version*.3,notes:'Keep'});
  for(let episode=1;episode<=24;episode++)targets.push({...base,kind:'tv',id:`tv-${episode}`,title:'BenchShow',originalTitle:'BenchShow',seriesTitle:'BenchShow',seriesYear:2024,season:1,episodeNumber:episode,path:`cloud://bench/BenchShow/S01E${String(episode).padStart(2,'0')}.mkv`,duration:episode+30,progress:episode/100,episodeTitle:'Episode '+episode});
  const archive=Array.from({length:1000},(_,i)=>({...base,id:'archive-'+i,title:'Archive '+i,originalTitle:'Archive '+i,metadataOrigin:'manual',tmdbId:10000+i,certificationCheckedAt:1,path:`cloud://bench/archive-${i}.mkv`}));db.save({demo:false,sources:[{id:'bench',type:'cloud',path:'cloud://bench/',status:'online'}],media:[...targets,...archive]});
  let apiRequests=0,imageRequests=0,apiActive=0,imageActive=0,apiPeak=0,imagePeak=0,saves=0,dbMs=0,publications=0;
  for(const name of ['save','saveMedia'])if(db[name]){const original=db[name].bind(db);db[name]=(...args)=>{const began=performance.now();const result=original(...args);dbMs+=performance.now()-began;saves++;return result;};}
  const fetcher=async(url,options={})=>{
    const u=new URL(url),image=u.hostname==='image.tmdb.org';if(image){imageRequests++;imageActive++;imagePeak=Math.max(imagePeak,imageActive);}else{apiRequests++;apiActive++;apiPeak=Math.max(apiPeak,apiActive);}
    try{
      await delay(image?40:100,undefined,{signal:options.signal});if(image)return new Response(new Uint8Array([255,216,255,217]));
      const tv=u.pathname.includes('/tv'),query=u.searchParams.get('query'),id=query?(tv?50:Number(query.replace('BenchMovie',''))):Number(u.pathname.split('/').filter(Boolean).at(-1));
      const title=tv?'BenchShow':'BenchMovie'+id,record={id,...(tv?{name:title,original_name:title,first_air_date:'2024-01-01'}:{title,original_title:title,release_date:'2024-01-01'}),poster_path:`/poster-${id}.jpg`,backdrop_path:`/backdrop-${id}.jpg`,overview:'Benchmark metadata',runtime:120,genres:[],credits:{cast:Array.from({length:12},(_,i)=>({id:i+100,name:'Actor '+i,profile_path:`/actor-${i}.jpg`})),crew:[{id:1,name:'Director',job:'Director',profile_path:'/director.jpg'}]},release_dates:{results:[]},content_ratings:{results:[]}};
      return new Response(JSON.stringify(query?{results:[record]}:record),{headers:{'Content-Type':'application/json'}});
    }finally{if(image)imageActive--;else apiActive--;}
  };
  try{
    service=new LibraryService({database:db,directory,getSettings:()=>({autoScrape:true,watchFolders:false,tmdbToken:'benchmark-test',metadataLanguage:'zh-CN'}),notify(event){if(event==='library:changed')publications++;},authorize(){},getInput:async()=>{throw Error('Benchmark must not read video bytes');},fetcher});await service.init();
    const began=performance.now();service.enqueue(targets,true);if(service.onIdle)await service.onIdle();else{const deadline=Date.now()+120000;while(service.jobs.size){if(Date.now()>deadline)throw Error('Benchmark did not finish');await delay(20);}}const elapsedMs=Math.round(performance.now()-began),stored=db.load();
    for(const original of targets){const current=stored.media.find(m=>m.id===original.id);assert.equal(current.metadataOrigin,'tmdb');assert.equal(current.progress,original.progress);assert.equal(current.path,original.path);assert.equal(current.duration,original.duration);if(original.kind==='tv')assert.equal(current.episodeNumber,original.episodeNumber);assert.match(current.poster,/^luma-media:/);}
    return {files:targets.length,works:9,libraryRecords:stored.media.length,elapsedMs,apiRequests,imageRequests,apiPeak,imagePeak,saves,dbMs:Math.round(dbMs),publications};
  }finally{await service?.close();db.close();await fs.rm(directory,{recursive:true,force:true});}
}
run(process.argv[2]||process.cwd()).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error);process.exitCode=1;});
