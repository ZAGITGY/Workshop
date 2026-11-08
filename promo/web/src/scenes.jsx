// 5 ฉากของหน้าเว็บจำลอง MOK STUDIO (แต่ละฉาก render แยก แล้วไปซ้อนเป็น section ที่เลื่อนได้ใน page.html)
import * as THREE from 'three'
import { useMemo, useRef, forwardRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, ContactShadows, useGLTF } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette, DepthOfField, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { clock, Shirt, BigText, STUDIO_HDR, EnvIntensity, smooth, lerp, BASE, DRACO, cottonMaterial } from './three/core.jsx'
import { makeBeamTexture, makeJerseyNormal } from './three/textures.js'
import { TRANS } from './timeline.js'
import { GradientBackdrop, FogSheet } from './three/shaders.jsx'

const FONT_BOLD = BASE + 'fonts/archivo-expanded-800.ttf'

// กล้อง: ตั้งตำแหน่ง + มองเป้า ทุกเฟรม (ก่อน composer render)
function useCamera(fn) {
  const camera = useThree((s) => s.camera)
  useFrame(() => fn(camera, clock.T, clock.top), -1)
}

// parallax ตอนเลื่อน: เนื้อหา 3D ขยับช้ากว่าหน้าเว็บนิดหน่อย ให้รู้สึกมีความลึก
const parallax = (top, k = 0.22) => (-top / 900) * k

const DBG = new URLSearchParams(location.search)

// DOF ที่โฟกัสตามวัตถุทุกเฟรม (ตัว wrapper ของ library ก๊อปปี้ target แค่ตอน mount)
const FollowDOF = forwardRef(function FollowDOF({ target, range, bokehScale }, _) {
  const ref = useRef()
  useFrame(() => {
    if (ref.current && ref.current.target !== target) ref.current.target = target
  })
  return <DepthOfField ref={ref} target={[0, 0, 0]} worldFocusRange={range} bokehScale={bokehScale} height={720} />
})
function Post({ ao = true, dof = null, bloom = 0.22, vignette = 0.7, aoColor = 'black', aoIntensity = 2.2, tone = 'aces' }) {
  if (DBG.has('noao')) ao = false
  if (DBG.has('nodof')) dof = null
  if (DBG.has('nobloom')) bloom = 0
  const mode = (DBG.get('tone') || tone) === 'agx' ? ToneMappingMode.AGX : ToneMappingMode.ACES_FILMIC
  if (DBG.has('nopost')) return null
  return (
    <EffectComposer multisampling={DBG.has('ms') ? +DBG.get('ms') : 4} disableNormalPass>
      {ao ? <N8AO aoRadius={0.12} distanceFalloff={0.6} intensity={aoIntensity} color={aoColor} quality="medium" halfRes={false} /> : <></>}
      {dof ? <FollowDOF target={dof.target} range={dof.range} bokehScale={dof.bokehScale} /> : <></>}
      {bloom > 0 ? <Bloom intensity={bloom} luminanceThreshold={0.86} luminanceSmoothing={0.12} mipmapBlur /> : <></>}
      <Vignette offset={0.28} darkness={vignette} />
      <ToneMapping mode={mode} />
    </EffectComposer>
  )
}

