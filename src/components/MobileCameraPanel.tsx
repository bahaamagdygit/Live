import { useMemo, useState } from 'react'
import { MobileBridgeDevice } from '../types/electron'
import { MobileCameraView, FilterPresetId } from '../hooks/useMobileCameras'
import { FilterPanel } from './FilterPanel'

interface MobileCameraPanelProps {
  devices: MobileBridgeDevice[]
  qrDataUrl: string
  serverUrl: string
  serverIp: string
  controlPort: number
  activeDeviceId: string | null
  frozenIds: Set<string>
  views: Record<string, MobileCameraView>
  onSelectDevice: (deviceId: string) => void
  onSendCommand: (deviceId: string, action: string, value?: unknown) => void
  onUpdateView: (deviceId: string, patch: Partial<MobileCameraView>) => void
  onApplyPreset: (deviceId: string, preset: FilterPresetId) => void
}

const WB_MODES = [
  { id: 'auto',         label: 'Auto' },
  { id: 'sunny',        label: 'Sunny' },
  { id: 'cloudy',       label: 'Cloudy' },
  { id: 'shadow',       label: 'Shadow' },
  { id: 'incandescent', label: 'Incandescent' },
  { id: 'fluorescent',  label: 'Fluorescent' },
] as const

function qualityColor(latencyMs: number): string {
  if (latencyMs < 50)  return '#22c55e'    // green
  if (latencyMs < 150) return '#f59e0b'    // yellow
  return '#ef4444'                         // red
}

