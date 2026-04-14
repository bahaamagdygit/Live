import { useState, useEffect, useRef, useCallback } from 'react'

export interface WebRTCCamera {
  deviceId: string
  deviceName: string
  stream: MediaStream | null
  connected: boolean
}

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

export function useWebRTCCameras() {
  const [cameras, setCameras] = useState<WebRTCCamera[]>([])
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [serverUrl, setServerUrl] = useState<string>('')
  const pcs = useRef<Map<string, RTCPeerConnection>>(new Map())
  const timeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeCamera = useCallback((deviceId: string) => {
    const pc = pcs.current.get(deviceId)
    if (pc) { try { pc.close() } catch {} }
    pcs.current.delete(deviceId)

    const t = timeouts.current.get(deviceId)
    if (t) clearTimeout(t)
    timeouts.current.delete(deviceId)

    setCameras(prev => prev.filter(c => c.deviceId !== deviceId))
  }, [])

  useEffect(() => {
    // Start server and get QR code
    window.electronAPI?.webrtcSignalStart?.().then(res => {
      if (res?.success) {
        setQrDataUrl(res.qrDataUrl)
        setServerUrl(res.url)
      }
    })

    const cleanJoined = window.electronAPI?.onWebRTCDeviceJoined?.(({ deviceId, deviceName }) => {
      const pc = new RTCPeerConnection(ICE_SERVERS)
      pcs.current.set(deviceId, pc)

      setCameras(prev => [...prev, { deviceId, deviceName, stream: null, connected: false }])

      // 10-second WebRTC connection timeout
      const timeout = setTimeout(() => {
        setCameras(prev => prev.map(c =>
          c.deviceId === deviceId ? { ...c, connected: false } : c
        ))
      }, 10000)
      timeouts.current.set(deviceId, timeout)

      pc.ontrack = (event) => {
        const stream = event.streams[0]
        const t = timeouts.current.get(deviceId)
        if (t) { clearTimeout(t); timeouts.current.delete(deviceId) }
        setCameras(prev => prev.map(c =>
          c.deviceId === deviceId ? { ...c, stream, connected: true } : c
        ))
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          window.electronAPI?.webrtcRelayToMobile?.(deviceId, {
            type: 'ice-candidate',
            candidate: event.candidate.toJSON(),
          })
        }
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setCameras(prev => prev.map(c =>
            c.deviceId === deviceId ? { ...c, connected: false } : c
          ))
        }
        if (pc.connectionState === 'connected') {
          const t = timeouts.current.get(deviceId)
          if (t) { clearTimeout(t); timeouts.current.delete(deviceId) }
        }
      }
    })

    const cleanSignal = window.electronAPI?.onWebRTCSignal?.(async (data) => {
      const pc = pcs.current.get(data.deviceId)
      if (!pc) return

      if (data.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        window.electronAPI?.webrtcRelayToMobile?.(data.deviceId, {
          type: 'answer',
          sdp: answer.sdp,
        })
      } else if (data.type === 'ice-candidate' && data.candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)) } catch {}
      }
    })

    const cleanDisconnected = window.electronAPI?.onWebRTCDeviceDisconnected?.(({ deviceId }) => {
      removeCamera(deviceId)
    })

    return () => {
      cleanJoined?.()
      cleanSignal?.()
      cleanDisconnected?.()
      for (const pc of pcs.current.values()) { try { pc.close() } catch {} }
      pcs.current.clear()
      for (const t of timeouts.current.values()) clearTimeout(t)
      timeouts.current.clear()
      window.electronAPI?.webrtcSignalStop?.()
    }
  }, [removeCamera])

  return { cameras, qrDataUrl, serverUrl }
}
