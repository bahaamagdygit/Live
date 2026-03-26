import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Slide } from '../types'

interface SlidesData {
  slides: Slide[]
  fileName: string
  currentIndex: number
  textVisible: boolean
}

interface Section {
  name: string
  slides: Slide[]
}

function groupBySection(slides: Slide[]): Section[] {
  const map = new Map<string, Slide[]>()
  for (const slide of slides) {
    const key = slide.section || 'General'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(slide)
  }
  return Array.from(map.entries()).map(([name, sls]) => ({ name, slides: sls }))
}

export default function PptxControllerApp() {
  const [slides, setSlides] = useState<Slide[]>([])
  const [fileName, setFileName] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [textVisible, setTextVisible] = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const activeSlideRef = useRef<HTMLDivElement>(null)

  // Receive slides from main window
  useEffect(() => {
    if (!window.electronAPI?.onSlidesData) return
    const cleanup = window.electronAPI.onSlidesData((data: SlidesData) => {
      setSlides(data.slides)
      setFileName(data.fileName)
      setCurrentIndex(data.currentIndex)
      setTextVisible(data.textVisible)
      setActiveSection(null)
    })
    return cleanup
  }, [])

  // Sync current slide index when main changes it
  useEffect(() => {
    if (!window.electronAPI?.onSlideIndexChanged) return
    const cleanup = window.electronAPI.onSlideIndexChanged((index: number) => {
      setCurrentIndex(index)
    })
    return cleanup
  }, [])

  // Scroll active slide into view
  useEffect(() => {
    activeSlideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [currentIndex])

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        handleSelectSlide(Math.min(currentIndex + 1, slides.length - 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        handleSelectSlide(Math.max(currentIndex - 1, 0))
      } else if (e.key === ' ') {
        e.preventDefault()
        handleToggleText(!textVisible)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentIndex, slides.length, textVisible])

  const handleSelectSlide = useCallback((index: number) => {
    setCurrentIndex(index)
    window.electronAPI?.controllerSelectSlide(index)
  }, [])

  const handleToggleText = useCallback((visible: boolean) => {
    setTextVisible(visible)
    window.electronAPI?.controllerToggleText(visible)
  }, [])

  const handleOpenPptx = useCallback(async () => {
    setIsLoading(true)
    await window.electronAPI?.controllerOpenPptx()
    // Main window will handle the dialog and send back slides-data
    setTimeout(() => setIsLoading(false), 3000)
  }, [])

  const sections = groupBySection(slides)
  const visibleSlides = activeSection
    ? slides.filter(s => (s.section || 'General') === activeSection)
    : slides

  const currentSlide = slides[currentIndex]
  const currentText = currentSlide?.text.join('\n') || ''

  return (
    <div className="ctrl-root">
      {/* Header */}
      <header className="ctrl-header">
        <div className="ctrl-header__title">
          <span className="ctrl-header__icon">📊</span>
          <div>
            <div className="ctrl-header__name">PowerPoint Controller</div>
            {fileName && <div className="ctrl-header__file">{fileName}</div>}
          </div>
        </div>
        <div className="ctrl-header__actions">
          <button className="ctrl-btn ctrl-btn--primary" onClick={handleOpenPptx} disabled={isLoading}>
            {isLoading ? 'Loading...' : '📂 Open PPTX'}
          </button>
        </div>
      </header>

      {slides.length === 0 ? (
        <div className="ctrl-empty">
          <div className="ctrl-empty__icon">📊</div>
          <p className="ctrl-empty__title">No Presentation Loaded</p>
          <p className="ctrl-empty__hint">Open a PowerPoint file to get started</p>
          <button className="ctrl-btn ctrl-btn--primary ctrl-btn--lg" onClick={handleOpenPptx}>
            📂 Open PPTX File
          </button>
        </div>
      ) : (
        <div className="ctrl-body">
          {/* Left: Sections + Slides */}
          <div className="ctrl-left">
            {/* Section tabs */}
            {sections.length > 1 && (
              <div className="ctrl-sections">
                <button
                  className={`ctrl-section-tab ${activeSection === null ? 'ctrl-section-tab--active' : ''}`}
                  onClick={() => setActiveSection(null)}
                >
                  All ({slides.length})
                </button>
                {sections.map(sec => (
                  <button
                    key={sec.name}
                    className={`ctrl-section-tab ${activeSection === sec.name ? 'ctrl-section-tab--active' : ''}`}
                    onClick={() => setActiveSection(sec.name)}
                  >
                    {sec.name}
                    <span className="ctrl-section-tab__count">{sec.slides.length}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Slides grid */}
            <div className="ctrl-slides">
              {visibleSlides.map((slide) => {
                const isActive = slide.index === currentIndex
                const firstLine = slide.text[0] || '(empty)'
                const secondLine = slide.text[1] || ''
                return (
                  <div
                    key={slide.index}
                    ref={isActive ? activeSlideRef : undefined}
                    className={`ctrl-slide ${isActive ? 'ctrl-slide--active' : ''}`}
                    onClick={() => handleSelectSlide(slide.index)}
                  >
                    <div className="ctrl-slide__num">{slide.slideNumber ?? slide.index + 1}</div>
                    <div className="ctrl-slide__preview">
                      <div className="ctrl-slide__line1">{firstLine}</div>
                      {secondLine && <div className="ctrl-slide__line2">{secondLine}</div>}
                      {slide.text.length > 2 && (
                        <div className="ctrl-slide__more">+{slide.text.length - 2} lines</div>
                      )}
                    </div>
                    {isActive && <div className="ctrl-slide__active-bar" />}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right: Current slide preview + controls */}
          <div className="ctrl-right">
            <div className="ctrl-preview">
              <div className="ctrl-preview__label">Current Slide</div>
              <div className="ctrl-preview__screen">
                <div
                  className="ctrl-preview__text"
                  dir={isRtl(currentText) ? 'rtl' : 'ltr'}
                >
                  {currentSlide?.text.map((line, i) => (
                    <div key={i} className="ctrl-preview__line">{line}</div>
                  )) || <span className="ctrl-preview__empty">No text</span>}
                </div>
              </div>
              <div className="ctrl-preview__meta">
                Slide {currentIndex + 1} of {slides.length}
                {currentSlide?.section && (
                  <span className="ctrl-preview__section"> — {currentSlide.section}</span>
                )}
              </div>
            </div>

            {/* Show / Hide controls */}
            <div className="ctrl-text-controls">
              <button
                className={`ctrl-show-btn ${textVisible ? 'ctrl-show-btn--active' : ''}`}
                onClick={() => handleToggleText(!textVisible)}
              >
                <span className="ctrl-show-btn__dot" />
                {textVisible ? 'HIDE TEXT' : 'SHOW TEXT'}
              </button>
            </div>

            {/* Navigation */}
            <div className="ctrl-nav">
              <button
                className="ctrl-nav-btn"
                onClick={() => handleSelectSlide(Math.max(currentIndex - 1, 0))}
                disabled={currentIndex === 0}
              >
                ← Prev
              </button>
              <span className="ctrl-nav-counter">
                {currentIndex + 1} / {slides.length}
              </span>
              <button
                className="ctrl-nav-btn"
                onClick={() => handleSelectSlide(Math.min(currentIndex + 1, slides.length - 1))}
                disabled={currentIndex === slides.length - 1}
              >
                Next →
              </button>
            </div>

            {/* Keyboard hints */}
            <div className="ctrl-hints">
              <span>← → Navigate</span>
              <span>Space: Show/Hide</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function isRtl(text: string) {
  if (!text) return false
  return /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(text)
}
