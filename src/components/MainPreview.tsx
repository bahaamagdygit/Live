import React, { useRef, useEffect, useState, memo } from 'react'
import { OverlaySettings, LogoSettings, CameraFallbackSettings } from '../types'
import { ChurchBorderOverlay } from '../presentation/PresentationApp'
import { MobileCameraView, filtersToCss } from '../hooks/useMobileCameras'
import '../presentation/presentation.css'

export type CameraSwitchTransition = 'fade' | 'zoom' | 'slide-left' | 'slide-right' | 'none'

interface CamView {
  scale: number; offsetX: number; offsetY: number
  fit: 'cover' | 'contain' | 'fill' | 'none'
  brightness: number; contrast: number; saturation: number
  flipH: boolean; flipV: boolean
  zoom?: number
}
interface MainPreviewProps {
  cameraDeviceId: string
  ipCameraMjpegUrl?: string
  ipCamView?: CamView
  webrtcStream?: MediaStream | null
  webrtcCamView?: CamView
  overlaySettings: OverlaySettings
  logoSettings: LogoSettings
  cameraFallback: CameraFallbackSettings
  manualFallback?: boolean
  switchTransition?: CameraSwitchTransition
  camView?: CamView
  // When the active camera has no hardware zoom, the preview renders the
  // video through a canvas cropped to simulate zoom instead of using CSS scale.
  hardwareZoomSupported?: boolean
  videoElMountRef?: React.RefObject<((el: HTMLVideoElement | null) => void) | undefined>
  // ── Mobile-bridge source (new LAN architecture) ──────────────────────────
  mobileMjpegUrl?: string | null
  mobileView?: MobileCameraView
  // Phone's current rotation angle, used for canvas-context rotation.
  mobileOrientationAngle?: 0 | 90 | 180 | 270
  // Whether the phone's currently-active camera is the front/selfie one —
  // drives the horizontal mirror applied AFTER rotation.
  mobileFacingFront?: boolean
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

// ── Mobile canvas feed ──────────────────────────────────────────────────────
// Draws the phone's MJPEG stream onto a canvas with a context-level rotation,
// front-camera mirror, and filter chain. Context-level transforms keep the
// rotation baked into the output pixels (captureStream-safe), per Problem 3.
//
// Problem 3 rotation table:
//   angle 0   (portrait)              → 0° rotation, frame aspect 9:16
//   angle 90  (landscape right)       → 0° rotation, frame aspect 16:9
//   angle 180 (portrait upside-down)  → 180° rotation
//   angle 270 (landscape left)        → 180° rotation
//
// Problem 4: the container aspect ratio follows the incoming frame so the
// canvas letterboxes/pillarboxes itself inside the fixed 1920×1080 stage.
// Problem 5: the aspect-ratio change animates over 300ms.
// Problem 6: rotation first, then horizontal mirror (only when front-facing).
const MobileCanvasFeed = memo(function MobileCanvasFeed({
  mjpegUrl, angle, facingFront, view,
}: {
  mjpegUrl: string
  angle: 0 | 90 | 180 | 270
  facingFront: boolean
  view?: MobileCameraView
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef    = useRef<HTMLImageElement>(new Image())
  const rafRef    = useRef<number | null>(null)

  // Attach the MJPEG to a hidden <img>. The browser continuously decodes
  // frames into that Image; we snapshot it on every rAF tick.
  useEffect(() => {
    const img = imgRef.current
    img.crossOrigin = 'anonymous'
    img.src = mjpegUrl
    return () => { img.src = '' }
  }, [mjpegUrl])

  // Draw loop. Context-level rotation + mirror keeps pixels correct for
  // captureStream (Problem 3) and lets rotation animate with a 300ms CSS
  // transition on the wrapper without ever freezing the stream (Problem 5).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Portrait-angle canvases are 9:16, landscape are 16:9 (Problem 4).
    const portraitCanvas = angle === 0 || angle === 180
    const targetW = portraitCanvas ? 1080 : 1920
    const targetH = portraitCanvas ? 1920 : 1080
    if (canvas.width !== targetW)   canvas.width  = targetW
    if (canvas.height !== targetH)  canvas.height = targetH

    const rotate = (angle === 180 || angle === 270) ? 180 : 0   // Problem 3

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      const img = imgRef.current
      const iw = img.naturalWidth, ih = img.naturalHeight
      if (!iw || !ih) return

      ctx.save()
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.translate(canvas.width / 2, canvas.height / 2)
      if (rotate)       ctx.rotate((rotate * Math.PI) / 180)  // Problem 6: rotate first
      if (facingFront)  ctx.scale(-1, 1)                      // Problem 6: then mirror
      if (view)         ctx.filter = filtersToCss(view.filters)

      // Fit the frame into the canvas preserving aspect (Problem 4). After
      // rotation the usable area is either the canvas itself (0°) or still
      // the canvas itself (180°) — both have the same w×h. 90/270 rotation
      // isn't used on the desktop per the spec.
      const canvasAR = canvas.width / canvas.height
      const imgAR    = iw / ih
      let dw = canvas.width, dh = canvas.height
      if (imgAR > canvasAR) dh = canvas.width / imgAR
      else                  dw = canvas.height * imgAR

      const zoom    = Math.max(1, view?.zoom ?? 1)
      const offsetX = ((view?.offsetX ?? 0) / 100) * (canvas.width  / 2)
      const offsetY = ((view?.offsetY ?? 0) / 100) * (canvas.height / 2)
      try {
        ctx.drawImage(img,
          -(dw * zoom) / 2 + offsetX,
          -(dh * zoom) / 2 + offsetY,
          dw * zoom, dh * zoom)
      } catch {}
      ctx.restore()
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current) }
  }, [angle, facingFront, view])

  // Fit-to-container sizing. The canvas always renders at its intrinsic
  // 16:9 / 9:16 buffer resolution; CSS `object-fit: contain` behavior is
  // achieved by letting `max-height/width` clamp it into the flex parent.
  // The 300ms `aspect-ratio` transition (Problem 5) animates the shape change
  // without ever pausing the stream.
  const displayPortrait = angle === 0 || angle === 180
  return (
    <div
      className="mobile-stage"
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#000', overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width:  displayPortrait ? 'auto'   : '100%',
          height: displayPortrait ? '100%'   : 'auto',
          maxWidth:  '100%',
          maxHeight: '100%',
          aspectRatio: displayPortrait ? '9 / 16' : '16 / 9',
          transition: 'aspect-ratio 300ms ease, width 300ms ease, height 300ms ease',
        }}
      />
    </div>
  )
})

