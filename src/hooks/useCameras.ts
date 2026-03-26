import { useState, useEffect, useCallback, useRef } from 'react'
import { Camera } from '../types'

interface UseCamerasReturn {
  cameras: Camera[]
  activeCamera: Camera | null
  activeCameraStream: MediaStream | null
  selectCamera: (camera: Camera) => Promise<void>
  refreshCameras: () => Promise<void>
  cameraError: string | null
  isLoading: boolean
}

export function useCameras(): UseCamerasReturn {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [activeCamera, setActiveCamera] = useState<Camera | null>(null)
  const [activeCameraStream, setActiveCameraStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

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
        console.warn('Browser camera enumeration failed:', err)
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
          console.warn('Electron camera API failed:', err)
        }
      }

      // Merge: prefer browser devices (they have proper deviceIds for getUserMedia)
      const merged =
        browserDevices.length > 0 ? browserDevices : electronDevices

      setCameras(merged)

      // Auto-select first camera if none selected (don't let stream errors block the list)
      if (merged.length > 0 && !activeCamera) {
        selectCameraById(merged[0]).catch((e) => console.warn('Auto-select camera failed:', e))
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

  const selectCameraById = useCallback(
    async (camera: Camera) => {
      stopCurrentStream()
      setCameraError(null)

      // Build a list of constraints to try in order
      const attempts: MediaStreamConstraints[] = []

      // 1. Ideal (non-exact) deviceId — avoids "device not found" errors
      if (camera.deviceId && camera.deviceId.length > 5) {
        attempts.push({ video: { deviceId: { ideal: camera.deviceId } }, audio: false })
      }
      // 2. Plain video: true — just grab any available camera
      attempts.push({ video: true, audio: false })

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

  const selectCamera = useCallback(
    async (camera: Camera) => {
      await selectCameraById(camera)
    },
    [selectCameraById]
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
  }
}
