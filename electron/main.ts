import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  globalShortcut,
  shell,
} from 'electron'
import path from 'path'
import fs from 'fs'
import http from 'http'
import { networkInterfaces } from 'os'
import { spawn, ChildProcess } from 'child_process'
import { execSync } from 'child_process'
import AdmZip from 'adm-zip'
import { WebSocketServer } from 'ws'
import QRCode from 'qrcode'

// We use dynamic require for electron-store and officeparser to avoid ESM issues
let Store: any
let officeParser: any
let pdfParse: any
let mammoth: any

async function loadModules() {
  try {
    const storeModule = await import('electron-store')
    Store = storeModule.default
  } catch (e) {
  }
  try {
    const parserModule = await import('officeparser')
    officeParser = parserModule.default || parserModule
  } catch (e) {
  }
  try {
    pdfParse = require('pdf-parse')
  } catch (e: any) {
    console.error('pdf-parse load failed at startup (will retry on first PDF open):', e.message)
  }
  try {
    const unpackedBase = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
      : path.join(__dirname, '..', 'node_modules')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mammoth = require(path.join(unpackedBase, 'mammoth'))
  } catch (e) {
    try { mammoth = require('mammoth') } catch {}
  }
}

let store: any = null
let ipcHandlersRegistered = false
let mainWindow: BrowserWindow | null = null
let presentationWindow: BrowserWindow | null = null
let pptxControllerWindow: BrowserWindow | null = null
let lastSlidesData: any = null
let lastPresentationData: any = null
let ffmpegStreamProcess: ChildProcess | null = null
let ffmpegRecordProcess: ChildProcess | null = null
let streamStartTime: number | null = null
let streamTimer: NodeJS.Timeout | null = null

// ── Mobile Camera (WebSocket → MJPEG) ────────────────────────────────────────
const MOBILE_CAM_HTTP_PORT = 18800   // MJPEG stream consumed by the renderer
const MOBILE_CAM_WS_PORT   = 18801   // Phone connects here and sends JPEG frames
const MOBILE_CAM_PAGE_PORT = 18802   // Tiny HTTP server serving the phone web page

let mobileCamHttpServer: http.Server | null = null
let mobileCamWsServer: WebSocketServer | null = null
let mobileCamPageServer: http.Server | null = null
let mobileCamClients = new Set<http.ServerResponse>()

function getLocalIp(): string {
  const { networkInterfaces } = require('os')
  const nets = networkInterfaces()
  for (const ifaces of Object.values(nets) as any[]) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '127.0.0.1'
}

function getMobileCamUrls() {
  const ip = getLocalIp()
  return {
    mjpegUrl: `http://127.0.0.1:${MOBILE_CAM_HTTP_PORT}/`,
    phoneUrl: `http://${ip}:${MOBILE_CAM_PAGE_PORT}/`,
    wsUrl:    `ws://${ip}:${MOBILE_CAM_WS_PORT}/`,
  }
}

function startMobileCamServers() {
  if (mobileCamHttpServer) return   // already running

  // 1) MJPEG server — renderer reads this as <img src="...">
  mobileCamHttpServer = http.createServer((_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=--mjpegboundary',
      'Cache-Control': 'no-cache',
      'Connection':    'close',
      'Access-Control-Allow-Origin': '*',
    })
    mobileCamClients.add(res)
    res.on('close', () => mobileCamClients.delete(res))
  })
  mobileCamHttpServer.listen(MOBILE_CAM_HTTP_PORT, '127.0.0.1')

  // 2) WebSocket server — phone sends raw JPEG binary frames
  mobileCamWsServer = new WebSocketServer({ port: MOBILE_CAM_WS_PORT })
  mobileCamWsServer.on('connection', (ws) => {
    ws.binaryType = 'nodebuffer'
    ws.on('message', (data: Buffer) => {
      // data is a JPEG frame from the phone
      const header = `--mjpegboundary\r\nContent-Type: image/jpeg\r\nContent-Length: ${data.length}\r\n\r\n`
      for (const client of mobileCamClients) {
        try { client.write(header); client.write(data); client.write('\r\n') } catch {}
      }
    })
    ws.on('error', () => {})
  })

  // 3) Page server — serves the mobile HTML page to the phone
  mobileCamPageServer = http.createServer((_req, res) => {
    const wsUrl = getMobileCamUrls().wsUrl
    const html = buildMobilePage(wsUrl)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  })
  mobileCamPageServer.listen(MOBILE_CAM_PAGE_PORT, '0.0.0.0')
}

function stopMobileCamServers() {
  mobileCamClients.forEach(c => { try { c.end() } catch {} })
  mobileCamClients.clear()
  mobileCamWsServer?.clients.forEach(c => { try { c.close() } catch {} })
  mobileCamWsServer?.close()
  mobileCamHttpServer?.close()
  mobileCamPageServer?.close()
  mobileCamHttpServer = null
  mobileCamWsServer   = null
  mobileCamPageServer = null
}

