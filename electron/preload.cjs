// Electron preload — .cjs extension required because package.json has "type":"module".
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform:     process.platform,
  version:      process.env.npm_package_version ?? '',
  openExternal: (url) => ipcRenderer.send('open-external', url),
})
