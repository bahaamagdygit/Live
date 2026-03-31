import { useRef, useEffect, useState } from 'react'
import { Camera } from '../types'
import { CameraViewSettings, DEFAULT_CAM_VIEW } from '../hooks/useCameras'

interface CameraPanelProps {
  cameras: Camera[]
  activeCamera: Camera | null
  onSelectCamera: (camera: Camera) => void
  onRefresh: () => void
  isLoading: boolean
  error: string | null
  camView: CameraViewSettings
  onCamViewChange: (patch: Partial<CameraViewSettings>) => void
  manualFallback: boolean
  onToggleManualFallback: () => void
}

function CameraPreview({ camera, isActive, onClick }: {
  camera: Camera; isActive: boolean; onClick: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [previewError, setPreviewError] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: camera.deviceId ? { deviceId: { ideal: camera.deviceId }, width: 160, height: 90 } : { width: 160, height: 90 },
          audio: false,
        })
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch { setPreviewError(true) }
    }
    start()
    return () => { stream?.getTracks().forEach(t => t.stop()) }
  }, [camera.deviceId])

  return (
    <div className={`camera-card ${isActive ? 'camera-card--active' : ''}`} onClick={onClick} title={camera.label}>
      <div className="camera-preview">
        {previewError
          ? <div className="camera-preview__error"><span className="icon">📷</span></div>
          : <video ref={videoRef} autoPlay muted playsInline className="camera-preview__video" />
        }
        {isActive && <div className="camera-preview__active-badge">LIVE</div>}
      </div>
      <div className="camera-card__info">
        {isActive && <span className="camera-card__dot" />}
        <span className="camera-card__label" title={camera.label}>{camera.label}</span>
      </div>
    </div>
  )
}

