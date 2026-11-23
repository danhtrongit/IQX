import * as THREE from "three"

import {
  disposeObject3D,
  logicalToWorld,
  worldToLogical,
  type LogicalPoint2D,
  type ProjectedPoint,
  type WorldTransformConfig,
} from "./types.ts"

export interface ChibiSceneHostOptions {
  container: HTMLElement
  world: WorldTransformConfig
  backgroundHex?: number
  fov?: number
  pitchDeg?: number
  baseDistance?: number
  minZoom?: number
  maxZoom?: number
  initialZoom?: number
  lite?: boolean
  shadows?: boolean
  cameraLerp?: number
  boundsMargin?: number
  northMargin?: number
  southMargin?: number
  onContextLost?: () => void
  onContextRestored?: () => void
  onResize?: (width: number, height: number, dpr: number) => void
}

export interface ChibiSceneLights {
  hemi: THREE.HemisphereLight
  sun: THREE.DirectionalLight
  rim: THREE.DirectionalLight
}

export interface CameraClampParams {
  roomW: number
  roomH: number
  baseDistance: number
  zoom: number
  fovDeg: number
  pitchRad: number
  aspect: number
  boundsMargin: number
  northMargin?: number
  southMargin?: number
}

export interface CameraClampResult {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  northSpan: number
  southSpan: number
  targetPlaneHalfVisX: number
  nearHalfVisX: number
  farHalfVisX: number
  minFillZoom: number
}

/**
 * Computes asymmetric ground-plane frustum bounds for a pitched PerspectiveCamera:
 * - Horizontal clamping uses a comfortable inner room inset so edge stations (Desk #1,
 *   Lounge Sofa, Achievement Standee, Reception, Hall of Fame) always project cleanly inside
 *   the viewport instead of getting sliced at screen edges, and smoothly centers on X when
 *   zoomed out enough for the room to fit horizontally.
 * - Vertical clamping preserves North wall/board framing and South bottom-HUD clearance,
 *   smoothly centering vertically when the room fits inside the viewport.
 */
export function computeCameraClampBounds(
  params: CameraClampParams
): CameraClampResult {
  const { roomW, roomH, baseDistance, fovDeg, pitchRad, boundsMargin } = params
  const safeAspect = Math.max(0.25, params.aspect)
  const safeZoom = Math.max(0.1, params.zoom)
  const halfFovRad = (fovDeg * Math.PI) / 360
  const topAngle = Math.max(0.15, pitchRad - halfFovRad)
  const botAngle = Math.min(Math.PI / 2 - 0.05, pitchRad + halfFovRad)

  const sinPitch = Math.sin(pitchRad)
  const cosPitch = Math.cos(pitchRad)
  const northCoeff = sinPitch / Math.tan(topAngle) - cosPitch
  const southCoeff = cosPitch - sinPitch / Math.tan(botAngle)
  const targetHalfXCoeff = Math.tan(halfFovRad) * safeAspect
  const farHalfXCoeff =
    (sinPitch / Math.sin(topAngle)) * Math.sin(halfFovRad) * safeAspect
  const nearHalfXCoeff =
    (sinPitch / Math.sin(botAngle)) * Math.sin(halfFovRad) * safeAspect

  const northMargin = params.northMargin ?? Math.max(boundsMargin, 2.2)
  const southMargin = params.southMargin ?? Math.max(boundsMargin, 1.1)

  const zSpanBudget = Math.max(1, roomH + northMargin + southMargin)
  const xSpanBudget = Math.max(1, roomW)
  const minFillZoomZ = ((northCoeff + southCoeff) * baseDistance) / zSpanBudget
  const minFillZoomX = (2 * targetHalfXCoeff * baseDistance) / xSpanBudget
  const minFillZoom = Math.max(minFillZoomZ, minFillZoomX)

  const dist = baseDistance / safeZoom
  const northSpan = dist * northCoeff
  const southSpan = dist * southCoeff
  const targetPlaneHalfVisX = dist * targetHalfXCoeff
  const farHalfVisX = dist * farHalfXCoeff
  const nearHalfVisX = dist * nearHalfXCoeff

  // Blend smoothly from a comfortable 0.60x inner inset at normal zoom to centered (0)
  // whenever the zoomed-out room width fits inside the viewport.
  const halfRoomW = roomW / 2
  const fillRatioX = targetPlaneHalfVisX / Math.max(1, halfRoomW)
  const insetFactor =
    fillRatioX >= 1
      ? 1
      : 0.6 + 0.4 * Math.pow(Math.max(0, (fillRatioX - 0.68) / 0.32), 2)
  const halfXLimit =
    fillRatioX >= 1
      ? 0
      : Math.max(0, halfRoomW - targetPlaneHalfVisX * insetFactor)

  const rawMinZ = -roomH / 2 + Math.max(0, northSpan - northMargin)
  const rawMaxZ = roomH / 2 - Math.max(0, southSpan - southMargin)
  const minZ = rawMinZ > rawMaxZ ? (rawMinZ + rawMaxZ) / 2 : rawMinZ
  const maxZ = rawMinZ > rawMaxZ ? minZ : rawMaxZ

  return {
    minX: halfXLimit === 0 ? 0 : -halfXLimit,
    maxX: halfXLimit,
    minZ,
    maxZ,
    northSpan,
    southSpan,
    targetPlaneHalfVisX,
    nearHalfVisX,
    farHalfVisX,
    minFillZoom,
  }
}

