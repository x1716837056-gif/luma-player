const fs=require('node:fs/promises'),path=require('node:path');
class SourceVault{
  constructor(directory,crypto){this.directory=directory;this.crypto=crypto;this.data={accounts:[],smb:[]};this.queue=Promise.resolve();}
  async init(){try{const value=JSON.parse(await fs.readFile(path.join(this.directory,'connections.json'),'utf8'));this.data=JSON.parse(this.crypto.decryptString(Buffer.from(value.encrypted,'base64')));}catch(e){if(e.code!=='ENOENT'){this.locked=true;throw Error('无法解密已保存的连接，请在原 Windows 账户中打开 Luma。');}}return this;}
  save(){if(this.locked)throw Error('已有连接无法解密，已保留原凭据文件。');if(!this.crypto.isEncryptionAvailable())throw Error('系统凭据加密不可用，无法保存连接。');const encrypted=this.crypto.encryptString(JSON.stringify(this.data)).toString('base64');this.queue=this.queue.catch(()=>{}).then(async()=>{await fs.mkdir(this.directory,{recursive:true});const file=path.join(this.directory,'connections.json');await fs.writeFile(file+'.tmp',JSON.stringify({version:1,encrypted}),{mode:0o600});await fs.rename(file+'.tmp',file);});return this.queue;}
  accounts(){return this.data.accounts.map(({id,provider,label,addition})=>({id,provider,label,connected:Boolean(addition)}));}
  account(id){return this.data.accounts.find(a=>a.id===id&&a.addition);}
  async put(account){this.data.accounts=this.data.accounts.filter(a=>a.id!==account.id);this.data.accounts.push(account);await this.save();}
  async remove(id){const account=this.data.accounts.find(a=>a.id===id);if(account)delete account.addition;await this.save();}
}
module.exports={SourceVault};
