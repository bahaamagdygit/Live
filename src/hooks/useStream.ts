import { useState, useEffect, useCallback, useRef } from 'react'
import { StreamStatus, RecordingStatus } from '../types'

interface UseStreamReturn {
  streamStatus: StreamStatus
  recordingStatus: RecordingStatus
  streamDuration: number
  streamError: string | null
  startStream: (config: any) => Promise<void>
  stopStream: () => Promise<void>
  startRecording: (config: any) => Promise<void>
  stopRecording: () => Promise<void>
  formatDuration: (seconds: number) => string
}

export function useStream(): UseStreamReturn {
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('offline')
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle')
  const [streamDuration, setStreamDuration] = useState(0)
  const [streamError, setStreamError] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!window.electronAPI) return

    const cleanup = window.electronAPI.onStreamStatus((status: any) => {
      if (status.type === 'duration') {
        setStreamDuration(status.duration)
      } else if (status.type === 'stopped') {
        setStreamStatus('offline')
        setStreamDuration(0)
      } else if (status.type === 'error') {
        setStreamStatus('error')
        setStreamError(status.message)
      } else if (status.type === 'recording-stopped') {
        setRecordingStatus('idle')
      } else if (status.type === 'log') {
        // Parse FFmpeg output for connection status
        const msg = status.message as string
        if (msg.includes('Connection refused') || msg.includes('Failed to connect')) {
          setStreamStatus('error')
          setStreamError('Failed to connect to RTMP server')
        } else if (msg.includes('frame=') || msg.includes('muxing overhead')) {
          if (streamStatus === 'connecting') {
            setStreamStatus('live')
          }
        }
      }
    })

    cleanupRef.current = cleanup
    return () => cleanup()
  }, [streamStatus])

  const startStream = useCallback(async (config: any) => {
    if (!window.electronAPI) return
    setStreamStatus('connecting')
    setStreamError(null)
    setStreamDuration(0)

    const result = await window.electronAPI.startStream(config)
    if (!result.success) {
      setStreamStatus('error')
      setStreamError(result.error || 'Failed to start stream')
    } else {
      setStreamStatus('live')
    }
  }, [])

  const stopStream = useCallback(async () => {
    if (!window.electronAPI) return
    await window.electronAPI.stopStream()
    setStreamStatus('offline')
    setStreamDuration(0)
  }, [])

  const startRecording = useCallback(async (config: any) => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.startRecording(config)
    if (result.success) {
      setRecordingStatus('recording')
    } else if (!result.canceled) {
      setStreamError(result.error || 'Failed to start recording')
    }
  }, [])

  const stopRecording = useCallback(async () => {
    if (!window.electronAPI) return
    await window.electronAPI.stopRecording()
    setRecordingStatus('idle')
  }, [])

  const formatDuration = useCallback((seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }, [])

  return {
    streamStatus,
    recordingStatus,
    streamDuration,
    streamError,
    startStream,
    stopStream,
    startRecording,
    stopRecording,
    formatDuration,
  }
}
