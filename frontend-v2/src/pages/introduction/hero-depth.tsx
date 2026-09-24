import { useEffect, useRef, type RefObject } from "react"
import { canUseHeroDepth, sceneryCover, textureClassForTheme, type HeroDepthTheme } from "./hero-depth-engine"

type HeroDepthProps = {
  theme: HeroDepthTheme
  hostRef: RefObject<HTMLElement | null>
}

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// The lake is on the left of the source painting. Both the image-coordinate
// shoreline and a blue-water color key keep trees, rock and mountains still.
const fragmentShader = `
  uniform sampler2D uScene;
  uniform vec4 uCover;
  uniform vec2 uPointer;
  uniform float uTime;
  uniform float uStrength;
  varying vec2 vUv;

  void main() {
    vec2 imageTop = uCover.xy + vec2(vUv.x, 1.0 - vUv.y) * uCover.zw;
    float shore = mix(0.67, 0.79, smoothstep(0.12, 0.56, imageTop.x));
    float area = smoothstep(0.07, 0.12, imageTop.x)
      * (1.0 - smoothstep(0.51, 0.58, imageTop.x))
      * smoothstep(shore, shore + 0.025, imageTop.y)
      * (1.0 - smoothstep(0.92, 0.98, imageTop.y));
    vec2 source = vec2(imageTop.x, 1.0 - imageTop.y);
    vec3 original = texture2D(uScene, source).rgb;
    float waterColor = smoothstep(0.015, 0.09, original.b - original.r)
      * smoothstep(-0.08, 0.025, original.g - original.r);
    float mask = area * waterColor * uStrength;
    if (mask < 0.001) discard;

    vec2 delta = imageTop - uPointer;
    float distanceToTouch = length(delta * vec2(1.0, 1.6));
    float ripple = sin(distanceToTouch * 95.0 - uTime * 8.0)
      * exp(-distanceToTouch * 7.0);
    float flow = sin(imageTop.x * 71.0 + imageTop.y * 37.0 + uTime * 3.0);
    vec2 displacement = vec2(flow * 0.0012 + ripple * 0.0018, ripple * 0.0013);
    vec3 water = texture2D(uScene, source + displacement).rgb;
    water += vec3(0.014, 0.023, 0.028) * max(0.0, flow * 0.5 + ripple * 0.5);
    gl_FragColor = vec4(water, mask);
  }
`

