// Explicit opt-in integration test. Reads media; all test data stays in a temporary local profile.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {setTimeout:delay}=require('node:timers/promises');
const {scanFolder}=require('../electron/library.cjs');
const {probeMedia,toolPath}=require('../electron/probe.cjs');
const {MpvPlayer}=require('../electron/mpv.cjs');
const {openLibraryDatabase}=require('../electron/database.cjs');
async function until(check,timeout=15000){const deadline=Date.now()+timeout;while(!check()){if(Date.now()>deadline)throw new Error('Timed out waiting for playback');await delay(100);}}
(async()=>{
  const folder=process.argv[2];if(!folder)throw new Error('Provide a media folder as an explicit argument.');
  const scan=(await fs.stat(folder)).isFile()?{media:[{...require('../shared/filename.mjs').parseRelease(path.basename(folder)),id:'sample',sourceId:'sample',path:folder}],sources:[]}:await scanFolder(folder,'nas');
  assert.ok(scan.media.length>0);
  const item=(process.argv[3] ? scan.media.find(m=>path.basename(m.path).includes(process.argv[3])) : null) || scan.media.find(m=>path.basename(m.path).toLowerCase()==='747.m2ts') || scan.media[0];
  const before=await fs.stat(item.path),data=await probeMedia(item.path);
  assert.ok(data.technical.durationSeconds>0);assert.ok(data.technical.width>0);assert.ok(data.technical.tracks.some(t=>t.type==='audio'));
  console.log('PASS: real library scan and ffprobe',JSON.stringify({count:scan.media.length,codec:data.technical.videoCodec,width:data.technical.width,height:data.technical.height,hdrSource:data.technical.hdr,audioTracks:data.technical.tracks.filter(t=>t.type==='audio').length}));
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'luma-real-playback-'));
  let db=openLibraryDatabase(directory);const player=new MpvPlayer();
  db.save({demo:false,media:[{...item,...data}],sources:scan.source?[scan.source]:[]});
  player.on('progress',state=>{if(state.duration>0){const library=db.load();library.media[0].progress=state.position/state.duration;db.save(library);}});
  try {
    await player.start(toolPath('mpv'),{...item,...data},{mute:true});
    await until(()=>player.state.duration>0 && player.state.tracks.length>0);
    await player.control('pause',true);await until(()=>player.state.paused===true);
    const target=Math.min(10,player.state.duration/2);await player.control('seek',target);
    await until(()=>Math.abs(player.state.position-target)<1);
    const audio=player.state.tracks.filter(t=>t.type==='audio');assert.ok(audio.length);
    await player.control('aid',audio.at(-1).id);
    await until(()=>player.state.tracks.find(t=>t.type==='audio'&&t.selected)?.id===audio.at(-1).id);
    const subtitles=player.state.tracks.filter(t=>t.type==='sub');
    if(subtitles.length) {await player.control('sid',subtitles.at(-1).id);await until(()=>player.state.tracks.find(t=>t.type==='sub'&&t.selected)?.id===subtitles.at(-1).id);console.log('PASS: embedded subtitle selection');}
    await player.control('sid','no');
    const rendered=await player.command(['get_property','video-out-params']);assert.ok(rendered.w>0);
    await player.stop();assert.equal(player.state.active,false);
    db.close();db=openLibraryDatabase(directory);assert.ok(db.load().media[0].progress>0);
    console.log('PASS: real mpv video output, JSON IPC, pause, seek, audio selection and persisted progress after restart');
    const after=await fs.stat(item.path);assert.equal(after.size,before.size);assert.equal(after.mtimeMs,before.mtimeMs);
    console.log('PASS: original media size and modification time unchanged');
  } finally {await player.stop();db.close();await fs.rm(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
