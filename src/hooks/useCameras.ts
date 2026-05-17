import { useState, useEffect, useCallback, useRef } from 'react'
import { Camera } from '../types'

// Persist the set of camera deviceIds the user has removed from the list, so
// they stay hidden across refreshes and app restarts. Virtual cameras like
// OMEN Cam & Voice that appear in Windows but don't produce video can be
// dismissed once and forgotten about.
const HIDDEN_CAMERAS_KEY = 'churchlive.hiddenCameras'

function loadHiddenCameras(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_CAMERAS_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr.filter(s => typeof s === 'string')) : new Set()
  } catch { return new Set() }
}

function saveHiddenCameras(set: Set<string>): void {
  try { localStorage.setItem(HIDDEN_CAMERAS_KEY, JSON.stringify(Array.from(set))) } catch {}
}

export interface CameraViewSettings {
  resolution: '4k' | '1080p' | '720p' | '480p'
  frameRate: 30 | 60
  scale: number         // 10–300 % — framing zoom (CSS fallback, rarely used now)
  zoom: number          // 1.0–maxZoom — real camera zoom (hardware or canvas-based)
  offsetX: number       // -100 to 100 %
  offsetY: number       // -100 to 100 %
  fit: 'cover' | 'contain' | 'fill' | 'none'
  brightness: number    // 0–200 %
  contrast: number      // 0–200 %
  saturation: number    // 0–200 %
  flipH: boolean
  flipV: boolean
}

export const DEFAULT_CAM_VIEW: CameraViewSettings = {
  resolution: '1080p',
  frameRate: 30,
  scale: 100,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  fit: 'cover',
  brightness: 100,
  contrast: 100,
  saturation: 100,
  flipH: false,
  flipV: false,
}

interface UseCamerasReturn {
  cameras: Camera[]
  activeCamera: Camera | null
  activeCameraStream: MediaStream | null
  selectCamera: (camera: Camera) => Promise<void>
  refreshCameras: () => Promise<void>
  removeCamera: (deviceId: string) => void
  reorderCameras: (from: number, to: number) => void
  addCamera: (label: string, deviceId: string) => void
  cameraError: string | null
  isLoading: boolean
  camView: CameraViewSettings
  setCamView: (patch: Partial<CameraViewSettings>) => void
  disconnectedIds: Set<string>
  clearActiveCamera: () => void
  // Hardware-zoom info for the active camera — lets UI pick the right slider range
  // and lets consumers decide whether to fall back to canvas-based software zoom.
  zoomCaps: { supported: boolean; min: number; max: number; step: number }
}

