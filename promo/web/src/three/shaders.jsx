// พื้นหลังไล่เฉด + หมอก ทำใน shader (ไม่มีลายเส้นจาก dithering ของ canvas)
import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { clock } from './core.jsx'

const NOISE = /* glsl */ `
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
`

export function GradientBackdrop({ inner, outer, center = [0.5, 0.5], radius = 0.75, ...props }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uIn: { value: new THREE.Color(inner) }, uOut: { value: new THREE.Color(outer) }, uC: { value: new THREE.Vector2(...center) }, uR: { value: radius }, uAspect: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: NOISE + `
      uniform vec3 uIn, uOut; uniform vec2 uC; uniform float uR, uAspect; varying vec2 vUv;
      void main(){
        vec2 d = (vUv - uC) * vec2(uAspect, 1.0);
        float t = smoothstep(0.0, uR, length(d));
        vec3 c = mix(uIn, uOut, t);
        c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;   // dither ละเอียดระดับพิกเซล
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    depthWrite: false,
  }), [inner, outer, center, radius])
  const s = props.scale || [1, 1, 1]
  mat.uniforms.uAspect.value = s[0] / s[1]
  return (
    <mesh {...props} material={mat} renderOrder={-1}>
      <planeGeometry />
    </mesh>
  )
}

// หมอกนุ่มๆ เคลื่อนช้าๆ ตามเวลาเสมือน
export function FogSheet({ color = '#7fb3b1', opacity = 0.3, speed = [0.02, 0.006], scaleNoise = 2.2, seed = 0, ...props }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uT: { value: 0 }, uSpeed: { value: new THREE.Vector2(...speed) }, uScale: { value: scaleNoise }, uSeed: { value: seed } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: NOISE + `
      uniform vec3 uColor; uniform float uOpacity, uT, uScale, uSeed; uniform vec2 uSpeed; varying vec2 vUv;
      void main(){
        vec2 p = vUv * vec2(uScale * 1.8, uScale) + vec2(uSeed * 7.13, uSeed * 3.71) + uSpeed * uT * 10.0;
        float n = fbm(p + 0.6 * vec2(fbm(p * 0.7 + uT * 0.05), fbm(p * 0.7 - uT * 0.04)));
        float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
        float a = smoothstep(0.35, 0.85, n) * edge * uOpacity;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  }), [color, opacity, speed[0], speed[1], scaleNoise, seed])
  useFrame(() => { mat.uniforms.uT.value = clock.T })
  return (
    <mesh {...props} material={mat} renderOrder={2}>
      <planeGeometry />
    </mesh>
  )
}
