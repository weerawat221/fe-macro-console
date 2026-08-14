// preload.js
// Context-isolated bridge between Electron main process and renderer.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('feMacro', {
  // --- focus / target window ---
  onFocusChanged: (callback) => {
    const handler = (_evt, payload) => callback(payload);
    ipcRenderer.on('focus:changed', handler);
    return () => ipcRenderer.removeListener('focus:changed', handler);
  },
  getFocusState: () => ipcRenderer.invoke('focus:getState'),
  focusTarget: (appKey) => ipcRenderer.invoke('macro:focusTarget', appKey),

  // --- running applications enumeration ---
  getRunningApps: () => ipcRenderer.invoke('app:getRunningApps'),

  // --- sending keystrokes to the targeted window ---
  send: (text, appKey) => ipcRenderer.invoke('macro:send', text, appKey),
  sendBlueConfigIp: (ipString, appKey) => ipcRenderer.invoke('macro:sendBlueConfigIp', ipString, appKey),

  // --- persisted storage ---
  storeGet: (key, fallback) => ipcRenderer.invoke('store:get', key, fallback),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),
  storeDelete: (key) => ipcRenderer.invoke('store:delete', key),
  onStoreUpdated: (callback) => {
    const handler = (_evt, payload) => callback(payload);
    ipcRenderer.on('store:updated', handler);
    return () => ipcRenderer.removeListener('store:updated', handler);
  },

  // --- settings window ---
  openSettings: () => ipcRenderer.invoke('settings:open'),

  // --- export / import settings ---
  exportConfig: (data) => ipcRenderer.invoke('file:exportConfig', data),
  importConfig: () => ipcRenderer.invoke('file:importConfig'),

  // --- environment ---
  getWindowSupport: () => ipcRenderer.invoke('app:getWindowSupport'),
});
