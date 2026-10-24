const crypto=require('node:crypto');
const broker='https://api.oplist.org';
const providers={115:{name:'115 网盘',route:'115cloud',driver:'115cloud_go',hosts:['115.com']},baidu:{name:'百度网盘',route:'baiduyun',driver:'baiduyun_go',hosts:['baidu.com']},quark:{name:'夸克网盘',hosts:['quark.cn','uc.cn']}};
function trusted(url,provider){try{const u=new URL(url);return u.protocol==='https:'&&(u.origin===broker||providers[provider]?.hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)));}catch{return false;}}
function parseCallback(url,provider){const u=new URL(url);if(u.origin!==broker||u.pathname!=='/'||!u.hash)return null;if(u.hash.length>65536)throw Error('授权返回内容过长。');let data;try{data=JSON.parse(Buffer.from(decodeURIComponent(u.hash.slice(1)),'base64').toString('utf8'));}catch{throw Error('授权结果无效，请重试。');}if(data.driver_txt!==providers[provider]?.driver)throw Error('授权网盘不匹配。');for(const key of ['refresh_token','access_token'])if(typeof data[key]!=='string'||data[key].length<8||data[key].length>16384)throw Error('网盘授权未完成，请重试。');return data;}
function addition(provider,auth){if(provider==='115')return {root_folder_id:'0',access_token:auth.access_token,refresh_token:auth.refresh_token,limit_rate:1,page_size:200};if(provider==='baidu')return {root_folder_path:'/',refresh_token:auth.refresh_token,AccessToken:auth.access_token,use_online_api:true,api_url_address:broker+'/baiduyun/renewapi',download_api:'official',custom_crack_ua:'pan.baidu.com',order_by:'name',order_direction:'asc',upload_thread:'1'};if(provider==='quark')return {root_folder_id:'0',cookie:auth.cookie,order_by:'file_name',order_direction:'asc',use_transcoding_address:false,AdditionVersion:2};throw Error('不支持的网盘。');}
class CloudAuth{
  constructor({parent,core,vault,onChange}){Object.assign(this,{parent,core,vault,onChange});}
  async login(provider,id){if(!providers[provider])throw Error('不支持的网盘。');if(this.active)throw Error('请先完成或关闭当前登录窗口。');if(!this.vault.crypto.isEncryptionAvailable())throw Error('系统凭据加密不可用，无法连接网盘。');
    const {BrowserWindow,session}=require('electron'),partition='luma-auth-'+crypto.randomUUID(),authSession=session.fromPartition(partition);authSession.setPermissionRequestHandler((_,__,done)=>done(false));
    let win,interval,timeout,connectingId,settled=false;
    const result=new Promise((resolve,reject)=>{
      const finish=async(error,auth)=>{if(settled)return;settled=true;clearInterval(interval);clearTimeout(timeout);if(win&&!win.isDestroyed())win.destroy();try{if(error)throw error;const account={id:id||crypto.randomUUID(),provider,label:providers[provider].name,addition:addition(provider,auth)};if(id&&this.vault.data.accounts.find(a=>a.id===id)?.provider!==provider)throw Error('网盘账号不匹配。');connectingId=account.id;await this.core.forget(account.id);await this.core.ensure(account);await this.core.api('/fs/list',{path:'/luma/'+account.id,password:'',page:1,per_page:1,refresh:true});await this.vault.put(account);await this.core.snapshot();this.onChange(account.id);resolve(this.vault.accounts().find(a=>a.id===account.id));}catch(e){if(connectingId)await this.core.forget(connectingId).catch(()=>{});reject(Error(e.message||'网盘登录未完成。'));}finally{this.active=null;await authSession.clearStorageData().catch(()=>{});await authSession.clearCache().catch(()=>{});}};
      this.active={cancel:()=>void finish(Error('登录已取消。'))};
      const inspect=(event,url)=>{if(provider!=='quark'){try{const data=parseCallback(url,provider);if(data){event?.preventDefault();void finish(null,data);return;}}catch{event?.preventDefault();void finish(Error('网盘授权未完成，请重试。'));return;}}if(!trusted(url,provider)&&url!=='about:blank')event?.preventDefault();};
      win=new BrowserWindow({width:600,height:780,minWidth:480,minHeight:600,title:providers[provider].name+' · 登录授权',parent:this.parent(),show:true,autoHideMenuBar:true,webPreferences:{session:authSession,sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false}});
      win.webContents.on('will-navigate',inspect);win.webContents.on('will-redirect',inspect);win.webContents.on('did-navigate-in-page',(_,url)=>inspect(null,url));
      win.webContents.setWindowOpenHandler(({url})=>{if(trusted(url,provider))void win.loadURL(url).catch(()=>{});return {action:'deny'};});win.on('closed',()=>{if(!settled)void finish(Error('登录已取消。'));});
      timeout=setTimeout(()=>void finish(Error('登录已超时，请重新打开登录。')),10*60*1000);
      if(provider==='quark'){
        interval=setInterval(async()=>{try{const cookies=await authSession.cookies.get({url:'https://pan.quark.cn'});if(cookies.some(c=>c.name==='__pus'&&c.value)&&cookies.some(c=>c.name==='__puus'&&c.value))await finish(null,{cookie:cookies.map(c=>`${c.name}=${c.value}`).join('; ')});}catch{}},1500);
        void win.loadURL('https://pan.quark.cn/').catch(()=>finish(Error('无法打开夸克登录页面，请检查网络。')));
      }else{
        const config=providers[provider],params=new URLSearchParams({server_use:'true',driver_txt:config.driver,client_uid:'',client_key:'',secret_key:''});
        void authSession.fetch(`${broker}/${config.route}/requests?${params}`).then(async r=>{if(!r.ok)throw Error();const data=await r.json();if(!trusted(data.text,provider))throw Error();if(!settled)await win.loadURL(data.text);}).catch(()=>finish(Error('无法打开网盘授权页面，请检查网络或稍后重试。')));
      }
    });return result;
  }
  cancel(){this.active?.cancel();}
}
module.exports={CloudAuth,providers,parseCallback,trusted,addition};