// ============================================================================ 1. HERO
export function Hero() {
  const shirt = useRef()
  useCamera((cam, T, top) => {
    const push = smooth(0, 2.4, T)
    cam.fov = 30
    cam.position.set(0.05 - push * 0.05, 0.03 + parallax(top), 2.5 - push * 0.2)
    cam.lookAt(0, 0.0 + parallax(top) * 0.6, 0)
    cam.updateProjectionMatrix()
  })
  useFrame(() => {
    const T = clock.T
    shirt.current.position.y = 0.02 * Math.sin(T * 1.5)
    shirt.current.rotation.y = -0.55 + 0.16 * Math.sin(T * 0.55)
    shirt.current.rotation.z = 0.025 * Math.sin(T * 1.1)
    shirt.current.rotation.x = 0.04
  })
  return (
    <>
      <color attach="background" args={['#030809']} />
      <fog attach="fog" args={['#061012', 3.0, 9]} />
      <Environment files={STUDIO_HDR} />
      <EnvIntensity value={0.16} rotationY={0.6} />
      <GradientBackdrop inner="#123334" outer="#020607" center={[0.5, 0.52]} radius={0.62} position={[0, 0.2, -6]} scale={[22, 13, 1]} />
      <BigText font={FONT_BOLD} fit={3.9} position={[0, 0.06, -2.3]} letterSpacing={0.02}>
        MOK
        <meshBasicMaterial color="#1f4c4d" fog toneMapped={false} />
      </BigText>
      <FogSheet position={[0, -0.25, -1.6]} scale={[7, 3.2, 1]} color="#7db3b0" opacity={0.26} seed={1} speed={[0.03, 0.004]} />
      <FogSheet position={[0.4, 0.3, -1.0]} scale={[6, 2.6, 1]} color="#6aa3a2" opacity={0.14} seed={2} speed={[-0.025, 0.003]} />
      <FogSheet position={[0, -0.62, 0.5]} scale={[5, 1.5, 1]} color="#8cc0bd" opacity={0.12} seed={3} speed={[0.02, 0.0]} />
      <group ref={shirt}>
        <Shirt color="#f2f1ed" position={[0, 0, 0]} />
      </group>
      <directionalLight position={[-2.8, 1.9, 1.3]} intensity={3.2} color="#fff3e6" castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003} shadow-normalBias={0.015}
        shadow-camera-left={-0.8} shadow-camera-right={0.8} shadow-camera-top={0.8} shadow-camera-bottom={-0.8} />
      <directionalLight position={[2.6, 1.6, -2.4]} intensity={3.6} color="#d9efed" />
      <directionalLight position={[-2.4, -0.5, -2]} intensity={0.7} color="#b5dcda" />
      <directionalLight position={[1.5, -0.4, 2.5]} intensity={0.25} color="#cfe9e8" />
      <Post bloom={0.3} vignette={0.75} />
    </>
  )
}

// ============================================================================ 2. ทุ่งผ้า
// ภูมิประเทศเป็น "ผืนผ้ายักษ์" ยับเป็นลอนเหมือนเนินเขา (สันลอนคม ร่องมน แบบรอยพับผ้า)
function fabricHeight(x, z) {
  const wx = x + 1.7 * Math.sin(z * 0.17 + 1.3) + 0.6 * Math.sin(z * 0.41 + x * 0.13)
  const wz = z + 1.2 * Math.sin(x * 0.21 + 0.4)
  const crest = (s) => 0.5 - Math.abs(Math.sin(s)) // สันแหลมแบบรอยพับ
  let h = 0
  h += 0.55 * Math.sin(wx * 0.33 + wz * 0.12)            // เนินใหญ่
  h += 0.42 * crest(wx * 0.55 + wz * 0.2 + 0.3)
  h += 0.26 * crest(wx * 0.37 - wz * 0.52 + 2.1)
  h += 0.12 * crest(wx * 1.15 + wz * 0.71 + 0.7)
  h += 0.05 * crest(wx * 2.6 - wz * 1.3 + 4.2)
  return h
}
const lowHeight = (x, z) => {
  let s = 0
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) s += fabricHeight(x + i * 0.7, z + j * 0.7)
  return s / 25
}

const fieldPath = (T) => {
  const t = T - TRANS[0]
  return { x: 0.3 * Math.sin(t * 0.35), z: 9 - 1.15 * t }
}
const GROUND = -0.6, FIELD_Z = -14
let camY = 0

function FabricField() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(44, 64, 330, 480)
    g.rotateX(-Math.PI / 2)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) p.setY(i, fabricHeight(p.getX(i), p.getZ(i) - FIELD_Z))
    g.computeVertexNormals()
    return g
  }, [])
  const mat = useMemo(() => {
    const n = makeJerseyNormal(512, 8, 10)
    n.repeat.set(44 / 0.9, 64 / 0.9) // ผ้ายักษ์: ลายถัก 1 แผ่น = 0.9 หน่วย
    return new THREE.MeshPhysicalMaterial({
      color: '#1b2526', roughness: 0.86, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color('#6d9c99'),
      normalMap: n, normalScale: new THREE.Vector2(0.45, 0.45),
    })
  }, [])
  return <mesh geometry={geo} material={mat} position={[0, GROUND, FIELD_Z]} receiveShadow />
}

