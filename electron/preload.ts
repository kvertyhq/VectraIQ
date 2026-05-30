import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron',
  {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    // You can add more IPC bridges here later
  }
)
