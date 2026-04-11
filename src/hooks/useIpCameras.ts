import { useState, useCallback, useEffect, useRef } from 'react'
import { IpCameraPreset, IpCameraViewSettings, DEFAULT_IPCAM_VIEW } from '../types'

export interface IpCamera {
  id: string
  label: string
  rtspUrl: string
  port: number
  active: boolean
  mjpegUrl: string
  preset: IpCameraPreset
  view: IpCameraViewSettings
  error?: string
}

const DEFAULT_PRESETS: IpCameraPreset[] = [
  { id: 'preset-1', label: 'Camera 1', host: '192.168.1.6',  port: '554', user: 'admin', pass: 'Fero2985@', channel: '1', subStream: false, brand: 'hilook' },
  { id: 'preset-2', label: 'Camera 2', host: '192.168.1.11', port: '554', user: 'admin', pass: 'Fero2985@', channel: '1', subStream: false, brand: 'hilook' },
]

export function buildRtspFromPreset(p: IpCameraPreset): string {
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

interface UseIpCamerasReturn {
  ipCameras: IpCamera[]
  connectPreset: (preset: IpCameraPreset) => Promise<void>
  disconnectCamera: (id: string) => Promise<void>
  reconnectCamera: (id: string) => Promise<void>
  saveAndReconnect: (preset: IpCameraPreset) => Promise<void>
  updateIpCamView: (id: string, patch: Partial<IpCameraViewSettings>) => void
}

export function useIpCameras(): UseIpCamerasReturn {
  const [ipCameras, setIpCameras] = useState<IpCamera[]>([])
  const toMjpegUrl = (port: number) => `http://127.0.0.1:${port}/`
  const presetsRef = useRef<IpCameraPreset[]>([])

  const loadPresets = async (): Promise<IpCameraPreset[]> => {
    if (!window.electronAPI?.getSettings) return DEFAULT_PRESETS
    const res = await window.electronAPI.getSettings()
    const saved = res.settings?.ipCameraPresets
    return saved && saved.length > 0 ? saved : DEFAULT_PRESETS
  }

  const savePresets = async (presets: IpCameraPreset[]) => {
    if (!window.electronAPI?.getSettings || !window.electronAPI?.saveSettings) return
    const res = await window.electronAPI.getSettings()
    if (res.settings) {
      await window.electronAPI.saveSettings({ ...res.settings, ipCameraPresets: presets })
    }
  }

  const connectPreset = useCallback(async (preset: IpCameraPreset) => {
    if (!window.electronAPI?.ipCameraAdd) return
    const id = `preset-live-${preset.id}`
    const rtspUrl = buildRtspFromPreset(preset)

    // Mark as connecting
    setIpCameras(prev => {
      const existing = prev.find(c => c.id === id)
      if (existing) return prev.map(c => c.id === id ? { ...c, active: false, error: undefined } : c)
      return [...prev, {
        id, label: preset.label, rtspUrl, port: 0, active: false,
        mjpegUrl: '', preset, view: { ...DEFAULT_IPCAM_VIEW }, error: undefined,
      }]
    })

    const res = await window.electronAPI.ipCameraAdd(id, preset.label, rtspUrl)
    if (res.success && res.port !== undefined) {
      setIpCameras(prev => prev.map(c => c.id === id
        ? { ...c, port: res.port!, active: true, mjpegUrl: toMjpegUrl(res.port!), error: undefined }
        : c))
    } else {
      setIpCameras(prev => prev.map(c => c.id === id
        ? { ...c, active: false, error: res.error ?? 'Failed to connect' }
        : c))
    }
  }, [])

  const disconnectCamera = useCallback(async (id: string) => {
    if (window.electronAPI?.ipCameraRemove) await window.electronAPI.ipCameraRemove(id)
    setIpCameras(prev => prev.filter(c => c.id !== id))
  }, [])

  const reconnectCamera = useCallback(async (id: string) => {
    setIpCameras(prev => {
      const cam = prev.find(c => c.id === id)
      if (cam) connectPreset(cam.preset)
      return prev
    })
  }, [connectPreset])

  const saveAndReconnect = useCallback(async (preset: IpCameraPreset) => {
    // Update presets list
    const current = presetsRef.current
    const idx = current.findIndex(p => p.id === preset.id)
    const updated = idx >= 0 ? current.map(p => p.id === preset.id ? preset : p) : [...current, preset]
    presetsRef.current = updated
    await savePresets(updated)

    // Disconnect old stream and reconnect with new settings
    const id = `preset-live-${preset.id}`
    if (window.electronAPI?.ipCameraRemove) await window.electronAPI.ipCameraRemove(id)
    await connectPreset(preset)
  }, [connectPreset])

  const updateIpCamView = useCallback((id: string, patch: Partial<IpCameraViewSettings>) => {
    setIpCameras(prev => prev.map(c => c.id === id ? { ...c, view: { ...c.view, ...patch } } : c))
  }, [])

  // Auto-connect all presets on startup
  useEffect(() => {
    const init = async () => {
      const presets = await loadPresets()
      presetsRef.current = presets
      for (const preset of presets) {
        connectPreset(preset)
      }
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { ipCameras, connectPreset, disconnectCamera, reconnectCamera, saveAndReconnect, updateIpCamView }
}