export function Field() {
  const shirt = useRef()
  const spot = useRef()
  const tgt = useMemo(() => new THREE.Object3D(), [])
  const focus = useMemo(() => new THREE.Vector3(), [])
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useCamera((cam, T, top) => {
    const p = fieldPath(T)
    const y = lowHeight(p.x, p.z - FIELD_Z) + GROUND + 0.5
    cam.fov = 34
    // ตอนเลื่อนเข้า กล้องค่อยๆ ลดลงมาจากที่สูง (ไม่มุดใต้ผืนผ้า)
    camY = y + parallax(top, -0.3)
    cam.position.set(p.x, camY, p.z)
    cam.lookAt(p.x * 0.5, camY - 0.12, p.z - 4)
    cam.rotateZ(0.04 * Math.sin((T - 2) * 0.7))
    cam.updateProjectionMatrix()
  })
  useFrame(() => {
    const T = clock.T
    const t = T - TRANS[0]
    const p = fieldPath(T)
    // เสื้อลอยผ่านจากขวาไปซ้าย ช้ากว่ากล้องนิดหน่อย -> กล้องค่อยๆ แซงผ่าน
    const k = smooth(-1.2, 4.6, t)
    const x = lerp(0.9, -0.42, k)
    const z = p.z - lerp(3.4, 2.7, k)
    const y = camY + 0.1 + 0.035 * Math.sin(T * 1.4)
    shirt.current.position.set(x, y, z)
    shirt.current.rotation.set(0.05, -0.9 + t * 0.32, 0.06 * Math.sin(T * 0.9))
    focus.copy(shirt.current.position)
    spot.current.position.set(x - 1.9, y + 1.0, z + 1.2)
    tgt.position.copy(shirt.current.position)
    tgt.updateMatrixWorld()
    // จุดยึด callout -> พิกัดบนจอ
    const proj = (lx, ly, lz) => {
      const v = new THREE.Vector3(lx, ly, lz).applyMatrix4(shirt.current.matrixWorld).project(camera)
      return [Math.round((v.x * 0.5 + 0.5) * size.width), Math.round((-v.y * 0.5 + 0.5) * size.height)]
    }
    shirt.current.updateMatrixWorld()
    window.__anchors = { chest: proj(0.06, 0.06, 0.13), collar: proj(-0.02, 0.33, 0.05), hem: proj(0.15, -0.3, 0.12) }
  })
  return (
    <>
      <color attach="background" args={['#081315']} />
      <fogExp2 attach="fog" args={['#081416', 0.1]} />
      <Environment files={STUDIO_HDR} />
      <EnvIntensity value={0.14} rotationY={2.2} />
      <FabricField />
      <group ref={shirt}>
        <Shirt color="#f2f1ed" />
      </group>
      <primitive object={tgt} />
      {/* แสงย้อนต่ำๆ จากด้านหน้า ให้สันลอนผ้าสว่างเป็นขอบ */}
      <directionalLight position={[3.5, 1.1, -8]} intensity={2.6} color="#b4dedb" />
      <directionalLight position={[-4, 2.5, 3]} intensity={0.25} color="#e8f2f0" />
      <spotLight ref={spot} target={tgt} angle={0.3} penumbra={0.8} intensity={11} decay={2} distance={0} color="#fff4e9" />
      <hemisphereLight args={['#3f6b6c', '#020405', 0.12]} />
      <Post dof={{ target: focus, range: 1.6, bokehScale: 4 }} bloom={0.28} vignette={0.8} />
    </>
  )
}

