// Uses only the user's ignored inventory; reads media without altering the library.
const fs=require('node:fs/promises'),assert=require('node:assert/strict'),path=require('node:path');
const {MpvPlayer}=require('../electron/mpv.cjs');
const {probeMedia,toolPath}=require('../electron/probe.cjs');
const {selectFixture}=require('./media-fixtures.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){const end=Date.now()+20000;while(!await check()){if(Date.now()>end)throw new Error('Real-media playback timed out');await delay(100);}}
(async()=>{
  const roles=['browser-ui','native-ui','dolby-vision-profile-5','dolby-vision-profile-7','high-frame-rate','pgs-subtitles'];
  const results=[];
  for(const role of roles){
    const fixture=selectFixture(role);assert.ok(fixture,'Private test inventory is required.');
    const before=await fs.stat(fixture.path),technical=await probeMedia(fixture.path),player=new MpvPlayer();
    const get=name=>player.command(['get_property',name]);
    try{
      await player.start(toolPath('mpv'),{id:'real-fixture',title:role,path:fixture.path,...technical},{mute:true,audioOutput:'null'});
      await until(()=>player.state.duration>0&&player.state.position>0);
      const video=await get('video-out-params');assert.ok(video.w>0&&video.h>0);
      await player.control('pause',true);await until(()=>player.state.paused);
      const seek=Math.min(45,player.state.duration/2);await player.control('seek',seek);await until(()=>Math.abs(player.state.position-seek)<1);
      const audios=player.state.tracks.filter(t=>t.type==='audio'),subs=player.state.tracks.filter(t=>t.type==='sub');
      const originalSid=await get('sid');
      if(audios.length){await player.control('aid',audios.at(-1).id);await until(async()=>await get('aid')===audios.at(-1).id);assert.equal(await get('sid'),originalSid);}
      const aid=await get('aid');
      if(subs.length){await player.control('sid',subs.at(-1).id);await until(async()=>await get('sid')===subs.at(-1).id);assert.equal(await get('aid'),aid);}
      await player.control('sid','no');assert.equal(await get('aid'),aid);
      results.push({role,path:fixture.path,rendered:{width:video.w,height:video.h},seek,audioTracks:audios.length,subtitleTracks:subs.length,passed:true,audioOutput:'null'});
      console.log('PASS real-media decode, video output, pause, seek and independent tracks:',role);
    }finally{await player.stop();const after=await fs.stat(fixture.path);assert.equal(after.size,before.size);assert.equal(after.mtimeMs,before.mtimeMs);}
  }
  await fs.mkdir('verification-local',{recursive:true});await fs.writeFile(path.resolve('verification-local/playback-results.json'),JSON.stringify({testedAt:new Date().toISOString(),limits:'Short read-only playback checks. Audio uses null output; no speaker, passthrough, full-film stability or physical HDR certification.',results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
