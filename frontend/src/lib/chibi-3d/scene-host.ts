import * as THREE from "three"

import { restoreStaticTextures } from "./textures.ts"
import {
  SCENE_HOST_BRIDGE_KEY,
  disposeObject3D,
  worldToLogical,
  type ChibiSceneHostBridge,
  type LogicalPoint2D,
  type ProjectedPoint,
  type WorldTransformConfig,
} from "./types.ts"

export type PacingMode = "active" | "idle" | "deep_idle"

export interface AdaptivePacerOptions {
  idleFps?: number
  deepIdleFps?: number
  idleAfterMs?: number
  deepIdleAfterMs?: number
}

export interface AdaptiveFramePacer {
  markActive: (nowMs: number, holdMs?: number) => void
  requestFrame: (nowMs: number) => void
  getMode: (nowMs: number) => PacingMode
  getTargetFps: (nowMs: number) => number
  shouldRender: (nowMs: number) => boolean
  reset: (nowMs: number) => void
}

/**
 * Pure adaptive frame-pacing state machine:
 * - `"active"` (display refresh rate) immediately on input, camera motion, walking, or FX.
 * - `"idle"` (~30 fps desktop / ~20 fps lite) after `idleAfterMs` of stillness.
 * - `"deep_idle"` (~20 fps) after `deepIdleAfterMs` of continuous stillness.
 */
export function createAdaptiveFramePacer(
  opts: AdaptivePacerOptions = {}
): AdaptiveFramePacer {
  const idleFps = Math.max(5, Math.min(60, opts.idleFps ?? 30))
  const deepIdleFps = Math.max(5, Math.min(idleFps, opts.deepIdleFps ?? 20))
  const idleAfterMs = Math.max(100, opts.idleAfterMs ?? 1500)
  const deepIdleAfterMs = Math.max(idleAfterMs, opts.deepIdleAfterMs ?? 8000)

  let lastActivityMs = 0
  let activeUntilMs = idleAfterMs
  let lastRenderMs = -1
  let forceNextFrame = true

  const getMode = (nowMs: number): PacingMode => {
    if (nowMs < activeUntilMs) return "active"
    if (nowMs - lastActivityMs >= deepIdleAfterMs) return "deep_idle"
    return "idle"
  }

  const getTargetFps = (nowMs: number): number => {
    const mode = getMode(nowMs)
    if (mode === "active") return 60
    return mode === "deep_idle" ? deepIdleFps : idleFps
  }

  return {
    markActive: (nowMs: number, holdMs = idleAfterMs) => {
      lastActivityMs = Math.max(lastActivityMs, nowMs)
      activeUntilMs = Math.max(activeUntilMs, nowMs + Math.max(0, holdMs))
      forceNextFrame = true
    },
    requestFrame: (nowMs: number) => {
      lastActivityMs = Math.max(lastActivityMs, nowMs)
      forceNextFrame = true
    },
    getMode,
    getTargetFps,
    shouldRender: (nowMs: number) => {
      if (forceNextFrame || lastRenderMs < 0) {
        forceNextFrame = false
        lastRenderMs = nowMs
        return true
      }
      const mode = getMode(nowMs)
      if (mode === "active") {
        lastRenderMs = nowMs
        return true
      }
      const fps = mode === "deep_idle" ? deepIdleFps : idleFps
      // Subtract 1.5ms jitter margin so 60Hz ticks hit exact 1-in-2 (30fps) / 1-in-3 (20fps) cadence
      const minIntervalMs = Math.max(0, 1000 / fps - 1.5)
      if (nowMs - lastRenderMs >= minIntervalMs) {
        lastRenderMs = nowMs
        return true
      }
      return false
    },
    reset: (nowMs: number) => {
      lastActivityMs = nowMs
      activeUntilMs = nowMs + idleAfterMs
      lastRenderMs = -1
      forceNextFrame = true
    },
  }
}

export interface DynamicResolutionOptions {
  baseDpr: number
  minDpr?: number
  step?: number
  budgetMs?: number
  headroomMs?: number
  downHoldMs?: number
  upHoldMs?: number
}

export interface DynamicResolutionController {
  getDpr: () => number
  getBaseDpr: () => number
  getAvgFrameMs: () => number
  setBaseDpr: (nextBaseDpr: number) => number
  sample: (
    frameTimeMs: number,
    wallDeltaMs: number,
    isActive: boolean
  ) => { changed: boolean; dpr: number }
}

