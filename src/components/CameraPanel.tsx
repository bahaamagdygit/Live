import { useRef, useEffect, useState } from 'react'
import { Camera, IpCameraPreset, IpCameraViewSettings, DEFAULT_IPCAM_VIEW } from '../types'
import { CameraViewSettings, DEFAULT_CAM_VIEW } from '../hooks/useCameras'
import { IpCamera } from '../hooks/useIpCameras'
import { CameraSwitchTransition } from './MainPreview'
import { WebRTCCamera } from '../hooks/useWebRTCCameras'

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
  onDisconnectIpCamera: (id: string) => void
  onReconnectIpCamera: (id: string) => void
  onSaveAndReconnect: (preset: IpCameraPreset) => Promise<void>
  onUpdateIpCamView: (id: string, patch: Partial<IpCameraViewSettings>) => void
  // Mobile camera
  onMobileCamMjpegUrl: (url: string | null) => void
  // WebRTC phone cameras
  webrtcCameras?: WebRTCCamera[]
  activeWebRTCDeviceId?: string | null
  onSelectWebRTCCamera?: (cam: WebRTCCamera) => void
  onDisconnectWebRTCCamera?: (deviceId: string) => void
  webrtcQrDataUrl?: string
  webrtcServerUrl?: string
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

function WebRTCCameraCard({ cam, isActive, onSelect, onDisconnect }: {
  cam: WebRTCCamera
  isActive: boolean
  onSelect: () => void
  onDisconnect: (e: React.MouseEvent) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = cam.stream
  }, [cam.stream])

  return (
    <div
      className={`camera-card ${isActive ? 'camera-card--active' : ''} ${!cam.connected ? 'camera-card--disconnected' : ''}`}
      onClick={cam.connected ? onSelect : undefined}
    >
      <div className="camera-preview">
        {cam.stream ? (
          <video ref={videoRef} autoPlay playsInline muted className="camera-preview__video" />
        ) : (
          <div className="camera-preview__error">
            <span className="icon">📱</span>
            <span className="camera-preview__error-label">{cam.connected ? 'Connecting...' : 'Offline'}</span>
          </div>
        )}
        {isActive && cam.connected && <div className="camera-preview__active-badge">LIVE</div>}
        {!cam.connected && <div className="camera-preview__disconnected-badge">OFFLINE</div>}
      </div>
      <div className="camera-card__info">
        {isActive && cam.connected && <span className="camera-card__dot" />}
        <span className="camera-card__label" title={cam.deviceName}>📱 {cam.deviceName}</span>
        <button type="button" className="camera-card__remove" onClick={onDisconnect} title="Disconnect">×</button>
      </div>
    </div>
  )
}

