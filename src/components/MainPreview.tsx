import React, { useRef, useEffect, useState, memo } from 'react'
import { OverlaySettings, LogoSettings, CameraFallbackSettings } from '../types'
import { ChurchBorderOverlay } from '../presentation/PresentationApp'
import '../presentation/presentation.css'

export type CameraSwitchTransition = 'fade' | 'zoom' | 'slide-left' | 'slide-right' | 'none'

interface MainPreviewProps {
  cameraDeviceId: string
  overlaySettings: OverlaySettings
  logoSettings: LogoSettings
  cameraFallback: CameraFallbackSettings
  manualFallback?: boolean
  switchTransition?: CameraSwitchTransition
  camView?: {
    scale: number
    offsetX: number
    offsetY: number
    fit: 'cover' | 'contain' | 'fill' | 'none'
    brightness: number
    contrast: number
    saturation: number
    flipH: boolean
    flipV: boolean
  }
  videoElMountRef?: React.RefObject<((el: HTMLVideoElement | null) => void) | undefined>
}

const PRESENT_W = 1920
const PRESENT_H = 1080

// ── Isolated video overlay element ────────────────────────────────────────────
// memo + stable callback ref = this component NEVER re-renders after mount.
// All CSS (opacity, position, visibility) is applied by the hook via direct DOM.
const VideoOverlayVideo = memo(({ onMount }: { onMount?: (el: HTMLVideoElement | null) => void }) => (
  <video
    ref={onMount}
    className="video-overlay-layer"
    playsInline
    style={{ display: 'none' }}   // hook sets display/opacity/position directly
  />
))
VideoOverlayVideo.displayName = 'VideoOverlayVideo'

