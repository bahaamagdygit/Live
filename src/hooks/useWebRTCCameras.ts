import { useState, useEffect, useRef, useCallback } from 'react'

export interface WebRTCCameraCapabilities {
  minZoom: number
  maxZoom: number
  step: number
}

export interface WebRTCCamera {
  deviceId: string
  deviceName: string
  stream: MediaStream | null
  connected: boolean
  capabilities?: WebRTCCameraCapabilities
}

// No STUN — both devices are on the same local WiFi network.
// Direct LAN ICE candidates work with or without internet.
const ICE_SERVERS = {
  iceServers: [],
}

export function useWebRTCCameras() {
  const [cameras, setCameras] = useState<WebRTCCamera[]>([])
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [serverUrl, setServerUrl] = useState<string>('')

  // One RTCPeerConnection per connected phone
  const pcs      = useRef<Map<string, RTCPeerConnection>>(new Map())
  const timeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // ── helpers ──────────────────────────────────────────────────────────────
  const clearPeer = useCallback((deviceId: string) => {
    const pc = pcs.current.get(deviceId)
    if (pc) { try { pc.close() } catch {} pcs.current.delete(deviceId) }
    const t = timeouts.current.get(deviceId)
    if (t) { clearTimeout(t); timeouts.current.delete(deviceId) }
  }, [])

  const removeCamera = useCallback((deviceId: string) => {
    clearPeer(deviceId)
    setCameras(prev => prev.filter(c => c.deviceId !== deviceId))
  }, [clearPeer])

  // ── main effect — runs once, never re-registers listeners ────────────────
  useEffect(() => {
    // Start signaling server on desktop
    window.electronAPI?.webrtcSignalStart?.().then(res => {
      if (res?.success) {
        setQrDataUrl(res.qrDataUrl)
        setServerUrl(res.url)
      }
    })

    // ── Phone joins ──────────────────────────────────────────────────────
    const cleanJoined = window.electronAPI?.onWebRTCDeviceJoined?.(({ deviceId, deviceName }) => {
      // Close any stale peer for this id (e.g. phone reconnected)
      clearPeer(deviceId)

      const pc = new RTCPeerConnection(ICE_SERVERS)
      pcs.current.set(deviceId, pc)

      // Add to camera list immediately (stream = null until track arrives)
      setCameras(prev => {
        // Guard against duplicate entries from double-fire
        if (prev.some(c => c.deviceId === deviceId)) return prev
        return [...prev, { deviceId, deviceName, stream: null, connected: false }]
      })

      // 15-second timeout if WebRTC track never arrives
      const timeout = setTimeout(() => {
        setCameras(prev => prev.map(c =>
          c.deviceId === deviceId ? { ...c, connected: false } : c,
        ))
      }, 15_000)
      timeouts.current.set(deviceId, timeout)

      // Track received → mark connected with live stream
      pc.ontrack = (event) => {
        const stream = event.streams[0]
        const t = timeouts.current.get(deviceId)
        if (t) { clearTimeout(t); timeouts.current.delete(deviceId) }
        setCameras(prev => prev.map(c =>
          c.deviceId === deviceId ? { ...c, stream, connected: true } : c,
        ))
      }

      // ICE candidates → relay back to phone via main process
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          window.electronAPI?.webrtcRelayToMobile?.(deviceId, {
            type: 'ice-candidate',
            candidate: event.candidate.toJSON(),
          })
        }
      }

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        if (state === 'connected') {
          const t = timeouts.current.get(deviceId)
          if (t) { clearTimeout(t); timeouts.current.delete(deviceId) }
          setCameras(prev => prev.map(c =>
            c.deviceId === deviceId ? { ...c, connected: true } : c,
          ))
        }
        if (state === 'failed' || state === 'disconnected') {
          setCameras(prev => prev.map(c =>
            c.deviceId === deviceId ? { ...c, connected: false } : c,
          ))
        }
      }
    })

    // ── Signaling messages from phone (offer / ice-candidate) ────────────
    const cleanSignal = window.electronAPI?.onWebRTCSignal?.(async (data) => {
      const pc = pcs.current.get(data.deviceId)
      if (!pc) return

      if (data.type === 'offer') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          window.electronAPI?.webrtcRelayToMobile?.(data.deviceId, {
            type: 'answer',
            sdp: answer.sdp,
          })
        } catch (e) {
          console.error('[WebRTC] offer/answer error', data.deviceId, e)
        }
      } else if (data.type === 'ice-candidate' && data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
        } catch {}
      } else if (data.type === 'camera_capabilities') {
        const { minZoom, maxZoom, step } = data
        setCameras(prev => prev.map(c =>
          c.deviceId === data.deviceId
            ? { ...c, capabilities: {
                minZoom: typeof minZoom === 'number' ? minZoom : 1,
                maxZoom: typeof maxZoom === 'number' ? maxZoom : 4,
                step:    typeof step    === 'number' ? step    : 0.1,
              } }
            : c,
        ))
      }
    })

    // ── Phone disconnected ───────────────────────────────────────────────
    const cleanDisconnected = window.electronAPI?.onWebRTCDeviceDisconnected?.(({ deviceId }) => {
      removeCamera(deviceId)
    })

    // ── Cleanup on unmount ───────────────────────────────────────────────
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
  // Empty deps — intentional: register listeners exactly once per mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { cameras, qrDataUrl, serverUrl }
}
