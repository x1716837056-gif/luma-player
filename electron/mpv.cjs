const { spawn } = require('node:child_process');
const net = require('node:net');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

class MpvPlayer extends EventEmitter {
  constructor() { super(); this.state={active:false}; this.pending=new Map(); this.sequence=0; }
  async start(executable,media,options={}) {
    const operation=(this.opening||Promise.resolve()).catch(()=>{}).then(async()=>{
      try { return await this.open(executable,media,options); }
      catch(error) { this.socket?.destroy();this.child?.kill();this.socket=null;this.child=null;this.state={active:false};this.emit('state',this.state);throw error; }
    });
    this.opening=operation;
    return operation;
  }
  async open(executable,media,options={}) {
    await this.stop();
    const pipe=process.platform==='win32'?`\\\\.\\pipe\\luma-${crypto.randomUUID()}`:`/tmp/luma-${crypto.randomUUID()}`;
    const seconds=media.technical?.durationSeconds || media.duration*60 || 0;
    const script=[process.resourcesPath && path.join(process.resourcesPath,'player/luma-osc.lua'),path.join(__dirname,'player/luma-osc.lua')].filter(Boolean).find(file=>fs.existsSync(file));
    if(!script)throw new Error('播放器界面文件缺失，请重新解压完整的 Luma 程序。');
    this.state={active:true,mediaId:media.id,title:media.title,position:0,duration:seconds,paused:false,tracks:[]};
    const args=['--no-config','--no-terminal','--force-window=yes','--keep-open=no','--hwdec=auto-copy','--osc=no','--osd-bar=no',`--script=${script}`,'--autofit=85%x85%',`--input-ipc-server=${pipe}`,`--title=Luma · ${media.title}`,`--force-media-title=${media.title}`];
    if(process.platform==='win32')args.push('--vo=gpu-next','--gpu-api=d3d11','--title-bar=no','--window-corners=round');
    if(options.mute)args.push('--mute=yes');
    if (media.progress>0 && media.progress<.96 && seconds>0) args.push(`--start=${media.progress*seconds}`);
    const child=spawn(executable,[...args,'--',media.path],{stdio:'ignore',windowsHide:true,shell:false});
    this.child=child;
    let spawnError;
    child.on('error',error=>{spawnError=error;});
    child.once('exit',()=>{
      if(this.child!==child) return;
      this.emit('progress',{...this.state,force:true});
      this.socket?.destroy(); this.socket=null; this.child=null;
      this.state={active:false}; this.emit('state',this.state);
    });
    for(let attempt=0;attempt<100;attempt++) {
      if(spawnError || child.exitCode!==null) throw new Error('mpv 启动失败，请检查播放器路径和文件。');
      try {
        this.socket=await new Promise((resolve,reject)=>{const socket=net.createConnection(pipe);socket.once('connect',()=>{socket.removeListener('error',reject);resolve(socket);});socket.once('error',error=>{socket.destroy();reject(error);});});
        break;
      } catch { await new Promise(r=>setTimeout(r,100)); }
    }
    if(!this.socket) { child.kill(); throw new Error('无法连接 mpv 控制通道。'); }
    this.socket.setEncoding('utf8');
    let buffer='';
    this.socket.on('error',()=>{});
    this.socket.on('close',()=>{for(const p of this.pending.values())p.reject(new Error('播放器连接已关闭。'));this.pending.clear();});
    this.socket.on('data',chunk=>{
      buffer+=chunk.toString('utf8');
      let index;
      while((index=buffer.indexOf('\n'))>=0) {
        const line=buffer.slice(0,index);buffer=buffer.slice(index+1);
        try { this.message(JSON.parse(line)); } catch { /* Ignore unrelated malformed events. */ }
      }
    });
    for(const [i,property] of ['time-pos','duration','pause','track-list'].entries()) await this.command(['observe_property',i+1,property]);
    // A connected IPC pipe alone does not prove the decoder produced video.
    let output;
    for(let attempt=0;attempt<60;attempt++) {
      if(this.child!==child || child.exitCode!==null)throw new Error('影片解码失败，请检查文件是否完整。');
      output=await this.command(['get_property','video-out-params']).catch(()=>null);
      if(output?.w>0)break;
      if(attempt===30)await this.command(['set_property','hwdec','no']).catch(()=>{});
      await new Promise(r=>setTimeout(r,250));
    }
    if(!output?.w)throw new Error('没有收到视频画面，请检查片源连接或尝试其他影片。');
    this.emit('state',this.state);
    return this.state;
  }
  message(message) {
    if(message.request_id && this.pending.has(message.request_id)) {
      const pending=this.pending.get(message.request_id);this.pending.delete(message.request_id);
      message.error==='success'?pending.resolve(message.data):pending.reject(new Error('播放器命令失败。'));
    }
    if(message.event==='property-change' && message.data!==undefined) {
      const key={'time-pos':'position',duration:'duration',pause:'paused','track-list':'tracks'}[message.name];
      if(key) this.state[key]=message.data;
      this.emit('state',{...this.state});
      if(message.name==='time-pos') this.emit('progress',{...this.state});
    }
    if(message.event==='end-file' && message.reason==='eof') {
      this.state.position=this.state.duration;this.emit('progress',{...this.state,ended:true});
    }
    if(message.event==='end-file' && message.reason==='error') {
      this.state.error='影片播放中断，请检查片源连接或使用兼容解码。';this.emit('state',{...this.state});
    }
  }
  command(command) {
    if(!this.socket || this.socket.destroyed) return Promise.reject(new Error('播放器未连接。'));
    const request_id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(request_id);reject(new Error('播放器响应超时。'));},5000);
      this.pending.set(request_id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
      this.socket.write(JSON.stringify({command,request_id})+'\n');
    });
  }
  async control(action,value) {
    if(action==='pause') return this.command(['set_property','pause',Boolean(value)]);
    if(action==='seek' && Number.isFinite(value) && value>=0) return this.command(['seek',value,'absolute']);
    if(['aid','sid'].includes(action) && (value==='no'||Number.isInteger(value))) return this.command(['set_property',action,value]);
    if(action==='stop') return this.stop();
    throw new Error('无效的播放器操作。');
  }
  async stop() {
    const child=this.child;
    if(!child)return;
    this.emit('progress',{...this.state,force:true});
    try { await this.command(['quit']); } catch { child.kill(); }
    if(child.exitCode===null) await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(()=>{child.kill();r();},2000))]);
  }
}
module.exports={MpvPlayer};
