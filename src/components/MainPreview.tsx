import React, { useRef, useEffect, useState, useCallback } from 'react'
import { OverlaySettings, LogoSettings } from '../types'

interface MainPreviewProps {
  activeStream: MediaStream | null
  overlaySettings: OverlaySettings
  logoSettings: LogoSettings
  cameraError: string | null
}

export function MainPreview({
  activeStream,
  overlaySettings,
  logoSettings,
  cameraError,
}: MainPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const logoImageRef = useRef<HTMLImageElement | null>(null)
  const textOpacityRef = useRef(0)
  const [canvasSize, setCanvasSize] = useState({ width: 1280, height: 720 })
  const overlayRef = useRef(overlaySettings)
  const logoRef = useRef(logoSettings)

  // Keep refs in sync with props
  useEffect(() => {
    overlayRef.current = overlaySettings
  }, [overlaySettings])

  useEffect(() => {
    logoRef.current = logoSettings
  }, [logoSettings])

  // Load logo image when base64 changes
  useEffect(() => {
    if (logoSettings.base64) {
      const img = new Image()
      img.onload = () => {
        logoImageRef.current = img
      }
      img.onerror = () => {
        logoImageRef.current = null
      }
      img.src = logoSettings.base64
    } else {
      logoImageRef.current = null
    }
  }, [logoSettings.base64])

  // Set video source when stream changes
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

  // Canvas drawing loop
  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const overlay = overlayRef.current
      const logo = logoRef.current
      const w = canvas.width
      const h = canvas.height

      // Clear
      ctx.clearRect(0, 0, w, h)

      // Draw background
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, w, h)

      // Draw video frame
      if (video.readyState >= 2 && video.videoWidth > 0) {
        try {
          ctx.drawImage(video, 0, 0, w, h)
        } catch {
          // Frame not ready
        }
      } else if (!activeStream) {
        // No camera - draw placeholder
        ctx.fillStyle = '#111122'
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = '#333355'
        ctx.font = `${Math.floor(h / 12)}px Arial`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('No Camera', w / 2, h / 2)
      }

      // Draw logo
      if (logo.visible && logoImageRef.current && logo.opacity > 0) {
        const img = logoImageRef.current
        const logoW = logo.size
        const logoH = (img.height / img.width) * logoW
        const margin = 20

        let x = 0
        let y = 0

        switch (logo.position) {
          case 'top-left':
            x = margin
            y = margin
            break
          case 'top-right':
            x = w - logoW - margin
            y = margin
            break
          case 'bottom-left':
            x = margin
            y = h - logoH - margin
            break
          case 'bottom-right':
            x = w - logoW - margin
            y = h - logoH - margin
            break
          default:
            x = w - logoW - margin
            y = margin
        }

        ctx.globalAlpha = logo.opacity / 100
        ctx.drawImage(img, x, y, logoW, logoH)
        ctx.globalAlpha = 1
      }

      // Animate text opacity
      const targetOpacity = overlay.visible && overlay.text ? 1 : 0
      if (textOpacityRef.current < targetOpacity) {
        textOpacityRef.current = Math.min(textOpacityRef.current + 0.05, targetOpacity)
      } else if (textOpacityRef.current > targetOpacity) {
        textOpacityRef.current = Math.max(textOpacityRef.current - 0.05, targetOpacity)
      }

      // Draw text overlay
      if (textOpacityRef.current > 0.01 && overlay.text) {
        ctx.globalAlpha = textOpacityRef.current

        const lines = overlay.text.split('\n').filter((l) => l.trim())
        const fontSize = overlay.fontSize || 32
        const padding = 20
        const lineHeight = fontSize * 1.4

        ctx.font = `bold ${fontSize}px "${overlay.fontFamily || 'Arial'}", Arial, sans-serif`
        ctx.textBaseline = 'middle'

        // Calculate text dimensions
        const maxWidth = lines.reduce(
          (max, line) => Math.max(max, ctx.measureText(line).width),
          0
        )
        const totalHeight = lines.length * lineHeight
        const boxW = maxWidth + padding * 2
        const boxH = totalHeight + padding * 2

        // Position
        let boxX = 0
        let boxY = 0
        switch (overlay.position) {
          case 'top':
            boxY = padding
            break
          case 'center':
            boxY = (h - boxH) / 2
            break
          case 'bottom':
          default:
            boxY = h - boxH - padding
        }

        switch (overlay.alignment) {
          case 'left':
            boxX = padding
            break
          case 'right':
            boxX = w - boxW - padding
            break
          case 'center':
          default:
            boxX = (w - boxW) / 2
        }

        // Draw background
        const bgOpacity = (overlay.bgOpacity ?? 70) / 100
        const hexColor = overlay.bgColor || '#000000'
        const r = parseInt(hexColor.slice(1, 3), 16)
        const g = parseInt(hexColor.slice(3, 5), 16)
        const b = parseInt(hexColor.slice(5, 7), 16)

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${bgOpacity})`
        // Rounded rect
        const radius = 8
        ctx.beginPath()
        ctx.moveTo(boxX + radius, boxY)
        ctx.lineTo(boxX + boxW - radius, boxY)
        ctx.quadraticCurveTo(boxX + boxW, boxY, boxX + boxW, boxY + radius)
        ctx.lineTo(boxX + boxW, boxY + boxH - radius)
        ctx.quadraticCurveTo(boxX + boxW, boxY + boxH, boxX + boxW - radius, boxY + boxH)
        ctx.lineTo(boxX + radius, boxY + boxH)
        ctx.quadraticCurveTo(boxX, boxY + boxH, boxX, boxY + boxH - radius)
        ctx.lineTo(boxX, boxY + radius)
        ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY)
        ctx.closePath()
        ctx.fill()

        // Draw text lines
        ctx.fillStyle = overlay.textColor || '#ffffff'
        ctx.textAlign = overlay.alignment === 'right' ? 'right' : overlay.alignment === 'left' ? 'left' : 'center'

        const textX =
          overlay.alignment === 'right'
            ? boxX + boxW - padding
            : overlay.alignment === 'left'
            ? boxX + padding
            : boxX + boxW / 2

        lines.forEach((line, idx) => {
          const textY = boxY + padding + lineHeight / 2 + idx * lineHeight
          // Text shadow for readability
          ctx.shadowColor = 'rgba(0,0,0,0.8)'
          ctx.shadowBlur = 4
          ctx.fillText(line, textX, textY)
        })

        ctx.shadowBlur = 0
        ctx.globalAlpha = 1
      }

      animFrameRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [activeStream])

  // Resize canvas to match container
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && canvasRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const aspectW = 1280
        const aspectH = 720
        const containerAspect = rect.width / rect.height
        const videoAspect = aspectW / aspectH

        let displayW = rect.width
        let displayH = rect.height

        if (containerAspect > videoAspect) {
          displayW = rect.height * videoAspect
        } else {
          displayH = rect.width / videoAspect
        }

        setCanvasSize({ width: Math.floor(displayW), height: Math.floor(displayH) })
      }
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => resizeObserver.disconnect()
  }, [])

  return (
    <div className="main-preview" ref={containerRef}>
      {/* Hidden video element - source */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ display: 'none' }}
      />

      {/* Canvas - composited output */}
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        style={{
          width: canvasSize.width,
          height: canvasSize.height,
          display: 'block',
          margin: 'auto',
        }}
        className="main-preview__canvas"
      />

      {cameraError && (
        <div className="preview-error">
          <div className="preview-error__icon">⚠️</div>
          <div className="preview-error__message">{cameraError}</div>
        </div>
      )}

      {overlaySettings.visible && overlaySettings.text && (
        <div className="preview-text-indicator">TEXT OVERLAY ON</div>
      )}
    </div>
  )
}
