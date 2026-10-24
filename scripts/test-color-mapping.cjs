const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {MpvPlayer}=require('../electron/mpv.cjs'),{probeMedia,toolPath}=require('../electron/probe.cjs');
const {selectFixture}=require('./media-fixtures.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){const end=Date.now()+15000;while(!await check()){if(Date.now()>end)throw new Error('Color mapping did not settle');await delay(100);}}
(async()=>{
  const results=[];await fs.mkdir('reference',{recursive:true});
  for(const role of ['dolby-vision-profile-5','dolby-vision-profile-7','dolby-vision-profile-8','pgs-subtitles','high-frame-rate','browser-ui']){
    const fixture=selectFixture(role);assert.ok(fixture,'Private test library is required');const before=await fs.stat(fixture.path),p=new MpvPlayer();
    const get=key=>p.command(['get_property',key]);
    try{
      await p.start(toolPath('mpv'),{id:'color-test',title:'色彩映射验证',path:fixture.path,...await probeMedia(fixture.path)},{mute:true,audioOutput:'null',colorMapping:{output:'sdr',curve:'bt.2390'}});
      await p.control('pause',true);await p.control('seek',Math.min(60,p.state.duration/2));await until(()=>Math.abs(p.state.position-Math.min(60,p.state.duration/2))<1);
      await until(async()=>Boolean((await get('video-target-params'))?.gamma));
      const input=await get('video-params'),target=await get('video-target-params');
      assert.equal(await get('current-vo'),'gpu-next');assert.equal(target.primaries,'bt.709');assert.ok(!['pq','hlg'].includes(target.gamma));
      assert.equal(await get('target-peak'),'auto');assert.equal(await get('inverse-tone-mapping'),false);
      if(role.startsWith('dolby-vision-profile-'))assert.equal(input.colormatrix,'dolbyvision');
      const hashes=[];
      for(const curve of ['bt.2390','bt.2446a']){
        await p.command(['set_property','tone-mapping',curve]);await delay(450);
        const output=path.resolve('reference',`color-${role}-${curve}.png`);await p.command(['screenshot-to-file',output,'window']);
        hashes.push(crypto.createHash('sha256').update(await fs.readFile(output)).digest('hex'));
      }
      if(role!=='browser-ui')assert.notEqual(hashes[0],hashes[1],'HDR tone curves should change actual rendered output');
      const targetAfter=await get('video-target-params');
      results.push({role,path:fixture.path,input,target:targetAfter,renderedCurveDifference:hashes[0]!==hashes[1],passed:true});
      console.log('PASS rendered mapping:',role,JSON.stringify({input:input.colormatrix,target:targetAfter.primaries,gamma:targetAfter.gamma,peak:targetAfter['max-luma'],curvesDiffer:hashes[0]!==hashes[1]}));
    }finally{await p.stop();const after=await fs.stat(fixture.path);assert.equal(before.size,after.size);assert.equal(before.mtimeMs,after.mtimeMs);}
  }
  await fs.mkdir('verification-local',{recursive:true});await fs.writeFile('verification-local/color-mapping-results.json',JSON.stringify({testedAt:new Date().toISOString(),limits:'SDR test desktop. Renderer input/target verified; not a physical HDR/Dolby Vision output, full FEL composition or audio certification.',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
