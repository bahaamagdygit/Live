import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getCameras: () => ipcRenderer.invoke('get-cameras'),
  openPptx: () => ipcRenderer.invoke('open-pptx'),
  startStream: (config: any) => ipcRenderer.invoke('start-stream', config),
  stopStream: () => ipcRenderer.invoke('stop-stream'),
  startRecording: (config: any) => ipcRenderer.invoke('start-recording', config),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
  selectLogo: () => ipcRenderer.invoke('select-logo'),
  getLogoData: (filePath: string) => ipcRenderer.invoke('get-logo-data', filePath),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  onStreamStatus: (callback: (status: any) => void) => {
    const listener = (_: any, status: any) => callback(status)
    ipcRenderer.on('stream-status', listener)
    return () => ipcRenderer.removeListener('stream-status', listener)
  },
  onHotkey: (callback: (action: string) => void) => {
    const listener = (_: any, action: string) => callback(action)
    ipcRenderer.on('hotkey', listener)
    return () => ipcRenderer.removeListener('hotkey', listener)
  },
  // Presentation window
  openPresentationWindow: () => ipcRenderer.invoke('open-presentation-window'),
  closePresentationWindow: () => ipcRenderer.invoke('close-presentation-window'),
  updatePresentation: (data: any) => ipcRenderer.invoke('update-presentation', data),
  setPresentationFullscreen: (enable: boolean) => ipcRenderer.invoke('presentation-fullscreen', enable),
  onPresentationUpdate: (callback: (data: any) => void) => {
    const listener = (_: any, data: any) => callback(data)
    ipcRenderer.on('presentation-update', listener)
    return () => ipcRenderer.removeListener('presentation-update', listener)
  },
  onPresentationWindowClosed: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('presentation-window-closed', listener)
    return () => ipcRenderer.removeListener('presentation-window-closed', listener)
  },
})
