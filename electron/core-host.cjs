// A private IPC parent keeps the network helper from surviving an unexpected Luma exit.
const {spawn}=require('node:child_process'),fs=require('node:fs/promises'),path=require('node:path');
let child,run,root,timer,stopping=false;
async function cleanup(){if(run&&root){const target=path.resolve(run),parent=path.resolve(root)+path.sep;if(target.startsWith(parent)&&/^run-[a-f0-9-]+$/.test(path.basename(target)))await fs.rm(target,{recursive:true,force:true,maxRetries:30,retryDelay:100}).catch(()=>{});}}
async function stop(){if(stopping)return;stopping=true;clearInterval(timer);if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}await cleanup();process.exit(0);}
process.on('message',data=>{
  if(data?.action==='stop'){void stop();return;}
  if(data?.action!=='start'||child)return;
  run=data.run;root=data.root;
  timer=setInterval(()=>{try{process.kill(data.parentPid,0);}catch{void stop();}},1000);
  child=spawn(data.executable,['server','--data',run],{cwd:run,env:{...process.env,ELECTRON_RUN_AS_NODE:undefined,OPENLIST_ADMIN_PASSWORD:data.password},stdio:'ignore',windowsHide:true});
  child.on('error',()=>void stop());child.once('exit',()=>{if(!stopping)void cleanup().finally(()=>process.exit(1));});
});
process.on('disconnect',()=>void stop());
