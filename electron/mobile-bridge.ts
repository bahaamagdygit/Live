// Mobile bridge — LAN-only two-way control channel + JPEG video channel.
//
// Two servers, both bound to 0.0.0.0 so any device on the same WiFi can reach them:
//   • Control WebSocket on CONTROL_PORT — JSON messages, bidirectional.
//   • Video TCP on VIDEO_PORT — raw length-prefixed JPEG frames, phone → desktop.
//
// No internet required. No STUN / TURN / signaling. No WebRTC.

import { WebSocketServer, WebSocket } from 'ws'
import net from 'net'
import http from 'http'
import { BrowserWindow } from 'electron'
import { networkInterfaces } from 'os'

export const CONTROL_PORT = 8765
export const VIDEO_PORT   = 8766
// Local MJPEG multiplexer — renderer pulls frames as <img src="http://127.0.0.1:MJPEG_PORT/dev/<id>">.
// Zero-copy path: the TCP receiver writes the same JPEG bytes directly to every
// MJPEG client response without involving IPC or base64 encoding.
export const MJPEG_PORT   = 18850

const HEARTBEAT_INTERVAL_MS = 1000
const HEARTBEAT_MISS_LIMIT  = 3
const FRAME_FREEZE_MS       = 5000

export type DeviceOrientation = 'portrait' | 'portrait-upside-down' | 'landscape-left' | 'landscape-right'

export interface MobileDevice {
  deviceId: string
  deviceName: string
  connectedAt: number
  lastPong: number
  latencyMs: number
  // Last capabilities advertised by the phone during handshake.
  capabilities: {
    zoom?:     { min: number; max: number; step: number; neutral: number }
    exposure?: { min: number; max: number; step: number }
    whiteBalanceModes?: string[]
    torchSupported?: boolean
    resolutions?: Array<{ width: number; height: number; fps: number[] }>
    cameras?: Array<{ id: string; label: string; position: 'front' | 'back' }>
  }
  // Last JPEG frame arrival (for frozen-frame detection).
  lastFrameAt: number
  // Phone's current UI orientation; the desktop rotates the feed to match.
  orientation: DeviceOrientation
}

interface Session {
  ws: WebSocket
  videoSocket: net.Socket | null
  device: MobileDevice
  heartbeatTimer: NodeJS.Timeout | null
  missedPongs: number
  mjpegClients: Set<http.ServerResponse>
}

const MJPEG_BOUNDARY = 'chlsboundary'

export class MobileBridge {
  private controlServer: WebSocketServer | null = null
  private videoServer:   net.Server | null = null
  private mjpegServer:   http.Server | null = null
  private sessions = new Map<string, Session>()
  private lastReading: { text: string; langs: string[] } = { text: '', langs: [] }
  private lastFilterState: Record<string, unknown> | null = null
  private mainWindow: BrowserWindow | null = null

  setMainWindow(win: BrowserWindow | null) { this.mainWindow = win }

  start() {
    if (this.controlServer || this.videoServer) return

    this.controlServer = new WebSocketServer({ port: CONTROL_PORT, host: '0.0.0.0' })
    this.controlServer.on('connection', ws => this.onControlConnection(ws))
    this.controlServer.on('error', err => console.error('[MobileBridge] control server error:', err.message))
    console.log(`[MobileBridge] control server listening on 0.0.0.0:${CONTROL_PORT}`)

    this.videoServer = net.createServer(socket => this.onVideoConnection(socket))
    this.videoServer.on('error', err => console.error('[MobileBridge] video server error:', err.message))
    this.videoServer.listen(VIDEO_PORT, '0.0.0.0', () => {
      console.log(`[MobileBridge] video server listening on 0.0.0.0:${VIDEO_PORT}`)
    })

    this.mjpegServer = http.createServer((req, res) => this.onMjpegRequest(req, res))
    this.mjpegServer.on('error', err => console.error('[MobileBridge] mjpeg server error:', err.message))
    // Loopback only — nobody else needs this endpoint.
    this.mjpegServer.listen(MJPEG_PORT, '127.0.0.1', () => {
      console.log(`[MobileBridge] mjpeg server listening on 127.0.0.1:${MJPEG_PORT}`)
    })
  }

