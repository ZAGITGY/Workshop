// ประกอบหน้าเว็บจำลองจากเฟรม 3D + HTML แล้วอัดทีละเฟรม -> out/screen.mp4 (H.264) และ .frames/screen.webm (ใช้เป็น video texture บนจอโน้ตบุ๊ก)
// ใช้: node capture/compose-screen.mjs [--only 0,60,120]
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { serve } from './server.mjs'
import { FPS, frameCount } from '../src/timeline.js'
const { chromium } = createRequire(import.meta.url)('playwright')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROMO = path.resolve(ROOT, '..')
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',').map(Number) : null
const OUT = path.join(ROOT, '.frames', 'screen')
fs.mkdirSync(OUT, { recursive: true })
const PORT = 4630
const srv = await serve([['/frames/', path.join(ROOT, '.frames')], ['/', path.join(ROOT, process.env.DIST || 'dist')]], PORT)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
page.on('console', (m) => { if (m.type() !== 'debug') console.log('[page]', m.text()) })
page.on('pageerror', (e) => console.log('[page] error', e.message))
await page.goto(`http://127.0.0.1:${PORT}/page.html?frames=/frames/`)
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 })
const frames = only || Array.from({ length: frameCount }, (_, i) => i)
for (const f of frames) {
  await page.evaluate((T) => window.__setTime(T), f / FPS)
  await page.screenshot({ path: path.join(OUT, String(f).padStart(5, '0') + '.png') })
  if (f % 60 === 0) console.log('screen frame', f)
}
await browser.close()
srv.close()
if (!only) {
  fs.mkdirSync(path.join(PROMO, 'out'), { recursive: true })
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(OUT, '%05d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(PROMO, 'out', 'screen.mp4')], { stdio: 'inherit' })
  // VP9 ทุกเฟรมเป็น keyframe -> seek ได้ตรงเฟรมเป๊ะตอนใช้เป็น video texture
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(OUT, '%05d.png'),
    '-c:v', 'libvpx-vp9', '-g', '1', '-crf', '14', '-b:v', '0', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-pix_fmt', 'yuv420p', path.join(ROOT, 'public', 'screen.webm')], { stdio: 'inherit' })
  console.log('wrote out/screen.mp4 + public/screen.webm')
}
