const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizeAudioOutput,needsNativeAudio,browserPlaybackCompatible}=require('../shared/audio.mjs');
const {audioArguments,audioSnapshot,deviceList}=require('../electron/audio-output.cjs');
const {AudioMonitor}=require('../electron/audio-monitor.cjs');
const raw=(format='float',driver='wasapi')=>({tracks:[{type:'audio',id:2,codec:'truehd',selected:true,'demux-channel-count':8,'demux-samplerate':48000}],output:{format,'channel-count':format.startsWith('spdif')?2:8,channels:'7.1',samplerate:format.startsWith('spdif')?192000:48000},driver,devices:[{name:'auto',description:'System'}]});
test('audio settings whitelist codecs/layouts/devices, preserve old compatible defaults and isolate test null output',()=>{
  assert.equal(normalizeAudioOutput(null).mode,'auto');assert.equal(normalizeAudioOutput({mode:'unsafe',device:'wasapi/device\n--script=evil',channels:'99',codecs:['truehd','evil']}).device,'auto');assert.deepEqual(normalizeAudioOutput({codecs:[]}).codecs,[]);
  const hdmi=audioArguments({mode:'hdmi',channels:'7.1'});assert.ok(hdmi.includes('--audio-spdif=ac3,eac3,dts,dts-hd,truehd'));assert.ok(hdmi.includes('--audio-exclusive=yes'));assert.ok(hdmi.includes('--audio-channels=7.1,5.1,5.1(side),stereo'));assert.ok(hdmi.includes('--video-sync=audio'));assert.ok(hdmi.includes('--replaygain=no'));assert.ok(hdmi.includes('--gapless-audio=no'));
  const endpoint=audioArguments({device:'wasapi/{endpoint}'});assert.ok(endpoint.includes('--audio-device=wasapi/{endpoint}'));assert.ok(!endpoint.some(a=>a.startsWith('--ao=')));
  const empty=audioArguments({mode:'hdmi',device:'wasapi/{endpoint}'},{testNull:true});assert.ok(empty.includes('--ao=null'));assert.ok(!empty.some(a=>a.startsWith('--audio-device=')));assert.ok(empty.includes('--audio-exclusive=no'));
  assert.equal(needsNativeAudio({mode:'hdmi'}),true);assert.equal(needsNativeAudio({channels:'7.1'}),true);assert.equal(needsNativeAudio(),false);assert.equal(deviceList([{name:'auto'},{name:'openal'},{name:'wasapi/test'}]).length,2);
});
test('only actual WASAPI encoded output reports passthrough; carrier channels/rate are never labeled lost channels or source Atmos',()=>{
  const encoded=audioSnapshot({mode:'hdmi'},raw('spdif-truehd'));assert.equal(encoded.passthrough,true);assert.equal(encoded.downmixed,false);assert.equal(encoded.sourceRate,48000);assert.equal(encoded.outputRate,192000);assert.ok(!encoded.sourceLabel.includes('Atmos'));
  const stale=audioSnapshot({mode:'hdmi',device:'wasapi/missing'},raw('spdif-truehd'));assert.equal(stale.passthrough,false);assert.equal(stale.status,'unavailable');assert.equal(stale.outputFormat,undefined);
  const simulated=audioSnapshot({mode:'hdmi'},raw('spdif-truehd','null'),{testNull:true});assert.equal(simulated.status,'test');assert.equal(simulated.passthrough,false);
  const pcm=audioSnapshot({mode:'hdmi'},raw());assert.equal(pcm.status,'pcm');assert.equal(pcm.expected,true);assert.equal(pcm.passthrough,false);assert.match(pcm.message,/未建立/);
  const stereo=raw();stereo.output['channel-count']=2;assert.equal(audioSnapshot({},stereo).downmixed,true);
  const noTrack={tracks:[],output:null};assert.equal(audioSnapshot({},noTrack).status,'no-track');assert.equal(audioSnapshot({},raw(),{disabled:true}).status,'disabled');
});
function monitor(settings={}){const commands=[],p={state:{active:true,mediaId:'fixture',paused:false},socket:{},command:async c=>{commands.push(c);},emit(){}};const m=new AudioMonitor(p,settings);m.raw=raw();m.started=Date.now()-10000;return {m,p,commands};}
test('strict passthrough pauses on decoded PCM while compatible codec PCM is allowed',async()=>{
  const {m,p,commands}=monitor({mode:'hdmi',fallback:false});await m.check();assert.ok(commands.some(c=>c[1]==='pause'&&c[2]===true));assert.equal(p.state.paused,true);m.stop();
  const a=monitor({mode:'hdmi',fallback:false});a.m.raw.tracks[0].codec='aac';await a.m.check();assert.equal(a.commands.some(c=>c[1]==='pause'),false);a.m.stop();
});
test('disconnected explicit endpoint pauses without silently selecting another speaker; user-disabled audio does not recover',async()=>{
  const {m,p,commands}=monitor({mode:'hdmi',device:'wasapi/missing'});m.raw=raw('spdif-truehd');await m.check();assert.equal(p.state.paused,true);assert.equal(p.state.audio.status,'unavailable');assert.equal(p.state.audio.passthrough,false);assert.equal(p.state.audio.outputFormat,undefined);assert.ok(!commands.some(c=>c[1]==='audio-device'));assert.match(p.state.audio.message,/断开/);m.stop();
  const disabled=monitor({mode:'hdmi'});disabled.m.disabled=true;disabled.m.raw.output=null;await disabled.m.check();assert.ok(!disabled.commands.some(c=>c[1]==='audio-spdif'));disabled.m.stop();
});
test('audio failure recovery is bounded, retains the selected track and pause state, and does not change the video position',async()=>{
  const {m,commands}=monitor({mode:'hdmi'});m.raw.output=null;await m.check();assert.equal(m.fallback,true);assert.equal(m.attempted,true);assert.ok(commands.some(c=>c[1]==='aid'&&c[2]===2));assert.ok(commands.some(c=>c[1]==='pause'&&c[2]===false));assert.ok(!commands.some(c=>['seek','loadfile'].includes(c[0])));const attempts=commands.filter(c=>c[1]==='audio-spdif').length;m.started=Date.now()-10000;await m.check();assert.equal(commands.filter(c=>c[1]==='audio-spdif').length,attempts);m.stop();
});
test('cancelled recovery cannot reconfigure a replacement socket or a next episode',async()=>{
  const {m,p,commands}=monitor({mode:'hdmi'});let release;p.command=async c=>{commands.push(c);if(c[1]==='pause')await new Promise(r=>release=r);};const recovery=m.recover();m.stop();p.socket={};release();await recovery;assert.equal(commands.length,1);
});
test('a new episode clears stale output status while retaining the explicit session PCM recovery',()=>{
  const {m}=monitor({mode:'hdmi'});m.last='old';m.fallback=true;m.raw.output={format:'spdif-truehd'};m.reset();assert.equal(m.last,undefined);assert.equal(m.raw.output,undefined);assert.equal(m.fallback,true);m.stop();
});

