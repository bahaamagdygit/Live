import { useState, useCallback } from 'react'
import { Slide } from '../types'

export interface SlideFile {
  id: string
  fileName: string
  filePath: string
  fileType: string
  slides: Slide[]
}

interface UseSlidesReturn {
  // library
  fileLibrary: SlideFile[]
  activeFileId: string | null
  activeFile: SlideFile | null
  addFiles: () => Promise<void>
  removeFile: (id: string) => void
  selectFile: (id: string) => void
  // current file's slides
  slides: Slide[]
  currentSlideIndex: number
  currentSlide: Slide | null
  isLoading: boolean
  error: string | null
  // legacy compat
  pptxFileName: string
  fileType: string
  openPptx: () => Promise<void>
  goToSlide: (index: number) => void
  nextSlide: () => void
  prevSlide: () => void
  getCurrentText: () => string
  getCurrentLangs: () => string[]
}

function makeId() {
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

function baseName(filePath: string) {
  return filePath.replace(/\\/g, '/').split('/').pop() || filePath
}

export function useSlides(): UseSlidesReturn {
  const [fileLibrary, setFileLibrary] = useState<SlideFile[]>([])
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeFile = fileLibrary.find(f => f.id === activeFileId) ?? null
  const slides = activeFile?.slides ?? []

  // ── Parse and add a single file result into the library ──────────────────
  const addFileResult = useCallback((r: { slides?: any[]; filePath?: string; fileType?: string }, autoSelect: boolean) => {
    if (!r.slides || !r.filePath) return
    const newFile: SlideFile = {
      id: makeId(),
      fileName: baseName(r.filePath),
      filePath: r.filePath,
      fileType: r.fileType || '',
      slides: r.slides,
    }
    setFileLibrary(prev => {
      const next = [...prev, newFile]
      if (autoSelect) {
        setActiveFileId(newFile.id)
        setCurrentSlideIndex(0)
      }
      return next
    })
  }, [])

  // ── Legacy single-file open ───────────────────────────────────────────────
  const openPptx = useCallback(async () => {
    if (!window.electronAPI) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.openPptx()
      if (result.canceled || !result.success) {
        if (!result.canceled) setError(result.error || 'Failed to open')
        return
      }
      addFileResult(result as any, true)
    } catch (err: any) {
      setError(err.message || 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [addFileResult])

  // ── Add multiple files ────────────────────────────────────────────────────
  const addFiles = useCallback(async () => {
    if (!window.electronAPI) return
    // Fallback: if new IPC not registered yet (app not restarted), use single picker
    if (!window.electronAPI.openMultiplePptx) {
      await openPptx()
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const res = await window.electronAPI.openMultiplePptx()
      if (res.canceled || !res.success || !res.results) return

      const goodResults = res.results.filter(r => r.success && r.slides && r.filePath)
      if (goodResults.length === 0) {
        setError('No files could be loaded.')
        return
      }

      setFileLibrary(prev => {
        const isFirstLoad = prev.length === 0
        const newFiles: SlideFile[] = goodResults.map(r => ({
          id: makeId(),
          fileName: baseName(r.filePath!),
          filePath: r.filePath!,
          fileType: r.fileType || '',
          slides: r.slides!,
        }))
        if (isFirstLoad) {
          setActiveFileId(newFiles[0].id)
          setCurrentSlideIndex(0)
        }
        return [...prev, ...newFiles]
      })
    } catch (err: any) {
      setError(err.message || 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [openPptx])

  const removeFile = useCallback((id: string) => {
    setFileLibrary(prev => {
      const next = prev.filter(f => f.id !== id)
      setActiveFileId(cur => {
        if (cur !== id) return cur
        return next.length > 0 ? next[0].id : null
      })
      setCurrentSlideIndex(0)
      return next
    })
  }, [])

  const selectFile = useCallback((id: string) => {
    setActiveFileId(id)
    setCurrentSlideIndex(0)
  }, [])

  const goToSlide = useCallback((index: number) => {
    if (index >= 0 && index < slides.length) setCurrentSlideIndex(index)
  }, [slides.length])

  const nextSlide = useCallback(() => {
    setCurrentSlideIndex(prev => Math.min(prev + 1, slides.length - 1))
  }, [slides.length])

  const prevSlide = useCallback(() => {
    setCurrentSlideIndex(prev => Math.max(prev - 1, 0))
  }, [])

  const getCurrentText = useCallback((): string => {
    if (!slides.length) return ''
    return (slides[currentSlideIndex]?.text ?? []).join('\n')
  }, [slides, currentSlideIndex])

  const getCurrentLangs = useCallback((): string[] => {
    if (!slides.length) return []
    return slides[currentSlideIndex]?.langs ?? []
  }, [slides, currentSlideIndex])

  return {
    fileLibrary,
    activeFileId,
    activeFile,
    addFiles,
    removeFile,
    selectFile,
    slides,
    currentSlideIndex,
    currentSlide: slides[currentSlideIndex] ?? null,
    isLoading,
    error,
    pptxFileName: activeFile?.fileName ?? '',
    fileType: activeFile?.fileType ?? '',
    openPptx,
    goToSlide,
    nextSlide,
    prevSlide,
    getCurrentText,
    getCurrentLangs,
  }
}
