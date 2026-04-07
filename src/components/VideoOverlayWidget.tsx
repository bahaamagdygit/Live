/**
 * VideoOverlayWidget
 *
 * Owns useVideoOverlay entirely. State changes here (slider moves, playback)
 * never re-render App or MainPreview. The only bridge to the outside world is
 * the stable `setVideoEl` callback ref, exposed via `onReady` once on mount.
 */
import { useEffect, useRef } from 'react'
import { useVideoOverlay } from '../hooks/useVideoOverlay'
import { VideoOverlayPanel } from './VideoOverlayPanel'

interface VideoOverlayWidgetProps {
  onReady: (
    setVideoEl: (el: HTMLVideoElement | null) => void,
    updateSettings: (patch: Partial<import('../types').VideoOverlaySettings>) => void,
    controls: { play: () => void; pause: () => void; stop: () => void; getIsPlaying: () => boolean }
  ) => void
  onQuickUpdate?: (visible: boolean, opacity: number, hasActive: boolean, isPlaying: boolean) => void
}

export function VideoOverlayWidget({ onReady, onQuickUpdate }: VideoOverlayWidgetProps) {
  const vo = useVideoOverlay()
  const prevQuickRef = useRef('')
  const isPlayingRef = useRef(vo.isPlaying)
  isPlayingRef.current = vo.isPlaying

  useEffect(() => {
    onReady(vo.setVideoEl, vo.updateSettings, {
      play: vo.play,
      pause: vo.pause,
      stop: vo.stop,
      getIsPlaying: () => isPlayingRef.current,
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Notify App of quick-control values only when they actually change
  useEffect(() => {
    if (!onQuickUpdate) return
    const hasActive = vo.settings.activeId !== null
    const key = `${vo.settings.visible}|${vo.settings.opacity}|${hasActive}|${vo.isPlaying}`
    if (key === prevQuickRef.current) return
    prevQuickRef.current = key
    onQuickUpdate(vo.settings.visible, vo.settings.opacity, hasActive, vo.isPlaying)
  }, [vo.settings.visible, vo.settings.opacity, vo.settings.activeId, vo.isPlaying, onQuickUpdate])

  return (
    <VideoOverlayPanel
      videos={vo.videos}
      settings={vo.settings}
      isPlaying={vo.isPlaying}
      currentTime={vo.currentTime}
      duration={vo.duration}
      onAddVideo={vo.addVideo}
      onRemoveVideo={vo.removeVideo}
      onSelectVideo={vo.selectVideo}
      onUpdateSettings={vo.updateSettings}
      onPlay={vo.play}
      onPause={vo.pause}
      onStop={vo.stop}
      onSeek={vo.seek}
    />
  )
}
