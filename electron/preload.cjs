const { contextBridge, ipcRenderer } = require('electron');
function subscribe(channel, callback) {
  const handler = (_, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('desktop', {
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  saveLibrary: library => ipcRenderer.invoke('library:save', library),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
  selectFolder: () => ipcRenderer.invoke('source:select'),
  scanFolder: (folder, type) => ipcRenderer.invoke('source:scan', folder, type),
  scrape: (media, query, kind) => ipcRenderer.invoke('metadata:search', media, query, kind),
  playMpv: media => ipcRenderer.invoke('player:mpv', media),
  updateMedia: (id, patch) => ipcRenderer.invoke('library:patch', id, patch),
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
