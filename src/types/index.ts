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
  }
}

export type StreamStatus = 'offline' | 'connecting' | 'live' | 'error'
export type RecordingStatus = 'idle' | 'recording'
