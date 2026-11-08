// ของใช้ร่วมกันของทุกฉาก: นาฬิกาเสมือน, เสื้อ, วัสดุผ้า, ตัวหนังสือ 3D, ไฟ environment
import * as THREE from 'three'
import { useMemo, useRef, useEffect } from 'react'
import { useGLTF, Text } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { makeJerseyNormal, makeRibNormal } from './textures.js'

// เวลาเสมือน (วินาทีของคลิป) — ตั้งจาก __renderAt ทุกเฟรม ไม่ใช้นาฬิกาจริง
export const clock = { T: 0, top: 0 }
export const BASE = import.meta.env.BASE_URL
export const DRACO = BASE + 'draco/'

// ----------------------------------------------------------------------------- วัสดุผ้าฝ้าย
const UV_METERS = 1.15 // 1 หน่วย UV ของตัวเสื้อ = ผ้า 1.15 ม. (ตั้งไว้ในสคริปต์ Blender)
let jersey, rib
function sharedTextures() {
  if (!jersey) {
    jersey = makeJerseyNormal(512)
    jersey.repeat.set(UV_METERS / 0.02, UV_METERS / 0.02) // 1 แผ่น = 2 ซม.
    rib = makeRibNormal(256)
    rib.repeat.set(100, 100) // UV ของคอเสื้อเป็นเมตร, 1 แผ่น = 1 ซม.
  }
  return { jersey, rib }
}

const matCache = new Map()
export function cottonMaterial(color, kind = 'cotton', opts = {}) {
  const key = `${color}|${kind}|${JSON.stringify(opts)}`
  if (matCache.has(key)) return matCache.get(key)
  const { jersey, rib } = sharedTextures()
  const c = new THREE.Color(color)
  // sheen สีเดียวกับผ้า สว่างขึ้นนิดเดียว (ถ้าใช้สีขาว ผ้าสีเข้มจะดูซีดเป็นเทา)
  const sheen = c.clone().lerp(new THREE.Color('#ffffff'), c.getHSL({}).l > 0.6 ? 0.3 : 0.06)
  const m = new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: kind === 'rib' ? 0.88 : 0.85,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.8,
    sheenColor: sheen,
    normalMap: kind === 'rib' ? rib : jersey,
    normalScale: new THREE.Vector2(kind === 'rib' ? 0.9 : 0.55, kind === 'rib' ? 0.9 : 0.55),
    envMapIntensity: 1,
    ...opts,
  })
  m.name = kind
  matCache.set(key, m)
  return m
}

export function Shirt({ url = 'models/tshirt.glb', color = '#f1f0ec', shadows = true, matOpts, ...props }) {
  const { scene } = useGLTF(BASE + url, DRACO)
  const obj = useMemo(() => {
    const s = scene.clone(true)
    s.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = shadows
        o.receiveShadow = shadows
        o.material = cottonMaterial(color, o.material.name === 'rib' ? 'rib' : 'cotton', matOpts)
      }
    })
    return s
  }, [scene, color, shadows, matOpts])
  return <primitive object={obj} {...props} />
}
useGLTF.preload(BASE + 'models/tshirt.glb', DRACO)

// ----------------------------------------------------------------------------- ตัวหนังสือ 3D (troika)
window.__texts = window.__texts || { mounted: 0, synced: 0 }
export function BigText({ children, fit, onFit, ...props }) {
  const ref = useRef()
  const done = useRef(false)
  useEffect(() => {
    window.__texts.mounted++
  }, [])
  return (
    <Text
      ref={ref}
      sdfGlyphSize={128}
      anchorX="center"
      anchorY="middle"
      onSync={(t) => {
        if (fit && t.textRenderInfo) {
          const [x0, , x1] = t.textRenderInfo.blockBounds
          const w = x1 - x0
          const s = fit / w
          t.scale.setScalar(s)
          onFit && onFit(s)
        }
        if (!done.current) {
          done.current = true
          window.__texts.synced++
        }
      }}
      {...props}
    >
      {children}
    </Text>
  )
}

// ----------------------------------------------------------------------------- environment: Environment preset `studio` (ไฟล์เดียวกัน เก็บไว้ในเครื่อง ไม่ต้องโหลดจากเน็ตตอนอัด)
export const STUDIO_HDR = BASE + 'hdri/studio_small_03_1k.hdr'

export function EnvIntensity({ value, rotationY = 0 }) {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    scene.environmentIntensity = value
    scene.environmentRotation = new THREE.Euler(0, rotationY, 0)
  }, [scene, value, rotationY])
  return null
}

export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
export const lerp = (a, b, t) => a + (b - a) * t
