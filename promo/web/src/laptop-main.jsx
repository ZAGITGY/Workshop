// ฉากคลิป 9:16: โน้ตบุ๊กบนโต๊ะเงาสะท้อน แสงมืดแบบ cinematic กล้องค่อยๆ ดันเข้า
// จอโน้ตบุ๊กเล่นหน้าเว็บจำลอง (screen.webm) เป็น video texture — seek ทีละเฟรมแบบ deterministic
//   laptop.html            -> โหมดอัด (window.__renderAt(T))
//   laptop.html?live       -> ดูแบบเล่นจริง
import * as THREE from 'three'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, advance, useFrame, useThree } from '@react-three/fiber'
import { Environment, MeshReflectorMaterial, RoundedBox } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { clock, STUDIO_HDR, EnvIntensity, smooth, lerp, BASE } from './three/core.jsx'
import { GradientBackdrop } from './three/shaders.jsx'
import { FPS, DURATION, END_CARD } from './timeline.js'
import './laptop.css'

RectAreaLightUniformsLib.init()
const params = new URLSearchParams(location.search)
const live = params.has('live')
const W = 1080, H = 1920

// ----------------------------------------------------------------------------- วิดีโอหน้าเว็บ
const video = document.createElement('video')
video.src = BASE + 'screen.webm'
video.muted = true
video.playsInline = true
video.preload = 'auto'
video.crossOrigin = 'anonymous'
const screenTex = new THREE.VideoTexture(video)
screenTex.colorSpace = THREE.SRGBColorSpace
screenTex.minFilter = THREE.LinearMipmapLinearFilter
screenTex.generateMipmaps = true
screenTex.anisotropy = 8
const sampler = document.createElement('canvas')
sampler.width = 16
sampler.height = 10
const sctx = sampler.getContext('2d', { willReadFrequently: true })
const screenAvg = new THREE.Color('#203a3a')
let screenLum = 0.1

function sampleScreen() {
  sctx.drawImage(video, 0, 0, 16, 10)
  const d = sctx.getImageData(0, 0, 16, 10).data
  let r = 0, g = 0, b = 0
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2] }
  const n = d.length / 4
  screenAvg.setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace)
  screenLum = 0.2126 * screenAvg.r + 0.7152 * screenAvg.g + 0.0722 * screenAvg.b
}

async function seekVideo(T) {
  const target = Math.min(video.duration - 0.001, (Math.round(T * FPS) + 0.5) / FPS)
  if (Math.abs(video.currentTime - target) > 1e-4) {
    await new Promise((res) => {
      const done = () => { video.removeEventListener('seeked', done); res() }
      video.addEventListener('seeked', done)
      video.currentTime = target
    })
  }
  if (video.requestVideoFrameCallback) {
    await new Promise((res) => {
      let settled = false
      video.requestVideoFrameCallback(() => { settled = true; res() })
      setTimeout(() => { if (!settled) res() }, 400)
    })
  }
  screenTex.needsUpdate = true
  sampleScreen()
}

// ----------------------------------------------------------------------------- โน้ตบุ๊ก (สร้างเอง)
const LID_W = 0.312, LID_H = 0.214, BASE_D = 0.221, BASE_T = 0.0105
const SCR_W = 0.2864, SCR_H = 0.179 // 16:10 = 1440x900
const LID_OPEN = THREE.MathUtils.degToRad(18) // เอนไปข้างหลังจากแนวตั้ง

