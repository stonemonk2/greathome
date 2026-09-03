#!/usr/bin/env node
/**
 * Screenshot a local page with the system Chrome, so a layout change can be
 * looked at instead of guessed at. Also reports console errors and any image
 * that failed to load — a broken gallery slug is otherwise invisible.
 *
 *   node scripts/shoot-page.mjs 121a/index.html
 *   node scripts/shoot-page.mjs 121a/index.html --width 430   # mobile
 */
import puppeteer from 'puppeteer-core'
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const target = process.argv[2] ?? '121a/index.html'
const wIdx = process.argv.indexOf('--width')
const width = wIdx > -1 ? +process.argv[wIdx + 1] : 1280
const outIdx = process.argv.indexOf('--out')
const out = outIdx > -1 ? process.argv[outIdx + 1] : 'page.png'

const TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
}

const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '')
  const file = path.join(ROOT, rel || 'index.html')
  if (!file.startsWith(ROOT) || !existsSync(file)) {
    res.writeHead(404).end('not found')
    return
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  res.end(await readFile(file))
})
await new Promise((r) => server.listen(0, r))
const port = server.address().port

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--hide-scrollbars'],
})
const page = await browser.newPage()
await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 })

const problems = []
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`) })
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('requestfailed', (r) => problems.push(`failed: ${r.url().replace(`http://localhost:${port}/`, '')}`))

await page.goto(`http://localhost:${port}/${target}`, { waitUntil: 'networkidle2' })

// Force every lazy image to load before shooting, or the tall page is blank.
await page.evaluate(async () => {
  for (const img of document.images) { img.loading = 'eager' }
  window.scrollTo(0, document.body.scrollHeight)
  await new Promise((r) => setTimeout(r, 1200))
  window.scrollTo(0, 0)
  await new Promise((r) => setTimeout(r, 400))
})

const broken = await page.evaluate(() =>
  [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src))

await page.screenshot({ path: out, fullPage: true })
const dims = await page.evaluate(() => ({ w: document.body.scrollWidth, h: document.body.scrollHeight }))

await browser.close()
server.close()

console.log(`shot ${target} at ${width}px -> ${out}  (page ${dims.w}x${dims.h})`)
console.log(broken.length ? `BROKEN IMAGES (${broken.length}):\n  ${broken.join('\n  ')}` : 'images: all loaded')
console.log(problems.length ? `PROBLEMS:\n  ${[...new Set(problems)].join('\n  ')}` : 'console: clean')
