import { MobileCameraView, filtersToCss } from '../hooks/useMobileCameras'

interface MobileFrameViewProps {
  mjpegUrl: string | null         // http://127.0.0.1:.../dev/<id>
  view: MobileCameraView
  fallbackBase64?: string
  showFallback?: boolean
  onFocusTap?: (normalized: { x: number; y: number }) => void
}

// Renders incoming MJPEG stream via native <img> — browser handles decoding and
// progressive rendering in its own threads, giving us zero-copy, near-native
// latency. CSS filter + transform apply the full grading pipeline at the GPU.
export function MobileFrameView({
  mjpegUrl, view, fallbackBase64, showFallback, onFocusTap,
}: MobileFrameViewProps) {
  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onFocusTap) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top)  / rect.height
    onFocusTap({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) })
  }

  const transform = [
    `scale(${Math.max(1, view.zoom || 1)})`,
    `translate(${view.offsetX}%, ${view.offsetY}%)`,
    `scaleX(${view.flipH ? -1 : 1})`,
    `scaleY(${view.flipV ? -1 : 1})`,
  ].join(' ')

  return (
    <div className="mf-view" onClick={handleTap}>
      {showFallback
        ? (fallbackBase64
          ? <img src={fallbackBase64} className="mf-fallback" alt="fallback" />
          : <div className="mf-fallback mf-fallback--default"><span>📷</span><p>No signal</p></div>)
        : (
          mjpegUrl
            ? <img
                src={mjpegUrl}
                className="mf-canvas"
                alt=""
                style={{
                  transform,
                  transformOrigin: 'center center',
                  filter:  filtersToCss(view.filters),
                  opacity: view.filters.opacity / 100,
                  objectFit: view.fit,
                }}
              />
            : <div className="mf-fallback mf-fallback--default"><span>📱</span><p>Waiting for stream…</p></div>
        )}
    </div>
  )
}