function Keys() {
  const ref = useRef()
  const layout = useMemo(() => {
    const keys = []
    const kw = 0.0158, gap = 0.0029, rows = 6
    for (let r = 0; r < rows; r++) {
      const z = -0.083 + r * (kw + gap) * (r === 0 ? 0.62 : 1) + (r > 0 ? -0.006 : 0)
      const h = r === 0 ? kw * 0.55 : kw
      if (r === 5) {
        const widths = [kw, kw, kw * 1.25, kw * 5.6, kw * 1.25, kw, kw * 3.1]
        let x = -0.1365
        for (const w of widths) { keys.push([x + w / 2, z, w, h]); x += w + gap }
      } else {
        const n = r === 0 ? 14 : 13
        const wk = r === 0 ? (0.273 - gap * 13) / 14 : kw
        let x = -0.1365
        for (let i = 0; i < n; i++) {
          let w = wk
          if (r > 0 && i === n - 1) w = 0.273 - (x + 0.1365)
          keys.push([x + w / 2, z, w, h]); x += w + gap
        }
      }
    }
    return keys
  }, [])
  useEffect(() => {
    const m = new THREE.Matrix4()
    layout.forEach(([x, z, w, h], i) => {
      m.compose(new THREE.Vector3(x, BASE_T + 0.0004, z + 0.0105), new THREE.Quaternion(), new THREE.Vector3(w, 0.0011, h))
      ref.current.setMatrixAt(i, m)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [layout])
  return (
    <instancedMesh ref={ref} args={[null, null, layout.length]} castShadow receiveShadow>
      <boxGeometry />
      <meshStandardMaterial color="#121315" roughness={0.55} metalness={0.1} />
    </instancedMesh>
  )
}

function Laptop() {
  const alu = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#36383c', metalness: 0.82, roughness: 0.36, clearcoat: 0.2, clearcoatRoughness: 0.4 }), [])
  return (
    <group>
      {/* ฐาน */}
      <RoundedBox args={[LID_W, BASE_T, BASE_D]} radius={0.0045} smoothness={4} position={[0, BASE_T / 2, 0]} material={alu} castShadow receiveShadow />
      {/* ร่องคีย์บอร์ด */}
      <mesh position={[0, BASE_T + 0.0001, -0.032]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.281, 0.112]} />
        <meshStandardMaterial color="#1a1b1e" roughness={0.7} metalness={0.3} />
      </mesh>
      <Keys />
      {/* แทร็กแพด */}
      <RoundedBox args={[0.128, 0.0004, 0.079]} radius={0.0002} smoothness={2} position={[0, BASE_T + 0.0001, 0.058]}>
        <meshPhysicalMaterial color="#2e3034" metalness={0.6} roughness={0.22} clearcoat={0.6} />
      </RoundedBox>
      {/* ฝาจอ หมุนรอบบานพับด้านหลัง */}
      <group position={[0, BASE_T, -BASE_D / 2 + 0.003]} rotation={[-LID_OPEN, 0, 0]}>
        <RoundedBox args={[LID_W, LID_H, 0.0052]} radius={0.004} smoothness={4} position={[0, LID_H / 2, -0.0026]} material={alu} castShadow />
        {/* ขอบจอสีดำ */}
        <mesh position={[0, LID_H / 2, 0.0001]}>
          <planeGeometry args={[LID_W - 0.006, LID_H - 0.006]} />
          <meshPhysicalMaterial color="#060607" roughness={0.12} metalness={0} clearcoat={1} />
        </mesh>
        {/* จอ: แสดงหน้าเว็บ */}
        <mesh position={[0, LID_H / 2 + 0.0035, 0.0003]}>
          <planeGeometry args={[SCR_W, SCR_H]} />
          <meshBasicMaterial map={screenTex} toneMapped={false} color={[1.12, 1.12, 1.12]} />
        </mesh>
        <ScreenLight />
      </group>
    </group>
  )
}

// แสงจากจอส่องลงคีย์บอร์ด/โต๊ะ ตามสีเฉลี่ยของหน้าเว็บตอนนั้น
function ScreenLight() {
  const ref = useRef()
  useFrame(() => {
    if (!ref.current) return
    ref.current.color.copy(screenAvg).lerp(new THREE.Color('#ffffff'), 0.25)
    ref.current.intensity = 10 + 80 * screenLum
  })
  return <rectAreaLight ref={ref} args={['#ffffff', 10, SCR_W, SCR_H]} position={[0, LID_H / 2 + 0.0035, 0.004]} rotation={[0, 0, 0]} />
}

// ----------------------------------------------------------------------------- กล้อง
function CameraRig() {
  const camera = useThree((s) => s.camera)
  const focus = useMemo(() => new THREE.Vector3(0, 0.1, -0.08), [])
  useFrame(() => {
    const T = clock.T
    const k = smooth(-1.5, DURATION + 1, T) // ดันเข้าช้าๆ ตลอดคลิป
    const d = lerp(1.5, 1.06, k)
    const elev = THREE.MathUtils.degToRad(lerp(13, 10, k))
    const sway = 0.004 * Math.sin(T * 0.7) // มือถือกล้องนิดๆ
    camera.fov = 28
    camera.position.set(0.02 * Math.sin(T * 0.23) + sway, focus.y + d * Math.sin(elev), focus.z + d * Math.cos(elev))
    camera.lookAt(focus.x, focus.y - 0.035, focus.z)
    camera.updateProjectionMatrix()
  }, -1)
  return null
}

function Scene() {
  return (
    <>
      <color attach="background" args={['#050506']} />
      <Environment files={STUDIO_HDR} />
      <EnvIntensity value={0.2} rotationY={1.2} />
      <GradientBackdrop inner="#2a2b2e" outer="#060607" center={[0.5, 0.62]} radius={0.62} position={[0, 0.6, -2.4]} scale={[6, 4, 1]} />
      <Laptop />
      {/* โต๊ะเงาสะท้อน */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.0005, 0]}>
        <planeGeometry args={[8, 8]} />
        <MeshReflectorMaterial blur={[160, 50]} resolution={768} mixBlur={0.75} mixStrength={5} mixContrast={1.05}
          roughness={0.42} depthScale={0.5} minDepthThreshold={0.25} maxDepthThreshold={1.4}
          color="#55575b" metalness={0.25} mirror={0.85} />
      </mesh>
      {/* softbox ด้านบนอ่อนๆ ให้ขอบอะลูมิเนียมมีไฮไลต์ */}
      <rectAreaLight args={['#dfe6ea', 2.4, 1.2, 0.5]} position={[0.35, 1.0, 0.25]} rotation={[-Math.PI / 2.4, 0.3, 0]} />
      <rectAreaLight args={['#b9c7cc', 0.8, 0.6, 0.6]} position={[-0.9, 0.35, -0.6]} rotation={[0, -Math.PI / 1.4, 0]} />
      <CameraRig />
      <EffectComposer multisampling={2} disableNormalPass>
        <Bloom intensity={0.35} luminanceThreshold={0.72} luminanceSmoothing={0.2} mipmapBlur />
        <Vignette offset={0.22} darkness={0.75} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  )
}

// ----------------------------------------------------------------------------- ข้อความบนคลิป + การ์ดปิด (HTML ซ้อนบน canvas)
function Overlay() {
  return (
    <div className="ui">
      <div className="pov">POV: ร้านเสื้อของคุณ<br />มีเว็บแบบนี้ <span className="emoji">😮‍💨</span></div>
      <div className="endcard">
        <div className="scrim" />
        <div className="card">
          <div className="namebox" aria-label="ที่ว่างสำหรับใส่ชื่อร้าน" />
          <div className="l1">รับทำเว็บร้านเสื้อผ้า</div>
          <div className="l2"><span className="pill">ทักแชทได้เลย<span className="arrow">→</span></span></div>
        </div>
      </div>
    </div>
  )
}

const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)
function applyOverlay(T) {
  const e = (d, dur = 0.45) => ease((T - END_CARD - d) / dur)
  const ec = document.querySelector('.endcard')
  if (!ec) return
  ec.style.visibility = T >= END_CARD - 0.01 ? 'visible' : 'hidden'
  ec.querySelector('.scrim').style.opacity = (e(0, 0.35) * 1).toFixed(3)
  const set = (sel, d) => {
    const el = ec.querySelector(sel)
    const v = e(d)
    el.style.opacity = v.toFixed(3)
    el.style.transform = `translateY(${((1 - v) * 34).toFixed(1)}px)`
  }
  set('.l1', 0.08)
  set('.l2', 0.2)
  // POV ขึ้นตั้งแต่เฟรมแรก (เด้งเบาๆ ตอนเริ่ม)
  const pov = document.querySelector('.pov')
  const p = ease(T / 0.35)
  pov.style.opacity = (0.0 + p).toFixed(3)
  pov.style.transform = `translateY(${((1 - p) * 14).toFixed(1)}px)`
}

