const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  saveLibrary: library => ipcRenderer.invoke('library:save', library),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
  selectFolder: () => ipcRenderer.invoke('source:select'),
  scanFolder: (folder, type) => ipcRenderer.invoke('source:scan', folder, type),
  scrape: (media, query, kind) => ipcRenderer.invoke('metadata:search', media, query, kind),
  playMpv: media => ipcRenderer.invoke('player:mpv', media),
  revealFile: filename => ipcRenderer.invoke('file:reveal', filename),
  windowAction: action => ipcRenderer.send('window:action', action),
});
