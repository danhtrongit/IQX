import * as THREE from "three"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockRendererState = vi.hoisted(() => ({
  ctorOpts: [] as Array<THREE.WebGLRendererParameters | undefined>,
  instances: [] as Array<{
    domElement: HTMLCanvasElement
    outputColorSpace: string
    toneMapping: number
    toneMappingExposure: number
    shadowMap: { enabled: boolean; type: number }
    setPixelRatio: ReturnType<typeof vi.fn>
    setSize: ReturnType<typeof vi.fn>
    render: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    forceContextLoss: ReturnType<typeof vi.fn>
    getContext: ReturnType<typeof vi.fn>
  }>,
}))

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>()
  class MockWebGLRenderer {
    domElement = document.createElement("canvas")
    outputColorSpace = actual.SRGBColorSpace
    toneMapping = actual.NoToneMapping
    toneMappingExposure = 1
    shadowMap = { enabled: false, type: actual.PCFShadowMap }
    setPixelRatio = vi.fn()
    setSize = vi.fn()
    render = vi.fn()
    dispose = vi.fn()
    forceContextLoss = vi.fn()
    getContext = vi.fn(() => ({
      getExtension: () => null,
    }))

    constructor(opts?: THREE.WebGLRendererParameters) {
      mockRendererState.ctorOpts.push(opts)
      mockRendererState.instances.push(this)
    }
  }
  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  }
})

import {
  computeCameraClampBounds,
  createChibiSceneHost,
  detectLiteDevice,
} from "./scene-host.ts"
import { logicalToWorld, type WorldTransformConfig } from "./types.ts"

const origMatchMedia = window.matchMedia
const origResizeObserver = globalThis.ResizeObserver

function setMatchMedia(matcher: (query: string) => boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: matcher(query),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

beforeEach(() => {
  mockRendererState.ctorOpts.length = 0
  mockRendererState.instances.length = 0
  setMatchMedia(() => false)
  Object.defineProperty(navigator, "deviceMemory", {
    configurable: true,
    value: 8,
  })
  Object.defineProperty(navigator, "maxTouchPoints", {
    configurable: true,
    value: 0,
  })
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value: 3,
  })
})

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: origMatchMedia,
  })
  globalThis.ResizeObserver = origResizeObserver
  vi.restoreAllMocks()
})

describe("detectLiteDevice", () => {
  it("detects touch devices and low-memory devices while staying false on desktop", () => {
    expect(detectLiteDevice()).toBe(false)

    setMatchMedia((q) => q.includes("pointer: coarse"))
    expect(detectLiteDevice()).toBe(true)

    setMatchMedia(() => false)
    Object.defineProperty(navigator, "deviceMemory", {
      configurable: true,
      value: 4,
    })
    expect(detectLiteDevice()).toBe(true)
  })
})

describe("createChibiSceneHost lite mode, disposal & context recovery", () => {
  const world: WorldTransformConfig = {
    logicalW: 2048,
    logicalH: 1408,
    scale: 1 / 64,
  }

  it("enables real lite mode: antialias off, DPR capped at 1.5, blob shadows only by default, 512px if forced", () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", { value: 390, configurable: true })
    Object.defineProperty(container, "clientHeight", { value: 788, configurable: true })
    document.body.appendChild(container)

    const host = createChibiSceneHost({ container, world, lite: true })
    const renderer = mockRendererState.instances[0]!
    expect(mockRendererState.ctorOpts[0]?.antialias).toBe(false)
    expect(host.getViewportSize().dpr).toBe(1.5)
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1.5)
    expect(renderer.shadowMap.enabled).toBe(false)
    expect(host.lights.sun.castShadow).toBe(false)
    expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace)
    expect(renderer.toneMapping).toBe(THREE.AgXToneMapping)
    host.dispose()

    const forced = createChibiSceneHost({
      container,
      world,
      lite: true,
      shadows: true,
    })
    expect(forced.lights.sun.castShadow).toBe(true)
    expect(forced.lights.sun.shadow.mapSize.x).toBe(512)
    forced.dispose()
    container.remove()
  })

  it("configures desktop mode with antialias on, DPR cap 2, 2048 shadow map, and tight shadow camera following target", () => {
    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", { value: 1440, configurable: true })
    Object.defineProperty(container, "clientHeight", { value: 844, configurable: true })
    document.body.appendChild(container)

    const host = createChibiSceneHost({ container, world, lite: false })
    expect(mockRendererState.ctorOpts[0]?.antialias).toBe(true)
    expect(host.getViewportSize().dpr).toBe(2)
    expect(host.lights.sun.castShadow).toBe(true)
    expect(host.lights.sun.shadow.mapSize.x).toBe(2048)

    host.followLogical(1500, 900, true)
    const targetAfterEast = host.lights.sun.target.position.clone()
    host.followLogical(500, 900, true)
    const targetAfterWest = host.lights.sun.target.position.clone()
    expect(targetAfterEast.x).toBeGreaterThan(targetAfterWest.x + 2)

    host.dispose()
    container.remove()
  })

  it("calls renderer.forceContextLoss() after renderer.dispose() and handles webglcontextlost/restored + ResizeObserver", () => {
    const roRef: { current: ResizeObserverCallback | null } = { current: null }
    class FakeResizeObserver {
      observe = vi.fn()
      disconnect = vi.fn()
      unobserve = vi.fn()
      constructor(cb: ResizeObserverCallback) {
        roRef.current = cb
      }
    }
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver

    const container = document.createElement("div")
    let w = 1280
    let h = 720
    Object.defineProperty(container, "clientWidth", { get: () => w })
    Object.defineProperty(container, "clientHeight", { get: () => h })
    document.body.appendChild(container)

    const onLost = vi.fn()
    const onRestored = vi.fn()
    const onResize = vi.fn()
    const host = createChibiSceneHost({
      container,
      world,
      lite: false,
      onContextLost: onLost,
      onContextRestored: onRestored,
      onResize,
    })
    const renderer = mockRendererState.instances[0]!

    // ResizeObserver updates dimensions and invokes onResize
    w = 1920
    h = 1024
    roRef.current?.([], {} as ResizeObserver)
    expect(host.getViewportSize()).toMatchObject({ width: 1920, height: 1024 })
    expect(onResize).toHaveBeenLastCalledWith(1920, 1024, 2)

    // WebGL context loss & restoration
    const lostEvent = new Event("webglcontextlost", { cancelable: true })
    renderer.domElement.dispatchEvent(lostEvent)
    expect(lostEvent.defaultPrevented).toBe(true)
    expect(host.isContextLost()).toBe(true)
    expect(onLost).toHaveBeenCalledTimes(1)

    renderer.domElement.dispatchEvent(new Event("webglcontextrestored"))
    expect(host.isContextLost()).toBe(false)
    expect(onRestored).toHaveBeenCalledTimes(1)

    // Disposal frees WebGL context cleanly
    const callOrder: string[] = []
    renderer.dispose.mockImplementation(() => callOrder.push("dispose"))
    renderer.forceContextLoss.mockImplementation(() =>
      callOrder.push("forceContextLoss")
    )
    host.dispose()
    expect(callOrder).toEqual(["dispose", "forceContextLoss"])
    container.remove()
  })
})