/**
 * Steps pixel ratio down by `0.25` (min `1`) only when average frame time stays above budget
 * continuously for `2 s` in active mode, and steps back up when clear headroom returns —
 * never exceeding `baseDpr`, so fast desktops always remain at full native quality.
 */
export function createDynamicResolutionController(
  opts: DynamicResolutionOptions
): DynamicResolutionController {
  const minDpr = Math.max(1, opts.minDpr ?? 1)
  const step = Math.max(0.1, opts.step ?? 0.25)
  const budgetMs = opts.budgetMs ?? 24
  const headroomMs = opts.headroomMs ?? 18.5
  const downHoldMs = opts.downHoldMs ?? 2000
  const upHoldMs = opts.upHoldMs ?? 3000

  let baseDpr = Math.max(minDpr, opts.baseDpr)
  let currentDpr = baseDpr
  let avgFrameMs = 0
  let overBudgetMs = 0
  let headroomAccumMs = 0

  const snapStep = (v: number): number => Math.round(v / step) * step

  return {
    getDpr: () => currentDpr,
    getBaseDpr: () => baseDpr,
    getAvgFrameMs: () => avgFrameMs,
    setBaseDpr: (nextBaseDpr: number) => {
      baseDpr = Math.max(minDpr, nextBaseDpr)
      currentDpr = baseDpr
      overBudgetMs = 0
      headroomAccumMs = 0
      return currentDpr
    },
    sample: (frameTimeMs: number, wallDeltaMs: number, isActive: boolean) => {
      const safeFrame = Math.max(0, Math.min(200, frameTimeMs))
      avgFrameMs =
        avgFrameMs === 0 ? safeFrame : avgFrameMs * 0.85 + safeFrame * 0.15

      if (!isActive || baseDpr <= minDpr) {
        return { changed: false, dpr: currentDpr }
      }

      const safeWall = Math.max(0, Math.min(250, wallDeltaMs))
      if (avgFrameMs > budgetMs) {
        overBudgetMs += safeWall
        headroomAccumMs = 0
        if (overBudgetMs >= downHoldMs && currentDpr > minDpr) {
          currentDpr = Math.max(minDpr, snapStep(currentDpr - step))
          overBudgetMs = 0
          return { changed: true, dpr: currentDpr }
        }
      } else if (avgFrameMs < headroomMs) {
        headroomAccumMs += safeWall
        overBudgetMs = 0
        if (headroomAccumMs >= upHoldMs && currentDpr < baseDpr) {
          currentDpr = Math.min(baseDpr, snapStep(currentDpr + step))
          headroomAccumMs = 0
          return { changed: true, dpr: currentDpr }
        }
      } else {
        overBudgetMs = Math.max(0, overBudgetMs - safeWall * 0.5)
        headroomAccumMs = Math.max(0, headroomAccumMs - safeWall * 0.5)
      }
      return { changed: false, dpr: currentDpr }
    },
  }
}

