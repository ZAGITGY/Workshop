// อัดฉากโน้ตบุ๊ก 1080x1920 ทีละเฟรม -> .frames/laptop/NNNNN.png -> out/promo-nomusic.mp4 + out/promo.mp4 (ใส่เพลง)
// ใช้: node capture/render-laptop.mjs [--only 0,60] [--dist dist]
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { serve } from './server.mjs'
import { FPS, frameCount, DURATION } from '../src/timeline.js'
const { chromium } = createRequire(import.meta.url)('playwright')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROMO = path.resolve(ROOT, '..')
const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const only = args.includes('--only') ? opt('--only').split(',').map(Number) : null
const DIST = opt('--dist', 'dist')
const OUT = opt('--out', path.join(ROOT, '.frames', 'laptop'))
const from = +opt('--from', 0), to = +opt('--to', frameCount - 1)
fs.mkdirSync(OUT, { recursive: true })
const PORT = +opt('--port', 4640)
const srv = await serve([['/', path.join(ROOT, DIST)]], PORT)
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[laptop]', m.type(), m.text()) })
page.on('pageerror', (e) => console.log('[laptop] error', e.message))
await page.goto(`http://127.0.0.1:${PORT}/laptop.html`)
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000, polling: 250 })
const frames = only || Array.from({ length: to - from + 1 }, (_, i) => from + i)
const t0 = Date.now()
for (const [n, f] of frames.entries()) {
  await page.evaluate((T) => window.__renderAt(T), f / FPS)
  await page.screenshot({ path: path.join(OUT, String(f).padStart(5, '0') + '.png') })
  if (f % 15 === 0) console.log(`laptop frame ${f} (${((Date.now() - t0) / 1000 / (n + 1)).toFixed(2)} s/frame)`)
}
await browser.close()
srv.close()
