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
  getPresentationData: () => ipcRenderer.invoke('get-presentation-data'),
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
  // PPTX Controller window
  openPptxController: () => ipcRenderer.invoke('open-pptx-controller'),
  closePptxController: () => ipcRenderer.invoke('close-pptx-controller'),
  sendSlidesToController: (data: any) => ipcRenderer.invoke('send-slides-to-controller', data),
  syncSlideToController: (index: number) => ipcRenderer.invoke('sync-slide-to-controller', index),
  // Controller → Main (called from controller window)
  controllerSelectSlide: (index: number) => ipcRenderer.invoke('controller-select-slide', index),
  controllerToggleText: (visible: boolean) => ipcRenderer.invoke('controller-toggle-text', visible),
  controllerOpenPptx: () => ipcRenderer.invoke('controller-open-pptx'),
  // Main → Controller listeners
  onSlidesData: (callback: (data: any) => void) => {
    const listener = (_: any, data: any) => callback(data)
    ipcRenderer.on('slides-data', listener)
    return () => ipcRenderer.removeListener('slides-data', listener)
  },
  onSlideIndexChanged: (callback: (index: number) => void) => {
    const listener = (_: any, index: number) => callback(index)
    ipcRenderer.on('slide-index-changed', listener)
    return () => ipcRenderer.removeListener('slide-index-changed', listener)
  },
  // Main listens for commands from controller
  onRemoteSelectSlide: (callback: (index: number) => void) => {
    const listener = (_: any, index: number) => callback(index)
    ipcRenderer.on('remote-select-slide', listener)
    return () => ipcRenderer.removeListener('remote-select-slide', listener)
  },
  onRemoteToggleText: (callback: (visible: boolean) => void) => {
    const listener = (_: any, visible: boolean) => callback(visible)
    ipcRenderer.on('remote-toggle-text', listener)
    return () => ipcRenderer.removeListener('remote-toggle-text', listener)
  },
  onRemoteOpenPptx: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('remote-open-pptx', listener)
    return () => ipcRenderer.removeListener('remote-open-pptx', listener)
  },
  onPptxControllerClosed: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('pptx-controller-closed', listener)
    return () => ipcRenderer.removeListener('pptx-controller-closed', listener)
  },
})
