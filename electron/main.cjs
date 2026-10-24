const { app, BrowserWindow, ipcMain, dialog, protocol, shell, safeStorage, net } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');
const { parseRange } = require('./library.cjs');
const { searchMetadata } = require('./metadata.cjs');
const { openLibraryDatabase } = require('./database.cjs');
const { LibraryService } = require('./library-service.cjs');
const { MpvPlayer } = require('./mpv.cjs');
const { probeMedia,toolPath } = require('./probe.cjs');
const { normalizeColorMapping } = require('./color-mapping.cjs');
const {EpisodePlayback}=require('./episode-playback.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'luma-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
let window;
let service;
let database;
let closing=false;
let backgroundTimer;
let backgroundStarted=false;
let backgroundWork=Promise.resolve();
const player=new MpvPlayer();
const networkFetch=(url,options)=>net.fetch(String(url),options);
let settings = {};
let episodePlayback;
let saveQueue = Promise.resolve();
const allowedFiles = new Set();
const normalize = filename => path.resolve(filename).toLowerCase();
const jsonPath = name => path.join(app.getPath('userData'), name);

function authorizeMedia(media) {
  for (const item of media || []) {
    if (typeof item.path === 'string') allowedFiles.add(normalize(item.path));
    for (const key of ['poster', 'backdrop']) if (typeof item[key] === 'string' && item[key].startsWith('luma-media://local/')) {
      try { allowedFiles.add(normalize(decodeURIComponent(new URL(item[key]).pathname.slice(1)))); } catch { /* Invalid URLs are ignored. */ }
    }
  }
}

async function readJson(name, fallback) { try { return JSON.parse(await fsp.readFile(jsonPath(name), 'utf8')); } catch { return fallback; } }
async function writeJson(name, value) {
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    await fsp.mkdir(app.getPath('userData'), { recursive: true });
    const filename = jsonPath(name);
    await fsp.writeFile(`${filename}.tmp`, JSON.stringify(value), { mode: 0o600 });
    await fsp.rename(`${filename}.tmp`, filename);
  });
  return saveQueue;
}

