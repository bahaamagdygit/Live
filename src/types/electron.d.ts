// Global type declarations for Electron API exposed via contextBridge

interface ElectronAPI {
  getCameras: () => Promise<{ success: boolean; cameras: import('./index').Camera[]; error?: string }>
  openPptx: () => Promise<{
    success: boolean
    canceled?: boolean
    slides?: import('./index').Slide[]
    filePath?: string
    fileType?: string
    error?: string
  }>
  openMultiplePptx: () => Promise<{
    success: boolean
    canceled?: boolean
    results?: Array<{
      success: boolean
      slides?: import('./index').Slide[]
      filePath?: string
      fileType?: string
      error?: string
    }>
  }>
  startStream: (config: any) => Promise<{ success: boolean; error?: string }>
  stopStream: () => Promise<{ success: boolean; error?: string }>
  startRecording: (config: any) => Promise<{
    success: boolean
    canceled?: boolean
    filePath?: string
    error?: string
  }>
  stopRecording: () => Promise<{ success: boolean; error?: string }>
  getSettings: () => Promise<{
    success: boolean
    settings?: import('./index').AppSettings
    error?: string
  }>
  saveSettings: (settings: any) => Promise<{ success: boolean; error?: string }>
  selectLogo: () => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>
  getLogoData: (filePath: string) => Promise<{ success: boolean; base64?: string; error?: string }>
  openExternal: (url: string) => Promise<void>
  onStreamStatus: (callback: (status: any) => void) => () => void
  onHotkey: (callback: (action: string) => void) => () => void
  // Presentation window
  getDisplays: () => Promise<{ id: number; label: string; bounds: { x: number; y: number; width: number; height: number } }[]>
  openPresentationWindow: (displayId?: number) => Promise<{ success: boolean; alreadyOpen?: boolean; error?: string }>
  closePresentationWindow: () => Promise<{ success: boolean }>
  updatePresentation: (data: any) => Promise<{ success: boolean; error?: string }>
  getPresentationData: () => Promise<any>
  setPresentationFullscreen: (enable: boolean) => Promise<{ success: boolean }>
  onPresentationUpdate: (callback: (data: any) => void) => () => void
  onPresentationWindowClosed: (callback: () => void) => () => void
  // PPTX Controller window
  openPptxController: () => Promise<{ success: boolean; alreadyOpen?: boolean }>
  closePptxController: () => Promise<{ success: boolean }>
  sendSlidesToController: (data: any) => Promise<{ success: boolean }>
  syncSlideToController: (index: number) => Promise<{ success: boolean }>
  controllerSelectSlide: (index: number) => Promise<{ success: boolean }>
  controllerToggleText: (visible: boolean) => Promise<{ success: boolean }>
  controllerOpenPptx: () => Promise<{ success: boolean }>
  onSlidesData: (callback: (data: any) => void) => () => void
  onSlideIndexChanged: (callback: (index: number) => void) => () => void
  onRemoteSelectSlide: (callback: (index: number) => void) => () => void
  onRemoteToggleText: (callback: (visible: boolean) => void) => () => void
  onRemoteOpenPptx: (callback: () => void) => () => void
  onPptxControllerClosed: (callback: () => void) => () => void
  // Video overlay IPC
  syncVideoOverlay?: (msg: any) => void
  onVideoOverlaySync?: (callback: (msg: any) => void) => () => void
  // IP Camera (RTSP → MJPEG proxy)
  ipCameraAdd?: (id: string, label: string, rtspUrl: string) => Promise<{ success: boolean; port?: number; error?: string }>
  ipCameraRemove?: (id: string) => Promise<{ success: boolean }>
  ipCameraList?: () => Promise<{ success: boolean; cameras: Array<{ id: string; label: string; rtspUrl: string; port: number; active: boolean }> }>
  ipCameraRestart?: (id: string) => Promise<{ success: boolean; error?: string }>
  onIpCamLog?: (callback: (id: string, text: string) => void) => () => void
  // Mobile camera
  mobileCamStart?: () => Promise<{ success: boolean; mjpegUrl?: string; phoneUrl?: string; wsUrl?: string; qrDataUrl?: string; error?: string }>
  mobileCamStop?: () => Promise<{ success: boolean }>
  mobileCamStatus?: () => Promise<{ running: boolean; mjpegUrl?: string; phoneUrl?: string; qrDataUrl?: string }>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
