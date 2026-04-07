export interface Camera {
  id: string
  label: string
  deviceId: string
}

export interface Slide {
  index: number
  text: string[]
  slideNumber?: number
  section?: string
}

export interface StreamConfig {
  rtmpUrl: string
  streamKey: string
  resolution: '720p' | '1080p'
  fps: 30 | 60
  bitrate: number
}

export interface OverlaySettings {
  text: string
  visible: boolean
  position: 'bottom' | 'center' | 'top'
  fontSize: number
  fontFamily: string
  textColor: string
  bgColor: string
  bgOpacity: number
  alignment: 'right' | 'center' | 'left'
  line1Bold: boolean
  line2Bold: boolean
  panelLayout: 'full' | 'left' | 'right'
  panelWidth: number   // 20–100 % of screen width
  panelHeight: number  // 5–50 % of screen height (full layout only)
  line2FontSize: number
  line2FontFamily: string
  line2TextColor: string
}

export interface LogoSettings {
  filePath: string
  base64?: string
  position: 'top-right' | 'top-left' | 'top-center' | 'bottom-right' | 'bottom-left'
  size: number
  opacity: number
  visible: boolean
  animation: 'none' | 'rotate-right' | 'rotate-left' | 'flip-y' | 'flip-x' | 'pulse' | 'bounce'
}

export interface CameraFallbackSettings {
  filePath: string
  base64?: string
  fit: 'cover' | 'contain' | 'fill'
}

export interface AppSettings {
  streamConfig: StreamConfig
  overlaySettings: OverlaySettings
  logoSettings: LogoSettings
  cameraFallback: CameraFallbackSettings
  hotkeys: {
    toggleText: string
    nextSlide: string
    prevSlide: string
    cam1: string
    cam2: string
    cam3: string
    cam4: string
    startStream: string
    stopStream: string
    startRecording: string
    stopRecording: string
    openPresentation: string
    closePresentation: string
    openController: string
    toggleFallback: string
    openFile: string
  }
}

export type StreamStatus = 'offline' | 'connecting' | 'live' | 'error'
export type RecordingStatus = 'idle' | 'recording'

// ── Video Overlay ──────────────────────────────────────────────────────────────

export interface VideoOverlayItem {
  id: string
  name: string
  filePath: string
  objectURL: string     // blob: URL — streamed directly from disk, no memory copy
  mimeType: 'video/mp4' | 'video/webm'
}

export interface VideoOverlaySettings {
  activeId: string | null
  visible: boolean
  opacity: number         // 0–1
  volume: number          // 0–1
  muted: boolean
  loop: boolean
  positionX: number       // px from left within 1920 stage
  positionY: number       // px from top within 1080 stage
  width: number           // px within 1920 stage (0 = natural)
  height: number          // px within 1080 stage (0 = natural)
  maintainAspect: boolean
}
