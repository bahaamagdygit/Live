import React, { useState, useEffect, useRef } from 'react'

interface PresentationData {
  text: string
  langs?: string[]
  visible: boolean
  position: 'bottom' | 'center' | 'top'
  fontSize: number
  fontFamily: string
  textColor: string
  bgColor: string
  bgOpacity: number
  alignment: 'right' | 'center' | 'left'
  line1Bold?: boolean
  line2Bold?: boolean
  slideNumber?: number
  totalSlides?: number
  cameraDeviceId?: string
  cameraScale?: number
  cameraX?: number
  cameraY?: number
  cameraFit?: 'cover' | 'contain' | 'fill' | 'none'
  cameraBrightness?: number
  cameraContrast?: number
  cameraSaturation?: number
  cameraFlipH?: boolean
  cameraFlipV?: boolean
  fallbackBase64?: string
  fallbackFit?: 'cover' | 'contain' | 'fill'
  manualFallback?: boolean
  logoBase64?: string
  logoPosition?: 'top-right' | 'top-left' | 'top-center' | 'bottom-right' | 'bottom-left'
  logoSize?: number
  logoOpacity?: number
  logoVisible?: boolean
  logoAnimation?: 'none' | 'rotate-right' | 'rotate-left' | 'flip-y' | 'flip-x' | 'pulse' | 'bounce'
  panelLayout?: 'full' | 'left' | 'right'
  panelWidth?: number
  panelHeight?: number
  line2FontSize?: number
  line2FontFamily?: string
  line2TextColor?: string
}

// Self-contained video overlay for the presentation window.
// Receives playback commands via IPC.
// Uses file:// paths so it works in the separate renderer process.
function VideoOverlayElement() {
  const vRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = vRef.current
    if (!el) return
    if (!window.electronAPI?.onVideoOverlaySync) return

    const cleanup = window.electronAPI.onVideoOverlaySync((msg: any) => {
      switch (msg.action) {
        case 'load':
          el.pause()
          if (el.src !== msg.src) {
            el.src     = msg.src
            el.preload = 'auto'
            el.muted   = false
            el.load()
          }
          el.currentTime = 0
          el.style.display = 'none'
          break
        case 'play':
          el.style.display = 'block'
          el.play().catch(() => {})
          break
        case 'pause':
          el.pause()
          break
        case 'stop':
          el.pause()
          el.currentTime = 0
          el.style.display = 'none'
          break
        case 'seek':
          if (Math.abs(el.currentTime - (msg.currentTime ?? 0)) > 0.5)
            el.currentTime = msg.currentTime
          break
        case 'sync-time':
          if (Math.abs(el.currentTime - (msg.currentTime ?? 0)) > 0.5)
            el.currentTime = msg.currentTime
          break
        case 'audio':
          if (msg.volume !== undefined) el.volume = msg.volume
          if (msg.muted  !== undefined) el.muted  = msg.muted
          if (msg.loop   !== undefined) el.loop   = msg.loop
          break
        case 'settings': {
          const px = msg.positionX ?? 0
          const py = msg.positionY ?? 0
          const pw = msg.width     ?? 1920
          const ph = msg.height    ?? 1080
          el.style.left   = `${960 + px - pw / 2}px`
          el.style.top    = `${540 + py - ph / 2}px`
          el.style.width  = `${pw}px`
          el.style.height = msg.maintainAspect !== false ? 'auto' : `${ph}px`
          if (msg.opacity !== undefined) el.style.opacity = String(msg.opacity)
          // Only hide on visible:false — play() is what shows it
          if (msg.visible === false) el.style.display = 'none'
          break
        }
      }
    })

    return cleanup
  }, [])

  return (
    <video
      ref={vRef}
      className="video-overlay-layer"
      playsInline
      style={{ display: 'none' }}
    />
  )
}

const DEFAULT_DATA: PresentationData = {
  text: '',
  visible: false,
  position: 'bottom',
  fontSize: 48,
  fontFamily: 'Arial',
  textColor: '#ffffff',
  bgColor: '#000000',
  bgOpacity: 70,
  alignment: 'center',
}

const STAGE_W = 1920
const STAGE_H = 1080

