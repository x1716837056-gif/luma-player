const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {EpisodePlayback}=require('../electron/episode-playback.cjs');
const {MpvPlayer}=require('../electron/mpv.cjs');
const media=[1,2,3].map(n=>({id:String(n),title:'Show',seriesTitle:'Show',kind:'tv',season:1,episodeNumber:n,path:`C:/Show.S01E0${n}.mkv`,sourceId:'nas'}));
function fixture(){const player=new EventEmitter();player.state={active:true,mediaId:'1',position:10,duration:10};player.command=async()=>{};player.loadNext=async m=>{player.state={active:true,mediaId:m.id};};const prefs={autoplay:true},notices=[];const playback=new EpisodePlayback({player,getMedia:()=>media,getSettings:()=>prefs,readable:async()=>{},notice:m=>notices.push(m)});return {player,prefs,playback,notices};}
test('EOF and end-file notifications complete an episode only once; seeking back enables another completion',()=>{
  const p=new MpvPlayer();p.state={active:true,mediaId:'1',duration:100,position:99};let ends=0;p.on('ended',()=>ends++);
  p.message({event:'property-change',name:'eof-reached',data:true});p.message({event:'end-file',reason:'eof'});assert.equal(ends,1);assert.equal(p.state.position,100);
  p.message({event:'property-change',name:'eof-reached',data:false});p.message({event:'property-change',name:'eof-reached',data:true});assert.equal(ends,2);
});
test('autoplay disabled prevents natural advance but permits an explicit next request',async()=>{
  const {playback,player,prefs}=fixture();prefs.autoplay=false;await playback.advance(true);assert.equal(player.state.mediaId,'1');await playback.advance(false);assert.equal(player.state.mediaId,'2');
});
test('pending read is cancelled by stop, close or a settings change and duplicate requests cannot skip episodes',async()=>{
  for(const cancel of ['stop','close','settings']){
    const {playback,player,prefs}=fixture();let resolve;playback.readable=()=>new Promise(r=>resolve=r);const first=playback.advance(true),second=playback.advance(true);
    if(cancel==='stop')playback.cancel();else if(cancel==='close'){player.state.active=false;player.emit('state',player.state);}else prefs.autoplay=false;
    resolve();await Promise.all([first,second]);assert.equal(player.state.mediaId,'1');
  }
});
test('read failure is reported without starting another file',async()=>{
  const {playback,player,notices}=fixture();playback.readable=async()=>{throw new Error('offline');};await playback.advance(true);assert.equal(player.state.mediaId,'1');assert.equal(notices.length,1);
});

test('next episode viewing history resets only after a successful load',async()=>{
  const {playback,player}=fixture();let reset=0;playback.afterNext=()=>{reset++;};player.loadNext=async()=>{throw Error('decoder failure');};await playback.advance(true);assert.equal(reset,0);
  player.loadNext=async m=>{player.state={active:true,mediaId:m.id};};await playback.advance(true);assert.equal(reset,1);assert.equal(player.state.mediaId,'2');
});
test('decoder/load failure retains the last successful episode instead of skipping it or restarting autoplay',async()=>{
  const p=new MpvPlayer();p.child={exitCode:null};p.socket={};p.state={active:true,mediaId:'1',duration:100,position:100,tracks:[]};
  p.command=async command=>{if(command[0]==='loadfile')throw new Error('decoder error');};
  await assert.rejects(p.loadNext({...media[1],duration:1}),/decoder error/);assert.equal(p.state.mediaId,'1');assert.equal(p.state.paused,true);assert.equal(p.finishedMediaId,'1');let ended=false;p.on('ended',()=>ended=true);p.finishEpisode();assert.equal(ended,false);
});
