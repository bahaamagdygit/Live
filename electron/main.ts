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
import { spawn, ChildProcess } from 'child_process'
import { execSync } from 'child_process'

// We use dynamic require for electron-store and officeparser to avoid ESM issues
let Store: any
let officeParser: any

async function loadModules() {
  try {
    const storeModule = await import('electron-store')
    Store = storeModule.default
  } catch (e) {
    console.error('Failed to load electron-store:', e)
  }
  try {
    const parserModule = await import('officeparser')
    officeParser = parserModule.default || parserModule
  } catch (e) {
    console.error('Failed to load officeparser:', e)
  }
}

let store: any = null
let mainWindow: BrowserWindow | null = null
let presentationWindow: BrowserWindow | null = null
let ffmpegStreamProcess: ChildProcess | null = null
let ffmpegRecordProcess: ChildProcess | null = null
let streamStartTime: number | null = null
let streamTimer: NodeJS.Timeout | null = null

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function getAppPath() {
  return isDev ? path.join(__dirname, '..') : path.join(process.resourcesPath)
}

async function createWindow() {
  await loadModules()

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
        hotkeys: {
          toggleText: 'Space',
          nextSlide: 'Right',
          prevSlide: 'Left',
          cam1: 'F1',
          cam2: 'F2',
          cam3: 'F3',
          cam4: 'F4',
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
    try {
      globalShortcut.register(key, () => {
        if (mainWindow) {
          mainWindow.webContents.send('hotkey', action)
        }
      })
    } catch (e) {
      console.warn(`Failed to register hotkey ${key}:`, e)
    }
  }

  // Always register arrow keys and space as defaults
  register(hotkeys.toggleText || 'Space', 'toggle-text')
  register(hotkeys.nextSlide || 'Right', 'next-slide')
  register(hotkeys.prevSlide || 'Left', 'prev-slide')
  register(hotkeys.cam1 || 'F1', 'cam-1')
  register(hotkeys.cam2 || 'F2', 'cam-2')
  register(hotkeys.cam3 || 'F3', 'cam-3')
  register(hotkeys.cam4 || 'F4', 'cam-4')
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
  if (presentationWindow && !presentationWindow.isDestroyed()) {
    presentationWindow.close()
    presentationWindow = null
  }
}

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
    console.warn('PowerShell camera enumeration failed, returning empty list:', err.message)
    return { success: true, cameras: [] }
  }
})

// Open and parse PPTX file
ipcMain.handle('open-pptx', async () => {
  if (!mainWindow) return { success: false, error: 'No window' }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open PPTX File',
    filters: [{ name: 'PowerPoint Files', extensions: ['pptx', 'ppt'] }],
    properties: ['openFile'],
  })

  if (result.canceled || !result.filePaths.length) {
    return { success: false, canceled: true }
  }

  const filePath = result.filePaths[0]

  try {
    if (!officeParser) {
      return { success: false, error: 'officeparser module not available' }
    }

    // officeparser returns all text; we do slide-by-slide by reading raw XML
    const slides = await parsePptxSlides(filePath)
    return { success: true, slides, filePath }
  } catch (err: any) {
    console.error('PPTX parse error:', err)
    return { success: false, error: err.message }
  }
})

async function parsePptxSlides(filePath: string): Promise<any[]> {
  const AdmZip = await importAdmZip()
  if (!AdmZip) {
    // Fallback: use officeparser to get all text, split into chunks
    return await parseWithOfficeParser(filePath)
  }

  try {
    const zip = new AdmZip(filePath)
    const slideEntries = zip
      .getEntries()
      .filter(
        (e: any) =>
          e.entryName.startsWith('ppt/slides/slide') &&
          e.entryName.endsWith('.xml') &&
          !e.entryName.includes('/_rels/')
      )
      .sort((a: any, b: any) => {
        const numA = parseInt(a.entryName.match(/\d+/)?.[0] || '0')
        const numB = parseInt(b.entryName.match(/\d+/)?.[0] || '0')
        return numA - numB
      })

    const slides = slideEntries.map((entry: any, idx: number) => {
      const xml = entry.getData().toString('utf8')
      const textMatches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || []
      const texts = textMatches
        .map((t: string) => t.replace(/<[^>]+>/g, '').trim())
        .filter((t: string) => t.length > 0)

      return {
        index: idx,
        text: texts,
        slideNumber: idx + 1,
      }
    })

    return slides
  } catch (e) {
    return await parseWithOfficeParser(filePath)
  }
}

