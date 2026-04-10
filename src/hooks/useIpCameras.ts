import { useState, useCallback, useEffect } from 'react'

export interface IpCamera {
  id: string
  label: string
  rtspUrl: string
  port: number
  active: boolean
  /** MJPEG stream URL served locally by Electron */
  mjpegUrl: string
}

interface UseIpCamerasReturn {
  ipCameras: IpCamera[]
  addIpCamera: (label: string, rtspUrl: string) => Promise<{ success: boolean; error?: string }>
  removeIpCamera: (id: string) => Promise<void>
  restartIpCamera: (id: string) => Promise<void>
  refreshIpCameras: () => Promise<void>
}

export function useIpCameras(): UseIpCamerasReturn {
  const [ipCameras, setIpCameras] = useState<IpCamera[]>([])

  const toMjpegUrl = (port: number) => `http://127.0.0.1:${port}/`

  const refreshIpCameras = useCallback(async () => {
    if (!window.electronAPI?.ipCameraList) return
    const res = await window.electronAPI.ipCameraList()
    if (res.success) {
      setIpCameras(res.cameras.map(c => ({ ...c, mjpegUrl: toMjpegUrl(c.port) })))
    }
  }, [])

  const addIpCamera = useCallback(async (label: string, rtspUrl: string) => {
    if (!window.electronAPI?.ipCameraAdd) return { success: false, error: 'Not available' }
    const id = `ipcam-${Date.now()}`
    const res = await window.electronAPI.ipCameraAdd(id, label.trim() || `IP Camera`, rtspUrl.trim())
    if (res.success && res.port !== undefined) {
      setIpCameras(prev => [...prev, {
        id,
        label: label.trim() || `IP Camera`,
        rtspUrl: rtspUrl.trim(),
        port: res.port!,
        active: true,
        mjpegUrl: toMjpegUrl(res.port!),
      }])
      return { success: true }
    }
    return { success: false, error: res.error }
  }, [])

  const removeIpCamera = useCallback(async (id: string) => {
    if (window.electronAPI?.ipCameraRemove) {
      await window.electronAPI.ipCameraRemove(id)
    }
    setIpCameras(prev => prev.filter(c => c.id !== id))
  }, [])

  const restartIpCamera = useCallback(async (id: string) => {
    if (!window.electronAPI?.ipCameraRestart) return
    await window.electronAPI.ipCameraRestart(id)
    setIpCameras(prev => prev.map(c => c.id === id ? { ...c, active: true } : c))
  }, [])

  useEffect(() => { refreshIpCameras() }, [refreshIpCameras])

  return { ipCameras, addIpCamera, removeIpCamera, restartIpCamera, refreshIpCameras }
}
