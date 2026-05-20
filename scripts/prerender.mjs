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
const STARTUP_TIMEOUT_MS = 30_000
const NAV_TIMEOUT_MS = 30_000

// Pick an ephemeral free port so re-running locally after a crashed previous
// run never collides on a stuck preview server.
function getFreePort() {
  return new Promise((resolveOk, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolveOk(port))
    })
  })
}

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

// Cross-environment Chromium launcher.
// - Vercel build container is missing libnspr4/libnss3 — the Chromium that
//   `puppeteer` auto-downloads cannot launch there. We use
//   `@sparticuz/chromium` instead, which ships a statically-linked binary
//   built for AWS Lambda / serverless Linux and works on Vercel build too.
// - Locally we keep using full `puppeteer` so devs don't have to install the
//   sparticuz binary on macOS/Windows.
async function launchBrowser() {
  const onVercel = !!process.env.VERCEL
  if (onVercel) {
    const puppeteerCore = (await import('puppeteer-core')).default
    const chromium = (await import('@sparticuz/chromium')).default
    return puppeteerCore.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })
  }
  const puppeteer = (await import('puppeteer')).default
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
}

async function main() {
  if (process.env.SKIP_PRERENDER) {
    console.log('[prerender] SKIPPED (SKIP_PRERENDER env set).')
    process.exit(0)
  }

  if (!(await exists(distDir))) {
    console.error('[prerender] dist/ not found — run `vite build` first.')
    process.exit(1)
  }

  const PORT = await getFreePort()
  const HOST = `http://localhost:${PORT}`
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

    const browser = await launchBrowser()

    try {
      for (const route of PRERENDER_ROUTES) {
        const url = `${HOST}${route}`
        console.log(`[prerender] → ${url}`)
        const page = await browser.newPage()
        try {
          // Surface page-side errors so we can see why React might not mount.
          page.on('pageerror', (err) => console.warn(`[prerender] pageerror ${route}: ${err.message}`))
          page.on('console', (msg) => {
            if (msg.type() === 'error') console.warn(`[prerender] console.error ${route}: ${msg.text()}`)
          })
          // Match a desktop viewport so layout-dependent rendering (CSS clamp,
          // responsive grids) settles into the default desktop tree.
          await page.setViewport({ width: 1280, height: 800 })
          await page.goto(url, { waitUntil: 'networkidle0', timeout: NAV_TIMEOUT_MS })

          // Wait for an actual H1 to exist — defeats the Suspense fallback
          // which only contains a loading <img>. Without this we'd capture
          // the spinner instead of the page.
          await page.waitForFunction(
            () => {
              const h1 = document.querySelector('h1')
              return h1 && h1.textContent && h1.textContent.trim().length > 0
            },
            { timeout: 15_000 },
          ).catch(() => console.warn(`[prerender] WARN: no <h1> found at ${route}`))

          // Give React a beat to flush effects (Calculadora updates <head> in
          // useEffect, so we need this for the per-page title/meta/JSON-LD).
          await new Promise((r) => setTimeout(r, 400))

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
