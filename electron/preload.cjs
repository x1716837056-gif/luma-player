const { contextBridge, ipcRenderer } = require('electron');
function subscribe(channel, callback) {
  const handler = (_, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('desktop', {
  ready: () => ipcRenderer.send('app:ready'),
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  saveLibrary: library => ipcRenderer.invoke('library:save', library),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
  selectFolder: () => ipcRenderer.invoke('source:select'),
  scanFolder: (folder, type) => ipcRenderer.invoke('source:scan', folder, type),
  connectSmb: input=>ipcRenderer.invoke('source:smb',input),
  cloudAccounts: ()=>ipcRenderer.invoke('cloud:accounts'),
  cloudLogin: (provider,id)=>ipcRenderer.invoke('cloud:login',provider,id),
  cancelCloudLogin: ()=>ipcRenderer.invoke('cloud:cancel'),
  cloudList: (id,folder)=>ipcRenderer.invoke('cloud:list',id,folder),
  addCloudFolder: (id,folder)=>ipcRenderer.invoke('cloud:add',id,folder),
  cloudLogout: id=>ipcRenderer.invoke('cloud:logout',id),
  scrape: (media, query, kind) => ipcRenderer.invoke('metadata:search', media, query, kind),
  playMpv: (media,restart=false) => ipcRenderer.invoke('player:mpv', media,restart===true),
  updateMedia: (id, patch) => ipcRenderer.invoke('library:patch', id, patch),
  updatePersonal: (id,patch)=>ipcRenderer.invoke('library:personal',id,patch),
  loadBrowseArtwork: force=>ipcRenderer.invoke('library:browse-artwork',force===true),
  preferVersion: id=>ipcRenderer.invoke('library:preferred',id),
  markWatched: (id,watched,scope='item')=>ipcRenderer.invoke('library:watched',id,watched,scope),
  duplicateStatus: ()=>ipcRenderer.invoke('duplicates:status'),
  scanDuplicates: ()=>ipcRenderer.invoke('duplicates:start'),
  cancelDuplicates: ()=>ipcRenderer.invoke('duplicates:cancel'),
  onDuplicatesChanged: callback=>subscribe('duplicates:changed',callback),
  applyMetadata: (id, candidate) => ipcRenderer.invoke('metadata:apply', id, candidate),
  probeMedia: id => ipcRenderer.invoke('media:probe', id),
  startTasks: () => ipcRenderer.invoke('tasks:start'),
  cancelTasks: () => ipcRenderer.invoke('tasks:cancel'),
  taskStatus: () => ipcRenderer.invoke('tasks:status'),
  playerState: () => ipcRenderer.invoke('player:state'),
  playerControl: (action, value) => ipcRenderer.invoke('player:control', action, value),
  onLibraryChanged: callback => subscribe('library:changed', callback),
  onTasksChanged: callback => subscribe('tasks:changed', callback),
  onPlayerChanged: callback => subscribe('player:changed', callback),
  revealFile: filename => ipcRenderer.invoke('file:reveal', filename),
  windowAction: action => ipcRenderer.send('window:action', action),
});
