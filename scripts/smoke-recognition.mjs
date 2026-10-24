// Live TMDB checks use virtual naming fixtures, not synthetic files presented as real decoder acceptance.
import {_electron as electron} from 'playwright';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const token=process.env.LUMA_TEST_TMDB_TOKEN;if(!token)throw Error('A private TMDB test credential is required.');const profile=await fs.mkdtemp(path.join(os.tmpdir(),'luma-recognition-live-'));let app;
try{
  app=await electron.launch({...(process.env.LUMA_PACKAGED_EXE?{executablePath:process.env.LUMA_PACKAGED_EXE}:{}),args:[...(process.env.LUMA_PACKAGED_EXE?[]:['.']),`--user-data-dir=${profile}`],timeout:30000});await app.firstWindow();
  const results=await app.evaluate(async({app,net},token)=>{
    const load=name=>process.mainModule.require(app.getAppPath()+'/electron/'+name+'.cjs'),{recognize}=load('recognition'),{MetadataNetwork}=load('metadata-network'),network=new MetadataNetwork((url,options)=>net.fetch(url,options));await network.init();
    const cases=[['中文年份','坚如磐石（2023）国语中字.mkv'],['双语噪声','地心引力[4KHDR.CN]Gravity.2013.2160p.mkv'],['文件夹回退','惊奇队长（2019）/正片.mkv'],['繁体片名','驚奇隊長.2019.mkv'],['地区译名','神鬼認證.2002.mkv'],['中文剧集','小谢尔顿（2017）/Young.Sheldon.S01E08.mkv'],['不存在','LumaDefinitelyUnlisted_73b20c98_2024.mkv']];const rows=[];
    try{for(const [name,file] of cases){const media={id:name,title:'',path:'cloud://fixture/'+file,remote:{accountId:'fixture',path:'/'+file},kind:name==='中文剧集'?'tv':'movie'};const result=await recognize(media,token,'zh-CN',(url,options)=>network.fetch(url,options));rows.push({name,state:result.candidate?'matched':result.state,tmdbId:result.candidate?.tmdbId,title:result.candidate?.title,year:result.candidate?.year});}return {rows,metrics:network.metrics};}finally{await network.close();}
  },token);
  console.log('Live recognition states: '+JSON.stringify(results));
  for(const name of ['中文年份','双语噪声','文件夹回退','繁体片名','地区译名'])assert.equal(results.rows.find(r=>r.name===name).state,'matched',name);
  assert.equal(results.rows.find(r=>r.name==='文件夹回退').tmdbId,299537);assert.equal(results.rows.find(r=>r.name==='繁体片名').tmdbId,299537);assert.equal(results.rows.find(r=>r.name==='不存在').state,'not-found');assert.ok(['matched','review'].includes(results.rows.find(r=>r.name==='中文剧集').state));console.log('PASS live TMDB Chinese/mixed/folder/traditional/regional naming and unavailable-title handling. '+JSON.stringify(results));
}finally{await app?.close();await fs.rm(profile,{recursive:true,force:true});}
