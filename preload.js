const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (data) => ipcRenderer.invoke('config:save', data),
  fetchLibrary: (apiKey, steamIdOrVanity) =>
    ipcRenderer.invoke('steam:fetch-library', { apiKey, steamIdOrVanity }),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url)
});
