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
  const [activeSectionName, setActiveSectionName] = useState<string>('')
  const activeSlideRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!window.electronAPI?.onSlidesData) return
    const cleanup = window.electronAPI.onSlidesData((data: SlidesData) => {
      setSlides(data.slides)
      setFileName(data.fileName)
      setCurrentIndex(data.currentIndex)
      setTextVisible(data.textVisible)
      const active = data.slides[data.currentIndex]
      setActiveSectionName(active?.section || 'General')
    })
    return cleanup
  }, [])

  useEffect(() => {
    if (!window.electronAPI?.onSlideIndexChanged) return
    const cleanup = window.electronAPI.onSlideIndexChanged((index: number) => {
      setCurrentIndex(index)
    })
    return cleanup
  }, [])

  useEffect(() => {
    activeSlideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [currentIndex])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowDown') { e.preventDefault(); handleSelectSlide(Math.min(currentIndex + 1, slides.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); handleSelectSlide(Math.max(currentIndex - 1, 0)) }
      else if (e.key === ' ') { e.preventDefault(); handleToggleText(!textVisible) }
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
  const activeSection = sections.find(s => s.name === activeSectionName) ?? sections[0]

  return (
    <div className="ctrl-root">

      {/* ── Header ── */}
      <header className="ctrl-header">
        <div className="ctrl-header__left">
          <span className="ctrl-header__icon">📊</span>
          <div>
            <div className="ctrl-header__title">PowerPoint Controller</div>
            {fileName && <div className="ctrl-header__file">{fileName}</div>}
          </div>
        </div>
        <button type="button" className="ctrl-open-btn" onClick={handleOpenPptx} disabled={isLoading}>
          {isLoading ? 'Loading...' : '📂 Open File'}
        </button>
      </header>

      {slides.length === 0 ? (
        <div className="ctrl-empty">
          <div className="ctrl-empty__icon">📊</div>
          <p className="ctrl-empty__title">No File Loaded</p>
          <p className="ctrl-empty__sub">Open a PPTX file to get started</p>
          <button type="button" className="ctrl-open-btn ctrl-open-btn--lg" onClick={handleOpenPptx}>📂 Open File</button>
        </div>
      ) : (
        <div className="ctrl-body">

          {/* ── COL A: Preview + controls (leftmost) ── */}
          <div className="ctrl-col-preview">
            <div className="col-label">CURRENT SLIDE</div>
            <div className="ctrl-preview-box">
              <div className="ctrl-preview-text" dir={isRtl(currentText) ? 'rtl' : 'ltr'}>
                {currentSlide?.text.length
                  ? currentSlide.text.map((l, i) => <div key={i} className="ctrl-preview-line">{l}</div>)
                  : <span className="ctrl-preview-empty">No text</span>}
              </div>
            </div>
            <div className="ctrl-preview-meta">
              Slide {currentIndex + 1} of {slides.length}
              {currentSlide?.section && <span className="ctrl-preview-sec"> · {currentSlide.section}</span>}
            </div>

            <button
              type="button"
              className={`ctrl-show-btn${textVisible ? ' ctrl-show-btn--on' : ''}`}
              onClick={() => handleToggleText(!textVisible)}
            >
              <span className="ctrl-show-dot" />
              {textVisible ? 'HIDE TEXT' : 'SHOW TEXT'}
            </button>

            <div className="ctrl-nav">
              <button type="button" className="ctrl-nav-btn" onClick={() => handleSelectSlide(Math.max(currentIndex - 1, 0))} disabled={currentIndex === 0}>← Prev</button>
              <span className="ctrl-nav-num">{currentIndex + 1}/{slides.length}</span>
              <button type="button" className="ctrl-nav-btn" onClick={() => handleSelectSlide(Math.min(currentIndex + 1, slides.length - 1))} disabled={currentIndex === slides.length - 1}>Next →</button>
            </div>

            <div className="ctrl-hints">
              <span>↑↓ Navigate</span>
              <span>Space Show/Hide</span>
            </div>
          </div>

          {/* ── COL B: Slide cards (middle) ── */}
          <div className="ctrl-col-cards">
            <div className="ctrl-cards-header">
              <span className="ctrl-cards-secname">{activeSection?.name}</span>
              <span className="ctrl-cards-count">{activeSection?.slides.length} slides</span>
            </div>
            <div className="ctrl-cards-grid">
              {(activeSection?.slides ?? []).map(slide => {
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
                    <div className="ctrl-card__body">
                      {line1
                        ? <div className="ctrl-card__line1">{line1}</div>
                        : <div className="ctrl-card__empty">—</div>}
                      {line2 && <div className="ctrl-card__line2">{line2}</div>}
                    </div>
                    {isActive && <div className="ctrl-card__indicator" />}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── COL C: Sections list (rightmost) ── */}
          <div className="ctrl-col-sections">
            <div className="col-label">SECTIONS</div>
            <div className="ctrl-sec-list">
              {sections.map(sec => {
                const isActive = sec.name === activeSectionName
                const hasCurrent = sec.slides.some(s => s.index === currentIndex)
                return (
                  <button
                    key={sec.name}
                    className={`ctrl-sec-item${isActive ? ' ctrl-sec-item--active' : ''}${hasCurrent && !isActive ? ' ctrl-sec-item--current' : ''}`}
                    onClick={() => setActiveSectionName(sec.name)}
                    title={sec.name}
                  >
                    <span className="ctrl-sec-item__count">{sec.slides.length}</span>
                    <span className="ctrl-sec-item__name">{sec.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
