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
  cameraError: string | null
  isLoading: boolean
  camView: CameraViewSettings
  setCamView: (patch: Partial<CameraViewSettings>) => void
}

export function useCameras(): UseCamerasReturn {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [activeCamera, setActiveCamera] = useState<Camera | null>(null)
  const [activeCameraStream, setActiveCameraStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  // Per-camera settings keyed by deviceId
  const [camViewMap, setCamViewMap] = useState<Record<string, CameraViewSettings>>({})
  const streamRef = useRef<MediaStream | null>(null)
  const camViewRef = useRef<CameraViewSettings>(DEFAULT_CAM_VIEW)
  const activeCameraRef = useRef<Camera | null>(null)

  const refreshCameras = useCallback(async () => {
    setIsLoading(true)
    setCameraError(null)

    try {
      // First, enumerate via browser MediaDevices API
      let browserDevices: Camera[] = []
      try {
        // Request permission first
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
      } catch (err) {
      }

      // Also try Electron API for system-level camera list
      let electronDevices: Camera[] = []
      if (window.electronAPI) {
        try {
          const result = await window.electronAPI.getCameras()
          if (result?.success && result.cameras?.length > 0) {
            electronDevices = result.cameras
          }
        } catch (err) {
        }
      }

      // Merge: prefer browser devices (they have proper deviceIds for getUserMedia)
      const merged =
        browserDevices.length > 0 ? browserDevices : electronDevices

      setCameras(merged)

      // Auto-select first camera if none selected (don't let stream errors block the list)
      if (merged.length > 0 && !activeCamera) {
      }
    } catch (err: any) {
      setCameraError(err.message || 'Failed to enumerate cameras')
    } finally {
      setIsLoading(false)
    }
  }, [activeCamera])

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
          return
        } catch (err: any) {
          lastErr = err
        }
      }

      setCameraError(
        `Cannot access camera: ${lastErr?.message || 'Unknown error'}. Make sure camera permissions are granted.`
      )
    },
    [stopCurrentStream]
  )

  // Current active camera's view (falls back to defaults)
  const camView: CameraViewSettings = activeCamera
    ? (camViewMap[activeCamera.deviceId] ?? DEFAULT_CAM_VIEW)
    : DEFAULT_CAM_VIEW

  // Keep ref in sync
  useEffect(() => { camViewRef.current = camView }, [camView])
  useEffect(() => { activeCameraRef.current = activeCamera }, [activeCamera])

  // Patch settings only for the active camera
  const setCamView = useCallback((patch: Partial<CameraViewSettings>) => {
    if (!activeCameraRef.current) return
    const deviceId = activeCameraRef.current.deviceId
    setCamViewMap(prev => ({
      ...prev,
      [deviceId]: { ...(prev[deviceId] ?? DEFAULT_CAM_VIEW), ...patch },
    }))
  }, [])

  // Re-open stream when resolution or frameRate changes for active camera
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
      // Load this camera's saved settings when switching
      const savedView = camViewMap[camera.deviceId] ?? DEFAULT_CAM_VIEW
      camViewRef.current = savedView
      await selectCameraById(camera, savedView)
    },
    [selectCameraById, camViewMap]
  )

  useEffect(() => {
    refreshCameras()

    // Listen for device changes
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
    cameraError,
    isLoading,
    camView,
    setCamView,
  }
}