function notify(channel,payload) { if(window && !window.isDestroyed())window.webContents.send(channel,payload);if(channel==='library:changed'&&episodePlayback)void episodePlayback.refresh(); }
function currentMedia(id) {
  const media=service.library?.media.find(m=>m.id===id);
  if(!media)throw new Error('影片未加入影音库。');
  return media;
}
function wireIpc() {
  ipcMain.on('app:ready',event=>{
    if(event.sender!==window?.webContents || backgroundStarted || closing)return;
    backgroundStarted=true;
    // Keep directory enumeration, NAS polling, probing and scraping off the first-frame path.
    backgroundTimer=setTimeout(()=>{
      backgroundWork=service.syncWatchers().catch(error=>console.error('Folder watching could not start:',error.message)).then(()=>{
        if(!closing)service.enqueue((service.library?.media||[]).filter(m=>m.path && !m.missing && (!m.technical || (settings.autoScrape && settings.tmdbToken && ((!m.metadataOrigin && !m.tmdbId && m.metadataStatus!=='review') || (m.tmdbId && !m.certificationCheckedAt))))));
      });
    },1000);
  });
  ipcMain.handle('library:load',()=>service.library);
  ipcMain.handle('library:save',(_,next)=>{
    if(!next || !Array.isArray(next.media) || !Array.isArray(next.sources))throw new Error('影音库格式无效。');
    for(const item of next.media) if(item.path && !allowedFiles.has(normalize(item.path)))throw new Error('请先扫描来源。');
    service.replace(next);
  });
  ipcMain.handle('library:patch',(_,id,patch)=>{
    const media=currentMedia(id);
    const safe={};
    for(const key of ['favorite','watched'])if(typeof patch[key]==='boolean')safe[key]=patch[key];
    if(Number.isFinite(patch.progress)){safe.progress=Math.min(1,Math.max(0,patch.progress));safe.lastPlayedAt=Date.now();}
    if(Number.isFinite(patch.duration)&&patch.duration>0)safe.duration=media.technical?.durationSeconds ? media.technical.durationSeconds/60 : patch.duration;
    return service.patch(id,safe);
  });
  ipcMain.handle('settings:load',()=>settings);
  ipcMain.handle('settings:save',async (_,next)=>{
    if(!next || typeof next.tmdbToken!=='string' || typeof next.mpvPath!=='string' || !['auto','native','mpv'].includes(next.defaultPlayer))throw new Error('设置格式无效。');
    next={...next,colorMapping:normalizeColorMapping(next.colorMapping)};
    next.autoplay=next.autoplay!==false;
    const previous=settings;
    const persisted={...next,theme:next.theme==='light'?'light':'dark'};
    if(next.tmdbToken && safeStorage.isEncryptionAvailable()){persisted.encryptedToken=safeStorage.encryptString(next.tmdbToken).toString('base64');delete persisted.tmdbToken;}
    else if(next.tmdbToken)throw new Error('系统凭据加密不可用，无法安全保存 TMDB 令牌。');
    await writeJson('settings.json',persisted);settings=next;
    if(settings.watchFolders!==previous.watchFolders)await service.syncWatchers();
    if(settings.autoScrape && settings.tmdbToken && (settings.tmdbToken!==previous.tmdbToken || settings.autoScrape!==previous.autoScrape || settings.metadataLanguage!==previous.metadataLanguage))service.enqueue((service.library?.media||[]).filter(m=>m.imported && ((!m.metadataOrigin && !m.tmdbId) || (m.tmdbId && !m.certificationCheckedAt))));
  });
  ipcMain.handle('source:select',async ()=>{
    const result=await dialog.showOpenDialog(window,{title:'选择影片文件夹',properties:['openDirectory']});
    return result.canceled?null:result.filePaths[0];
  });
  ipcMain.handle('source:scan',(_,folder,type)=>service.scan(folder,type==='nas'?'nas':'local'));
  ipcMain.handle('metadata:search',(_,media,query,kind)=>searchMetadata(media,query,kind,settings.tmdbToken,settings.metadataLanguage,networkFetch));
  ipcMain.handle('metadata:apply',(_,id,candidate)=>service.match(id,candidate));
  ipcMain.handle('tasks:start',()=>{if(!settings.tmdbToken)throw new Error('请先在设置中填写 TMDB API Key / 读取令牌，再开始自动匹配。');return service.enqueue((service.library?.media||[]).filter(m=>m.imported && ((!m.metadataOrigin && !m.tmdbId) || (m.tmdbId && !m.certificationCheckedAt))),true);});
  ipcMain.handle('tasks:cancel',()=>service.cancel());
  ipcMain.handle('tasks:status',()=>service.status());
  ipcMain.handle('player:state',()=>player.state);
  ipcMain.handle('player:control',(_,action,value)=>{if(action==='next')return episodePlayback.advance(false);if(action==='stop')episodePlayback.cancel();return player.control(action,value);});
  ipcMain.handle('media:probe',async (_,id)=>{
    const media=currentMedia(id);return service.patch(id,await probeMedia(media.path));
  });
  ipcMain.handle('file:reveal',(_,filename)=>{
    if(typeof filename!=='string' || !allowedFiles.has(normalize(filename)))throw new Error('文件未加入影音库。');
    shell.showItemInFolder(filename);
  });
  ipcMain.handle('player:mpv',async (_,media,restart)=>{
    const actual=currentMedia(media.id);
    if(!actual.path || !allowedFiles.has(normalize(actual.path)))throw new Error('请先导入本地影片。');
    try { await fsp.access(actual.path,fs.constants.R_OK); } catch { throw new Error('影片文件暂时无法读取，请检查硬盘或 NAS 连接。'); }
    const executable=toolPath('mpv',settings.mpvPath);
    if(!executable)throw new Error('未找到 mpv，请在播放设置中指定 mpv.exe。');
    return episodePlayback.open(executable,restart===true?{...actual,progress:0}:actual,{colorMapping:settings.colorMapping,audioOutput:process.env.LUMA_TEST_AUDIO_OUTPUT==='null'?'null':undefined});
  });
  ipcMain.on('window:action',(_,action)=>{
    if(action==='minimize')window.minimize();
    if(action==='maximize')window.isMaximized()?window.unmaximize():window.maximize();
    if(action==='close')window.close();
  });
}

