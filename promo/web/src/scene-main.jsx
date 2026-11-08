// render ฉาก 3D ทีละเฟรมแบบ deterministic:  scene.html?scene=hero  (เพิ่ม &live ไว้ดูแบบเล่นจริง)
import * as THREE from 'three'
import { Suspense, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, advance, useThree } from '@react-three/fiber'
import { clock } from './three/core.jsx'
import { SCENE_COMPONENTS } from './scenes.jsx'
import { SCENES, sectionTop, sceneRange } from './timeline.js'

const params = new URLSearchParams(location.search)
const name = params.get('scene') || 'hero'
const live = params.has('live')
const W = +(params.get('w') || 1440)
const H = +(params.get('h') || 900)
const idx = SCENES.indexOf(name)
const Scene = SCENE_COMPONENTS[name]

function Ready() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // รอ troika สร้างตัวหนังสือ 3D เสร็จทุกตัว
      while (!window.__texts || window.__texts.synced < window.__texts.mounted) await new Promise((r) => setTimeout(r, 50))
      const [t0] = sceneRange(idx)
      for (let i = 0; i < 3; i++) {
        clock.T = t0
        clock.top = sectionTop(idx, t0)
        advance(performance.now())
        await new Promise((r) => setTimeout(r, 30))
      }
      if (!cancelled) window.__ready = true
    })()
    return () => (cancelled = true)
  }, [gl])
  return null
}

window.__renderAt = async (T) => {
  clock.T = T
  clock.top = sectionTop(idx, T)
  window.__anchors = null
  advance(T * 1000)
  return { anchors: window.__anchors }
}

if (live) {
  const t0 = performance.now()
  const [a, b] = sceneRange(idx)
  const tick = () => {
    const T = a + (((performance.now() - t0) / 1000) % (b - a))
    clock.T = T
    clock.top = sectionTop(idx, T)
    requestAnimationFrame(tick)
  }
  tick()
}

document.getElementById('root').style.width = W + 'px'
document.getElementById('root').style.height = H + 'px'
createRoot(document.getElementById('root')).render(
  <Canvas
    flat
    dpr={1}
    shadows={{ type: THREE.PCFSoftShadowMap }}
    frameloop={live ? 'always' : 'never'}
    gl={{ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', stencil: false }}
    camera={{ fov: 30, near: 0.05, far: 120, position: [0, 0, 3] }}
    style={{ width: W, height: H }}
  >
    <Suspense fallback={null}>
      <Scene />
      <Ready />
    </Suspense>
  </Canvas>
)
