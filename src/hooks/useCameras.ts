import { useState, useEffect, useCallback, useRef } from 'react'
import { Camera } from '../types'

export interface CameraViewSettings {
  resolution: '4k' | '1080p' | '720p' | '480p'
  frameRate: 30 | 60
  scale: number         // 10–300 %
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

  const streamRef = useRef<MediaStream | null>(null)
  const camViewRef = useRef<CameraViewSettings>(DEFAULT_CAM_VIEW)
  const activeCameraRef = useRef<Camera | null>(null)
  const camViewMapRef = useRef<Record<string, CameraViewSettings>>({})
  const selectCameraByIdRef = useRef<(camera: Camera, overrideView?: CameraViewSettings) => Promise<void>>(async () => {})

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
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true })
        tempStream.getTracks().forEach((t) => t.stop())

        const devices = await navigator.mediaDevices.enumerateDevices()
        browserDevices = devices
          .filter((d) => d.kind === 'videoinput')
          .map((d, idx) => ({
            id: d.deviceId || String(idx),
            label: d.label || `Camera ${idx + 1}`,
            deviceId: d.deviceId || String(idx),
          }))
      } catch (err) {}

      let electronDevices: Camera[] = []
      if (window.electronAPI) {
        try {
          const result = await window.electronAPI.getCameras()
          if (result?.success && result.cameras?.length > 0) {
            electronDevices = result.cameras
          }
        } catch (err) {}
      }

      const merged = browserDevices.length > 0 ? browserDevices : electronDevices

      // Merge with existing manually-kept cameras (those not in the new list stay if user hasn't removed them)
      setCameras(prev => {
        // Keep cameras from prev that are NOT in the new list (manually added / disconnected but kept)
        const newIds = new Set(merged.map(c => c.deviceId))
        const kept = prev.filter(c => !newIds.has(c.deviceId))
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
    } catch (err: any) {
      setCameraError(err.message || 'Failed to enumerate cameras')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Remove a camera from the list entirely
  const removeCamera = useCallback((deviceId: string) => {
    setCameras(prev => prev.filter(c => c.deviceId !== deviceId))
    setDisconnectedIds(prev => {
      const next = new Set(prev)
      next.delete(deviceId)
      return next
    })
    // If it was the active camera, deselect
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
  }
}
