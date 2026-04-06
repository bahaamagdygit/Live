import { useRef, useCallback } from 'react'
import { VideoOverlayItem, VideoOverlaySettings } from '../types'

interface VideoOverlayPanelProps {
  videos: VideoOverlayItem[]
  settings: VideoOverlaySettings
  isPlaying: boolean
  currentTime: number
  duration: number
  onAddVideo: (filePath: string, name: string, base64: string, mimeType: 'video/mp4' | 'video/webm') => void
  onRemoveVideo: (id: string) => void
  onSelectVideo: (id: string | null) => void
  onUpdateSettings: (patch: Partial<VideoOverlaySettings>) => void
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onSeek: (time: number) => void
}

function formatTime(s: number): string {
  if (!isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function VideoOverlayPanel({
  videos, settings, isPlaying, currentTime, duration,
  onAddVideo, onRemoveVideo, onSelectVideo, onUpdateSettings,
  onPlay, onPause, onStop, onSeek,
}: VideoOverlayPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const mimeType = file.type === 'video/webm' ? 'video/webm' : 'video/mp4'
    const reader = new FileReader()
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string
      onAddVideo(file.path || file.name, file.name.replace(/\.[^.]+$/, ''), base64, mimeType)
    }
    reader.readAsDataURL(file)
    // reset so same file can be re-selected
    e.target.value = ''
  }, [onAddVideo])

  const activeVideo = videos.find(v => v.id === settings.activeId) ?? null

  return (
    <div className="panel video-overlay-panel">
      <div className="panel__header">
        <h3 className="panel__title">
          <span className="panel__title-icon">🎬</span>
          Video Overlay
        </h3>
        <div className="panel__header-actions">
          <button
            type="button"
            className={`btn btn--icon ${settings.visible ? 'btn--active' : ''}`}
            title={settings.visible ? 'Hide overlay' : 'Show overlay'}
            disabled={!activeVideo}
            onClick={() => onUpdateSettings({ visible: !settings.visible })}
          >👁</button>
          <button
            type="button"
            className="btn btn--icon"
            title="Upload video"
            onClick={() => fileInputRef.current?.click()}
          >＋</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>
      </div>

      <div className="panel__content">

        {/* ── Video Library ── */}
        <div className="vop__library">
          {videos.length === 0 && (
            <div className="empty-state">
              <div className="empty-state__icon">🎬</div>
              <p>No videos uploaded</p>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => fileInputRef.current?.click()}
              >Upload MP4 / WebM</button>
            </div>
          )}
          {videos.map(v => (
            <div
              key={v.id}
              className={`vop__video-item ${settings.activeId === v.id ? 'vop__video-item--active' : ''}`}
              onClick={() => onSelectVideo(v.id)}
              title={v.name}
            >
              <span className="vop__video-icon">🎞</span>
              <span className="vop__video-name">{v.name}</span>
              <button
                type="button"
                className="vop__video-remove"
                title="Remove"
                onClick={e => { e.stopPropagation(); onRemoveVideo(v.id) }}
              >×</button>
            </div>
          ))}
        </div>

        {/* ── Playback Controls ── */}
        {activeVideo && (
          <>
            <div className="vop__section-title">Playback</div>

            {/* Progress bar */}
            <div className="vop__progress-wrap">
              <span className="vop__time">{formatTime(currentTime)}</span>
              <input
                type="range"
                className="vop__progress"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={e => onSeek(Number(e.target.value))}
                title="Seek"
              />
              <span className="vop__time">{formatTime(duration)}</span>
            </div>

            {/* Play / Pause / Stop */}
            <div className="vop__playback-btns">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={isPlaying ? onPause : onPlay}
                title={isPlaying ? 'Pause' : 'Play'}
              >{isPlaying ? '⏸ Pause' : '▶ Play'}</button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={onStop}
                title="Stop"
              >⏹ Stop</button>
              <button
                type="button"
                className={`btn btn--sm ${settings.loop ? 'btn--active' : 'btn--ghost'}`}
                onClick={() => onUpdateSettings({ loop: !settings.loop })}
                title="Loop"
              >🔁</button>
              <button
                type="button"
                className={`btn btn--sm ${settings.muted ? 'btn--active' : 'btn--ghost'}`}
                onClick={() => onUpdateSettings({ muted: !settings.muted })}
                title={settings.muted ? 'Unmute' : 'Mute'}
              >{settings.muted ? '🔇' : '🔊'}</button>
            </div>

            {/* Volume */}
            <div className="vop__slider-row">
              <label className="vop__label">Volume {Math.round(settings.volume * 100)}%</label>
              <input
                type="range" min={0} max={1} step={0.01}
                value={settings.volume}
                onChange={e => onUpdateSettings({ volume: Number(e.target.value) })}
                title="Volume"
              />
            </div>

            {/* Opacity */}
            <div className="vop__slider-row">
              <label className="vop__label">Opacity {Math.round(settings.opacity * 100)}%</label>
              <input
                type="range" min={0} max={1} step={0.01}
                value={settings.opacity}
                onChange={e => onUpdateSettings({ opacity: Number(e.target.value) })}
                title="Opacity"
              />
            </div>

            {/* ── Position & Size ── */}
            <div className="vop__section-title">Position &amp; Size</div>

            <div className="vop__grid2">
              <div className="vop__slider-row">
                <label className="vop__label">X {settings.positionX}px</label>
                <input
                  type="range" min={-960} max={960} step={1}
                  value={settings.positionX}
                  onChange={e => onUpdateSettings({ positionX: Number(e.target.value) })}
                  title="X position"
                />
              </div>
              <div className="vop__slider-row">
                <label className="vop__label">Y {settings.positionY}px</label>
                <input
                  type="range" min={-540} max={540} step={1}
                  value={settings.positionY}
                  onChange={e => onUpdateSettings({ positionY: Number(e.target.value) })}
                  title="Y position"
                />
              </div>
              <div className="vop__slider-row">
                <label className="vop__label">W {settings.width}px</label>
                <input
                  type="range" min={160} max={1920} step={10}
                  value={settings.width}
                  onChange={e => onUpdateSettings({ width: Number(e.target.value) })}
                  title="Width"
                />
              </div>
              <div className="vop__slider-row">
                <label className="vop__label">H {settings.height}px</label>
                <input
                  type="range" min={90} max={1080} step={10}
                  value={settings.height}
                  onChange={e => onUpdateSettings({ height: Number(e.target.value) })}
                  title="Height"
                />
              </div>
            </div>

            <div className="vop__check-row">
              <label className="vop__check-label">
                <input
                  type="checkbox"
                  checked={settings.maintainAspect}
                  onChange={e => onUpdateSettings({ maintainAspect: e.target.checked })}
                />
                <span>Maintain aspect ratio</span>
              </label>
            </div>

            {/* Quick position presets */}
            <div className="vop__section-title">Quick Position</div>
            <div className="vop__preset-btns">
              {[
                { label: 'Center', x: 0, y: 0, w: 1920, h: 1080 },
                { label: 'Top-L', x: -480, y: -270, w: 960, h: 540 },
                { label: 'Top-R', x: 480, y: -270, w: 960, h: 540 },
                { label: 'Bot-L', x: -480, y: 270, w: 960, h: 540 },
                { label: 'Bot-R', x: 480, y: 270, w: 960, h: 540 },
                { label: 'Full', x: 0, y: 0, w: 1920, h: 1080 },
              ].map(p => (
                <button
                  key={p.label}
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => onUpdateSettings({ positionX: p.x, positionY: p.y, width: p.w, height: p.h })}
                >{p.label}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer status */}
      <div className="panel__footer">
        <div className="camera-status">
          {activeVideo
            ? <span className="status-text">
                {settings.visible
                  ? <><span className="dot dot--green" />{activeVideo.name}</>
                  : <span className="status-text--muted">{activeVideo.name} (hidden)</span>
                }
              </span>
            : <span className="status-text status-text--muted">No video selected</span>
          }
        </div>
      </div>
    </div>
  )
}
