import { useEffect, useRef } from "react"
import * as THREE from "three"
import { useTheme } from "@/shared/theme/ThemeProvider"

/**
 * Hero background: a calm 3D field of soft points laid on a floor plane that
 * gently undulates — a "data surface breathing". Real perspective depth (so it
 * reads as 3D), but low-contrast and non-glaring: soft round dots at low
 * opacity, distant points fading to nothing (no hard horizon line, no bloom).
 *
 * Performance/robustness contract:
 *  - ~2.7k points, one draw call, GPU-side wave; pixelRatio capped at 1.5
 *  - paused via IntersectionObserver off-screen + when tab hidden
 *  - skipped on prefers-reduced-motion / missing WebGL → CSS poster shows
 *  - all GPU resources disposed on unmount
 */

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uNear;
  uniform float uFar;
  varying float vFade;
  void main(){
    vec3 p = position;
    float wave = sin(p.x * 0.24 + uTime * 0.55) * 1.15
               + cos(p.z * 0.30 + uTime * 0.42) * 1.15
               + sin((p.x + p.z) * 0.12 + uTime * 0.30) * 0.6;
    p.y += wave;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = -mv.z;
    gl_PointSize = uSize * (16.0 / dist);
    // fade distant points to zero (soft horizon) and the very nearest too
    vFade = smoothstep(uFar, uFar * 0.42, dist) * smoothstep(uNear, uNear + 6.0, dist);
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float circle = smoothstep(0.5, 0.16, length(c));
    float a = circle * vFade * uOpacity;
    if (a < 0.012) discard;
    gl_FragColor = vec4(uColor, a);
  }
`

const THEME_UNIFORMS = {
  dark: { color: new THREE.Color(0.36, 0.56, 1.0), opacity: 0.5 },
  light: { color: new THREE.Color(0.15, 0.36, 0.86), opacity: 0.34 },
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas")
    return !!(c.getContext("webgl2") || c.getContext("webgl"))
  } catch {
    return false
  }
}

export function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const matRef = useRef<THREE.ShaderMaterial | null>(null)
  const { theme } = useTheme()

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const canvas = canvasRef.current
    if (reduce || !canvas || !hasWebGL()) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: true,
        stencil: false,
        depth: false,
        powerPreference: "low-power",
      })
    } catch {
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.setClearAlpha(0)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200)
    camera.position.set(0, 7.2, 19)
    camera.lookAt(0, 0.5, -4)

    // build the floor grid of points (XZ plane), centered
    const COLS = 64
    const ROWS = 46
    const SPAN_X = 52
    const SPAN_Z = 46
    const positions = new Float32Array(COLS * ROWS * 3)
    let i = 0
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        positions[i++] = (c / (COLS - 1) - 0.5) * SPAN_X
        positions[i++] = 0
        positions[i++] = (r / (ROWS - 1) - 0.5) * SPAN_Z - 6
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))

    const initial = THEME_UNIFORMS.dark
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 7 },
        uNear: { value: 6 },
        uFar: { value: 58 },
        uColor: { value: initial.color.clone() },
        uOpacity: { value: initial.opacity },
      },
    })
    matRef.current = material
    const points = new THREE.Points(geo, material)
    scene.add(points)

    const resize = () => {
      const parent = canvas.parentElement
      const w = parent?.clientWidth || window.innerWidth
      const h = parent?.clientHeight || window.innerHeight
      renderer.setSize(w, h, false)
      camera.aspect = w / Math.max(h, 1)
      camera.updateProjectionMatrix()
    }
    resize()
    window.addEventListener("resize", resize)

    // gentle pointer parallax (subtle, lerped)
    const pointer = { x: 0, y: 0 }
    const onPointer = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth - 0.5) * 2
      pointer.y = (e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener("pointermove", onPointer, { passive: true })

    let raf = 0
    let visible = true
    const clock = new THREE.Clock()
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!visible || document.hidden) return
      material.uniforms.uTime.value = clock.getElapsedTime()
      camera.position.x += (pointer.x * 1.6 - camera.position.x) * 0.03
      camera.position.y += (7.2 - pointer.y * 0.8 - camera.position.y) * 0.03
      camera.lookAt(0, 0.5, -4)
      renderer.render(scene, camera)
    }
    loop()

    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0 })
    io.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener("resize", resize)
      window.removeEventListener("pointermove", onPointer)
      geo.dispose()
      material.dispose()
      renderer.dispose()
      matRef.current = null
    }
  }, [])

  // re-theme uniforms without rebuilding the scene
  useEffect(() => {
    const m = matRef.current
    if (!m) return
    const t = THEME_UNIFORMS[theme] ?? THEME_UNIFORMS.dark
    ;(m.uniforms.uColor.value as THREE.Color).copy(t.color)
    m.uniforms.uOpacity.value = t.opacity
  }, [theme])

  return <canvas ref={canvasRef} aria-hidden="true" />
}
