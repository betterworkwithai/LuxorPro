// Electron main process — Luxor Pro
// .cjs extension required because package.json has "type":"module" (Vite/ESM project)

const { app, BrowserWindow, shell } = require('electron')
const path = require('path')
const http = require('http')
const fs = require('fs')

// Persist the HTTP server port across launches so localStorage origin stays stable.
// Without this, each launch gets a random port → different origin → Supabase session lost.
function loadSavedPort() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'server-port.json'), 'utf8'))
    return typeof data.port === 'number' ? data.port : 0
  } catch { return 0 }
}

function savePort(port) {
  try { fs.writeFileSync(path.join(app.getPath('userData'), 'server-port.json'), JSON.stringify({ port })) } catch {}
}

// MIME types needed for the built Vite assets
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript',
  '.mjs':  'text/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
}

// Spin up a loopback-only HTTP server so the renderer runs on http:// (not file://).
// This avoids Chromium's file:// cross-origin restrictions that break dynamic imports.
// fs.readFileSync is ASAR-aware, so this works whether ASAR is on or off.
function startServer(distPath) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]) || '/'
      let filePath = path.join(distPath, urlPath === '/' ? 'index.html' : urlPath)

      // SPA fallback — unknown paths serve index.html so React Router handles routing
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distPath, 'index.html')
      }

      try {
        const ext = path.extname(filePath).toLowerCase()
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
        res.end(fs.readFileSync(filePath))
      } catch {
        res.writeHead(404)
        res.end('Not found')
      }
    })

    // Prefer the previously-used port so localStorage origin stays stable across launches.
    // If that port is busy, fall back to a random one and persist the new choice.
    const preferred = loadSavedPort() || 51742

    server.on('error', () => {
      server.listen(0, '127.0.0.1')
    })
    server.on('listening', () => {
      const port = server.address().port
      savePort(port)
      resolve(`http://127.0.0.1:${port}`)
    })
    server.listen(preferred, '127.0.0.1')
  })
}

const isDev = process.env.ELECTRON_DEV === 'true'
const DEV_URL = process.env.ELECTRON_DEV_URL || 'http://localhost:8080'
const DIST = path.join(__dirname, '..', 'dist')

let mainWindow

async function createWindow() {
  const appUrl = isDev ? DEV_URL : await startServer(DIST)

  mainWindow = new BrowserWindow({
    width:           1280,
    height:          800,
    minWidth:        1024,
    minHeight:       640,
    backgroundColor: '#0a0a0f',
    icon:            path.join(__dirname, '..', 'public', 'icon-512.png'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
      partition:        'persist:luxorpro', // safe with http:// — persists auth/storage across launches
    },
  })

  mainWindow.loadURL(appUrl)

  if (isDev) mainWindow.webContents.openDevTools()

  // Forward renderer console errors to the terminal
  mainWindow.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) console.error(`[renderer] ${message}  (${source}:${line})`)
  })

  // Log renderer crashes to the terminal
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer crashed]', details.reason, 'exit:', details.exitCode)
  })

  // Open http/https links in the system browser instead of a new Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()

  // macOS: re-open window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
