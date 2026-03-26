import React, { useRef, useEffect } from 'react'
import { Slide } from '../types'

interface SlidesPanelProps {
  slides: Slide[]
  currentSlideIndex: number
  onSelectSlide: (index: number) => void
  onOpenPptx: () => void
  isLoading: boolean
  error: string | null
  pptxFileName: string
  isPresentationOpen?: boolean
  onTogglePresentation?: () => void
}

function SlideItem({
  slide,
  isActive,
  onClick,
}: {
  slide: Slide
  isActive: boolean
  onClick: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const firstLine = slide.text[0] || '(empty slide)'
  const secondLine = slide.text[1] || ''

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isActive])

  return (
    <div
      ref={ref}
      className={`slide-item ${isActive ? 'slide-item--active' : ''}`}
      onClick={onClick}
      title={slide.text.join('\n')}
    >
      <div className="slide-item__number">{(slide.slideNumber ?? slide.index + 1)}</div>
      <div className="slide-item__content">
        <div className="slide-item__first-line">{firstLine}</div>
        {secondLine && (
          <div className="slide-item__second-line">{secondLine}</div>
        )}
        {slide.text.length > 2 && (
          <div className="slide-item__more">+{slide.text.length - 2} more lines</div>
        )}
      </div>
      {isActive && <div className="slide-item__active-dot" />}
    </div>
  )
}

export function SlidesPanel({
  slides,
  currentSlideIndex,
  onSelectSlide,
  onOpenPptx,
  isLoading,
  error,
  pptxFileName,
  isPresentationOpen,
  onTogglePresentation,
}: SlidesPanelProps) {
  return (
    <div className="panel slides-panel">
      <div className="panel__header">
        <h3 className="panel__title">
          <span className="panel__title-icon">📄</span>
          Slides
        </h3>
        <div className="slides-panel__header-actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={onOpenPptx} title="Open File file">
            Open File
          </button>
          {onTogglePresentation && (
            <button
              type="button"
              className={`btn btn--sm ${isPresentationOpen ? 'btn--danger' : 'btn--secondary'}`}
              onClick={onTogglePresentation}
              title={isPresentationOpen ? 'Close presentation window' : 'Open presentation window on second screen'}
            >
              {isPresentationOpen ? '✕ Close Screen' : '🖥 Present'}
            </button>
          )}
        </div>
      </div>

      {pptxFileName && (
        <div className="slides-panel__filename">
          <span className="slides-panel__filename-icon">📂</span>
          <span title={pptxFileName}>{pptxFileName}</span>
          <span className="slides-panel__count">{slides.length} slides</span>
        </div>
      )}

      <div className="panel__content slides-panel__content">
        {error && (
          <div className="alert alert--error">
            <span>⚠️</span> {error}
          </div>
        )}

        {isLoading && (
          <div className="empty-state">
            <div className="spinner" />
            <p>Parsing PPTX...</p>
          </div>
        )}

        {!isLoading && slides.length === 0 && !error && (
          <div className="empty-state">
            <div className="empty-state__icon">📊</div>
            <p>No slides loaded</p>
            <p className="empty-state__hint">Open a PowerPoint file to display liturgical text</p>
            <button type="button" className="btn btn--primary" onClick={onOpenPptx}>
              Open File
            </button>
          </div>
        )}

        {!isLoading && slides.length > 0 && (
          <div className="slides-list">
            {slides.map((slide, idx) => (
              <SlideItem
                key={slide.index}
                slide={slide}
                isActive={idx === currentSlideIndex}
                onClick={() => onSelectSlide(idx)}
              />
            ))}
          </div>
        )}
      </div>

      {slides.length > 0 && (
        <div className="panel__footer">
          <span className="slides-panel__nav-hint">
            Slide {currentSlideIndex + 1} / {slides.length}
          </span>
        </div>
      )}
    </div>
  )
}