function buildMobilePage(wsUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>Church Live — Mobile Camera</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0a0a12;color:#fff;font-family:system-ui,sans-serif;height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:20px}
  h2{font-size:18px;font-weight:700;color:#818cf8}
  video{width:100%;max-width:400px;border-radius:12px;background:#000;aspect-ratio:16/9;object-fit:cover}
  .status{font-size:13px;padding:6px 14px;border-radius:20px;background:#1e1e2e;border:1px solid #2a2a40}
  .status.connected{border-color:#22c55e;color:#22c55e}
  .status.error{border-color:#ef4444;color:#ef4444}
  .btns{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
  button{padding:10px 20px;border-radius:8px;border:none;font-size:14px;font-weight:600;cursor:pointer;background:#4f46e5;color:#fff}
  button.secondary{background:#1e1e2e;border:1px solid #2a2a40;color:#a0a0c0}
  select{padding:8px 12px;border-radius:8px;background:#1e1e2e;border:1px solid #2a2a40;color:#fff;font-size:14px}
</style>
</head>
<body>
<h2>📱 Mobile Camera</h2>
<video id="v" autoplay playsinline muted></video>
<div class="status" id="st">Connecting...</div>
<div class="btns">
  <select id="faceSel">
    <option value="environment">Back Camera</option>
    <option value="user">Front Camera</option>
  </select>
  <button onclick="flipCam()">🔄 Flip</button>
  <button class="secondary" onclick="setQuality('high')">HD</button>
  <button class="secondary" onclick="setQuality('low')">SD</button>
</div>
<script>
const WS_URL = '${wsUrl}'
const video  = document.getElementById('v')
const st     = document.getElementById('st')
const faceSel = document.getElementById('faceSel')
let ws, canvas, ctx, timer, currentFacing = 'environment', quality = 'high'

const QUALITY = { high:{w:1280,h:720,fps:20,jpegQ:0.75}, low:{w:640,h:360,fps:10,jpegQ:0.6} }

async function startCam(facing) {
  currentFacing = facing
  if (video.srcObject) video.srcObject.getTracks().forEach(t=>t.stop())
  const q = QUALITY[quality]
  const stream = await navigator.mediaDevices.getUserMedia({
    video:{facingMode:facing,width:{ideal:q.w},height:{ideal:q.h},frameRate:{ideal:q.fps}},
    audio:false
  })
  video.srcObject = stream
  canvas = document.createElement('canvas')
  canvas.width = q.w; canvas.height = q.h
  ctx = canvas.getContext('2d')
}

function connect() {
  ws = new WebSocket(WS_URL)
  ws.binaryType = 'arraybuffer'
  ws.onopen = () => {
    st.textContent = '🟢 Connected'; st.className = 'status connected'
    const q = QUALITY[quality]
    clearInterval(timer)
    timer = setInterval(() => {
      if (ws.readyState !== 1 || !ctx || video.readyState < 2) return
      ctx.drawImage(video, 0, 0, q.w, q.h)
      canvas.toBlob(blob => blob?.arrayBuffer().then(buf => {
        if (ws.readyState === 1) ws.send(buf)
      }), 'image/jpeg', q.jpegQ)
    }, 1000 / q.fps)
  }
  ws.onclose = () => {
    st.textContent = '🔴 Disconnected — retrying...'; st.className = 'status error'
    clearInterval(timer); setTimeout(connect, 2000)
  }
  ws.onerror = () => ws.close()
}

function flipCam() {
  const f = currentFacing === 'environment' ? 'user' : 'environment'
  faceSel.value = f; startCam(f)
}
function setQuality(q) { quality = q; startCam(currentFacing) }
faceSel.onchange = () => startCam(faceSel.value)

startCam(currentFacing).then(connect).catch(e => {
  st.textContent = 'Camera error: ' + e.message; st.className = 'status error'
})
</script>
</body>
</html>`
}

// ── IP Camera (RTSP → MJPEG proxy) ───────────────────────────────────────────
interface IpCameraEntry {
  id: string
  label: string
  rtspUrl: string   // original URL as provided by user (may have percent-encoded creds)
  /** Decoded username (empty string if none) */
  rtspUser: string
  /** Decoded password (empty string if none) */
  rtspPass: string
  /** RTSP URL with credentials stripped — credentials passed separately */
  rtspBaseUrl: string
  port: number
  ffmpegProcess: ChildProcess | null
  server: http.Server | null
}

const ipCameraMap = new Map<string, IpCameraEntry>()
let nextMjpegPort = 18900 // Starting port for MJPEG HTTP servers

/** Parse an RTSP URL and extract credentials + credential-free base URL. */
function parseRtspUrl(rtspUrl: string): { user: string; pass: string; baseUrl: string } {
  try {
    const fake = rtspUrl.replace(/^rtsp:\/\//i, 'http://')
    const u = new URL(fake)
    const user = u.username ? decodeURIComponent(u.username) : ''
    const pass = u.password ? decodeURIComponent(u.password) : ''
    u.username = ''
    u.password = ''
    const baseUrl = u.toString().replace(/^http:\/\//, 'rtsp://')
    return { user, pass, baseUrl }
  } catch {
    return { user: '', pass: '', baseUrl: rtspUrl }
  }
}

async function startRtspProxy(entry: IpCameraEntry): Promise<void> {
  const ffmpegPath = await findFFmpeg()

  // Try TCP first, then UDP — some cameras only accept one transport
  const transports = ['tcp', 'udp']

  for (const transport of transports) {
    try {
      await tryRtspTransport(entry, ffmpegPath, transport)
      return  // success — stop trying
    } catch (err: any) {
      if (transport === transports[transports.length - 1]) throw err  // last attempt — propagate
      // else try next transport
    }
  }
}

function tryRtspTransport(entry: IpCameraEntry, ffmpegPath: string, transport: string): Promise<void> {
  return new Promise((resolve, reject) => {

    // Each camera gets its own tiny HTTP server that serves MJPEG
    const clients = new Set<http.ServerResponse>()

    const server = http.createServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=--mjpegboundary',
        'Cache-Control': 'no-cache',
        'Connection': 'close',
      })
      clients.add(res)
      res.on('close', () => clients.delete(res))
    })

    server.listen(entry.port, '127.0.0.1', () => {
      // Build the FFmpeg input URL with credentials.
      // We must percent-encode chars that break URL structure (@, :, /) in user/pass.
      // Node spawn() passes args raw (no shell), so % is safe to include literally.
      // FFmpeg's URL parser supports percent-encoded credentials.
      const safeEncode = (s: string) =>
        s.replace(/%/g, '%25')   // % first (must be before other replacements)
         .replace(/@/g, '%40')   // @ would be mistaken for auth separator
         .replace(/:/g, '%3A')   // : would be mistaken for user:pass separator
         .replace(/\?/g, '%3F')  // ? would start query string
         .replace(/#/g, '%23')   // # would start fragment
      const inputUrl = entry.rtspUser
        ? `rtsp://${safeEncode(entry.rtspUser)}:${safeEncode(entry.rtspPass)}@${entry.rtspBaseUrl.replace(/^rtsp:\/\//i, '')}`
        : entry.rtspBaseUrl

      const maskedUrl = inputUrl.replace(/:([^@]{1,}?)@/, ':***@')
      console.log(`[IP Cam] spawn ffmpeg: ${ffmpegPath}`)
      console.log(`[IP Cam] URL (masked): ${maskedUrl}`)
      console.log(`[IP Cam] transport: ${transport}`)
      mainWindow?.webContents.send('ipcam-log', { id: entry.id, text: `Connecting via ${transport.toUpperCase()}…\nURL: ${maskedUrl}\nFFmpeg: ${ffmpegPath}` })

      const args = [
        '-loglevel', 'warning',
        '-rtsp_transport', transport,
        '-timeout', '10000000',        // 10s socket timeout (microseconds)
        '-i', inputUrl,
        '-an',
        '-vf', 'scale=640:360',        // scale to fixed size — forces full decode of H.264/H.265
        '-vcodec', 'mjpeg',            // explicit MJPEG encoder
        '-pix_fmt', 'yuvj420p',        // standard MJPEG pixel format
        '-f', 'mjpeg',
        '-q:v', '5',
        '-r', '15',
        'pipe:1',
      ]

      const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      entry.ffmpegProcess = proc
      entry.server = server

      let resolved = false
      let stderrLog = ''

      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        stderrLog += text
        console.log('[IP Cam stderr]', text.trim())
        // Forward to renderer so the UI can show a live debug log
        mainWindow?.webContents.send('ipcam-log', { id: entry.id, text: text.trim() })
      })

      let buffer = Buffer.alloc(0)
      const SOI = Buffer.from([0xff, 0xd8])
      const EOI = Buffer.from([0xff, 0xd9])

      proc.stdout?.on('data', (chunk: Buffer) => {
        if (!resolved) { resolved = true; resolve() }
        buffer = Buffer.concat([buffer, chunk])
        let start = 0
        while (true) {
          const s = buffer.indexOf(SOI, start)
          if (s === -1) break
          const e = buffer.indexOf(EOI, s + 2)
          if (e === -1) break
          const frame = buffer.subarray(s, e + 2)
          const header = `--mjpegboundary\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
          for (const client of clients) {
            try { client.write(header); client.write(frame); client.write('\r\n') } catch {}
          }
          start = e + 2
        }
        buffer = start > 0 ? buffer.subarray(start) : buffer
      })

      proc.on('error', (err) => {
        if (!resolved) { server.close(); reject(err) }
      })

      proc.on('exit', (code) => {
        if (!resolved) {
          server.close()
          const stderr = stderrLog
          // Get the last meaningful error line from stderr
          const lastLine = stderr.split('\n').map(l => l.trim()).filter(Boolean).pop() ?? ''
          const msg =
            stderr.includes('401') || stderr.includes('Unauthorized')
              ? 'Wrong username or password (401 Unauthorized)'
            : stderr.includes('Connection refused') || stderr.includes('WSAECONNREFUSED')
              ? 'Connection refused — check IP address and port 554'
            : stderr.includes('No route to host') || stderr.includes('timed out') || stderr.includes('WSAETIMEDOUT') || stderr.includes('Network is unreachable')
              ? 'Camera unreachable — check IP address and network'
            : stderr.includes('Invalid data') || stderr.includes('moov atom')
              ? 'Camera connected but stream format not supported'
            : lastLine || `FFmpeg exit code ${code}`
          reject(new Error(msg))
        }
      })

      // 15 s hard timeout — if no frame received, fail so user gets a clear error
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          proc.kill()
          server.close()
          reject(new Error('Timeout — no video received after 15s. Check IP, port, and credentials.'))
        }
      }, 15000)

      // Clear timeout once we're streaming
      proc.stdout?.once('data', () => clearTimeout(timeout))
    })

    server.on('error', (err) => reject(err))
  })
}

function stopRtspProxy(id: string) {
  const entry = ipCameraMap.get(id)
  if (!entry) return
  try { entry.ffmpegProcess?.kill('SIGTERM') } catch {}
  try { entry.server?.close() } catch {}
  entry.ffmpegProcess = null
  entry.server = null
}

// ── FFmpeg find + auto-download ───────────────────────────────────────────────
let _ffmpegPathCache: string | null = null

function getFFmpegResourceDir(): string {
  // dev: <repo>/resources/    packaged: next to app.asar in resourcesPath
  try { return path.join(getAppPath(), 'resources') } catch { return path.join(__dirname, '..', 'resources') }
}

function findFFmpegInCandidates(): string | null {
  const candidates = [
    'ffmpeg',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe',
    path.join(__dirname, '..', 'resources', 'ffmpeg.exe'),
    path.join(getFFmpegResourceDir(), 'ffmpeg.exe'),
    path.join(getFFmpegResourceDir(), '..', 'ffmpeg.exe'),
  ]
  for (const c of candidates) {
    try { execSync(`"${c}" -version`, { stdio: 'ignore', timeout: 3000 }); return c } catch {}
  }
  return null
}

async function downloadFFmpeg(): Promise<string> {
  const destDir  = getFFmpegResourceDir()
  const destPath = path.join(destDir, 'ffmpeg.exe')
  const zipPath  = path.join(destDir, 'ffmpeg_tmp.zip')
  fs.mkdirSync(destDir, { recursive: true })

  mainWindow?.webContents.send('ffmpeg-download-status', { status: 'downloading' })

  const url = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'

  await new Promise<void>((resolve, reject) => {
    const file = fs.createWriteStream(zipPath)
    const request = (urlStr: string, hops = 0) => {
      if (hops > 5) return reject(new Error('Too many redirects'))
      const mod = urlStr.startsWith('https') ? require('https') : require('http')
      mod.get(urlStr, (res: any) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
          return request(res.headers.location, hops + 1)
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
        file.on('error', reject)
      }).on('error', reject)
    }
    request(url)
  })

  mainWindow?.webContents.send('ffmpeg-download-status', { status: 'extracting' })

  // Extract ffmpeg.exe using PowerShell (always available on Windows)
  await new Promise<void>((resolve, reject) => {
    const cmd =
      `Add-Type -Assembly System.IO.Compression.FileSystem;` +
      `$z=[IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/\\/g, '\\\\')}');` +
      `$e=$z.Entries|Where-Object{$_.Name -eq 'ffmpeg.exe'}|Select-Object -First 1;` +
      `[IO.Compression.ZipFileExtensions]::ExtractToFile($e,'${destPath.replace(/\\/g, '\\\\')}', $true);` +
      `$z.Dispose()`
    const ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], { stdio: 'ignore' })
    ps.on('exit', code => code === 0 ? resolve() : reject(new Error(`PowerShell exit ${code}`)))
    ps.on('error', reject)
  })

  try { fs.unlinkSync(zipPath) } catch {}
  mainWindow?.webContents.send('ffmpeg-download-status', { status: 'done' })
  return destPath
}

async function findFFmpeg(): Promise<string> {
  if (_ffmpegPathCache) return _ffmpegPathCache
  const found = findFFmpegInCandidates()
  if (found) { _ffmpegPathCache = found; return found }
  const downloaded = await downloadFFmpeg()
  _ffmpegPathCache = downloaded
  return downloaded
}


const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === '1' || !app.isPackaged

function getAppPath() {
  return isDev ? path.join(__dirname, '..') : path.join(process.resourcesPath)
}

async function createWindow() {
  await loadModules()
  if (!ipcHandlersRegistered) {
    registerIpcHandlers()
    ipcHandlersRegistered = true
  }

  if (Store) {
    store = new Store({
      defaults: {
        streamConfig: {
          rtmpUrl: 'rtmp://live.youtube.com/live2',
          streamKey: '',
          resolution: '720p',
          fps: 30,
          bitrate: 3000,
        },
        overlaySettings: {
          text: '',
          visible: false,
          position: 'bottom',
          fontSize: 32,
          fontFamily: 'Arial',
          textColor: '#ffffff',
          bgColor: '#000000',
          bgOpacity: 70,
          alignment: 'center',
        },
        logoSettings: {
          filePath: '',
          position: 'top-right',
          size: 120,
          opacity: 80,
          visible: false,
        },
        cameraFallback: {
          filePath: '',
          base64: '',
          fit: 'cover',
        },
        hotkeys: {
          toggleText: '',
          nextSlide: '',
          prevSlide: '',
          cam1: '',
          cam2: '',
          cam3: '',
          cam4: '',
          startStream: '',
          stopStream: '',
          startRecording: '',
          stopRecording: '',
          openPresentation: '',
          closePresentation: '',
          openController: '',
          toggleFallback: '',
          openFile: '',
        },
      },
    })
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0f0f1a',
    titleBarStyle: 'default',
    icon: path.join(getAppPath(), 'public', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow loading local files for logo/preview
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    stopAllProcesses()
  })

  registerHotkeys()
}

function registerHotkeys() {
  if (!store) return

  const hotkeys = store.get('hotkeys') || {}

  const register = (key: string, action: string) => {
    if (!key || !key.trim()) return
    try {
      globalShortcut.register(key.trim(), () => {
        if (mainWindow) {
          mainWindow.webContents.send('hotkey', action)
        }
      })
    } catch (e) {
    }
  }

  register(hotkeys.toggleText, 'toggle-text')
  register(hotkeys.nextSlide, 'next-slide')
  register(hotkeys.prevSlide, 'prev-slide')
  register(hotkeys.cam1, 'cam-1')
  register(hotkeys.cam2, 'cam-2')
  register(hotkeys.cam3, 'cam-3')
  register(hotkeys.cam4, 'cam-4')
  register(hotkeys.startStream, 'start-stream')
  register(hotkeys.stopStream, 'stop-stream')
  register(hotkeys.startRecording, 'start-recording')
  register(hotkeys.stopRecording, 'stop-recording')
  register(hotkeys.openPresentation, 'open-presentation')
  register(hotkeys.closePresentation, 'close-presentation')
  register(hotkeys.openController, 'open-controller')
  register(hotkeys.toggleFallback, 'toggle-fallback')
  register(hotkeys.openFile, 'open-file')
}

function unregisterHotkeys() {
  globalShortcut.unregisterAll()
}

function stopAllProcesses() {
  if (ffmpegStreamProcess) {
    ffmpegStreamProcess.kill('SIGTERM')
    ffmpegStreamProcess = null
  }
  if (ffmpegRecordProcess) {
    ffmpegRecordProcess.kill('SIGTERM')
    ffmpegRecordProcess = null
  }
  if (streamTimer) {
    clearInterval(streamTimer)
    streamTimer = null
  }
  for (const id of ipCameraMap.keys()) stopRtspProxy(id)
  ipCameraMap.clear()
  stopMobileCamServers()
  if (presentationWindow && !presentationWindow.isDestroyed()) {
    presentationWindow.close()
    presentationWindow = null
  }
  if (pptxControllerWindow && !pptxControllerWindow.isDestroyed()) {
    pptxControllerWindow.close()
    pptxControllerWindow = null
  }
}

function registerIpcHandlers() {

// Get cameras using PowerShell on Windows
ipcMain.handle('get-cameras', async () => {
  try {
    const psCommand = `
      Get-PnpDevice -Class Camera -Status OK | Select-Object -Property FriendlyName, DeviceID | ConvertTo-Json
    `
    const result = execSync(
      `powershell -Command "${psCommand.replace(/\n/g, ' ')}"`,
      { timeout: 5000 }
    ).toString()

    let devices: any[] = []
    try {
      const parsed = JSON.parse(result)
      devices = Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      devices = []
    }

    const cameras = devices
      .filter((d: any) => d && d.FriendlyName)
      .map((d: any, idx: number) => ({
        id: String(idx),
        label: d.FriendlyName || `Camera ${idx + 1}`,
        deviceId: d.DeviceID || String(idx),
      }))

    return { success: true, cameras }
  } catch (err: any) {
    return { success: true, cameras: [] }
  }
})

// Open and parse any supported document file
ipcMain.handle('open-pptx', async () => {
  if (!mainWindow) return { success: false, error: 'No window' }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Document',
    filters: [
      {
        name: 'All Supported Files',
        extensions: ['pptx', 'ppt', 'pdf', 'docx', 'doc', 'xlsx', 'xls', 'odp', 'odt', 'ods'],
      },
      { name: 'PowerPoint', extensions: ['pptx', 'ppt'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'Word', extensions: ['docx', 'doc'] },
      { name: 'Excel', extensions: ['xlsx', 'xls'] },
      { name: 'OpenDocument', extensions: ['odp', 'odt', 'ods'] },
    ],
    properties: ['openFile'],
  })

  if (result.canceled || !result.filePaths.length) {
    return { success: false, canceled: true }
  }

  const filePath = result.filePaths[0]
  const ext = path.extname(filePath).toLowerCase().slice(1)

  try {
    let slides: any[] = []

    if (ext === 'pptx' || ext === 'ppt') {
      slides = await parsePptxSlides(filePath)
    } else if (ext === 'pdf') {
      slides = await parsePdfFile(filePath)
    } else if (ext === 'docx' || ext === 'doc') {
      slides = await parseWordFile(filePath)
    } else if (ext === 'xlsx' || ext === 'xls' || ext === 'odp' || ext === 'odt' || ext === 'ods') {
      slides = await parseWithOfficeParser(filePath)
    } else {
      return { success: false, error: `Unsupported file type: .${ext}` }
    }

    return { success: true, slides, filePath, fileType: ext }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('open-multiple-pptx', async () => {
  if (!mainWindow) return { success: false, error: 'No window' }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Documents',
    filters: [
      { name: 'All Supported Files', extensions: ['pptx', 'ppt', 'pdf', 'docx', 'doc', 'xlsx', 'xls', 'odp', 'odt', 'ods'] },
      { name: 'PowerPoint', extensions: ['pptx', 'ppt'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'Word', extensions: ['docx', 'doc'] },
      { name: 'OpenDocument', extensions: ['odp', 'odt', 'ods'] },
    ],
    properties: ['openFile', 'multiSelections'],
  })

  if (result.canceled || !result.filePaths.length) {
    return { success: false, canceled: true }
  }

  const results = await Promise.all(result.filePaths.map(async (filePath) => {
    const ext = path.extname(filePath).toLowerCase().slice(1)
    try {
      let slides: any[] = []
      if (ext === 'pptx' || ext === 'ppt') slides = await parsePptxSlides(filePath)
      else if (ext === 'pdf')               slides = await parsePdfFile(filePath)
      else if (ext === 'docx' || ext === 'doc') slides = await parseWordFile(filePath)
      else if (['xlsx','xls','odp','odt','ods'].includes(ext)) slides = await parseWithOfficeParser(filePath)
      else return { success: false, filePath, error: `Unsupported: .${ext}` }
      return { success: true, slides, filePath, fileType: ext }
    } catch (err: any) {
      return { success: false, filePath, error: err.message }
    }
  }))

  return { success: true, results }
})

async function parsePptxSlides(filePath: string): Promise<any[]> {
  const zip = new AdmZip(filePath)

  // ── Extract sections ────────────────────────────────────────────────────
  const sections = extractSections(zip)

  // ── Parse each slide ────────────────────────────────────────────────────
  const slideEntries = zip
    .getEntries()
    .filter((e: any) => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a: any, b: any) => {
      const numA = parseInt(a.entryName.match(/\d+/)?.[0] || '0')
      const numB = parseInt(b.entryName.match(/\d+/)?.[0] || '0')
      return numA - numB
    })

  // Known Coptic font name patterns (CS fonts, Coptic Unicode fonts, etc.)
  const COPTIC_FONT_RE = /cs\s*avva|cs\s*shenouda|cs\s*new\s*athena|coptic\s*unicode|new\s*athena\s*unicode|antinoou|cs\s*pishoi|cs\s*coptic|coptic\b/i

  // Coptic Unicode block U+2C80–U+2CFF and supplemental Coptic U+102E0–U+102FF
  const COPTIC_CHAR_RE = /[\u2C80-\u2CFF\u{102E0}-\u{102FF}]/u

  function detectParaLang(paraXml: string): 'coptic' | 'arabic' | 'english' {
    // Check font name on run properties <a:rPr> or paragraph props
    const fontMatches = paraXml.match(/(?:typeface|panose|pitchFamily)="([^"]+)"/g) || []
    for (const fm of fontMatches) {
      const val = fm.replace(/.*="/, '').replace(/"$/, '')
      if (COPTIC_FONT_RE.test(val)) return 'coptic'
    }
    // Check the text content for Coptic Unicode characters
    const textContent = paraXml.replace(/<[^>]+>/g, '')
    if (COPTIC_CHAR_RE.test(textContent)) return 'coptic'
    // Arabic Unicode block
    if (/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(textContent)) return 'arabic'
    return 'english'
  }

  const slides = slideEntries.map((entry: any, idx: number) => {
    const xml = entry.getData().toString('utf8')

    // Extract paragraphs (<a:p>), preserving lang info per paragraph
    const paragraphMatches = xml.match(/<a:p[ >][\s\S]*?<\/a:p>/g) || []
    const textLines: string[] = []
    const langs: string[] = []

    for (const para of paragraphMatches) {
      const runMatches = para.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || []
      const text = runMatches
        .map((r: string) => r.replace(/<[^>]+>/g, ''))
        .join('')
        .trim()
      if (!text) continue
      textLines.push(text)
      langs.push(detectParaLang(para))
    }

    const slideNum = idx + 1
    let sectionName = sections.length > 0 ? sections[0].name : 'General'
    for (const sec of sections) {
      if (sec.startSlide <= slideNum) sectionName = sec.name
      else break
    }

    return {
      index: idx,
      text: textLines,
      langs,
      slideNumber: slideNum,
      section: sectionName,
    }
  })

  return slides
}

function extractSections(zip: any): Array<{ name: string; startSlide: number }> {
  const presEntry = zip.getEntry('ppt/presentation.xml')
  if (!presEntry) return []
  const xml = presEntry.getData().toString('utf8')

  // Step 1: build numeric id → slide order from <p:sldIdLst>
  const sldIdLstMatch = xml.match(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/)
  if (!sldIdLstMatch) return []

  const numIdToSlideNum: Record<string, number> = {}
  const sldIdRe = /<p:sldId\b[^>]+\bid="(\d+)"/g
  let m: RegExpExecArray | null
  let slidePos = 0
  while ((m = sldIdRe.exec(sldIdLstMatch[1])) !== null) {
    numIdToSlideNum[m[1]] = ++slidePos
  }

  // Step 2: extract sections using exec loop (avoid matchAll/spread issues)
  const secRe = /<p14:section\b[^>]+name="([^"]*)"[^>]*>([\s\S]*?)<\/p14:section>/g
  const sections: Array<{ name: string; startSlide: number }> = []

  while ((m = secRe.exec(xml)) !== null) {
    const name = m[1] || 'Section'
    const body = m[2]
    const idMatch = /<p14:sldId\b[^>]+\bid="(\d+)"/.exec(body)
    if (!idMatch) continue
    const startSlide = numIdToSlideNum[idMatch[1]]
    if (!startSlide) continue
    sections.push({ name, startSlide })
  }

  return sections.sort((a, b) => a.startSlide - b.startSlide)
}

async function parseWithOfficeParser(filePath: string): Promise<any[]> {
  return new Promise((resolve) => {
    officeParser.parseOffice(filePath, (data: string, err: any) => {
      if (err) {
        resolve([{ index: 0, text: ['Error parsing file'], slideNumber: 1 }])
        return
      }
      // Split text into pseudo-slides by double newlines or paragraphs
      const blocks = data
        .split(/\n{2,}/)
        .map((b: string) => b.trim())
        .filter((b: string) => b.length > 0)

      const slides = blocks.map((block: string, idx: number) => ({
        index: idx,
        text: block.split('\n').filter((l: string) => l.trim().length > 0),
        slideNumber: idx + 1,
      }))

      resolve(slides.length > 0 ? slides : [{ index: 0, text: ['No text found'], slideNumber: 1 }])
    })
  })
}

// Parse PDF — each page becomes a "slide"
async function parsePdfFile(filePath: string): Promise<any[]> {
  // Try to load pdf-parse at call time if not yet loaded
  if (!pdfParse) {
    const attempts = [
      () => require('pdf-parse'),
      () => require(path.join(__dirname, '..', 'node_modules', 'pdf-parse')),
      () => require(path.join(process.resourcesPath ?? '', 'app.asar.unpacked', 'node_modules', 'pdf-parse')),
    ]
    for (const attempt of attempts) {
      try { pdfParse = attempt(); break } catch { /* try next */ }
    }
  }
  if (!pdfParse) {
    return [{ index: 0, text: ['pdf-parse could not be loaded — try restarting the app'], slideNumber: 1, section: 'PDF' }]
  }
  try {
    const buffer = fs.readFileSync(filePath)
    const data = await pdfParse(buffer)

    // Split by form-feed (\f) if present (page breaks), else by double newlines
    const rawPages: string[] = data.text.includes('\f')
      ? data.text.split('\f')
      : data.text.split(/\n{3,}/)

    const pages = rawPages
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0)

    if (pages.length === 0) {
      return [{ index: 0, text: ['No text found in PDF'], slideNumber: 1, section: 'PDF' }]
    }

    return pages.map((page: string, idx: number) => ({
      index: idx,
      slideNumber: idx + 1,
      section: `Page ${idx + 1}`,
      text: page.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0),
    }))
  } catch (err: any) {
    return [{ index: 0, text: [`Error reading PDF: ${err.message}`], slideNumber: 1, section: 'PDF' }]
  }
}

// Parse Word DOC/DOCX — split by headings or paragraphs into slides
async function parseWordFile(filePath: string): Promise<any[]> {
  if (!mammoth) {
    return [{ index: 0, text: ['mammoth not available'], slideNumber: 1, section: 'Word' }]
  }
  try {
    const result = await mammoth.extractRawText({ path: filePath })
    const fullText: string = result.value

    // Split into sections by heading-like breaks (lines followed by blank lines)
    // or every N lines as a "slide"
    const lines = fullText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)

    if (lines.length === 0) {
      return [{ index: 0, text: ['No text found in document'], slideNumber: 1, section: 'Word' }]
    }

    // Group every 8 lines into one "slide"
    const LINES_PER_SLIDE = 8
    const chunks: string[][] = []
    for (let i = 0; i < lines.length; i += LINES_PER_SLIDE) {
      chunks.push(lines.slice(i, i + LINES_PER_SLIDE))
    }

    return chunks.map((chunk: string[], idx: number) => ({
      index: idx,
      slideNumber: idx + 1,
      section: idx === 0 ? 'Start' : `Part ${idx + 1}`,
      text: chunk,
    }))
  } catch (err: any) {
    return [{ index: 0, text: [`Error reading Word file: ${err.message}`], slideNumber: 1, section: 'Word' }]
  }
}

