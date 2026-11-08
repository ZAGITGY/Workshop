// หน้าเว็บจำลอง MOK STUDIO: ซ้อนเฟรม 3D ของแต่ละฉากเป็น section แล้ว "เลื่อน" ตามไทม์ไลน์ (deterministic)
//   page.html?frames=/frames/   -> ใช้เฟรมจาก .frames/<scene>/NNNNN.jpg
//   window.__setTime(T)         -> จัดหน้าให้ตรงกับวินาที T ของคลิป แล้วรอรูปโหลดเสร็จ
import './page.css'
import { scrollAt, sectionTop, SCENES, TRANS, FPS, DURATION, SECTION_H } from './timeline.js'

const params = new URLSearchParams(location.search)
const FRAMES = params.get('frames') || '/frames/'
const pad = (n) => String(n).padStart(5, '0')
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3)

document.body.innerHTML = `
<div id="viewport">
  <div id="track">
    <section class="sec dark" data-i="0">
      <img class="bg" alt="" />
      <div class="ov">
        <div class="hero-meta rv" data-d="0.55">
          <div class="eyebrow">SS27 / ESSENTIALS</div>
          <div class="price">เริ่ม 590.-</div>
        </div>
        <div class="hero-copy">
          <div class="eyebrow rv" data-d="0.1"><b>MOK STUDIO</b><span class="th">เสื้อยืดคอตตอน 240 แกรม</span></div>
          <h1 class="h1"><div class="rv" data-d="0.22">ผ้าดี</div><div class="rv" data-d="0.34">ไม่ต้องตะโกน</div></h1>
          <p class="body rv" data-d="0.5">เสื้อยืดเรียบๆ ที่ตัดเย็บอย่างตั้งใจ ผ้าหนาแต่ใส่สบาย<br/>ทรงสวยตั้งแต่ซักครั้งแรกจนครั้งที่ร้อย</p>
        </div>
        <div class="scroll-cue rv" data-d="0.8">SCROLL<i></i></div>
      </div>
    </section>

    <section class="sec dark" data-i="1">
      <img class="bg" alt="" />
      <div class="ov">
        <div class="field-copy">
          <div class="eyebrow rv" data-d="0.05"><b>01</b><span class="th">วัสดุ</span></div>
          <h2 class="h2"><div class="rv" data-d="0.14">ทอจากเส้นใยยาว</div><div class="rv" data-d="0.24">นุ่มขึ้นทุกครั้งที่ซัก</div></h2>
          <p class="body rv" data-d="0.38">คอตตอนหวีละเอียด ทอแบบซิงเกิลเจอร์ซีย์ ผิวเนียน ไม่เป็นขุย ระบายอากาศดีในอากาศบ้านเรา</p>
        </div>
        <svg class="callouts" viewBox="0 0 1440 900"></svg>
        <div class="co" data-co="chest"><div class="t">คอตตอน 100%</div><div class="s">COMBED COTTON</div></div>
        <div class="co left" data-co="collar"><div class="t">คอยางยืดริบ 1×1</div><div class="s">ไม่ย้วยแม้ซักบ่อย</div></div>
      </div>
    </section>

    <section class="sec light" data-i="2">
      <img class="bg" alt="" />
      <div class="ov">
        <div class="drop-top rv" data-d="0.05" data-out="6.98"><div class="eyebrow"><b>02</b><span class="th">คอลเลกชันใหม่</span></div></div>
        <div class="spec l rv" data-d="0.15" data-out="6.98"><div class="tick"></div><div class="num">240<small>GSM</small></div><div class="lab">น้ำหนักผ้า<br/>หนา อยู่ทรง ไม่บาง</div></div>
        <div class="spec r rv" data-d="0.25" data-out="6.98"><div class="tick"></div><div class="num">S–XL</div><div class="lab">4 ไซซ์<br/>ทรงตรง ใส่ได้ทุกคน</div></div>
        <div class="swatch rv" data-d="0.35" data-out="6.98" style="left:440px"><i style="background:#1b1c1e"></i>INK</div>
        <div class="swatch rv" data-d="0.42" data-out="6.98" style="left:1010px"><i style="background:#6b7a55"></i>SAGE</div>
        <div class="drop-bottom rv" data-d="0.5" data-out="6.98">ผลิตจำนวนจำกัด 300 ตัวต่อสี</div>
        <div class="macro rv" data-at="7.6"><div class="eyebrow"><b>DETAIL</b><span class="th">ซูมดูเนื้อผ้า</span></div><div class="macro-t">ลายถักซิงเกิลเจอร์ซีย์แน่น<br/>คอริบ 1×1 เย็บตะเข็บคู่</div></div>
      </div>
    </section>

    <section class="sec dark" data-i="3">
      <img class="bg" alt="" />
      <div class="ov">
        <div class="studio-copy">
          <div class="eyebrow rv" data-d="0.05"><b>03</b><span class="th">สตูดิโอ</span></div>
          <h2 class="h2"><div class="rv" data-d="0.14">มาจับเนื้อผ้า</div><div class="rv" data-d="0.24">ของจริงที่สตูดิโอ</div></h2>
          <p class="body rv" data-d="0.38">ลองได้ทุกไซซ์ทุกสี ไม่ต้องนัดล่วงหน้า</p>
        </div>
        <div class="studio-side">
          <div class="row rv" data-d="0.3"><span>เปิด</span><b>ทุกวัน 11:00–20:00</b></div>
          <div class="row rv" data-d="0.38"><span>ลองชุด</span><b>ฟรี ทุกไซซ์</b></div>
          <div class="row rv" data-d="0.46"><span>เปลี่ยนไซซ์</span><b>ภายใน 14 วัน</b></div>
        </div>
      </div>
    </section>

    <section class="sec dark" data-i="4">
      <img class="bg" alt="" />
      <div class="ov">
        <div class="close-copy">
          <div class="mega"><div class="rv" data-d="0.1">WEAR IT QUIET</div></div>
          <p class="body rv" data-d="0.3">เสื้อยืดที่ใส่ได้ทุกวัน โดยไม่ต้องพยายาม</p>
        </div>
        <div class="cta">
          <div class="btn solid rv" data-d="0.42"><span>สั่งซื้อทาง LINE</span><span class="dot">→</span></div>
          <div class="btn ghost rv" data-d="0.5">ดูตารางไซซ์</div>
        </div>
        <div class="foot rv" data-d="0.6">MOK STUDIO — BANGKOK</div>
      </div>
    </section>
  </div>

  <header class="nav">
    <div class="brand">MOK STUDIO</div>
    <nav class="links"><span data-n="0">คอลเลกชัน<i></i></span><span data-n="1">วัสดุ<i></i></span><span data-n="2">DROP 01<i></i></span><span data-n="3">สตูดิโอ<i></i></span></nav>
    <div class="right"><span>ค้นหา</span><span class="cart">ตะกร้า (0)</span></div>
  </header>
  <div class="navline"></div>
  <div class="rail"><i></i></div>
  <div class="counter"><span class="roll"><span class="digits"><b>01</b><b>02</b><b>03</b><b>04</b><b>05</b></span></span><span class="bar"><i></i></span><span>05</span></div>
</div>`