export function MainPreview({
  cameraDeviceId,
  ipCameraMjpegUrl,
  webrtcStream,
  webrtcCamView,
  overlaySettings,
  logoSettings,
  cameraFallback,
  manualFallback = false,
  switchTransition = 'zoom',
  camView,
  ipCamView,
  hardwareZoomSupported = false,
  videoElMountRef,
  mobileMjpegUrl,
  mobileView,
  mobileOrientationAngle = 0,
  mobileFacingFront = false,
}: MainPreviewProps) {
  const cameraVideoRef = useRef<HTMLVideoElement>(null)
  const webrtcVideoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Canvas that renders zoomed frames when the camera lacks hardware zoom
  const zoomCanvasRef = useRef<HTMLCanvasElement>(null)
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

  // WebRTC stream — attach to video element when stream arrives
  useEffect(() => {
    const el = webrtcVideoRef.current
    if (!el) return
    if (webrtcStream) {
      el.srcObject = webrtcStream
      el.play().catch(() => {})
    } else {
      el.srcObject = null
    }
  }, [webrtcStream])

  // Camera stream management
  useEffect(() => {
    const deviceId = cameraDeviceId
    // If an IP camera is active, don't try to open a USB stream
    if (!deviceId) { setCameraFailed(false); return }

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
  const zoomLevel = camView?.zoom ?? 1
  // Use canvas-based software zoom when the camera has no hardware zoom and the user has dialed in > 1×
  const useSoftwareZoom = !hardwareZoomSupported && zoomLevel > 1.001

  // Drive the software-zoom canvas via requestAnimationFrame. Each frame crops
  // a centered region of the source video (size = videoSize / zoom) and draws
  // it scaled to fill the canvas, which is equivalent to a real zoom.
  useEffect(() => {
    if (!useSoftwareZoom) return
    const video = cameraVideoRef.current
    const canvas = zoomCanvasRef.current
    if (!video || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rafId = 0
    const render = () => {
      rafId = requestAnimationFrame(render)
      const vw = video.videoWidth, vh = video.videoHeight
      if (!vw || !vh || video.readyState < 2) return
      if (canvas.width !== vw) canvas.width = vw
      if (canvas.height !== vh) canvas.height = vh
      const z = Math.max(1, zoomLevel)
      const sw = vw / z, sh = vh / z
      const sx = (vw - sw) / 2, sy = (vh - sh) / 2
      try { ctx.drawImage(video, sx, sy, sw, sh, 0, 0, vw, vh) } catch {}
    }
    rafId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafId)
  }, [useSoftwareZoom, zoomLevel])

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

        {/* WebRTC phone camera feed */}
        {webrtcStream && (
          <video
            ref={webrtcVideoRef}
            className="presentation-camera presentation-camera--ipcam"
            autoPlay playsInline muted
            style={{
              objectFit: webrtcCamView?.fit ?? 'cover',
              display: !showFallback ? 'block' : 'none',
              transform: `scale(${(webrtcCamView?.scale ?? 100) / 100}) translate(${webrtcCamView?.offsetX ?? 0}%, ${webrtcCamView?.offsetY ?? 0}%) scaleX(${webrtcCamView?.flipH ? -1 : 1}) scaleY(${webrtcCamView?.flipV ? -1 : 1})`,
              transformOrigin: 'center center',
              filter: `brightness(${webrtcCamView?.brightness ?? 100}%) contrast(${webrtcCamView?.contrast ?? 100}%) saturate(${webrtcCamView?.saturation ?? 100}%)`,
            }}
          />
        )}

        {/* USB camera feed */}
        {!ipCameraMjpegUrl && !webrtcStream && !mobileMjpegUrl && (
          <>
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
                  ? undefined
                  : `scale(${camScale / 100}) translate(${offsetX}%, ${offsetY}%) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                transformOrigin: 'center center',
                filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`,
                // Hide the raw <video> whenever the canvas-based software zoom is active
                display: !showFallback && !useSoftwareZoom ? 'block' : 'none',
              }}
            />
            {/* Software-zoom canvas — drawn via rAF when hardware zoom is unavailable */}
            <canvas
              ref={zoomCanvasRef}
              className="presentation-camera"
              style={{
                objectFit: fit,
                transform: `scale(${camScale / 100}) translate(${offsetX}%, ${offsetY}%) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                transformOrigin: 'center center',
                filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`,
                display: !showFallback && useSoftwareZoom ? 'block' : 'none',
              }}
            />
          </>
        )}

        {/* Mobile phone camera feed — canvas-based so the rotation lives in
            the output pixels (captureStream-safe per Problem 3). */}
        {mobileMjpegUrl && !showFallback && (
          <MobileCanvasFeed
            mjpegUrl={mobileMjpegUrl}
            angle={mobileOrientationAngle}
            facingFront={mobileFacingFront}
            view={mobileView}
          />
        )}

        {/* IP camera MJPEG feed */}
        {ipCameraMjpegUrl && !webrtcStream && !mobileMjpegUrl && !showFallback && (
          <img
            src={ipCameraMjpegUrl}
            className={`presentation-camera presentation-camera--ipcam presentation-camera--fit-${ipCamView?.fit ?? 'cover'}`}
            alt="IP Camera"
            style={{
              transform: `scale(${(ipCamView?.scale ?? 100) / 100}) translate(${ipCamView?.offsetX ?? 0}%, ${ipCamView?.offsetY ?? 0}%) scaleX(${ipCamView?.flipH ? -1 : 1}) scaleY(${ipCamView?.flipV ? -1 : 1})`,
              transformOrigin: 'center center',
              filter: `brightness(${ipCamView?.brightness ?? 100}%) contrast(${ipCamView?.contrast ?? 100}%) saturate(${ipCamView?.saturation ?? 100}%)`,
            }}
          />
        )}

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
          borderColor={overlaySettings.borderColor ?? ''}
          bgColor={overlaySettings.bgColor}
          bgOpacity={overlaySettings.bgOpacity}
          logoBgColor={logoSettings.bgColor || '#000000'}
          logoBgOpacity={logoSettings.bgOpacity ?? 80}
        />
      </div>
    </div>
  )
}