export function useCameras(): UseCamerasReturn {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [activeCamera, setActiveCamera] = useState<Camera | null>(null)
  const [activeCameraStream, setActiveCameraStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [camViewMap, setCamViewMap] = useState<Record<string, CameraViewSettings>>({})
  // deviceIds that failed to open
  const [disconnectedIds, setDisconnectedIds] = useState<Set<string>>(new Set())
  // Persistent set of deviceIds the user has removed. Read once at mount; kept
  // via a ref so refreshCameras always sees the latest value.
  const hiddenIdsRef = useRef<Set<string>>(loadHiddenCameras())

  const streamRef = useRef<MediaStream | null>(null)
  const camViewRef = useRef<CameraViewSettings>(DEFAULT_CAM_VIEW)
  const activeCameraRef = useRef<Camera | null>(null)
  const camViewMapRef = useRef<Record<string, CameraViewSettings>>({})
  const selectCameraByIdRef = useRef<(camera: Camera, overrideView?: CameraViewSettings) => Promise<void>>(async () => {})
  const [zoomCaps, setZoomCaps] = useState<{ supported: boolean; min: number; max: number; step: number }>(
    { supported: false, min: 1, max: 4, step: 0.1 }
  )

  useEffect(() => { camViewMapRef.current = camViewMap }, [camViewMap])

  const stopCurrentStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setActiveCameraStream(null)
    }
  }, [])

  const resolutionMap: Record<string, { width: number; height: number }> = {
    '4k':   { width: 3840, height: 2160 },
    '1080p':{ width: 1920, height: 1080 },
    '720p': { width: 1280, height: 720  },
    '480p': { width: 854,  height: 480  },
  }

  const selectCameraById = useCallback(
    async (camera: Camera, overrideView?: CameraViewSettings) => {
      stopCurrentStream()
      setCameraError(null)

      const view = overrideView ?? camViewRef.current
      const res = resolutionMap[view.resolution] ?? resolutionMap['1080p']
      const fps = view.frameRate

      const videoBase: MediaTrackConstraints = camera.deviceId && camera.deviceId.length > 5
        ? { deviceId: { ideal: camera.deviceId } }
        : {}

      const attempts: MediaStreamConstraints[] = [
        { video: { ...videoBase, width: { ideal: res.width }, height: { ideal: res.height }, frameRate: { ideal: fps } }, audio: false },
        { video: { ...videoBase }, audio: false },
        { video: true, audio: false },
      ]

      let lastErr: any = null
      for (const constraints of attempts) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints)
          streamRef.current = stream
          setActiveCameraStream(stream)
          setActiveCamera(camera)
          activeCameraRef.current = camera
          // Mark as connected
          setDisconnectedIds(prev => {
            const next = new Set(prev)
            next.delete(camera.deviceId)
            return next
          })
          // Probe hardware zoom capabilities on the new video track.
          // Not all browsers/cameras expose `zoom` — when absent, the UI
          // will use canvas-based software zoom instead.
          try {
            const track = stream.getVideoTracks()[0]
            const caps = (track?.getCapabilities?.() ?? {}) as any
            if (caps && typeof caps.zoom === 'object' && caps.zoom !== null) {
              const min  = typeof caps.zoom.min  === 'number' ? caps.zoom.min  : 1
              const max  = typeof caps.zoom.max  === 'number' ? caps.zoom.max  : 4
              const step = typeof caps.zoom.step === 'number' && caps.zoom.step > 0 ? caps.zoom.step : 0.1
              setZoomCaps({ supported: true, min, max, step })
              // Restore any saved zoom for this camera
              const savedZoom = view.zoom ?? 1
              const clamped = Math.max(min, Math.min(max, savedZoom))
              if (clamped > min) {
                try { await track.applyConstraints({ advanced: [{ zoom: clamped } as any] }) } catch {}
              }
            } else {
              setZoomCaps({ supported: false, min: 1, max: 4, step: 0.1 })
            }
          } catch {
            setZoomCaps({ supported: false, min: 1, max: 4, step: 0.1 })
          }
          return
        } catch (err: any) {
          lastErr = err
        }
      }

      // All attempts failed — mark as disconnected
      setDisconnectedIds(prev => new Set(prev).add(camera.deviceId))
      setCameraError(
        `Cannot access "${camera.label}": ${lastErr?.message || 'Not connected'}.`
      )
    },
    [stopCurrentStream]
  )

  useEffect(() => { selectCameraByIdRef.current = selectCameraById }, [selectCameraById])

  const refreshCameras = useCallback(async () => {
    setIsLoading(true)
    setCameraError(null)

    try {
      let browserDevices: Camera[] = []
      let permissionDenied = false

      try {
        // If no stream is active yet we need a temporary getUserMedia to unlock
        // device labels. If a stream is already open we can enumerate directly —
        // opening a generic getUserMedia without a deviceId can cause the OS to
        // briefly activate the front/default camera, which on some platforms
        // triggers a devicechange event and interrupts the active camera stream.
        if (!streamRef.current) {
          try {
              const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
            tempStream.getTracks().forEach((t) => t.stop())
          } catch (permErr: any) {
            // If permission is denied, enumerate anyway (devices will have empty labels)
            if (permErr.name === 'NotAllowedError') {
              permissionDenied = true
            }
          }
        }

        const devices = await navigator.mediaDevices.enumerateDevices()
        browserDevices = devices
          .filter((d) => d.kind === 'videoinput')
          .map((d, idx) => ({
            id: d.deviceId || String(idx),
            label: d.label || `Camera ${idx + 1}`,
            deviceId: d.deviceId || String(idx),
          }))
      } catch (err) {
        // If enumeration fails completely, still try electron API
        browserDevices = []
      }

      let electronDevices: Camera[] = []
      if (window.electronAPI) {
        try {
          const result = await window.electronAPI.getCameras()
          if (result?.success && result.cameras?.length > 0) {
            electronDevices = result.cameras
          }
        } catch (err) {}
      }

      const hidden = hiddenIdsRef.current
      // Merge browser and electron devices, removing duplicates by deviceId
      const allDevices = [...browserDevices, ...electronDevices]
      const deviceMap = new Map<string, Camera>()
      for (const cam of allDevices) {
        if (!deviceMap.has(cam.deviceId)) {
          deviceMap.set(cam.deviceId, cam)
        }
      }
      const mergedRaw = Array.from(deviceMap.values())
      // Drop cameras the user has explicitly removed in the past.
      const merged = mergedRaw.filter(c => !hidden.has(c.deviceId))

      // Merge with existing manually-kept cameras (those not in the new list stay if user hasn't removed them)
      setCameras(prev => {
        const newIds = new Set(merged.map(c => c.deviceId))
        const kept = prev.filter(c => !newIds.has(c.deviceId) && !hidden.has(c.deviceId))
        return [...merged, ...kept]
      })

      // Clear disconnected state for cameras that are now physically present
      const mergedIds = new Set(merged.map(c => c.deviceId))
      setDisconnectedIds(prev => {
        const next = new Set(prev)
        for (const id of mergedIds) next.delete(id)
        return next
      })

      // Auto-select first camera if none selected
      if (merged.length > 0 && !activeCameraRef.current) {
        const first = merged[0]
        const savedView = camViewMapRef.current[first.deviceId] ?? DEFAULT_CAM_VIEW
        camViewRef.current = savedView
        selectCameraByIdRef.current(first, savedView)
      }

      // Show error if no cameras found and no other reason
      if (merged.length === 0 && permissionDenied) {
        setCameraError('Camera permission denied. Please grant permission to detect cameras.')
      }
    } catch (err: any) {
      setCameraError(err.message || 'Failed to enumerate cameras')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Remove a camera from the list entirely. The deviceId is also persisted to
  // localStorage so it stays hidden across app restarts — useful for virtual
  // cameras like OMEN Cam & Voice that ship with the OS but never produce video.
  const removeCamera = useCallback((deviceId: string) => {
    hiddenIdsRef.current.add(deviceId)
    saveHiddenCameras(hiddenIdsRef.current)
    setCameras(prev => prev.filter(c => c.deviceId !== deviceId))
    setDisconnectedIds(prev => {
      const next = new Set(prev)
      next.delete(deviceId)
      return next
    })
    if (activeCameraRef.current?.deviceId === deviceId) {
      stopCurrentStream()
      setActiveCamera(null)
      activeCameraRef.current = null
    }
  }, [stopCurrentStream])

  const camView: CameraViewSettings = activeCamera
    ? (camViewMap[activeCamera.deviceId] ?? DEFAULT_CAM_VIEW)
    : DEFAULT_CAM_VIEW

  useEffect(() => { camViewRef.current = camView }, [camView])
  useEffect(() => { activeCameraRef.current = activeCamera }, [activeCamera])

  const setCamView = useCallback((patch: Partial<CameraViewSettings>) => {
    if (!activeCameraRef.current) return
    const deviceId = activeCameraRef.current.deviceId
    setCamViewMap(prev => ({
      ...prev,
      [deviceId]: { ...(prev[deviceId] ?? DEFAULT_CAM_VIEW), ...patch },
    }))
  }, [])

  const prevResRef = useRef(camView.resolution)
  const prevFpsRef = useRef(camView.frameRate)
  useEffect(() => {
    if (!activeCameraRef.current) return
    if (camView.resolution === prevResRef.current && camView.frameRate === prevFpsRef.current) return
    prevResRef.current = camView.resolution
    prevFpsRef.current = camView.frameRate
    selectCameraById(activeCameraRef.current, camView)
  }, [camView.resolution, camView.frameRate])

  // Apply hardware zoom live when the user drags the zoom slider on a camera
  // that supports it. Software (canvas) zoom is applied in the preview components.
  useEffect(() => {
    if (!streamRef.current || !zoomCaps.supported) return
    const track = streamRef.current.getVideoTracks()[0]
    if (!track) return
    const clamped = Math.max(zoomCaps.min, Math.min(zoomCaps.max, camView.zoom ?? 1))
    track.applyConstraints({ advanced: [{ zoom: clamped } as any] }).catch(() => {})
  }, [camView.zoom, zoomCaps.supported, zoomCaps.min, zoomCaps.max])

  const selectCamera = useCallback(
    async (camera: Camera) => {
      const savedView = camViewMap[camera.deviceId] ?? DEFAULT_CAM_VIEW
      camViewRef.current = savedView
      await selectCameraById(camera, savedView)
    },
    [selectCameraById, camViewMap]
  )

  const reorderCameras = useCallback((from: number, to: number) => {
    setCameras(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const addCamera = useCallback((label: string, deviceId: string) => {
    const trimId = deviceId.trim()
    const trimLabel = label.trim() || `Camera (${trimId.slice(0, 8)})`
    if (hiddenIdsRef.current.delete(trimId)) saveHiddenCameras(hiddenIdsRef.current)
    setCameras(prev => {
      if (prev.some(c => c.deviceId === trimId)) return prev
      return [...prev, { id: trimId, label: trimLabel, deviceId: trimId }]
    })
  }, [])

  useEffect(() => {
    refreshCameras()
    navigator.mediaDevices.addEventListener('devicechange', refreshCameras)
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', refreshCameras)
      stopCurrentStream()
    }
  }, [])

  const clearActiveCamera = useCallback(() => {
    stopCurrentStream()
    setActiveCamera(null)
    setActiveCameraStream(null)
  }, [stopCurrentStream])

  return {
    cameras,
    activeCamera,
    activeCameraStream,
    selectCamera,
    refreshCameras,
    removeCamera,
    reorderCameras,
    addCamera,
    cameraError,
    isLoading,
    camView,
    setCamView,
    disconnectedIds,
    clearActiveCamera,
    zoomCaps,
  }
}
