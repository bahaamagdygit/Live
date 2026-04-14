import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getCameras: () => ipcRenderer.invoke('get-cameras'),
  openPptx: () => ipcRenderer.invoke('open-pptx'),
  openMultiplePptx: () => ipcRenderer.invoke('open-multiple-pptx'),
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
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  openPresentationWindow: (displayId?: number) => ipcRenderer.invoke('open-presentation-window', displayId),
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
  // Video overlay — control window sends playback commands; presentation window receives them
  syncVideoOverlay: (msg: any) => ipcRenderer.send('sync-video-overlay', msg),
  onVideoOverlaySync: (callback: (msg: any) => void) => {
    const listener = (_: any, msg: any) => callback(msg)
    ipcRenderer.on('video-overlay-sync', listener)
    return () => ipcRenderer.removeListener('video-overlay-sync', listener)
  },
  // IP Camera (RTSP → MJPEG proxy)
  ipCameraAdd: (id: string, label: string, rtspUrl: string) => ipcRenderer.invoke('ip-camera-add', { id, label, rtspUrl }),
  ipCameraRemove: (id: string) => ipcRenderer.invoke('ip-camera-remove', id),
  ipCameraList: () => ipcRenderer.invoke('ip-camera-list'),
  ipCameraRestart: (id: string) => ipcRenderer.invoke('ip-camera-restart', id),
  onIpCamLog: (callback: (id: string, text: string) => void) => {
    const listener = (_: any, { id, text }: { id: string; text: string }) => callback(id, text)
    ipcRenderer.on('ipcam-log', listener)
    return () => ipcRenderer.removeListener('ipcam-log', listener)
  },
  // Mobile camera (phone WebSocket → MJPEG)
  mobileCamStart: () => ipcRenderer.invoke('mobile-cam-start'),
  mobileCamStop: () => ipcRenderer.invoke('mobile-cam-stop'),
  mobileCamStatus: () => ipcRenderer.invoke('mobile-cam-status'),
  // WebRTC signaling server
  webrtcSignalStart: () => ipcRenderer.invoke('webrtc-signal-start'),
  webrtcSignalStop: () => ipcRenderer.invoke('webrtc-signal-stop'),
  webrtcGetQr: () => ipcRenderer.invoke('webrtc-get-qr'),
  webrtcRelayToMobile: (deviceId: string, message: any) =>
    ipcRenderer.send('webrtc-relay-to-mobile', { deviceId, message }),
  webrtcBroadcastReading: (text: string, langs?: string[]) =>
    ipcRenderer.send('webrtc-broadcast-reading', { text, langs }),
  onWebRTCDeviceJoined: (cb: (data: { deviceId: string; deviceName: string }) => void) => {
    const fn = (_: any, d: any) => cb(d)
    ipcRenderer.on('webrtc-device-joined', fn)
    return () => ipcRenderer.removeListener('webrtc-device-joined', fn)
  },
  onWebRTCDeviceDisconnected: (cb: (data: { deviceId: string }) => void) => {
    const fn = (_: any, d: any) => cb(d)
    ipcRenderer.on('webrtc-device-disconnected', fn)
    return () => ipcRenderer.removeListener('webrtc-device-disconnected', fn)
  },
  onWebRTCSignal: (cb: (data: any) => void) => {
    const fn = (_: any, d: any) => cb(d)
    ipcRenderer.on('webrtc-signal', fn)
    return () => ipcRenderer.removeListener('webrtc-signal', fn)
  },
})
