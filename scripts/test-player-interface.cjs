const {MpvPlayer}=require('../electron/mpv.cjs');
const {toolPath,probeMedia}=require('../electron/probe.cjs');
const path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){const deadline=Date.now()+10000;while(!await check()){if(Date.now()>deadline)throw new Error('Interface state did not change');await delay(60);}}
(async()=>{
  const filename=process.argv[2]||path.resolve('public/demo.mp4');
  const technical=await probeMedia(filename),player=new MpvPlayer();
  const get=property=>player.command(['get_property',property]);
  const layout=()=>get('user-data/luma-osc/layout');
  async function point(x,y){const l=await layout();await player.command(['mouse',Math.round(x*l.scale),Math.round(y*l.scale)]);await delay(60);}
  async function click(id){let l=await layout();for(let i=0;!l.buttons[id]&&id.startsWith('row-')&&l.buttons.next&&i<20;i++){await click('next');l=await layout();}const box=l.buttons[id];assert.ok(box,`Missing control ${id}: ${JSON.stringify(l)}`);await point(box.x+box.w/2,box.y+box.h/2);await player.command(['keypress','MBTN_LEFT']);await delay(120);}
  async function menuIs(value){await until(async()=>await get('user-data/luma-osc/menu')===value&&(await layout()).kind===value);}
  async function above(id){const l=await layout(),box=l.buttons[id];assert.ok(l.menu.y+l.menu.h<box.y);const expected=Math.max(12,Math.min(box.x+box.w/2-l.menu.w/2,l.width-l.menu.w-12));assert.ok(Math.abs(l.menu.x-expected)<2);}
  async function screenshot(name){await player.command(['screenshot-to-file',path.resolve('reference',name),'window']);}
  try {
    await fs.mkdir('reference',{recursive:true});
    await player.start(toolPath('mpv'),{id:'interface-test',title:process.argv[3]||'Luma · 播放界面',description:'一部关于探索、重逢和勇气的电影。右键可查看简介，返回只退出当前一层。',genre:['剧情'],director:'测试导演',path:filename,...technical},{mute:true,audioOutput:'null'});
    assert.equal(await get('user-data/luma-osc/loaded'),true);
    await player.control('pause',true);await player.control('seek',Math.min(90,technical.technical.durationSeconds/2));await delay(400);
    await screenshot(process.argv[4]||'mpv-refined.png');
    const sizes=(await layout()).buttons;
    for(const id of ['speed','audio','subtitles','fullscreen'])assert.deepEqual([sizes[id].w,sizes[id].h],[40,40]);
    await click('speed');await menuIs('speed');await above('speed');await screenshot('mpv-speed-menu.png');await click('row-5');assert.equal(await get('speed'),1.5);await player.command(['set_property','speed',1]);
    const audio=player.state.tracks.filter(t=>t.type==='audio'),subs=player.state.tracks.filter(t=>t.type==='sub');
    const sid=await get('sid');await click('audio');await menuIs('audio');await above('audio');await screenshot('mpv-audio-menu.png');
    if(audio.length){await click('row-'+audio.length);await until(async()=>await get('aid')===audio.at(-1).id);}else await player.command(['keypress','ESC']);
    assert.equal(await get('sid'),sid);
    const aid=await get('aid');await click('subtitles');await menuIs('subtitles');await above('subtitles');await screenshot('mpv-subtitle-menu.png');await click('row-'+(subs.length+1));
    await until(async()=>await get('sid')===(subs.length?subs.at(-1).id:false));assert.equal(await get('aid'),aid);
    await click('speed');let l=await layout();await point(l.width/2,l.height/3);await menuIs(false);assert.ok(player.state.active);
    await point(l.width/2,l.height/3);await player.command(['keypress','MBTN_RIGHT']);await menuIs('context');await click('row-1');await menuIs('overview');await screenshot('mpv-overview.png');
    await player.command(['keypress','Alt+LEFT']);await menuIs(false);assert.ok(player.state.active);
    await player.command(['keypress','MBTN_RIGHT']);await menuIs('context');await click('row-2');await menuIs('source');await screenshot('mpv-source-info.png');await click('back');await menuIs(false);assert.ok(player.state.active);
    await click('toggle');await until(()=>!player.state.paused);l=await layout();await point(l.width/2,l.height/3);await until(async()=>await get('user-data/luma-osc/visible')===false);
    await player.control('pause',true);await delay(250);l=await layout();const seek=l.buttons.seek;await point(seek.x+seek.w*.6,seek.y+seek.h/2);await player.command(['keypress','MBTN_LEFT']);await until(()=>Math.abs(player.state.position-player.state.duration*.6)<1);
    await click('fullscreen');await until(async()=>await get('fullscreen')===true);await delay(200);await click('audio');await menuIs('audio');await player.command(['keypress','ESC']);await menuIs(false);assert.equal(await get('fullscreen'),true);
    await player.command(['keypress','ESC']);await until(async()=>await get('fullscreen')===false);assert.ok(player.state.active);
    console.log('PASS: unified native control sizes, menus above their trigger, pointer-leave dismissal, independent audio/subtitles, layered back, seek and auto-hide',JSON.stringify({codec:technical.technical.videoCodec,width:technical.technical.width,height:technical.technical.height}));
  }finally{await player.stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
