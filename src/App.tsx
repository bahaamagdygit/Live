import { useState, useEffect, useCallback, useRef } from 'react'
import { CameraPanel } from './components/CameraPanel'
import { MainPreview, CameraSwitchTransition } from './components/MainPreview'
import { TextControls } from './components/TextControls'
import { StreamControls } from './components/StreamControls'
import { SettingsModal } from './components/SettingsModal'
import { VideoOverlayWidget } from './components/VideoOverlayWidget'
import { useCameras, DEFAULT_CAM_VIEW, CameraViewSettings } from './hooks/useCameras'
import { useIpCameras } from './hooks/useIpCameras'
import { useWebRTCCameras } from './hooks/useWebRTCCameras'
import { useMobileCameras, MobileCameraView, DEFAULT_MOBILE_VIEW } from './hooks/useMobileCameras'
import './components/MobileCameraPanel.css'
import { useStream } from './hooks/useStream'
import { useSlides } from './hooks/useSlides'
import { AppSettings, OverlaySettings, LogoSettings, CameraFallbackSettings, VideoOverlaySettings } from './types'
import './App.css'

const DEFAULT_SETTINGS: AppSettings = {
  streamConfig: {
    rtmpUrl: 'rtmp://live.youtube.com/live2',
    streamKey: '',
    resolution: '720p',
    fps: 30,
    bitrate: 3000,
  },
  overlaySettings: {
    text: '',
    visible: false,
    position: 'bottom',
    fontSize: 32,
    fontFamily: 'Arial',
    textColor: '#ffffff',
    bgColor: '#000000',
    bgOpacity: 70,
    alignment: 'center',
    line1Bold: true,
    line2Bold: false,
    panelLayout: 'full' as const,
    panelWidth: 100,
    panelHeight: 20,
    line2FontSize: 28,
    line2FontFamily: 'Arial',
    line2TextColor: '#ffffff',
    borderColor: '',
  },
  logoSettings: {
    filePath: '',
    position: 'top-right',
    size: 120,
    opacity: 80,
    visible: false,
    animation: 'none' as const,
    bgColor: '#000000',
    bgOpacity: 80,
  },
  cameraFallback: {
    filePath: '',
    base64: '',
    fit: 'cover',
  },
  hotkeys: {
    toggleText: '',
    nextSlide: '',
    prevSlide: '',
    cam1: '',
    cam2: '',
    cam3: '',
    cam4: '',
    startStream: '',
    stopStream: '',
    startRecording: '',
    stopRecording: '',
    openPresentation: '',
    closePresentation: '',
    openController: '',
    toggleFallback: '',
    openFile: '',
  },
}

