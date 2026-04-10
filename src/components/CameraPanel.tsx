import { useRef, useEffect, useState } from 'react'
import { Camera } from '../types'
import { CameraViewSettings, DEFAULT_CAM_VIEW } from '../hooks/useCameras'
import { IpCamera } from '../hooks/useIpCameras'
import { CameraSwitchTransition } from './MainPreview'

interface CameraPanelProps {
  cameras: Camera[]
  activeCamera: Camera | null
  activeCameraStream: MediaStream | null
  onSelectCamera: (camera: Camera) => void
  onRefresh: () => void
  onRemoveCamera: (deviceId: string) => void
  onReorderCameras: (from: number, to: number) => void
  onAddCamera: (label: string, deviceId: string) => void
  isLoading: boolean
  error: string | null
  camView: CameraViewSettings
  onCamViewChange: (patch: Partial<CameraViewSettings>) => void
  manualFallback: boolean
  onToggleManualFallback: () => void
  disconnectedIds: Set<string>
  switchTransition: CameraSwitchTransition
  onSwitchTransitionChange: (t: CameraSwitchTransition) => void
  // IP cameras
  ipCameras: IpCamera[]
  activeIpCamera: IpCamera | null
  onSelectIpCamera: (cam: IpCamera) => void
  onAddIpCamera: (label: string, rtspUrl: string) => Promise<{ success: boolean; error?: string }>
  onRemoveIpCamera: (id: string) => void
  onRestartIpCamera: (id: string) => void
  // Mobile camera
  onMobileCamMjpegUrl: (url: string | null) => void
}

