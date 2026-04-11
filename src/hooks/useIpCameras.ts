import { useState, useCallback, useEffect } from 'react'
import { IpCameraPreset, IpCameraViewSettings, DEFAULT_IPCAM_VIEW } from '../types'

export interface IpCamera {
  id: string
  label: string
  rtspUrl: string
  port: number
  active: boolean
  /** MJPEG stream URL served locally by Electron */
  mjpegUrl: string
  /** Preset used to connect (for editing) */
  preset?: IpCameraPreset
  /** Per-camera view settings (zoom, pan, brightness…) */
  view: IpCameraViewSettings
}

const DEFAULT_PRESETS: IpCameraPreset[] = [
  { id: 'preset-1', label: 'Camera 1', host: '192.168.1.6',  port: '554', user: 'admin', pass: 'Fero2985@', channel: '1', subStream: false, brand: 'hilook' },
  { id: 'preset-2', label: 'Camera 2', host: '192.168.1.11', port: '554', user: 'admin', pass: 'Fero2985@', channel: '1', subStream: false, brand: 'hilook' },
]

interface UseIpCamerasReturn {
  ipCameras: IpCamera[]
  presets: IpCameraPreset[]
  addIpCamera: (label: string, rtspUrl: string, preset?: IpCameraPreset) => Promise<{ success: boolean; error?: string }>
  removeIpCamera: (id: string) => Promise<void>
  restartIpCamera: (id: string) => Promise<void>
  refreshIpCameras: () => Promise<void>
  savePreset: (preset: IpCameraPreset) => Promise<void>
  deletePreset: (id: string) => void
  updateIpCamView: (id: string, patch: Partial<IpCameraViewSettings>) => void
}

function buildRtspFromPreset(p: IpCameraPreset): string {
  const enc = (s: string) =>
    s.replace(/%/g, '%25').replace(/@/g, '%40').replace(/:/g, '%3A').replace(/\?/g, '%3F').replace(/#/g, '%23')
  const auth = p.user ? `${enc(p.user)}:${enc(p.pass)}@` : ''
  const streamDigit = p.subStream ? 2 : 1
  const chStream = parseInt(p.channel || '1') * 100 + streamDigit
  if (p.brand === 'hilook' || p.brand === 'hikvision') {
    return `rtsp://${auth}${p.host}:${p.port}/Streaming/Channels/${chStream}`
  }
  if (p.brand === 'dahua') {
    return `rtsp://${auth}${p.host}:${p.port}/cam/realmonitor?channel=${p.channel}&subtype=${p.subStream ? 1 : 0}`
  }
  return `rtsp://${auth}${p.host}:${p.port}/Streaming/Channels/${chStream}`
}

export function useIpCameras(): UseIpCamerasReturn {
  const [ipCameras, setIpCameras] = useState<IpCamera[]>([])
  const [presets, setPresets] = useState<IpCameraPreset[]>([])

  const toMjpegUrl = (port: number) => `http://127.0.0.1:${port}/`

  // Load presets from saved settings on mount
  useEffect(() => {
    const load = async () => {
      if (!window.electronAPI?.getSettings) { setPresets(DEFAULT_PRESETS); return }
      const res = await window.electronAPI.getSettings()
      const saved = res.settings?.ipCameraPresets
      setPresets(saved && saved.length > 0 ? saved : DEFAULT_PRESETS)
    }
    load()
  }, [])

  const savePresetsToStore = useCallback(async (updated: IpCameraPreset[]) => {
    if (!window.electronAPI?.getSettings || !window.electronAPI?.saveSettings) return
    const res = await window.electronAPI.getSettings()
    if (res.settings) {
      await window.electronAPI.saveSettings({ ...res.settings, ipCameraPresets: updated })
    }
  }, [])

  const savePreset = useCallback(async (preset: IpCameraPreset) => {
    setPresets(prev => {
      const idx = prev.findIndex(p => p.id === preset.id)
      const updated = idx >= 0
        ? prev.map(p => p.id === preset.id ? preset : p)
        : [...prev, preset]
      savePresetsToStore(updated)
      // Also update label on any live camera using this preset
      setIpCameras(cams => cams.map(c =>
        c.preset?.id === preset.id ? { ...c, preset, label: preset.label } : c
      ))
      return updated
    })
  }, [savePresetsToStore])

  const deletePreset = useCallback((id: string) => {
    setPresets(prev => {
      const updated = prev.filter(p => p.id !== id)
      savePresetsToStore(updated)
      return updated
    })
  }, [savePresetsToStore])

  const refreshIpCameras = useCallback(async () => {
    if (!window.electronAPI?.ipCameraList) return
    const res = await window.electronAPI.ipCameraList()
    if (res.success) {
      setIpCameras(prev => res.cameras.map(c => ({
        ...c,
        mjpegUrl: toMjpegUrl(c.port),
        preset: prev.find(p => p.id === c.id)?.preset,
        view: prev.find(p => p.id === c.id)?.view ?? { ...DEFAULT_IPCAM_VIEW },
      })))
    }
  }, [])

  const addIpCamera = useCallback(async (label: string, rtspUrl: string, preset?: IpCameraPreset) => {
    if (!window.electronAPI?.ipCameraAdd) return { success: false, error: 'Not available' }
    const id = preset ? `preset-live-${preset.id}` : `ipcam-${Date.now()}`
    const res = await window.electronAPI.ipCameraAdd(id, label.trim() || 'IP Camera', rtspUrl.trim())
    if (res.success && res.port !== undefined) {
      setIpCameras(prev => {
        // Replace if same id already exists (reconnect)
        const filtered = prev.filter(c => c.id !== id)
        return [...filtered, {
          id,
          label: label.trim() || 'IP Camera',
          rtspUrl: rtspUrl.trim(),
          port: res.port!,
          active: true,
          mjpegUrl: toMjpegUrl(res.port!),
          preset,
          view: { ...DEFAULT_IPCAM_VIEW },
        }]
      })
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

  const updateIpCamView = useCallback((id: string, patch: Partial<IpCameraViewSettings>) => {
    setIpCameras(prev => prev.map(c => c.id === id ? { ...c, view: { ...c.view, ...patch } } : c))
  }, [])

  useEffect(() => { refreshIpCameras() }, [refreshIpCameras])

  return { ipCameras, presets, addIpCamera, removeIpCamera, restartIpCamera, refreshIpCameras, savePreset, deletePreset, updateIpCamView }
}

export { buildRtspFromPreset }
