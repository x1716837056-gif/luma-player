const { app, BrowserWindow, ipcMain, dialog, protocol, shell, safeStorage, net } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');
const { scanFolder, parseRange, searchMetadata } = require('./library.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'luma-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
let window;
let library;
let settings = {};
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

function wireIpc() {
  ipcMain.handle('library:load', () => library);
  ipcMain.handle('library:save', async (_, next) => {
    if (!next || !Array.isArray(next.media) || !Array.isArray(next.sources)) throw new Error('影音库格式无效。');
    library = next;
    await writeJson('library.json', next);
  });
  ipcMain.handle('settings:load', () => settings);
  ipcMain.handle('settings:save', async (_, next) => {
    if (!next || typeof next.tmdbToken !== 'string' || typeof next.mpvPath !== 'string' || !['native', 'mpv'].includes(next.defaultPlayer)) throw new Error('设置格式无效。');
    settings = next;
    const persisted = { ...next };
    if (next.tmdbToken && safeStorage.isEncryptionAvailable()) { persisted.encryptedToken = safeStorage.encryptString(next.tmdbToken).toString('base64'); delete persisted.tmdbToken; }
    else if (next.tmdbToken) throw new Error('系统凭据加密不可用，无法安全保存 TMDB 令牌。');
    await writeJson('settings.json', persisted);
  });
  ipcMain.handle('source:select', async () => {
    const result = await dialog.showOpenDialog(window, { title: '选择影片文件夹', properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('source:scan', async (_, folder, type) => {
    const result = await scanFolder(folder, type === 'nas' ? 'nas' : 'local');
    authorizeMedia(result.media);
    return result;
  });
  ipcMain.handle('metadata:search', (_, media, query, kind) => searchMetadata(media, query, kind, settings.tmdbToken, settings.metadataLanguage, net.fetch));
  ipcMain.handle('file:reveal', (_, filename) => {
    if (typeof filename !== 'string' || !allowedFiles.has(normalize(filename))) throw new Error('文件未加入影音库。');
    shell.showItemInFolder(filename);
  });
  ipcMain.handle('player:mpv', async (_, media) => {
    if (typeof media.path !== 'string' || !allowedFiles.has(normalize(media.path))) throw new Error('请先导入本地影片。');
    const executable = settings.mpvPath;
    if (!executable || !path.isAbsolute(executable)) throw new Error('请先在播放设置中填写 mpv.exe 的完整路径。');
    try { await fsp.access(executable, fs.constants.F_OK); } catch { throw new Error('没有找到 mpv，请检查设置中的路径。'); }
    await new Promise((resolve, reject) => {
      const args = ['--force-window=yes', '--keep-open=no', '--hwdec=auto', `--title=Luma · ${media.title}`];
      if (media.progress && media.duration) args.push(`--start=${Math.round(media.progress * media.duration * 60)}`);
      args.push('--', media.path);
      const child = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: false, shell: false });
      child.once('error', () => reject(new Error('mpv 启动失败，请检查可执行文件。')));
      child.once('spawn', () => { child.unref(); resolve(); });
    });
  });
  ipcMain.on('window:action', (_, action) => {
    if (action === 'minimize') window.minimize();
    if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
    if (action === 'close') window.close();
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
  return new Response(Readable.toWeb(stream), { status: range ? 206 : 200, headers });
}

async function createWindow() {
  window = new BrowserWindow({
    width: 1440, height: 1000, minWidth: 920, minHeight: 650, frame: false,
    backgroundColor: '#151619', title: 'Luma', icon: path.join(__dirname, '../dist/luma.png'),
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
    library = await readJson('library.json', null);
    if (library) authorizeMedia(library.media);
    settings = await readJson('settings.json', {});
    if (settings.encryptedToken) { try { settings.tmdbToken = safeStorage.decryptString(Buffer.from(settings.encryptedToken, 'base64')); } catch { settings.tmdbToken = ''; } delete settings.encryptedToken; }
    protocol.handle('luma-media', serveLocalMedia);
    wireIpc();
    await createWindow();
  }).catch(error => { dialog.showErrorBox('Luma 无法启动', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