const track = document.getElementById('track')
const secs = [...document.querySelectorAll('.sec')]
secs.forEach((s, i) => (s.style.top = i * SECTION_H + 'px'))
const imgs = secs.map((s) => s.querySelector('img.bg'))
const rvs = secs.map((s) => [...s.querySelectorAll('.rv')])
const digits = document.querySelector('.counter .digits')
const bar = document.querySelector('.counter .bar i')
const railThumb = document.querySelector('.rail i')
const links = [...document.querySelectorAll('.nav .links span')]
const svg = document.querySelector('svg.callouts')
const coEls = { chest: document.querySelector('[data-co="chest"]'), collar: document.querySelector('[data-co="collar"]') }

// เวลาที่แต่ละ section "มาถึง" (ข้อความค่อยๆ ขึ้นหลังจากนี้)
const ARRIVE = [0.15, TRANS[0] + 0.12, TRANS[1] + 0.12, TRANS[2] + 0.12, TRANS[3] + 0.12]

let anchors = null
async function loadAnchors() {
  try {
    const r = await fetch(FRAMES + 'field/anchors.json')
    anchors = await r.json()
  } catch (e) { anchors = {} }
}

function reveal(el, tA, T) {
  const d = parseFloat(el.dataset.d || 0)
  let e = el.dataset.at ? easeOut((T - parseFloat(el.dataset.at)) / 0.8) : easeOut((tA - d) / 0.8)
  const o = el.dataset.out ? e * (1 - easeOut((T - parseFloat(el.dataset.out)) / 0.35)) : e
  el.style.opacity = o.toFixed(3)
  el.style.transform = `translateY(${((1 - e) * 26).toFixed(2)}px)`
}

