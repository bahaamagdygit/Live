import React, { useRef, useEffect, useState } from 'react'
import { Camera } from '../types'

interface CameraPanelProps {
  cameras: Camera[]
  activeCamera: Camera | null
  onSelectCamera: (camera: Camera) => void
  onRefresh: () => void
  isLoading: boolean
  error: string | null
}

interface CameraPreviewProps {
  camera: Camera
  isActive: boolean
  onClick: () => void
}

function CameraPreview({ camera, isActive, onClick }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)
  const [previewError, setPreviewError] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null

    const startPreview = async () => {
      try {
        const constraints: MediaStreamConstraints = {
          video: camera.deviceId
            ? { deviceId: { ideal: camera.deviceId }, width: 160, height: 90 }
            : { width: 160, height: 90 },
          audio: false,
        }
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        setPreviewStream(stream)
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch {
        setPreviewError(true)
      }
    }

    startPreview()

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
      }
    }
  }, [camera.deviceId])

  return (
    <div
      className={`camera-card ${isActive ? 'camera-card--active' : ''}`}
      onClick={onClick}
      title={camera.label}
    >
      <div className="camera-preview">
        {previewError ? (
          <div className="camera-preview__error">
            <span className="icon">📷</span>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="camera-preview__video"
          />
        )}
        {isActive && <div className="camera-preview__active-badge">LIVE</div>}
      </div>
      <div className="camera-card__info">
        {isActive && <span className="camera-card__dot" />}
        <span className="camera-card__label" title={camera.label}>
          {camera.label}
        </span>
      </div>
    </div>
  )
}

export function CameraPanel({
  cameras,
  activeCamera,
  onSelectCamera,
  onRefresh,
  isLoading,
  error,
}: CameraPanelProps) {
  return (
    <div className="panel camera-panel">
      <div className="panel__header">
        <h3 className="panel__title">
          <span className="panel__title-icon">🎥</span>
          Cameras
        </h3>
        <button
          className="btn btn--icon"
          onClick={onRefresh}
          title="Refresh camera list"
          disabled={isLoading}
        >
          {isLoading ? '⟳' : '↺'}
        </button>
      </div>

      <div className="panel__content">
        {error && (
          <div className="alert alert--error">
            <span>⚠️</span> {error}
          </div>
        )}

        {!error && cameras.length === 0 && !isLoading && (
          <div className="empty-state">
            <div className="empty-state__icon">📷</div>
            <p>No cameras detected</p>
            <button className="btn btn--secondary btn--sm" onClick={onRefresh}>
              Refresh
            </button>
          </div>
        )}

        {isLoading && (
          <div className="empty-state">
            <div className="spinner" />
            <p>Detecting cameras...</p>
          </div>
        )}

        <div className="camera-list">
          {cameras.map((camera) => (
            <CameraPreview
              key={camera.id}
              camera={camera}
              isActive={activeCamera?.id === camera.id}
              onClick={() => onSelectCamera(camera)}
            />
          ))}
        </div>
      </div>

      <div className="panel__footer">
        <div className="camera-status">
          {activeCamera ? (
            <span className="status-text">
              <span className="dot dot--green" />
              {activeCamera.label}
            </span>
          ) : (
            <span className="status-text status-text--muted">No camera selected</span>
          )}
        </div>
      </div>
    </div>
  )
}