describe("Trading Floor responsive camera framing", () => {
  const floorWorld: WorldTransformConfig = {
    logicalW: 2048,
    logicalH: 1408,
    scale: 1 / 64,
  }

  function projectPoint(opts: {
    targetX: number
    targetZ: number
    wx: number
    wy: number
    wz: number
    zoom: number
    aspect: number
  }): { sx: number; sy: number } {
    const cam = new THREE.PerspectiveCamera(36, opts.aspect, 0.2, 220)
    const pitchRad = (48 * Math.PI) / 180
    const dist = 21.6 / opts.zoom
    cam.position.set(
      opts.targetX,
      dist * Math.sin(pitchRad),
      opts.targetZ + dist * Math.cos(pitchRad)
    )
    cam.lookAt(opts.targetX, 0, opts.targetZ)
    cam.updateMatrixWorld()
    const v = new THREE.Vector3(opts.wx, opts.wy, opts.wz).project(cam)
    return { sx: v.x * 0.5 + 0.5, sy: -v.y * 0.5 + 0.5 }
  }

  it("frames LED board, Thần Tài altar, and Vinh danh on desktop (1440×844 & 1920×1024) without dead margins", () => {
    for (const aspect of [1440 / 844, 1920 / 1024]) {
      const bounds = computeCameraClampBounds({
        roomW: 32,
        roomH: 22,
        baseDistance: 21.6,
        zoom: 0.94,
        fovDeg: 36,
        pitchRad: (48 * Math.PI) / 180,
        aspect,
        boundsMargin: 0.6,
        northMargin: 4.7,
        southMargin: 0.9,
      })
      const spawn = logicalToWorld(1024, 540, floorWorld)
      const tx = Math.max(bounds.minX, Math.min(bounds.maxX, spawn.x))
      const tz = Math.max(bounds.minZ, Math.min(bounds.maxZ, spawn.z))

      const led = logicalToWorld(460, 224, floorWorld)
      const shrine = logicalToWorld(1024, 360, floorWorld)
      const fame1 = logicalToWorld(1650, 840, floorWorld)

      const pLed = projectPoint({ targetX: tx, targetZ: tz, wx: led.x, wy: 2.6, wz: led.z, zoom: 0.94, aspect })
      const pShrine = projectPoint({ targetX: tx, targetZ: tz, wx: shrine.x, wy: 1.5, wz: shrine.z, zoom: 0.94, aspect })
      const pFame = projectPoint({ targetX: tx, targetZ: tz, wx: fame1.x, wy: 0.8, wz: fame1.z, zoom: 0.94, aspect })

      expect(pLed.sx).toBeGreaterThan(0.05)
      expect(pLed.sx).toBeLessThan(0.45)
      expect(pShrine.sx).toBeCloseTo(0.5, 2)
      expect(pShrine.sy).toBeGreaterThan(0.1)
      expect(pShrine.sy).toBeLessThan(0.55)
      expect(pFame.sx).toBeGreaterThan(0.7)
      expect(pFame.sx).toBeLessThan(0.98)
    }
  })

  it("centers on the player on phone portrait (390×788) at default mobile zoom", () => {
    const aspect = 390 / 788
    const bounds = computeCameraClampBounds({
      roomW: 32,
      roomH: 22,
      baseDistance: 21.6,
      zoom: 1.18,
      fovDeg: 36,
      pitchRad: (48 * Math.PI) / 180,
      aspect,
      boundsMargin: 0.6,
      northMargin: 4.7,
      southMargin: 0.9,
    })
    const spawn = logicalToWorld(1024, 540, floorWorld)
    // Player spawn is unclamped on phone portrait -> centered cleanly
    expect(spawn.z).toBeGreaterThanOrEqual(bounds.minZ)
    expect(spawn.z).toBeLessThanOrEqual(bounds.maxZ)
    const pPlayer = projectPoint({
      targetX: spawn.x,
      targetZ: spawn.z,
      wx: spawn.x,
      wy: 0.8,
      wz: spawn.z,
      zoom: 1.18,
      aspect,
    })
    expect(pPlayer.sx).toBeCloseTo(0.5, 2)
    expect(pPlayer.sy).toBeGreaterThan(0.35)
    expect(pPlayer.sy).toBeLessThan(0.55)
  })
})