async function serveLocalMedia(request) {
  let filename;
  try { const url = new URL(request.url); if (url.host !== 'local') return new Response('Not found', { status: 404 }); filename = decodeURIComponent(url.pathname.slice(1)); }
  catch { return new Response('Invalid URL', { status: 400 }); }
  if (!allowedFiles.has(normalize(filename))) return new Response('File is not in the library', { status: 403 });
  let stat;
  try { stat = await fsp.stat(filename); if (!stat.isFile()) throw new Error(); } catch { return new Response('File unavailable', { status: 404 }); }
  const range = parseRange(request.headers.get('range'), stat.size);
  if (range === false) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
  const mime = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.mov': 'video/quicktime', '.jpg': 'image/jpeg', '.png': 'image/png', '.vtt': 'text/vtt' }[path.extname(filename).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Content-Length': String(range ? range.end - range.start + 1 : stat.size), 'Access-Control-Allow-Origin': '*' };
  if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
  if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });
  const stream = fs.createReadStream(filename, range || undefined);
  const abort = () => stream.destroy();
  request.signal.addEventListener('abort', abort, {once:true});
  stream.once('close', () => request.signal.removeEventListener('abort', abort));
  return new Response(Readable.toWeb(stream), { status: range ? 206 : 200, headers });
}

async function createWindow() {
  window = new BrowserWindow({
    width: 1440, height: 1000, minWidth: 920, minHeight: 650, frame: false,
    backgroundColor: settings.theme==='light'?'#f6f6f8':'#151619', title: 'Luma', icon: path.join(__dirname, '../dist/luma.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    show: false,
  });
  window.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (url !== window.webContents.getURL()) event.preventDefault(); });
  window.once('ready-to-show', () => window.show());
  if (!app.isPackaged && process.env.LUMA_DEV_URL) await window.loadURL(process.env.LUMA_DEV_URL);
  else await window.loadFile(path.join(__dirname, '../dist/index.html'));
}

const acquiredLock = app.requestSingleInstanceLock();
if (!acquiredLock) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(async () => {

    settings = {tmdbToken:'',metadataLanguage:'zh-CN',defaultPlayer:'auto',mpvPath:'',autoplay:true,autoScrape:true,watchFolders:true,...await readJson('settings.json', {})};
    if(closing)return;
    if (settings.encryptedToken) { try { settings.tmdbToken = safeStorage.decryptString(Buffer.from(settings.encryptedToken, 'base64')); } catch { settings.tmdbToken = ''; } delete settings.encryptedToken; }
    database=openLibraryDatabase(app.getPath('userData'));
    service=new LibraryService({database,directory:app.getPath('userData'),getSettings:()=>settings,notify,authorize:media=>{allowedFiles.clear();authorizeMedia(media);},fetcher:networkFetch});
    authorizeMedia(service.library?.media);
    await service.init({watchFolders:false});
    if(closing)return;
    let lastProgress=0;
    let wasPlaying=false;
    player.on('state',state=>{notify('player:changed',state);if(wasPlaying&&!state.active&&!closing&&window&&!window.isDestroyed()){if(window.isMinimized())window.restore();window.show();window.focus();}wasPlaying=state.active;});
    player.on('progress',state=>{
      if(!state.mediaId || !(state.duration>0))return;
      if(!state.ended && !state.force && Date.now()-lastProgress<2000)return;
      lastProgress=Date.now();
      service.patch(state.mediaId,{progress:Math.min(1,state.position/state.duration),duration:state.duration/60,lastPlayedAt:Date.now(),...(state.ended?{watched:true}:{})});
    });
    episodePlayback=new EpisodePlayback({player,getMedia:()=>service.library?.media||[],getSettings:()=>({...settings,autoplay:!closing&&settings.autoplay!==false}),readable:async media=>{if(!media.path||!allowedFiles.has(normalize(media.path)))throw new Error('片源未授权。');await fsp.access(media.path,fs.constants.R_OK);},notice:message=>notify('player:changed',{...player.state,notice:message})});
    protocol.handle('luma-media', serveLocalMedia);
    wireIpc();
    await createWindow();
  }).catch(error => { if(!closing)dialog.showErrorBox('Luma 无法启动', error.message); app.quit(); });
  app.on('before-quit',event=>{
    if(closing)return;event.preventDefault();closing=true;
    clearTimeout(backgroundTimer);
    episodePlayback?.cancel();
    Promise.all([player.stop(),backgroundWork.then(()=>service?.close())]).finally(()=>{database?.close();app.quit();});
  });
  app.on('window-all-closed', () => app.quit());
}