function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>(
    DEFAULT_SETTINGS.overlaySettings
  )
  const [logoSettings, setLogoSettings] = useState<LogoSettings>(DEFAULT_SETTINGS.logoSettings)
  const [cameraFallback, setCameraFallback] = useState<CameraFallbackSettings>(DEFAULT_SETTINGS.cameraFallback)
  const [manualFallback, setManualFallback] = useState(false)
  const [switchTransition, setSwitchTransition] = useState<CameraSwitchTransition>('zoom')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isPresentationOpen, setIsPresentationOpen] = useState(false)
  const [isPptxControllerOpen, setIsPptxControllerOpen] = useState(false)
  const [isVideoOverlayOpen, setIsVideoOverlayOpen] = useState(false)
  const [displays, setDisplays] = useState<{ id: number; label: string }[]>([])
  const [selectedDisplayId, setSelectedDisplayId] = useState<number | undefined>(undefined)

  const cameras = useCameras()
  const ipCameras = useIpCameras()
  const mobileCameras = useMobileCameras()
  const [activeMobileDeviceId, setActiveMobileDeviceId] = useState<string | null>(null)
  const activeMobileView: MobileCameraView = activeMobileDeviceId
    ? (mobileCameras.views[activeMobileDeviceId] ?? DEFAULT_MOBILE_VIEW)
    : DEFAULT_MOBILE_VIEW
  const activeMobileMjpegUrl = activeMobileDeviceId
    ? mobileCameras.mjpegUrlFor(activeMobileDeviceId)
    : null
  const { cameras: webrtcCameraList, qrDataUrl: webrtcQrDataUrl, serverUrl: webrtcServerUrl } = useWebRTCCameras()
  const [activeWebRTCDeviceId, setActiveWebRTCDeviceId] = useState<string | null>(null)
  const [webrtcCamViewMap, setWebrtcCamViewMap] = useState<Record<string, CameraViewSettings>>({})
  const activeWebRTCCamView = activeWebRTCDeviceId ? (webrtcCamViewMap[activeWebRTCDeviceId] ?? DEFAULT_CAM_VIEW) : DEFAULT_CAM_VIEW
  const setWebrtcCamView = useCallback((deviceId: string, patch: Partial<CameraViewSettings>) => {
    setWebrtcCamViewMap(prev => ({
      ...prev,
      [deviceId]: { ...(prev[deviceId] ?? DEFAULT_CAM_VIEW), ...patch },
    }))
  }, [])
  const [activeIpCameraId, setActiveIpCameraId] = useState<string | null>(null)
  const [mobileCamMjpegUrl, setMobileCamMjpegUrl] = useState<string | null>(null)
  // Active IP camera — also handles the virtual '__mobile__' entry
  const activeIpCamera = activeIpCameraId === '__mobile__' && mobileCamMjpegUrl
    ? {
        id: '__mobile__', label: 'Mobile Camera', rtspUrl: '', port: 18800, active: true,
        mjpegUrl: mobileCamMjpegUrl,
        preset: { id: '__mobile__', label: 'Mobile Camera', host: '127.0.0.1', port: '18800',
                  user: '', pass: '', channel: '1', subStream: false, brand: 'generic' as const },
        view: { scale: 100, offsetX: 0, offsetY: 0, fit: 'cover' as const,
                brightness: 100, contrast: 100, saturation: 100, flipH: false, flipV: false },
      }
    : ipCameras.ipCameras.find(c => c.id === activeIpCameraId) ?? null
  const stream = useStream()
  const slides = useSlides()
  // Stable ref — VideoOverlayWidget calls onReady(setVideoEl) once on mount.
  // Storing it in a ref means no re-render when it's set.
  const videoElMountRef = useRef<((el: HTMLVideoElement | null) => void) | undefined>(undefined)
  const videoUpdateSettingsRef = useRef<((patch: Partial<VideoOverlaySettings>) => void) | null>(null)
  const videoPlayRef  = useRef<(() => void) | null>(null)
  const videoPauseRef = useRef<(() => void) | null>(null)
  const videoStopRef  = useRef<(() => void) | null>(null)
  const handleVideoReady = useCallback((
    setVideoEl: (el: HTMLVideoElement | null) => void,
    updateSettings: (patch: Partial<VideoOverlaySettings>) => void,
    controls: { play: () => void; pause: () => void; stop: () => void; getIsPlaying: () => boolean }
  ) => {
    videoElMountRef.current = setVideoEl
    videoUpdateSettingsRef.current = updateSettings
    videoPlayRef.current  = controls.play
    videoPauseRef.current = controls.pause
    videoStopRef.current  = controls.stop
  }, [])

  // Quick video controls surfaced to the toolbar
  const [videoQuick, setVideoQuick] = useState({ visible: false, opacity: 0.8, hasActive: false, isPlaying: false })

  // Load settings on startup
  useEffect(() => {
    const loadSettings = async () => {
      if (!window.electronAPI) {
        setIsInitialized(true)
        return
      }
      try {
        const result = await window.electronAPI.getSettings()
        if (result?.success && result.settings) {
          const loaded: AppSettings = {
            ...DEFAULT_SETTINGS,
            ...result.settings,
            streamConfig: { ...DEFAULT_SETTINGS.streamConfig, ...result.settings.streamConfig },
            overlaySettings: {
              ...DEFAULT_SETTINGS.overlaySettings,
              ...result.settings.overlaySettings,
              visible: false,
            },
            logoSettings: { ...DEFAULT_SETTINGS.logoSettings, ...result.settings.logoSettings },
            cameraFallback: { ...DEFAULT_SETTINGS.cameraFallback, ...result.settings.cameraFallback },
            hotkeys: (() => {
              const saved: Record<string, string> = result.settings.hotkeys || {}
              const oldDefaults = ['Space', 'Left', 'Right', 'F1', 'F2', 'F3', 'F4']
              const merged = { ...DEFAULT_SETTINGS.hotkeys }
              for (const k of Object.keys(merged) as (keyof typeof merged)[]) {
                const v = saved[k] ?? ''
                merged[k] = oldDefaults.includes(v) ? '' : v
              }
              return merged
            })(),
          }
          setSettings(loaded)
          setOverlaySettings(loaded.overlaySettings)
          setLogoSettings(loaded.logoSettings)
          setCameraFallback(loaded.cameraFallback)

          // Load logo data if path exists
          if (loaded.logoSettings.filePath && !loaded.logoSettings.base64) {
            const logoData = await window.electronAPI.getLogoData(loaded.logoSettings.filePath)
            if (logoData?.success && logoData.base64) {
              setLogoSettings((prev) => ({ ...prev, base64: logoData.base64 }))
            }
          }
          // Load fallback image data if path exists but base64 not stored yet
          if (loaded.cameraFallback.filePath && !loaded.cameraFallback.base64) {
            const imgData = await window.electronAPI.getLogoData(loaded.cameraFallback.filePath)
            if (imgData?.success && imgData.base64) {
              setCameraFallback((prev) => ({ ...prev, base64: imgData.base64 }))
            }
          }
          // base64 already stored — nothing extra needed
        }
      } catch (err) {
      } finally {
        setIsInitialized(true)
      }
    }
    loadSettings()
  }, [])

  // Load available displays
  useEffect(() => {
    if (!window.electronAPI?.getDisplays) return
    window.electronAPI.getDisplays().then((list) => {
      setDisplays(list)
      if (list.length > 0) setSelectedDisplayId(list[list.length - 1].id)
    })
  }, [])

  // Hotkey handler
  useEffect(() => {
    if (!window.electronAPI) return

    const cleanup = window.electronAPI.onHotkey((action: string) => {
      switch (action) {
        case 'toggle-text':
          setOverlaySettings((prev) => ({ ...prev, visible: !prev.visible }))
          break
        case 'next-slide':
          slides.nextSlide()
          break
        case 'prev-slide':
          slides.prevSlide()
          break
        case 'cam-1':
          if (cameras.cameras[0]) { setActiveIpCameraId(null); setActiveWebRTCDeviceId(null); setActiveMobileDeviceId(null); cameras.selectCamera(cameras.cameras[0]) }
          break
        case 'cam-2':
          if (cameras.cameras[1]) { setActiveIpCameraId(null); setActiveWebRTCDeviceId(null); setActiveMobileDeviceId(null); cameras.selectCamera(cameras.cameras[1]) }
          break
        case 'cam-3':
          if (cameras.cameras[2]) { setActiveIpCameraId(null); setActiveWebRTCDeviceId(null); setActiveMobileDeviceId(null); cameras.selectCamera(cameras.cameras[2]) }
          break
        case 'cam-4':
          if (cameras.cameras[3]) { setActiveIpCameraId(null); setActiveWebRTCDeviceId(null); setActiveMobileDeviceId(null); cameras.selectCamera(cameras.cameras[3]) }
          break
        case 'start-stream':
          handleStartStream()
          break
        case 'stop-stream':
          stream.stopStream()
          break
        case 'start-recording':
          handleStartRecording()
          break
        case 'stop-recording':
          stream.stopRecording()
          break
        case 'open-presentation':
          if (!isPresentationOpen) handleTogglePresentation()
          break
        case 'close-presentation':
          if (isPresentationOpen) handleTogglePresentation()
          break
        case 'open-controller':
          handleTogglePptxController()
          break
        case 'toggle-fallback':
          setManualFallback((v) => !v)
          break
        case 'open-file':
          slides.openPptx()
          break
      }
    })

    return cleanup
  }, [cameras.cameras, slides.nextSlide, slides.prevSlide])

  // Also handle keyboard in window (when app is focused)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }

      switch (e.key) {
        case ' ':
          e.preventDefault()
          setOverlaySettings((prev) => ({ ...prev, visible: !prev.visible }))
          break
        case 'ArrowRight':
          e.preventDefault()
          slides.nextSlide()
          break
        case 'ArrowLeft':
          e.preventDefault()
          slides.prevSlide()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [slides.nextSlide, slides.prevSlide])

  // Sync overlay text + langs with current slide
  useEffect(() => {
    const text = slides.getCurrentText()
    const langs = slides.getCurrentLangs()
    setOverlaySettings((prev) => {
      // Skip update if nothing actually changed — prevents infinite loop
      if (prev.text === text && prev.langs === langs) return prev
      return { ...prev, text, langs }
    })
  }, [slides.currentSlide]) // eslint-disable-line react-hooks/exhaustive-deps

  // Broadcast the current overlay reading text to all paired mobile devices
  // so their reading overlay stays in sync with the desktop output.
  useEffect(() => {
    if (!window.electronAPI?.mbBroadcastReading) return
    const text = overlaySettings.visible ? (overlaySettings.text || '') : ''
    window.electronAPI.mbBroadcastReading(text, overlaySettings.langs || [])
  }, [overlaySettings.text, overlaySettings.visible, overlaySettings.langs])

  // Broadcast core desktop state (current slide, stream status) to phones —
  // lets the mobile Control screen render accurate indicators.
  useEffect(() => {
    if (!window.electronAPI?.mbBroadcastDesktopState) return
    window.electronAPI.mbBroadcastDesktopState({
      slideIndex: slides.currentSlideIndex,
      totalSlides: slides.slides.length,
      currentText: slides.getCurrentText(),
      streamStatus: stream.streamStatus,
      recordingStatus: stream.recordingStatus,
      textVisible: overlaySettings.visible,
      activeCameraLabel: activeMobileDeviceId ? 'Mobile' :
        (activeIpCameraId ? (activeIpCamera?.label || 'IP Camera') : (cameras.activeCamera?.label || 'None')),
      availableCameras: [
        ...cameras.cameras.map(c => ({ id: `usb:${c.deviceId}`, label: c.label, kind: 'usb' })),
        ...ipCameras.ipCameras.map(c => ({ id: `ip:${c.id}`, label: c.label, kind: 'ip' })),
      ],
    })
  }, [slides.currentSlideIndex, slides.slides.length, stream.streamStatus, stream.recordingStatus,
      overlaySettings.visible, activeMobileDeviceId, activeIpCameraId, cameras.activeCamera,
      cameras.cameras, ipCameras.ipCameras]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reverse control: commands from mobile → act on desktop state.
  useEffect(() => {
    if (!window.electronAPI?.onMobileControl) return
    return window.electronAPI.onMobileControl(({ action, value }) => {
      switch (action) {
        case 'select_camera': {
          const id = String(value ?? '')
          if (id.startsWith('usb:')) {
            const deviceId = id.slice(4)
            const cam = cameras.cameras.find(c => c.deviceId === deviceId)
            if (cam) {
              setActiveIpCameraId(null); setActiveMobileDeviceId(null)
              cameras.selectCamera(cam)
            }
          } else if (id.startsWith('ip:')) {
            cameras.clearActiveCamera(); setActiveMobileDeviceId(null)
            setActiveIpCameraId(id.slice(3))
          }
          break
        }
        case 'set_zoom': {
          const z = Number(value)
          if (!Number.isFinite(z)) break
          cameras.setCamView({ zoom: z })
          break
        }
        case 'toggle_text': {
          setOverlaySettings(prev => ({ ...prev, visible: typeof value === 'boolean' ? value : !prev.visible }))
          break
        }
        case 'next_slide': slides.nextSlide(); break
        case 'prev_slide': slides.prevSlide(); break
        case 'start_stream':
          stream.startStream({ ...settings.streamConfig, cameraName: cameras.activeCamera?.label || '' })
          break
        case 'stop_stream':     stream.stopStream(); break
        case 'start_recording':
          stream.startRecording({ ...settings.streamConfig, cameraName: cameras.activeCamera?.label || '' })
          break
        case 'stop_recording':  stream.stopRecording(); break
        case 'cut_to_black':    setManualFallback(v => typeof value === 'boolean' ? value : !v); break
      }
    })
  }, [cameras, slides, stream, settings.streamConfig])

  // Listen for presentation window being closed externally
  useEffect(() => {
    if (!window.electronAPI?.onPresentationWindowClosed) return
    const cleanup = window.electronAPI.onPresentationWindowClosed(() => {
      setIsPresentationOpen(false)
    })
    return cleanup
  }, [])

  // Push overlay state to presentation window whenever it changes
  useEffect(() => {
    if (!isPresentationOpen || !window.electronAPI?.updatePresentation) return
    window.electronAPI.updatePresentation({
      ...overlaySettings,
      slideNumber: slides.currentSlideIndex + 1,
      totalSlides: slides.slides.length,
      cameraDeviceId: activeIpCamera ? '' : (cameras.activeCamera?.deviceId || ''),
      ipCameraMjpegUrl: activeIpCamera?.mjpegUrl || '',
      ipCamScale: activeIpCamera?.view.scale ?? 100,
      ipCamX: activeIpCamera?.view.offsetX ?? 0,
      ipCamY: activeIpCamera?.view.offsetY ?? 0,
      ipCamFit: activeIpCamera?.view.fit ?? 'cover',
      ipCamBrightness: activeIpCamera?.view.brightness ?? 100,
      ipCamContrast: activeIpCamera?.view.contrast ?? 100,
      ipCamSaturation: activeIpCamera?.view.saturation ?? 100,
      ipCamFlipH: activeIpCamera?.view.flipH ?? false,
      ipCamFlipV: activeIpCamera?.view.flipV ?? false,
      cameraScale: cameras.camView.scale,
      cameraX: cameras.camView.offsetX,
      cameraY: cameras.camView.offsetY,
      cameraFit: cameras.camView.fit,
      cameraBrightness: cameras.camView.brightness,
      cameraContrast: cameras.camView.contrast,
      cameraSaturation: cameras.camView.saturation,
      cameraFlipH: cameras.camView.flipH,
      cameraFlipV: cameras.camView.flipV,
      cameraZoom: cameras.camView.zoom,
      cameraHardwareZoomSupported: cameras.zoomCaps.supported,
      logoBase64: logoSettings.base64 || '',
      logoPosition: logoSettings.position,
      logoSize: logoSettings.size,
      logoOpacity: logoSettings.opacity,
      logoVisible: logoSettings.visible,
      logoAnimation: logoSettings.animation,
      logoBgColor: logoSettings.bgColor || '#000000',
      logoBgOpacity: logoSettings.bgOpacity ?? 80,
      fallbackBase64: cameraFallback.base64 || '',
      fallbackFit: cameraFallback.fit,
      manualFallback,
    })
  }, [overlaySettings, isPresentationOpen, slides.currentSlideIndex, slides.slides.length, cameras.activeCamera, cameras.camView, cameras.zoomCaps, logoSettings, cameraFallback, manualFallback, activeIpCamera])

  // ── PPTX Controller window ──────────────────────────────────────────────────

  // Listen for controller window being closed
  useEffect(() => {
    if (!window.electronAPI?.onPptxControllerClosed) return
    const cleanup = window.electronAPI.onPptxControllerClosed(() => {
      setIsPptxControllerOpen(false)
    })
    return cleanup
  }, [])

  // Listen for remote commands from the controller window
  useEffect(() => {
    if (!window.electronAPI?.onRemoteSelectSlide) return
    const cleanup = window.electronAPI.onRemoteSelectSlide((index: number) => {
      slides.goToSlide(index)
    })
    return cleanup
  }, [slides.goToSlide])

  useEffect(() => {
    if (!window.electronAPI?.onRemoteToggleText) return
    const cleanup = window.electronAPI.onRemoteToggleText((visible: boolean) => {
      setOverlaySettings((prev) => ({ ...prev, visible }))
    })
    return cleanup
  }, [])

  useEffect(() => {
    if (!window.electronAPI?.onRemoteOpenPptx) return
    const cleanup = window.electronAPI.onRemoteOpenPptx(() => {
      slides.openPptx()
    })
    return cleanup
  }, [slides.openPptx])

  // Push slides data to controller whenever slides change
  useEffect(() => {
    if (!isPptxControllerOpen || !window.electronAPI?.sendSlidesToController) return
    window.electronAPI.sendSlidesToController({
      slides: slides.slides,
      fileName: slides.pptxFileName,
      currentIndex: slides.currentSlideIndex,
      textVisible: overlaySettings.visible,
    })
  }, [isPptxControllerOpen, slides.slides, slides.pptxFileName])

  // Sync current slide index to controller on change
  useEffect(() => {
    if (!isPptxControllerOpen || !window.electronAPI?.syncSlideToController) return
    window.electronAPI.syncSlideToController(slides.currentSlideIndex)
  }, [isPptxControllerOpen, slides.currentSlideIndex])

  const handleTogglePptxController = useCallback(async () => {
    if (!window.electronAPI) return
    if (isPptxControllerOpen) {
      await window.electronAPI.closePptxController()
      setIsPptxControllerOpen(false)
    } else {
      const result = await window.electronAPI.openPptxController()
      if (result?.success) {
        setIsPptxControllerOpen(true)
        // Push current slides immediately
        window.electronAPI.sendSlidesToController({
          slides: slides.slides,
          fileName: slides.pptxFileName,
          currentIndex: slides.currentSlideIndex,
          textVisible: overlaySettings.visible,
        })
      }
    }
  }, [isPptxControllerOpen, slides.slides, slides.pptxFileName, slides.currentSlideIndex, overlaySettings.visible])

  const handleTogglePresentation = useCallback(async () => {
    if (!window.electronAPI) return
    if (isPresentationOpen) {
      await window.electronAPI.closePresentationWindow()
      setIsPresentationOpen(false)
    } else {
      const result = await window.electronAPI.openPresentationWindow(selectedDisplayId)
      if (result?.success) {
        setIsPresentationOpen(true)
        // Send current state immediately
        window.electronAPI.updatePresentation({
          ...overlaySettings,
          slideNumber: slides.currentSlideIndex + 1,
          totalSlides: slides.slides.length,
          cameraDeviceId: activeIpCamera ? '' : (cameras.activeCamera?.deviceId || ''),
          ipCameraMjpegUrl: activeIpCamera?.mjpegUrl || '',
          ipCamScale: activeIpCamera?.view.scale ?? 100,
          ipCamX: activeIpCamera?.view.offsetX ?? 0,
          ipCamY: activeIpCamera?.view.offsetY ?? 0,
          ipCamFit: activeIpCamera?.view.fit ?? 'cover',
          ipCamBrightness: activeIpCamera?.view.brightness ?? 100,
          ipCamContrast: activeIpCamera?.view.contrast ?? 100,
          ipCamSaturation: activeIpCamera?.view.saturation ?? 100,
          ipCamFlipH: activeIpCamera?.view.flipH ?? false,
          ipCamFlipV: activeIpCamera?.view.flipV ?? false,
          cameraScale: cameras.camView.scale,
          cameraX: cameras.camView.offsetX,
          cameraY: cameras.camView.offsetY,
          cameraFit: cameras.camView.fit,
          cameraBrightness: cameras.camView.brightness,
          cameraContrast: cameras.camView.contrast,
          cameraSaturation: cameras.camView.saturation,
          cameraFlipH: cameras.camView.flipH,
          cameraFlipV: cameras.camView.flipV,
          cameraZoom: cameras.camView.zoom,
          cameraHardwareZoomSupported: cameras.zoomCaps.supported,
          logoBase64: logoSettings.base64 || '',
          logoPosition: logoSettings.position,
          logoSize: logoSettings.size,
          logoOpacity: logoSettings.opacity,
          logoVisible: logoSettings.visible,
          logoAnimation: logoSettings.animation,
          fallbackBase64: cameraFallback.base64 || '',
          fallbackFit: cameraFallback.fit,
          manualFallback,
        })
      }
    }
  }, [isPresentationOpen, overlaySettings, slides.currentSlideIndex, slides.slides.length, selectedDisplayId])

  const handleToggleText = useCallback(() => {
    setOverlaySettings((prev) => ({ ...prev, visible: !prev.visible }))
  }, [])

  const handleTextChange = useCallback((text: string) => {
    setOverlaySettings((prev) => ({ ...prev, text }))
  }, [])

  const handleSaveSettings = useCallback(
    async (newSettings: AppSettings) => {
      setSettings(newSettings)
      setOverlaySettings(newSettings.overlaySettings)

      // If logo path changed, load logo data
      let updatedLogoSettings = newSettings.logoSettings
      if (
        newSettings.logoSettings.filePath !== settings.logoSettings.filePath &&
        newSettings.logoSettings.base64
      ) {
        updatedLogoSettings = newSettings.logoSettings
      } else if (newSettings.logoSettings.base64) {
        updatedLogoSettings = newSettings.logoSettings
      }

      setLogoSettings(updatedLogoSettings)
      setCameraFallback(newSettings.cameraFallback)

      // Save to electron-store
      if (window.electronAPI) {
        await window.electronAPI.saveSettings({
          streamConfig: newSettings.streamConfig,
          overlaySettings: newSettings.overlaySettings,
          logoSettings: {
            filePath: updatedLogoSettings.filePath,
            position: updatedLogoSettings.position,
            size: updatedLogoSettings.size,
            opacity: updatedLogoSettings.opacity,
            visible: updatedLogoSettings.visible,
            animation: updatedLogoSettings.animation,
            bgColor: updatedLogoSettings.bgColor || '#000000',
            bgOpacity: updatedLogoSettings.bgOpacity ?? 80,
          },
          cameraFallback: {
            filePath: newSettings.cameraFallback.filePath,
            base64: newSettings.cameraFallback.base64 || '',
            fit: newSettings.cameraFallback.fit,
          },
          hotkeys: newSettings.hotkeys,
        })
      }
    },
    [settings.logoSettings.filePath]
  )

  const handleStartStream = useCallback(async () => {
    await stream.startStream({
      ...settings.streamConfig,
      cameraName: cameras.activeCamera?.label || '',
    })
  }, [settings.streamConfig, cameras.activeCamera])

  const handleStartRecording = useCallback(async () => {
    await stream.startRecording({
      ...settings.streamConfig,
      cameraName: cameras.activeCamera?.label || '',
    })
  }, [settings.streamConfig, cameras.activeCamera])

  if (!isInitialized) {
    return (
      <div className="app-loading">
        <div className="app-loading__spinner" />
        <p>Loading Church Live Stream Studio...</p>
      </div>
    )
  }

  return (
    <div className="app" dir="ltr">
      {/* Header */}
      <header className="app-header">
        <div className="app-header__brand">
          <div className="app-header__logo">
            {logoSettings.base64
              ? <img src={logoSettings.base64} alt="logo" className="app-header__logo-img" />
              : '✝️'}
          </div>
          <div className="app-header__titles">
            <h1 className="app-header__title">St. Mina the Great Martyr Church — Live Stream</h1>
            <p className="app-header__subtitle">كنيسة الشهيد العظيم مارمينا — البث المباشر</p>
          </div>
        </div>

        <div className="app-header__status">
          {stream.streamStatus === 'live' && (
            <div className="live-indicator">
              <span className="live-indicator__dot" />
              <span className="live-indicator__label">LIVE</span>
              <span className="live-indicator__time">
                {stream.formatDuration(stream.streamDuration)}
              </span>
            </div>
          )}
          {stream.streamStatus === 'connecting' && (
            <div className="live-indicator live-indicator--connecting">
              <span className="live-indicator__dot live-indicator__dot--pulse" />
              <span className="live-indicator__label">Connecting...</span>
            </div>
          )}
          {stream.recordingStatus === 'recording' && (
            <div className="recording-indicator">
              <span className="recording-indicator__dot" />
              <span>REC</span>
            </div>
          )}
        </div>

        <div className="app-header__actions">
          <div className="app-header__author">Made by Bahaa Magdy</div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setIsSettingsOpen(true)}
            title="Settings"
          >
            ⚙️ Settings
          </button>
        </div>
      </header>

      {/* Main content area */}
      <main className="app-main">
        {/* Left: Camera Panel — USB, IP, and mobile phones share the same grid */}
        <div className="app-main__left">
          <CameraPanel
            cameras={cameras.cameras}
            activeCamera={cameras.activeCamera}
            activeCameraStream={cameras.activeCameraStream}
            onSelectCamera={cam => { setActiveIpCameraId(null); setActiveWebRTCDeviceId(null); setActiveMobileDeviceId(null); cameras.selectCamera(cam) }}
            onRefresh={cameras.refreshCameras}
            onRemoveCamera={cameras.removeCamera}
            onReorderCameras={cameras.reorderCameras}
            onAddCamera={cameras.addCamera}
            isLoading={cameras.isLoading}
            error={cameras.cameraError}
            camView={cameras.camView}
            onCamViewChange={patch => cameras.setCamView(patch)}
            zoomCaps={cameras.zoomCaps}
            manualFallback={manualFallback}
            onToggleManualFallback={() => setManualFallback(v => !v)}
            disconnectedIds={cameras.disconnectedIds}
            switchTransition={switchTransition}
            onSwitchTransitionChange={setSwitchTransition}
            ipCameras={ipCameras.ipCameras}
            activeIpCamera={activeIpCamera}
            onSelectIpCamera={cam => { cameras.clearActiveCamera(); setActiveWebRTCDeviceId(null); setActiveMobileDeviceId(null); setActiveIpCameraId(cam.id) }}
            onDisconnectIpCamera={id => { ipCameras.disconnectCamera(id); if (activeIpCameraId === id) setActiveIpCameraId(null) }}
            onReconnectIpCamera={ipCameras.reconnectCamera}
            onSaveAndReconnect={ipCameras.saveAndReconnect}
            onUpdateIpCamView={ipCameras.updateIpCamView}
            onMobileCamMjpegUrl={setMobileCamMjpegUrl}
            webrtcCameras={webrtcCameraList}
            activeWebRTCDeviceId={activeWebRTCDeviceId}
            onSelectWebRTCCamera={cam => { cameras.clearActiveCamera(); setActiveIpCameraId(null); setActiveMobileDeviceId(null); setActiveWebRTCDeviceId(cam.deviceId) }}
            onDisconnectWebRTCCamera={id => { if (activeWebRTCDeviceId === id) setActiveWebRTCDeviceId(null) }}
            onWebRTCSendCommand={(deviceId, action, value) => {
              // The phone applies the zoom at the camera sensor, so the WebRTC
              // track the desktop receives is already zoomed. No CSS-scale hack
              // needed — the value is saved as camView.zoom by CameraPanel.
              window.electronAPI?.webrtcSendCommand?.(deviceId, action, value)
            }}
            webrtcCamViewMap={webrtcCamViewMap}
            onWebRTCCamViewChange={setWebrtcCamView}
            webrtcQrDataUrl={webrtcQrDataUrl}
            webrtcServerUrl={webrtcServerUrl}
            mobileBridgeDevices={mobileCameras.devices}
            activeMobileBridgeDeviceId={activeMobileDeviceId}
            mobileBridgeFrozenIds={mobileCameras.frozenIds}
            mobileBridgeViews={mobileCameras.views}
            mobileBridgeMjpegUrlFor={mobileCameras.mjpegUrlFor}
            mobileBridgePairingQrUrl={mobileCameras.connection?.qrDataUrl}
            mobileBridgePairingIp={mobileCameras.connection?.ip}
            mobileBridgePairingControlPort={mobileCameras.connection?.controlPort}
            onSelectMobileBridgeDevice={id => {
              cameras.clearActiveCamera()
              setActiveIpCameraId(null)
              setActiveWebRTCDeviceId(null)
              setActiveMobileDeviceId(id)
            }}
            onMobileBridgeSendCommand={mobileCameras.sendCommand}
            onMobileBridgeUpdateView={mobileCameras.updateView}
            onMobileBridgeApplyPreset={mobileCameras.applyPreset}
          />
        </div>

        {/* Center: Main Preview */}
        <div className="app-main__center">
          <MainPreview
            cameraDeviceId={activeMobileDeviceId || activeWebRTCDeviceId || activeIpCamera ? '' : (cameras.activeCamera?.deviceId || '')}
            ipCameraMjpegUrl={activeWebRTCDeviceId || activeMobileDeviceId ? undefined : activeIpCamera?.mjpegUrl}
            ipCamView={activeIpCamera?.view}
            webrtcStream={activeWebRTCDeviceId ? (webrtcCameraList.find(c => c.deviceId === activeWebRTCDeviceId)?.stream ?? null) : null}
            webrtcCamView={activeWebRTCDeviceId ? activeWebRTCCamView : undefined}
            mobileMjpegUrl={activeMobileDeviceId ? activeMobileMjpegUrl : undefined}
            mobileView={activeMobileDeviceId ? activeMobileView : undefined}
            mobileOrientation={activeMobileDeviceId
              ? mobileCameras.devices.find(d => d.deviceId === activeMobileDeviceId)?.orientation
              : undefined}
            overlaySettings={overlaySettings}
            logoSettings={logoSettings}
            cameraFallback={cameraFallback}
            manualFallback={manualFallback}
            switchTransition={switchTransition}
            camView={cameras.camView}
            hardwareZoomSupported={cameras.zoomCaps.supported}
            videoElMountRef={videoElMountRef}
          />
        </div>

        {/* Right: File Library + Presentation controls */}
        <div className="app-main__right">
          <div className="panel file-library">
            <div className="panel__header">
              <h3 className="panel__title">
                <span className="panel__title-icon">📂</span>
                Presentations
              </h3>
              <div className="panel__header-actions">
                <button
                  type="button"
                  className="btn btn--icon btn--sm"
                  title="Add files"
                  onClick={slides.addFiles}
                >＋ Add</button>
              </div>
            </div>

            <div className="panel__content file-library__content">
              {slides.fileLibrary.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state__icon">📄</div>
                  <p>No files loaded</p>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={slides.addFiles}
                  >Add Files</button>
                </div>
              ) : (
                <div className="file-library__list">
                  {slides.fileLibrary.map(f => {
                    const isActive = f.id === slides.activeFileId
                    const icon = f.fileType === 'pdf' ? '📕'
                      : f.fileType === 'docx' || f.fileType === 'doc' ? '📝'
                      : f.fileType === 'xlsx' || f.fileType === 'xls' ? '📊'
                      : '📊'
                    return (
                      <div
                        key={f.id}
                        className={`file-library__item ${isActive ? 'file-library__item--active' : ''}`}
                        onClick={() => slides.selectFile(f.id)}
                        title={f.fileName}
                      >
                        <span className="file-library__icon">{icon}</span>
                        <div className="file-library__info">
                          <span className="file-library__name">{f.fileName}</span>
                          <span className="file-library__meta">{f.slides.length} slides</span>
                        </div>
                        {isActive && (
                          <span className="file-library__active-badge">Active</span>
                        )}
                        <button
                          type="button"
                          className="file-library__remove"
                          title="Remove"
                          onClick={e => { e.stopPropagation(); slides.removeFile(f.id) }}
                        >×</button>
                      </div>
                    )
                  })}
                </div>
              )}

              {slides.activeFile && (
                <div className="file-library__current-info">
                  <span className="file-library__current-label">
                    Slide {slides.currentSlideIndex + 1} / {slides.slides.length}
                  </span>
                </div>
              )}
            </div>

            <div className="panel__footer file-library__footer">
              <button
                type="button"
                className={`pptx-launcher__btn ${isPptxControllerOpen ? 'pptx-launcher__btn--open' : ''}`}
                onClick={handleTogglePptxController}
              >
                {isPptxControllerOpen ? '✕ Close Controller' : '🖥 Controller'}
              </button>

              {!isPresentationOpen && displays.length > 1 && (
                <select
                  className="pptx-launcher__display-select"
                  title="Select display"
                  value={selectedDisplayId ?? ''}
                  onChange={(e) => setSelectedDisplayId(Number(e.target.value))}
                >
                  {displays.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              )}

              <button
                type="button"
                className={`pptx-launcher__btn ${isPresentationOpen ? 'pptx-launcher__btn--live' : 'pptx-launcher__btn--present'}`}
                onClick={handleTogglePresentation}
              >
                {isPresentationOpen ? '✕ Close Screen' : '🖥 Present'}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Text Controls Bar */}
      <TextControls
        overlaySettings={overlaySettings}
        currentSlideText={slides.getCurrentText()}
        onToggleText={handleToggleText}
        onTextChange={handleTextChange}
        onNextSlide={slides.nextSlide}
        onPrevSlide={slides.prevSlide}
        currentSlideIndex={slides.currentSlideIndex}
        totalSlides={slides.slides.length}
        onOverlayChange={(patch) => setOverlaySettings(prev => ({ ...prev, ...patch }))}
      />

      {/* Stream Controls Footer */}
      <StreamControls
        streamStatus={stream.streamStatus}
        recordingStatus={stream.recordingStatus}
        streamDuration={stream.streamDuration}
        streamError={stream.streamError}
        streamConfig={settings.streamConfig}
        activeCamera={cameras.activeCamera}
        onStartStream={handleStartStream}
        onStopStream={stream.stopStream}
        onStartRecording={handleStartRecording}
        onStopRecording={stream.stopRecording}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenPptx={slides.openPptx}
        onOpenVideoOverlay={() => setIsVideoOverlayOpen(true)}
        formatDuration={stream.formatDuration}
        videoVisible={videoQuick.visible}
        videoOpacity={videoQuick.opacity}
        videoHasActive={videoQuick.hasActive}
        videoIsPlaying={videoQuick.isPlaying}
        onVideoToggleVisible={() => {
          const next = !videoQuick.visible
          setVideoQuick(prev => ({ ...prev, visible: next }))
          videoUpdateSettingsRef.current?.({ visible: next })
        }}
        onVideoOpacityChange={opacity => {
          setVideoQuick(prev => ({ ...prev, opacity }))
          videoUpdateSettingsRef.current?.({ opacity })
        }}
        onVideoPlayPause={() => {
          if (videoQuick.isPlaying) videoPauseRef.current?.()
          else videoPlayRef.current?.()
        }}
        onVideoStop={() => videoStopRef.current?.()}
      />

      {/* Video Overlay — always mounted, shown as popup or hidden */}
      <div className={isVideoOverlayOpen ? 'vo-popup-backdrop' : 'vo-hidden-mount'}
        onClick={isVideoOverlayOpen ? () => setIsVideoOverlayOpen(false) : undefined}
      >
        <div className={isVideoOverlayOpen ? 'vo-popup' : ''} onClick={e => e.stopPropagation()}>
          {isVideoOverlayOpen && (
            <button
              type="button"
              className="vo-popup__close"
              onClick={() => setIsVideoOverlayOpen(false)}
              title="Close"
            >✕</button>
          )}
          <VideoOverlayWidget
            onReady={handleVideoReady}
            onQuickUpdate={(visible, opacity, hasActive, isPlaying) =>
              setVideoQuick({ visible, opacity, hasActive, isPlaying })
            }
          />
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        settings={{
          ...settings,
          overlaySettings,
          logoSettings,
          cameraFallback,
        }}
        onSave={handleSaveSettings}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  )
}

export default App
