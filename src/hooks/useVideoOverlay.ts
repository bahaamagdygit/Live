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
  // settings that cause React re-renders (library list, playback state display)
  const [settings, setSettings] = useState<VideoOverlaySettings>(DEFAULT_VIDEO_OVERLAY)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // The actual <video> DOM element — set via callback ref from MainPreview
  const elRef = useRef<HTMLVideoElement | null>(null)
  // Latest settings kept in a ref so DOM-manipulation effects always see current values
  const settingsRef = useRef(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])
  const videosRef = useRef(videos)
  useEffect(() => { videosRef.current = videos }, [videos])

  // ── Callback ref ─────────────────────────────────────────────────────────────
  // React calls this whenever the <video> element mounts or unmounts.
  // Using named functions so removeEventListener can reference the same instances.
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

    el.preload = 'metadata'
    el.addEventListener('timeupdate',     onTimeUpdate)
    el.addEventListener('durationchange', onDurChange)
    el.addEventListener('play',           onPlayEvt)
    el.addEventListener('pause',          onPauseEvt)
    el.addEventListener('ended',          onEndedEvt)

    // If a video is already selected, load it immediately
    const s = settingsRef.current
    const item = videosRef.current.find(v => v.id === s.activeId)
    if (item) {
      el.src     = item.objectURL
      el.volume  = s.volume
      el.muted   = s.muted
      el.loop    = s.loop
      el.preload = 'auto'
      el.load()
    }
    // Apply current CSS directly — no re-render needed
    applyCSS(el, settingsRef.current)
  }, [onTimeUpdate, onDurChange, onPlayEvt, onPauseEvt, onEndedEvt])

  // ── Direct DOM: apply CSS properties without touching React state ─────────────
  function applyCSS(el: HTMLVideoElement, s: VideoOverlaySettings) {
    el.style.opacity  = String(s.opacity)
    el.style.display  = s.visible ? 'block' : 'none'
    const vx = s.positionX, vy = s.positionY, vw = s.width, vh = s.height
    el.style.left     = `${960 + vx - vw / 2}px`
    el.style.top      = `${540 + vy - vh / 2}px`
    el.style.width    = `${vw}px`
    el.style.height   = s.maintainAspect ? 'auto' : `${vh}px`
  }

  // ── When active video changes — load new src ──────────────────────────────────
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const item = videos.find(v => v.id === settings.activeId)
    if (!item) {
      el.pause()
      el.src = ''
      el.removeAttribute('src')
      setIsPlaying(false); setCurrentTime(0); setDuration(0)
      return
    }
    el.src     = item.objectURL
    el.volume  = settings.volume
    el.muted   = settings.muted
    el.loop    = settings.loop
    el.preload = 'auto'
    el.load()
    setIsPlaying(false); setCurrentTime(0)
    // Sync to presentation window — only the src URL string, never the blob
    syncToPresentation({ src: item.objectURL, action: 'load' })
  }, [settings.activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply CSS settings directly to DOM (no re-render) ────────────────────────
  // This runs whenever any visual setting changes, but never causes the video
  // element to re-render because we write to the DOM directly.
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    applyCSS(el, settings)
    // Sync visibility/opacity to presentation window
    syncToPresentation({
      action: 'settings',
      visible:    settings.visible,
      opacity:    settings.opacity,
      positionX:  settings.positionX,
      positionY:  settings.positionY,
      width:      settings.width,
      height:     settings.height,
      maintainAspect: settings.maintainAspect,
    })
  }, [settings.visible, settings.opacity, settings.positionX, settings.positionY,
      settings.width, settings.height, settings.maintainAspect]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Volume/muted/loop — direct DOM only ──────────────────────────────────────
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    el.volume = settings.volume
    el.muted  = settings.muted
    el.loop   = settings.loop
    syncToPresentation({ action: 'audio', volume: settings.volume, muted: settings.muted, loop: settings.loop })
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

  // ── addVideo — uses objectURL, instant, no memory copy ───────────────────────
  const addVideo = useCallback((file: File) => {
    const objectURL = URL.createObjectURL(file)
    const mimeType: 'video/mp4' | 'video/webm' = file.type === 'video/webm' ? 'video/webm' : 'video/mp4'
    const id = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const name = file.name.replace(/\.[^.]+$/, '')
    setVideos(prev => [...prev, { id, name, filePath: (file as any).path || file.name, objectURL, mimeType }])
  }, [])

  const removeVideo = useCallback((id: string) => {
    setVideos(prev => {
      const item = prev.find(v => v.id === id)
      if (item) URL.revokeObjectURL(item.objectURL) // free memory
      return prev.filter(v => v.id !== id)
    })
    setSettings(prev => prev.activeId === id ? { ...prev, activeId: null, visible: false } : prev)
  }, [])

  const selectVideo = useCallback((id: string | null) => {
    setSettings(prev => ({ ...prev, activeId: id }))
  }, [])

  // updateSettings — writes to React state for panel UI re-render.
  // CSS-only changes are also applied directly to DOM in the useEffect above.
  const updateSettings = useCallback((patch: Partial<VideoOverlaySettings>) => {
    setSettings(prev => ({ ...prev, ...patch }))
  }, [])

  // ── Playback controls — direct DOM only, zero React state ────────────────────
  const play = useCallback(() => {
    elRef.current?.play()
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

// ── IPC helper — sends video playback state to the presentation window ─────────
function syncToPresentation(msg: Record<string, unknown>) {
  try {
    window.electronAPI?.syncVideoOverlay?.(msg)
  } catch {}
}
