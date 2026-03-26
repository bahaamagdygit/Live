import React, { useState, useEffect, useCallback } from 'react'
import { CameraPanel } from './components/CameraPanel'
import { MainPreview } from './components/MainPreview'
import { SlidesPanel } from './components/SlidesPanel'
import { TextControls } from './components/TextControls'
import { StreamControls } from './components/StreamControls'
import { SettingsModal } from './components/SettingsModal'
import { useCameras } from './hooks/useCameras'
import { useStream } from './hooks/useStream'
import { useSlides } from './hooks/useSlides'
import { AppSettings, OverlaySettings, LogoSettings, StreamConfig } from './types'
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
  },
  logoSettings: {
    filePath: '',
    position: 'top-right',
    size: 120,
    opacity: 80,
    visible: false,
  },
  hotkeys: {
    toggleText: 'Space',
    nextSlide: 'Right',
    prevSlide: 'Left',
    cam1: 'F1',
    cam2: 'F2',
    cam3: 'F3',
    cam4: 'F4',
  },
}

function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>(
    DEFAULT_SETTINGS.overlaySettings
  )
  const [logoSettings, setLogoSettings] = useState<LogoSettings>(DEFAULT_SETTINGS.logoSettings)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)

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
            },
            logoSettings: { ...DEFAULT_SETTINGS.logoSettings, ...result.settings.logoSettings },
            hotkeys: { ...DEFAULT_SETTINGS.hotkeys, ...result.settings.hotkeys },
          }
          setSettings(loaded)
          setOverlaySettings(loaded.overlaySettings)
          setLogoSettings(loaded.logoSettings)

          // Load logo data if path exists
          if (loaded.logoSettings.filePath && !loaded.logoSettings.base64) {
            const logoData = await window.electronAPI.getLogoData(loaded.logoSettings.filePath)
            if (logoData?.success && logoData.base64) {
              setLogoSettings((prev) => ({ ...prev, base64: logoData.base64 }))
            }
          }
        }
      } catch (err) {
        console.error('Failed to load settings:', err)
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
          <div className="app-header__logo">✝️</div>
          <div className="app-header__titles">
            <h1 className="app-header__title">Church Live Stream Studio</h1>
            <p className="app-header__subtitle">استوديو البث المباشر للكنيسة</p>
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
          <button
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
          />
        </div>

        {/* Center: Main Preview */}
        <div className="app-main__center">
          <MainPreview
            activeStream={cameras.activeCameraStream}
            overlaySettings={overlaySettings}
            logoSettings={logoSettings}
            cameraError={cameras.cameraError}
          />
        </div>

        {/* Right: Slides Panel */}
        <div className="app-main__right">
          <SlidesPanel
            slides={slides.slides}
            currentSlideIndex={slides.currentSlideIndex}
            onSelectSlide={slides.goToSlide}
            onOpenPptx={slides.openPptx}
            isLoading={slides.isLoading}
            error={slides.error}
            pptxFileName={slides.pptxFileName}
          />
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
        }}
        onSave={handleSaveSettings}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  )
}

export default App