function drawCallouts(f, tA) {
  const a = anchors && (anchors[f] || anchors[Object.keys(anchors).reduce((best, k) => (Math.abs(k - f) < Math.abs(best - f) ? k : best), Object.keys(anchors)[0])])
  if (!a) return
  const grow = easeOut((tA - 0.45) / 0.7)
  const show = easeOut((tA - 0.75) / 0.6)
  const paths = []
  const place = (key, anchor, dx, dy, side) => {
    const [ax, ay] = anchor
    const ex = ax + dx * 0.55, ey = ay + dy
    const lx = ax + dx, ly = ey
    const len = Math.hypot(ex - ax, ey - ay) + Math.abs(lx - ex)
    paths.push(`<circle cx="${ax}" cy="${ay}" r="4.5" fill="none" stroke="rgba(238,243,242,0.9)" stroke-width="1.2" opacity="${grow.toFixed(3)}"/>`)
    paths.push(`<circle cx="${ax}" cy="${ay}" r="1.6" fill="rgba(238,243,242,0.95)" opacity="${grow.toFixed(3)}"/>`)
    paths.push(`<path d="M${ax} ${ay} L${ex} ${ey} L${lx} ${ly}" fill="none" stroke="rgba(238,243,242,0.75)" stroke-width="1" stroke-dasharray="${len}" stroke-dashoffset="${(len * (1 - grow)).toFixed(1)}"/>`)
    const el = coEls[key]
    el.style.opacity = show.toFixed(3)
    if (side === 'r') { el.style.left = lx + 14 + 'px'; el.style.right = 'auto' } else { el.style.left = 'auto'; el.style.right = 1440 - lx + 14 + 'px' }
    el.style.top = ly - 13 + 'px'
    el.style.transform = `translateX(${((1 - show) * (side === 'r' ? -10 : 10)).toFixed(1)}px)`
  }
  place('chest', a.chest, 240, 78, 'r')
  place('collar', a.collar, 200, -46, 'r')
  svg.innerHTML = paths.join('')
}

async function setTime(T) {
  const f = Math.round(T * FPS)
  const S = scrollAt(T)
  track.style.transform = `translate3d(0, ${(-S).toFixed(2)}px, 0)`
  const waits = []
  secs.forEach((sec, i) => {
    const top = sectionTop(i, T)
    const visible = top > -SECTION_H + 0.5 && top < SECTION_H - 0.5
    sec.style.visibility = visible ? 'visible' : 'hidden'
    if (visible) {
      const src = `${FRAMES}${SCENES[i]}/${pad(f)}.jpg`
      if (!imgs[i].src.endsWith(src)) {
        imgs[i].src = src
        waits.push(imgs[i].decode().catch(() => console.warn('missing frame', src)))
      }
      const tA = T - ARRIVE[i]
      for (const el of rvs[i]) reveal(el, tA, T)
      if (i === 1) drawCallouts(f, tA)
    }
  })
  // ตัวนับ 01/05 หมุนตามระยะเลื่อน
  const prog = S / SECTION_H
  digits.style.transform = `translateY(${(-16 * prog).toFixed(2)}px)`
  bar.style.width = ((prog / 4) * 100).toFixed(2) + '%'
  railThumb.style.top = ((prog / 4) * (180 - 36)).toFixed(2) + 'px'
  const linkIdx = Math.min(3, Math.round(prog))
  links.forEach((l, i) => {
    const on = i === linkIdx && prog < 3.5
    l.classList.toggle('on', on)
    const u = l.querySelector('i')
    const k = on ? 1 - Math.min(1, Math.abs(prog - i) * 2) : 0
    u.style.transform = `scaleX(${Math.max(0, k).toFixed(3)})`
  })
  await Promise.all(waits)
}

window.__setTime = setTime
;(async () => {
  await loadAnchors()
  await document.fonts.ready
  await setTime(0)
  window.__ready = true
  if (params.has('live')) {
    const t0 = performance.now()
    const loop = async () => {
      await setTime(((performance.now() - t0) / 1000) % DURATION)
      requestAnimationFrame(loop)
    }
    loop()
  }
})()