export function HeroDepth({ theme, hostRef }: HeroDepthProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas || typeof window === "undefined" || !canUseHeroDepth(window as unknown as Parameters<typeof canUseHeroDepth>[0])) return
    const image = host.querySelector<HTMLImageElement>(`.${textureClassForTheme(theme)}`)
    if (!image?.currentSrc && !image?.src) return

    let disposed = false
    let visible = true
    let contextLost = false
    let hovered = false
    let frame = 0
    let lastFrame = 0
    let strength = 0
    let renderer: import("three").WebGLRenderer | undefined
    let scene: import("three").Scene | undefined
    let camera: import("three").OrthographicCamera | undefined
    let geometry: import("three").PlaneGeometry | undefined
    let material: import("three").ShaderMaterial | undefined
    let texture: import("three").Texture | undefined
    let resizeObserver: ResizeObserver | undefined

    const setReady = (ready: boolean) => {
      canvas.dataset.ready = String(ready)
      host.classList.toggle("hero-depth-ready", ready)
      if (ready) host.dispatchEvent(new CustomEvent("hero-depth-ready"))
    }
    const canRender = () => !disposed && !contextLost && visible && !document.hidden && !reducedMotion.matches
    const cancelFrame = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
      lastFrame = 0
    }
    const tick = (now: number) => {
      frame = 0
      if (!canRender() || !renderer || !scene || !camera || !material) return
      const elapsed = lastFrame ? Math.min(64, now - lastFrame) : 16
      lastFrame = now
      strength = hovered ? Math.min(1, strength + elapsed / 220) : Math.max(0, strength - elapsed / 500)
      material.uniforms.uStrength.value = strength
      material.uniforms.uTime.value += elapsed / 1000
      renderer.render(scene, camera)
      if (hovered || strength > 0) frame = window.requestAnimationFrame(tick)
      else lastFrame = 0
    }
    const requestRender = () => {
      if (!frame && canRender()) frame = window.requestAnimationFrame(tick)
    }
    const resize = () => {
      if (!renderer || !material || !texture?.image) return
      const rect = host.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      renderer.setSize(rect.width, rect.height, false)
      const crop = sceneryCover(texture.image as { width: number; height: number }, rect)
      material.uniforms.uCover.value.set(crop.left, crop.top, crop.visibleWidth, crop.visibleHeight)
      requestRender()
    }
    const pointer = (event: PointerEvent) => {
      if (!material) return
      const rect = host.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const crop = material.uniforms.uCover.value as import("three").Vector4
      const sourceX = crop.x + (event.clientX - rect.left) / rect.width * crop.z
      const sourceY = crop.y + (event.clientY - rect.top) / rect.height * crop.w
      material.uniforms.uPointer.value.set(
        Math.max(0.15, Math.min(0.48, sourceX)),
        Math.max(0.74, Math.min(0.87, sourceY)),
      )
      hovered = true
      requestRender()
    }
    const leave = () => { hovered = false; requestRender() }
    const visibility = () => {
      if (document.hidden) cancelFrame()
      else requestRender()
    }
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (!visible) cancelFrame()
      else requestRender()
    })
    const lostContext = (event: Event) => {
      event.preventDefault()
      contextLost = true
      cancelFrame()
      setReady(false)
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const motionChange = () => {
      if (reducedMotion.matches) {
        hovered = false
        strength = 0
        cancelFrame()
        setReady(false)
      } else if (!contextLost) {
        setReady(true)
        requestRender()
      }
    }

    const start = async () => {
      try {
        const THREE = await import("three")
        if (disposed) return
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" })
        renderer.setClearAlpha(0)
        scene = new THREE.Scene()
        camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
        camera.position.z = 2
        geometry = new THREE.PlaneGeometry(2, 2)
        material = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          vertexShader,
          fragmentShader,
          uniforms: {
            uScene: { value: null },
            uCover: { value: new THREE.Vector4(0, 0, 1, 1) },
            uPointer: { value: new THREE.Vector2(0.3, 0.8) },
            uTime: { value: 0 },
            uStrength: { value: 0 },
          },
        })
        scene.add(new THREE.Mesh(geometry, material))
        const loaded = await new THREE.TextureLoader().loadAsync(image.currentSrc || image.src)
        if (disposed) { loaded.dispose(); return }
        texture = loaded
        texture.colorSpace = THREE.SRGBColorSpace
        texture.minFilter = THREE.LinearFilter
        material.uniforms.uScene.value = texture
        canvas.addEventListener("webglcontextlost", lostContext, { passive: false })
        host.addEventListener("pointerenter", pointer, { passive: true })
        host.addEventListener("pointermove", pointer, { passive: true })
        host.addEventListener("pointerleave", leave, { passive: true })
        document.addEventListener("visibilitychange", visibility)
        reducedMotion.addEventListener("change", motionChange)
        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(host)
        intersection.observe(host)
        resize()
        setReady(!reducedMotion.matches)
      } catch {
        setReady(false)
      }
    }
    void start()

    return () => {
      disposed = true
      cancelFrame()
      canvas.removeEventListener("webglcontextlost", lostContext)
      host.removeEventListener("pointerenter", pointer)
      host.removeEventListener("pointermove", pointer)
      host.removeEventListener("pointerleave", leave)
      document.removeEventListener("visibilitychange", visibility)
      reducedMotion.removeEventListener("change", motionChange)
      intersection.disconnect()
      resizeObserver?.disconnect()
      texture?.dispose()
      geometry?.dispose()
      material?.dispose()
      renderer?.dispose()
      setReady(false)
    }
  }, [hostRef, theme])

  return <canvas ref={canvasRef} className="hero-depth-canvas" aria-hidden="true" />
}
