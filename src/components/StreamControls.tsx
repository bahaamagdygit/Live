import React from 'react'
import { StreamStatus, RecordingStatus, StreamConfig, Camera } from '../types'

interface StreamControlsProps {
  streamStatus: StreamStatus
  recordingStatus: RecordingStatus
  streamDuration: number
  streamError: string | null
  streamConfig: StreamConfig
  activeCamera: Camera | null
  onStartStream: () => void
  onStopStream: () => void
  onStartRecording: () => void
  onStopRecording: () => void
  onOpenSettings: () => void
  onOpenPptx: () => void
  formatDuration: (s: number) => string
}

export function StreamControls({
  streamStatus,
  recordingStatus,
  streamDuration,
  streamError,
  streamConfig,
  activeCamera,
  onStartStream,
  onStopStream,
  onStartRecording,
  onStopRecording,
  onOpenSettings,
  onOpenPptx,
  formatDuration,
}: StreamControlsProps) {
  const isLive = streamStatus === 'live'
  const isConnecting = streamStatus === 'connecting'
  const isRecording = recordingStatus === 'recording'

  return (
    <div className="stream-controls">
      {streamError && (
        <div className="stream-controls__error">
          <span>⚠️ {streamError}</span>
        </div>
      )}

      <div className="stream-controls__bar">
        {/* Left section: settings + PPTX */}
        <div className="stream-controls__section stream-controls__section--left">
          <button
            className="btn btn--icon btn--toolbar"
            onClick={onOpenSettings}
            title="Settings"
          >
            <span className="btn-icon">⚙️</span>
            <span className="btn-label">Settings</span>
          </button>

          <button
            className="btn btn--icon btn--toolbar"
            onClick={onOpenPptx}
            title="Open File"
          >
            <span className="btn-icon">📄</span>
            <span className="btn-label">Open File</span>
          </button>
        </div>

        {/* Center: camera + quality info */}
        <div className="stream-controls__section stream-controls__section--center">
          <div className="stream-info">
            <span className="stream-info__item">
              <span className="stream-info__label">Camera:</span>
              <span className="stream-info__value">
                {activeCamera ? activeCamera.label : 'None'}
              </span>
            </span>
            <span className="stream-info__sep">|</span>
            <span className="stream-info__item">
              <span className="stream-info__label">Quality:</span>
              <span className="stream-info__value">
                {streamConfig.resolution} @ {streamConfig.fps}fps
              </span>
            </span>
            <span className="stream-info__sep">|</span>
            <span className="stream-info__item">
              <span className="stream-info__label">Bitrate:</span>
              <span className="stream-info__value">{streamConfig.bitrate}k</span>
            </span>
          </div>
        </div>

        {/* Right: record + stream */}
        <div className="stream-controls__section stream-controls__section--right">
          {/* Record button */}
          <div className="control-btn-group">
            {isRecording ? (
              <button
                className="btn btn--record btn--recording"
                onClick={onStopRecording}
                title="Stop Recording"
              >
                <span className="record-dot record-dot--blink" />
                <span>Stop REC</span>
              </button>
            ) : (
              <button
                className="btn btn--record"
                onClick={onStartRecording}
                title="Start Recording"
                disabled={isConnecting}
              >
                <span className="record-dot" />
                <span>Record</span>
              </button>
            )}
          </div>

          <div className="control-btn-divider" />

          {/* Stream button */}
          <div className="control-btn-group">
            {isLive || isConnecting ? (
              <button
                className={`btn btn--stream btn--stream-stop ${isConnecting ? 'btn--connecting' : ''}`}
                onClick={onStopStream}
                title="Stop Stream"
              >
                <span className={`live-dot ${isConnecting ? 'live-dot--pulse' : 'live-dot--blink'}`} />
                <span>{isConnecting ? 'Connecting...' : 'Stop Stream'}</span>
              </button>
            ) : (
              <button
                className="btn btn--stream btn--stream-start"
                onClick={onStartStream}
                title="Go Live"
              >
                <span className="live-dot live-dot--off" />
                <span>Go Live</span>
              </button>
            )}

            {(isLive || isConnecting) && (
              <div className="stream-duration">
                <span className="live-badge">LIVE</span>
                <span className="stream-duration__time">{formatDuration(streamDuration)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
