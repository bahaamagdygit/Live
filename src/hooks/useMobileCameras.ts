import { useCallback, useEffect, useState } from 'react'
import { MobileBridgeDevice } from '../types/electron'

export interface FilterState {
  brightness: number   // 0–200 % (100 default)
  contrast:   number   // 0–200 % (100 default)
  saturation: number   // 0–200 % (100 default)
  hue:        number   // 0–360 ° (0 default)
  sepia:      number   // 0–100 % (0 default)
  grayscale:  number   // 0–100 % (0 default)
  blur:       number   // 0–10 px (0 default)
  opacity:    number   // 0–100 % (100 default)
}

export const DEFAULT_FILTERS: FilterState = {
  brightness: 100, contrast: 100, saturation: 100, hue: 0,
  sepia: 0, grayscale: 0, blur: 0, opacity: 100,
}

export type FilterPresetId =
  | 'natural' | 'warm' | 'cool' | 'dramatic' | 'bw' | 'churchGlow' | 'reset'

export const FILTER_PRESETS: Record<Exclude<FilterPresetId, 'reset'>, FilterState> = {
  natural:    { ...DEFAULT_FILTERS, brightness: 108, saturation: 112 },
  warm:       { ...DEFAULT_FILTERS, sepia: 28, brightness: 104, saturation: 108 },
  cool:       { ...DEFAULT_FILTERS, hue: 210, saturation: 110 },
  dramatic:   { ...DEFAULT_FILTERS, contrast: 140, saturation: 80 },
  bw:         { ...DEFAULT_FILTERS, grayscale: 100, contrast: 120 },
  churchGlow: { ...DEFAULT_FILTERS, brightness: 112, contrast: 106, saturation: 110, sepia: 12 },
}

export function applyFilterPreset(id: FilterPresetId): FilterState {
  if (id === 'reset') return { ...DEFAULT_FILTERS }
  return { ...FILTER_PRESETS[id] }
}

export function filtersToCss(f: FilterState): string {
  return [
    `brightness(${f.brightness}%)`,
    `contrast(${f.contrast}%)`,
    `saturate(${f.saturation}%)`,
    `hue-rotate(${f.hue}deg)`,
    `sepia(${f.sepia}%)`,
    `grayscale(${f.grayscale}%)`,
    `blur(${f.blur}px)`,
    `opacity(${f.opacity}%)`,
  ].join(' ')
}

export interface MobileCameraView {
  filters: FilterState
  zoom: number          // active software zoom on desktop side (1–maxZoom)
  flipH: boolean
  flipV: boolean
  fit: 'cover' | 'contain' | 'fill' | 'none'
  offsetX: number
  offsetY: number
  // Pending hardware controls the phone applies to its camera.
  exposure: number      // −10 to +10
  whiteBalance: 'auto' | 'sunny' | 'cloudy' | 'shadow' | 'incandescent' | 'fluorescent'
  torch: 'off' | 'on' | 'auto'
  facing: 'front' | 'back'
  resolution: { width: number; height: number }
  frameRate: number
  focusPoint: { x: number; y: number } | null
}

export const DEFAULT_MOBILE_VIEW: MobileCameraView = {
  filters: { ...DEFAULT_FILTERS },
  zoom: 1,
  flipH: false, flipV: false,
  fit: 'cover', offsetX: 0, offsetY: 0,
  exposure: 0,
  whiteBalance: 'auto',
  torch: 'off',
  facing: 'back',
  resolution: { width: 1280, height: 720 },
  frameRate: 30,
  focusPoint: null,
}

export interface ConnectionInfo {
  url: string
  ip: string
  qrDataUrl: string
  controlPort: number
  videoPort: number
  mjpegPort: number
}

interface UseMobileCamerasResult {
  devices: MobileBridgeDevice[]
  connection: ConnectionInfo | null
  frozenIds: Set<string>
  views: Record<string, MobileCameraView>
  mjpegUrlFor: (deviceId: string) => string
  sendCommand: (deviceId: string, action: string, value?: unknown) => void
  updateView: (deviceId: string, patch: Partial<MobileCameraView>) => void
  applyPreset: (deviceId: string, preset: FilterPresetId) => void
}

export function useMobileCameras(): UseMobileCamerasResult {
  const [devices,   setDevices]   = useState<MobileBridgeDevice[]>([])
  const [connection, setConnection] = useState<ConnectionInfo | null>(null)
  const [frozenIds, setFrozenIds] = useState<Set<string>>(new Set())
  const [views, setViews] = useState<Record<string, MobileCameraView>>({})

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.mbStart) return
    let disposed = false

    api.mbStart().then(res => {
      if (disposed || !res?.success) return
      setConnection({
        url: res.url, ip: res.ip, qrDataUrl: res.qrDataUrl,
        controlPort: res.controlPort, videoPort: res.videoPort,
        mjpegPort: res.mjpegPort,
      })
      setDevices(res.devices ?? [])
    })

    const offJoined = api.onMobileDeviceJoined?.(({ device }) => {
      setDevices(prev => {
        const others = prev.filter(d => d.deviceId !== device.deviceId)
        return [...others, device]
      })
      setViews(prev => prev[device.deviceId]
        ? prev
        : { ...prev, [device.deviceId]: { ...DEFAULT_MOBILE_VIEW } })
    })

    const offUpdated = api.onMobileDeviceUpdated?.(({ device }) => {
      setDevices(prev => prev.map(d => d.deviceId === device.deviceId ? device : d))
    })

    const offGone = api.onMobileDeviceDisconnected?.(({ deviceId }) => {
      setDevices(prev => prev.filter(d => d.deviceId !== deviceId))
      setFrozenIds(prev => { const n = new Set(prev); n.delete(deviceId); return n })
    })

    const offFrozen = api.onMobileFrameFrozen?.(({ deviceId }) => {
      setFrozenIds(prev => {
        if (prev.has(deviceId)) return prev
        const n = new Set(prev); n.add(deviceId); return n
      })
    })

    return () => {
      disposed = true
      offJoined?.(); offUpdated?.(); offGone?.(); offFrozen?.()
      api.mbStop?.()
    }
  }, [])

  const mjpegUrlFor = useCallback((deviceId: string) => {
    const port = connection?.mjpegPort ?? 18850
    return `http://127.0.0.1:${port}/dev/${encodeURIComponent(deviceId)}`
  }, [connection?.mjpegPort])

  const sendCommand = useCallback((deviceId: string, action: string, value?: unknown) => {
    window.electronAPI?.mbSendCommand?.(deviceId, action, value)
  }, [])

  const updateView = useCallback((deviceId: string, patch: Partial<MobileCameraView>) => {
    setViews(prev => {
      const current = prev[deviceId] ?? DEFAULT_MOBILE_VIEW
      const next: MobileCameraView = {
        ...current, ...patch,
        filters: patch.filters ? { ...current.filters, ...patch.filters } : current.filters,
      }
      return { ...prev, [deviceId]: next }
    })
  }, [])

  // Mirror filter state to the phone so its own preview matches the desktop.
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.mbBroadcastFilter) return
    for (const [deviceId, view] of Object.entries(views)) {
      api.mbBroadcastFilter(deviceId, view.filters as unknown as Record<string, unknown>)
    }
    // Only runs when views change — OK for a small map.
  }, [views])

  const applyPreset = useCallback((deviceId: string, preset: FilterPresetId) => {
    updateView(deviceId, { filters: applyFilterPreset(preset) })
  }, [updateView])

  return { devices, connection, frozenIds, views, mjpegUrlFor, sendCommand, updateView, applyPreset }
}