export default function PresentationApp() {
  const [data, setData] = useState<PresentationData>(DEFAULT_DATA)
  const targetRef = useRef(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraFailed, setCameraFailed] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [screenSize, setScreenSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  useEffect(() => {
    const onResize = () => setScreenSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onCameraError = (reason: string) => {
    setCameraFailed(true)
  }

  const onCameraOk = () => {
    setCameraFailed(false)
  }

  // Case 1 — open stream; Case 2 — black frame detection via canvas
  useEffect(() => {
    const deviceId = data.cameraDeviceId
    if (!deviceId) {
      onCameraError('No device found')
      return
    }

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
      if (videoRef.current) videoRef.current.srcObject = null
    }

    // Case 2 — frozen/placeholder frame detection by comparing two frames 600ms apart
    const captureFrame = (): Uint8ClampedArray | null => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return null
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      canvas.width = 32
      canvas.height = 18
      try {
        ctx.drawImage(video, 0, 0, 32, 18)
        return ctx.getImageData(0, 0, 32, 18).data
      } catch { return null }
    }

    const framesAreSame = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => {
      let diff = 0
      // Sample every 8th pixel channel for speed
      for (let i = 0; i < a.length; i += 8) {
        diff += Math.abs(a[i] - b[i])
      }
      // If total diff < 20 across all sampled pixels → frozen
      return diff < 20
    }

    const startBrightnessCheck = () => {
      stopBrightnessCheck()
      brightnessInterval = setInterval(() => {
        const frame1 = captureFrame()
        if (!frame1) return
        // Take second frame 600ms later and compare
        setTimeout(() => {
          if (!brightnessInterval) return // was cleared
          const frame2 = captureFrame()
          if (!frame2) return
          if (framesAreSame(frame1, frame2)) {
            onCameraError('Black frame detected — showing fallback')
          } else {
            onCameraOk()
          }
        }, 600)
      }, 2000)
    }

    const startStream = async () => {
      if (stopped) return
      stopStream()
      onCameraOk()

      const base: MediaTrackConstraints = deviceId.length > 5
        ? { deviceId: { ideal: deviceId } } : {}

      const attempts: MediaStreamConstraints[] = [
        { video: { ...base, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
        { video: { ...base }, audio: false },
        { video: true, audio: false },
      ]

      let stream: MediaStream | null = null
      let lastError = ''

      for (const constraints of attempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints)
          break
        } catch (err: any) {
          lastError = err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError'
            ? 'No device found'
            : err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
              ? 'Permission denied'
              : err?.message || 'Camera error'
        }
      }

      if (stopped) { stream?.getTracks().forEach(t => t.stop()); return }

      // Case 1 — all attempts failed
      if (!stream) {
        onCameraError(lastError)
        retryTimer = setTimeout(() => { if (!stopped) startStream() }, 4000)
        return
      }

      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream

      // Handle track ending (device disconnected)
      const track = stream.getVideoTracks()[0]
      if (track) {
        track.addEventListener('ended', () => {
          if (!stopped) {
            onCameraError('No device found')
            retryTimer = setTimeout(() => { if (!stopped) startStream() }, 4000)
          }
        })
      }

      // Start Case 2 brightness check after video begins playing
      const video = videoRef.current
      if (video) {
        const onPlaying = () => {
          video.removeEventListener('playing', onPlaying)
          startBrightnessCheck()
        }
        video.addEventListener('playing', onPlaying)
      }
    }

    startStream()

    return () => {
      stopped = true
      if (retryTimer) clearTimeout(retryTimer)
      stopStream()
    }
  }, [data.cameraDeviceId])

  // Listen for updates from main process
  useEffect(() => {
    if (!window.electronAPI?.onPresentationUpdate) return

    // Pull any data that was sent before this listener was ready
    window.electronAPI.getPresentationData?.().then((cached: PresentationData | null) => {
      if (cached) {
        setData(cached)
        targetRef.current = cached.visible ? 1 : 0
      }
    })

    const cleanup = window.electronAPI.onPresentationUpdate((incoming: PresentationData) => {
      setData(incoming)
      targetRef.current = incoming.visible ? 1 : 0
    })
    return cleanup
  }, [])


  const lines = data.text ? data.text.split('\n').filter(Boolean) : []

  const positionStyle: React.CSSProperties =
    data.position === 'bottom'
      ? { bottom: '8%', left: 0, right: 0 }
      : data.position === 'top'
        ? { top: '8%', left: 0, right: 0 }
        : { top: '50%', left: 0, right: 0, transform: 'translateY(-50%)' }

  const bgRgb = hexToRgb(data.bgColor)
  const bgStyle = bgRgb
    ? `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${data.bgOpacity / 100})`
    : `rgba(0,0,0,0.7)`

  const scaleFactor = Math.min(screenSize.w / STAGE_W, screenSize.h / STAGE_H)
  const stageLeft = (screenSize.w - STAGE_W * scaleFactor) / 2
  const stageTop = (screenSize.h - STAGE_H * scaleFactor) / 2

  return (
    <div className="presentation-root">
      {/* Hidden canvas used for brightness frame analysis */}
      <canvas ref={canvasRef} className="presentation-canvas-hidden" />

      {/* Fixed 1920×1080 stage scaled to fit any screen — same as MainPreview */}
      <div style={{
        position: 'absolute',
        width: STAGE_W,
        height: STAGE_H,
        transform: `scale(${scaleFactor})`,
        transformOrigin: 'top left',
        left: stageLeft,
        top: stageTop,
      }}>
        {/* Black background always */}
        <div className="presentation-bg" />

        {/* Fallback — shown when camera fails OR manually triggered */}
        {(cameraFailed || data.manualFallback) && (
          data.fallbackBase64
            ? <img
              src={data.fallbackBase64}
              className={`presentation-fallback presentation-fallback--fit-${data.fallbackFit ?? 'cover'}`}
              alt=""
            />
            : <div className="presentation-fallback presentation-fallback--default" />
        )}

        {/* Camera feed — hidden when manual fallback is active or camera failed */}
        <video
          ref={videoRef}
          className="presentation-camera"
          autoPlay
          playsInline
          muted
          style={{
            objectFit: data.cameraFit ?? 'cover',
            transform: `scale(${(data.cameraScale ?? 100) / 100}) translate(${data.cameraX ?? 0}%, ${data.cameraY ?? 0}%) scaleX(${data.cameraFlipH ? -1 : 1}) scaleY(${data.cameraFlipV ? -1 : 1})`,
            transformOrigin: 'center center',
            filter: `brightness(${data.cameraBrightness ?? 100}%) contrast(${data.cameraContrast ?? 100}%) saturate(${data.cameraSaturation ?? 100}%)`,
            display: (!cameraFailed && !data.manualFallback) ? 'block' : 'none',
          }}
        />

        {/* Video overlay — IPC-driven, always mounted */}
        <VideoOverlayElement />

        {/* Church gold border overlay — text shown inside reading panel */}
        <ChurchBorderOverlay
          line1={lines[0] || ''}
          line2={lines[1] || ''}
          visible={data.visible}
          fontSize={data.fontSize}
          fontFamily={data.fontFamily}
          textColor={data.textColor}
          alignment={data.alignment}
          line1Bold={data.line1Bold ?? true}
          line2Bold={data.line2Bold ?? false}
          line2FontSize={data.line2FontSize}
          line2FontFamily={data.line2FontFamily}
          line2TextColor={data.line2TextColor}
          logoBase64={data.logoBase64 || ''}
          logoPosition={data.logoPosition || 'top-right'}
          logoSize={data.logoSize ?? 180}
          logoOpacity={data.logoOpacity ?? 80}
          logoVisible={data.logoVisible ?? true}
          logoAnimation={data.logoAnimation || 'none'}
          panelLayout={data.panelLayout || 'full'}
          panelWidth={data.panelWidth ?? 100}
          panelHeight={data.panelHeight ?? 20}
          langs={data.langs}
        />

        {/* Slide counter (bottom right) */}
        {data.slideNumber !== undefined && data.totalSlides !== undefined && (
          <div className="presentation-counter">
            {data.slideNumber} / {data.totalSlides}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Auto-shrink — applies font size directly to DOM, zero React re-renders ────
function useAutoShrinkFont(
  line1: string,
  line2: string,
  baseFontSize: number,
  fontFamily: string,
  line1Bold: boolean,
  panelBodyRef: React.RefObject<HTMLDivElement>,
  line1Ref: React.RefObject<HTMLDivElement>,
  line2Ref: React.RefObject<HTMLDivElement>,
) {
  const MIN = 14

  useEffect(() => {
    const apply = () => {
      const body = panelBodyRef.current
      const el1 = line1Ref.current
      if (!body || !el1) return

      // Measure the actual panel (.church-reading-panel) — parent of body
      const panel = body.parentElement
      if (!panel) return

      const panelW = panel.clientWidth
      const panelH = panel.clientHeight
      if (!panelW || !panelH) return

      const applySize = (size: number) => {
        el1.style.fontSize = `${size}px`
        if (line2Ref.current) {
          line2Ref.current.style.fontSize = `${Math.max(13, Math.round(size * 0.6))}px`
        }
      }

      const isOverflow = (): boolean => {
        // Force reflow
        void panel.offsetHeight
        const el2 = line2Ref.current
        const totalH = el1.scrollHeight + (el2 ? el2.scrollHeight : 0)
        return el1.scrollWidth > panelW || totalH > panelH
      }

      // Start at baseFontSize and shrink until it fits
      let size = baseFontSize
      applySize(size)
      while (isOverflow() && size > MIN) {
        size--
        applySize(size)
      }
    }

    const raf = requestAnimationFrame(apply)

    // Re-run when panel resizes (layout/width/height changes)
    const ro = new ResizeObserver(() => requestAnimationFrame(apply))
    if (panelBodyRef.current?.parentElement) ro.observe(panelBodyRef.current.parentElement)

    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [line1, line2, baseFontSize, fontFamily, line1Bold])
}

export function ChurchBorderOverlay({ line1, line2, visible, fontSize, fontFamily, textColor, alignment,
  line1Bold, line2Bold,
  line2FontSize, line2FontFamily, line2TextColor,
  logoBase64, logoPosition, logoSize, logoOpacity, logoVisible, logoAnimation,
  panelLayout = 'full', panelWidth = 100, panelHeight = 20,
  langs = [] }: {
    line1: string; line2: string; visible: boolean;
    fontSize: number; fontFamily: string; textColor: string; alignment: string;
    line1Bold: boolean; line2Bold: boolean;
    line2FontSize?: number; line2FontFamily?: string; line2TextColor?: string;
    logoBase64: string; logoPosition: string; logoSize: number; logoOpacity: number;
    logoVisible: boolean; logoAnimation: string;
    panelLayout?: 'full' | 'left' | 'right';
    panelWidth?: number;
    panelHeight?: number;
    langs?: string[];
  }) {
  const particlesRef = useRef<HTMLDivElement>(null)
  const panelBodyRef = useRef<HTMLDivElement>(null)
  const line1Ref = useRef<HTMLDivElement>(null)
  const line2Ref = useRef<HTMLDivElement>(null)

  useAutoShrinkFont(
    line1, line2, fontSize, fontFamily, line1Bold,
    panelBodyRef, line1Ref, line2Ref
  )

  useEffect(() => {
    const container = particlesRef.current
    if (!container) return
    const positions = [
      ...Array.from({ length: 14 }, (_, i) => ({ x: 140 + i * 120, y: 20 })),
      ...Array.from({ length: 14 }, (_, i) => ({ x: 140 + i * 120, y: 1060 })),
      ...Array.from({ length: 7 }, (_, i) => ({ x: 22, y: 160 + i * 110 })),
      ...Array.from({ length: 7 }, (_, i) => ({ x: 1898, y: 160 + i * 110 })),
    ]
    positions.forEach(p => {
      const el = document.createElement('div')
      el.className = 'church-particle'
      const size = 2 + Math.random() * 3
      const delay = Math.random() * 8
      const dur = 5 + Math.random() * 6
      const drift = (Math.random() - 0.5) * 30
      el.style.cssText = `left:${p.x + drift}px;top:${p.y}px;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${delay}s;box-shadow:0 0 ${size * 2}px #f5e27a88;`
      container.appendChild(el)
    })
  }, [])

  return (
    <div className="church-overlay">
      <div className="church-vignette" />
      <div className="church-sweep" />
      <div className="church-sweep church-sweep-rev" />
      <div className="church-particles" ref={particlesRef} />
      <svg className="church-svg" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cGH" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2a1800" stopOpacity="0" />
            <stop offset="4%" stopColor="#6b4a10" />
            <stop offset="15%" stopColor="#c9a84c" />
            <stop offset="30%" stopColor="#f5e27a" />
            <stop offset="50%" stopColor="#fff8dc" />
            <stop offset="70%" stopColor="#f5e27a" />
            <stop offset="85%" stopColor="#c9a84c" />
            <stop offset="96%" stopColor="#6b4a10" />
            <stop offset="100%" stopColor="#2a1800" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cGV" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2a1800" stopOpacity="0" />
            <stop offset="4%" stopColor="#6b4a10" />
            <stop offset="15%" stopColor="#c9a84c" />
            <stop offset="30%" stopColor="#f5e27a" />
            <stop offset="50%" stopColor="#fff8dc" />
            <stop offset="70%" stopColor="#f5e27a" />
            <stop offset="85%" stopColor="#c9a84c" />
            <stop offset="96%" stopColor="#6b4a10" />
            <stop offset="100%" stopColor="#2a1800" stopOpacity="0" />
          </linearGradient>
          <filter id="cGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="cGlowS" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="cRC" cx="0%" cy="0%" r="100%">
            <stop offset="0%" stopColor="#f5e27a" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2a1800" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── Thick border ── */}
        <rect x="0" y="6" width="1920" height="5" fill="url(#cGH)" opacity="0.30" />
        <rect x="0" y="12" width="1920" height="18" fill="url(#cGH)" opacity="1.00" />
        <rect x="0" y="32" width="1920" height="8" fill="url(#cGH)" opacity="0.55" />
        <rect x="0" y="42" width="1920" height="3" fill="url(#cGH)" opacity="0.30" />
        <rect x="0" y="47" width="1920" height="1" fill="url(#cGH)" opacity="0.18" />
        <rect x="0" y="1067" width="1920" height="5" fill="url(#cGH)" opacity="0.30" />
        <rect x="0" y="1050" width="1920" height="18" fill="url(#cGH)" opacity="1.00" />
        <rect x="0" y="1040" width="1920" height="8" fill="url(#cGH)" opacity="0.55" />
        <rect x="0" y="1032" width="1920" height="3" fill="url(#cGH)" opacity="0.30" />
        <rect x="0" y="1029" width="1920" height="1" fill="url(#cGH)" opacity="0.18" />
        <rect x="6" y="0" width="5" height="1080" fill="url(#cGV)" opacity="0.30" />
        <rect x="12" y="0" width="18" height="1080" fill="url(#cGV)" opacity="1.00" />
        <rect x="32" y="0" width="8" height="1080" fill="url(#cGV)" opacity="0.55" />
        <rect x="42" y="0" width="3" height="1080" fill="url(#cGV)" opacity="0.30" />
        <rect x="47" y="0" width="1" height="1080" fill="url(#cGV)" opacity="0.18" />
        <rect x="1909" y="0" width="5" height="1080" fill="url(#cGV)" opacity="0.30" />
        <rect x="1890" y="0" width="18" height="1080" fill="url(#cGV)" opacity="1.00" />
        <rect x="1880" y="0" width="8" height="1080" fill="url(#cGV)" opacity="0.55" />
        <rect x="1875" y="0" width="3" height="1080" fill="url(#cGV)" opacity="0.30" />
        <rect x="1872" y="0" width="1" height="1080" fill="url(#cGV)" opacity="0.18" />

        {/* ── Top-left corner ── */}
        <g filter="url(#cGlow)">
          <rect x="0" y="0" width="220" height="220" fill="url(#cRC)" />
          <rect x="6" y="6" width="214" height="24" rx="2" fill="url(#cGH)" opacity="0.95" />
          <rect x="6" y="6" width="24" height="214" rx="2" fill="url(#cGV)" opacity="0.95" />
          <rect x="50" y="50" width="130" height="4" fill="url(#cGH)" opacity="0.5" />
          <rect x="50" y="50" width="4" height="130" fill="url(#cGV)" opacity="0.5" />
          <path d="M54,54 Q90,40 170,52" fill="none" stroke="#c9a84c" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.4" />
          <path d="M54,54 Q40,90 52,170" fill="none" stroke="#c9a84c" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.4" />
          <circle cx="80" cy="18" r="4.5" fill="#fff8dc" opacity="0.95" />
          <circle cx="110" cy="18" r="3" fill="#c9a84c" opacity="0.80" />
          <circle cx="140" cy="18" r="4.5" fill="#fff8dc" opacity="0.95" />
          <circle cx="170" cy="18" r="3" fill="#c9a84c" opacity="0.80" />
          <circle cx="18" cy="80" r="4.5" fill="#fff8dc" opacity="0.95" />
          <circle cx="18" cy="110" r="3" fill="#c9a84c" opacity="0.80" />
          <circle cx="18" cy="140" r="4.5" fill="#fff8dc" opacity="0.95" />
          <circle cx="18" cy="170" r="3" fill="#c9a84c" opacity="0.80" />
          <rect x="14" y="14" width="8" height="8" rx="1" fill="#fff8dc" transform="rotate(45,18,18)" />
          <g filter="url(#cGlowS)">
            <line x1="18" y1="6" x2="18" y2="44" stroke="#fff8dc" strokeWidth="6" strokeLinecap="round" />
            <line x1="6" y1="22" x2="44" y2="22" stroke="#fff8dc" strokeWidth="6" strokeLinecap="round" />
            <line x1="18" y1="6" x2="18" y2="44" stroke="#f5e27a" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
            <line x1="6" y1="22" x2="44" y2="22" stroke="#f5e27a" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
            <circle cx="18" cy="6" r="4.5" fill="#f5e27a" />
            <circle cx="18" cy="44" r="4.5" fill="#f5e27a" />
            <circle cx="6" cy="22" r="4.5" fill="#f5e27a" />
            <circle cx="44" cy="22" r="4.5" fill="#f5e27a" />
            <circle cx="18" cy="22" r="7" fill="#fff8dc" />
            <circle cx="18" cy="22" r="3.5" fill="#f5e27a" />
          </g>
          <path d="M55,18 C85,10 115,26 145,14 C170,4 190,20 215,16" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
          <path d="M80,18  C82,10 88,8  92,14" fill="none" stroke="#a67c30" strokeWidth="1.5" opacity="0.55" />
          <path d="M120,16 C122,8 128,6 130,12" fill="none" stroke="#a67c30" strokeWidth="1.5" opacity="0.55" />
          <ellipse cx="92" cy="10" rx="8" ry="4.5" fill="#8a6820" opacity="0.6" transform="rotate(-20,92,10)" />
          <ellipse cx="131" cy="9" rx="7" ry="4" fill="#8a6820" opacity="0.55" transform="rotate(15,131,9)" />
          <circle cx="198" cy="22" r="5.5" fill="#c9a84c" opacity="0.55" />
          <circle cx="207" cy="17" r="4.5" fill="#a67c30" opacity="0.50" />
          <circle cx="190" cy="16" r="4.5" fill="#b8902e" opacity="0.48" />
          <path d="M18,55 C10,85 26,115 14,145 C4,170 20,190 16,215" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
          <path d="M18,80  C10,82  8,88  14,92" fill="none" stroke="#a67c30" strokeWidth="1.5" opacity="0.55" />
          <path d="M16,120 C8,122  6,128 12,130" fill="none" stroke="#a67c30" strokeWidth="1.5" opacity="0.55" />
          <ellipse cx="10" cy="92" rx="4.5" ry="8" fill="#8a6820" opacity="0.6" transform="rotate(20,10,92)" />
          <ellipse cx="9" cy="131" rx="4" ry="7" fill="#8a6820" opacity="0.55" transform="rotate(-15,9,131)" />
          <circle cx="22" cy="198" r="5.5" fill="#c9a84c" opacity="0.55" />
          <circle cx="17" cy="207" r="4.5" fill="#a67c30" opacity="0.50" />
          <circle cx="16" cy="190" r="4.5" fill="#b8902e" opacity="0.48" />
        </g>

        {/* ── Top-right corner (mirror X) ── */}
        <g transform="scale(-1,1) translate(-1920,0)" filter="url(#cGlow)">
          <rect x="0" y="0" width="220" height="220" fill="url(#cRC)" />
          <rect x="6" y="6" width="214" height="24" rx="2" fill="url(#cGH)" opacity="0.95" />
          <rect x="6" y="6" width="24" height="214" rx="2" fill="url(#cGV)" opacity="0.95" />
          <rect x="50" y="50" width="130" height="4" fill="url(#cGH)" opacity="0.5" />
          <rect x="50" y="50" width="4" height="130" fill="url(#cGV)" opacity="0.5" />
          <circle cx="80" cy="18" r="4.5" fill="#fff8dc" opacity="0.95" />
          <circle cx="110" cy="18" r="3" fill="#c9a84c" opacity="0.80" />
          <circle cx="140" cy="18" r="4.5" fill="#fff8dc" opacity="0.95" />
          <circle cx="170" cy="18" r="3" fill="#c9a84c" opacity="0.80" />
          <circle cx="18" cy="80" r="4.5" fill="#fff8dc" opacity="0.95" />
          <circle cx="18" cy="110" r="3" fill="#c9a84c" opacity="0.80" />
          <circle cx="18" cy="140" r="4.5" fill="#fff8dc" opacity="0.95" />
          <circle cx="18" cy="170" r="3" fill="#c9a84c" opacity="0.80" />
          <rect x="14" y="14" width="8" height="8" rx="1" fill="#fff8dc" transform="rotate(45,18,18)" />
          <g filter="url(#cGlowS)">
            <line x1="18" y1="6" x2="18" y2="44" stroke="#fff8dc" strokeWidth="6" strokeLinecap="round" />
            <line x1="6" y1="22" x2="44" y2="22" stroke="#fff8dc" strokeWidth="6" strokeLinecap="round" />
            <line x1="18" y1="6" x2="18" y2="44" stroke="#f5e27a" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
            <line x1="6" y1="22" x2="44" y2="22" stroke="#f5e27a" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
            <circle cx="18" cy="6" r="4.5" fill="#f5e27a" />
            <circle cx="18" cy="44" r="4.5" fill="#f5e27a" />
            <circle cx="6" cy="22" r="4.5" fill="#f5e27a" />
            <circle cx="44" cy="22" r="4.5" fill="#f5e27a" />
            <circle cx="18" cy="22" r="7" fill="#fff8dc" />
            <circle cx="18" cy="22" r="3.5" fill="#f5e27a" />
          </g>
          <path d="M55,18 C85,10 115,26 145,14 C170,4 190,20 215,16" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
          <path d="M80,18  C82,10 88,8  92,14" fill="none" stroke="#a67c30" strokeWidth="1.5" opacity="0.55" />
          <path d="M120,16 C122,8 128,6 130,12" fill="none" stroke="#a67c30" strokeWidth="1.5" opacity="0.55" />
          <ellipse cx="92" cy="10" rx="8" ry="4.5" fill="#8a6820" opacity="0.6" transform="rotate(-20,92,10)" />
          <ellipse cx="131" cy="9" rx="7" ry="4" fill="#8a6820" opacity="0.55" transform="rotate(15,131,9)" />
          <circle cx="198" cy="22" r="5.5" fill="#c9a84c" opacity="0.55" />
          <circle cx="207" cy="17" r="4.5" fill="#a67c30" opacity="0.50" />
          <circle cx="190" cy="16" r="4.5" fill="#b8902e" opacity="0.48" />
          <path d="M18,55 C10,85 26,115 14,145 C4,170 20,190 16,215" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
          <path d="M18,80  C10,82  8,88  14,92" fill="none" stroke="#a67c30" strokeWidth="1.5" opacity="0.55" />
          <path d="M16,120 C8,122  6,128 12,130" fill="none" stroke="#a67c30" strokeWidth="1.5" opacity="0.55" />
          <ellipse cx="10" cy="92" rx="4.5" ry="8" fill="#8a6820" opacity="0.6" transform="rotate(20,10,92)" />
          <ellipse cx="9" cy="131" rx="4" ry="7" fill="#8a6820" opacity="0.55" transform="rotate(-15,9,131)" />
          <circle cx="22" cy="198" r="5.5" fill="#c9a84c" opacity="0.55" />
          <circle cx="17" cy="207" r="4.5" fill="#a67c30" opacity="0.50" />
          <circle cx="16" cy="190" r="4.5" fill="#b8902e" opacity="0.48" />
        </g>

        {/* ── Bottom-left corner (mirror Y) ── */}
        <g transform="scale(1,-1) translate(0,-1080)" filter="url(#cGlow)">
          <rect x="0" y="0" width="220" height="220" fill="url(#cRC)" />
          <rect x="6" y="6" width="214" height="24" rx="2" fill="url(#cGH)" opacity="0.95" />
          <rect x="6" y="6" width="24" height="214" rx="2" fill="url(#cGV)" opacity="0.95" />
          <rect x="50" y="50" width="130" height="4" fill="url(#cGH)" opacity="0.5" />
          <rect x="50" y="50" width="4" height="130" fill="url(#cGV)" opacity="0.5" />
          <circle cx="80" cy="18" r="4.5" fill="#fff8dc" opacity="0.95" />
          <circle cx="110" cy="18" r="3" fill="#c9a84c" opacity="0.80" />
          <circle cx="140" cy="18" r="4.5" fill="#fff8dc" opacity="0.95" />
          <circle cx="170" cy="18" r="3" fill="#c9a84c" opacity="0.80" />
          <circle cx="18" cy="80" r="4.5" fill="#fff8dc" opacity="0.95" />
          <circle cx="18" cy="110" r="3" fill="#c9a84c" opacity="0.80" />
          <circle cx="18" cy="140" r="4.5" fill="#fff8dc" opacity="0.95" />
          <circle cx="18" cy="170" r="3" fill="#c9a84c" opacity="0.80" />
          <rect x="14" y="14" width="8" height="8" rx="1" fill="#fff8dc" transform="rotate(45,18,18)" />
          <g filter="url(#cGlowS)">
            <line x1="18" y1="6" x2="18" y2="44" stroke="#fff8dc" strokeWidth="6" strokeLinecap="round" />
            <line x1="6" y1="22" x2="44" y2="22" stroke="#fff8dc" strokeWidth="6" strokeLinecap="round" />
            <line x1="18" y1="6" x2="18" y2="44" stroke="#f5e27a" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
            <line x1="6" y1="22" x2="44" y2="22" stroke="#f5e27a" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
            <circle cx="18" cy="6" r="4.5" fill="#f5e27a" />
            <circle cx="18" cy="44" r="4.5" fill="#f5e27a" />
            <circle cx="6" cy="22" r="4.5" fill="#f5e27a" />
            <circle cx="44" cy="22" r="4.5" fill="#f5e27a" />
            <circle cx="18" cy="22" r="7" fill="#fff8dc" />
            <circle cx="18" cy="22" r="3.5" fill="#f5e27a" />
          </g>
          <path d="M55,18 C85,10 115,26 145,14 C170,4 190,20 215,16" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
          <ellipse cx="92" cy="10" rx="8" ry="4.5" fill="#8a6820" opacity="0.6" transform="rotate(-20,92,10)" />
          <ellipse cx="131" cy="9" rx="7" ry="4" fill="#8a6820" opacity="0.55" transform="rotate(15,131,9)" />
          <circle cx="198" cy="22" r="5.5" fill="#c9a84c" opacity="0.55" />
          <circle cx="207" cy="17" r="4.5" fill="#a67c30" opacity="0.50" />
          <path d="M18,55 C10,85 26,115 14,145 C4,170 20,190 16,215" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
          <ellipse cx="10" cy="92" rx="4.5" ry="8" fill="#8a6820" opacity="0.6" transform="rotate(20,10,92)" />
          <ellipse cx="9" cy="131" rx="4" ry="7" fill="#8a6820" opacity="0.55" transform="rotate(-15,9,131)" />
          <circle cx="22" cy="198" r="5.5" fill="#c9a84c" opacity="0.55" />
          <circle cx="17" cy="207" r="4.5" fill="#a67c30" opacity="0.50" />
        </g>

        {/* ── Bottom-right corner (mirror XY) ── */}
        <g transform="scale(-1,-1) translate(-1920,-1080)" filter="url(#cGlow)">
          <rect x="0" y="0" width="220" height="220" fill="url(#cRC)" />
          <rect x="6" y="6" width="214" height="24" rx="2" fill="url(#cGH)" opacity="0.95" />
          <rect x="6" y="6" width="24" height="214" rx="2" fill="url(#cGV)" opacity="0.95" />
          <rect x="50" y="50" width="130" height="4" fill="url(#cGH)" opacity="0.5" />
          <rect x="50" y="50" width="4" height="130" fill="url(#cGV)" opacity="0.5" />
          <circle cx="80" cy="18" r="4.5" fill="#fff8dc" opacity="0.95" />
          <circle cx="110" cy="18" r="3" fill="#c9a84c" opacity="0.80" />
          <circle cx="140" cy="18" r="4.5" fill="#fff8dc" opacity="0.95" />
          <circle cx="170" cy="18" r="3" fill="#c9a84c" opacity="0.80" />
          <circle cx="18" cy="80" r="4.5" fill="#fff8dc" opacity="0.95" />
          <circle cx="18" cy="110" r="3" fill="#c9a84c" opacity="0.80" />
          <circle cx="18" cy="140" r="4.5" fill="#fff8dc" opacity="0.95" />
          <circle cx="18" cy="170" r="3" fill="#c9a84c" opacity="0.80" />
          <rect x="14" y="14" width="8" height="8" rx="1" fill="#fff8dc" transform="rotate(45,18,18)" />
          <g filter="url(#cGlowS)">
            <line x1="18" y1="6" x2="18" y2="44" stroke="#fff8dc" strokeWidth="6" strokeLinecap="round" />
            <line x1="6" y1="22" x2="44" y2="22" stroke="#fff8dc" strokeWidth="6" strokeLinecap="round" />
            <line x1="18" y1="6" x2="18" y2="44" stroke="#f5e27a" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
            <line x1="6" y1="22" x2="44" y2="22" stroke="#f5e27a" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
            <circle cx="18" cy="6" r="4.5" fill="#f5e27a" />
            <circle cx="18" cy="44" r="4.5" fill="#f5e27a" />
            <circle cx="6" cy="22" r="4.5" fill="#f5e27a" />
            <circle cx="44" cy="22" r="4.5" fill="#f5e27a" />
            <circle cx="18" cy="22" r="7" fill="#fff8dc" />
            <circle cx="18" cy="22" r="3.5" fill="#f5e27a" />
          </g>
          <path d="M55,18 C85,10 115,26 145,14 C170,4 190,20 215,16" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
          <ellipse cx="92" cy="10" rx="8" ry="4.5" fill="#8a6820" opacity="0.6" transform="rotate(-20,92,10)" />
          <ellipse cx="131" cy="9" rx="7" ry="4" fill="#8a6820" opacity="0.55" transform="rotate(15,131,9)" />
          <circle cx="198" cy="22" r="5.5" fill="#c9a84c" opacity="0.55" />
          <circle cx="207" cy="17" r="4.5" fill="#a67c30" opacity="0.50" />
          <path d="M18,55 C10,85 26,115 14,145 C4,170 20,190 16,215" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
          <ellipse cx="10" cy="92" rx="4.5" ry="8" fill="#8a6820" opacity="0.6" transform="rotate(20,10,92)" />
          <ellipse cx="9" cy="131" rx="4" ry="7" fill="#8a6820" opacity="0.55" transform="rotate(-15,9,131)" />
          <circle cx="22" cy="198" r="5.5" fill="#c9a84c" opacity="0.55" />
          <circle cx="17" cy="207" r="4.5" fill="#a67c30" opacity="0.50" />
        </g>

        {/* ── Top center cross + vine garland ── */}
        <g transform="translate(960,0)" filter="url(#cGlowS)">
          <path d="M-380,21 C-320,10 -265,30 -210,16 C-165,5 -120,25 -72,18" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
          <path d="M-310,18 C-308,9 -300,6 -296,14" fill="none" stroke="#a67c30" strokeWidth="1.5" opacity="0.5" />
          <path d="M-230,16 C-228,8 -220,5 -217,13" fill="none" stroke="#a67c30" strokeWidth="1.5" opacity="0.5" />
          <ellipse cx="-296" cy="8" rx="9" ry="5" fill="#7a5e18" opacity="0.6" transform="rotate(-18,-296,8)" />
          <ellipse cx="-217" cy="7" rx="8" ry="4" fill="#8a6820" opacity="0.55" transform="rotate(12,-217,7)" />
          <circle cx="-100" cy="26" r="7" fill="#c9a84c" opacity="0.6" />
          <circle cx="-88" cy="19" r="6" fill="#a67c30" opacity="0.55" />
          <circle cx="-112" cy="18" r="5.5" fill="#b8902e" opacity="0.52" />
          <path d="M380,21 C320,10 265,30 210,16 C165,5 120,25 72,18" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
          <path d="M310,18 C308,9 300,6 296,14" fill="none" stroke="#a67c30" strokeWidth="1.5" opacity="0.5" />
          <path d="M230,16 C228,8 220,5 217,13" fill="none" stroke="#a67c30" strokeWidth="1.5" opacity="0.5" />
          <ellipse cx="296" cy="8" rx="9" ry="5" fill="#7a5e18" opacity="0.6" transform="rotate(18,296,8)" />
          <ellipse cx="217" cy="7" rx="8" ry="4" fill="#8a6820" opacity="0.55" transform="rotate(-12,217,7)" />
          <circle cx="100" cy="26" r="7" fill="#c9a84c" opacity="0.6" />
          <circle cx="88" cy="19" r="6" fill="#a67c30" opacity="0.55" />
          <circle cx="112" cy="18" r="5.5" fill="#b8902e" opacity="0.52" />
          <line x1="0" y1="1" x2="0" y2="52" stroke="#fff8dc" strokeWidth="8" strokeLinecap="round" />
          <line x1="-24" y1="20" x2="24" y2="20" stroke="#fff8dc" strokeWidth="8" strokeLinecap="round" />
          <line x1="0" y1="1" x2="0" y2="52" stroke="#f5e27a" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
          <line x1="-24" y1="20" x2="24" y2="20" stroke="#f5e27a" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
          <circle cx="0" cy="1" r="6" fill="#f5e27a" />
          <circle cx="0" cy="52" r="6" fill="#f5e27a" />
          <circle cx="-24" cy="20" r="6" fill="#f5e27a" />
          <circle cx="24" cy="20" r="6" fill="#f5e27a" />
          <circle cx="0" cy="20" r="9" fill="#fff8dc" />
          <circle cx="0" cy="20" r="4.5" fill="#f5e27a" />
        </g>

        {/* ── Bottom center cross + vine (mirror Y) ── */}
        <g transform="translate(960,1080) scale(1,-1)" filter="url(#cGlowS)">
          <path d="M-380,21 C-320,10 -265,30 -210,16 C-165,5 -120,25 -72,18" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
          <ellipse cx="-296" cy="8" rx="9" ry="5" fill="#7a5e18" opacity="0.6" transform="rotate(-18,-296,8)" />
          <ellipse cx="-217" cy="7" rx="8" ry="4" fill="#8a6820" opacity="0.55" transform="rotate(12,-217,7)" />
          <circle cx="-100" cy="26" r="7" fill="#c9a84c" opacity="0.6" />
          <circle cx="-88" cy="19" r="6" fill="#a67c30" opacity="0.55" />
          <circle cx="-112" cy="18" r="5.5" fill="#b8902e" opacity="0.52" />
          <path d="M380,21 C320,10 265,30 210,16 C165,5 120,25 72,18" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
          <ellipse cx="296" cy="8" rx="9" ry="5" fill="#7a5e18" opacity="0.6" transform="rotate(18,296,8)" />
          <ellipse cx="217" cy="7" rx="8" ry="4" fill="#8a6820" opacity="0.55" transform="rotate(-12,217,7)" />
          <circle cx="100" cy="26" r="7" fill="#c9a84c" opacity="0.6" />
          <circle cx="88" cy="19" r="6" fill="#a67c30" opacity="0.55" />
          <circle cx="112" cy="18" r="5.5" fill="#b8902e" opacity="0.52" />
          <line x1="0" y1="1" x2="0" y2="52" stroke="#fff8dc" strokeWidth="8" strokeLinecap="round" />
          <line x1="-24" y1="20" x2="24" y2="20" stroke="#fff8dc" strokeWidth="8" strokeLinecap="round" />
          <line x1="0" y1="1" x2="0" y2="52" stroke="#f5e27a" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
          <line x1="-24" y1="20" x2="24" y2="20" stroke="#f5e27a" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
          <circle cx="0" cy="1" r="6" fill="#f5e27a" />
          <circle cx="0" cy="52" r="6" fill="#f5e27a" />
          <circle cx="-24" cy="20" r="6" fill="#f5e27a" />
          <circle cx="24" cy="20" r="6" fill="#f5e27a" />
          <circle cx="0" cy="20" r="9" fill="#fff8dc" />
          <circle cx="0" cy="20" r="4.5" fill="#f5e27a" />
        </g>

        {/* ── Left center cross + vines ── */}
        <g transform="translate(0,540)">
          <path d="M21,-340 C10,-280 28,-225 15,-170 C4,-128 22,-90 16,-55" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
          <ellipse cx="9" cy="-267" rx="5" ry="9" fill="#7a5e18" opacity="0.6" transform="rotate(18,9,-267)" />
          <ellipse cx="8" cy="-188" rx="4" ry="8" fill="#8a6820" opacity="0.55" transform="rotate(-12,8,-188)" />
          <circle cx="26" cy="-100" r="7" fill="#c9a84c" opacity="0.6" />
          <circle cx="19" cy="-88" r="6" fill="#a67c30" opacity="0.55" />
          <circle cx="18" cy="-112" r="5.5" fill="#b8902e" opacity="0.52" />
          <path d="M21,340 C10,280 28,225 15,170 C4,128 22,90 16,55" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
          <ellipse cx="9" cy="267" rx="5" ry="9" fill="#7a5e18" opacity="0.6" transform="rotate(-18,9,267)" />
          <ellipse cx="8" cy="188" rx="4" ry="8" fill="#8a6820" opacity="0.55" transform="rotate(12,8,188)" />
          <circle cx="26" cy="100" r="7" fill="#c9a84c" opacity="0.6" />
          <circle cx="19" cy="88" r="6" fill="#a67c30" opacity="0.55" />
          <circle cx="18" cy="112" r="5.5" fill="#b8902e" opacity="0.52" />
          <g filter="url(#cGlowS)">
            <line x1="2" y1="0" x2="52" y2="0" stroke="#fff8dc" strokeWidth="8" strokeLinecap="round" />
            <line x1="20" y1="-24" x2="20" y2="24" stroke="#fff8dc" strokeWidth="8" strokeLinecap="round" />
            <line x1="2" y1="0" x2="52" y2="0" stroke="#f5e27a" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
            <line x1="20" y1="-24" x2="20" y2="24" stroke="#f5e27a" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
            <circle cx="2" cy="0" r="6" fill="#f5e27a" />
            <circle cx="52" cy="0" r="6" fill="#f5e27a" />
            <circle cx="20" cy="-24" r="6" fill="#f5e27a" />
            <circle cx="20" cy="24" r="6" fill="#f5e27a" />
            <circle cx="20" cy="0" r="9" fill="#fff8dc" />
            <circle cx="20" cy="0" r="4.5" fill="#f5e27a" />
          </g>
        </g>

        {/* ── Right center cross + vines (mirror X) ── */}
        <g transform="translate(1920,540) scale(-1,1)">
          <path d="M21,-340 C10,-280 28,-225 15,-170 C4,-128 22,-90 16,-55" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
          <ellipse cx="9" cy="-267" rx="5" ry="9" fill="#7a5e18" opacity="0.6" transform="rotate(18,9,-267)" />
          <ellipse cx="8" cy="-188" rx="4" ry="8" fill="#8a6820" opacity="0.55" transform="rotate(-12,8,-188)" />
          <circle cx="26" cy="-100" r="7" fill="#c9a84c" opacity="0.6" />
          <circle cx="19" cy="-88" r="6" fill="#a67c30" opacity="0.55" />
          <circle cx="18" cy="-112" r="5.5" fill="#b8902e" opacity="0.52" />
          <path d="M21,340 C10,280 28,225 15,170 C4,128 22,90 16,55" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
          <ellipse cx="9" cy="267" rx="5" ry="9" fill="#7a5e18" opacity="0.6" transform="rotate(-18,9,267)" />
          <ellipse cx="8" cy="188" rx="4" ry="8" fill="#8a6820" opacity="0.55" transform="rotate(12,8,188)" />
          <circle cx="26" cy="100" r="7" fill="#c9a84c" opacity="0.6" />
          <circle cx="19" cy="88" r="6" fill="#a67c30" opacity="0.55" />
          <circle cx="18" cy="112" r="5.5" fill="#b8902e" opacity="0.52" />
          <g filter="url(#cGlowS)">
            <line x1="2" y1="0" x2="52" y2="0" stroke="#fff8dc" strokeWidth="8" strokeLinecap="round" />
            <line x1="20" y1="-24" x2="20" y2="24" stroke="#fff8dc" strokeWidth="8" strokeLinecap="round" />
            <line x1="2" y1="0" x2="52" y2="0" stroke="#f5e27a" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
            <line x1="20" y1="-24" x2="20" y2="24" stroke="#f5e27a" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
            <circle cx="2" cy="0" r="6" fill="#f5e27a" />
            <circle cx="52" cy="0" r="6" fill="#f5e27a" />
            <circle cx="20" cy="-24" r="6" fill="#f5e27a" />
            <circle cx="20" cy="24" r="6" fill="#f5e27a" />
            <circle cx="20" cy="0" r="9" fill="#fff8dc" />
            <circle cx="20" cy="0" r="4.5" fill="#f5e27a" />
          </g>
        </g>
      </svg>

      {/* ── Logo — position controlled ── */}
      {logoVisible && (
        <div
          className={`church-logo-wrap church-logo-pos--${logoPosition}`}
          style={{ width: logoSize, height: logoSize }}
        >
          <div
            className="church-logo-body"
            style={{ width: logoSize - 44, height: logoSize - 44, opacity: logoOpacity / 100 }}
          >
            {logoBase64 ? (
              <img
                src={logoBase64}
                className={`church-logo-img church-logo-anim--${logoAnimation}`}
                style={{ width: '85%', height: '85%', objectFit: 'contain', borderRadius: '50%' }}
                alt="logo"
              />
            ) : (
              <svg viewBox="0 0 60 60" width="58" height="58" xmlns="http://www.w3.org/2000/svg"
                className={`church-logo-svg church-logo-anim--${logoAnimation}`}>
                <line x1="30" y1="5" x2="30" y2="55" stroke="#c9a84c" strokeWidth="6" strokeLinecap="round" />
                <line x1="8" y1="20" x2="52" y2="20" stroke="#c9a84c" strokeWidth="6" strokeLinecap="round" />
                <line x1="30" y1="5" x2="30" y2="55" stroke="#f5e27a" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
                <line x1="8" y1="20" x2="52" y2="20" stroke="#f5e27a" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
                <circle cx="30" cy="5" r="5" fill="#f5e27a" />
                <circle cx="30" cy="55" r="5" fill="#f5e27a" />
                <circle cx="8" cy="20" r="5" fill="#f5e27a" />
                <circle cx="52" cy="20" r="5" fill="#f5e27a" />
                <circle cx="30" cy="20" r="8" fill="#fff8dc" />
                <circle cx="30" cy="20" r="4" fill="#f5e27a" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* ── Reading panel — bottom ── */}
      <div
        className={`church-reading-wrap church-reading-wrap--${panelLayout}`}
        hidden={!visible}
        style={(() => {
          const w = panelWidth ?? 100
          const h = panelHeight ?? 20
          if (panelLayout === 'full') {
            const pxWidth = Math.round(1920 * w / 100)
            const left = Math.round((1920 - pxWidth) / 2)
            const pxHeight = Math.round(1080 * h / 100)
            return {
              bottom: '30px',
              top: 'auto',
              left: `${left}px`,
              right: `${1920 - left - pxWidth}px`,
              width: 'auto',
              minHeight: `${pxHeight}px`,
            }
          }
          const pxWidth = Math.round(1920 * w / 100)
          if (panelLayout === 'left') return { width: `${pxWidth}px` }
          if (panelLayout === 'right') return { width: `${pxWidth}px` }
          return {}
        })()}
      >
        <div className="church-reading-topbar" />
        <div className="church-reading-midbar" />
        <div className="church-reading-panel">
          {/* Left ornament */}
          <div className="church-panel-side church-panel-side--left">
            <svg viewBox="0 0 90 120" width="90" height="120" xmlns="http://www.w3.org/2000/svg">
              <path d="M45,10 C36,35 54,55 40,80 C30,100 48,108 45,118" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
              <path d="M43,35 C34,33 28,38 34,44" fill="none" stroke="#a67c30" strokeWidth="1.5" opacity="0.5" />
              <path d="M41,70 C32,68 26,73 32,79" fill="none" stroke="#a67c30" strokeWidth="1.5" opacity="0.5" />
              <ellipse cx="30" cy="44" rx="9" ry="5" fill="#7a5e18" opacity="0.6" transform="rotate(-30,30,44)" />
              <ellipse cx="28" cy="79" rx="8" ry="4.5" fill="#8a6820" opacity="0.55" transform="rotate(20,28,79)" />
              <circle cx="52" cy="55" r="7" fill="#c9a84c" opacity="0.55" />
              <circle cx="43" cy="49" r="6" fill="#a67c30" opacity="0.50" />
              <circle cx="60" cy="49" r="5.5" fill="#b8902e" opacity="0.48" />
              <circle cx="52" cy="42" r="5" fill="#f5e27a" opacity="0.38" />
              <line x1="45" y1="4" x2="45" y2="22" stroke="#fff8dc" strokeWidth="5" strokeLinecap="round" />
              <line x1="36" y1="12" x2="54" y2="12" stroke="#fff8dc" strokeWidth="5" strokeLinecap="round" />
              <circle cx="45" cy="4" r="4" fill="#f5e27a" />
              <circle cx="45" cy="22" r="4" fill="#f5e27a" />
              <circle cx="36" cy="12" r="4" fill="#f5e27a" />
              <circle cx="54" cy="12" r="4" fill="#f5e27a" />
              <circle cx="45" cy="12" r="6" fill="#fff8dc" />
              <circle cx="45" cy="12" r="3" fill="#f5e27a" />
            </svg>
          </div>
          {/* Right ornament */}
          <div className="church-panel-side church-panel-side--right">
            <svg viewBox="0 0 90 120" width="90" height="120" xmlns="http://www.w3.org/2000/svg">
              <path d="M45,10 C36,35 54,55 40,80 C30,100 48,108 45,118" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
              <path d="M43,35 C34,33 28,38 34,44" fill="none" stroke="#a67c30" strokeWidth="1.5" opacity="0.5" />
              <path d="M41,70 C32,68 26,73 32,79" fill="none" stroke="#a67c30" strokeWidth="1.5" opacity="0.5" />
              <ellipse cx="30" cy="44" rx="9" ry="5" fill="#7a5e18" opacity="0.6" transform="rotate(-30,30,44)" />
              <ellipse cx="28" cy="79" rx="8" ry="4.5" fill="#8a6820" opacity="0.55" transform="rotate(20,28,79)" />
              <circle cx="52" cy="55" r="7" fill="#c9a84c" opacity="0.55" />
              <circle cx="43" cy="49" r="6" fill="#a67c30" opacity="0.50" />
              <circle cx="60" cy="49" r="5.5" fill="#b8902e" opacity="0.48" />
              <circle cx="52" cy="42" r="5" fill="#f5e27a" opacity="0.38" />
              <line x1="45" y1="4" x2="45" y2="22" stroke="#fff8dc" strokeWidth="5" strokeLinecap="round" />
              <line x1="36" y1="12" x2="54" y2="12" stroke="#fff8dc" strokeWidth="5" strokeLinecap="round" />
              <circle cx="45" cy="4" r="4" fill="#f5e27a" />
              <circle cx="45" cy="22" r="4" fill="#f5e27a" />
              <circle cx="36" cy="12" r="4" fill="#f5e27a" />
              <circle cx="54" cy="12" r="4" fill="#f5e27a" />
              <circle cx="45" cy="12" r="6" fill="#fff8dc" />
              <circle cx="45" cy="12" r="3" fill="#f5e27a" />
            </svg>
          </div>
          <div ref={panelBodyRef} className="church-reading-body">
            {visible && line1 && (() => {
              const script1 = resolveScriptClass(line1, langs[0])
              const isCoptic1 = script1 === 'coptic'
              const effectiveFont1 = isCoptic1
                ? '"Noto Sans Coptic", "Antinoou", "New Athena Unicode", serif'
                : fontFamily
              return (
                <div
                  ref={line1Ref}
                  className={`church-reading-line1 church-reading--${script1}`}
                  dir={script1 === 'arabic' ? 'rtl' : 'ltr'}
                  lang={script1 === 'coptic' ? 'cop' : script1 === 'arabic' ? 'ar' : 'en'}
                  style={{
                    fontSize: `${fontSize}px`,
                    fontFamily: effectiveFont1,
                    color: textColor,
                    textAlign: alignment as any,
                    fontWeight: line1Bold ? 'bold' : 'normal',
                    wordBreak: 'break-word',
                    overflowWrap: 'break-word',
                  }}
                >{line1}</div>
              )
            })()}
            {visible && line1 && line2 && (
              <div className="church-reading-divider">
                <div className="church-reading-divider-line" />
                <div className="church-reading-divider-diamond" />
                <div className="church-reading-divider-line" />
              </div>
            )}
            {visible && line2 && (() => {
              const script2 = resolveScriptClass(line2, langs[1])
              const isCoptic2 = script2 === 'coptic'
              const effectiveFont2 = isCoptic2
                ? '"Noto Sans Coptic", "Antinoou", "New Athena Unicode", serif'
                : (line2FontFamily ?? fontFamily)
              return (
                <div
                  ref={line2Ref}
                  className={`church-reading-line2 church-reading--${script2}`}
                  dir={script2 === 'arabic' ? 'rtl' : 'ltr'}
                  lang={script2 === 'coptic' ? 'cop' : script2 === 'arabic' ? 'ar' : 'en'}
                  style={{
                    fontSize: `${Math.max(13, Math.round(fontSize * 0.6))}px`,
                    fontFamily: effectiveFont2,
                    color: line2TextColor ?? textColor,
                    textAlign: alignment as any,
                    fontWeight: line2Bold ? 'bold' : 'normal',
                    wordBreak: 'break-word',
                    overflowWrap: 'break-word',
                  }}
                >{line2}</div>
              )
            })()}
          </div>
        </div>
      </div>

    </div>
  )
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null
}

function isRtl(text: string) {
  if (!text) return false
  return /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(text)
}

// Coptic Unicode block U+2C80–U+2CFF
function isCoptic(text: string) {
  if (!text) return false
  return /[\u2C80-\u2CFF]/.test(text)
}

// Resolve language class for a text line, optionally using parser-supplied hint
function resolveScriptClass(text: string, langHint?: string): 'coptic' | 'arabic' | 'english' {
  if (langHint === 'coptic' || isCoptic(text)) return 'coptic'
  if (langHint === 'arabic' || isRtl(text)) return 'arabic'
  return 'english'
}
