import { FilterState, FilterPresetId, DEFAULT_FILTERS } from '../hooks/useMobileCameras'

interface FilterPanelProps {
  filters: FilterState
  onChange: (patch: Partial<FilterState>) => void
  onPreset: (preset: FilterPresetId) => void
  compact?: boolean
}

const PRESETS: Array<{ id: FilterPresetId; label: string; swatch: string }> = [
  { id: 'natural',    label: 'Natural',     swatch: 'linear-gradient(135deg,#fefcf5,#f0e6d2)' },
  { id: 'warm',       label: 'Warm',        swatch: 'linear-gradient(135deg,#fbbf24,#b45309)' },
  { id: 'cool',       label: 'Cool',        swatch: 'linear-gradient(135deg,#60a5fa,#1d4ed8)' },
  { id: 'dramatic',   label: 'Dramatic',    swatch: 'linear-gradient(135deg,#111827,#4b5563)' },
  { id: 'bw',         label: 'B & W',       swatch: 'linear-gradient(135deg,#f5f5f5,#111)' },
  { id: 'churchGlow', label: 'Church Glow', swatch: 'linear-gradient(135deg,#fde68a,#b45309)' },
  { id: 'reset',      label: 'Reset',       swatch: 'linear-gradient(135deg,#27272a,#52525b)' },
]

interface SliderRowProps {
  label: string; value: number; min: number; max: number; step: number; suffix: string
  onChange: (v: number) => void; neutral?: number
}
function SliderRow({ label, value, min, max, step, suffix, onChange, neutral }: SliderRowProps) {
  const pct = ((value - min) / (max - min)) * 100
  const isDefault = neutral != null && Math.abs(value - neutral) < step / 2
  return (
    <div className="fp-row">
      <div className="fp-row__head">
        <span className="fp-row__label">{label}</span>
        <span className={`fp-row__value ${isDefault ? 'fp-row__value--neutral' : ''}`}>
          {value.toFixed(step < 1 ? 1 : 0)}{suffix}
        </span>
      </div>
      <input
        className="fp-row__slider"
        type="range"
        min={min} max={max} step={step} value={value}
        style={{ background: `linear-gradient(to right, #818cf8 0%, #818cf8 ${pct}%, #27272a ${pct}%, #27272a 100%)` }}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export function FilterPanel({ filters, onChange, onPreset, compact }: FilterPanelProps) {
  return (
    <div className={`fp ${compact ? 'fp--compact' : ''}`}>
      <div className="fp-presets">
        {PRESETS.map(p => (
          <button
            key={p.id}
            className="fp-preset"
            onClick={() => onPreset(p.id)}
            title={p.label}
          >
            <span className="fp-preset__swatch" style={{ background: p.swatch }} />
            <span className="fp-preset__label">{p.label}</span>
          </button>
        ))}
      </div>

      <div className="fp-sliders">
        <SliderRow label="Brightness" value={filters.brightness} min={0} max={200} step={1} suffix="%" onChange={v => onChange({ brightness: v })} neutral={100} />
        <SliderRow label="Contrast"   value={filters.contrast}   min={0} max={200} step={1} suffix="%" onChange={v => onChange({ contrast: v })}   neutral={100} />
        <SliderRow label="Saturation" value={filters.saturation} min={0} max={200} step={1} suffix="%" onChange={v => onChange({ saturation: v })} neutral={100} />
        <SliderRow label="Hue"        value={filters.hue}        min={0} max={360} step={1} suffix="°" onChange={v => onChange({ hue: v })}        neutral={0} />
        <SliderRow label="Sepia"      value={filters.sepia}      min={0} max={100} step={1} suffix="%" onChange={v => onChange({ sepia: v })}      neutral={0} />
        <SliderRow label="Grayscale"  value={filters.grayscale}  min={0} max={100} step={1} suffix="%" onChange={v => onChange({ grayscale: v })}  neutral={0} />
        <SliderRow label="Blur"       value={filters.blur}       min={0} max={10}  step={0.1} suffix="px" onChange={v => onChange({ blur: v })}    neutral={0} />
        <SliderRow label="Opacity"    value={filters.opacity}    min={0} max={100} step={1} suffix="%" onChange={v => onChange({ opacity: v })}    neutral={100} />
      </div>

      <button className="fp-reset" onClick={() => onChange({ ...DEFAULT_FILTERS })}>
        ↺ Reset all to default
      </button>
    </div>
  )
}
