import React, { useState, useEffect } from 'react'
import { AppSettings, StreamConfig, OverlaySettings, LogoSettings, CameraFallbackSettings } from '../types'

interface SettingsModalProps {
  isOpen: boolean
  settings: AppSettings
  onSave: (settings: AppSettings) => void
  onClose: () => void
}

type TabId = 'stream' | 'overlay' | 'logo' | 'camera' | 'hotkeys'

const FONT_FAMILIES = [
  'Arial',
  'Arial Black',
  'Georgia',
  'Times New Roman',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Impact',
  'Comic Sans MS',
  'Courier New',
  // Arabic fonts
  'Cairo',
  'Tajawal',
  'Lalezar',
  'Reem Kufi',
  'Noto Kufi Arabic',
  'Amiri',
]

export function SettingsModal({ isOpen, settings, onSave, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('stream')
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings)
  const [logoPreview, setLogoPreview] = useState<string>('')
  const [logoLoading, setLogoLoading] = useState(false)
  const [fallbackPreview, setFallbackPreview] = useState<string>('')
  const [fallbackLoading, setFallbackLoading] = useState(false)

  useEffect(() => {
    setLocalSettings(settings)
    setLogoPreview(settings.logoSettings.base64 || '')
    setFallbackPreview(settings.cameraFallback.base64 || '')
  }, [settings, isOpen])

  if (!isOpen) return null

  const updateStream = (patch: Partial<StreamConfig>) => {
    setLocalSettings((prev) => ({
      ...prev,
      streamConfig: { ...prev.streamConfig, ...patch },
    }))
  }

  const updateOverlay = (patch: Partial<OverlaySettings>) => {
    setLocalSettings((prev) => ({
      ...prev,
      overlaySettings: { ...prev.overlaySettings, ...patch },
    }))
  }

  const updateLogo = (patch: Partial<LogoSettings>) => {
    setLocalSettings((prev) => ({
      ...prev,
      logoSettings: { ...prev.logoSettings, ...patch },
    }))
  }

  const updateFallback = (patch: Partial<CameraFallbackSettings>) => {
    setLocalSettings((prev) => ({
      ...prev,
      cameraFallback: { ...prev.cameraFallback, ...patch },
    }))
  }

  const handleSelectFallback = async () => {
    if (!window.electronAPI) return
    setFallbackLoading(true)
    try {
      const result = await window.electronAPI.selectLogo()
      if (result.success && result.filePath) {
        const imgData = await window.electronAPI.getLogoData(result.filePath)
        if (imgData.success && imgData.base64) {
          updateFallback({ filePath: result.filePath, base64: imgData.base64 })
          setFallbackPreview(imgData.base64)
        }
      }
    } finally {
      setFallbackLoading(false)
    }
  }

  const handleRemoveFallback = () => {
    updateFallback({ filePath: '', base64: '' })
    setFallbackPreview('')
  }

  const updateHotkey = (key: string, value: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      hotkeys: { ...prev.hotkeys, [key]: value },
    }))
  }

  const handleSelectLogo = async () => {
    if (!window.electronAPI) return
    setLogoLoading(true)
    try {
      const result = await window.electronAPI.selectLogo()
      if (result.success && result.filePath) {
        updateLogo({ filePath: result.filePath })
        const logoData = await window.electronAPI.getLogoData(result.filePath)
        if (logoData.success && logoData.base64) {
          updateLogo({ filePath: result.filePath, base64: logoData.base64 })
          setLogoPreview(logoData.base64)
        }
      }
    } finally {
      setLogoLoading(false)
    }
  }

  const handleSave = () => {
    onSave(localSettings)
    onClose()
  }

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'stream', label: 'Stream', icon: '📡' },
    { id: 'overlay', label: 'Overlay', icon: '💬' },
    { id: 'logo', label: 'Logo', icon: '🖼️' },
    { id: 'camera', label: 'Camera', icon: '🎥' },
    { id: 'hotkeys', label: 'Hotkeys', icon: '⌨️' },
  ]

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">⚙️ Settings</h2>
          <button className="modal__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal__tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`modal__tab ${activeTab === tab.id ? 'modal__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="modal__body">
          {/* STREAM TAB */}
          {activeTab === 'stream' && (
            <div className="settings-section">
              <h3 className="settings-section__title">RTMP Stream Settings</h3>

              <div className="form-group">
                <label className="form-label">RTMP Server URL</label>
                <input
                  className="form-input"
                  type="text"
                  value={localSettings.streamConfig.rtmpUrl}
                  onChange={(e) => updateStream({ rtmpUrl: e.target.value })}
                  placeholder="rtmp://live.youtube.com/live2"
                />
                <span className="form-hint">e.g. rtmp://live.youtube.com/live2 or rtmp://live.twitch.tv/app</span>
              </div>

              <div className="form-group">
                <label className="form-label">Stream Key</label>
                <input
                  className="form-input form-input--secret"
                  type="password"
                  value={localSettings.streamConfig.streamKey}
                  onChange={(e) => updateStream({ streamKey: e.target.value })}
                  placeholder="Your stream key (kept secret)"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Resolution</label>
                  <select
                    className="form-select"
                    value={localSettings.streamConfig.resolution}
                    onChange={(e) =>
                      updateStream({ resolution: e.target.value as '720p' | '1080p' })
                    }
                  >
                    <option value="720p">720p (1280×720)</option>
                    <option value="1080p">1080p (1920×1080)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Frame Rate</label>
                  <select
                    className="form-select"
                    value={localSettings.streamConfig.fps}
                    onChange={(e) =>
                      updateStream({ fps: Number(e.target.value) as 30 | 60 })
                    }
                  >
                    <option value={30}>30 FPS</option>
                    <option value={60}>60 FPS</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Bitrate (kbps)</label>
                  <input
                    className="form-input"
                    type="number"
                    min={500}
                    max={10000}
                    step={500}
                    value={localSettings.streamConfig.bitrate}
                    onChange={(e) => updateStream({ bitrate: Number(e.target.value) })}
                  />
                  <span className="form-hint">Recommended: 3000-6000 kbps</span>
                </div>
              </div>

              <div className="settings-note">
                <span>⚠️</span> FFmpeg must be installed and in your PATH for streaming to work.
                <br />
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    window.electronAPI?.openExternal('https://ffmpeg.org/download.html')
                  }}
                >
                  Download FFmpeg →
                </a>
              </div>
            </div>
          )}

          {/* OVERLAY TAB */}
          {activeTab === 'overlay' && (
            <div className="settings-section">
              <h3 className="settings-section__title">Text Overlay Settings</h3>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Font Family</label>
                  <select
                    className="form-select"
                    value={localSettings.overlaySettings.fontFamily}
                    onChange={(e) => updateOverlay({ fontFamily: e.target.value })}
                  >
                    {FONT_FAMILIES.map((f) => (
                      <option key={f} value={f} style={{ fontFamily: f }}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Font Size (px)</label>
                  <input
                    className="form-input"
                    type="number"
                    min={12}
                    max={120}
                    value={localSettings.overlaySettings.fontSize}
                    onChange={(e) => updateOverlay({ fontSize: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Line 1 (Header)</label>
                  <label className="form-check">
                    <input
                      type="checkbox"
                      checked={localSettings.overlaySettings.line1Bold ?? true}
                      onChange={(e) => updateOverlay({ line1Bold: e.target.checked })}
                    />
                    <span className="text-bold">Bold</span>
                  </label>
                </div>
                <div className="form-group">
                  <label className="form-label">Line 2 (Subtitle)</label>
                  <label className="form-check">
                    <input
                      type="checkbox"
                      checked={localSettings.overlaySettings.line2Bold ?? false}
                      onChange={(e) => updateOverlay({ line2Bold: e.target.checked })}
                    />
                    <span className="text-bold">Bold</span>
                  </label>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Text Color</label>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      className="form-color"
                      value={localSettings.overlaySettings.textColor}
                      onChange={(e) => updateOverlay({ textColor: e.target.value })}
                    />
                    <span className="color-value">{localSettings.overlaySettings.textColor}</span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Background Color</label>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      className="form-color"
                      value={localSettings.overlaySettings.bgColor}
                      onChange={(e) => updateOverlay({ bgColor: e.target.value })}
                    />
                    <span className="color-value">{localSettings.overlaySettings.bgColor}</span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Background Opacity ({localSettings.overlaySettings.bgOpacity}%)</label>
                  <input
                    type="range"
                    className="form-range"
                    min={0}
                    max={100}
                    value={localSettings.overlaySettings.bgOpacity}
                    onChange={(e) => updateOverlay({ bgOpacity: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Position</label>
                  <select
                    className="form-select"
                    value={localSettings.overlaySettings.position}
                    onChange={(e) =>
                      updateOverlay({
                        position: e.target.value as 'top' | 'center' | 'bottom',
                      })
                    }
                  >
                    <option value="top">Top</option>
                    <option value="center">Center</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Alignment</label>
                  <select
                    className="form-select"
                    value={localSettings.overlaySettings.alignment}
                    onChange={(e) =>
                      updateOverlay({
                        alignment: e.target.value as 'left' | 'center' | 'right',
                      })
                    }
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right (RTL)</option>
                  </select>
                </div>
              </div>

              {/* Preview */}
              <div className="overlay-preview">
                <div
                  className="overlay-preview__box"
                  style={{
                    fontSize: Math.min(localSettings.overlaySettings.fontSize, 24),
                    fontFamily: localSettings.overlaySettings.fontFamily,
                    color: localSettings.overlaySettings.textColor,
                    backgroundColor: `${localSettings.overlaySettings.bgColor}${Math.round(
                      (localSettings.overlaySettings.bgOpacity / 100) * 255
                    )
                      .toString(16)
                      .padStart(2, '0')}`,
                    textAlign: localSettings.overlaySettings.alignment,
                  }}
                >
                  باسم الآب والابن والروح القدس، الإله الواحد. آمين                  <br />
                  the Name of the Father, and of the Son, and of the Holy Spirit, One God. Amen                </div>
              </div>
            </div>
          )}

          {/* LOGO TAB */}
          {activeTab === 'logo' && (
            <div className="settings-section">
              <h3 className="settings-section__title">Logo / Watermark</h3>

              <div className="logo-upload-area">
                {logoPreview ? (
                  <div className="logo-preview">
                    <img src={logoPreview} alt="Logo preview" className="logo-preview__img" />
                    <button
                      className="btn btn--secondary btn--sm"
                      onClick={() => {
                        setLogoPreview('')
                        updateLogo({ filePath: '', base64: undefined })
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="logo-upload-placeholder" onClick={handleSelectLogo}>
                    <span className="logo-upload-placeholder__icon">🖼️</span>
                    <span>Click to select logo image</span>
                    <span className="form-hint">PNG, JPG, SVG supported</span>
                  </div>
                )}

                <button
                  className="btn btn--primary"
                  onClick={handleSelectLogo}
                  disabled={logoLoading}
                >
                  {logoLoading ? 'Loading...' : logoPreview ? 'Change Logo' : 'Select Logo'}
                </button>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Position</label>
                  <select
                    className="form-select"
                    value={localSettings.logoSettings.position}
                    onChange={(e) =>
                      updateLogo({
                        position: e.target.value as LogoSettings['position'],
                      })
                    }
                  >
                    <option value="top-left">Top Left</option>
                    <option value="top-center">Top Center</option>
                    <option value="top-right">Top Right</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="bottom-right">Bottom Right</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Size (px): {localSettings.logoSettings.size}</label>
                  <input
                    type="range"
                    className="form-range"
                    min={40}
                    max={300}
                    value={localSettings.logoSettings.size}
                    onChange={(e) => updateLogo({ size: Number(e.target.value) })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Opacity ({localSettings.logoSettings.opacity}%)</label>
                  <input
                    type="range"
                    className="form-range"
                    min={10}
                    max={100}
                    value={localSettings.logoSettings.opacity}
                    onChange={(e) => updateLogo({ opacity: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Animation</label>
                  <select
                    className="form-select"
                    title="Logo animation"
                    value={localSettings.logoSettings.animation ?? 'none'}
                    onChange={(e) =>
                      updateLogo({ animation: e.target.value as LogoSettings['animation'] })
                    }
                  >
                    <option value="none">None</option>
                    <option value="rotate-right">Rotate Right</option>
                    <option value="rotate-left">Rotate Left</option>
                    <option value="flip-y">Flip Y (reflect left-right)</option>
                    <option value="flip-x">Flip X (reflect up-down)</option>
                    <option value="pulse">Pulse</option>
                    <option value="bounce">Bounce</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-check">
                  <input
                    type="checkbox"
                    checked={localSettings.logoSettings.visible}
                    onChange={(e) => updateLogo({ visible: e.target.checked })}
                  />
                  <span>Show logo on preview</span>
                </label>
              </div>
            </div>
          )}

          {/* CAMERA TAB */}
          {activeTab === 'camera' && (
            <div className="settings-section">
              <h3 className="settings-section__title">Camera Fallback Background</h3>
              <p className="settings-section__desc">
                This image is shown on the presentation screen when the camera is disconnected, has an error, or is not available.
              </p>

              {/* Preview */}
              <div className="logo-preview-wrap" style={{ marginBottom: 16 }}>
                {fallbackPreview ? (
                  <img
                    src={fallbackPreview}
                    alt="Fallback preview"
                    style={{ width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 6, background: '#000' }}
                  />
                ) : (
                  <div className="logo-preview-empty" style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f1a', borderRadius: 6, color: '#555', fontSize: 13 }}>
                    No fallback image selected
                  </div>
                )}
              </div>

              <div className="form-row">
                <button type="button" className="btn btn--secondary" onClick={handleSelectFallback} disabled={fallbackLoading}>
                  {fallbackLoading ? 'Loading...' : fallbackPreview ? 'Change Image' : 'Select Image'}
                </button>
                {fallbackPreview && (
                  <button type="button" className="btn btn--ghost" onClick={handleRemoveFallback}>
                    Remove
                  </button>
                )}
              </div>

              {fallbackPreview && (
                <div className="form-row" style={{ marginTop: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Image Fit</label>
                    <select
                      className="form-select"
                      title="Fallback image fit"
                      value={localSettings.cameraFallback.fit}
                      onChange={e => updateFallback({ fit: e.target.value as CameraFallbackSettings['fit'] })}
                    >
                      <option value="cover">Cover (fill screen)</option>
                      <option value="contain">Contain (letterbox)</option>
                      <option value="fill">Stretch</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* HOTKEYS TAB */}
          {activeTab === 'hotkeys' && (
            <div className="settings-section">
              <h3 className="settings-section__title">Keyboard Shortcuts</h3>
              <p className="settings-section__desc">
                These are global hotkeys that work even when the app is not focused.
              </p>

              {[
                { key: 'toggleText', label: 'Toggle Text Overlay', default: 'Space' },
                { key: 'nextSlide', label: 'Next Slide', default: 'Right' },
                { key: 'prevSlide', label: 'Previous Slide', default: 'Left' },
                { key: 'cam1', label: 'Switch to Camera 1', default: 'F1' },
                { key: 'cam2', label: 'Switch to Camera 2', default: 'F2' },
                { key: 'cam3', label: 'Switch to Camera 3', default: 'F3' },
                { key: 'cam4', label: 'Switch to Camera 4', default: 'F4' },
              ].map((item) => (
                <div key={item.key} className="form-row form-row--hotkey">
                  <label className="form-label form-label--hotkey">{item.label}</label>
                  <input
                    className="form-input form-input--hotkey"
                    type="text"
                    value={(localSettings.hotkeys as any)[item.key] || item.default}
                    onChange={(e) => updateHotkey(item.key, e.target.value)}
                    placeholder={item.default}
                  />
                </div>
              ))}

              <div className="settings-note">
                <span>ℹ️</span> Use Electron key names: Space, Left, Right, F1-F12, Ctrl+Key, etc.
                <br />
                Restart the app after changing hotkeys.
              </div>
            </div>
          )}
        </div>

        <div className="modal__footer">
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