export function MainPreview({
  cameraDeviceId,
  overlaySettings,
  logoSettings,
  cameraFallback,
  manualFallback = false,
  switchTransition = 'zoom',
  camView,
  videoElMountRef,
}: MainPreviewProps) {
  const cameraVideoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [previewSize, setPreviewSize] = useState({ w: 960, h: 540 })
  const [cameraFailed, setCameraFailed] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)
  const prevDeviceIdRef = useRef(cameraDeviceId)

  // Observe container size for scaling
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setPreviewSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Camera stream management
  useEffect(() => {
    const deviceId = cameraDeviceId
    if (!deviceId) { setCameraFailed(true); return }

    // Trigger switch-out animation when camera changes (not on first mount)
    const isSwitch = prevDeviceIdRef.current !== deviceId && prevDeviceIdRef.current !== ''
    prevDeviceIdRef.current = deviceId
    if (isSwitch && switchTransition !== 'none') setIsSwitching(true)

    let stopped = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let brightnessInterval: ReturnType<typeof setInterval> | null = null

    const stopBrightnessCheck = () => {
      if (brightnessInterval) { clearInterval(brightnessInterval); brightnessInterval = null }
    }

    const stopStream = () => {
      stopBrightnessCheck()
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null
    }

    const captureFrame = (): Uint8ClampedArray | null => {
      const video = cameraVideoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return null
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      canvas.width = 32; canvas.height = 18
      try { ctx.drawImage(video, 0, 0, 32, 18); return ctx.getImageData(0, 0, 32, 18).data }
      catch { return null }
    }

    const framesAreSame = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => {
      let diff = 0
      for (let i = 0; i < a.length; i += 8) diff += Math.abs(a[i] - b[i])
      return diff < 20
    }

    const startBrightnessCheck = () => {
      stopBrightnessCheck()
      brightnessInterval = setInterval(() => {
        const frame1 = captureFrame()
        if (!frame1) return
        setTimeout(() => {
          if (!brightnessInterval) return
          const frame2 = captureFrame()
          if (!frame2) return
          setCameraFailed(framesAreSame(frame1, frame2))
        }, 600)
      }, 2000)
    }

    const startStream = async () => {
      if (stopped) return
      stopStream()
      setCameraFailed(false)
      const base: MediaTrackConstraints = deviceId.length > 5 ? { deviceId: { ideal: deviceId } } : {}
      const attempts: MediaStreamConstraints[] = [
        { video: { ...base, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
        { video: { ...base }, audio: false },
        { video: true, audio: false },
      ]
      let stream: MediaStream | null = null
      for (const c of attempts) { try { stream = await navigator.mediaDevices.getUserMedia(c); break } catch {} }
      if (stopped) { stream?.getTracks().forEach(t => t.stop()); return }
      if (!stream) {
        setCameraFailed(true)
        retryTimer = setTimeout(() => { if (!stopped) startStream() }, 4000)
        return
      }
      streamRef.current = stream
      if (cameraVideoRef.current) cameraVideoRef.current.srcObject = stream
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (!stopped) { setCameraFailed(true); retryTimer = setTimeout(() => { if (!stopped) startStream() }, 4000) }
      })
      const video = cameraVideoRef.current
      if (video) {
        const onPlaying = () => {
          video.removeEventListener('playing', onPlaying)
          startBrightnessCheck()
          // Fade back in after new stream starts playing
          setIsSwitching(false)
        }
        video.addEventListener('playing', onPlaying)
      }
    }

    startStream()
    return () => { stopped = true; if (retryTimer) clearTimeout(retryTimer); stopStream() }
  }, [cameraDeviceId])

  const lines = overlaySettings.text ? overlaySettings.text.split('\n').filter(Boolean) : []
  const camScale = camView?.scale ?? 100
  const offsetX = camView?.offsetX ?? 0
  const offsetY = camView?.offsetY ?? 0
  const flipH = camView?.flipH ?? false
  const flipV = camView?.flipV ?? false
  const brightness = camView?.brightness ?? 100
  const contrast = camView?.contrast ?? 100
  const saturation = camView?.saturation ?? 100
  const fit = camView?.fit ?? 'cover'

  const scaleFactor = Math.min(previewSize.w / PRESENT_W, previewSize.h / PRESENT_H)
  const stageLeft = (previewSize.w - PRESENT_W * scaleFactor) / 2
  const stageTop = (previewSize.h - PRESENT_H * scaleFactor) / 2
  const showFallback = cameraFailed || manualFallback

  return (
    <div className="main-preview" ref={containerRef}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div
        className="main-preview__stage"
        style={{
          width: PRESENT_W,
          height: PRESENT_H,
          transform: `scale(${scaleFactor})`,
          transformOrigin: 'top left',
          position: 'absolute',
          left: stageLeft,
          top: stageTop,
        }}
      >
        <div className="presentation-bg" />

        {showFallback && (
          cameraFallback.base64
            ? <img src={cameraFallback.base64} className={`presentation-fallback presentation-fallback--fit-${cameraFallback.fit ?? 'cover'}`} alt="" />
            : <div className="presentation-fallback presentation-fallback--default" />
        )}

        {/* Camera feed */}
        <video
          ref={cameraVideoRef}
          className={[
            'presentation-camera',
            switchTransition !== 'none' ? `presentation-camera--switch-${switchTransition}` : '',
            isSwitching ? 'presentation-camera--switching-out' : '',
          ].filter(Boolean).join(' ')}
          autoPlay playsInline muted
          style={{
            objectFit: fit,
            transform: isSwitching
              ? undefined  // CSS class handles the transition transform
              : `scale(${camScale / 100}) translate(${offsetX}%, ${offsetY}%) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
            transformOrigin: 'center center',
            filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`,
            display: !showFallback ? 'block' : 'none',
          }}
        />

        {/* Video overlay — isolated memo component, never re-renders, hook owns all CSS */}
        <VideoOverlayVideo onMount={videoElMountRef?.current ?? undefined} />

        <ChurchBorderOverlay
          line1={lines[0] || ''}
          line2={lines[1] || ''}
          visible={overlaySettings.visible}
          fontSize={overlaySettings.fontSize}
          fontFamily={overlaySettings.fontFamily}
          textColor={overlaySettings.textColor}
          alignment={overlaySettings.alignment}
          line1Bold={overlaySettings.line1Bold ?? true}
          line2Bold={overlaySettings.line2Bold ?? false}
          line2FontSize={overlaySettings.line2FontSize}
          line2FontFamily={overlaySettings.line2FontFamily}
          line2TextColor={overlaySettings.line2TextColor}
          logoBase64={logoSettings.base64 || ''}
          logoPosition={logoSettings.position}
          logoSize={logoSettings.size}
          logoOpacity={logoSettings.opacity}
          logoVisible={logoSettings.visible}
          logoAnimation={logoSettings.animation || 'none'}
          panelLayout={overlaySettings.panelLayout ?? 'full'}
          panelWidth={overlaySettings.panelWidth ?? 100}
          panelHeight={overlaySettings.panelHeight ?? 20}
        />
      </div>
    </div>
  )
}
