const {MpvPlayer}=require('../electron/mpv.cjs');
const {toolPath,probeMedia}=require('../electron/probe.cjs');
const path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){const deadline=Date.now()+10000;while(!await check()){if(Date.now()>deadline)throw new Error('Interface state did not change');await delay(100);}}
(async()=>{
  const filename=process.argv[2]||path.resolve('public/demo.mp4');
  const technical=await probeMedia(filename),player=new MpvPlayer();
  try {
    await fs.mkdir('reference',{recursive:true});
    await player.start(toolPath('mpv'),{id:'interface-test',title:process.argv[3]||'Luma · 播放界面',path:filename,...technical},{mute:true});
    assert.equal(await player.command(['get_property','user-data/luma-osc/loaded']),true);
    await player.control('pause',true);await player.control('seek',Math.min(90,technical.technical.durationSeconds/2));await delay(600);
    const dims=await player.command(['get_property','osd-dimensions']);
    const dpi=await player.command(['get_property','display-hidpi-scale']);
    const scale=Math.max(dpi,dims.h/900),W=dims.w/scale,H=dims.h/scale;
    const x=Math.max(20,(W-760)/2),y=H-166,w=Math.min(760,W-40);
    async function click(vx,vy){await player.command(['mouse',Math.round(vx*scale),Math.round(vy*scale)]);await delay(150);await player.command(['keypress','MBTN_LEFT']);await delay(200);}
    await player.command(['script-message','luma-show']);
    const output=path.resolve('reference',process.argv[4]||'mpv-refined.png');
    await player.command(['screenshot-to-file',output,'window']);
    await click(x+w-126,y+34);
    await player.command(['screenshot-to-file',path.resolve('reference/mpv-speed-menu.png'),'window']);
    await click(x+w-95,y-268+40+4*34+16);
    assert.equal(await player.command(['get_property','speed']),1.5);
    await player.command(['set_property','speed',1]);
    await click(x+w/2,y+34);await until(()=>!player.state.paused);
    await player.command(['mouse',Math.round(W/2*scale),Math.round(H/2*scale)]);
    await until(async()=>await player.command(['get_property','user-data/luma-osc/visible'])===false);
    await player.control('pause',true);await delay(300);
    await click(x+24+(w-48)*.6,y+80);
    const clickedRatio=(Math.round((x+24+(w-48)*.6)*scale)/scale-x-24)/(w-48);
    const playerDuration=await player.command(['get_property','duration']);
    await until(()=>Math.abs(player.state.position-playerDuration*clickedRatio)<1);
    await click(x+w-35,y+34);
    await until(async()=>await player.command(['get_property','fullscreen'])===true);
    await player.command(['keypress','ESC']);
    await until(async()=>await player.command(['get_property','fullscreen'])===false);
    console.log('PASS: real frame, custom Lua interface, speed selection, play/pause, seek, auto-hide and fullscreen',JSON.stringify({codec:technical.technical.videoCodec,width:technical.technical.width,height:technical.technical.height}));
  }finally{await player.stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
