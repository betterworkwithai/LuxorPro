#!/usr/bin/env node
/**
 * Prerender selected SPA routes to static HTML for SEO/AI-crawler visibility.
 *
 * Runs AFTER `vite build`. Spawns a local `vite preview` server, drives
 * headless Chromium via Puppeteer through each route, waits for hydration,
 * then writes the rendered HTML over the corresponding file in `dist/`.
 *
 * Why: the app is a client-rendered React SPA. Without prerendering,
 * crawlers that don't execute JS (Bing, DuckDuckGo, most AI bots) see an
 * empty <div id="root"> and index nothing.
 *
 * Add new routes to PRERENDER_ROUTES below.
 */

import { spawn } from 'node:child_process'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const distDir = join(projectRoot, 'dist')

const PRERENDER_ROUTES = ['/', '/calculadora']
const PORT = 4321
const HOST = `http://localhost:${PORT}`
const STARTUP_TIMEOUT_MS = 30_000
const NAV_TIMEOUT_MS = 30_000

async function exists(p) {
  try { await access(p, fsConstants.F_OK); return true } catch { return false }
}

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolveWait, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ port, host: '127.0.0.1' })
      socket.once('connect', () => { socket.end(); resolveWait() })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) reject(new Error(`port ${port} did not open within ${timeoutMs}ms`))
        else setTimeout(tryConnect, 250)
      })
    }
    tryConnect()
  })
}

async function main() {
  if (!(await exists(distDir))) {
    console.error('[prerender] dist/ not found — run `vite build` first.')
    process.exit(1)
  }

  // puppeteer is loaded lazily so that environments without it (e.g. Capacitor
  // or Electron builds where we may want to skip prerender) can opt out.
  let puppeteer
  try {
    puppeteer = (await import('puppeteer')).default
  } catch (err) {
    console.error('[prerender] puppeteer is not installed. Run `npm i -D puppeteer` and retry.')
    console.error(err.message)
    process.exit(1)
  }

  console.log(`[prerender] starting vite preview on port ${PORT}…`)
  // Use `shell: true` on Windows so npx.cmd resolves correctly (Node 16+ refuses
  // to spawn .cmd/.bat files without it). On Unix-likes shell:true is also
  // safe here because the arg array doesn't contain user-controlled input.
  const preview = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'], env: process.env, shell: true },
  )

  // Surface preview server errors so failures aren't silent.
  preview.stdout?.on('data', (buf) => process.stdout.write(`[vite preview] ${buf}`))
  preview.stderr?.on('data', (buf) => process.stderr.write(`[vite preview] ${buf}`))

  let exitCode = 0
  try {
    await waitForPort(PORT, STARTUP_TIMEOUT_MS)
    console.log('[prerender] preview server ready')

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    try {
      for (const route of PRERENDER_ROUTES) {
        const url = `${HOST}${route}`
        console.log(`[prerender] → ${url}`)
        const page = await browser.newPage()
        try {
          // Match a desktop viewport so layout-dependent rendering (CSS clamp,
          // responsive grids) settles into the default desktop tree.
          await page.setViewport({ width: 1280, height: 800 })
          await page.goto(url, { waitUntil: 'networkidle0', timeout: NAV_TIMEOUT_MS })

          // Belt-and-suspenders: make sure the React tree has actually rendered
          // something into #root before we capture the HTML.
          await page.waitForFunction(
            () => document.getElementById('root')?.childElementCount > 0,
            { timeout: 10_000 },
          ).catch(() => console.warn(`[prerender] WARN: root not populated at ${route}`))

          // Give React a beat to flush effects (Calculadora updates <head> in
          // useEffect, so we need this for the per-page title/meta/JSON-LD).
          await new Promise((r) => setTimeout(r, 250))

          const html = await page.content()

          const outPath = route === '/'
            ? join(distDir, 'index.html')
            : join(distDir, route.replace(/^\//, ''), 'index.html')

          await mkdir(dirname(outPath), { recursive: true })
          await writeFile(outPath, html, 'utf8')

          console.log(`[prerender]   wrote ${outPath.replace(projectRoot, '')}`)
        } finally {
          await page.close()
        }
      }
    } finally {
      await browser.close()
    }

    console.log('[prerender] done.')
  } catch (err) {
    console.error('[prerender] FAILED:', err)
    exitCode = 1
  } finally {
    preview.kill()
    // Small grace period so the OS releases the port before any next step.
    await new Promise((r) => setTimeout(r, 200))
    process.exit(exitCode)
  }
}

main()
