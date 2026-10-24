const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{fork}=require('node:child_process'),assert=require('node:assert/strict');
const {OpenListCore}=require('../electron/openlist-core.cjs');
if(process.argv[2]==='worker'){
  const core=new OpenListCore({directory:process.env.LUMA_LIFECYCLE_PROFILE,vault:{account:()=>null,save:async()=>{}}});
  core.start().then(()=>{process.send({base:core.base,run:core.run});setInterval(()=>{},1000);}).catch(()=>process.exit(1));
}else{(async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'luma-core-lifecycle-'));let worker,restarted;
  try{
    worker=fork(__filename,['worker'],{env:{...process.env,LUMA_LIFECYCLE_PROFILE:directory},stdio:['ignore','ignore','ignore','ipc']});
    const ready=await Promise.race([new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('exit',()=>reject(Error('Core worker did not start')));}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Core worker timeout')),30000);timer.unref();})]);
    assert.ok((await fetch(ready.base+'/ping')).ok);worker.kill();await new Promise(r=>worker.once('exit',r));
    const end=Date.now()+10000;while(true){let listening=false;try{listening=(await fetch(ready.base+'/ping',{signal:AbortSignal.timeout(500)})).ok;}catch{}if(!listening)break;if(Date.now()>end)throw Error('Network helper survived parent exit');await new Promise(r=>setTimeout(r,100));}
    // OS shutdown / process-tree termination may preempt cleanup; reclaim private leftovers on the next launch.
    restarted=new OpenListCore({directory,vault:{account:()=>null,save:async()=>{}}});await restarted.start();await assert.rejects(fs.access(ready.run));await restarted.close();restarted=null;
    assert.deepEqual(await fs.readdir(path.join(directory,'cloud-runtime')),[]);
    console.log('PASS unexpected parent exit closes the helper; restart reclaims stale runtime and normal shutdown removes it');
  }finally{if(worker?.exitCode===null)worker.kill();await restarted?.close();await fs.rm(directory,{recursive:true,force:true});}
})().catch(e=>{console.log(e.message);process.exitCode=1;});}
