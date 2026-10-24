const fs=require('node:fs/promises'),assert=require('node:assert/strict');
const {MpvPlayer}=require('../electron/mpv.cjs'),{EpisodePlayback}=require('../electron/episode-playback.cjs'),{probeMedia,toolPath}=require('../electron/probe.cjs');
const {selectFixture}=require('./media-fixtures.cjs'),{scanFolder}=require('../electron/library.cjs');
const path=require('node:path'),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){const end=Date.now()+30000;while(!await check()){if(Date.now()>end)throw new Error('Episode playback did not advance');await delay(100);}}
(async()=>{
  const fixture=selectFixture('season-episode-parsing');assert.ok(fixture,'Private TV library is required');
  const {media}=await scanFolder(path.dirname(fixture.path));media.sort((a,b)=>a.episodeNumber-b.episodeNumber);assert.ok(media.length>=3);
  for(const m of media.slice(0,3))Object.assign(m,await probeMedia(m.path));
  const stats=await Promise.all(media.slice(0,3).map(m=>fs.stat(m.path))),p=new MpvPlayer(),prefs={autoplay:true},notices=[];
  const playback=new EpisodePlayback({player:p,getMedia:()=>media,getSettings:()=>prefs,readable:m=>fs.access(m.path),notice:m=>notices.push(m)});
  const progress=[];p.on('progress',state=>{if(state.ended)progress.push(state.mediaId);});
  try{
    await playback.open(toolPath('mpv'),media[0],{mute:true,audioOutput:'null'});const pid=p.child.pid;
    await p.command(['set_property','fullscreen',true]);await p.control('pause',true);await p.control('seek',p.state.duration-1);await p.control('pause',false);
    await until(()=>p.state.mediaId===media[1].id&&!p.loading&&p.state.tracks.length>0);assert.equal(p.child.pid,pid);assert.equal(await p.command(['get_property','fullscreen']),true);assert.deepEqual(progress,[media[0].id]);assert.ok(p.state.position<10);
    console.log('PASS real TV EOF advances to next episode in the same mpv process and keeps fullscreen');
    await p.opening;await playback.pending;prefs.autoplay=false;await p.control('pause',true);await p.control('seek',p.state.duration-1);await p.control('pause',false);await until(async()=>await p.command(['get_property','eof-reached'])===true);await delay(600);assert.equal(p.state.mediaId,media[1].id);
    await p.command(['script-message','luma-next-episode']);await until(()=>p.state.mediaId===media[2].id&&!p.loading&&p.state.tracks.length>0);assert.equal(p.child.pid,pid);assert.equal(notices.length,0);
    console.log('PASS autoplay off, explicit native next request and independent completion tracking');
  }catch(error){console.log('Episode diagnostic',JSON.stringify({state:p.state,loading:p.loading,loadError:p.loadError,notices}));throw error;}finally{playback.cancel();await p.stop();const after=await Promise.all(media.slice(0,3).map(m=>fs.stat(m.path)));for(let i=0;i<stats.length;i++){assert.equal(stats[i].size,after[i].size);assert.equal(stats[i].mtimeMs,after[i].mtimeMs);}}
})().catch(error=>{console.error(error);process.exitCode=1;});
