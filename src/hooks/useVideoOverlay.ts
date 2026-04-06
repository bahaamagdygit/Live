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
  addVideo: (filePath: string, name: string, base64: string, mimeType: 'video/mp4' | 'video/webm') => void
  removeVideo: (id: string) => void
  selectVideo: (id: string | null) => void
  updateSettings: (patch: Partial<VideoOverlaySettings>) => void
  play: () => void
  pause: () => void
  stop: () => void
  seek: (time: number) => void
  // callback ref — pass as ref={setVideoEl} on the <video> element
  setVideoEl: (el: HTMLVideoElement | null) => void
}

export function useVideoOverlay(): UseVideoOverlayReturn {
  const [videos, setVideos] = useState<VideoOverlayItem[]>([])
  const [settings, setSettings] = useState<VideoOverlaySettings>(DEFAULT_VIDEO_OVERLAY)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // mutable ref to the actual DOM element — updated by callback ref
  const elRef = useRef<HTMLVideoElement | null>(null)
  // stable refs to latest state values for use inside closures
  const videosRef = useRef(videos)
  const settingsRef = useRef(settings)
  useEffect(() => { videosRef.current = videos }, [videos])
  useEffect(() => { settingsRef.current = settings }, [settings])

  // Called whenever the <video> element mounts or unmounts
  const setVideoEl = useCallback((el: HTMLVideoElement | null) => {
    // Detach listeners from old element
    const old = elRef.current
    if (old) {
      old.removeEventListener('timeupdate', onTimeUpdate)
      old.removeEventListener('durationchange', onDurationChange)
      old.removeEventListener('play', onPlayEvt)
      old.removeEventListener('pause', onPauseEvt)
      old.removeEventListener('ended', onEndedEvt)
    }

    elRef.current = el

    if (!el) return

    // Attach listeners
    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('durationchange', onDurationChange)
    el.addEventListener('play', onPlayEvt)
    el.addEventListener('pause', onPauseEvt)
    el.addEventListener('ended', onEndedEvt)

    // Load current active video immediately
    const item = videosRef.current.find(v => v.id === settingsRef.current.activeId)
    if (item) {
      el.src = item.base64
      el.volume = settingsRef.current.volume
      el.muted = settingsRef.current.muted
      el.loop = settingsRef.current.loop
      el.load()
    }
  }, []) // stable — no deps

  function onTimeUpdate(this: HTMLVideoElement) { setCurrentTime(this.currentTime) }
  function onDurationChange(this: HTMLVideoElement) { setDuration(this.duration || 0) }
  function onPlayEvt() { setIsPlaying(true) }
  function onPauseEvt() { setIsPlaying(false) }
  function onEndedEvt() { setIsPlaying(false); setCurrentTime(0) }

  // When active video changes — load new src into element
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const item = videos.find(v => v.id === settings.activeId)
    if (!item) {
      el.pause()
      el.src = ''
      el.removeAttribute('src')
      setIsPlaying(false)
      setCurrentTime(0)
      setDuration(0)
      return
    }
    el.src = item.base64
    el.volume = settings.volume
    el.muted = settings.muted
    el.loop = settings.loop
    el.load()
    setIsPlaying(false)
    setCurrentTime(0)
  }, [settings.activeId])

  // Sync volume / muted / loop when changed
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    el.volume = settings.volume
    el.muted = settings.muted
    el.loop = settings.loop
  }, [settings.volume, settings.muted, settings.loop])

  const addVideo = useCallback((
    filePath: string, name: string, base64: string, mimeType: 'video/mp4' | 'video/webm'
  ) => {
    const id = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setVideos(prev => [...prev, { id, name, filePath, base64, mimeType }])
  }, [])

  const removeVideo = useCallback((id: string) => {
    setVideos(prev => prev.filter(v => v.id !== id))
    setSettings(prev => prev.activeId === id ? { ...prev, activeId: null, visible: false } : prev)
  }, [])

  const selectVideo = useCallback((id: string | null) => {
    setSettings(prev => ({ ...prev, activeId: id }))
  }, [])

  const updateSettings = useCallback((patch: Partial<VideoOverlaySettings>) => {
    setSettings(prev => ({ ...prev, ...patch }))
  }, [])

  const play = useCallback(() => { elRef.current?.play() }, [])
  const pause = useCallback(() => { elRef.current?.pause() }, [])
  const stop = useCallback(() => {
    const el = elRef.current
    if (!el) return
    el.pause()
    el.currentTime = 0
    setCurrentTime(0)
    setIsPlaying(false)
  }, [])
  const seek = useCallback((time: number) => {
    if (elRef.current) elRef.current.currentTime = time
  }, [])

  return {
    videos, settings, isPlaying, currentTime, duration,
    addVideo, removeVideo, selectVideo, updateSettings,
    play, pause, stop, seek,
    setVideoEl,
  }
}