// ============================================================================ 3. DROP 01 (สว่าง)
export function Drop() {
  const a = useRef()
  const b = useRef()
  useCamera((cam, T, top) => {
    const t = T - TRANS[1]
    cam.fov = 30
    cam.position.set(0.12 - 0.1 * smooth(0, 4, t), 0.06 + parallax(top), 2.75 - 0.18 * smooth(0, 4, t))
    cam.lookAt(0, 0.0 + parallax(top) * 0.5, 0)
    cam.updateProjectionMatrix()
  })
  useFrame(() => {
    const T = clock.T
    a.current.position.set(-0.45, -0.07 + 0.022 * Math.sin(T * 1.4), 0.12)
    a.current.rotation.set(0.05, 0.42 + 0.12 * Math.sin(T * 0.5), 0.05)
    b.current.position.set(0.47, -0.13 + 0.022 * Math.sin(T * 1.4 + 1.7), -0.12)
    b.current.rotation.set(0.03, -0.5 + 0.12 * Math.sin(T * 0.5 + 1), -0.06)
  })
  return (
    <>
      <color attach="background" args={['#f1efe9']} />
      <Environment files={STUDIO_HDR} />
      <EnvIntensity value={0.42} rotationY={-0.4} />
      <BigText font={FONT_BOLD} fit={3.6} position={[0, 0.25, -1.25]} letterSpacing={-0.01}>
        DROP 01
        <meshBasicMaterial color="#cdc9c0" toneMapped={false} />
      </BigText>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.62, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshBasicMaterial color="#f1efe9" toneMapped={false} />
      </mesh>
      <ContactShadows position={[0, -0.615, 0]} scale={4} resolution={1024} blur={2.6} far={1.2} opacity={0.42} color="#4d4a43" />
      <group ref={a} scale={0.86}>
        <Shirt color="#18191b" />
      </group>
      <group ref={b} scale={0.86}>
        <Shirt color="#6b7a55" />
      </group>
      <directionalLight position={[-2.5, 3, 3]} intensity={1.7} color="#fffaf2" castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003} shadow-normalBias={0.015}
        shadow-camera-left={-1.2} shadow-camera-right={1.2} shadow-camera-top={1} shadow-camera-bottom={-1} />
      <directionalLight position={[2.6, 2, -2.2]} intensity={1.4} color="#ffffff" />
      <Post bloom={0.08} vignette={0.22} aoIntensity={1.6} aoColor="#3a362f" />
    </>
  )
}

// ============================================================================ 4. สตูดิโอ
const PED_R = 0.3, PED_H = 0.55
export function Studio() {
  const focus = useMemo(() => new THREE.Vector3(0, PED_H + 0.05, 0), [])
  const beamTex = useMemo(() => makeBeamTexture(), [])
  const spotTarget = useMemo(() => { const o = new THREE.Object3D(); o.position.set(0, PED_H * 0.6, 0); return o }, [])
  const { scene: drapedScene } = useGLTF(BASE + 'models/tshirt-draped.glb', DRACO)
  const draped = useMemo(() => {
    const s = drapedScene.clone(true)
    s.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.material = cottonMaterial('#efeeea', o.material.name === 'rib' ? 'rib' : 'cotton') } })
    return s
  }, [drapedScene])
  useCamera((cam, T, top) => {
    const t = T - TRANS[2]
    const az = lerp(-0.45, -0.15, smooth(-0.5, 3.6, t))
    const r = 2.05 - 0.15 * smooth(0, 3.5, t)
    cam.fov = 32
    cam.position.set(Math.sin(az) * r, 1.18 + parallax(top, 0.3), Math.cos(az) * r)
    cam.lookAt(0, 0.46 + parallax(top, 0.3) * 0.5, 0)
    cam.updateProjectionMatrix()
  })
  return (
    <>
      <color attach="background" args={['#0b0c0d']} />
      <fog attach="fog" args={['#0b0c0d', 3.5, 10]} />
      <Environment files={STUDIO_HDR} />
      <EnvIntensity value={0.07} />
      {/* ห้อง: พื้น + ผนังโค้ง (cyclorama) สีเทาเข้ม */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color="#1f2022" roughness={0.62} />
      </mesh>
      <mesh position={[0, 0, 0]} receiveShadow>
        <cylinderGeometry args={[6, 6, 10, 128, 1, true]} />
        <meshStandardMaterial color="#1a1b1d" roughness={0.9} side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, PED_H / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[PED_R, PED_R, PED_H, 128]} />
        <meshStandardMaterial color="#3a3b3e" roughness={0.55} />
      </mesh>
      <primitive object={draped} position={[0, PED_H, 0]} />
      <primitive object={spotTarget} />
      <spotLight position={[0.25, 4.4, 0.55]} target={spotTarget} angle={0.22} penumbra={0.5} intensity={70} decay={2} distance={0}
        color="#fff6ec" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0002} shadow-normalBias={0.02} />
      {/* ลำแสงจางๆ (ไม่มีจุดขาวที่ต้นแสง) */}
      <mesh position={[0.12, 2.3, 0.27]} rotation={[0, 0, 0]} renderOrder={3}>
        <cylinderGeometry args={[0.05, 0.8, 4.0, 64, 1, true]} />
        <meshBasicMaterial map={beamTex} color="#fff4e6" transparent opacity={0.035} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} fog={false} toneMapped={false} />
      </mesh>
      <directionalLight position={[-2.5, 2.2, -3]} intensity={0.9} color="#c9d6df" />
      <directionalLight position={[2.8, 0.8, -2.5]} intensity={0.6} color="#d8e2ea" />
      <directionalLight position={[-1.2, 0.9, 2.5]} intensity={0.18} color="#e9eef2" />
      <ContactShadows position={[0, 0.002, 0]} scale={3} resolution={1024} blur={2.2} far={0.6} opacity={0.65} color="#000000" />
      <Post dof={{ target: focus, range: 1.4, bokehScale: 3 }} bloom={0.3} vignette={0.85} aoIntensity={2.4} />
    </>
  )
}
useGLTF.preload(BASE + 'models/tshirt-draped.glb', DRACO)

