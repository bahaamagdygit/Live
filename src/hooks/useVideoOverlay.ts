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
  const currentTimeRef = useRef(0)

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

  // ── Direct DOM: keep the main-window element hidden — video only shows on
  // the presentation screen. The element still needs a src/play for time tracking.
  function applyCSS(el: HTMLVideoElement, _s: VideoOverlaySettings) {
    el.style.display  = 'none'
    el.style.width    = '1px'
    el.style.height   = '1px'
    el.style.opacity  = '0'
    el.style.position = 'absolute'
    el.style.left     = '-9999px'
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
  const onDurChange   = useCallback(function(this: HTMLVideoElement) { setDuration(isFinite(this.duration) ? this.duration : 0) }, [])
  const onEndedEvt    = useCallback(() => {
    if (playTimerRef.current) { clearInterval(playTimerRef.current); playTimerRef.current = null }
    setIsPlaying(false)
    currentTimeRef.current = 0
    setCurrentTime(0)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setVideoEl = useCallback((el: HTMLVideoElement | null) => {
    const old = elRef.current
    if (old) {
      old.removeEventListener('durationchange', onDurChange)
      old.removeEventListener('ended',          onEndedEvt)
    }

    elRef.current = el
    if (!el) return

    el.addEventListener('durationchange', onDurChange)
    el.addEventListener('ended',          onEndedEvt)

    // If a video is already selected, load it immediately
    const s = settingsRef.current
    const item = videosRef.current.find(v => v.id === s.activeId)
    if (item) {
      loadVideo(el, item, s)
    }
    applyCSS(el, s)
    el.volume = s.volume
    el.muted  = s.muted
    el.loop   = s.loop
  }, [onDurChange, onEndedEvt])

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
    // Send the disk file path so the presentation window (separate process)
    // can load the video via file:// — objectURL is not valid cross-process.
    const fileSrc = item.filePath && item.filePath !== item.name
      ? `file://${item.filePath.replace(/\\/g, '/')}`
      : item.objectURL
    syncToPresentation({ action: 'load', src: fileSrc })
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
  // The main-window <video> element is NOT played — it would decode the video a
  // second time, competing with the presentation window and causing lag.
  // We track currentTime with a lightweight JS timer instead.
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const playStartTimeRef = useRef(0)   // wall-clock ms when play started
  const playOffsetRef    = useRef(0)   // currentTime value at the moment play started

  const stopPlayTimer = useCallback(() => {
    if (playTimerRef.current) { clearInterval(playTimerRef.current); playTimerRef.current = null }
  }, [])

  const play = useCallback(() => {
    const el = elRef.current
    if (!el) return
    // Get duration from the local element (it has src loaded, just not playing)
    setIsPlaying(true)
    playStartTimeRef.current = performance.now()
    playOffsetRef.current    = currentTimeRef.current
    stopPlayTimer()
    playTimerRef.current = setInterval(() => {
      const elapsed = (performance.now() - playStartTimeRef.current) / 1000
      const next = playOffsetRef.current + elapsed
      const dur  = elRef.current?.duration ?? 0
      setCurrentTime(dur > 0 ? Math.min(next, dur) : next)
    }, 250)
    syncToPresentation({ action: 'play' })
  }, [stopPlayTimer])

  const pause = useCallback(() => {
    stopPlayTimer()
    setIsPlaying(false)
    syncToPresentation({ action: 'pause' })
  }, [stopPlayTimer])

  const stop = useCallback(() => {
    stopPlayTimer()
    setCurrentTime(0)
    setIsPlaying(false)
    playOffsetRef.current = 0
    syncToPresentation({ action: 'stop' })
  }, [stopPlayTimer])

  const seek = useCallback((time: number) => {
    playOffsetRef.current    = time
    playStartTimeRef.current = performance.now()
    setCurrentTime(time)
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
