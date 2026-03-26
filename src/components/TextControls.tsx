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
  const [manualText, setManualText] = useState('')
  const [isManual, setIsManual] = useState(false)

  // Sync with current slide text
  useEffect(() => {
    if (!isManual) {
      setManualText(currentSlideText)
    }
  }, [currentSlideText, isManual])

  // Update overlay text when manual text changes
  useEffect(() => {
    if (isManual) {
      onTextChange(manualText)
    }
  }, [manualText, isManual])

  const handleSlideTextUse = () => {
    setIsManual(false)
    onTextChange(currentSlideText)
    setManualText(currentSlideText)
  }

  const handleManualEdit = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setIsManual(true)
    setManualText(e.target.value)
  }

  return (
    <div className="text-controls">
      <div className="text-controls__left">
        <div className="text-controls__nav">
          <button
            className="btn btn--icon btn--large"
            onClick={onPrevSlide}
            disabled={currentSlideIndex <= 0}
            title="Previous slide (←)"
          >
            ◀
          </button>

          <div className="text-controls__slide-info">
            {totalSlides > 0 ? (
              <span>
                {currentSlideIndex + 1} / {totalSlides}
              </span>
            ) : (
              <span className="text-muted">No slides</span>
            )}
          </div>

          <button
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
        <div className="text-controls__textarea-wrapper">
          <textarea
            className={`text-controls__textarea ${isManual ? 'text-controls__textarea--manual' : ''}`}
            value={manualText}
            onChange={handleManualEdit}
            placeholder="Slide text will appear here — or type custom text..."
            rows={2}
          />
          {isManual && (
            <button
              className="text-controls__sync-btn"
              onClick={handleSlideTextUse}
              title="Sync with current slide"
            >
              ↩ Use Slide Text
            </button>
          )}
        </div>
      </div>

      <div className="text-controls__right">
        <div className="text-controls__visibility">
          <button
            className={`btn btn--visibility ${overlaySettings.visible ? 'btn--hide' : 'btn--show'}`}
            onClick={onToggleText}
            title="Toggle text overlay (Space)"
          >
            {overlaySettings.visible ? (
              <>
                <span className="btn-icon">👁️</span>
                <span>Hide Text</span>
              </>
            ) : (
              <>
                <span className="btn-icon">👁️</span>
                <span>Show Text</span>
              </>
            )}
          </button>
          <div className="text-controls__hotkey-hint">
            Press <kbd>Space</kbd>
          </div>
        </div>
      </div>
    </div>
  )
}
