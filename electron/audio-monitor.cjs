const {normalizeAudioOutput}=require('../shared/audio.mjs');
const {audioSnapshot,deviceList}=require('./audio-output.cjs');
const properties={'audio-params':'input','audio-out-params':'output','current-ao':'driver','audio-device-list':'devices','track-list':'tracks',aid:'aid',speed:'speed'};
class AudioMonitor{
  constructor(player,settings,{testNull=false,technical}={}){this.player=player;this.settings=normalizeAudioOutput(settings);this.testNull=testNull;this.raw={};this.serial=0;this.reset(technical);}
  reset(technical){if(technical!==undefined)this.technical=technical;this.serial++;this.started=Date.now();this.disabled=false;this.warned=false;this.last=undefined;this.versions={};this.raw={devices:this.raw.devices,driver:this.raw.driver};clearTimeout(this.timer);}
  select(value){this.serial++;this.started=Date.now();this.disabled=value==='no';this.warned=false;this.last=undefined;}
  async refresh(){
    const p=this.player,ticket=this.serial,socket=p.socket;if(this.closed||p.loading||p.audioReady===false||!socket)return;
    if(this.refreshing?.serial===ticket)return this.refreshing.promise;
    const versions={...this.versions};
    const promise=Promise.all(Object.entries(properties).map(async([name,key])=>[key,await p.command(['get_property',name]).catch(()=>null)])).then(rows=>{
      if(this.closed||ticket!==this.serial||socket!==p.socket)return;
      for(const [key,value] of rows)if(this.versions[key]===versions[key])this.raw[key]=key==='devices'?value?deviceList(value):undefined:value;
      this.schedule();
    }).finally(()=>{if(this.refreshing?.promise===promise)this.refreshing=null;});this.refreshing={serial:ticket,promise};return promise;
  }
  stop(){this.closed=true;this.serial++;clearTimeout(this.timer);}
  async observe(){for(const [i,name] of Object.keys(properties).entries())await this.player.command(['observe_property',100+i,name]);this.schedule(1200);}
  changed(message){if(message.event==='property-change'&&message.name in properties){const key=properties[message.name];this.raw[key]=message.data;this.versions[key]=(this.versions[key]||0)+1;if(message.name==='audio-device-list')this.raw.devices=deviceList(message.data);this.schedule();}if(message.event==='audio-reconfig')void this.refresh().catch(()=>{});}
  schedule(ms=200){clearTimeout(this.timer);if(this.closed)return;this.timer=setTimeout(()=>{void this.check().catch(()=>{});},ms);this.timer.unref?.();}
  async check(){
    const p=this.player,ticket=this.serial;if(this.closed||!p.state.active||p.loading||p.audioReady===false||!p.socket||this.recovering)return;
    const snapshot=audioSnapshot(this.settings,this.raw,{testNull:this.testNull,fallback:this.fallback,disabled:this.disabled,technical:this.technical}),key=JSON.stringify(snapshot);
    if(key!==this.last){this.last=key;p.state.audio=snapshot;p.emit('state',{...p.state});await p.command(['set_property','user-data/luma-osc/audio-status',snapshot]).catch(()=>{});}
    if(this.closed||ticket!==this.serial)return;
    if(Date.now()-this.started<1200){this.schedule(1300-(Date.now()-this.started));return;}
    const tracks=this.raw.tracks||[],hasAudio=tracks.some(t=>t.type==='audio'),missing=this.settings.device!=='auto'&&this.raw.devices&&!this.raw.devices.some(d=>d.name===this.settings.device);
    if(!this.disabled&&hasAudio&&(missing||snapshot.status==='unavailable'||snapshot.expected&&!snapshot.passthrough&&!snapshot.fallback&&!this.testNull&&snapshot.status==='pcm'&&!this.settings.fallback)){
      if(!missing&&this.settings.fallback&&!this.attempted&&!this.testNull){this.attempted=true;await this.recover();return;}
      if(!this.warned){this.warned=true;await p.command(['set_property','pause',true]).catch(()=>{});if(this.closed||ticket!==this.serial)return;p.state.paused=true;p.state.audio={...snapshot,...(missing?{status:'unavailable',passthrough:false,encoded:false,driver:'',outputFormat:undefined,outputRate:undefined,outputChannels:undefined,outputLayout:undefined}:{}),message:missing?'所选音频设备已断开，已暂停；请重连设备或手动选择系统默认输出。':'未建立所需音频输出，已暂停；可重试兼容 PCM。'};p.emit('state',{...p.state});await p.command(['set_property','user-data/luma-osc/audio-status',p.state.audio]).catch(()=>{});}
    }
  }
  async recover(useDefault=false){
    if(this.recovering)return this.recovering;
    const p=this.player,ticket=this.serial,socket=p.socket,track=(this.raw.tracks||[]).find(t=>t.type==='audio'&&t.selected)||(this.raw.tracks||[]).find(t=>t.type==='audio'),paused=Boolean(p.state.paused);
    const send=command=>{if(this.closed||ticket!==this.serial||p.socket!==socket)throw Error('音频操作已取消。');return p.command(command);};
    const work=(async()=>{
      await send(['set_property','pause',true]);
      if(this.closed||ticket!==this.serial)return;
      await send(['set_property','audio-spdif','']);if(this.closed||ticket!==this.serial)return;this.fallback=true;this.attempted=true;await send(['set_property','audio-exclusive',false]);
      if(useDefault){await send(['set_property','audio-device','auto']);this.settings={...this.settings,device:'auto'};}
      // Re-selecting audio is necessary after mpv disabled it on an AO initialization failure.
      await send(['set_property','aid','no']);if(this.closed||ticket!==this.serial)return;
      await send(['set_property','aid',track?.id||'auto']);
      if(this.closed||ticket!==this.serial)return;
      this.fallback=true;this.attempted=true;this.warned=false;this.disabled=false;this.started=Date.now();
      await send(['set_property','pause',paused]);
    })();this.recovering=work;try{await work;}finally{this.recovering=null;this.schedule(1400);}
  }
}
module.exports={AudioMonitor};