function Ready() {
  useEffect(() => {
    ;(async () => {
      if (video.readyState < 2) await new Promise((r) => video.addEventListener('loadeddata', r, { once: true }))
      await document.fonts.ready
      await seekVideo(0)
      for (let i = 0; i < 3; i++) { clock.T = 0; advance(performance.now()); await new Promise((r) => setTimeout(r, 30)) }
      window.__ready = true
    })()
  }, [])
  return null
}

window.__renderAt = async (T) => {
  clock.T = T
  await seekVideo(T)
  applyOverlay(T)
  advance(T * 1000)
}

if (live) {
  const t0 = performance.now()
  const loop = async () => {
    const T = ((performance.now() - t0) / 1000) % DURATION
    await window.__renderAt(T)
    requestAnimationFrame(loop)
  }
  window.__startLive = loop
}

const root = document.getElementById('root')
createRoot(root).render(
  <>
    <Canvas
      flat
      dpr={1}
      frameloop="never"
      gl={{ antialias: false, preserveDrawingBuffer: true, stencil: false }}
      camera={{ fov: 28, near: 0.02, far: 30, position: [0, 0.4, 1.4] }}
      style={{ position: 'absolute', inset: 0, width: W, height: H }}
    >
      <Suspense fallback={null}>
        <Scene />
        <Ready />
      </Suspense>
    </Canvas>
    <Overlay />
  </>
)
if (live) {
  const wait = setInterval(() => { if (window.__ready) { clearInterval(wait); window.__startLive() } }, 100)
}