function IpCameraCard({ cam, isActive, onSelect, onRemove, onRestart, onSettings, onEdit }: {
  cam: IpCamera
  isActive: boolean
  onSelect: () => void
  onRemove: (e: React.MouseEvent) => void
  onRestart: (e: React.MouseEvent) => void
  onSettings: (e: React.MouseEvent) => void
  onEdit: (e: React.MouseEvent) => void
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
        <button type="button" className="camera-card__remove" onClick={onSettings} title="Settings">⚙</button>
        <button type="button" className="camera-card__remove" onClick={onEdit} title="Edit">✏</button>
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
  ipCameras, activeIpCamera, onSelectIpCamera, onDisconnectIpCamera, onReconnectIpCamera,
  onSaveAndReconnect, onUpdateIpCamView,
  webrtcCameras = [], activeWebRTCDeviceId, onSelectWebRTCCamera, onDisconnectWebRTCCamera,
  webrtcQrDataUrl, webrtcServerUrl,
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
  const [ipPasteMode, setIpPasteMode] = useState(false)   // paste raw RTSP URL
  const [ipPasteUrl, setIpPasteUrl] = useState('')
  const [ipAddError, setIpAddError] = useState<string | null>(null)
  const [ipAdding, setIpAdding] = useState(false)
  const [ipDebugLog, setIpDebugLog] = useState<string[]>([])
  // IP camera edit modal
  const [editPreset, setEditPreset] = useState<IpCameraPreset | null>(null)
  // IP camera settings (zoom/pan) — which camera is open
  const [ipSettingsCamId, setIpSettingsCamId] = useState<string | null>(null)
  // WebRTC add-phone modal
  const [showWebRTCModal, setShowWebRTCModal] = useState(false)

  // Build RTSP URL from structured fields.
  // Credentials are percent-encoded so special chars (@, #, %, etc.) don't break the URL.
  const buildRtspUrl = () => {
    if (ipPasteMode) return ipPasteUrl.trim()
    const enc = (s: string) => encodeURIComponent(s)   // encode each part individually
    const auth = ipUser ? `${enc(ipUser)}:${enc(ipPass)}@` : ''
    const port = ipPort || '554'
    const streamDigit = ipSubStream ? 2 : 1
    // HiLook/Hikvision format: channel 1 main = 101, channel 1 sub = 102, channel 2 main = 201
    const chStream = parseInt(ipChannel || '1') * 100 + streamDigit

    if (ipBrand === 'hilook' || ipBrand === 'hikvision') {
      return `rtsp://${auth}${ipHost}:${port}/Streaming/Channels/${chStream}`
    }
    if (ipBrand === 'dahua') {
      const subtype = ipSubStream ? 1 : 0
      return `rtsp://${auth}${ipHost}:${port}/cam/realmonitor?channel=${ipChannel}&subtype=${subtype}`
    }
    return `rtsp://${auth}${ipHost}:${port}/Streaming/Channels/${chStream}`
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

  // Subscribe to live FFmpeg log lines while the form is open
  useEffect(() => {
    if (!showIpForm) return
    const unsub = window.electronAPI?.onIpCamLog?.((_, text) => {
      setIpDebugLog(prev => [...prev.slice(-80), ...text.split('\n').filter(Boolean)])
    })
    return () => unsub?.()
  }, [showIpForm])

  const handleIpAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (ipPasteMode && !ipPasteUrl.trim()) return
    if (!ipPasteMode && !ipHost.trim()) return
    setIpAdding(true)
    setIpAddError(null)
    setIpDebugLog([])
    const autoLabel = ipPasteMode ? `Camera (${ipPasteUrl.split('@').pop()?.split('/')[0] ?? 'IP'})` : `Camera ${ipHost}`
    const preset: IpCameraPreset = {
      id: `preset-${Date.now()}`, label: ipLabel || autoLabel,
      host: ipHost, port: ipPort, user: ipUser, pass: ipPass,
      channel: ipChannel, subStream: ipSubStream, brand: ipBrand,
    }
    let err: string | undefined
    try { await onSaveAndReconnect(preset) } catch (e: any) { err = e.message ?? 'Failed to connect' }
    setIpAdding(false)
    if (!err) {
      setIpLabel(''); setIpHost(''); setIpPort('554'); setIpUser('admin')
      setIpPass(''); setIpChannel('1'); setIpSubStream(false)
      setIpPasteUrl(''); setIpPasteMode(false); setShowIpForm(false)
      setIpDebugLog([])
    } else {
      setIpAddError(err)
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
            className={`btn btn--icon ${showWebRTCModal ? 'btn--active' : ''}`}
            onClick={() => setShowWebRTCModal(s => !s)}
            title="Add mobile phone camera"
          >📱</button>
          <button type="button" className="btn btn--icon" onClick={onRefresh} title="Refresh cameras" disabled={isLoading}>
            {isLoading ? '⟳' : '↺'}
          </button>
        </div>
      </div>

      <div className="panel__content">
        {error && <div className="alert alert--error"><span>⚠️</span> {error}</div>}

        {/* ── Add Mobile Phone Camera (WebRTC/WS) ── */}
        {showWebRTCModal && webrtcQrDataUrl && (
          <div className="mobile-qr-card">
            <div className="mobile-qr-card__header">
              <span>📱 Add Mobile Phone Camera</span>
              <button type="button" className="mobile-qr-card__close" onClick={() => setShowWebRTCModal(false)}>✕</button>
            </div>
            <p className="mobile-qr-card__hint">Scan with Church Cam app on your phone</p>
            <img src={webrtcQrDataUrl} className="mobile-qr-card__qr" alt="QR Code" />
            <div className="mobile-qr-card__url" title={webrtcServerUrl ?? ''}>{webrtcServerUrl}</div>
          </div>
        )}

        {/* ── WebRTC Phone Cameras (unlimited) ── */}
        {webrtcCameras.length > 0 && (
          <div className="camera-list">
            {webrtcCameras.map(cam => (
              <WebRTCCameraCard
                key={cam.deviceId}
                cam={cam}
                isActive={activeWebRTCDeviceId === cam.deviceId}
                onSelect={() => onSelectWebRTCCamera?.(cam)}
                onDisconnect={e => { e.stopPropagation(); onDisconnectWebRTCCamera?.(cam.deviceId) }}
              />
            ))}
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
            <div className="ipcam-form__title">
              📡 Add IP / DVR Camera
              <button type="button" className="ipcam-form__mode-toggle"
                onClick={() => { setIpPasteMode(m => !m); setIpAddError(null) }}>
                {ipPasteMode ? '⚙ Use Form' : '📋 Paste URL'}
              </button>
            </div>

            {ipPasteMode ? (
              /* ── Paste mode: one field, paste directly from OBS ── */
              <>
                <div className="ipcam-form__row">
                  <label className="ipcam-form__label">Camera Name (optional)</label>
                  <input className="ipcam-form__input" type="text" placeholder="e.g. Front Cam"
                    value={ipLabel} onChange={e => setIpLabel(e.target.value)} />
                </div>
                <div className="ipcam-form__row">
                  <label className="ipcam-form__label">RTSP URL — paste from OBS</label>
                  <input className="ipcam-form__input" type="text"
                    placeholder="rtsp://admin:pass@192.168.1.6/Streaming/Channels/101"
                    value={ipPasteUrl} onChange={e => setIpPasteUrl(e.target.value)}
                    autoFocus required />
                </div>
              </>
            ) : (
              /* ── Guided form ── */
              <>
                <div className="ipcam-form__row">
                  <label className="ipcam-form__label">Brand / Type</label>
                  <div className="ipcam-form__brand-grid">
                    {(['hilook', 'hikvision', 'dahua', 'generic'] as const).map(b => (
                      <button key={b} type="button"
                        className={`ipcam-form__brand-btn ${ipBrand === b ? 'ipcam-form__brand-btn--on' : ''}`}
                        onClick={() => setIpBrand(b)}>
                        {b === 'hilook' ? 'HiLook' : b === 'hikvision' ? 'Hikvision' : b === 'dahua' ? 'Dahua' : 'Generic'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ipcam-form__row">
                  <label className="ipcam-form__label">Camera Name (optional)</label>
                  <input className="ipcam-form__input" type="text" placeholder="e.g. Front Door"
                    value={ipLabel} onChange={e => setIpLabel(e.target.value)} />
                </div>

                <div className="ipcam-form__row">
                  <label className="ipcam-form__label">DVR / Camera IP</label>
                  <input className="ipcam-form__input" type="text" placeholder="192.168.1.6"
                    value={ipHost} onChange={e => setIpHost(e.target.value)} required />
                </div>

                <div className="ipcam-form__grid2">
                  <div>
                    <label className="ipcam-form__label">Port</label>
                    <input className="ipcam-form__input" type="number" placeholder="554"
                      value={ipPort} onChange={e => setIpPort(e.target.value)} />
                  </div>
                  <div>
                    <label className="ipcam-form__label">Channel</label>
                    <input className="ipcam-form__input" type="number" min="1" max="64" placeholder="1"
                      value={ipChannel} onChange={e => setIpChannel(e.target.value)} />
                  </div>
                </div>

                <div className="ipcam-form__grid2">
                  <div>
                    <label className="ipcam-form__label">Username</label>
                    <input className="ipcam-form__input" type="text" placeholder="admin"
                      value={ipUser} onChange={e => setIpUser(e.target.value)} />
                  </div>
                  <div>
                    <label className="ipcam-form__label">Password</label>
                    <input className="ipcam-form__input" type="password" placeholder="••••••••"
                      value={ipPass} onChange={e => setIpPass(e.target.value)} />
                  </div>
                </div>

                <div className="ipcam-form__row ipcam-form__row--check">
                  <label className="ipcam-form__check-label">
                    <input type="checkbox" checked={ipSubStream}
                      onChange={e => setIpSubStream(e.target.checked)} />
                    Sub-stream (lower quality, less bandwidth)
                  </label>
                </div>

                <div className="ipcam-form__preview-url">
                  {ipHost ? buildRtspUrl() : 'Fill in the IP address above'}
                </div>
              </>
            )}

            {ipAddError && <div className="alert alert--error alert--sm">{ipAddError}</div>}

            {ipDebugLog.length > 0 && (
              <div className="ipcam-debug-log">
                <div className="ipcam-debug-log__title">FFmpeg log</div>
                <pre className="ipcam-debug-log__body">
                  {ipDebugLog.join('\n')}
                </pre>
              </div>
            )}

            <div className="ipcam-form__actions">
              <button type="submit" className="btn btn--primary btn--sm"
                disabled={(ipPasteMode ? !ipPasteUrl.trim() : !ipHost.trim()) || ipAdding}>
                {ipAdding ? 'Connecting…' : '📡 Connect'}
              </button>
              <button type="button" className="btn btn--ghost btn--sm"
                onClick={() => { setShowIpForm(false); setIpAddError(null) }}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* ── IP Camera Cards (auto-connected, with inline edit) ── */}
        {ipCameras.length > 0 && (
          <div className="camera-list">
            {ipCameras.map(cam => (
              <div key={cam.id}>
                {/* Inline edit form */}
                {editPreset?.id === cam.preset.id ? (
                  <div className="ipcam-edit-modal">
                    <div className="ipcam-form__grid2">
                      <div>
                        <label className="ipcam-form__label">Name</label>
                        <input title="Camera name" className="ipcam-form__input" value={editPreset.label}
                          onChange={e => setEditPreset(p => p ? { ...p, label: e.target.value } : p)} />
                      </div>
                      <div>
                        <label className="ipcam-form__label">IP Address</label>
                        <input title="IP address" className="ipcam-form__input" value={editPreset.host}
                          onChange={e => setEditPreset(p => p ? { ...p, host: e.target.value } : p)} />
                      </div>
                      <div>
                        <label className="ipcam-form__label">Port</label>
                        <input title="Port" className="ipcam-form__input" value={editPreset.port}
                          onChange={e => setEditPreset(p => p ? { ...p, port: e.target.value } : p)} />
                      </div>
                      <div>
                        <label className="ipcam-form__label">Channel</label>
                        <input title="Channel" className="ipcam-form__input" value={editPreset.channel}
                          onChange={e => setEditPreset(p => p ? { ...p, channel: e.target.value } : p)} />
                      </div>
                      <div>
                        <label className="ipcam-form__label">Username</label>
                        <input title="Username" className="ipcam-form__input" value={editPreset.user}
                          onChange={e => setEditPreset(p => p ? { ...p, user: e.target.value } : p)} />
                      </div>
                      <div>
                        <label className="ipcam-form__label">Password</label>
                        <input title="Password" type="password" className="ipcam-form__input" value={editPreset.pass}
                          onChange={e => setEditPreset(p => p ? { ...p, pass: e.target.value } : p)} />
                      </div>
                    </div>
                    <div className="ipcam-edit-modal__actions">
                      <button type="button" className="btn btn--primary btn--sm"
                        onClick={async () => { await onSaveAndReconnect(editPreset); setEditPreset(null) }}>
                        💾 Save &amp; Reconnect
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm"
                        onClick={() => setEditPreset(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <IpCameraCard
                    cam={cam}
                    isActive={activeIpCamera?.id === cam.id}
                    onSelect={() => onSelectIpCamera(cam)}
                    onRemove={e => { e.stopPropagation(); onDisconnectIpCamera(cam.id) }}
                    onRestart={e => { e.stopPropagation(); onReconnectIpCamera(cam.id) }}
                    onSettings={e => { e.stopPropagation(); setIpSettingsCamId(id => id === cam.id ? null : cam.id) }}
                    onEdit={e => { e.stopPropagation(); setEditPreset({ ...cam.preset }); setIpSettingsCamId(null) }}
                  />
                )}
                {/* IP Camera Settings Panel */}
                {ipSettingsCamId === cam.id && (
                  <div className="cam-settings cam-settings--ipcam">
                    <div className="cam-settings__sliders">
                      {[
                        { label: 'Zoom', key: 'scale' as const, min: 10, max: 300, def: 100, unit: '%' },
                        { label: 'X', key: 'offsetX' as const, min: -100, max: 100, def: 0, unit: '%' },
                        { label: 'Y', key: 'offsetY' as const, min: -100, max: 100, def: 0, unit: '%' },
                        { label: 'Bright', key: 'brightness' as const, min: 0, max: 200, def: 100, unit: '%' },
                        { label: 'Contrast', key: 'contrast' as const, min: 0, max: 200, def: 100, unit: '%' },
                        { label: 'Saturate', key: 'saturation' as const, min: 0, max: 200, def: 100, unit: '%' },
                      ].map(({ label, key, min, max, def, unit }) => (
                        <div key={key} className="cam-settings__slider-row">
                          <label className="cam-settings__label">{label} {cam.view[key]}{unit}</label>
                          <input type="range" title={label} min={min} max={max} value={cam.view[key] as number}
                            onChange={e => onUpdateIpCamView(cam.id, { [key]: Number(e.target.value) })} />
                          <button type="button" className="cam-settings__rst"
                            onClick={() => onUpdateIpCamView(cam.id, { [key]: def })}>↺</button>
                        </div>
                      ))}
                    </div>
                    <div className="cam-settings__row">
                      <label className="cam-settings__label">Fit</label>
                      <select title="Fit mode" className="cam-settings__select" value={cam.view.fit}
                        onChange={e => onUpdateIpCamView(cam.id, { fit: e.target.value as IpCameraViewSettings['fit'] })}>
                        <option value="cover">Cover</option>
                        <option value="contain">Contain</option>
                        <option value="fill">Stretch</option>
                        <option value="none">Original</option>
                      </select>
                    </div>
                    <div className="cam-settings__row">
                      <label className="cam-settings__label">Flip</label>
                      <div className="cam-settings__flip-btns">
                        <button type="button"
                          className={`cam-settings__flip ${cam.view.flipH ? 'cam-settings__flip--on' : ''}`}
                          onClick={() => onUpdateIpCamView(cam.id, { flipH: !cam.view.flipH })}>↔ Horiz</button>
                        <button type="button"
                          className={`cam-settings__flip ${cam.view.flipV ? 'cam-settings__flip--on' : ''}`}
                          onClick={() => onUpdateIpCamView(cam.id, { flipV: !cam.view.flipV })}>↕ Vert</button>
                      </div>
                    </div>
                    <button type="button" className="cam-settings__reset-all"
                      onClick={() => onUpdateIpCamView(cam.id, { ...DEFAULT_IPCAM_VIEW })}>↺ Reset All</button>
                  </div>
                )}
              </div>
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