  stop() {
    for (const session of this.sessions.values()) this.closeSession(session.device.deviceId, 'server_stopped')
    this.sessions.clear()
    this.controlServer?.close(); this.controlServer = null
    this.videoServer?.close();   this.videoServer = null
    this.mjpegServer?.close();   this.mjpegServer = null
  }

  getMjpegUrl(deviceId: string): string {
    return `http://127.0.0.1:${MJPEG_PORT}/dev/${encodeURIComponent(deviceId)}`
  }

  private onMjpegRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = req.url || ''
    const m = url.match(/^\/dev\/([^/?#]+)/)
    if (!m) { res.writeHead(404); res.end('not found'); return }
    const deviceId = decodeURIComponent(m[1])
    const session = this.sessions.get(deviceId)
    if (!session) { res.writeHead(404); res.end('no such device'); return }
    res.writeHead(200, {
      'Content-Type':  `multipart/x-mixed-replace; boundary=--${MJPEG_BOUNDARY}`,
      'Cache-Control': 'no-cache, private',
      'Pragma':        'no-cache',
      'Connection':    'close',
      'Access-Control-Allow-Origin': '*',
    })
    session.mjpegClients.add(res)
    const prune = () => { session.mjpegClients.delete(res); try { res.end() } catch {} }
    res.on('close', prune)
    res.on('error', prune)
  }

  getLocalIp(): string {
    const nets = networkInterfaces()
    const pref: string[] = []
    const rest: string[] = []
    for (const [name, ifaces] of Object.entries(nets)) {
      if (!ifaces) continue
      for (const iface of ifaces) {
        if (iface.family !== 'IPv4' || iface.internal) continue
        const ip = iface.address
        const n  = (name || '').toLowerCase()
        const isVirtual = n.includes('vpn') || n.includes('virtual') || n.includes('vmware') ||
                         n.includes('vethernet') || n.includes('hamachi') || n.includes('tap') ||
                         n.includes('tun') || n.includes('radmin') || ip.startsWith('172.')
        if (isVirtual) continue
        if (ip.startsWith('192.168.') || ip.startsWith('10.')) pref.push(ip)
        else rest.push(ip)
      }
    }
    return pref[0] || rest[0] || '127.0.0.1'
  }

  getPairingUrl(): string {
    return `ws://${this.getLocalIp()}:${CONTROL_PORT}`
  }

  getPairingPayload(): string {
    return JSON.stringify({
      type: 'church-live-stream',
      host: this.getLocalIp(),
      controlPort: CONTROL_PORT,
      videoPort: VIDEO_PORT,
      version: 1,
    })
  }

  listDevices(): MobileDevice[] {
    return Array.from(this.sessions.values()).map(s => ({ ...s.device }))
  }

  sendCommand(deviceId: string, action: string, value?: unknown) {
    const session = this.sessions.get(deviceId)
    if (!session || session.ws.readyState !== WebSocket.OPEN) return
    try { session.ws.send(JSON.stringify({ type: 'command', action, value })) } catch {}
  }

  broadcastReading(text: string, langs: string[] = []) {
    this.lastReading = { text, langs }
    const payload = JSON.stringify({ type: 'reading_update', text, langs })
    for (const session of this.sessions.values()) {
      if (session.ws.readyState === WebSocket.OPEN) {
        try { session.ws.send(payload) } catch {}
      }
    }
  }

  broadcastFilterState(deviceId: string, filterState: Record<string, unknown>) {
    this.lastFilterState = filterState
    const payload = JSON.stringify({ type: 'filter_state', value: filterState })
    const session = this.sessions.get(deviceId)
    if (session && session.ws.readyState === WebSocket.OPEN) {
      try { session.ws.send(payload) } catch {}
    }
  }

  broadcastDesktopState(state: Record<string, unknown>) {
    const payload = JSON.stringify({ type: 'desktop_state', value: state })
    for (const session of this.sessions.values()) {
      if (session.ws.readyState === WebSocket.OPEN) {
        try { session.ws.send(payload) } catch {}
      }
    }
  }

  private notify(channel: string, payload: unknown) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, payload)
    }
  }

  private onControlConnection(ws: WebSocket) {
    let deviceId: string | null = null

    ws.on('message', raw => {
      let msg: any
      try { msg = JSON.parse(raw.toString()) } catch { return }

      switch (msg.type) {
        case 'hello': {
          deviceId = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
          const initialOrientation: DeviceOrientation =
            (msg.orientation === 'portrait-upside-down' || msg.orientation === 'landscape-left'
              || msg.orientation === 'landscape-right' || msg.orientation === 'portrait')
              ? msg.orientation : 'portrait'
          const device: MobileDevice = {
            deviceId,
            deviceName: typeof msg.name === 'string' && msg.name.trim() ? msg.name.trim() : 'Mobile Camera',
            connectedAt: Date.now(),
            lastPong:   Date.now(),
            latencyMs:  0,
            capabilities: msg.capabilities && typeof msg.capabilities === 'object' ? msg.capabilities : {},
            lastFrameAt: 0,
            orientation: initialOrientation,
          }
          const session: Session = {
            ws, videoSocket: null, device,
            heartbeatTimer: null, missedPongs: 0,
            mjpegClients: new Set<http.ServerResponse>(),
          }
          this.sessions.set(deviceId, session)
          try { ws.send(JSON.stringify({ type: 'welcome', deviceId, videoPort: VIDEO_PORT })) } catch {}
          if (this.lastReading.text) {
            try { ws.send(JSON.stringify({ type: 'reading_update', ...this.lastReading })) } catch {}
          }
          console.log(`[MobileBridge] device joined: ${deviceId} (${device.deviceName})`)
          this.notify('mobile-device-joined', { device })
          this.startHeartbeat(session)
          break
        }
        case 'pong': {
          if (!deviceId) return
          const s = this.sessions.get(deviceId); if (!s) return
          s.device.lastPong = Date.now()
          if (typeof msg.t === 'number') {
            s.device.latencyMs = Math.max(0, Date.now() - msg.t)
          }
          s.missedPongs = 0
          this.notify('mobile-device-updated', { device: s.device })
          break
        }
        case 'ping': {
          // Mobile → Server ping: echo a pong carrying the same timestamp so
          // the phone can measure its RTT. Also resets liveness on our side.
          if (deviceId) {
            const s = this.sessions.get(deviceId)
            if (s) { s.device.lastPong = Date.now(); s.missedPongs = 0 }
          }
          try { ws.send(JSON.stringify({ type: 'pong', t: msg.t })) } catch {}
          break
        }
        case 'capabilities': {
          if (!deviceId) return
          const s = this.sessions.get(deviceId); if (!s) return
          s.device.capabilities = { ...s.device.capabilities, ...(msg.value || {}) }
          this.notify('mobile-device-updated', { device: s.device })
          break
        }
        case 'orientation': {
          if (!deviceId) return
          const s = this.sessions.get(deviceId); if (!s) return
          const v = msg.value
          if (v === 'portrait' || v === 'portrait-upside-down' ||
              v === 'landscape-left' || v === 'landscape-right') {
            s.device.orientation = v
            this.notify('mobile-device-updated', { device: s.device })
          }
          break
        }
        case 'control': {
          // Mobile → Desktop remote control: camera switch, slides, stream,
          // record, cut-to-black, desktop camera zoom, toggle overlay text.
          if (!deviceId || !msg.action) return
          this.notify('mobile-control', { deviceId, action: msg.action, value: msg.value })
          break
        }
        case 'request_state': {
          if (this.lastFilterState) {
            try { ws.send(JSON.stringify({ type: 'filter_state', value: this.lastFilterState })) } catch {}
          }
          this.notify('mobile-request-state', { deviceId })
          break
        }
      }
    })

    const teardown = () => {
      if (!deviceId) return
      this.closeSession(deviceId, 'disconnected')
    }
    ws.on('close', teardown)
    ws.on('error', teardown)
  }

  private onVideoConnection(socket: net.Socket) {
    let pairedDeviceId: string | null = null
    let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0)
    socket.setNoDelay(true)

    const feed = (chunk: Buffer<ArrayBufferLike>) => {
      buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk
      // First message MUST be a 32-byte ASCII deviceId header for pairing.
      if (!pairedDeviceId) {
        if (buffer.length < 32) return
        const header = buffer.subarray(0, 32).toString('ascii').replace(/\0+$/, '').trim()
        buffer = buffer.subarray(32)
        const session = this.sessions.get(header)
        if (!session) { socket.destroy(); return }
        session.videoSocket = socket
        pairedDeviceId = header
      }

      while (true) {
        if (buffer.length < 4) return
        const len = buffer.readUInt32BE(0)
        if (len <= 0 || len > 8 * 1024 * 1024) { socket.destroy(); return }
        if (buffer.length < 4 + len) return
        const frame = buffer.subarray(4, 4 + len)
        buffer = buffer.subarray(4 + len)

        const session = this.sessions.get(pairedDeviceId!)
        if (session) {
          session.device.lastFrameAt = Date.now()
          // Zero-copy fan-out: same JPEG bytes written to every MJPEG client of
          // this device. No base64, no IPC, no canvas decode per frame.
          if (session.mjpegClients.size > 0) {
            const header = `--${MJPEG_BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
            for (const client of session.mjpegClients) {
              try {
                client.write(header)
                client.write(frame)
                client.write('\r\n')
              } catch {}
            }
          }
        }
      }
    }

    socket.on('data', feed)
    socket.on('close', () => {
      if (!pairedDeviceId) return
      const session = this.sessions.get(pairedDeviceId); if (!session) return
      session.videoSocket = null
    })
    socket.on('error', () => { try { socket.destroy() } catch {} })
  }

  private startHeartbeat(session: Session) {
    if (session.heartbeatTimer) clearInterval(session.heartbeatTimer)
    session.heartbeatTimer = setInterval(() => {
      if (session.ws.readyState !== WebSocket.OPEN) return
      try { session.ws.send(JSON.stringify({ type: 'ping', t: Date.now() })) } catch {}
      session.missedPongs++
      if (session.missedPongs > HEARTBEAT_MISS_LIMIT) {
        this.closeSession(session.device.deviceId, 'heartbeat_timeout')
        return
      }
      // Frozen-frame detection: reported to renderer so it can show fallback image.
      const frozen = session.device.lastFrameAt > 0 &&
                     (Date.now() - session.device.lastFrameAt) > FRAME_FREEZE_MS
      if (frozen) {
        this.notify('mobile-frame-frozen', { deviceId: session.device.deviceId })
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  private closeSession(deviceId: string, reason: string) {
    const session = this.sessions.get(deviceId)
    if (!session) return
    if (session.heartbeatTimer) { clearInterval(session.heartbeatTimer); session.heartbeatTimer = null }
    for (const client of session.mjpegClients) { try { client.end() } catch {} }
    session.mjpegClients.clear()
    try { session.ws.terminate() } catch {}
    try { session.videoSocket?.destroy() } catch {}
    this.sessions.delete(deviceId)
    console.log(`[MobileBridge] device disconnected: ${deviceId} (${reason})`)
    this.notify('mobile-device-disconnected', { deviceId, reason })
  }
}

export const mobileBridge = new MobileBridge()
