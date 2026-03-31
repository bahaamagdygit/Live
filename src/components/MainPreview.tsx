import { useRef, useEffect, useState } from 'react'
import { OverlaySettings, LogoSettings, CameraFallbackSettings } from '../types'
import { ChurchBorderOverlay } from '../presentation/PresentationApp'
import '../presentation/presentation.css'

interface MainPreviewProps {
  activeStream: MediaStream | null
  overlaySettings: OverlaySettings
  logoSettings: LogoSettings
  cameraError: string | null
  cameraFallback: CameraFallbackSettings
  manualFallback?: boolean
  camView?: {
    scale: number
    offsetX: number
    offsetY: number
    fit: 'cover' | 'contain' | 'fill' | 'none'
    brightness: number
    contrast: number
    saturation: number
    flipH: boolean
    flipV: boolean
  }
}

// Presentation screen native resolution
const PRESENT_W = 1920
const PRESENT_H = 1080

export function MainPreview({
  activeStream,
  overlaySettings,
  logoSettings,
  cameraError,
  cameraFallback,
  manualFallback = false,
  camView,
}: MainPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [previewSize, setPreviewSize] = useState({ w: 960, h: 540 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setPreviewSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (videoRef.current) {
      if (activeStream) {
        videoRef.current.srcObject = activeStream
        videoRef.current.play().catch(console.warn)
      } else {
        videoRef.current.srcObject = null
      }
    }
  }, [activeStream])

  const lines = overlaySettings.text ? overlaySettings.text.split('\n').filter(Boolean) : []

  const camScale = camView?.scale ?? 100
  const offsetX = camView?.offsetX ?? 0
  const offsetY = camView?.offsetY ?? 0
  const flipH = camView?.flipH ?? false
  const flipV = camView?.flipV ?? false
  const brightness = camView?.brightness ?? 100
  const contrast = camView?.contrast ?? 100
  const saturation = camView?.saturation ?? 100
  const fit = camView?.fit ?? 'cover'

  // Scale factor to fit 1920×1080 into preview container (letterbox)
  const scaleX = previewSize.w / PRESENT_W
  const scaleY = previewSize.h / PRESENT_H
  const scaleFactor = Math.min(scaleX, scaleY)

  const stageLeft = (previewSize.w - PRESENT_W * scaleFactor) / 2
  const stageTop = (previewSize.h - PRESENT_H * scaleFactor) / 2

  return (
    <div className="main-preview" ref={containerRef}>
      {/* Fixed 1920×1080 inner stage, scaled down to fit preview */}
      <div
        className="main-preview__stage"
        style={{
          width: PRESENT_W,
          height: PRESENT_H,
          transform: `scale(${scaleFactor})`,
          transformOrigin: 'top left',
          position: 'absolute',
          left: stageLeft,
          top: stageTop,
        }}
      >
        {/* Black background */}
        <div className="presentation-bg" />

        {/* Fallback image — shown when no stream OR manually triggered */}
        {cameraFallback.base64 && (
          <img
            src={cameraFallback.base64}
            className={`presentation-fallback${(!activeStream || manualFallback) ? '' : ' presentation-fallback--hidden'}`}
            style={{ objectFit: cameraFallback.fit }}
            alt=""
          />
        )}

        {/* Camera feed */}
        <video
          ref={videoRef}
          className="presentation-camera"
          autoPlay
          playsInline
          muted
          style={{
            objectFit: fit,
            transform: `scale(${camScale / 100}) translate(${offsetX}%, ${offsetY}%) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
            transformOrigin: 'center center',
            filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`,
          }}
        />

        {/* Church border + reading panel — exact 1920×1080 layout */}
        <ChurchBorderOverlay
          line1={lines[0] || ''}
          line2={lines[1] || ''}
          visible={overlaySettings.visible}
          fontSize={overlaySettings.fontSize}
          fontFamily={overlaySettings.fontFamily}
          textColor={overlaySettings.textColor}
          alignment={overlaySettings.alignment}
          line1Bold={overlaySettings.line1Bold ?? true}
          line2Bold={overlaySettings.line2Bold ?? false}
          logoBase64={logoSettings.base64 || ''}
          logoPosition={logoSettings.position}
          logoSize={logoSettings.size}
          logoOpacity={logoSettings.opacity}
          logoVisible={logoSettings.visible}
          logoAnimation={logoSettings.animation || 'none'}
          panelLayout={overlaySettings.panelLayout ?? 'full'}
        />

        {/* No camera placeholder */}
        {!activeStream && !cameraFallback.base64 && (
          <div className="main-preview__no-camera">
            <div className="main-preview__no-camera-icon">📷</div>
            <div className="main-preview__no-camera-label">No Camera</div>
          </div>
        )}

        {cameraError && (
          <div className="preview-error main-preview__error-z">
            <div className="preview-error__icon">⚠️</div>
            <div className="preview-error__message">{cameraError}</div>
          </div>
        )}
      </div>
    </div>
  )
}