export function CameraPanel({
  cameras, activeCamera, onSelectCamera, onRefresh,
  isLoading, error, camView, onCamViewChange,
  manualFallback, onToggleManualFallback,
}: CameraPanelProps) {
  const [showSettings, setShowSettings] = useState(false)
  const set = (patch: Partial<CameraViewSettings>) => onCamViewChange(patch)
  const reset = () => onCamViewChange({ ...DEFAULT_CAM_VIEW })

  return (
    <div className="panel camera-panel">
      <div className="panel__header">
        <h3 className="panel__title">
          <span className="panel__title-icon">🎥</span>
          Cameras
        </h3>
        <div className="panel__header-actions">
          <button
            type="button"
            className={`btn btn--icon ${manualFallback ? 'btn--fallback-on' : ''}`}
            onClick={onToggleManualFallback}
            title={manualFallback ? 'Fallback BG: ON — click to turn off' : 'Show fallback background'}
          >🖼️</button>
          {activeCamera && (
            <button
              type="button"
              className={`btn btn--icon ${showSettings ? 'btn--active' : ''}`}
              onClick={() => setShowSettings(s => !s)}
              title="Camera settings"
            >⚙️</button>
          )}
          <button type="button" className="btn btn--icon" onClick={onRefresh} title="Refresh cameras" disabled={isLoading}>
            {isLoading ? '⟳' : '↺'}
          </button>
        </div>
      </div>

      <div className="panel__content">
        {error && <div className="alert alert--error"><span>⚠️</span> {error}</div>}
        {!error && cameras.length === 0 && !isLoading && (
          <div className="empty-state">
            <div className="empty-state__icon">📷</div>
            <p>No cameras detected</p>
            <button type="button" className="btn btn--secondary btn--sm" onClick={onRefresh}>Refresh</button>
          </div>
        )}
        {isLoading && <div className="empty-state"><div className="spinner" /><p>Detecting cameras...</p></div>}

        <div className="camera-list">
          {cameras.map(camera => (
            <CameraPreview key={camera.id} camera={camera}
              isActive={activeCamera?.id === camera.id} onClick={() => onSelectCamera(camera)} />
          ))}
        </div>

        {/* ── Camera Settings Panel ── */}
        {showSettings && activeCamera && (
          <div className="cam-settings">
            <div className="cam-settings__title">⚙️ {activeCamera.label}</div>

            <div className="cam-settings__row">
              <label className="cam-settings__label">Resolution</label>
              <select title="Resolution" className="cam-settings__select"
                value={camView.resolution}
                onChange={e => set({ resolution: e.target.value as CameraViewSettings['resolution'] })}>
                <option value="4k">4K (3840×2160)</option>
                <option value="1080p">1080p (1920×1080)</option>
                <option value="720p">720p (1280×720)</option>
                <option value="480p">480p (854×480)</option>
              </select>
            </div>

            <div className="cam-settings__row">
              <label className="cam-settings__label">Frame Rate</label>
              <select title="Frame rate" className="cam-settings__select"
                value={camView.frameRate}
                onChange={e => set({ frameRate: Number(e.target.value) as 30 | 60 })}>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </div>

            <div className="cam-settings__row">
              <label className="cam-settings__label">Fit</label>
              <select title="Fit mode" className="cam-settings__select"
                value={camView.fit}
                onChange={e => set({ fit: e.target.value as CameraViewSettings['fit'] })}>
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="fill">Stretch</option>
                <option value="none">Original</option>
              </select>
            </div>

            <div className="cam-settings__slider-row">
              <label className="cam-settings__label">Zoom {camView.scale}%</label>
              <input type="range" title="Zoom" min={10} max={300} value={camView.scale}
                onChange={e => set({ scale: Number(e.target.value) })} />
              <button type="button" className="cam-settings__rst" onClick={() => set({ scale: 100 })}>↺</button>
            </div>

            <div className="cam-settings__slider-row">
              <label className="cam-settings__label">X {camView.offsetX > 0 ? '+' : ''}{camView.offsetX}%</label>
              <input type="range" title="X offset" min={-100} max={100} value={camView.offsetX}
                onChange={e => set({ offsetX: Number(e.target.value) })} />
              <button type="button" className="cam-settings__rst" onClick={() => set({ offsetX: 0 })}>↺</button>
            </div>

            <div className="cam-settings__slider-row">
              <label className="cam-settings__label">Y {camView.offsetY > 0 ? '+' : ''}{camView.offsetY}%</label>
              <input type="range" title="Y offset" min={-100} max={100} value={camView.offsetY}
                onChange={e => set({ offsetY: Number(e.target.value) })} />
              <button type="button" className="cam-settings__rst" onClick={() => set({ offsetY: 0 })}>↺</button>
            </div>

            <div className="cam-settings__slider-row">
              <label className="cam-settings__label">Brightness {camView.brightness}%</label>
              <input type="range" title="Brightness" min={0} max={200} value={camView.brightness}
                onChange={e => set({ brightness: Number(e.target.value) })} />
              <button type="button" className="cam-settings__rst" onClick={() => set({ brightness: 100 })}>↺</button>
            </div>

            <div className="cam-settings__slider-row">
              <label className="cam-settings__label">Contrast {camView.contrast}%</label>
              <input type="range" title="Contrast" min={0} max={200} value={camView.contrast}
                onChange={e => set({ contrast: Number(e.target.value) })} />
              <button type="button" className="cam-settings__rst" onClick={() => set({ contrast: 100 })}>↺</button>
            </div>

            <div className="cam-settings__slider-row">
              <label className="cam-settings__label">Saturation {camView.saturation}%</label>
              <input type="range" title="Saturation" min={0} max={200} value={camView.saturation}
                onChange={e => set({ saturation: Number(e.target.value) })} />
              <button type="button" className="cam-settings__rst" onClick={() => set({ saturation: 100 })}>↺</button>
            </div>

            <div className="cam-settings__row">
              <label className="cam-settings__label">Flip</label>
              <div className="cam-settings__flip-btns">
                <button type="button"
                  className={`cam-settings__flip ${camView.flipH ? 'cam-settings__flip--on' : ''}`}
                  onClick={() => set({ flipH: !camView.flipH })}>↔ H</button>
                <button type="button"
                  className={`cam-settings__flip ${camView.flipV ? 'cam-settings__flip--on' : ''}`}
                  onClick={() => set({ flipV: !camView.flipV })}>↕ V</button>
              </div>
            </div>

            <button type="button" className="cam-settings__reset-all" onClick={reset}>Reset All</button>
          </div>
        )}
      </div>

      <div className="panel__footer">
        <div className="camera-status">
          {activeCamera
            ? <span className="status-text"><span className="dot dot--green" />{activeCamera.label}</span>
            : <span className="status-text status-text--muted">No camera selected</span>
          }
        </div>
      </div>
    </div>
  )
}