export interface ChibiSceneHost {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  readonly world: WorldTransformConfig
  readonly lights: ChibiSceneLights
  readonly lite: boolean
  followLogical: (lx: number, ly: number, instant?: boolean) => void
  setWorldSize: (logicalW: number, logicalH: number) => void
  /** Alias for `setWorldSize` for callers referencing dynamic room dimensions. */
  setWorldDimensions: (logicalW: number, logicalH: number) => void
  setZoom: (zoom: number, instant?: boolean) => void
  getZoom: () => number
  getTargetZoom: () => number
  setCameraShake: (offsetX: number, offsetY: number, offsetZ?: number) => void
  setPaused: (paused: boolean) => void
  isPaused: () => boolean
  isContextLost: () => boolean
  getClampBounds: (zoom?: number) => CameraClampResult
  getViewportSize: () => { width: number; height: number; dpr: number }
  screenToLogical: (clientX: number, clientY: number) => LogicalPoint2D | null
  pickObjects: (
    clientX: number,
    clientY: number,
    objects: THREE.Object3D[]
  ) => THREE.Intersection[]
  projectToScreen: (wx: number, wy: number, wz: number) => ProjectedPoint
  projectLogicalToScreen: (
    lx: number,
    ly: number,
    heightWorld?: number
  ) => ProjectedPoint
  start: (onFrame: (dt: number, elapsed: number) => void) => void
  renderOnce: () => void
  resize: () => void
  dispose: () => void
}

export function detectLiteDevice(): boolean {
  if (typeof window === "undefined") return false
  const hasMatch = typeof window.matchMedia === "function"
  const coarse = hasMatch && window.matchMedia("(pointer: coarse)").matches
  const touchOnly =
    hasMatch &&
    window.matchMedia("(hover: none)").matches &&
    typeof navigator !== "undefined" &&
    navigator.maxTouchPoints > 0
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return coarse || touchOnly || (typeof mem === "number" && mem <= 4)
}

