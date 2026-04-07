/**
 * VideoOverlayWidget
 *
 * Owns useVideoOverlay entirely. State changes here (slider moves, playback)
 * never re-render App or MainPreview. The only bridge to the outside world is
 * the stable `setVideoEl` callback ref, exposed via `onReady` once on mount.
 */
import { useEffect } from 'react'
import { useVideoOverlay } from '../hooks/useVideoOverlay'
import { VideoOverlayPanel } from './VideoOverlayPanel'

interface VideoOverlayWidgetProps {
  /** Called once on mount with the stable setVideoEl fn — App stores it in a ref */
  onReady: (setVideoEl: (el: HTMLVideoElement | null) => void) => void
}

export function VideoOverlayWidget({ onReady }: VideoOverlayWidgetProps) {
  const vo = useVideoOverlay()

  // Give App the stable setVideoEl once — onReady is stable (useCallback in App)
  useEffect(() => { onReady(vo.setVideoEl) }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
