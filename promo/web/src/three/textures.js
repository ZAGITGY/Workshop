// เท็กซ์เจอร์สร้างเองด้วยโค้ด (ไม่สุ่มมั่ว ใช้ seed คงที่ -> ทุกเฟรมทุกเครื่องได้ภาพเดิม)
import * as THREE from 'three'

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// height field -> normal map (Sobel) บน canvas
function heightToNormal(H, size, strength) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const at = (x, y) => H[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * strength
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * strength
      let nx = -dx, ny = dy, nz = 1
      const l = Math.hypot(nx, ny, nz)
      const i = (y * size + x) * 4
      img.data[i] = (nx / l * 0.5 + 0.5) * 255
      img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255
      img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.NoColorSpace
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

// ผ้ายืดเจอร์ซีย์ (single jersey): แถวห่วงรูปตัว V เรียงเป็นคอลัมน์ + เส้นด้ายบิดเล็กน้อย
// 1 แผ่น = ผ้า 2 x 2 ซม. (24 คอลัมน์ x 32 แถว)
export function makeJerseyNormal(size = 512, cols = 24, rows = 32) {
  const rnd = mulberry32(240)
  const cw = size / cols, rh = size / rows
  const H = new Float32Array(size * size)
  const jitter = Array.from({ length: cols * rows }, () => rnd())
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ci = Math.floor(x / cw), ri = Math.floor(y / rh)
      const fx = (x / cw) - ci - 0.5 // -0.5..0.5
      const fy = (y / rh) - ri - 0.5
      // สองขาของตัว V เอียงเข้าหากัน
      const side = fx < 0 ? -1 : 1
      const lx = Math.abs(fx) - 0.25 - fy * 0.18 * side
      const lobe = Math.exp(-(lx * lx) / 0.018 - (fy * fy) / 0.16)
      const j = jitter[(ri % rows) * cols + (ci % cols)]
      // เกลียวด้ายละเอียดบนห่วง
      const twist = 0.08 * Math.sin((fx * 3 + fy * 9 + j) * Math.PI * 2)
      H[y * size + x] = lobe * (0.85 + 0.3 * j) + twist * lobe
    }
  }
  return heightToNormal(H, size, 1.4)
}

// ผ้าริบ 1x1 สำหรับคอเสื้อ: ร่องแนวตั้งถี่ๆ + ห่วงถักเล็ก  (1 แผ่น = 1 x 1 ซม., 6 ร่อง)
export function makeRibNormal(size = 256) {
  const H = new Float32Array(size * size)
  const ribs = 6
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * ribs
      const v = (y / size) * 12
      const r = Math.pow(Math.abs(Math.sin(Math.PI * u)), 0.6)
      const loop = 0.12 * Math.abs(Math.sin(Math.PI * v + (Math.floor(u) % 2) * 1.2))
      H[y * size + x] = r * (0.9 + loop)
    }
  }
  return heightToNormal(H, size, 2.2)
}

// cone แสงสปอตไลต์ (ไล่จางจากบนลงล่าง และจางที่ขอบ) — ไม่มีจุดสว่างที่ต้นแสง
export function makeBeamTexture(size = 256) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1), v = y / (size - 1) // v=0 บน
      const edge = Math.pow(Math.sin(Math.PI * u), 2.2)
      const fall = Math.pow(v, 0.9) * Math.pow(1 - v, 0.25) // บนสุดจาง -> ไม่มีจุดขาวลอย
      const a = edge * fall
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = a * 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