function detectSoftwareWebGL(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext()
    const ext = gl.getExtension("WEBGL_debug_renderer_info")
    if (!ext) return false
    const info = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "")
    return /\b(swiftshader|llvmpipe|softpipe|mesa offscreen)\b/i.test(info)
  } catch {
    return false
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * Shared Three.js viewport host for Trading Floor and Office:
 * manages studio chibi lighting, high-angle follow camera with asymmetric perspective room-bound clamping,
 * smooth zoom, dynamic room resizing, accurate ground-plane raycasting, 3D→CSS projection, ResizeObserver,
 * pause/resume support, WebGL context loss/restore, and full GPU disposal.
 */
export function createChibiSceneHost(
  opts: ChibiSceneHostOptions
): ChibiSceneHost {
  const { container } = opts
  const world: WorldTransformConfig = { ...opts.world }
  const lite = opts.lite ?? detectLiteDevice()
  const fov = opts.fov ?? 34
  const pitchRad = ((opts.pitchDeg ?? 52) * Math.PI) / 180
  let roomW = world.logicalW * world.scale
  let roomH = world.logicalH * world.scale
  const baseDistance = opts.baseDistance ?? Math.max(12, Math.min(roomW, roomH) * 0.78)
  const minZoom = opts.minZoom ?? 0.6
  const maxZoom = opts.maxZoom ?? 2.4
  const cameraLerp = opts.cameraLerp ?? 0.15
  const boundsMargin = opts.boundsMargin ?? 0.5
  const northMargin = opts.northMargin
  const southMargin = opts.southMargin
  const maxDpr = lite ? 1.5 : 2

  const renderer = new THREE.WebGLRenderer({
    antialias: !lite,
    powerPreference: lite ? "default" : "high-performance",
  })
  const softwareWebGL = detectSoftwareWebGL(renderer)
  // Lite mode uses contact/blob shadows by default to avoid Safari iOS WebGL memory pressure;
  // callers explicitly enabling shadows in lite mode get a compact 512px shadow map.
  const shadows = (opts.shadows ?? !lite) && !softwareWebGL
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.AgXToneMapping
  renderer.toneMappingExposure = 1.08
  renderer.shadowMap.enabled = shadows
  renderer.shadowMap.type = THREE.PCFShadowMap

  const dom = renderer.domElement
  dom.style.width = "100%"
  dom.style.height = "100%"
  dom.style.display = "block"
  dom.style.touchAction = "none"
  container.appendChild(dom)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(opts.backgroundHex ?? 0x192030)

  const camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.2, 220)

  // Studio-warm 3-point + hemisphere chibi lighting rig with tight following shadow camera
  const hemi = new THREE.HemisphereLight(0xfff7ea, 0x6d6156, 1.06)
  hemi.position.set(0, 24, 0)
  scene.add(hemi)

  const shadowMapSize = lite ? 512 : 2048
  const sunOffset = new THREE.Vector3(9.5, 19.5, 11.0)
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.82)
  sun.position.copy(sunOffset)
  sun.castShadow = shadows
  let lastShadowExtent = clamp(Math.max(roomW, roomH) * 0.48, 9, 22)
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize)
  sun.shadow.camera.near = 2
  sun.shadow.camera.far = Math.max(64, roomW + roomH + 16)
  sun.shadow.camera.left = -lastShadowExtent
  sun.shadow.camera.right = lastShadowExtent
  sun.shadow.camera.top = lastShadowExtent
  sun.shadow.camera.bottom = -lastShadowExtent
  sun.shadow.bias = -0.00035
  sun.shadow.normalBias = 0.022
  sun.shadow.radius = lite ? 1.4 : 2.6
  scene.add(sun)
  scene.add(sun.target)

  const rim = new THREE.DirectionalLight(0xc6deff, 0.64)
  rim.position.set(-roomW * 0.42, 13, -roomH * 0.48)
  scene.add(rim)

  const lights: ChibiSceneLights = { hemi, sun, rim }

  let cssW = Math.max(1, container.clientWidth || window.innerWidth || 1280)
  let cssH = Math.max(1, container.clientHeight || window.innerHeight || 720)
  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr)

  let currentZoom = clamp(opts.initialZoom ?? 1.0, minZoom, maxZoom)
  let targetZoom = currentZoom
  let desiredX = 0
  let desiredZ = 0
  let currentX = 0
  let currentZ = 0
  let shakeX = 0
  let shakeY = 0
  let shakeZ = 0

  let disposed = false
  let contextLost = false
  let paused = false
  let rafId = 0
  let started = false
  let frameCallback: ((dt: number, elapsedS: number) => void) | null = null
  let lastFrameMs = 0
  let elapsed = 0

  const raycaster = new THREE.Raycaster()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const ndcVec = new THREE.Vector2()
  const hitVec = new THREE.Vector3()
  const projVec = new THREE.Vector3()

  const getClampBounds = (zoom = currentZoom): CameraClampResult =>
    computeCameraClampBounds({
      roomW,
      roomH,
      baseDistance,
      zoom,
      fovDeg: fov,
      pitchRad,
      aspect: cssW / Math.max(1, cssH),
      boundsMargin,
      northMargin,
      southMargin,
    })

  const clampCameraTarget = (
    tx: number,
    tz: number,
    zoom: number
  ): { x: number; z: number } => {
    const bounds = getClampBounds(zoom)
    return {
      x: clamp(tx, bounds.minX, bounds.maxX),
      z: clamp(tz, bounds.minZ, bounds.maxZ),
    }
  }

  const updateShadowCamera = (bounds: CameraClampResult): void => {
    if (!shadows) return
    const visHalfX =
      Math.max(bounds.targetPlaneHalfVisX, bounds.farHalfVisX) + 2.0
    const visHalfZ = (bounds.northSpan + bounds.southSpan) * 0.54 + 2.5
    const desiredExtent = clamp(
      Math.max(visHalfX, visHalfZ),
      8.5,
      Math.max(roomW, roomH) * 0.6
    )
    // Snap light target to shadow-map texel increments to prevent edge shimmer while walking
    const texelSize = (desiredExtent * 2) / shadowMapSize
    const focusZ = currentZ - (bounds.northSpan - bounds.southSpan) * 0.16
    const snappedX = Math.round(currentX / texelSize) * texelSize
    const snappedZ = Math.round(focusZ / texelSize) * texelSize

    sun.target.position.set(snappedX, 0, snappedZ)
    sun.position.set(
      snappedX + sunOffset.x,
      sunOffset.y,
      snappedZ + sunOffset.z
    )
    sun.target.updateMatrixWorld()

    if (Math.abs(desiredExtent - lastShadowExtent) > 0.25) {
      lastShadowExtent = desiredExtent
      sun.shadow.camera.left = -desiredExtent
      sun.shadow.camera.right = desiredExtent
      sun.shadow.camera.top = desiredExtent
      sun.shadow.camera.bottom = -desiredExtent
      sun.shadow.camera.updateProjectionMatrix()
    }
  }

  const applyCameraTransform = (): void => {
    currentZoom = clamp(currentZoom, minZoom, maxZoom)
    targetZoom = clamp(targetZoom, minZoom, maxZoom)
    const dist = baseDistance / currentZoom
    const bounds = getClampBounds(currentZoom)
    currentX = clamp(currentX, bounds.minX, bounds.maxX)
    currentZ = clamp(currentZ, bounds.minZ, bounds.maxZ)

    const camY = dist * Math.sin(pitchRad)
    const camZ = currentZ + dist * Math.cos(pitchRad)
    camera.position.set(currentX + shakeX, camY + shakeY, camZ + shakeZ)
    camera.lookAt(currentX + shakeX, 0, currentZ + shakeZ)
    camera.updateMatrixWorld()
    updateShadowCamera(bounds)
  }

  const setWorldSize = (logicalW: number, logicalH: number): void => {
    if (
      disposed ||
      !Number.isFinite(logicalW) ||
      !Number.isFinite(logicalH) ||
      logicalW <= 0 ||
      logicalH <= 0
    ) {
      return
    }
    world.logicalW = logicalW
    world.logicalH = logicalH
    roomW = world.logicalW * world.scale
    roomH = world.logicalH * world.scale

    sun.shadow.camera.far = Math.max(64, roomW + roomH + 16)
    lastShadowExtent = -1
    rim.position.set(-roomW * 0.42, 13, -roomH * 0.48)

    applyCameraTransform()
    if (paused && !contextLost) {
      renderer.render(scene, camera)
    }
  }

  const resize = (): void => {
    if (disposed) return
    const nextW = container.clientWidth
    const nextH = container.clientHeight
    if (nextW > 0 && nextH > 0) {
      cssW = nextW
      cssH = nextH
    }
    dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
    renderer.setPixelRatio(dpr)
    renderer.setSize(cssW, cssH, false)
    camera.aspect = cssW / Math.max(1, cssH)
    camera.updateProjectionMatrix()
    applyCameraTransform()
    if (paused && !contextLost) {
      renderer.render(scene, camera)
    }
    opts.onResize?.(cssW, cssH, dpr)
  }

  const onWindowResize = (): void => resize()
  const onContextLost = (e: Event): void => {
    e.preventDefault()
    contextLost = true
    if (rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    opts.onContextLost?.()
  }
  const onContextRestored = (): void => {
    contextLost = false
    resize()
    if (started && !paused && !disposed && rafId === 0) {
      lastFrameMs = performance.now()
      rafId = requestAnimationFrame(loop)
    }
    opts.onContextRestored?.()
  }

  let resizeObserver: ResizeObserver | null = null
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => resize())
    resizeObserver.observe(container)
  }
  window.addEventListener("resize", onWindowResize)
  dom.addEventListener("webglcontextlost", onContextLost)
  dom.addEventListener("webglcontextrestored", onContextRestored)

  resize()

  const followLogical = (lx: number, ly: number, instant = false): void => {
    const pt = logicalToWorld(lx, ly, world)
    desiredX = pt.x
    desiredZ = pt.z
    if (instant) {
      const clamped = clampCameraTarget(desiredX, desiredZ, targetZoom)
      currentX = clamped.x
      currentZ = clamped.z
      applyCameraTransform()
    }
  }

  const setZoom = (zoom: number, instant = false): void => {
    const clampedZoom = clamp(
      Number.isFinite(zoom) ? zoom : currentZoom,
      minZoom,
      maxZoom
    )
    targetZoom = clampedZoom
    if (instant) {
      currentZoom = clampedZoom
      applyCameraTransform()
    }
  }

  const updateRaycasterFromClient = (
    clientX: number,
    clientY: number
  ): boolean => {
    const rect = dom.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    ndcVec.x = ((clientX - rect.left) / rect.width) * 2 - 1
    ndcVec.y = -((clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(ndcVec, camera)
    return true
  }

  const screenToLogical = (
    clientX: number,
    clientY: number
  ): LogicalPoint2D | null => {
    if (!updateRaycasterFromClient(clientX, clientY)) return null
    const hit = raycaster.ray.intersectPlane(groundPlane, hitVec)
    if (!hit) return null
    return worldToLogical(hit.x, hit.z, world)
  }

  const pickObjects = (
    clientX: number,
    clientY: number,
    objects: THREE.Object3D[]
  ): THREE.Intersection[] => {
    if (!objects.length || !updateRaycasterFromClient(clientX, clientY)) {
      return []
    }
    return raycaster.intersectObjects(objects, true)
  }

  const projectToScreen = (
    wx: number,
    wy: number,
    wz: number
  ): ProjectedPoint => {
    projVec.set(wx, wy, wz).project(camera)
    const x = (projVec.x * 0.5 + 0.5) * cssW
    const y = (-projVec.y * 0.5 + 0.5) * cssH
    const visible =
      projVec.z >= -1 &&
      projVec.z <= 1 &&
      x >= -120 &&
      x <= cssW + 120 &&
      y >= -120 &&
      y <= cssH + 120
    return { x, y, visible, depth: projVec.z }
  }

  const projectLogicalToScreen = (
    lx: number,
    ly: number,
    heightWorld = 0
  ): ProjectedPoint => {
    const pt = logicalToWorld(lx, ly, world)
    return projectToScreen(pt.x, heightWorld, pt.z)
  }

  const renderOnce = (): void => {
    if (disposed || contextLost) return
    applyCameraTransform()
    renderer.render(scene, camera)
  }

  const loop = (now: number): void => {
    if (disposed || paused) {
      rafId = 0
      return
    }
    rafId = requestAnimationFrame(loop)
    const dt = Math.min(0.05, Math.max(0, (now - lastFrameMs) / 1000))
    lastFrameMs = now
    elapsed += dt

    // Frame-rate independent smooth zoom & follow lerp
    const stepFactor = 1 - Math.pow(1 - cameraLerp, dt * 60)
    currentZoom += (targetZoom - currentZoom) * stepFactor
    const clampedDesired = clampCameraTarget(desiredX, desiredZ, currentZoom)
    currentX += (clampedDesired.x - currentX) * stepFactor
    currentZ += (clampedDesired.z - currentZ) * stepFactor
    applyCameraTransform()

    frameCallback?.(dt, elapsed)

    if (!contextLost) {
      renderer.render(scene, camera)
    }
  }

  const setPaused = (nextPaused: boolean): void => {
    if (disposed || paused === nextPaused) return
    paused = nextPaused
    if (paused) {
      if (rafId !== 0) {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
    } else if (started && rafId === 0) {
      lastFrameMs = performance.now()
      rafId = requestAnimationFrame(loop)
    }
  }

  const start = (onFrame: (dt: number, elapsedS: number) => void): void => {
    if (disposed || started) return
    started = true
    frameCallback = onFrame
    lastFrameMs = performance.now()
    if (!paused) {
      rafId = requestAnimationFrame(loop)
    }
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    if (rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    frameCallback = null
    resizeObserver?.disconnect()
    window.removeEventListener("resize", onWindowResize)
    dom.removeEventListener("webglcontextlost", onContextLost)
    dom.removeEventListener("webglcontextrestored", onContextRestored)
    disposeObject3D(scene)
    renderer.dispose()
    try {
      renderer.forceContextLoss()
    } catch {
      // Headless or mocked WebGL contexts may not expose WEBGL_lose_context.
    }
    if (dom.parentNode === container) {
      container.removeChild(dom)
    }
  }

  return {
    scene,
    camera,
    renderer,
    world,
    lights,
    lite,
    followLogical,
    setWorldSize,
    setWorldDimensions: setWorldSize,
    setZoom,
    getZoom: () => currentZoom,
    getTargetZoom: () => targetZoom,
    setCameraShake: (ox, oy, oz = 0) => {
      shakeX = ox
      shakeY = oy
      shakeZ = oz
    },
    setPaused,
    isPaused: () => paused,
    isContextLost: () => contextLost,
    getClampBounds,
    getViewportSize: () => ({ width: cssW, height: cssH, dpr }),
    screenToLogical,
    pickObjects,
    projectToScreen,
    projectLogicalToScreen,
    start,
    renderOnce,
    resize,
    dispose,
  }
}