async function importAdmZip(): Promise<any> {
  try {
    // adm-zip is an optional dependency; use dynamic require to avoid TS errors
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('adm-zip')
    return mod.default || mod
  } catch {
    return null
  }
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

// Find FFmpeg executable
function findFFmpeg(): string {
  const candidates = [
    'ffmpeg',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    path.join(getAppPath(), 'resources', 'ffmpeg.exe'),
  ]

  for (const candidate of candidates) {
    try {
      execSync(`"${candidate}" -version`, { stdio: 'ignore', timeout: 3000 })
      return candidate
    } catch {
      continue
    }
  }

  return 'ffmpeg' // Let it fail naturally with a meaningful error
}

function checkFFmpeg(): boolean {
  try {
    execSync(`ffmpeg -version`, { stdio: 'ignore', timeout: 3000 })
    return true
  } catch {
    try {
      const ffmpegPath = findFFmpeg()
      execSync(`"${ffmpegPath}" -version`, { stdio: 'ignore', timeout: 3000 })
      return true
    } catch {
      return false
    }
  }
}

// Start RTMP stream
ipcMain.handle('start-stream', async (_event, config: any) => {
  if (ffmpegStreamProcess) {
    return { success: false, error: 'Stream already running' }
  }

  const ffmpegAvailable = checkFFmpeg()
  if (!ffmpegAvailable) {
    return {
      success: false,
      error:
        'FFmpeg not found. Please install FFmpeg and add it to your PATH, or place ffmpeg.exe in the resources folder.',
    }
  }

  const ffmpegPath = findFFmpeg()
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
      console.log('[FFmpeg Stream]', msg)
      if (mainWindow) {
        mainWindow.webContents.send('stream-status', {
          type: 'log',
          message: msg,
        })
      }
    })

    ffmpegStreamProcess.on('error', (err) => {
      console.error('FFmpeg stream error:', err)
      ffmpegStreamProcess = null
      if (mainWindow) {
        mainWindow.webContents.send('stream-status', {
          type: 'error',
          message: err.message,
        })
      }
    })

    ffmpegStreamProcess.on('exit', (code) => {
      console.log('FFmpeg stream exited with code:', code)
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

  const ffmpegAvailable = checkFFmpeg()
  if (!ffmpegAvailable) {
    return {
      success: false,
      error: 'FFmpeg not found. Please install FFmpeg.',
    }
  }

  if (!mainWindow) return { success: false, error: 'No window' }

  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Recording',
    defaultPath: `recording_${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  })

  if (saveResult.canceled || !saveResult.filePath) {
    return { success: false, canceled: true }
  }

  const ffmpegPath = findFFmpeg()
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

    ffmpegRecordProcess.stderr?.on('data', (data: Buffer) => {
      console.log('[FFmpeg Record]', data.toString())
    })

    ffmpegRecordProcess.on('error', (err) => {
      console.error('FFmpeg recording error:', err)
      ffmpegRecordProcess = null
    })

    ffmpegRecordProcess.on('exit', (code) => {
      console.log('FFmpeg recording exited with code:', code)
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

ipcMain.handle('open-presentation-window', async () => {
  if (presentationWindow && !presentationWindow.isDestroyed()) {
    presentationWindow.focus()
    return { success: true, alreadyOpen: true }
  }

  const displays = require('electron').screen.getAllDisplays()
  const externalDisplay = displays.find((d: any) => d.id !== require('electron').screen.getPrimaryDisplay().id)
  const targetDisplay = externalDisplay || displays[0]
  const { x, y, width, height } = targetDisplay.bounds

  presentationWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    backgroundColor: '#000000',
    fullscreen: !!externalDisplay,
    frame: !externalDisplay,
    alwaysOnTop: false,
    title: 'Church Presentation',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    await presentationWindow.loadURL('http://localhost:5173/presentation.html')
  } else {
    await presentationWindow.loadFile(path.join(__dirname, '../dist/presentation.html'))
  }

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

ipcMain.handle('update-presentation', async (_event, data: any) => {
  if (presentationWindow && !presentationWindow.isDestroyed()) {
    presentationWindow.webContents.send('presentation-update', data)
    return { success: true }
  }
  return { success: false, error: 'Presentation window not open' }
})

ipcMain.handle('presentation-fullscreen', async (_event, enable: boolean) => {
  if (presentationWindow && !presentationWindow.isDestroyed()) {
    presentationWindow.setFullScreen(enable)
    return { success: true }
  }
  return { success: false }
})

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
