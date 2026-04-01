import React, { useState, useEffect } from 'react'
import { OverlaySettings } from '../types'

interface TextControlsProps {
  overlaySettings: OverlaySettings
  currentSlideText: string
  onToggleText: () => void
  onTextChange: (text: string) => void
  onNextSlide: () => void
  onPrevSlide: () => void
  currentSlideIndex: number
  totalSlides: number
}

export function TextControls({
  overlaySettings,
  currentSlideText,
  onToggleText,
  onTextChange,
  onNextSlide,
  onPrevSlide,
  currentSlideIndex,
  totalSlides,
}: TextControlsProps) {
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [isManual, setIsManual] = useState(false)

  // Sync with current slide text when not in manual mode
  useEffect(() => {
    if (!isManual) {
      const parts = currentSlideText.split('\n')
      setLine1(parts[0] || '')
      setLine2(parts[1] || '')
    }
  }, [currentSlideText, isManual])

  const emitChange = (l1: string, l2: string) => {
    onTextChange([l1, l2].filter(Boolean).join('\n'))
  }

  const handleLine1Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsManual(true)
    setLine1(e.target.value)
    emitChange(e.target.value, line2)
  }

  const handleLine2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsManual(true)
    setLine2(e.target.value)
    emitChange(line1, e.target.value)
  }

  const handleSyncSlide = () => {
    setIsManual(false)
    const parts = currentSlideText.split('\n')
    setLine1(parts[0] || '')
    setLine2(parts[1] || '')
    onTextChange(currentSlideText)
  }

  return (
    <div className="text-controls">
      <div className="text-controls__left">
        <div className="text-controls__nav">
          <button
            type="button"
            className="btn btn--icon btn--large"
            onClick={onPrevSlide}
            disabled={currentSlideIndex <= 0}
            title="Previous slide (←)"
          >
            ◀
          </button>

          <div className="text-controls__slide-info">
            {totalSlides > 0 ? (
              <span>{currentSlideIndex + 1} / {totalSlides}</span>
            ) : (
              <span className="text-muted">No slides</span>
            )}
          </div>

          <button
            type="button"
            className="btn btn--icon btn--large"
            onClick={onNextSlide}
            disabled={currentSlideIndex >= totalSlides - 1}
            title="Next slide (→)"
          >
            ▶
          </button>
        </div>
      </div>

      <div className="text-controls__center">
        <div className="text-controls__lines">
          <div className="text-controls__line-row">
            <span className="text-controls__line-label">Line 1</span>
            <input
              className={`text-controls__line-input${isManual ? ' text-controls__line-input--manual' : ''}`}
              type="text"
              value={line1}
              onChange={handleLine1Change}
              placeholder="First line..."
            />
          </div>
          <div className="text-controls__line-row">
            <span className="text-controls__line-label">Line 2</span>
            <input
              className={`text-controls__line-input${isManual ? ' text-controls__line-input--manual' : ''}`}
              type="text"
              value={line2}
              onChange={handleLine2Change}
              placeholder="Second line..."
            />
          </div>
          {isManual && (
            <button type="button" className="text-controls__sync-btn" onClick={handleSyncSlide}>
              ↩ Use Slide Text
            </button>
          )}
        </div>
      </div>

      <div className="text-controls__right">
        <div className="text-controls__visibility">
          <button
            type="button"
            className={`btn btn--visibility ${overlaySettings.visible ? 'btn--hide' : 'btn--show'}`}
            onClick={onToggleText}
            title="Toggle text overlay (Space)"
          >
            <span className="btn-icon">👁️</span>
            <span>{overlaySettings.visible ? 'Hide Text' : 'Show Text'}</span>
          </button>
          <div className="text-controls__hotkey-hint">
            Press <kbd>Space</kbd>
          </div>
        </div>
      </div>
    </div>
  )
}
