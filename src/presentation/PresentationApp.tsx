import React, { useState, useEffect, useRef } from 'react'

interface PresentationData {
  text: string
  visible: boolean
  position: 'bottom' | 'center' | 'top'
  fontSize: number
  fontFamily: string
  textColor: string
  bgColor: string
  bgOpacity: number
  alignment: 'right' | 'center' | 'left'
  slideNumber?: number
  totalSlides?: number
}

const DEFAULT_DATA: PresentationData = {
  text: '',
  visible: false,
  position: 'bottom',
  fontSize: 48,
  fontFamily: 'Arial',
  textColor: '#ffffff',
  bgColor: '#000000',
  bgOpacity: 70,
  alignment: 'center',
}

export default function PresentationApp() {
  const [data, setData] = useState<PresentationData>(DEFAULT_DATA)
  const [opacity, setOpacity] = useState(0)
  const animRef = useRef<number | null>(null)
  const opacityRef = useRef(0)
  const targetRef = useRef(0)

  // Listen for updates from main process
  useEffect(() => {
    if (!window.electronAPI?.onPresentationUpdate) return
    const cleanup = window.electronAPI.onPresentationUpdate((incoming: PresentationData) => {
      setData(incoming)
      targetRef.current = incoming.visible ? 1 : 0
    })
    return cleanup
  }, [])

  // Animate opacity fade in/out
  useEffect(() => {
    const animate = () => {
      const current = opacityRef.current
      const target = targetRef.current
      if (Math.abs(current - target) < 0.01) {
        opacityRef.current = target
        setOpacity(target)
        animRef.current = requestAnimationFrame(animate)
        return
      }
      const next = current + (target - current) * 0.08
      opacityRef.current = next
      setOpacity(next)
      animRef.current = requestAnimationFrame(animate)
    }
    animRef.current = requestAnimationFrame(animate)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  const lines = data.text ? data.text.split('\n').filter(Boolean) : []

  const positionStyle: React.CSSProperties =
    data.position === 'bottom'
      ? { bottom: '8%', left: 0, right: 0 }
      : data.position === 'top'
      ? { top: '8%', left: 0, right: 0 }
      : { top: '50%', left: 0, right: 0, transform: 'translateY(-50%)' }

  const bgRgb = hexToRgb(data.bgColor)
  const bgStyle = bgRgb
    ? `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${data.bgOpacity / 100})`
    : `rgba(0,0,0,0.7)`

  return (
    <div className="presentation-root">
      {/* Black background always */}
      <div className="presentation-bg" />

      {/* Text overlay */}
      <div
        className="presentation-overlay"
        style={{ ...positionStyle, opacity }}
        dir={isRtl(data.text) ? 'rtl' : 'ltr'}
      >
        <div
          className="presentation-text-box"
          style={{
            backgroundColor: bgStyle,
            textAlign: data.alignment,
            padding: '0.6em 1.2em',
          }}
        >
          {lines.map((line, i) => (
            <div
              key={i}
              className="presentation-line"
              style={{
                fontSize: `${data.fontSize}px`,
                fontFamily: data.fontFamily,
                color: data.textColor,
                lineHeight: 1.4,
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>

      {/* Slide counter (bottom right) */}
      {data.slideNumber !== undefined && data.totalSlides !== undefined && (
        <div className="presentation-counter">
          {data.slideNumber} / {data.totalSlides}
        </div>
      )}
    </div>
  )
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null
}

function isRtl(text: string) {
  if (!text) return false
  const rtlChars = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/
  return rtlChars.test(text)
}