function CameraPreview({ camera, isActive, isDisconnected, activeStream, isDragOver, onClick, onRemove, onDragStart, onDragOver, onDrop }: {
  camera: Camera
  isActive: boolean
  isDisconnected: boolean
  activeStream: MediaStream | null
  isDragOver: boolean
  onClick: () => void
  onRemove: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [previewError, setPreviewError] = useState(false)

  useEffect(() => {
    if (isDisconnected) { setPreviewError(true); return }
    if (isActive && activeStream) {
      if (videoRef.current) videoRef.current.srcObject = activeStream
      setPreviewError(false)
      return
    }
    let stream: MediaStream | null = null
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: camera.deviceId ? { deviceId: { ideal: camera.deviceId }, width: 320, height: 180 } : { width: 320, height: 180 },
          audio: false,
        })
        if (videoRef.current) videoRef.current.srcObject = stream
        setPreviewError(false)
      } catch { setPreviewError(true) }
    }
    start()
    return () => { stream?.getTracks().forEach(t => t.stop()) }
  }, [camera.deviceId, isDisconnected, isActive, activeStream])

  return (
    <div
      className={`camera-card ${isActive ? 'camera-card--active' : ''} ${isDisconnected ? 'camera-card--disconnected' : ''} ${isDragOver ? 'camera-card--drag-over' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={isDisconnected ? undefined : onClick}
      title={isDisconnected ? `${camera.label} — Not connected` : camera.label}
    >
      <div className="camera-card__drag-handle" title="Drag to reorder">⠿</div>
      <div className="camera-preview">
        {previewError || isDisconnected
          ? (
            <div className="camera-preview__error">
              <span className="icon">📷</span>
              {isDisconnected && <span className="camera-preview__error-label">Not connected</span>}
            </div>
          )
          : <video ref={videoRef} autoPlay muted playsInline className="camera-preview__video" />
        }
        {isActive && !isDisconnected && <div className="camera-preview__active-badge">LIVE</div>}
        {isDisconnected && <div className="camera-preview__disconnected-badge">OFFLINE</div>}
      </div>
      <div className="camera-card__info">
        {isActive && !isDisconnected && <span className="camera-card__dot" />}
        <span className="camera-card__label" title={camera.label}>{camera.label}</span>
        <button type="button" className="camera-card__remove" onClick={onRemove} title="Remove camera">×</button>
      </div>
    </div>
  )
}

function IpCameraCard({ cam, isActive, onSelect, onRemove, onRestart }: {
  cam: IpCamera
  isActive: boolean
  onSelect: () => void
  onRemove: (e: React.MouseEvent) => void
  onRestart: (e: React.MouseEvent) => void
}) {
  const [imgError, setImgError] = useState(false)
  // Re-try image when mjpegUrl changes
  useEffect(() => { setImgError(false) }, [cam.mjpegUrl])

  return (
    <div
      className={`camera-card ${isActive ? 'camera-card--active' : ''} ${imgError ? 'camera-card--disconnected' : ''}`}
      onClick={imgError ? undefined : onSelect}
      title={cam.rtspUrl}
    >
      <div className="camera-preview">
        {imgError ? (
          <div className="camera-preview__error">
            <span className="icon">📡</span>
            <span className="camera-preview__error-label">No signal</span>
          </div>
        ) : (
          <img
            src={cam.mjpegUrl}
            className="camera-preview__video"
            onError={() => setImgError(true)}
            alt={cam.label}
          />
        )}
        {isActive && !imgError && <div className="camera-preview__active-badge">LIVE</div>}
        {imgError && <div className="camera-preview__disconnected-badge">OFFLINE</div>}
      </div>
      <div className="camera-card__info">
        {isActive && !imgError && <span className="camera-card__dot" />}
        <span className="camera-card__label" title={cam.label}>📡 {cam.label}</span>
        <button type="button" className="camera-card__remove" onClick={onRestart} title="Reconnect">↺</button>
        <button type="button" className="camera-card__remove" onClick={onRemove} title="Remove">×</button>
      </div>
    </div>
  )
}

export function CameraPanel({
  cameras, activeCamera, activeCameraStream, onSelectCamera, onRefresh, onRemoveCamera,
  onReorderCameras, onAddCamera,
  isLoading, error, camView, onCamViewChange,
  manualFallback, onToggleManualFallback, disconnectedIds,
  switchTransition, onSwitchTransitionChange,
  ipCameras, activeIpCamera, onSelectIpCamera, onAddIpCamera, onRemoveIpCamera, onRestartIpCamera,
  onMobileCamMjpegUrl,
}: CameraPanelProps) {
  const [showSettings, setShowSettings] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addLabel, setAddLabel] = useState('')
  const [addDeviceId, setAddDeviceId] = useState('')
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  // IP camera add form — structured fields
  const [showIpForm, setShowIpForm] = useState(false)
  const [ipLabel, setIpLabel] = useState('')
  const [ipHost, setIpHost] = useState('')
  const [ipPort, setIpPort] = useState('554')
  const [ipUser, setIpUser] = useState('admin')
  const [ipPass, setIpPass] = useState('')
  const [ipChannel, setIpChannel] = useState('1')
  const [ipSubStream, setIpSubStream] = useState(false)
  const [ipBrand, setIpBrand] = useState<'hilook' | 'hikvision' | 'dahua' | 'generic'>('hilook')
  const [ipAddError, setIpAddError] = useState<string | null>(null)
  const [ipAdding, setIpAdding] = useState(false)
  // Mobile camera
  const [mobileCamActive, setMobileCamActive] = useState(false)
  const [mobileCamQr, setMobileCamQr] = useState<string | null>(null)
  const [mobileCamPhoneUrl, setMobileCamPhoneUrl] = useState<string | null>(null)
  const [mobileCamMjpegUrl, setMobileCamMjpegUrl] = useState<string | null>(null)
  const [showMobileQr, setShowMobileQr] = useState(false)

  // Build RTSP URL from structured fields
  const buildRtspUrl = () => {
    const auth = ipUser ? `${encodeURIComponent(ipUser)}:${encodeURIComponent(ipPass)}@` : ''
    const port = ipPort || '554'
    const ch = ipChannel.padStart(2, '0')
    const stream = ipSubStream ? '02' : '01'

    if (ipBrand === 'hilook' || ipBrand === 'hikvision') {
      // HiLook & Hikvision both use the ISAPI path
      return `rtsp://${auth}${ipHost}:${port}/ISAPI/Streaming/Channels/${ch}${stream}`
    }
    if (ipBrand === 'dahua') {
      // Dahua: rtsp://user:pass@ip:554/cam/realmonitor?channel=1&subtype=0
      const subtype = ipSubStream ? 1 : 0
      return `rtsp://${auth}${ipHost}:${port}/cam/realmonitor?channel=${ipChannel}&subtype=${subtype}`
    }
    // Generic — bare path
    return `rtsp://${auth}${ipHost}:${port}/Streaming/Channels/${ch}${stream}`
  }

  const set = (patch: Partial<CameraViewSettings>) => onCamViewChange(patch)
  const reset = () => onCamViewChange({ ...DEFAULT_CAM_VIEW })

  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    setDragFromIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }

  const handleDrop = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault()
    if (dragFromIdx !== null && dragFromIdx !== idx) {
      onReorderCameras(dragFromIdx, idx)
    }
    setDragFromIdx(null)
    setDragOverIdx(null)
  }

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!addDeviceId.trim()) return
    onAddCamera(addLabel, addDeviceId)
    setAddLabel('')
    setAddDeviceId('')
    setShowAddForm(false)
  }

  const handleIpAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ipHost.trim()) return
    setIpAdding(true)
    setIpAddError(null)
    const rtspUrl = buildRtspUrl()
    const res = await onAddIpCamera(ipLabel || `Camera ${ipHost}`, rtspUrl)
    setIpAdding(false)
    if (res.success) {
      setIpLabel('')
      setIpHost('')
      setIpPort('554')
      setIpUser('admin')
      setIpPass('')
      setIpChannel('1')
      setIpSubStream(false)
      setShowIpForm(false)
    } else {
      setIpAddError(res.error ?? 'Failed to connect')
    }
  }

  const handleMobileCamToggle = async () => {
    if (!window.electronAPI) return
    if (mobileCamActive) {
      await window.electronAPI.mobileCamStop?.()
      setMobileCamActive(false)
      setMobileCamQr(null)
      setMobileCamPhoneUrl(null)
      setMobileCamMjpegUrl(null)
      setShowMobileQr(false)
      onMobileCamMjpegUrl(null)
    } else {
      const res = await window.electronAPI.mobileCamStart?.()
      if (res?.success) {
        setMobileCamActive(true)
        setMobileCamQr(res.qrDataUrl ?? null)
        setMobileCamPhoneUrl(res.phoneUrl ?? null)
        setMobileCamMjpegUrl(res.mjpegUrl ?? null)
        setShowMobileQr(true)
        onMobileCamMjpegUrl(res.mjpegUrl ?? null)
      }
    }
  }

  return (
    <div className="panel camera-panel">
      <div className="panel__header">
        <h3 className="panel__title">
          <span className="panel__title-icon">🎥</span>
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
          <button
            type="button"
            className={`btn btn--icon ${showAddForm ? 'btn--active' : ''}`}
            onClick={() => setShowAddForm(s => !s)}
            title="Add USB camera manually"
          >＋</button>
          <button
            type="button"
            className={`btn btn--icon ${showIpForm ? 'btn--active' : ''}`}
            onClick={() => setShowIpForm(s => !s)}
            title="Add IP / DVR camera (RTSP)"
          >📡</button>
          <button
            type="button"
            className={`btn btn--icon ${mobileCamActive ? 'btn--active' : ''}`}
            onClick={handleMobileCamToggle}
            title={mobileCamActive ? 'Stop mobile camera' : 'Add mobile phone camera'}
          >📱</button>
          <button type="button" className="btn btn--icon" onClick={onRefresh} title="Refresh cameras" disabled={isLoading}>
            {isLoading ? '⟳' : '↺'}
          </button>
        </div>
      </div>

      <div className="panel__content">
        {error && <div className="alert alert--error"><span>⚠️</span> {error}</div>}

        {/* ── Mobile Camera QR Modal ── */}
        {showMobileQr && mobileCamQr && (
          <div className="mobile-qr-card">
            <div className="mobile-qr-card__header">
              <span>📱 Mobile Camera</span>
              <button type="button" className="mobile-qr-card__close" onClick={() => setShowMobileQr(false)}>✕</button>
            </div>
            <p className="mobile-qr-card__hint">Scan with your phone to stream camera</p>
            <img src={mobileCamQr} className="mobile-qr-card__qr" alt="QR Code" />
            <div className="mobile-qr-card__url" title={mobileCamPhoneUrl ?? ''}>
              {mobileCamPhoneUrl}
            </div>
            <div className="mobile-qr-card__actions">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => {
                  if (mobileCamMjpegUrl) onSelectIpCamera({ id: '__mobile__', label: 'Mobile Camera', rtspUrl: '', port: 18800, active: true, mjpegUrl: mobileCamMjpegUrl })
                  setShowMobileQr(false)
                }}
              >Use as Active Camera</button>
            </div>
          </div>
        )}

        {/* ── Mobile Camera live card (when active and QR dismissed) ── */}
        {mobileCamActive && !showMobileQr && mobileCamMjpegUrl && (
          <div className="camera-list">
            <div
              className={`camera-card ${activeIpCamera?.id === '__mobile__' ? 'camera-card--active' : ''}`}
              onClick={() => onSelectIpCamera({ id: '__mobile__', label: 'Mobile Camera', rtspUrl: '', port: 18800, active: true, mjpegUrl: mobileCamMjpegUrl })}
            >
              <div className="camera-preview">
                <img src={mobileCamMjpegUrl} className="camera-preview__video" alt="Mobile Camera"
                  onError={() => {}} />
                {activeIpCamera?.id === '__mobile__' && <div className="camera-preview__active-badge">LIVE</div>}
              </div>
              <div className="camera-card__info">
                {activeIpCamera?.id === '__mobile__' && <span className="camera-card__dot" />}
                <span className="camera-card__label">📱 Mobile Camera</span>
                <button type="button" className="camera-card__remove" title="Show QR"
                  onClick={e => { e.stopPropagation(); setShowMobileQr(true) }}>QR</button>
                <button type="button" className="camera-card__remove" title="Stop"
                  onClick={e => { e.stopPropagation(); handleMobileCamToggle() }}>×</button>
              </div>
            </div>
          </div>
        )}
        {!error && cameras.length === 0 && !isLoading && (
          <div className="empty-state">
            <div className="empty-state__icon">📷</div>
            <p>No cameras detected</p>
            <button type="button" className="btn btn--secondary btn--sm" onClick={onRefresh}>Refresh</button>
          </div>
        )}
        {isLoading && <div className="empty-state"><div className="spinner" /><p>Detecting cameras...</p></div>}

        {/* ── Add Camera Form ── */}
        {showAddForm && (
          <form className="add-camera-form" onSubmit={handleAddSubmit}>
            <div className="add-camera-form__row">
              <input
                className="add-camera-form__input"
                type="text"
                placeholder="Label (optional)"
                value={addLabel}
                onChange={e => setAddLabel(e.target.value)}
              />
            </div>
            <div className="add-camera-form__row">
              <input
                className="add-camera-form__input"
                type="text"
                placeholder="Device ID *"
                value={addDeviceId}
                onChange={e => setAddDeviceId(e.target.value)}
                required
              />
            </div>
            <div className="add-camera-form__actions">
              <button type="submit" className="btn btn--primary btn--sm" disabled={!addDeviceId.trim()}>Add</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowAddForm(false)}>Cancel</button>
            </div>
          </form>
        )}

        <div
          className="camera-list"
          onDragLeave={() => setDragOverIdx(null)}
          onDragEnd={() => { setDragFromIdx(null); setDragOverIdx(null) }}
        >
          {cameras.map((camera, idx) => (
            <CameraPreview
              key={camera.id}
              camera={camera}
              isActive={activeCamera?.id === camera.id}
              isDisconnected={disconnectedIds.has(camera.deviceId)}
              activeStream={activeCamera?.id === camera.id ? activeCameraStream : null}
              isDragOver={dragOverIdx === idx}
              onClick={() => onSelectCamera(camera)}
              onRemove={e => { e.stopPropagation(); onRemoveCamera(camera.deviceId) }}
              onDragStart={handleDragStart(idx)}
              onDragOver={handleDragOver(idx)}
              onDrop={handleDrop(idx)}
            />
          ))}
        </div>

        {/* ── Add IP Camera Form ── */}
        {showIpForm && (
          <form className="ipcam-form" onSubmit={handleIpAddSubmit}>
            <div className="ipcam-form__title">📡 Add IP / DVR Camera</div>

            <div className="ipcam-form__row">
              <label className="ipcam-form__label">Brand / Type</label>
              <div className="ipcam-form__brand-grid">
                {(['hilook', 'hikvision', 'dahua', 'generic'] as const).map(b => (
                  <button
                    key={b}
                    type="button"
                    className={`ipcam-form__brand-btn ${ipBrand === b ? 'ipcam-form__brand-btn--on' : ''}`}
                    onClick={() => setIpBrand(b)}
                  >
                    {b === 'hilook' ? 'HiLook' : b === 'hikvision' ? 'Hikvision' : b === 'dahua' ? 'Dahua' : 'Generic'}
                  </button>
                ))}
              </div>
            </div>

            <div className="ipcam-form__row">
              <label className="ipcam-form__label">Camera Name</label>
              <input
                className="ipcam-form__input"
                type="text"
                placeholder="e.g. Front Door"
                value={ipLabel}
                onChange={e => setIpLabel(e.target.value)}
              />
            </div>

            <div className="ipcam-form__row">
              <label className="ipcam-form__label">DVR / Camera IP</label>
              <input
                className="ipcam-form__input"
                type="text"
                placeholder="192.168.1.64"
                value={ipHost}
                onChange={e => setIpHost(e.target.value)}
                required
              />
            </div>

            <div className="ipcam-form__grid2">
              <div>
                <label className="ipcam-form__label">Port</label>
                <input
                  className="ipcam-form__input"
                  type="number"
                  placeholder="554"
                  value={ipPort}
                  onChange={e => setIpPort(e.target.value)}
                />
              </div>
              <div>
                <label className="ipcam-form__label">Channel</label>
                <input
                  className="ipcam-form__input"
                  type="number"
                  min="1"
                  max="64"
                  placeholder="1"
                  value={ipChannel}
                  onChange={e => setIpChannel(e.target.value)}
                />
              </div>
            </div>

            <div className="ipcam-form__grid2">
              <div>
                <label className="ipcam-form__label">Username</label>
                <input
                  className="ipcam-form__input"
                  type="text"
                  placeholder="admin"
                  value={ipUser}
                  onChange={e => setIpUser(e.target.value)}
                />
              </div>
              <div>
                <label className="ipcam-form__label">Password</label>
                <input
                  className="ipcam-form__input"
                  type="password"
                  placeholder="••••••••"
                  value={ipPass}
                  onChange={e => setIpPass(e.target.value)}
                />
              </div>
            </div>

            <div className="ipcam-form__row ipcam-form__row--check">
              <label className="ipcam-form__check-label">
                <input
                  type="checkbox"
                  checked={ipSubStream}
                  onChange={e => setIpSubStream(e.target.checked)}
                />
                Sub-stream (lower quality, less bandwidth)
              </label>
            </div>

            <div className="ipcam-form__preview-url">
              {ipHost ? buildRtspUrl() : 'Fill in the IP address above'}
            </div>

            {ipAddError && <div className="alert alert--error alert--sm">{ipAddError}</div>}

            <div className="ipcam-form__actions">
              <button type="submit" className="btn btn--primary btn--sm" disabled={!ipHost.trim() || ipAdding}>
                {ipAdding ? 'Connecting…' : '📡 Connect'}
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setShowIpForm(false); setIpAddError(null) }}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* ── IP Camera Cards ── */}
        {ipCameras.length > 0 && (
          <div className="camera-list">
            {ipCameras.map(cam => (
              <IpCameraCard
                key={cam.id}
                cam={cam}
                isActive={activeIpCamera?.id === cam.id}
                onSelect={() => onSelectIpCamera(cam)}
                onRemove={e => { e.stopPropagation(); onRemoveIpCamera(cam.id) }}
                onRestart={e => { e.stopPropagation(); onRestartIpCamera(cam.id) }}
              />
            ))}
          </div>
        )}

        {/* ── Camera Settings Panel ── */}
        {showSettings && activeCamera && (
          <div className="cam-settings">
            <div className="cam-settings__title">⚙️ {activeCamera.label}</div>

            <div className="cam-settings__selects-grid">
              <div className="cam-settings__select-block">
                <label className="cam-settings__label">Resolution</label>
                <select title="Resolution" className="cam-settings__select"
                  value={camView.resolution}
                  onChange={e => set({ resolution: e.target.value as CameraViewSettings['resolution'] })}>
                  <option value="4k">4K</option>
                  <option value="1080p">1080p</option>
                  <option value="720p">720p</option>
                  <option value="480p">480p</option>
                </select>
              </div>
              <div className="cam-settings__select-block">
                <label className="cam-settings__label">Frame Rate</label>
                <select title="Frame rate" className="cam-settings__select"
                  value={camView.frameRate}
                  onChange={e => set({ frameRate: Number(e.target.value) as 30 | 60 })}>
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                </select>
              </div>
              <div className="cam-settings__select-block cam-settings__select-block--full">
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
            </div>

            <div className="cam-settings__sliders">
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
                <label className="cam-settings__label">Bright {camView.brightness}%</label>
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
                <label className="cam-settings__label">Saturate {camView.saturation}%</label>
                <input type="range" title="Saturation" min={0} max={200} value={camView.saturation}
                  onChange={e => set({ saturation: Number(e.target.value) })} />
                <button type="button" className="cam-settings__rst" onClick={() => set({ saturation: 100 })}>↺</button>
              </div>
            </div>

            <div className="cam-settings__row">
              <label className="cam-settings__label">Flip</label>
              <div className="cam-settings__flip-btns">
                <button type="button"
                  className={`cam-settings__flip ${camView.flipH ? 'cam-settings__flip--on' : ''}`}
                  onClick={() => set({ flipH: !camView.flipH })}>↔ Horiz</button>
                <button type="button"
                  className={`cam-settings__flip ${camView.flipV ? 'cam-settings__flip--on' : ''}`}
                  onClick={() => set({ flipV: !camView.flipV })}>↕ Vert</button>
              </div>
            </div>

            <div className="cam-settings__row">
              <label className="cam-settings__label">Switch Effect</label>
              <div className="cam-settings__flip-btns">
                {(['fade', 'zoom', 'slide-left', 'slide-right', 'none'] as CameraSwitchTransition[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`cam-settings__flip ${switchTransition === t ? 'cam-settings__flip--on' : ''}`}
                    onClick={() => onSwitchTransitionChange(t)}
                  >{t === 'slide-left' ? '← Slide' : t === 'slide-right' ? '→ Slide' : t.charAt(0).toUpperCase() + t.slice(1)}</button>
                ))}
              </div>
            </div>

            <button type="button" className="cam-settings__reset-all" onClick={reset}>↺ Reset All</button>
          </div>
        )}
      </div>

      <div className="panel__footer">
        <div className="camera-status">
          {activeIpCamera
            ? <span className="status-text"><span className="dot dot--green" />📡 {activeIpCamera.label}</span>
            : activeCamera
              ? <span className="status-text"><span className="dot dot--green" />{activeCamera.label}</span>
              : <span className="status-text status-text--muted">No camera selected</span>
          }
        </div>
      </div>
    </div>
  )
}
