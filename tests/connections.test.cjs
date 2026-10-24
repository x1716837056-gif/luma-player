const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {SourceVault}=require('../electron/source-vault.cjs'),{smbPath}=require('../electron/smb.cjs'),{parseCallback,trusted,addition}=require('../electron/cloud-auth.cjs'),{CloudLibrary,cleanPath}=require('../electron/cloud-library.cjs');
async function temp(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'luma-connections-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('SMB normalizes explicit share paths and rejects embedded credentials or traversal',()=>{
  assert.deepEqual(smbPath('smb://NAS/Movies/科幻'),{root:'\\\\NAS\\Movies',path:'\\\\NAS\\Movies\\科幻'});assert.equal(smbPath('\\\\NAS\\Movies\\').root,'\\\\NAS\\Movies');
  for(const p of ['smb://user:secret@nas/Movies','smb://nas:445/Movies','smb://nas/Movies%00oops','\\\\nas','\\\\nas\\Movies\\..\\private','C:/Movies','\\\\nas\\Movies\0x'])assert.throws(()=>smbPath(p));
});
test('OAuth callback accepts only the expected broker, provider and complete credentials',()=>{
  const auth={driver_txt:'115cloud_go',access_token:'test-access-123',refresh_token:'test-refresh-123'},url='https://api.oplist.org/#'+Buffer.from(JSON.stringify(auth)).toString('base64');
  assert.deepEqual(parseCallback(url,'115'),auth);assert.equal(parseCallback(url.replace('api.oplist.org','evil.example'),'115'),null);assert.throws(()=>parseCallback(url,'baidu'));assert.throws(()=>parseCallback('https://api.oplist.org/#bad','115'));
  assert.equal(trusted('https://passport.115.com/login','115'),true);assert.equal(trusted('https://115.com.evil.example','115'),false);assert.equal(trusted('file:///C:/Windows','115'),false);
  assert.equal(addition('baidu',auth).download_api,'official');assert.equal(addition('115',auth).root_folder_id,'0');assert.equal(addition('quark',{cookie:'fake'}).use_transcoding_address,false);
});
test('connection vault encrypts persisted credentials, exposes no secrets and preserves identity after logout',async t=>{
  const directory=await temp(t),key=crypto.randomBytes(32),cipher={isEncryptionAvailable:()=>true,encryptString:text=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([c.update(text),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body]);},decryptString:value=>{const d=crypto.createDecipheriv('aes-256-gcm',key,value.subarray(0,12));d.setAuthTag(value.subarray(12,28));return Buffer.concat([d.update(value.subarray(28)),d.final()]).toString();}};
  const vault=await new SourceVault(directory,cipher).init();await vault.put({id:'account',provider:'115',label:'115',addition:{refresh_token:'private-test-secret'}});assert.equal((await fs.readFile(path.join(directory,'connections.json'),'utf8')).includes('private-test-secret'),false);assert.equal(JSON.stringify(vault.accounts()).includes('refresh_token'),false);
  const reopened=await new SourceVault(directory,cipher).init();assert.equal(reopened.account('account').addition.refresh_token,'private-test-secret');await reopened.remove('account');assert.equal(reopened.account('account'),undefined);assert.equal(reopened.accounts()[0].id,'account');assert.equal(reopened.accounts()[0].connected,false);
});
test('an undecryptable vault is preserved instead of being overwritten by a new connection',async t=>{
  const directory=await temp(t),file=path.join(directory,'connections.json'),original=JSON.stringify({version:1,encrypted:'locked-data'});await fs.writeFile(file,original);
  const vault=new SourceVault(directory,{isEncryptionAvailable:()=>true,decryptString:()=>{throw Error('wrong Windows user');},encryptString:()=>Buffer.from('replacement')});await assert.rejects(vault.init(),/无法解密/);await assert.rejects(vault.put({id:'new',provider:'115',label:'115',addition:{}}),/保留原凭据/);assert.equal(await fs.readFile(file,'utf8'),original);
});
test('cloud scan paginates, aggregates nested media with stable IDs and preserves case and special characters',async()=>{
  const account={id:'a',provider:'115',label:'115'},vault={account:id=>id==='a'?account:null};let calls=0;
  const core={ensure:async()=>({mount:'/luma/a'}),snapshot:async()=>{},api:async(_,body)=>{calls++;return body.path.endsWith('/Folder #1')?{total:1,content:[{name:'Show.S01E02.2024.mkv',is_dir:false,size:20}]}:body.page===1?{total:3,content:[{name:'Folder #1',is_dir:true},{name:'Film.2024.mp4',size:10}]}:{total:3,content:[{name:'film.2024.mp4',size:11}]};}};
  const cloud=new CloudLibrary({core,vault,getLibrary:()=>null}),first=await cloud.scan('cloud://a/'),second=await cloud.scan('cloud://a/');assert.equal(first.media.length,3);assert.equal(first.media.filter(m=>m.kind==='tv').length,1);assert.equal(new Set(first.media.map(m=>m.id)).size,3);assert.deepEqual(first.media.map(m=>m.id),second.media.map(m=>m.id));assert.ok(first.media.every(m=>!m.videoUrl&&!m.path.includes('token')));assert.ok(calls>=6);
  assert.throws(()=>cleanPath('/../private'));assert.throws(()=>cleanPath('/folder\\private'));await assert.rejects(cloud.account('missing'),/退出登录/);
});
test('loopback gateway forwards byte ranges and required headers, refreshes expired links and denies unknown access',async t=>{
  const bytes=Buffer.from('0123456789abcdefghij');let requests=0,links=0;
  const upstream=http.createServer((req,res)=>{requests++;assert.equal(req.headers['user-agent'],'pan.baidu.com');if(req.url==='/expired'){res.writeHead(403);res.end();return;}assert.equal(req.headers.cookie,'required=provider');const range=req.headers.range?.match(/^bytes=(\d+)-(\d+)$/);if(range){const start=+range[1],end=+range[2];res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':end-start+1,'Accept-Ranges':'bytes'});res.end(bytes.subarray(start,end+1));}else{res.writeHead(200,{'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);}});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>upstream.close(r)));
  let connected=true;const media={id:'movie',remote:{accountId:'a',path:'/Movie.mp4'}},core={ensure:async()=>({mount:'/luma/a'}),snapshot:async()=>{},api:async()=>({raw_url:`http://127.0.0.1:${upstream.address().port}/${++links===1?'expired':'fresh'}`,header:{'User-Agent':'pan.baidu.com',Cookie:'required=provider'}})},cloud=new CloudLibrary({core,vault:{account:()=>connected?({id:'a'}):undefined},getLibrary:()=>({media:[media]})});t.after(()=>cloud.close());
  const url=await cloud.input(media),response=await fetch(url,{headers:{Range:'bytes=3-7'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 3-7/20');assert.equal(await response.text(),'34567');assert.equal(links,2);assert.equal(requests,2);assert.equal((await fetch(url,{method:'HEAD'})).headers.get('content-length'),'20');assert.equal((await fetch(cloud.base+'/wrong/movie')).status,403);assert.equal((await fetch(url,{method:'POST'})).status,405);assert.equal(JSON.stringify(media).includes(cloud.capability),false);connected=false;cloud.disconnect('a');assert.equal((await fetch(url)).status,502);assert.equal(requests,3);
});

test('large cloud folders browse one page and refresh upstream only once per complete scan',async()=>{
  const content=Array.from({length:5001},(_,i)=>({name:`Film.${String(i).padStart(5,'0')}.2024.mkv`,size:i+1}));
  let calls=0,upstreamReads=0,cached=false;const refreshes=[],progress=[];
  const core={ensure:async()=>({mount:'/luma/a'}),api:async(_,body)=>{calls++;refreshes.push(body.refresh);if(body.refresh||!cached){upstreamReads++;cached=true;}return {total:content.length,content:content.slice((body.page-1)*body.per_page,body.page*body.per_page)};}};
  const cloud=new CloudLibrary({core,vault:{account:()=>({id:'a',label:'115'})},getLibrary:()=>null,onProgress:p=>progress.push(p)});
  const first=await cloud.browse('a','/');assert.equal(calls,1);assert.equal(first.entries.length,200);assert.equal(first.total,5001);assert.equal(first.nextPage,2);
  calls=0;upstreamReads=0;refreshes.length=0;
  const scanned=await cloud.scan('cloud://a/');assert.equal(scanned.media.length,5001);assert.equal(calls,26);assert.equal(upstreamReads,1);assert.equal(refreshes.filter(Boolean).length,1);assert.equal(refreshes[0],true);assert.equal(progress.at(-1).phase,'complete');assert.equal(progress.at(-1).files,5001);assert.ok(progress.some(p=>p.files===200));
});

test('500 Blu-ray movie trees skip 1500 technical folders and aggregate clips by disc, even without a year',async()=>{
  let calls=0,batches=0,firstBatchCalls=0;const core={ensure:async()=>({mount:'/luma/a'}),api:async(_,body)=>{
    calls++;const p=body.path.slice('/luma/a'.length);assert.doesNotMatch(p,/\/(?:CERTIFICATE|CLIPINF|BACKUP)(?:\/|$)/);
    const content=p===''?Array.from({length:500},(_,i)=>({name:`DiscMovie${i}`,is_dir:true})):p.endsWith('/STREAM')?[{name:'00000.m2ts',size:100},{name:'00001.m2ts',size:9000},{name:'00002.m2ts',size:8000}]:p.endsWith('/BDMV')?['STREAM','CLIPINF','BACKUP'].map(name=>({name,is_dir:true})):['BDMV','CERTIFICATE'].map(name=>({name,is_dir:true}));
    return {total:content.length,content:content.slice((body.page-1)*200,body.page*200)};
  }};
  const cloud=new CloudLibrary({core,vault:{account:()=>({id:'a',label:'115'})},getLibrary:()=>null});const result=await cloud.scan('cloud://a/',{onBatch:async batch=>{if(!batches)firstBatchCalls=calls;batches+=batch.media.length;}});
  const {groupMovies}=require('../shared/movies.mjs'),groups=groupMovies(result.media);assert.equal(calls,1503);assert.equal(result.media.length,1500);assert.equal(groups.length,500);assert.ok(batches>0);assert.ok(firstBatchCalls<=6);assert.ok(groups.every(g=>g.media.length===3&&g.representative.fileSize===9000));assert.ok(result.media.every(m=>m.editionLabel.startsWith('蓝光片段')&&m.remote.discRoot));
});

test('canceling a cloud scan aborts the pending page and cleans up operations',async()=>{
  let waiting,entered;const ready=new Promise(r=>entered=r),progress=[];
  const core={ensure:async()=>({mount:'/luma/a'}),api:async(_,body,{signal})=>{if(body.page===1)return {total:400,content:Array.from({length:200},(_,i)=>({name:`Film.${i}.2024.mkv`}))};entered();return new Promise((resolve,reject)=>{waiting=signal;signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});}};
  const cloud=new CloudLibrary({core,vault:{account:()=>({id:'a',label:'115'})},getLibrary:()=>null,onProgress:p=>progress.push(p)});
  const scan=cloud.scan('cloud://a/');await ready;const rejected=assert.rejects(scan,{name:'AbortError'});cloud.cancel('a','/');await rejected;assert.equal(waiting.aborted,true);assert.equal(progress.at(-1).phase,'cancelled');assert.equal(progress.at(-1).files,200);assert.equal(cloud.scans.size,0);assert.equal(cloud.operations.size,0);
  await assert.rejects(cloud.page('a','/',0),/页码/);
});

test('existing 115 authorizations use larger upstream pages without increasing the saved request rate',async()=>{
  const {OpenListCore}=require('../electron/openlist-core.cjs');const core=new OpenListCore({directory:'unused',vault:{},executable:'unused'});core.start=async()=>{};let created;
  core.request=async(route,body)=>{if(route==='/admin/storage/create'){created=body;return;}return {content:[{id:1,mount_path:'/luma/a'}]};};
  const account={id:'a',provider:'115',addition:{access_token:'test-only',page_size:200,limit_rate:1}};await core.ensure(account);assert.equal(JSON.parse(created.addition).page_size,1150);assert.equal(JSON.parse(created.addition).limit_rate,1);assert.equal(account.addition.page_size,200);
});

test('core listing deadlines and caller cancellation remain distinguishable from component failure',async()=>{
  const {OpenListCore}=require('../electron/openlist-core.cjs');const core=new OpenListCore({directory:'unused',vault:{},fetcher:async(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))});core.base='http://127.0.0.1';
  // Keep the test alive while AbortSignal.timeout uses an unref'ed timer.
  const timer=setTimeout(()=>{},1000);try{await assert.rejects(core.request('/fs/list',{},true,{timeout:10}),/目录读取超时/);const controller=new AbortController(),pending=core.request('/fs/list',{},true,{signal:controller.signal});const rejected=assert.rejects(pending,{name:'AbortError'});controller.abort();await rejected;}finally{clearTimeout(timer);}
});