// Start RTMP stream
ipcMain.handle('start-stream', async (_event, config: any) => {
  if (ffmpegStreamProcess) {
    return { success: false, error: 'Stream already running' }
  }

  let ffmpegPath: string
  try { ffmpegPath = await findFFmpeg() } catch (e: any) { return { success: false, error: e.message } }
  const {
    rtmpUrl,
    streamKey,
    resolution = '720p',
    fps = 30,
    bitrate = 3000,
    cameraName = '',
  } = config

  const fullRtmpUrl = streamKey ? `${rtmpUrl}/${streamKey}` : rtmpUrl
  const [width, height] = resolution === '1080p' ? [1920, 1080] : [1280, 720]
  const gopSize = fps * 2

  const args = [
    '-f', 'dshow',
    '-i', `video="${cameraName || 'Integrated Camera'}"`,
    '-vcodec', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-b:v', `${bitrate}k`,
    '-maxrate', `${bitrate}k`,
    '-bufsize', `${bitrate * 2}k`,
    '-pix_fmt', 'yuv420p',
    '-g', String(gopSize),
    '-r', String(fps),
    '-vf', `scale=${width}:${height}`,
    '-acodec', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-f', 'flv',
    fullRtmpUrl,
  ]

  try {
    ffmpegStreamProcess = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    streamStartTime = Date.now()

    ffmpegStreamProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString()
      if (mainWindow) {
        mainWindow.webContents.send('stream-status', {
          type: 'log',
          message: msg,
        })
      }
    })

    ffmpegStreamProcess.on('error', (err) => {
      ffmpegStreamProcess = null
      if (mainWindow) {
        mainWindow.webContents.send('stream-status', {
          type: 'error',
          message: err.message,
        })
      }
    })

    ffmpegStreamProcess.on('exit', (code) => {
      ffmpegStreamProcess = null
      streamStartTime = null
      if (streamTimer) {
        clearInterval(streamTimer)
        streamTimer = null
      }
      if (mainWindow) {
        mainWindow.webContents.send('stream-status', {
          type: 'stopped',
          code,
        })
      }
    })

    // Send duration updates
    streamTimer = setInterval(() => {
      if (mainWindow && streamStartTime) {
        const duration = Math.floor((Date.now() - streamStartTime) / 1000)
        mainWindow.webContents.send('stream-status', {
          type: 'duration',
          duration,
        })
      }
    }, 1000)

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// Stop RTMP stream
ipcMain.handle('stop-stream', async () => {
  if (!ffmpegStreamProcess) {
    return { success: false, error: 'No stream running' }
  }
  ffmpegStreamProcess.kill('SIGTERM')
  ffmpegStreamProcess = null
  streamStartTime = null
  if (streamTimer) {
    clearInterval(streamTimer)
    streamTimer = null
  }
  return { success: true }
})

// Start local recording
ipcMain.handle('start-recording', async (_event, config: any) => {
  if (ffmpegRecordProcess) {
    return { success: false, error: 'Recording already in progress' }
  }

  let ffmpegPath: string
  try { ffmpegPath = await findFFmpeg() } catch (e: any) { return { success: false, error: e.message } }

  if (!mainWindow) return { success: false, error: 'No window' }

  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Recording',
    defaultPath: `recording_${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  })

  if (saveResult.canceled || !saveResult.filePath) {
    return { success: false, canceled: true }
  }
  const { cameraName = '', resolution = '720p', fps = 30 } = config
  const [width, height] = resolution === '1080p' ? [1920, 1080] : [1280, 720]

  const args = [
    '-f', 'dshow',
    '-i', `video="${cameraName || 'Integrated Camera'}"`,
    '-vcodec', 'libx264',
    '-preset', 'fast',
    '-b:v', '8000k',
    '-r', String(fps),
    '-vf', `scale=${width}:${height}`,
    '-acodec', 'aac',
    '-b:a', '192k',
    '-ar', '44100',
    saveResult.filePath,
  ]

  try {
    ffmpegRecordProcess = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })

    ffmpegRecordProcess.stderr?.on('data', () => {})

    ffmpegRecordProcess.on('error', () => {
      ffmpegRecordProcess = null
    })

    ffmpegRecordProcess.on('exit', (code) => {
      ffmpegRecordProcess = null
      if (mainWindow) {
        mainWindow.webContents.send('stream-status', {
          type: 'recording-stopped',
          code,
        })
      }
    })

    return { success: true, filePath: saveResult.filePath }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// Stop recording
ipcMain.handle('stop-recording', async () => {
  if (!ffmpegRecordProcess) {
    return { success: false, error: 'No recording in progress' }
  }
  ffmpegRecordProcess.kill('SIGTERM')
  ffmpegRecordProcess = null
  return { success: true }
})

// Settings
ipcMain.handle('get-settings', async () => {
  if (!store) return { success: false, error: 'Store not initialized' }
  return {
    success: true,
    settings: {
      streamConfig: store.get('streamConfig'),
      overlaySettings: store.get('overlaySettings'),
      logoSettings: store.get('logoSettings'),
      cameraFallback: store.get('cameraFallback'),
      hotkeys: store.get('hotkeys'),
    },
  }
})

ipcMain.handle('save-settings', async (_event, settings: any) => {
  if (!store) return { success: false, error: 'Store not initialized' }
  try {
    if (settings.streamConfig) store.set('streamConfig', settings.streamConfig)
    if (settings.overlaySettings) store.set('overlaySettings', settings.overlaySettings)
    if (settings.logoSettings) store.set('logoSettings', settings.logoSettings)
    if (settings.cameraFallback) store.set('cameraFallback', settings.cameraFallback)
    if (settings.hotkeys) {
      store.set('hotkeys', settings.hotkeys)
      // Re-register hotkeys
      unregisterHotkeys()
      registerHotkeys()
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// Logo file selection
ipcMain.handle('select-logo', async () => {
  if (!mainWindow) return { success: false, error: 'No window' }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Logo Image',
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
    ],
    properties: ['openFile'],
  })

  if (result.canceled || !result.filePaths.length) {
    return { success: false, canceled: true }
  }

  return { success: true, filePath: result.filePaths[0] }
})

// Get logo as base64
ipcMain.handle('get-logo-data', async (_event, filePath: string) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' }
    }
    const data = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase().replace('.', '')
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
    }
    const mime = mimeMap[ext] || 'image/png'
    const base64 = `data:${mime};base64,${data.toString('base64')}`
    return { success: true, base64 }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// Open external links
ipcMain.handle('open-external', async (_event, url: string) => {
  await shell.openExternal(url)
})

// ── Presentation Window ──────────────────────────────────────────────────────

ipcMain.handle('get-displays', () => {
  const { screen } = require('electron')
  const primary = screen.getPrimaryDisplay()
  return screen.getAllDisplays().map((d: any) => ({
    id: d.id,
    label: `Display ${d.id}${d.id === primary.id ? ' (Primary)' : ''}`,
    bounds: d.bounds,
  }))
})

ipcMain.handle('open-presentation-window', async (_event, displayId?: number) => {
  if (presentationWindow && !presentationWindow.isDestroyed()) {
    presentationWindow.focus()
    return { success: true, alreadyOpen: true }
  }

  const { screen } = require('electron')
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()

  let targetDisplay = displayId != null
    ? displays.find((d: any) => d.id === displayId) ?? displays[0]
    : displays.find((d: any) => d.id !== primary.id) ?? displays[0]

  const isExternal = targetDisplay.id !== primary.id
  const { x, y, width, height } = targetDisplay.bounds

  presentationWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    backgroundColor: '#000000',
    fullscreen: isExternal,
    frame: !isExternal,
    alwaysOnTop: false,
    title: 'Church Presentation',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow loading local file:// video paths
    },
  })

  if (isDev) {
    await presentationWindow.loadURL('http://localhost:5173/presentation.html')
  } else {
    await presentationWindow.loadFile(path.join(__dirname, '../dist/presentation.html'))
  }

  // Re-send last known data once the window's renderer is ready (delay lets React mount)
  presentationWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      if (lastPresentationData && presentationWindow && !presentationWindow.isDestroyed()) {
        presentationWindow.webContents.send('presentation-update', lastPresentationData)
      }
    }, 300)
  })

  presentationWindow.on('closed', () => {
    presentationWindow = null
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('presentation-window-closed')
    }
  })

  return { success: true }
})

ipcMain.handle('close-presentation-window', async () => {
  if (presentationWindow && !presentationWindow.isDestroyed()) {
    presentationWindow.close()
    presentationWindow = null
  }
  return { success: true }
})

ipcMain.handle('get-presentation-data', async () => {
  return lastPresentationData
})

ipcMain.handle('update-presentation', async (_event, data: any) => {
  lastPresentationData = data
  if (presentationWindow && !presentationWindow.isDestroyed()) {
    presentationWindow.webContents.send('presentation-update', data)
    return { success: true }
  }
  return { success: false, error: 'Presentation window not open' }
})

// Video overlay — fire-and-forget (no reply needed, avoids round-trip latency)
ipcMain.on('sync-video-overlay', (_event, msg: any) => {
  if (presentationWindow && !presentationWindow.isDestroyed()) {
    presentationWindow.webContents.send('video-overlay-sync', msg)
  }
})

ipcMain.handle('presentation-fullscreen', async (_event, enable: boolean) => {
  if (presentationWindow && !presentationWindow.isDestroyed()) {
    presentationWindow.setFullScreen(enable)
    return { success: true }
  }
  return { success: false }
})

// ── PPTX Controller Window ────────────────────────────────────────────────────

ipcMain.handle('open-pptx-controller', async () => {
  if (pptxControllerWindow && !pptxControllerWindow.isDestroyed()) {
    pptxControllerWindow.focus()
    return { success: true, alreadyOpen: true }
  }

  pptxControllerWindow = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: '#0f0f1a',
    title: 'PowerPoint Controller',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    // Retry until Vite dev server is ready
    for (let i = 0; i < 10; i++) {
      try {
        await pptxControllerWindow.loadURL('http://localhost:5173/pptx-controller.html')
        break
      } catch {
        await new Promise(r => setTimeout(r, 500))
      }
    }
  } else {
    await pptxControllerWindow.loadFile(path.join(__dirname, '../dist/pptx-controller.html'))
  }

  pptxControllerWindow.webContents.on('did-finish-load', () => {
    if (lastSlidesData && pptxControllerWindow && !pptxControllerWindow.isDestroyed()) {
      pptxControllerWindow.webContents.send('slides-data', lastSlidesData)
    }
  })

  pptxControllerWindow.on('closed', () => {
    pptxControllerWindow = null
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pptx-controller-closed')
    }
  })

  return { success: true }
})

ipcMain.handle('close-pptx-controller', async () => {
  if (pptxControllerWindow && !pptxControllerWindow.isDestroyed()) {
    pptxControllerWindow.close()
    pptxControllerWindow = null
  }
  return { success: true }
})

// Main → Controller: push slides data after load
ipcMain.handle('send-slides-to-controller', async (_event, data: any) => {
  lastSlidesData = data
  if (pptxControllerWindow && !pptxControllerWindow.isDestroyed()) {
    pptxControllerWindow.webContents.send('slides-data', data)
    return { success: true }
  }
  return { success: false }
})

// Main → Controller: sync current slide index
ipcMain.handle('sync-slide-to-controller', async (_event, index: number) => {
  if (pptxControllerWindow && !pptxControllerWindow.isDestroyed()) {
    pptxControllerWindow.webContents.send('slide-index-changed', index)
  }
  return { success: true }
})

// Controller → Main: user selected a slide
ipcMain.handle('controller-select-slide', async (_event, index: number) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('remote-select-slide', index)
  }
  return { success: true }
})

// Controller → Main: toggle text visibility
ipcMain.handle('controller-toggle-text', async (_event, visible: boolean) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('remote-toggle-text', visible)
  }
  return { success: true }
})

// Controller → Main: open PPTX (proxy the dialog through main window)
ipcMain.handle('controller-open-pptx', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('remote-open-pptx')
  }
  return { success: true }
})

// ── IP Camera IPC ─────────────────────────────────────────────────────────────

ipcMain.handle('ip-camera-add', async (_event, { id, label, rtspUrl }: { id: string; label: string; rtspUrl: string }) => {
  if (ipCameraMap.has(id)) return { success: false, error: 'Camera already added' }
  const port = nextMjpegPort++
  const { user, pass, baseUrl } = parseRtspUrl(rtspUrl)
  const entry: IpCameraEntry = { id, label, rtspUrl, rtspUser: user, rtspPass: pass, rtspBaseUrl: baseUrl, port, ffmpegProcess: null, server: null }
  ipCameraMap.set(id, entry)
  try {
    await startRtspProxy(entry)
    return { success: true, port }
  } catch (err: any) {
    ipCameraMap.delete(id)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('ip-camera-remove', async (_event, id: string) => {
  stopRtspProxy(id)
  ipCameraMap.delete(id)
  return { success: true }
})

ipcMain.handle('ip-camera-list', async () => {
  const cameras = Array.from(ipCameraMap.values()).map(e => ({
    id: e.id,
    label: e.label,
    rtspUrl: e.rtspUrl,
    port: e.port,
    active: e.ffmpegProcess !== null,
  }))
  return { success: true, cameras }
})

ipcMain.handle('ip-camera-restart', async (_event, id: string) => {
  const entry = ipCameraMap.get(id)
  if (!entry) return { success: false, error: 'Camera not found' }
  stopRtspProxy(id)
  try {
    await startRtspProxy(entry)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// ── Mobile Camera IPC ─────────────────────────────────────────────────────────

ipcMain.handle('mobile-cam-start', async () => {
  try {
    startMobileCamServers()
    const urls = getMobileCamUrls()
    const qrDataUrl = await QRCode.toDataURL(urls.phoneUrl, { width: 200, margin: 1 })
    return { success: true, ...urls, qrDataUrl }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('mobile-cam-stop', async () => {
  stopMobileCamServers()
  return { success: true }
})

ipcMain.handle('mobile-cam-status', async () => {
  const running = mobileCamHttpServer !== null
  if (!running) return { running: false }
  const urls = getMobileCamUrls()
  const qrDataUrl = await QRCode.toDataURL(urls.phoneUrl, { width: 200, margin: 1 })
  return { running: true, ...urls, qrDataUrl }
})

} // end registerIpcHandlers

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  stopAllProcesses()
  unregisterHotkeys()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('will-quit', () => {
  stopAllProcesses()
  globalShortcut.unregisterAll()
})
