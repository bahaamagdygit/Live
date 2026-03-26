import { useState, useCallback } from 'react'
import { Slide } from '../types'

interface UseSlidesReturn {
  slides: Slide[]
  currentSlideIndex: number
  currentSlide: Slide | null
  isLoading: boolean
  error: string | null
  pptxFileName: string
  openPptx: () => Promise<void>
  goToSlide: (index: number) => void
  nextSlide: () => void
  prevSlide: () => void
  getCurrentText: () => string
}

export function useSlides(): UseSlidesReturn {
  const [slides, setSlides] = useState<Slide[]>([])
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pptxFileName, setPptxFileName] = useState('')

  const openPptx = useCallback(async () => {
    if (!window.electronAPI) return
    setIsLoading(true)
    setError(null)

    try {
      const result = await window.electronAPI.openPptx()
      if (result.canceled) {
        return
      }
      if (!result.success) {
        setError(result.error || 'Failed to open PPTX')
        return
      }

      setSlides(result.slides || [])
      setCurrentSlideIndex(0)

      if (result.filePath) {
        const parts = result.filePath.replace(/\\/g, '/').split('/')
        setPptxFileName(parts[parts.length - 1])
      }
    } catch (err: any) {
      setError(err.message || 'Unknown error opening PPTX')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const goToSlide = useCallback(
    (index: number) => {
      if (index >= 0 && index < slides.length) {
        setCurrentSlideIndex(index)
      }
    },
    [slides.length]
  )

  const nextSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => Math.min(prev + 1, slides.length - 1))
  }, [slides.length])

  const prevSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => Math.max(prev - 1, 0))
  }, [])

  const getCurrentText = useCallback((): string => {
    if (slides.length === 0) return ''
    const slide = slides[currentSlideIndex]
    if (!slide) return ''
    return slide.text.join('\n')
  }, [slides, currentSlideIndex])

  const currentSlide = slides.length > 0 ? slides[currentSlideIndex] : null

  return {
    slides,
    currentSlideIndex,
    currentSlide,
    isLoading,
    error,
    pptxFileName,
    openPptx,
    goToSlide,
    nextSlide,
    prevSlide,
    getCurrentText,
  }
}
