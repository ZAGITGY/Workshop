// อัดเฟรมฉาก 3D ทีละฉาก (deterministic) -> .frames/<scene>/NNNNN.jpg  + anchors.json
// ใช้:  node capture/render-scenes.mjs [hero field ...] [--only 0,30,60] [--step 1]
import { createRequire } from 'module'
const { chromium } = createRequire(import.meta.url)('playwright')
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { serve } from './server.mjs'
import { SCENES, sceneRange, FPS } from '../src/timeline.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FR = path.join(ROOT, '.frames')
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',').map(Number) : null
const step = args.includes('--step') ? +args[args.indexOf('--step') + 1] : 1
const names = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
const list = names.length ? names : SCENES
const PORT = args.includes('--port') ? +args[args.indexOf('--port') + 1] : 4610
const QS = args.includes('--qs') ? '&' + args[args.indexOf('--qs') + 1] : ''
const OUTDIR = args.includes('--out') ? args[args.indexOf('--out') + 1] : null

const srv = await serve([['/', path.join(ROOT, 'dist')]], PORT)
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
for (const name of list) {
  const idx = SCENES.indexOf(name)
  const [a, b] = sceneRange(idx)
  const f0 = Math.floor(a * FPS), f1 = Math.ceil(b * FPS)
  const dir = OUTDIR ? path.join(OUTDIR, name) : path.join(FR, name)
  fs.mkdirSync(dir, { recursive: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${name}] ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => console.log(`[${name}] pageerror: ${e.message}`))
  const t0 = Date.now()
  await page.goto(`http://127.0.0.1:${PORT}/scene.html?scene=${name}${QS}`)
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000, polling: 200 })
  console.log(`[${name}] ready in ${((Date.now() - t0) / 1000).toFixed(1)}s, frames ${f0}..${f1}`)
  const anchorsFile = path.join(dir, 'anchors.json')
  const anchors = fs.existsSync(anchorsFile) ? JSON.parse(fs.readFileSync(anchorsFile, 'utf8')) : {}
  const frames = only || Array.from({ length: Math.ceil((f1 - f0 + 1) / step) }, (_, i) => f0 + i * step)
  const tStart = Date.now()
  for (const f of frames) {
    const res = await page.evaluate((T) => window.__renderAt(T), f / FPS)
    if (res && res.anchors) anchors[f] = res.anchors
    await page.screenshot({ path: path.join(dir, String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 94 })
    if (f % 15 === 0) console.log(`[${name}] frame ${f} (${((Date.now() - tStart) / 1000 / (frames.indexOf(f) + 1)).toFixed(2)} s/frame)`)
  }
  fs.writeFileSync(anchorsFile, JSON.stringify(anchors))
  await page.close()
}
await browser.close()
srv.close()
