import { useState, useEffect, useCallback } from 'react'
import { CameraPanel } from './components/CameraPanel'
import { MainPreview } from './components/MainPreview'
import { TextControls } from './components/TextControls'
import { StreamControls } from './components/StreamControls'
import { SettingsModal } from './components/SettingsModal'
import { useCameras } from './hooks/useCameras'
import { useStream } from './hooks/useStream'
import { useSlides } from './hooks/useSlides'
import { AppSettings, OverlaySettings, LogoSettings, CameraFallbackSettings } from './types'
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
    line2FontSize: 28,
    line2FontFamily: 'Arial',
    line2TextColor: '#ffffff',
  },
  logoSettings: {
    filePath: '',
    position: 'top-right',
    size: 120,
    opacity: 80,
    visible: false,
    animation: 'none' as const,
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isPresentationOpen, setIsPresentationOpen] = useState(false)
  const [isPptxControllerOpen, setIsPptxControllerOpen] = useState(false)

  const cameras = useCameras()
  const stream = useStream()
  const slides = useSlides()

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
          // Load fallback image data if path exists
          if (loaded.cameraFallback.filePath && !loaded.cameraFallback.base64) {
            const imgData = await window.electronAPI.getLogoData(loaded.cameraFallback.filePath)
            if (imgData?.success && imgData.base64) {
              setCameraFallback((prev) => ({ ...prev, base64: imgData.base64 }))
            }
          }
        }
      } catch (err) {
      } finally {
        setIsInitialized(true)
      }
    }
    loadSettings()
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
          if (cameras.cameras[0]) cameras.selectCamera(cameras.cameras[0])
          break
        case 'cam-2':
          if (cameras.cameras[1]) cameras.selectCamera(cameras.cameras[1])
          break
        case 'cam-3':
          if (cameras.cameras[2]) cameras.selectCamera(cameras.cameras[2])
          break
        case 'cam-4':
          if (cameras.cameras[3]) cameras.selectCamera(cameras.cameras[3])
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

  // Sync overlay text with current slide
  useEffect(() => {
    const text = slides.getCurrentText()
    setOverlaySettings((prev) => ({ ...prev, text }))
  }, [slides.currentSlideIndex, slides.slides])

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
      cameraDeviceId: cameras.activeCamera?.deviceId || '',
      cameraScale: cameras.camView.scale,
      cameraX: cameras.camView.offsetX,
      cameraY: cameras.camView.offsetY,
      cameraFit: cameras.camView.fit,
      cameraBrightness: cameras.camView.brightness,
      cameraContrast: cameras.camView.contrast,
      cameraSaturation: cameras.camView.saturation,
      cameraFlipH: cameras.camView.flipH,
      cameraFlipV: cameras.camView.flipV,
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
  }, [overlaySettings, isPresentationOpen, slides.currentSlideIndex, slides.slides.length, cameras.activeCamera, cameras.camView, logoSettings, cameraFallback, manualFallback])

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
      const result = await window.electronAPI.openPresentationWindow()
      if (result?.success) {
        setIsPresentationOpen(true)
        // Send current state immediately
        window.electronAPI.updatePresentation({
          ...overlaySettings,
          slideNumber: slides.currentSlideIndex + 1,
          totalSlides: slides.slides.length,
          cameraDeviceId: cameras.activeCamera?.deviceId || '',
          cameraScale: cameras.camView.scale,
          cameraX: cameras.camView.offsetX,
          cameraY: cameras.camView.offsetY,
          cameraFit: cameras.camView.fit,
          cameraBrightness: cameras.camView.brightness,
          cameraContrast: cameras.camView.contrast,
          cameraSaturation: cameras.camView.saturation,
          cameraFlipH: cameras.camView.flipH,
          cameraFlipV: cameras.camView.flipV,
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
  }, [isPresentationOpen, overlaySettings, slides.currentSlideIndex, slides.slides.length])

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
          },
          cameraFallback: {
            filePath: newSettings.cameraFallback.filePath,
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
        {/* Left: Camera Panel */}
        <div className="app-main__left">
          <CameraPanel
            cameras={cameras.cameras}
            activeCamera={cameras.activeCamera}
            onSelectCamera={cameras.selectCamera}
            onRefresh={cameras.refreshCameras}
            isLoading={cameras.isLoading}
            error={cameras.cameraError}
            camView={cameras.camView}
            onCamViewChange={patch => cameras.setCamView(patch)}
            manualFallback={manualFallback}
            onToggleManualFallback={() => setManualFallback(v => !v)}
          />
        </div>

        {/* Center: Main Preview */}
        <div className="app-main__center">
          <MainPreview
            activeStream={cameras.activeCameraStream}
            overlaySettings={overlaySettings}
            logoSettings={logoSettings}
            cameraError={cameras.cameraError}
            cameraFallback={cameraFallback}
            manualFallback={manualFallback}
            camView={cameras.camView}
          />
        </div>

        {/* Right: Camera controls + PowerPoint controller launcher */}
        <div className="app-main__right">
          <div className="panel pptx-launcher">
            <div className="panel__header">
              <h3 className="panel__title">
                <span className="panel__title-icon">📊</span>
                PowerPoint
              </h3>
            </div>
            <div className="pptx-launcher__body">
              {slides.pptxFileName ? (
                <div className="pptx-launcher__loaded">
                  <div className="pptx-launcher__file-icon">
                    {slides.fileType === 'pdf' ? '📕' :
                      slides.fileType === 'docx' || slides.fileType === 'doc' ? '📝' :
                        slides.fileType === 'xlsx' || slides.fileType === 'xls' ? '📊' :
                          '📊'}
                  </div>
                  <div className="pptx-launcher__file-name" title={slides.pptxFileName}>
                    {slides.pptxFileName}
                  </div>
                  <div className="pptx-launcher__count">{slides.slides.length} slides</div>
                  <div className="pptx-launcher__current">
                    Slide {slides.currentSlideIndex + 1} / {slides.slides.length}
                  </div>
                </div>
              ) : (
                <div className="pptx-launcher__empty">
                  <div className="pptx-launcher__empty-icon">📊</div>
                  <p>No presentation loaded</p>
                </div>
              )}

              <button
                type="button"
                className={`pptx-launcher__btn ${isPptxControllerOpen ? 'pptx-launcher__btn--open' : ''}`}
                onClick={handleTogglePptxController}
              >
                {isPptxControllerOpen ? '✕ Close Controller' : '🖥 Open Controller'}
              </button>

              <button
                type="button"
                className="pptx-launcher__btn pptx-launcher__btn--secondary"
                onClick={slides.openPptx}
              >
                📂 Open File
              </button>

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
        formatDuration={stream.formatDuration}
      />

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
