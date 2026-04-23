import { useEffect } from 'react'
import { MobileBridgeDevice } from '../types/electron'
import { MobileCameraView, FilterPresetId } from '../hooks/useMobileCameras'
import { FilterPanel } from './FilterPanel'

interface MobileBridgeSettingsModalProps {
  device: MobileBridgeDevice | null
  view: MobileCameraView | null
  onClose: () => void
  onSendCommand: (action: string, value?: unknown) => void
  onUpdateView:  (patch: Partial<MobileCameraView>) => void
  onApplyPreset: (preset: FilterPresetId) => void
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
  if (latencyMs < 50)  return '#22c55e'
  if (latencyMs < 150) return '#f59e0b'
  return '#ef4444'
}

export function MobileBridgeSettingsModal({
  device, view, onClose, onSendCommand, onUpdateView, onApplyPreset,
}: MobileBridgeSettingsModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!device || !view) return null

  const zoomCaps = device.capabilities.zoom
  const zMin  = zoomCaps?.min  ?? 1
  const zMax  = zoomCaps?.max  ?? 8
  const zStep = zoomCaps?.step ?? 0.1

  return (
    <div className="mbs-backdrop" onClick={onClose}>
      <div className="mbs-modal" onClick={e => e.stopPropagation()}>
        <header className="mbs-head">
          <div className="mbs-head__title">
            <span className="mbs-head__icon">📱</span>
            <span>{device.deviceName}</span>
          </div>
          <div className="mbs-head__meta">
            <span className="mbs-head__dot" style={{ background: qualityColor(device.latencyMs) }} />
            <span className="mbs-head__latency">{Math.round(device.latencyMs)} ms</span>
            <button className="mbs-head__close" onClick={onClose} title="Close">✕</button>
          </div>
        </header>

        <div className="mbs-body">
          {/* ── Hardware ─────────────────────────────────────────────────── */}
          <section className="mbs-section">
            <h4 className="mbs-section__title">📷 Hardware controls</h4>

            <div className="mbs-row">
              <label className="mbs-row__label">Facing</label>
              <div className="mbs-btn-group">
                <button className={view.facing === 'back' ? 'mbs-btn mbs-btn--active' : 'mbs-btn'}
                  onClick={() => { onSendCommand('camera_flip', 'back');  onUpdateView({ facing: 'back' }) }}>Back</button>
                <button className={view.facing === 'front' ? 'mbs-btn mbs-btn--active' : 'mbs-btn'}
                  onClick={() => { onSendCommand('camera_flip', 'front'); onUpdateView({ facing: 'front' }) }}>Front</button>
              </div>
            </div>

            <div className="mbs-row">
              <label className="mbs-row__label">Zoom: {view.zoom.toFixed(1)}×</label>
              <input type="range" min={zMin} max={zMax} step={zStep}
                value={Math.min(zMax, Math.max(zMin, view.zoom))}
                onChange={e => {
                  const z = Number(e.target.value)
                  onUpdateView({ zoom: z })
                  onSendCommand('set_zoom', z)
                }} />
            </div>

            <div className="mbs-row">
              <label className="mbs-row__label">Exposure: {view.exposure > 0 ? `+${view.exposure}` : view.exposure}</label>
              <input type="range" min={-10} max={10} step={1} value={view.exposure}
                onChange={e => {
                  const v = Number(e.target.value)
                  onUpdateView({ exposure: v })
                  onSendCommand('set_exposure', v)
                }} />
            </div>

            <div className="mbs-row">
              <label className="mbs-row__label">White balance</label>
              <select value={view.whiteBalance}
                onChange={e => {
                  const wb = e.target.value as MobileCameraView['whiteBalance']
                  onUpdateView({ whiteBalance: wb })
                  onSendCommand('set_white_balance', wb)
                }}>
                {WB_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>

            <div className="mbs-row">
              <label className="mbs-row__label">Torch</label>
              <div className="mbs-btn-group">
                {(['off', 'on', 'auto'] as const).map(t => (
                  <button key={t}
                    className={view.torch === t ? 'mbs-btn mbs-btn--active' : 'mbs-btn'}
                    onClick={() => { onUpdateView({ torch: t }); onSendCommand('set_torch', t) }}>
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="mbs-row">
              <label className="mbs-row__label">Resolution / FPS</label>
              <select value={`${view.resolution.width}x${view.resolution.height}@${view.frameRate}`}
                onChange={e => {
                  const [wh, fps] = e.target.value.split('@')
                  const [w, h] = wh.split('x').map(Number)
                  const f = Number(fps)
                  onUpdateView({ resolution: { width: w, height: h }, frameRate: f })
                  onSendCommand('set_format', { width: w, height: h, frameRate: f })
                }}>
                {(device.capabilities.resolutions && device.capabilities.resolutions.length > 0
                  ? device.capabilities.resolutions.flatMap(r => r.fps.map(f => `${r.width}x${r.height}@${f}`))
                  : ['640x480@30','1280x720@30','1920x1080@30','1920x1080@60']).map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div className="mbs-row mbs-row--inline">
              <label><input type="checkbox" checked={view.flipH}
                onChange={e => onUpdateView({ flipH: e.target.checked })} /> Flip ↔</label>
              <label><input type="checkbox" checked={view.flipV}
                onChange={e => onUpdateView({ flipV: e.target.checked })} /> Flip ↕</label>
            </div>
          </section>

          {/* ── Filters & grading ───────────────────────────────────────── */}
          <section className="mbs-section">
            <h4 className="mbs-section__title">🎨 Filters & color grading</h4>
            <FilterPanel
              filters={view.filters}
              onChange={patch => onUpdateView({ filters: { ...view.filters, ...patch } })}
              onPreset={preset => onApplyPreset(preset)}
            />
          </section>
        </div>
      </div>
    </div>
  )
}
