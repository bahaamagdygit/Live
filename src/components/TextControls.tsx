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
  onOverlayChange: (patch: Partial<OverlaySettings>) => void
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
  onOverlayChange,
}: TextControlsProps) {
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [isManual, setIsManual] = useState(false)

  const slideParts = currentSlideText.split('\n')
  const slideLine1 = slideParts[0] || ''
  const slideLine2 = slideParts[1] || ''

  const line1Changed = isManual && line1 !== slideLine1
  const line2Changed = isManual && line2 !== slideLine2
  const anyChanged = line1Changed || line2Changed

  // Sync with current slide text when not in manual mode
  useEffect(() => {
    if (!isManual) {
      setLine1(slideLine1)
      setLine2(slideLine2)
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

  const handleReset = () => {
    setIsManual(false)
    setLine1(slideLine1)
    setLine2(slideLine2)
    onTextChange(currentSlideText)
  }

  const panelLayout = overlaySettings.panelLayout ?? 'full'
  const panelWidth = overlaySettings.panelWidth ?? 100
  const panelHeight = overlaySettings.panelHeight ?? 20

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
            <span className="text-controls__line-label">
              Line 1
              {line1Changed && <span className="text-controls__change-dot" title="Modified — differs from slide" />}
            </span>
            <input
              className={`text-controls__line-input${line1Changed ? ' text-controls__line-input--manual' : ''}`}
              type="text"
              value={line1}
              onChange={handleLine1Change}
              placeholder="First line..."
            />
          </div>
          <div className="text-controls__line-row">
            <span className="text-controls__line-label">
              Line 2
              {line2Changed && <span className="text-controls__change-dot" title="Modified — differs from slide" />}
            </span>
            <input
              className={`text-controls__line-input${line2Changed ? ' text-controls__line-input--manual' : ''}`}
              type="text"
              value={line2}
              onChange={handleLine2Change}
              placeholder="Second line..."
            />
          </div>
        </div>
      </div>

      {/* Reset button — shown when any line differs from slide */}
      <div className="text-controls__reset-col">
        <button
          type="button"
          className={`text-controls__reset-btn${anyChanged ? ' text-controls__reset-btn--active' : ''}`}
          onClick={handleReset}
          disabled={!anyChanged}
          title="Reset to slide text"
        >
          ↺ Reset
        </button>
      </div>

      <div className="text-controls__right">
        {/* Panel layout + width controls */}
        <div className="text-controls__layout">
          <div className="text-controls__layout-row">
            <span className="text-controls__layout-label">Panel</span>
            <div className="text-controls__layout-btns">
              {(['full', 'left', 'right'] as const).map(layout => (
                <button
                  key={layout}
                  type="button"
                  className={`text-controls__layout-btn${panelLayout === layout ? ' text-controls__layout-btn--active' : ''}`}
                  onClick={() => onOverlayChange({ panelLayout: layout, panelWidth: layout === 'full' ? 100 : 40 })}
                  title={layout === 'full' ? 'Full Width' : layout === 'left' ? 'Left Half' : 'Right Half'}
                >
                  {layout === 'full' ? '▬' : layout === 'left' ? '▌' : '▐'}
                </button>
              ))}
            </div>
          </div>
          {panelLayout !== 'full' && (
            <div className="text-controls__layout-row">
              <span className="text-controls__layout-label">Width {panelWidth}%</span>
              <input
                type="range"
                className="text-controls__width-slider"
                min={20}
                max={100}
                step={1}
                value={panelWidth}
                onChange={e => onOverlayChange({ panelWidth: Number(e.target.value) })}
                title={`Panel width: ${panelWidth}%`}
              />
            </div>
          )}
          {panelLayout === 'full' && (
            <div className="text-controls__layout-row">
              <span className="text-controls__layout-label">Height {panelHeight}%</span>
              <input
                type="range"
                className="text-controls__width-slider"
                min={5}
                max={50}
                step={1}
                value={panelHeight}
                onChange={e => onOverlayChange({ panelHeight: Number(e.target.value) })}
                title={`Panel height: ${panelHeight}%`}
              />
            </div>
          )}
        </div>

        <div className="text-controls__layout-row">
          <span className="text-controls__layout-label">Border</span>
          <input
            type="color"
            className="text-controls__color-input"
            value={overlaySettings.borderColor || '#f5e27a'}
            onChange={e => onOverlayChange({ borderColor: e.target.value })}
            title="Border color"
          />
          {overlaySettings.borderColor && (
            <button
              type="button"
              className="text-controls__reset-color-btn"
              onClick={() => onOverlayChange({ borderColor: '' })}
              title="Reset to gold"
            >↺</button>
          )}
        </div>

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