test('verified source profiles and DTS core downgrade are reported independently of carrier sample rate',()=>{
  const r=raw('spdif-dts');r.tracks[0]={...r.tracks[0],codec:'dts','ff-index':4};const a=audioSnapshot({mode:'hdmi',codecs:['dts']},r,{technical:{tracks:[{index:4,type:'audio',codecProfile:'DTS-HD MA',sampleRate:48000,bitDepth:24}]}});assert.equal(a.sourceLabel,'DTS-HD MA');assert.equal(a.coreOnly,true);assert.equal(a.sourceBitDepth,24);assert.equal(a.resampled,false);assert.match(a.message,/Core/);
  const pcm=raw();pcm.output.samplerate=44100;assert.equal(audioSnapshot({},pcm).resampled,true);
});
test('an explicit session PCM recovery overrides strict bitstream enforcement and can remain paused',async()=>{
  const {m,p,commands}=monitor({mode:'hdmi',fallback:false});p.state.paused=true;await m.recover();m.started=Date.now()-10000;await m.check();assert.equal(m.fallback,true);assert.equal(m.warned,false);assert.equal(commands.filter(c=>c[1]==='pause'&&c[2]===false).length,0);m.stop();
});
test('a late device-failure pause cannot overwrite the replacement episode state',async()=>{
  const {m,p}=monitor({mode:'hdmi',fallback:false});let release;p.command=async c=>{if(c[1]==='pause')await new Promise(r=>release=r);};const check=m.check();while(!release)await new Promise(r=>setImmediate(r));m.reset();p.state={active:true,mediaId:'next',paused:false};release();await check;assert.equal(p.state.mediaId,'next');assert.equal(p.state.paused,false);assert.equal(p.state.audio,undefined);m.stop();
});

test('reselecting the same audio track retains usable observations even when mpv emits no changed properties',async()=>{
  const {m,p}=monitor({mode:'hdmi'});const sample=raw('spdif-truehd');m.raw=sample;p.command=async c=>sample[{'audio-params':'input','audio-out-params':'output','current-ao':'driver','audio-device-list':'devices','track-list':'tracks'}[c[1]]];m.select(2);await m.refresh();await m.check();assert.equal(p.state.audio.passthrough,true);assert.equal(p.state.audio.sourceCodec,'truehd');m.stop();
});
test('snapshot refresh cannot overwrite newer observations or a replacement episode',async()=>{
  const {m,p}=monitor();let release;p.command=async c=>c[1]==='audio-out-params'?new Promise(r=>release=r):null;const refresh=m.refresh();m.changed({event:'property-change',name:'audio-out-params',data:{format:'spdif-truehd'}});release({format:'float'});await refresh;assert.equal(m.raw.output.format,'spdif-truehd');const old=m.refresh();m.reset();release({format:'float'});await old;assert.equal(m.raw.output,undefined);m.stop();
});
test('browser preference cannot silently discard unknown, HD, multichannel or multiple audio tracks',()=>{
  const base={path:'fixture.mp4',technical:{videoCodec:'h264',hdr:false,tracks:[{type:'audio',codec:'aac',channels:2}]}};assert.equal(browserPlaybackCompatible(base),true);assert.equal(browserPlaybackCompatible({...base,technical:undefined}),false);
  for(const track of [{codec:'truehd',channels:8},{codec:'aac',channels:6},{codec:'dts',channels:2},{codec:'aac'}])assert.equal(browserPlaybackCompatible({...base,technical:{...base.technical,tracks:[{type:'audio',...track}]}}),false);
  assert.equal(browserPlaybackCompatible({...base,technical:{...base.technical,tracks:[...base.technical.tracks,...base.technical.tracks]}}),false);assert.equal(browserPlaybackCompatible({...base,technical:{...base.technical,videoCodec:'hevc'}}),false);
});