export interface SpacePerfStats {
  memory: {
    geometries: number
    textures: number
  }
  render: {
    calls: number
    triangles: number
    points: number
    lines: number
    frame: number
  }
  host: {
    lite: boolean
    paused: boolean
    suspended: boolean
    suspendReasons: string[]
    pacingMode: PacingMode
    targetFps: number
    dpr: number
    baseDpr: number
    shadowAutoUpdate: boolean
    shadowUpdates: number
    renderedFrames: number
    skippedFrames: number
    avgFrameMs: number
  }
}

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
  idleFps?: number
  deepIdleFps?: number
  idleAfterMs?: number
  deepIdleAfterMs?: number
  dynamicResolution?: boolean
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
  /** Ref-counted suspension by named reason (e.g. `"modal"`, `"join"`, `"document-hidden"`, `"offscreen"`). */
  setSuspended: (reason: string, suspended: boolean) => void
  isSuspended: () => boolean
  getSuspendReasons: () => readonly string[]
  /** Signals immediate frame render / full display-rate activity burst. */
  requestFrame: () => void
  markActive: (holdMs?: number) => void
  /** Marks the directional shadow map dirty so static scenery shadows re-bake on the next rendered frame. */
  markShadowDirty: () => void
  isContextLost: () => boolean
  getClampBounds: (zoom?: number) => CameraClampResult
  getViewportSize: () => { width: number; height: number; dpr: number }
  screenToLogical: (clientX: number, clientY: number) => LogicalPoint2D | null
  pickObjects: (
    clientX: number,
    clientY: number,
    objects: THREE.Object3D[]
  ) => THREE.Intersection[]
  projectToScreen: (
    wx: number,
    wy: number,
    wz: number,
    out?: ProjectedPoint
  ) => ProjectedPoint
  projectLogicalToScreen: (
    lx: number,
    ly: number,
    heightWorld?: number,
    out?: ProjectedPoint
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
 * visibility/IntersectionObserver/reason-based suspension, adaptive frame pacing, on-demand shadow maps,
 * dynamic resolution scaling, WebGL context loss/restore, and full GPU disposal.
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
  const baseDistance =
    opts.baseDistance ?? Math.max(12, Math.min(roomW, roomH) * 0.78)
  const minZoom = opts.minZoom ?? 0.6
  const maxZoom = opts.maxZoom ?? 2.4
  const cameraLerp = opts.cameraLerp ?? 0.15
  const boundsMargin = opts.boundsMargin ?? 0.5
  const northMargin = opts.northMargin
  const southMargin = opts.southMargin
  const maxDpr = lite ? 1.5 : 2
  const dynamicResolutionEnabled = opts.dynamicResolution ?? true

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
  renderer.shadowMap.autoUpdate = false
  renderer.shadowMap.needsUpdate = shadows

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
  let lastSnappedX = Number.NaN
  let lastSnappedZ = Number.NaN
  let shadowDirty = shadows
  let shadowUpdates = 0
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
  let baseDpr = Math.min(window.devicePixelRatio || 1, maxDpr)
  let dpr = baseDpr

  const pacer = createAdaptiveFramePacer({
    idleFps: opts.idleFps ?? (lite ? 20 : 30),
    deepIdleFps: opts.deepIdleFps ?? 20,
    idleAfterMs: opts.idleAfterMs ?? 1500,
    deepIdleAfterMs: opts.deepIdleAfterMs ?? 8000,
  })
  const dynRes = createDynamicResolutionController({
    baseDpr,
    minDpr: 1,
    step: 0.25,
    budgetMs: 24,
    headroomMs: 18.5,
    downHoldMs: 2000,
    upHoldMs: 3000,
  })

  let currentZoom = clamp(opts.initialZoom ?? 1.0, minZoom, maxZoom)
  let targetZoom = currentZoom
  let desiredX = 0
  let desiredZ = 0
  let currentX = 0
  let currentZ = 0
  let shakeX = 0
  let shakeY = 0
  let shakeZ = 0
  let cameraDirty = true

  let disposed = false
  let contextLost = false
  let paused = false
  const suspendReasons = new Set<string>()
  let rafId = 0
  let started = false
  let frameCallback: ((dt: number, elapsedS: number) => void) | null = null
  let lastFrameMs = 0
  let elapsed = 0
  let renderedFrames = 0
  let skippedFrames = 0

  // Cached camera bounds for zero-allocation steady-state frames
  let cachedBoundsZoom = Number.NaN
  let cachedBoundsW = -1
  let cachedBoundsH = -1
  let cachedBoundsRoomW = -1
  let cachedBoundsRoomH = -1
  let cachedBounds: CameraClampResult | null = null

  const raycaster = new THREE.Raycaster()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const ndcVec = new THREE.Vector2()
  const hitVec = new THREE.Vector3()
  const projVec = new THREE.Vector3()

  const getClampBounds = (zoom = currentZoom): CameraClampResult => {
    if (
      cachedBounds !== null &&
      zoom === cachedBoundsZoom &&
      cssW === cachedBoundsW &&
      cssH === cachedBoundsH &&
      roomW === cachedBoundsRoomW &&
      roomH === cachedBoundsRoomH
    ) {
      return cachedBounds
    }
    const result = computeCameraClampBounds({
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
    if (zoom === currentZoom) {
      cachedBoundsZoom = zoom
      cachedBoundsW = cssW
      cachedBoundsH = cssH
      cachedBoundsRoomW = roomW
      cachedBoundsRoomH = roomH
      cachedBounds = result
    }
    return result
  }

  const markShadowDirty = (): void => {
    if (shadows) {
      shadowDirty = true
    }
  }

  const markActive = (holdMs?: number): void => {
    if (disposed) return
    pacer.markActive(performance.now(), holdMs)
  }

  const requestFrame = (): void => {
    if (disposed) return
    pacer.requestFrame(performance.now())
  }

  const bridge: ChibiSceneHostBridge = {
    markActive,
    requestFrame,
    markShadowDirty,
  }
  ;(scene.userData as Record<string, unknown>)[SCENE_HOST_BRIDGE_KEY] = bridge

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
    const extentChanged = Math.abs(desiredExtent - lastShadowExtent) > 0.25
    const targetChanged =
      snappedX !== lastSnappedX || snappedZ !== lastSnappedZ

    if (targetChanged) {
      lastSnappedX = snappedX
      lastSnappedZ = snappedZ
      sun.target.position.set(snappedX, 0, snappedZ)
      sun.position.set(
        snappedX + sunOffset.x,
        sunOffset.y,
        snappedZ + sunOffset.z
      )
      sun.target.updateMatrixWorld()
      shadowDirty = true
    }

    if (extentChanged) {
      lastShadowExtent = desiredExtent
      sun.shadow.camera.left = -desiredExtent
      sun.shadow.camera.right = desiredExtent
      sun.shadow.camera.top = desiredExtent
      sun.shadow.camera.bottom = -desiredExtent
      sun.shadow.camera.updateProjectionMatrix()
      shadowDirty = true
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
    cameraDirty = false
  }

  const renderFrame = (): void => {
    if (disposed || contextLost) return
    if (shadows && shadowDirty) {
      renderer.shadowMap.needsUpdate = true
      shadowDirty = false
      shadowUpdates += 1
    }
    renderer.render(scene, camera)
  }

  const stopLoop = (): void => {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  const isSuspendedNow = (): boolean => suspendReasons.size > 0

  const scheduleLoopIfNeeded = (): void => {
    if (
      disposed ||
      !started ||
      contextLost ||
      isSuspendedNow() ||
      rafId !== 0
    ) {
      return
    }
    const now = performance.now()
    lastFrameMs = now
    pacer.requestFrame(now)
    rafId = requestAnimationFrame(loop)
  }

  const setSuspended = (reason: string, suspended: boolean): void => {
    if (disposed || !reason) return
    const wasSuspended = suspendReasons.size > 0
    if (suspended) {
      suspendReasons.add(reason)
    } else {
      suspendReasons.delete(reason)
    }
    const nowSuspended = suspendReasons.size > 0
    if (nowSuspended && !wasSuspended) {
      stopLoop()
    } else if (!nowSuspended && wasSuspended) {
      scheduleLoopIfNeeded()
    }
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
    cachedBounds = null

    sun.shadow.camera.far = Math.max(64, roomW + roomH + 16)
    lastShadowExtent = -1
    lastSnappedX = Number.NaN
    lastSnappedZ = Number.NaN
    rim.position.set(-roomW * 0.42, 13, -roomH * 0.48)

    cameraDirty = true
    markShadowDirty()
    markActive()
    applyCameraTransform()
    if (paused && !contextLost) {
      renderFrame()
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
    baseDpr = Math.min(window.devicePixelRatio || 1, maxDpr)
    dpr = dynRes.setBaseDpr(baseDpr)
    cachedBounds = null
    renderer.setPixelRatio(dpr)
    renderer.setSize(cssW, cssH, false)
    camera.aspect = cssW / Math.max(1, cssH)
    camera.updateProjectionMatrix()
    cameraDirty = true
    markActive()
    applyCameraTransform()
    if (paused && !contextLost) {
      renderFrame()
    }
    opts.onResize?.(cssW, cssH, dpr)
  }

  const onWindowResize = (): void => resize()
  const onVisibilityChange = (): void => {
    if (typeof document === "undefined") return
    setSuspended("document-hidden", document.hidden)
  }
  const onInputActivity = (): void => {
    markActive()
  }
  const onContextLost = (e: Event): void => {
    e.preventDefault()
    contextLost = true
    stopLoop()
    opts.onContextLost?.()
  }
  const onContextRestored = (): void => {
    contextLost = false
    restoreStaticTextures(scene)
    markShadowDirty()
    resize()
    scheduleLoopIfNeeded()
    opts.onContextRestored?.()
  }

  let resizeObserver: ResizeObserver | null = null
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => resize())
    resizeObserver.observe(container)
  }
  let intersectionObserver: IntersectionObserver | null = null
  if (typeof IntersectionObserver !== "undefined") {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (!entry) return
        setSuspended("offscreen", !entry.isIntersecting)
      },
      { threshold: 0 }
    )
    intersectionObserver.observe(dom)
  }

  if (typeof document !== "undefined") {
    if (document.hidden) {
      suspendReasons.add("document-hidden")
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
  }
  window.addEventListener("resize", onWindowResize)
  window.addEventListener("keydown", onInputActivity, { passive: true })
  window.addEventListener("keyup", onInputActivity, { passive: true })
  dom.addEventListener("pointerdown", onInputActivity, { passive: true })
  dom.addEventListener("wheel", onInputActivity, { passive: true })
  dom.addEventListener("touchstart", onInputActivity, { passive: true })
  dom.addEventListener("webglcontextlost", onContextLost)
  dom.addEventListener("webglcontextrestored", onContextRestored)

  resize()

  const followLogical = (lx: number, ly: number, instant = false): void => {
    const nextX = (lx - world.logicalW * 0.5) * world.scale
    const nextZ = (ly - world.logicalH * 0.5) * world.scale
    const targetMoved =
      Math.abs(nextX - desiredX) > 1e-4 || Math.abs(nextZ - desiredZ) > 1e-4
    desiredX = nextX
    desiredZ = nextZ
    if (targetMoved) {
      markActive()
    }
    if (instant) {
      const bounds = getClampBounds(targetZoom)
      currentX = clamp(desiredX, bounds.minX, bounds.maxX)
      currentZ = clamp(desiredZ, bounds.minZ, bounds.maxZ)
      cameraDirty = true
      applyCameraTransform()
    }
  }

  const setZoom = (zoom: number, instant = false): void => {
    const clampedZoom = clamp(
      Number.isFinite(zoom) ? zoom : currentZoom,
      minZoom,
      maxZoom
    )
    if (Math.abs(clampedZoom - targetZoom) > 1e-4) {
      markActive()
    }
    targetZoom = clampedZoom
    if (instant) {
      currentZoom = clampedZoom
      cachedBounds = null
      cameraDirty = true
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
    wz: number,
    out?: ProjectedPoint
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
    if (out) {
      out.x = x
      out.y = y
      out.visible = visible
      out.depth = projVec.z
      return out
    }
    return { x, y, visible, depth: projVec.z }
  }

  const projectLogicalToScreen = (
    lx: number,
    ly: number,
    heightWorld = 0,
    out?: ProjectedPoint
  ): ProjectedPoint => {
    const wx = (lx - world.logicalW * 0.5) * world.scale
    const wz = (ly - world.logicalH * 0.5) * world.scale
    return projectToScreen(wx, heightWorld, wz, out)
  }

  const renderOnce = (): void => {
    if (disposed || contextLost) return
    cameraDirty = true
    applyCameraTransform()
    renderFrame()
  }

  const loop = (now: number): void => {
    if (disposed || isSuspendedNow() || contextLost) {
      rafId = 0
      return
    }
    rafId = requestAnimationFrame(loop)

    const zoomMoving = Math.abs(targetZoom - currentZoom) > 1e-4
    const curBounds = getClampBounds(currentZoom)
    const targetClampedX = clamp(desiredX, curBounds.minX, curBounds.maxX)
    const targetClampedZ = clamp(desiredZ, curBounds.minZ, curBounds.maxZ)
    const posMoving =
      Math.abs(targetClampedX - currentX) > 1e-3 ||
      Math.abs(targetClampedZ - currentZ) > 1e-3
    const shaking = shakeX !== 0 || shakeY !== 0 || shakeZ !== 0
    if (zoomMoving || posMoving || shaking) {
      pacer.markActive(now, 400)
    }

    if (!pacer.shouldRender(now)) {
      skippedFrames += 1
      return
    }

    const wallDeltaMs = Math.max(0, now - lastFrameMs)
    const dt = Math.min(0.05, wallDeltaMs / 1000)
    lastFrameMs = now
    elapsed += dt

    // Frame-rate independent smooth zoom & follow lerp
    if (zoomMoving || posMoving || shaking || cameraDirty) {
      const stepFactor = 1 - Math.pow(1 - cameraLerp, dt * 60)
      if (zoomMoving) {
        currentZoom += (targetZoom - currentZoom) * stepFactor
        if (Math.abs(targetZoom - currentZoom) <= 1e-4) currentZoom = targetZoom
        cachedBounds = null
      }
      const nextBounds = getClampBounds(currentZoom)
      const clampedDesiredX = clamp(desiredX, nextBounds.minX, nextBounds.maxX)
      const clampedDesiredZ = clamp(desiredZ, nextBounds.minZ, nextBounds.maxZ)
      if (posMoving) {
        currentX += (clampedDesiredX - currentX) * stepFactor
        currentZ += (clampedDesiredZ - currentZ) * stepFactor
        if (Math.abs(clampedDesiredX - currentX) <= 1e-3)
          currentX = clampedDesiredX
        if (Math.abs(clampedDesiredZ - currentZ) <= 1e-3)
          currentZ = clampedDesiredZ
      }
      applyCameraTransform()
    }

    const workStartMs = performance.now()
    frameCallback?.(dt, elapsed)
    renderFrame()
    const workMs = performance.now() - workStartMs
    renderedFrames += 1

    const mode = pacer.getMode(now)
    const sampleRes = dynRes.sample(
      mode === "active" ? Math.max(workMs, wallDeltaMs) : workMs,
      wallDeltaMs,
      dynamicResolutionEnabled && mode === "active"
    )
    if (sampleRes.changed && sampleRes.dpr !== dpr) {
      dpr = sampleRes.dpr
      renderer.setPixelRatio(dpr)
      renderer.setSize(cssW, cssH, false)
    }
  }

  const setPaused = (nextPaused: boolean): void => {
    if (disposed || paused === nextPaused) return
    paused = nextPaused
    setSuspended("paused", nextPaused)
  }

  const start = (onFrame: (dt: number, elapsedS: number) => void): void => {
    if (disposed || started) return
    started = true
    frameCallback = onFrame
    const now = performance.now()
    lastFrameMs = now
    pacer.reset(now)
    scheduleLoopIfNeeded()
  }

  const readSpaceStats = (): SpacePerfStats => {
    const info = renderer.info
    const now = performance.now()
    return {
      memory: {
        geometries: info?.memory?.geometries ?? 0,
        textures: info?.memory?.textures ?? 0,
      },
      render: {
        calls: info?.render?.calls ?? 0,
        triangles: info?.render?.triangles ?? 0,
        points: info?.render?.points ?? 0,
        lines: info?.render?.lines ?? 0,
        frame: info?.render?.frame ?? renderedFrames,
      },
      host: {
        lite,
        paused,
        suspended: isSuspendedNow(),
        suspendReasons: [...suspendReasons],
        pacingMode: pacer.getMode(now),
        targetFps: pacer.getTargetFps(now),
        dpr,
        baseDpr,
        shadowAutoUpdate: renderer.shadowMap.autoUpdate ?? false,
        shadowUpdates,
        renderedFrames,
        skippedFrames,
        avgFrameMs: Number(dynRes.getAvgFrameMs().toFixed(2)),
      },
    }
  }

  let devStatsHook: Record<string, unknown> | null = null
  if (import.meta.env.DEV && typeof window !== "undefined") {
    devStatsHook = {
      getStats: readSpaceStats,
      get memory() {
        return readSpaceStats().memory
      },
      get render() {
        return readSpaceStats().render
      },
      get host() {
        return readSpaceStats().host
      },
    }
    ;(window as unknown as Record<string, unknown>).__iqxSpaceStats =
      devStatsHook
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    stopLoop()
    frameCallback = null
    resizeObserver?.disconnect()
    intersectionObserver?.disconnect()
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
    window.removeEventListener("resize", onWindowResize)
    window.removeEventListener("keydown", onInputActivity)
    window.removeEventListener("keyup", onInputActivity)
    dom.removeEventListener("pointerdown", onInputActivity)
    dom.removeEventListener("wheel", onInputActivity)
    dom.removeEventListener("touchstart", onInputActivity)
    dom.removeEventListener("webglcontextlost", onContextLost)
    dom.removeEventListener("webglcontextrestored", onContextRestored)
    delete (scene.userData as Record<string, unknown>)[SCENE_HOST_BRIDGE_KEY]
    if (
      devStatsHook &&
      typeof window !== "undefined" &&
      (window as unknown as Record<string, unknown>).__iqxSpaceStats ===
        devStatsHook
    ) {
      Reflect.deleteProperty(window, "__iqxSpaceStats")
    }
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
      if (ox !== shakeX || oy !== shakeY || oz !== shakeZ) {
        shakeX = ox
        shakeY = oy
        shakeZ = oz
        cameraDirty = true
        if (ox !== 0 || oy !== 0 || oz !== 0) {
          markActive(300)
        }
      }
    },
    setPaused,
    isPaused: () => paused,
    setSuspended,
    isSuspended: isSuspendedNow,
    getSuspendReasons: () => [...suspendReasons],
    requestFrame,
    markActive,
    markShadowDirty,
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
