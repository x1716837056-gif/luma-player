const {MpvPlayer}=require('../electron/mpv.cjs');
const {toolPath,probeMedia}=require('../electron/probe.cjs');
const path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){const deadline=Date.now()+10000;while(!await check()){if(Date.now()>deadline)throw new Error('Interface state did not change');await delay(60);}}
(async()=>{
  const fixture=process.argv[2]?null:require('./media-fixtures.cjs').selectFixture('native-ui');
  const filename=process.argv[2]||fixture?.path||path.resolve('public/demo.mp4');
  console.log('Native interface coverage:',fixture?'private real-media library':process.argv[2]?'explicit fixture':'synthetic demo (no private inventory)');
  const technical=await probeMedia(filename),player=new MpvPlayer();
  const get=property=>player.command(['get_property',property]);
  const layout=()=>get('user-data/luma-osc/layout');
  async function point(x,y){const l=await layout();await player.command(['mouse',Math.round(x*l.scale),Math.round(y*l.scale)]);await delay(60);}
  async function click(id){let l=await layout();for(let i=0;!l.buttons[id]&&id.startsWith('row-')&&l.buttons.next&&i<20;i++){await click('next');l=await layout();}const box=l.buttons[id];assert.ok(box,`Missing control ${id}: ${JSON.stringify(l)}`);await point(box.x+box.w/2,box.y+box.h/2);await player.command(['keypress','MBTN_LEFT']);await delay(120);}
  async function menuIs(value){try{await until(async()=>await get('user-data/luma-osc/menu')===value&&(await layout()).kind===value);}catch(error){console.log('Menu diagnostic',JSON.stringify({expected:value,menu:await get('user-data/luma-osc/menu'),mouse:await get('mouse-pos'),layout:await layout(),paused:player.state.paused}));throw error;}}
  async function above(id){const l=await layout(),box=l.buttons[id];assert.ok(l.menu.y+l.menu.h<box.y);const expected=Math.max(12,Math.min(box.x+box.w/2-l.menu.w/2,l.width-l.menu.w-12));assert.ok(Math.abs(l.menu.x-expected)<2);}
  async function screenshot(name){await player.command(['screenshot-to-file',path.resolve('reference',name),'window']);}
  try {
    await fs.mkdir('reference',{recursive:true});
    await player.start(toolPath('mpv'),{id:'interface-test',title:process.argv[3]||'Luma · 播放界面',description:'一部关于探索、重逢和勇气的电影。右键可查看简介，返回只退出当前一层。',genre:['剧情'],director:'测试导演',path:filename,...technical},{mute:true,audioOutput:'null'});
    assert.equal(await get('user-data/luma-osc/loaded'),true);
    await player.control('pause',true);await player.control('seek',Math.min(90,technical.technical.durationSeconds/2));await delay(400);
    await screenshot(process.argv[4]||'mpv-refined.png');
    const initial=await get('osd-dimensions');
    for(const geometry of ['1920x1080','1440x900','920x650','420x360']){
      await player.command(['set_property','geometry',geometry]);await delay(350);await player.command(['script-message','luma-show']);await delay(80);
      const l=await layout();assert.ok(l.panel.w<=1120&&l.panel.x>=15&&l.panel.x+l.panel.w<=l.width-15);assert.equal(l.panel.h,90);assert.ok(l.buttons.seek.y+l.buttons.seek.h<l.buttons.toggle.y);
      const controls=Object.entries(l.buttons).filter(([id])=>['volume','toggle','rewind','forward','speed','audio','subtitles','fullscreen'].includes(id));
      for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const [ai,a]=controls[i],[bi,b]=controls[j];assert.ok(a.x+a.w<=b.x+.5||b.x+b.w<=a.x+.5,`Native controls overlap: ${ai}, ${bi}`);}
      assert.ok(await get('sub-margin-y-offset')>0);await screenshot('mpv-apple-'+geometry+'.png');
    }
    await player.command(['set_property','geometry',initial.w+'x'+initial.h]);await delay(1000);await player.command(['script-message','luma-show']);await delay(100);
    const sizes=(await layout()).buttons;
    for(const id of ['speed','audio','subtitles','fullscreen'])assert.deepEqual([sizes[id].w,sizes[id].h],[40,40]);
    await click('speed');await menuIs('speed');await above('speed');await screenshot('mpv-speed-menu.png');await click('row-5');await until(async()=>await get('speed')===1.5);assert.equal(await get('speed'),1.5);await player.command(['set_property','speed',1]);
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
    await player.command(['keypress','MBTN_RIGHT']);await menuIs('context');await click('row-5');await menuIs('audio-output');await screenshot('mpv-audio-output.png');await player.command(['keypress','ESC']);await menuIs(false);
    await player.command(['keypress','MBTN_RIGHT']);await menuIs('context');await click('row-4');await menuIs('color');await screenshot('mpv-color-menu.png');await click('row-2');assert.equal(await get('target-trc'),'srgb');assert.equal(await get('target-peak'),'auto');
    await player.command(['keypress','MBTN_RIGHT']);await menuIs('context');await click('row-4');await menuIs('color');await click('row-3');assert.equal(await get('target-trc'),'pq');
    await player.command(['keypress','MBTN_RIGHT']);await menuIs('context');await click('row-4');await menuIs('color');await click('row-5');await menuIs('color-peak');await click('row-3');assert.equal(await get('target-peak'),600);
    await player.command(['keypress','MBTN_RIGHT']);await menuIs('context');await click('row-4');await menuIs('color');await click('row-2');await until(async()=>await get('target-trc')==='srgb');assert.equal(await get('target-peak'),'auto');
    await player.command(['keypress','MBTN_RIGHT']);await menuIs('context');await click('row-4');await menuIs('color');await click('row-4');await menuIs('color-curve');await click('row-3');assert.equal(await get('tone-mapping'),'bt.2390');
    await player.command(['keypress','MBTN_RIGHT']);await menuIs('context');await click('row-4');await menuIs('color');await click('row-5');await menuIs('color-peak');await player.command(['keypress','ESC']);await menuIs('color');await player.command(['keypress','ESC']);await menuIs(false);
    await player.command(['keypress','MBTN_RIGHT']);await menuIs('context');await click('row-4');await menuIs('color');await click('row-1');assert.equal(await get('target-trc'),'auto');assert.equal(await get('target-peak'),'auto');
    await click('toggle');await until(()=>!player.state.paused);l=await layout();await point(l.width/2,l.height/3);await until(async()=>await get('user-data/luma-osc/visible')===false);await until(async()=>await get('sub-margin-y-offset')===0);
    await player.control('pause',true);await delay(250);l=await layout();const seek=l.buttons.seek;await point(seek.x+seek.w*.6,seek.y+seek.h/2);await until(async()=>await get('user-data/luma-osc/seek-height')===5);await player.command(['keypress','MBTN_LEFT']);await until(()=>Math.abs(player.state.position-player.state.duration*.6)<1);
    await click('fullscreen');await until(async()=>await get('fullscreen')===true);await delay(1000);await click('audio');await menuIs('audio');await player.command(['keypress','ESC']);await menuIs(false);assert.equal(await get('fullscreen'),true);
    await player.command(['keypress','ESC']);await until(async()=>await get('fullscreen')===false);assert.ok(player.state.active);
    console.log('PASS: unified native control sizes, menus above their trigger, pointer-leave dismissal, independent audio/subtitles, layered back, seek and auto-hide',JSON.stringify({codec:technical.technical.videoCodec,width:technical.technical.width,height:technical.technical.height}));
  }finally{await player.stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
