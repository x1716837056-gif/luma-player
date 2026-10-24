const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
class DuplicateScanner {
  constructor({getMedia,notify,onHash=()=>{}}){Object.assign(this,{getMedia,notify,onHash});this.state={running:false,phase:'idle',total:0,checked:0,bytesRead:0,bytesTotal:0,groups:[],errors:[]};}
  emit(force=false){if(force||Date.now()-(this.lastEmit||0)>180){this.lastEmit=Date.now();this.notify({...this.state});}}
  start(){
    if(this.state.running)return this.state;
    this.controller=new AbortController();this.state={running:true,phase:'metadata',total:0,checked:0,bytesRead:0,bytesTotal:0,groups:[],errors:[]};this.emit(true);
    this.work=this.run(this.getMedia().map(m=>({...m})),this.controller.signal).catch(error=>{this.state.phase=error.name==='AbortError'?'cancelled':'failed';if(error.name!=='AbortError')this.state.errors.push({message:'重复检查未完成，请检查片源连接。'});}).finally(()=>{this.state.running=false;this.emit(true);});return this.state;
  }
  cancel(){this.controller?.abort();return this.state;}
  async sample(file,signal){
    signal.throwIfAborted();const handle=await fsp.open(file.path,'r');
    try{const length=Math.min(1024*1024,file.size),offsets=file.size<=3*length?[0]:[0,Math.floor((file.size-length)/2),file.size-length],hash=crypto.createHash('sha256');hash.update(String(file.size));
      for(const offset of offsets){signal.throwIfAborted();const buffer=Buffer.alloc(file.size<=3*length?file.size:length);const {bytesRead}=await handle.read(buffer,0,buffer.length,offset);hash.update(buffer.subarray(0,bytesRead));}return hash.digest('hex');
    }finally{await handle.close();}
  }
  async run(media,signal){
    const seen=new Set(),files=[];
    for(const m of media){if(!m.path||m.missing)continue;const key=process.platform==='win32'?path.resolve(m.path).toLowerCase():path.resolve(m.path);if(seen.has(key))continue;seen.add(key);files.push(m);}
    this.state.total=files.length;const sizes=new Map();
    for(const m of files){signal.throwIfAborted();try{const info=await fsp.stat(m.path);if(info.isFile()&&info.size>0){const file={id:m.id,title:m.title,path:m.path,size:info.size,mtime:info.mtimeMs};if(!sizes.has(info.size))sizes.set(info.size,[]);sizes.get(info.size).push(file);}}catch{this.state.errors.push({id:m.id,message:'文件暂时无法读取。'});}this.state.checked++;this.emit();}
    this.state.phase='sampling';this.emit(true);const candidates=[];
    for(const sameSize of sizes.values())if(sameSize.length>1){const samples=new Map();for(const file of sameSize){signal.throwIfAborted();try{const sample=await this.sample(file,signal);if(!samples.has(sample))samples.set(sample,[]);samples.get(sample).push(file);}catch(error){if(error.name==='AbortError')throw error;this.state.errors.push({id:file.id,message:'文件抽样读取失败。'});}}for(const group of samples.values())if(group.length>1)candidates.push(...group);}
    this.state.phase='hashing';this.state.bytesTotal=candidates.reduce((n,f)=>n+f.size,0);this.emit(true);const hashes=new Map();
    for(const file of candidates){signal.throwIfAborted();try{
      const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file.path,{highWaterMark:1024*1024,signal})){hash.update(chunk);this.state.bytesRead+=chunk.length;this.emit();}
      const after=await fsp.stat(file.path);if(after.size!==file.size||after.mtimeMs!==file.mtime){this.state.errors.push({id:file.id,message:'扫描期间文件发生变化，未计入结果。'});continue;}
      signal.throwIfAborted();const digest=hash.digest('hex');if(!hashes.has(digest))hashes.set(digest,[]);hashes.get(digest).push(file);
      await this.onHash(file,{contentHash:digest,hashSize:file.size,hashModifiedAt:file.mtime});
      this.state.groups=[...hashes].filter(([,items])=>items.length>1).map(([hash,items])=>({hash,size:items[0].size,files:items}));this.emit(true);
    }catch(error){if(error.name==='AbortError')throw error;this.state.errors.push({id:file.id,message:'完整内容校验失败。'});}}
    this.state.phase='complete';
  }
}
module.exports={DuplicateScanner};