// ============================================================================ 5. ปิดท้าย
export function Close() {
  const shirt = useRef()
  useCamera((cam, T, top) => {
    const t = T - TRANS[3]
    cam.fov = 30
    cam.position.set(0, 0.04 + parallax(top), 2.9 - 0.25 * smooth(0, 4, t))
    cam.lookAt(0, 0.02 + parallax(top) * 0.6, 0)
    cam.updateProjectionMatrix()
  })
  useFrame(() => {
    const T = clock.T
    shirt.current.position.y = 0.09 + 0.018 * Math.sin(T * 1.5)
    shirt.current.rotation.y = 0.9 - (T - TRANS[3]) * 0.42
    shirt.current.rotation.x = 0.05
  })
  return (
    <>
      <color attach="background" args={['#050c0d']} />
      <fog attach="fog" args={['#061012', 3.2, 9]} />
      <Environment files={STUDIO_HDR} />
      <EnvIntensity value={0.2} rotationY={1.2} />
      <GradientBackdrop inner="#113030" outer="#020607" center={[0.5, 0.45]} radius={0.6} position={[0, 0.1, -6]} scale={[22, 13, 1]} />
      <FogSheet position={[0.2, -0.5, -1.3]} scale={[7, 2.8, 1]} color="#7db3b0" opacity={0.36} seed={4} speed={[0.03, 0.003]} />
      <FogSheet position={[-0.5, 0.35, -0.9]} scale={[6, 2.4, 1]} color="#6aa3a2" opacity={0.2} seed={5} speed={[-0.025, 0.002]} />
      <group ref={shirt} scale={0.78}>
        <Shirt color="#f2f1ed" />
      </group>
      <directionalLight position={[-2.2, 2.4, 2.6]} intensity={1.6} color="#fff3e6" castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003} shadow-normalBias={0.015}
        shadow-camera-left={-0.8} shadow-camera-right={0.8} shadow-camera-top={0.8} shadow-camera-bottom={-0.8} />
      <directionalLight position={[2.6, 1.6, -2.4]} intensity={5} color="#c6f0ef" />
      <directionalLight position={[-2.6, 1.2, -2.2]} intensity={3} color="#c6f0ef" />
      <hemisphereLight args={['#6c9d9c', '#05090a', 0.2]} />
      <Post bloom={0.32} vignette={0.8} />
    </>
  )
}

export const SCENE_COMPONENTS = { hero: Hero, field: Field, drop: Drop, studio: Studio, close: Close }
