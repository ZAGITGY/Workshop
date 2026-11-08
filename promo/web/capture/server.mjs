// static server เล็กๆ สำหรับเปิด dist/ ตอนอัดเฟรม (ไม่ต้องพึ่ง vite preview)
import http from 'http'
import fs from 'fs'
import path from 'path'
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json', '.webm': 'video/webm', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' }
export function serve(roots, port) {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    for (const [prefix, dir] of roots) {
      if (!u.startsWith(prefix)) continue
      const f = path.join(dir, u.slice(prefix.length) || 'index.html')
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) continue
      const stat = fs.statSync(f)
      const type = TYPES[path.extname(f)] || 'application/octet-stream'
      const range = req.headers.range
      if (range) {
        const [a, b] = range.replace('bytes=', '').split('-')
        const start = +a, end = b ? +b : stat.size - 1
        res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 })
        fs.createReadStream(f, { start, end }).pipe(res)
      } else {
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' })
        fs.createReadStream(f).pipe(res)
      }
      return
    }
    res.writeHead(404); res.end('not found')
  })
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r(srv)))
}
