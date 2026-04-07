import { useState, useRef, useCallback, useEffect } from 'react'
import { VideoOverlayItem, VideoOverlaySettings } from '../types'

export const DEFAULT_VIDEO_OVERLAY: VideoOverlaySettings = {
  activeId: null,
  visible: false,
  opacity: 1,
  volume: 1,
  muted: false,
  loop: false,
  positionX: 0,
  positionY: 0,
  width: 1920,
  height: 1080,
  maintainAspect: true,
}

interface UseVideoOverlayReturn {
  videos: VideoOverlayItem[]
  settings: VideoOverlaySettings
  isPlaying: boolean
  currentTime: number
  duration: number
  addVideo: (file: File) => void
  removeVideo: (id: string) => void
  selectVideo: (id: string | null) => void
  updateSettings: (patch: Partial<VideoOverlaySettings>) => void
  play: () => void
  pause: () => void
  stop: () => void
  seek: (time: number) => void
  setVideoEl: (el: HTMLVideoElement | null) => void
}

export function useVideoOverlay(): UseVideoOverlayReturn {
  const [videos, setVideos] = useState<VideoOverlayItem[]>([])
  const [settings, setSettings] = useState<VideoOverlaySettings>(DEFAULT_VIDEO_OVERLAY)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // The actual <video> DOM element — set via callback ref from MainPreview
  const elRef = useRef<HTMLVideoElement | null>(null)

  // Always-current refs — updated synchronously in updateSettings so DOM effects
  // never read stale values (unlike useEffect-synced refs which lag one frame).
  const settingsRef = useRef(settings)
  const videosRef = useRef(videos)

  // ── Direct DOM: apply CSS properties without touching React state ─────────────
  function applyCSS(el: HTMLVideoElement, s: VideoOverlaySettings) {
    el.style.display  = s.visible ? 'block' : 'none'
    el.style.opacity  = String(s.opacity)
    const vx = s.positionX, vy = s.positionY, vw = s.width, vh = s.height
    el.style.left     = `${960 + vx - vw / 2}px`
    el.style.top      = `${540 + vy - vh / 2}px`
    el.style.width    = `${vw}px`
    el.style.height   = s.maintainAspect ? 'auto' : `${vh}px`
  }

  // ── Load video into element — waits for canplaythrough before resolving ───────
  function loadVideo(el: HTMLVideoElement, item: VideoOverlayItem, s: VideoOverlaySettings) {
    el.preload = 'auto'
    el.loop    = s.loop
    el.muted   = s.muted
    el.volume  = s.volume

    // Only reload if src actually changed
    const newSrc = item.objectURL
    if (el.src !== newSrc) {
      console.log('[VideoOverlay] Loading src:', item.name)
      el.src = newSrc
      el.load()
    }

    el.addEventListener('canplaythrough', () => {
      console.log('[VideoOverlay] canplaythrough — readyState:', el.readyState,
        '| buffered ranges:', el.buffered.length,
        '| duration:', el.duration)
    }, { once: true })

    el.addEventListener('playing', () => {
      console.log('[VideoOverlay] playing — readyState:', el.readyState,
        '| currentTime:', el.currentTime)
    }, { once: true })
  }

  // ── Callback ref ─────────────────────────────────────────────────────────────
  const onTimeUpdate  = useCallback(function(this: HTMLVideoElement) { setCurrentTime(this.currentTime) }, [])
  const onDurChange   = useCallback(function(this: HTMLVideoElement) { setDuration(isFinite(this.duration) ? this.duration : 0) }, [])
  const onPlayEvt     = useCallback(() => setIsPlaying(true), [])
  const onPauseEvt    = useCallback(() => setIsPlaying(false), [])
  const onEndedEvt    = useCallback(() => { setIsPlaying(false); setCurrentTime(0) }, [])

  const setVideoEl = useCallback((el: HTMLVideoElement | null) => {
    const old = elRef.current
    if (old) {
      old.removeEventListener('timeupdate',     onTimeUpdate)
      old.removeEventListener('durationchange', onDurChange)
      old.removeEventListener('play',           onPlayEvt)
      old.removeEventListener('pause',          onPauseEvt)
      old.removeEventListener('ended',          onEndedEvt)
    }

    elRef.current = el
    if (!el) return

    console.log('[VideoOverlay] Video element mounted')

    el.addEventListener('timeupdate',     onTimeUpdate)
    el.addEventListener('durationchange', onDurChange)
    el.addEventListener('play',           onPlayEvt)
    el.addEventListener('pause',          onPauseEvt)
    el.addEventListener('ended',          onEndedEvt)

    // If a video is already selected, load it immediately
    const s = settingsRef.current
    const item = videosRef.current.find(v => v.id === s.activeId)
    if (item) {
      loadVideo(el, item, s)
    }
    // Apply current CSS directly
    applyCSS(el, s)
  }, [onTimeUpdate, onDurChange, onPlayEvt, onPauseEvt, onEndedEvt])

  // ── When active video changes — load new src ──────────────────────────────────
  useEffect(() => {
    const el = elRef.current
    const s  = settingsRef.current
    const item = videosRef.current.find(v => v.id === s.activeId)
    if (!el) return
    if (!item) {
      el.pause()
      el.removeAttribute('src')
      setIsPlaying(false); setCurrentTime(0); setDuration(0)
      return
    }
    loadVideo(el, item, s)
    setIsPlaying(false); setCurrentTime(0)
    syncToPresentation({ src: item.objectURL, action: 'load' })
  }, [settings.activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply CSS settings directly to DOM (no re-render) ────────────────────────
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    applyCSS(el, settingsRef.current)
    syncToPresentation({
      action: 'settings',
      visible:        settingsRef.current.visible,
      opacity:        settingsRef.current.opacity,
      positionX:      settingsRef.current.positionX,
      positionY:      settingsRef.current.positionY,
      width:          settingsRef.current.width,
      height:         settingsRef.current.height,
      maintainAspect: settingsRef.current.maintainAspect,
    })
  }, [settings.visible, settings.opacity, settings.positionX, settings.positionY,
      settings.width, settings.height, settings.maintainAspect]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Volume / muted / loop — direct DOM only ───────────────────────────────────
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    el.volume = settingsRef.current.volume
    el.muted  = settingsRef.current.muted
    el.loop   = settingsRef.current.loop
    syncToPresentation({
      action: 'audio',
      volume: settingsRef.current.volume,
      muted:  settingsRef.current.muted,
      loop:   settingsRef.current.loop,
    })
  }, [settings.volume, settings.muted, settings.loop]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Periodic currentTime sync to presentation (every 5 s) ────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const el = elRef.current
      if (!el || el.paused) return
      syncToPresentation({ action: 'sync-time', currentTime: el.currentTime })
    }, 5000)
    return () => clearInterval(id)
  }, [])

  // ── addVideo ──────────────────────────────────────────────────────────────────
  const addVideo = useCallback((file: File) => {
    const objectURL = URL.createObjectURL(file)
    const mimeType: 'video/mp4' | 'video/webm' = file.type === 'video/webm' ? 'video/webm' : 'video/mp4'
    const id = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const name = file.name.replace(/\.[^.]+$/, '')
    setVideos(prev => {
      const next = [...prev, { id, name, filePath: (file as any).path || file.name, objectURL, mimeType }]
      videosRef.current = next
      return next
    })
  }, [])

  const removeVideo = useCallback((id: string) => {
    setVideos(prev => {
      const item = prev.find(v => v.id === id)
      if (item) URL.revokeObjectURL(item.objectURL)
      const next = prev.filter(v => v.id !== id)
      videosRef.current = next
      return next
    })
    setSettings(prev => {
      const next = prev.activeId === id ? { ...prev, activeId: null, visible: false } : prev
      settingsRef.current = next
      return next
    })
  }, [])

  const selectVideo = useCallback((id: string | null) => {
    setSettings(prev => {
      const next = { ...prev, activeId: id }
      settingsRef.current = next
      return next
    })
  }, [])

  // updateSettings — writes React state (for panel UI) AND syncs ref immediately
  // so DOM effects in the same tick read fresh values, not stale ones.
  const updateSettings = useCallback((patch: Partial<VideoOverlaySettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      settingsRef.current = next   // ← synchronous, no 1-frame lag
      return next
    })
  }, [])

  // ── Playback controls ─────────────────────────────────────────────────────────
  const play = useCallback(() => {
    const el = elRef.current
    if (!el) return
    console.log('[VideoOverlay] play() — readyState:', el.readyState,
      '| buffered:', el.buffered.length > 0
        ? `0–${el.buffered.end(0).toFixed(1)}s of ${el.duration?.toFixed(1)}s`
        : 'none')
    el.play()
    syncToPresentation({ action: 'play' })
  }, [])

  const pause = useCallback(() => {
    elRef.current?.pause()
    syncToPresentation({ action: 'pause' })
  }, [])

  const stop = useCallback(() => {
    const el = elRef.current
    if (!el) return
    el.pause()
    el.currentTime = 0
    setCurrentTime(0)
    setIsPlaying(false)
    syncToPresentation({ action: 'stop' })
  }, [])

  const seek = useCallback((time: number) => {
    if (elRef.current) elRef.current.currentTime = time
    syncToPresentation({ action: 'seek', currentTime: time })
  }, [])

  return {
    videos, settings, isPlaying, currentTime, duration,
    addVideo, removeVideo, selectVideo, updateSettings,
    play, pause, stop, seek, setVideoEl,
  }
}

// ── IPC helper ────────────────────────────────────────────────────────────────
function syncToPresentation(msg: Record<string, unknown>) {
  try {
    window.electronAPI?.syncVideoOverlay?.(msg)
  } catch {}
}
