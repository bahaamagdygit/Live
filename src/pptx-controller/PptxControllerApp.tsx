import { useState, useEffect, useCallback, useRef } from 'react'
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

function isRtl(text: string) {
  if (!text) return false
  return /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(text)
}

export default function PptxControllerApp() {
  const [slides, setSlides] = useState<Slide[]>([])
  const [fileName, setFileName] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [textVisible, setTextVisible] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeSection, setActiveSection] = useState<string>('')
  const activeSlideRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!window.electronAPI?.onSlidesData) return
    const cleanup = window.electronAPI.onSlidesData((data: SlidesData) => {
      setSlides(data.slides)
      setFileName(data.fileName)
      setCurrentIndex(data.currentIndex)
      setTextVisible(data.textVisible)
      const active = data.slides[data.currentIndex]
      setActiveSection(active?.section || 'General')
    })
    return cleanup
  }, [])

  useEffect(() => {
    if (!window.electronAPI?.onSlideIndexChanged) return
    const cleanup = window.electronAPI.onSlideIndexChanged((index: number) => {
      setCurrentIndex(index)
      setActiveSection(prev => {
        const slide = slides[index]
        return slide?.section || prev
      })
    })
    return cleanup
  }, [slides])

  useEffect(() => {
    activeSlideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [currentIndex])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        handleSelectSlide(Math.min(currentIndex + 1, slides.length - 1))
      } else if (e.key === 'ArrowUp') {
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
    setTimeout(() => setIsLoading(false), 3000)
  }, [])

  const sections = groupBySection(slides)
  const currentSlide = slides[currentIndex]
  const currentText = currentSlide?.text.join('\n') || ''

  // slides of the selected section
  const visibleSection = sections.find(s => s.name === activeSection) || sections[0]
  const visibleSlides = visibleSection?.slides || []

  return (
    <div className="ctrl-root">
      {/* Header */}
      <header className="ctrl-header">
        <button type="button" className="ctrl-open-btn" onClick={handleOpenPptx} disabled={isLoading}>
          {isLoading ? '...' : '📂'} Open File
        </button>
        <div className="ctrl-header__info">
          {fileName && <span className="ctrl-header__file">{fileName}</span>}
          <span className="ctrl-header__pos">{currentIndex + 1} / {slides.length}</span>
        </div>
      </header>

      {slides.length === 0 ? (
        <div className="ctrl-empty">
          <div className="ctrl-empty__icon">📊</div>
          <p className="ctrl-empty__title">No File Loaded</p>
          <p className="ctrl-empty__hint">Open a PPTX file to get started</p>
          <button type="button" className="ctrl-open-btn ctrl-open-btn--lg" onClick={handleOpenPptx}>
            📂 Open File
          </button>
        </div>
      ) : (
        <div className="ctrl-body">

          {/* LEFT: Slide cards of active section */}
          <div className="ctrl-slides-panel">
            <div className="ctrl-slides-panel__header">
              <span className="ctrl-slides-panel__sec-name">{visibleSection?.name}</span>
              <span className="ctrl-slides-panel__count">{visibleSlides.length} slides</span>
            </div>
            <div className="ctrl-cards">
              {visibleSlides.map(slide => {
                const isActive = slide.index === currentIndex
                const line1 = slide.text[0] || ''
                const line2 = slide.text[1] || ''
                return (
                  <div
                    key={slide.index}
                    ref={isActive ? activeSlideRef : undefined}
                    className={`ctrl-card${isActive ? ' ctrl-card--active' : ''}`}
                    onClick={() => handleSelectSlide(slide.index)}
                  >
                    <div className="ctrl-card__num">{slide.slideNumber ?? slide.index + 1}</div>
                    <div className="ctrl-card__content">
                      <div className="ctrl-card__line1">{line1 || <span className="ctrl-card__empty">—</span>}</div>
                      {line2 && <div className="ctrl-card__line2">{line2}</div>}
                    </div>
                    {isActive && <div className="ctrl-card__bar" />}
                  </div>
                )
              })}
            </div>
          </div>

          {/* RIGHT: Sections list + preview + controls */}
          <div className="ctrl-right">

            {/* Sections */}
            <div className="ctrl-sec-list">
              <div className="ctrl-sec-list__label">Sections</div>
              {sections.map(sec => {
                const isActive = sec.name === activeSection
                const hasCurrentSlide = sec.slides.some(s => s.index === currentIndex)
                return (
                  <button
                    key={sec.name}
                    type="button"
                    className={`ctrl-sec-btn${isActive ? ' ctrl-sec-btn--active' : ''}${hasCurrentSlide && !isActive ? ' ctrl-sec-btn--has-current' : ''}`}
                    onClick={() => setActiveSection(sec.name)}
                    title={sec.name}
                  >
                    <span className="ctrl-sec-btn__name">{sec.name}</span>
                    <span className="ctrl-sec-btn__count">{sec.slides.length}</span>
                  </button>
                )
              })}
            </div>

            {/* Preview */}
            <div className="ctrl-preview">
              <div className="ctrl-preview__label">Current Slide</div>
              <div className="ctrl-preview__screen">
                <div className="ctrl-preview__text" dir={isRtl(currentText) ? 'rtl' : 'ltr'}>
                  {currentSlide?.text.map((line, i) => (
                    <div key={i} className="ctrl-preview__line">{line}</div>
                  )) || <span className="ctrl-preview__empty">No text</span>}
                </div>
              </div>
              <div className="ctrl-preview__meta">
                Slide {currentIndex + 1} · {currentSlide?.section}
              </div>
            </div>

            {/* Show/Hide */}
            <button
              type="button"
              className={`ctrl-show-btn${textVisible ? ' ctrl-show-btn--active' : ''}`}
              onClick={() => handleToggleText(!textVisible)}
            >
              <span className="ctrl-show-btn__dot" />
              {textVisible ? 'HIDE TEXT' : 'SHOW TEXT'}
            </button>

            {/* Nav */}
            <div className="ctrl-nav">
              <button type="button" className="ctrl-nav-btn"
                onClick={() => handleSelectSlide(Math.max(currentIndex - 1, 0))}
                disabled={currentIndex === 0}>← Prev</button>
              <span className="ctrl-nav-counter">{currentIndex + 1} / {slides.length}</span>
              <button type="button" className="ctrl-nav-btn"
                onClick={() => handleSelectSlide(Math.min(currentIndex + 1, slides.length - 1))}
                disabled={currentIndex === slides.length - 1}>Next →</button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
