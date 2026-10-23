// Explicit live check; key material stays in memory, fixtures stay in a temporary profile.
import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {searchMetadata,resolveMetadata,cacheArtwork}=require('../electron/metadata.cjs');
const sourceProfile=process.argv[2];
if(!sourceProfile)throw new Error('Provide the existing profile directory.');
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'luma-tmdb-live-'));
await fs.copyFile(path.join(sourceProfile,'Local State'),path.join(temporary,'Local State'));
let app;
try {
  app=await electron.launch({args:['.',`--user-data-dir=${temporary}`],timeout:30000});
  await app.firstWindow();
  const settings=JSON.parse(await fs.readFile(path.join(sourceProfile,'settings.json'),'utf8'));
  const credential=settings.encryptedToken?await app.evaluate(({safeStorage},encrypted)=>safeStorage.decryptString(Buffer.from(encrypted,'base64')),settings.encryptedToken):settings.tmdbToken;
  console.log('PASS: encrypted credential loaded without exposing it');
  const fetcher=async(url,options={})=>{
    const request=app.evaluate(async({net},{url,headers})=>{
      const response=await net.fetch(url,{headers,signal:AbortSignal.timeout(20000)});
      return {status:response.status,body:Buffer.from(await response.arrayBuffer()).toString('base64')};
    },{url:String(url),headers:Object.fromEntries(new Headers(options.headers))});
    let timer;
    const result=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('TMDB connection timeout')),22000);})]).finally(()=>clearTimeout(timer));
    return new Response(Buffer.from(result.body,'base64'),{status:result.status});
  };
  const results=[];
  for(const [title,year] of [['坚如磐石',2023],['Captain Marvel',2019]]) {
    console.log('Checking '+title);
    const candidates=await searchMetadata({title,year},title,'movie',credential,'zh-CN',fetcher);
    const candidate=candidates.find(m=>m.year===year);
    if(!candidate)throw new Error('Expected movie candidate was not returned.');
    const details=await resolveMetadata({title,year},candidate,credential,'zh-CN',fetcher);
    const cached=await cacheArtwork(details,path.join(temporary,'artwork'),fetcher);
    results.push({query:title,title:details.title,year:details.year,tmdbId:details.tmdbId,description:Boolean(details.description),cast:details.cast.length,posterCached:cached.poster.startsWith('luma-media:'),backdropCached:cached.backdrop.startsWith('luma-media:')});
  }
  console.log(JSON.stringify(results,null,2));
}catch(error){console.error('Live check failed:',error.message);process.exitCode=1;}
finally {
  if(app){const child=app.process();const closing=app.close();await Promise.race([closing,new Promise(r=>setTimeout(r,5000))]);if(child.exitCode===null)child.kill();}
  await fs.rm(temporary,{recursive:true,force:true});
}
