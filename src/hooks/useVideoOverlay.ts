import { useState, useRef, useCallback, useEffect } from 'react'
import { VideoOverlayItem, VideoOverlaySettings } from '../types'

export const DEFAULT_VIDEO_OVERLAY: VideoOverlaySettings = {
  activeId: null,
  visible: false,
  opacity: 0.8,
  volume: 0,
  muted: true,
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

  // Debounce timers for IPC sync — prevents flooding the IPC channel during
  // rapid slider changes (opacity, position, volume) from causing lag/stutter.
  const visualSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioSyncTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // ── Load video into element ───────────────────────────────────────────────────
  function loadVideo(el: HTMLVideoElement, item: VideoOverlayItem, s: VideoOverlaySettings) {
    el.preload = 'auto'
    el.loop    = s.loop
    el.muted   = s.muted
    el.volume  = s.volume

    // Only reload if src actually changed — prevents interrupting playback
    const newSrc = item.objectURL
    if (el.src !== newSrc) {
      el.src = newSrc
      el.load()
    }
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
    // Apply audio settings
    el.volume = s.volume
    el.muted  = s.muted
    el.loop   = s.loop
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
    syncToPresentation({ action: 'load', src: item.objectURL })
  }, [settings.activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply CSS settings directly to DOM — debounced IPC to avoid stutter ──────
  useEffect(() => {
    const el = elRef.current
    if (!el) return

    // Apply CSS immediately (no delay on local display)
    applyCSS(el, settingsRef.current)

    // Debounce the IPC message — rapid slider drags collapse into one message
    if (visualSyncTimer.current) clearTimeout(visualSyncTimer.current)
    visualSyncTimer.current = setTimeout(() => {
      const s = settingsRef.current
      syncToPresentation({
        action:         'settings',
        visible:        s.visible,
        opacity:        s.opacity,
        positionX:      s.positionX,
        positionY:      s.positionY,
        width:          s.width,
        height:         s.height,
        maintainAspect: s.maintainAspect,
      })
      visualSyncTimer.current = null
    }, 60)
  }, [settings.visible, settings.opacity, settings.positionX, settings.positionY,
      settings.width, settings.height, settings.maintainAspect]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Volume / muted / loop — direct DOM only, debounced IPC ───────────────────
  useEffect(() => {
    const el = elRef.current
    if (!el) return

    // Apply immediately to local element (no interruption to playback)
    el.volume = settingsRef.current.volume
    el.muted  = settingsRef.current.muted
    el.loop   = settingsRef.current.loop

    if (audioSyncTimer.current) clearTimeout(audioSyncTimer.current)
    audioSyncTimer.current = setTimeout(() => {
      const s = settingsRef.current
      syncToPresentation({ action: 'audio', volume: s.volume, muted: s.muted, loop: s.loop })
      audioSyncTimer.current = null
    }, 60)
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
    el.play().catch(() => {})
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