export function MobileCameraPanel(p: MobileCameraPanelProps) {
  const [expandedFilters, setExpandedFilters] = useState(true)
  const [expandedHardware, setExpandedHardware] = useState(true)

  const active = useMemo(
    () => p.devices.find(d => d.deviceId === p.activeDeviceId) ?? null,
    [p.devices, p.activeDeviceId],
  )
  const view = active ? (p.views[active.deviceId] ?? null) : null

  return (
    <section className="mc-panel">
      <header className="mc-panel__head">
        <h3 className="mc-panel__title">
          <span>📱</span> Mobile Cameras
          <span className="mc-panel__count">{p.devices.length}</span>
        </h3>
      </header>

      {p.devices.length === 0 ? (
        <div className="mc-pairing">
          <div className="mc-pairing__qr-wrap">
            {p.qrDataUrl
              ? <img src={p.qrDataUrl} alt="Pair QR" className="mc-pairing__qr" />
              : <div className="mc-pairing__qr mc-pairing__qr--loading">…</div>}
          </div>
          <div className="mc-pairing__info">
            <p className="mc-pairing__hint">Scan this QR with the Church Cam mobile app.</p>
            <p className="mc-pairing__ip">
              Or enter manually: <code>{p.serverIp}:{p.controlPort}</code>
            </p>
            <p className="mc-pairing__lan">
              Phone and desktop must be on the same WiFi. Internet is not required.
            </p>
            <p className="mc-pairing__lan" style={{ color: '#f59e0b' }}>
              If phones can't connect: allow <code>Church Live Stream Studio</code>
              through Windows Firewall on <b>Private</b> networks (ports {p.controlPort}, 8766).
            </p>
          </div>
        </div>
      ) : (
        <>
          <ul className="mc-device-list">
            {p.devices.map(d => {
              const selected = d.deviceId === p.activeDeviceId
              const frozen   = p.frozenIds.has(d.deviceId)
              const color    = qualityColor(d.latencyMs)
              return (
                <li
                  key={d.deviceId}
                  className={`mc-device ${selected ? 'mc-device--active' : ''} ${frozen ? 'mc-device--frozen' : ''}`}
                  onClick={() => p.onSelectDevice(d.deviceId)}
                >
                  <span className="mc-device__dot" style={{ background: color }} />
                  <span className="mc-device__name" title={d.deviceName}>{d.deviceName}</span>
                  <span className="mc-device__latency">{Math.round(d.latencyMs)} ms</span>
                  {frozen && <span className="mc-device__frozen" title="Frame stream frozen">⚠ frozen</span>}
                </li>
              )
            })}
          </ul>

          {active && view && (
            <>
              <div className="mc-quality">
                <span className="mc-quality__dot" style={{ background: qualityColor(active.latencyMs) }} />
                <span className="mc-quality__text">
                  Link quality: {active.latencyMs < 50 ? 'Excellent' : active.latencyMs < 150 ? 'Good' : 'Poor'}
                  · {Math.round(active.latencyMs)} ms
                </span>
              </div>

              <details open={expandedHardware} onToggle={e => setExpandedHardware((e.target as HTMLDetailsElement).open)}>
                <summary className="mc-section__summary">📷 Hardware controls</summary>
                <div className="mc-section__body">
                  <div className="mc-row">
                    <label className="mc-row__label">Facing</label>
                    <div className="mc-btn-group">
                      <button className={view.facing === 'back' ? 'mc-btn mc-btn--active' : 'mc-btn'}
                        onClick={() => {
                          p.onSendCommand(active.deviceId, 'camera_flip', 'back')
                          p.onUpdateView(active.deviceId, { facing: 'back' })
                        }}>Back</button>
                      <button className={view.facing === 'front' ? 'mc-btn mc-btn--active' : 'mc-btn'}
                        onClick={() => {
                          p.onSendCommand(active.deviceId, 'camera_flip', 'front')
                          p.onUpdateView(active.deviceId, { facing: 'front' })
                        }}>Front</button>
                    </div>
                  </div>

                  {(() => {
                    const caps = active.capabilities.zoom
                    const min = caps?.min ?? 1
                    const max = caps?.max ?? 8
                    const step = caps?.step ?? 0.1
                    return (
                      <div className="mc-row">
                        <label className="mc-row__label">Zoom: {view.zoom.toFixed(1)}×</label>
                        <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, view.zoom))}
                          onChange={e => {
                            const z = Number(e.target.value)
                            p.onUpdateView(active.deviceId, { zoom: z })
                            p.onSendCommand(active.deviceId, 'set_zoom', z)
                          }} />
                      </div>
                    )
                  })()}

                  <div className="mc-row">
                    <label className="mc-row__label">Exposure: {view.exposure > 0 ? `+${view.exposure}` : view.exposure}</label>
                    <input type="range" min={-10} max={10} step={1} value={view.exposure}
                      onChange={e => {
                        const v = Number(e.target.value)
                        p.onUpdateView(active.deviceId, { exposure: v })
                        p.onSendCommand(active.deviceId, 'set_exposure', v)
                      }} />
                  </div>

                  <div className="mc-row">
                    <label className="mc-row__label">White balance</label>
                    <select value={view.whiteBalance}
                      onChange={e => {
                        const wb = e.target.value as MobileCameraView['whiteBalance']
                        p.onUpdateView(active.deviceId, { whiteBalance: wb })
                        p.onSendCommand(active.deviceId, 'set_white_balance', wb)
                      }}>
                      {WB_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </div>

                  <div className="mc-row">
                    <label className="mc-row__label">Torch</label>
                    <div className="mc-btn-group">
                      {(['off', 'on', 'auto'] as const).map(t => (
                        <button key={t}
                          className={view.torch === t ? 'mc-btn mc-btn--active' : 'mc-btn'}
                          disabled={!active.capabilities.torchSupported}
                          onClick={() => {
                            p.onUpdateView(active.deviceId, { torch: t })
                            p.onSendCommand(active.deviceId, 'set_torch', t)
                          }}>{t.toUpperCase()}</button>
                      ))}
                    </div>
                  </div>

                  <div className="mc-row">
                    <label className="mc-row__label">Resolution</label>
                    <select value={`${view.resolution.width}x${view.resolution.height}@${view.frameRate}`}
                      onChange={e => {
                        const [wh, fps] = e.target.value.split('@')
                        const [w, h] = wh.split('x').map(Number)
                        const f = Number(fps)
                        p.onUpdateView(active.deviceId, { resolution: { width: w, height: h }, frameRate: f })
                        p.onSendCommand(active.deviceId, 'set_format', { width: w, height: h, frameRate: f })
                      }}>
                      {(active.capabilities.resolutions && active.capabilities.resolutions.length > 0
                        ? active.capabilities.resolutions.flatMap(r =>
                            r.fps.map(f => `${r.width}x${r.height}@${f}`))
                        : ['640x480@30','1280x720@30','1920x1080@30','1920x1080@60']).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </details>

              <details open={expandedFilters} onToggle={e => setExpandedFilters((e.target as HTMLDetailsElement).open)}>
                <summary className="mc-section__summary">🎨 Filters & color grading</summary>
                <div className="mc-section__body">
                  <FilterPanel
                    filters={view.filters}
                    onChange={patch => p.onUpdateView(active.deviceId, { filters: { ...view.filters, ...patch } })}
                    onPreset={preset => p.onApplyPreset(active.deviceId, preset)}
                  />
                </div>
              </details>

              <div className="mc-row mc-row--flip">
                <label><input type="checkbox" checked={view.flipH}
                  onChange={e => p.onUpdateView(active.deviceId, { flipH: e.target.checked })} /> Flip ↔</label>
                <label><input type="checkbox" checked={view.flipV}
                  onChange={e => p.onUpdateView(active.deviceId, { flipV: e.target.checked })} /> Flip ↕</label>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
