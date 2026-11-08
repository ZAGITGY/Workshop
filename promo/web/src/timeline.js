// ไทม์ไลน์กลางของคลิป (หน่วย: วินาทีของคลิป 15 วิ) — ใช้ร่วมกันทั้งฉาก 3D, หน้าเว็บจำลอง และฉากโน้ตบุ๊ก
// เพลงตัดช่วง 17.6–32.6 วิ ของ no-radar-slowed.mp3 (~110 BPM, 1 บีต ≈ 0.5455 วิ)
// บีตเข้า (drop) ที่ 19.6 วิของเพลง = 2.063 วิของคลิป  -> หน้าเว็บเริ่มเลื่อนตรงนี้
export const FPS = 30
export const DURATION = 15
export const BEAT = 0.5455
export const DROP = 2.063

// จุดเปลี่ยนฉาก = บีตที่มีกระเดื่องหนัก (วิเคราะห์ด้วย tools/beats.py)
export const TRANS = [2.063, 5.338, 8.6, 10.794]
export const TRANS_DUR = 2 * BEAT // เลื่อนจบภายใน 2 บีต (ลงตรงบีตถัดไปอีกที)
export const END_CARD = 12.977 // การ์ดปิด 2 วิสุดท้าย เข้าตรงบีต
export const SECTION_H = 900
export const SCREEN_W = 1440
export const SCREEN_H = 900

export const SCENES = ['hero', 'field', 'drop', 'studio', 'close']

const clamp01 = (x) => Math.min(1, Math.max(0, x))
// เลื่อนแบบ "ปัดแล้วไหล" — ออกตัวทันทีตรงบีต แล้วค่อยๆ ชะลอ
export const easeScroll = (x) => 1 - Math.pow(1 - clamp01(x), 3)

export function scrollAt(T) {
  let s = 0
  for (const t0 of TRANS) s += SECTION_H * easeScroll((T - t0) / TRANS_DUR)
  return s
}

// ขอบบนของ section i เทียบกับขอบบนจอ (px)
export const sectionTop = (i, T) => i * SECTION_H - scrollAt(T)

// ช่วงเวลาที่ฉาก i ปรากฏบนจอ (ต้อง render เฟรม 3D ช่วงนี้)
export function sceneRange(i) {
  const start = i === 0 ? 0 : TRANS[i - 1]
  const end = i === SCENES.length - 1 ? DURATION : TRANS[i] + TRANS_DUR
  return [start, end]
}

// ฉากที่ถือว่า "อยู่" ตอนนี้ (สำหรับตัวนับ 01/05 และสีเมนู)
export const activeIndex = (T) => Math.min(SCENES.length - 1, Math.round(scrollAt(T) / SECTION_H))

// ความคืบหน้าของการเลื่อนจาก section i ไป i+1 (0..1)
export const transProgress = (i, T) => (i < TRANS.length ? easeScroll((T - TRANS[i]) / TRANS_DUR) : 0)

export const frameCount = Math.round(DURATION * FPS)
export const frameTime = (f) => f / FPS
