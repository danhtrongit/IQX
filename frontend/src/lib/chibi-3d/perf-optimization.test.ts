import * as THREE from "three"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockState = vi.hoisted(() => ({
  renderers: [] as Array<{
    domElement: HTMLCanvasElement
    outputColorSpace: string
    toneMapping: number
    toneMappingExposure: number
    shadowMap: {
      enabled: boolean
      type: number
      autoUpdate: boolean
      needsUpdate: boolean
    }
    info: {
      memory: { geometries: number; textures: number }
      render: { calls: number; triangles: number; points: number; lines: number; frame: number }
    }
    setPixelRatio: ReturnType<typeof vi.fn>
    setSize: ReturnType<typeof vi.fn>
    render: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    forceContextLoss: ReturnType<typeof vi.fn>
    getContext: ReturnType<typeof vi.fn>
    shadowNeedsUpdateAtRender: boolean[]
  }>,
}))

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>()
  class MockWebGLRenderer {
    domElement = document.createElement("canvas")
    outputColorSpace = actual.SRGBColorSpace
    toneMapping = actual.NoToneMapping
    toneMappingExposure = 1
    shadowMap = {
      enabled: false,
      type: actual.PCFShadowMap,
      autoUpdate: true,
      needsUpdate: false,
    }
    info = {
      memory: { geometries: 12, textures: 5 },
      render: { calls: 18, triangles: 2400, points: 0, lines: 0, frame: 0 },
    }
    shadowNeedsUpdateAtRender: boolean[] = []
    setPixelRatio = vi.fn()
    setSize = vi.fn()
    render = vi.fn(() => {
      this.info.render.frame += 1
      this.shadowNeedsUpdateAtRender.push(this.shadowMap.needsUpdate)
      // Mirror Three.js WebGLShadowMap clearing needsUpdate after baking
      if (!this.shadowMap.autoUpdate && this.shadowMap.needsUpdate) {
        this.shadowMap.needsUpdate = false
      }
    })
    dispose = vi.fn()
    forceContextLoss = vi.fn()
    getContext = vi.fn(() => ({
      getExtension: () => null,
    }))

    constructor() {
      mockState.renderers.push(this)
    }
  }
  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  }
})

import {
  OFFICE_BASE_H,
  OFFICE_BASE_W,
  OFFICE_WORLD_SCALE,
  buildDeskPositions,
} from "@/pages/office/engine/office-layout.ts"
import { OfficeWorld3D } from "@/pages/office/engine/office-world-3d.ts"
import type { OfficeMember } from "@/pages/office/types.ts"
import { FloorFx3D } from "@/pages/trading-floor/engine/floor-fx-3d.ts"
import {
  FLOOR_WORLD_CONFIG,
  FloorWorld3D,
} from "@/pages/trading-floor/engine/floor-world-3d.ts"
import { OverlayLayer } from "@/pages/trading-floor/engine/overlay-layer.ts"

import {
  createChibiCharacter,
  getCharacterCacheStats,
} from "./character-builder.ts"
import {
  disposeFurnitureCaches,
  getFurnitureCacheStats,
} from "./furniture-builder.ts"
import {
  createAdaptiveFramePacer,
  createChibiSceneHost,
  createDynamicResolutionController,
} from "./scene-host.ts"
import {
  STATIC_CANVAS_KEY,
  cloneSharedRepeatedTexture,
  createFloorTexture,
  disposeAllTextureCaches,
  getTextureCacheStats,
  markStaticCanvasTexture,
  releaseCachedTexture,
  restoreStaticTextures,
  retainCachedTexture,
  type StaticCanvasMeta,
} from "./textures.ts"
import type { WorldTransformConfig } from "./types.ts"

const origIntersectionObserver = globalThis.IntersectionObserver
const origRaf = globalThis.requestAnimationFrame
const origCancelRaf = globalThis.cancelAnimationFrame

function setDocHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  })
}

function makeFake2DContext(): CanvasRenderingContext2D {
  const grad = { addColorStop: () => undefined }
  return {
    clearRect: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    arcTo: () => undefined,
    ellipse: () => undefined,
    quadraticCurveTo: () => undefined,
    bezierCurveTo: () => undefined,
    roundRect: () => undefined,
    rect: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    fillText: () => undefined,
    measureText: (t: string) => ({ width: t.length * 8 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    save: () => undefined,
    restore: () => undefined,
    scale: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
  } as unknown as CanvasRenderingContext2D
}

function countSceneStats(root: THREE.Object3D): {
  drawCalls: number
  instancedMeshes: number
  uniqueGeometries: number
  uniqueMaterials: number
  uniqueTextures: number
  byChild: Record<string, number>
} {
  let drawCalls = 0
  let instancedMeshes = 0
  const geos = new Set<THREE.BufferGeometry>()
  const mats = new Set<THREE.Material>()
  const texs = new Set<THREE.Texture>()
  const byChild: Record<string, number> = {}
  const walk = (node: THREE.Object3D, topLabel: string): void => {
    const mesh = node as THREE.Mesh
    if (mesh.isMesh) {
      drawCalls += 1
      byChild[topLabel] = (byChild[topLabel] ?? 0) + 1
      if (node instanceof THREE.InstancedMesh) instancedMeshes += 1
      if (mesh.geometry) geos.add(mesh.geometry)
      const raw = mesh.material
      const list = Array.isArray(raw) ? raw : raw ? [raw] : []
      for (const m of list) {
        if (!m) continue
        mats.add(m)
        const std = m as THREE.MeshStandardMaterial
        for (const t of [std.map, std.emissiveMap, std.alphaMap]) {
          if (t) texs.add(t)
        }
      }
    }
    for (const c of node.children) {
      walk(c, topLabel)
    }
  }
  for (const child of root.children) {
    walk(child, child.name || child.type)
  }
  return {
    drawCalls,
    instancedMeshes,
    uniqueGeometries: geos.size,
    uniqueMaterials: mats.size,
    uniqueTextures: texs.size,
    byChild,
  }
}

beforeEach(() => {
  mockState.renderers.length = 0
  setDocHidden(false)
  disposeFurnitureCaches()
  disposeAllTextureCaches()
})

afterEach(() => {
  setDocHidden(false)
  globalThis.IntersectionObserver = origIntersectionObserver
  globalThis.requestAnimationFrame = origRaf
  globalThis.cancelAnimationFrame = origCancelRaf
  disposeFurnitureCaches()
  disposeAllTextureCaches()
  vi.restoreAllMocks()
})

describe("Adaptive frame pacer & dynamic resolution controllers", () => {
  it("transitions active -> idle -> deep_idle, skips intermediate ticks, and wakes instantly on markActive/requestFrame", () => {
    const pacer = createAdaptiveFramePacer({
      idleFps: 30,
      deepIdleFps: 20,
      idleAfterMs: 1500,
      deepIdleAfterMs: 8000,
    })
    pacer.reset(0)

    expect(pacer.getMode(0)).toBe("active")
    expect(pacer.getTargetFps(0)).toBe(60)
    expect(pacer.shouldRender(0)).toBe(true)
    expect(pacer.shouldRender(16.6)).toBe(true)

    // After 1500ms stillness -> idle (~30fps: renders every ~33ms, skips 16.6ms tick)
    expect(pacer.getMode(2000)).toBe("idle")
    expect(pacer.getTargetFps(2000)).toBe(30)
    expect(pacer.shouldRender(2000)).toBe(true)
    expect(pacer.shouldRender(2016.6)).toBe(false)
    expect(pacer.shouldRender(2033.3)).toBe(true)

    // After 8000ms stillness -> deep_idle (~20fps: renders every ~50ms)
    expect(pacer.getMode(8500)).toBe("deep_idle")
    expect(pacer.getTargetFps(8500)).toBe(20)
    expect(pacer.shouldRender(8500)).toBe(true)
    expect(pacer.shouldRender(8516.6)).toBe(false)
    expect(pacer.shouldRender(8533.3)).toBe(false)
    expect(pacer.shouldRender(8550)).toBe(true)

    // requestFrame forces next tick immediately without locking into active mode
    pacer.requestFrame(8560)
    expect(pacer.shouldRender(8560)).toBe(true)

    // markActive wakes back to full 60fps display rate immediately
    pacer.markActive(8600, 1500)
    expect(pacer.getMode(8600)).toBe("active")
    expect(pacer.getTargetFps(8600)).toBe(60)
    expect(pacer.shouldRender(8600)).toBe(true)
    expect(pacer.shouldRender(8616.6)).toBe(true)
  })

  it("steps DPR down by 0.25 after 2s over budget and recovers with headroom without exceeding baseDpr", () => {
    const dyn = createDynamicResolutionController({
      baseDpr: 2,
      minDpr: 1,
      step: 0.25,
      budgetMs: 24,
      headroomMs: 18.5,
      downHoldMs: 2000,
      upHoldMs: 3000,
    })
    expect(dyn.getDpr()).toBe(2)

    // Idle samples never alter DPR
    for (let i = 0; i < 60; i += 1) {
      expect(dyn.sample(45, 50, false).changed).toBe(false)
    }
    expect(dyn.getDpr()).toBe(2)

    // Sustained >24ms for 2s in active mode steps down 2 -> 1.75
    let steppedDown = false
    for (let t = 0; t < 2500; t += 100) {
      const res = dyn.sample(34, 100, true)
      if (res.changed) {
        steppedDown = true
        expect(res.dpr).toBe(1.75)
        break
      }
    }
    expect(steppedDown).toBe(true)

    // Sustained headroom (<18.5ms) for 3s steps back up 1.75 -> 2.0 and never exceeds 2.0
    let steppedUp = false
    for (let t = 0; t < 6000; t += 100) {
      const res = dyn.sample(10, 100, true)
      if (res.changed) {
        steppedUp = true
        expect(res.dpr).toBe(2)
        break
      }
    }
    expect(steppedUp).toBe(true)
    for (let t = 0; t < 4000; t += 100) {
      expect(dyn.sample(8, 100, true).dpr).toBe(2)
    }
  })
})

describe("ChibiSceneHost suspend/resume, dt clamping, shadow flags & dev stats hook", () => {
  const world: WorldTransformConfig = {
    logicalW: 2048,
    logicalH: 1408,
    scale: 1 / 64,
  }

  it("pauses loop completely on document.hidden, IntersectionObserver offscreen, and ref-counted setSuspended reasons; clamps dt on resume", () => {
    const ioRef: { current: IntersectionObserverCallback | null } = {
      current: null,
    }
    class FakeIO {
      observe = vi.fn()
      disconnect = vi.fn()
      unobserve = vi.fn()
      constructor(cb: IntersectionObserverCallback) {
        ioRef.current = cb
      }
    }
    globalThis.IntersectionObserver =
      FakeIO as unknown as typeof IntersectionObserver

    const pendingRafs = new Map<number, FrameRequestCallback>()
    let nextRafId = 1
    let fakeNow = 1000
    vi.spyOn(performance, "now").mockImplementation(() => fakeNow)
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = nextRafId++
      pendingRafs.set(id, cb)
      return id
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = ((id: number) => {
      pendingRafs.delete(id)
    }) as typeof cancelAnimationFrame

    const flushRaf = (ts: number): void => {
      fakeNow = ts
      const entries = [...pendingRafs.entries()]
      pendingRafs.clear()
      for (const [, cb] of entries) cb(ts)
    }

    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", { value: 1440, configurable: true })
    Object.defineProperty(container, "clientHeight", { value: 900, configurable: true })
    document.body.appendChild(container)

    const host = createChibiSceneHost({ container, world, lite: false })
    const renderer = mockState.renderers[0]!
    const dts: number[] = []
    host.start((dt) => dts.push(dt))

    // Dev stats hook is exposed
    const statsHook = (window as unknown as Record<string, unknown>)
      .__iqxSpaceStats as { getStats: () => { host: { shadowAutoUpdate: boolean; suspendReasons: string[] } } }
    expect(statsHook).toBeDefined()
    expect(statsHook.getStats().host.shadowAutoUpdate).toBe(false)

    // Initial tick renders
    flushRaf(1016)
    expect(renderer.render).toHaveBeenCalledTimes(1)
    expect(pendingRafs.size).toBe(1)

    // Ref-counted suspend: modal + document-hidden both active
    host.setSuspended("modal", true)
    expect(host.isSuspended()).toBe(true)
    expect(pendingRafs.size).toBe(0)

    setDocHidden(true)
    document.dispatchEvent(new Event("visibilitychange"))
    expect(host.getSuspendReasons()).toEqual(
      expect.arrayContaining(["modal", "document-hidden"])
    )

    // Clearing document-hidden alone must NOT resume while modal is still open
    setDocHidden(false)
    document.dispatchEvent(new Event("visibilitychange"))
    expect(host.isSuspended()).toBe(true)
    expect(pendingRafs.size).toBe(0)

    // IntersectionObserver offscreen suspends too
    ioRef.current?.(
      [{ isIntersecting: false } as IntersectionObserverEntry],
      {} as IntersectionObserver
    )
    host.setSuspended("modal", false)
    expect(host.isSuspended()).toBe(true)
    expect(host.getSuspendReasons()).toEqual(["offscreen"])
    expect(pendingRafs.size).toBe(0)

    // Becoming visible again after a 12s gap resumes loop and clamps dt <= 0.05s
    fakeNow = 13_000
    ioRef.current?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver
    )
    expect(host.isSuspended()).toBe(false)
    expect(pendingRafs.size).toBe(1)

    flushRaf(13_400)
    expect(dts.at(-1)).toBeLessThanOrEqual(0.05)

    host.dispose()
    expect(
      (window as unknown as Record<string, unknown>).__iqxSpaceStats
    ).toBeUndefined()
    container.remove()
  })

  it("keeps shadowMap.autoUpdate=false, bakes once initially, skips shadows while idle, and re-bakes only when shadow-casting rig moves or markShadowDirty fires", () => {
    const pendingRafs = new Map<number, FrameRequestCallback>()
    let nextRafId = 1
    let fakeNow = 0
    vi.spyOn(performance, "now").mockImplementation(() => fakeNow)
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = nextRafId++
      pendingRafs.set(id, cb)
      return id
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = ((id: number) => {
      pendingRafs.delete(id)
    }) as typeof cancelAnimationFrame

    const flushRaf = (ts: number): void => {
      fakeNow = ts
      const entries = [...pendingRafs.entries()]
      pendingRafs.clear()
      for (const [, cb] of entries) cb(ts)
    }

    const container = document.createElement("div")
    Object.defineProperty(container, "clientWidth", { value: 1440, configurable: true })
    Object.defineProperty(container, "clientHeight", { value: 900, configurable: true })
    document.body.appendChild(container)

    const host = createChibiSceneHost({ container, world, lite: false })
    const renderer = mockState.renderers[0]!
    expect(renderer.shadowMap.autoUpdate).toBe(false)

    const rig = createChibiCharacter({ avatarId: "male01", lite: false })
    rig.root.position.set(0, 0, 0)
    host.scene.add(rig.root)

    let moving = false
    host.start((dt) => {
      if (moving) rig.root.position.x += 0.2
      rig.update(dt, {
        anim: moving ? "walk" : "idle",
        facingRad: 0,
        moveFactor: moving ? 1 : 0,
      })
    })

    // Frame 1: initial shadow pass bakes
    flushRaf(16)
    expect(renderer.shadowNeedsUpdateAtRender[0]).toBe(true)

    // Frames 2..4: idle standing still -> ZERO shadow map re-renders!
    flushRaf(32)
    flushRaf(48)
    flushRaf(64)
    expect(renderer.shadowNeedsUpdateAtRender.slice(1)).toEqual([
      false,
      false,
      false,
    ])

    // Character starts walking -> shadow pass updates
    moving = true
    flushRaf(80)
    expect(renderer.shadowNeedsUpdateAtRender.at(-1)).toBe(true)

    // Stops walking -> next idle frame skips shadow bake
    moving = false
    flushRaf(96)
    expect(renderer.shadowNeedsUpdateAtRender.at(-1)).toBe(false)

    // Explicit markShadowDirty triggers single bake
    host.markShadowDirty()
    flushRaf(112)
    expect(renderer.shadowNeedsUpdateAtRender.at(-1)).toBe(true)
    flushRaf(128)
    expect(renderer.shadowNeedsUpdateAtRender.at(-1)).toBe(false)

    rig.dispose()
    host.dispose()
    container.remove()
  })
})

describe("Static canvas release, cache ref-counting teardown & OverlayLayer DOM throttling", () => {
  it("releases static CanvasTexture backing store after GPU upload and restores cleanly on context restore", () => {
    const canvas = document.createElement("canvas")
    canvas.width = 256
    canvas.height = 128
    const paint = vi.fn((c: HTMLCanvasElement) => {
      expect(c.width).toBe(256)
      expect(c.height).toBe(128)
    })
    const tex = markStaticCanvasTexture(new THREE.CanvasTexture(canvas), paint)
    const meta = (tex.userData as Record<string, unknown>)[
      STATIC_CANVAS_KEY
    ] as StaticCanvasMeta
    expect(meta.released).toBe(false)

    // Simulate GPU upload callback
    tex.onUpdate?.(tex)
    expect(meta.released).toBe(true)
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)

    // Simulate WebGL context restore across scene
    const scene = new THREE.Scene()
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex })
    )
    scene.add(mesh)
    const restored = restoreStaticTextures(scene)
    expect(restored).toBe(1)
    expect(paint).toHaveBeenCalledTimes(1)
    expect(canvas.width).toBe(256)
    expect(canvas.height).toBe(128)

    // Re-upload drops canvas again
    tex.onUpdate?.(tex)
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)

    // Clone disposal before upload decrements pendingUploads safely
    const base = createFloorTexture("marble_cream")
    retainCachedTexture(base)
    const clone = cloneSharedRepeatedTexture(base, 4, 4)
    clone.dispose()
    releaseCachedTexture(base)
    expect(getTextureCacheStats().floor).toBe(0)

    mesh.geometry.dispose()
    ;(mesh.material as THREE.Material).dispose()
    tex.dispose()
  })

  it("returns all ref-counted caches strictly to baseline (0) after building and disposing FloorWorld3D twice, preserving hotspot raycasting", () => {
    const origGetCtx = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = (() =>
      makeFake2DContext()) as unknown as typeof HTMLCanvasElement.prototype.getContext
    try {
      expect(getTextureCacheStats().total).toBe(0)
      expect(getFurnitureCacheStats()).toEqual({
        geometries: 0,
        materials: 0,
        chairSpecs: 0,
        plantSpecs: 0,
        lanternSpecs: 0,
      })
      expect(getCharacterCacheStats()).toEqual({
        geometryBundles: 0,
        materialPalettes: 0,
      })

      for (let cycle = 0; cycle < 2; cycle += 1) {
        const scene = new THREE.Scene()
        const container = document.createElement("div")
        document.body.appendChild(container)
        const overlay = new OverlayLayer(container)
        const floor = new FloorWorld3D(scene, overlay, { lite: false })
        const fx = new FloorFx3D(scene, FLOOR_WORLD_CONFIG, overlay, {
          lite: false,
        })

        // Every hotspot root still contains raycastable meshes
        expect(floor.hotspots.length).toBeGreaterThanOrEqual(7)
        for (const hs of floor.hotspots) {
          let meshCount = 0
          hs.root.traverse((n) => {
            if ((n as THREE.Mesh).isMesh) meshCount += 1
          })
          expect(meshCount).toBeGreaterThan(0)
        }

        // Static architecture subtree has matrixAutoUpdate=false
        const staticRoot = floor.group.getObjectByName(
          "trading-floor-static-world"
        )
        expect(staticRoot).toBeTruthy()
        expect(staticRoot!.matrixAutoUpdate).toBe(false)

        // Compact draw-call & texture counts (regression guards)
        const stats = countSceneStats(floor.group)
        expect(stats.drawCalls, JSON.stringify(stats)).toBeLessThanOrEqual(320)
        expect(
          stats.byChild["trading-floor-static-world"] ?? 0,
          JSON.stringify(stats)
        ).toBeLessThanOrEqual(140)
        expect(stats.uniqueTextures, JSON.stringify(stats)).toBeLessThanOrEqual(36)

        // Idle FloorFx3D returns reused zero shake object with zero active effects
        expect(fx.hasActiveEffects()).toBe(false)
        expect(fx.getCameraShakeOffset()).toBe(fx.getCameraShakeOffset())

        fx.dispose()
        floor.dispose()
        overlay.dispose()
        container.remove()

        // After each full teardown, ALL ref-counted caches return strictly to 0
        expect(getTextureCacheStats().total).toBe(0)
        expect(getFurnitureCacheStats()).toEqual({
          geometries: 0,
          materials: 0,
          chairSpecs: 0,
          plantSpecs: 0,
          lanternSpecs: 0,
        })
        expect(getCharacterCacheStats()).toEqual({
          geometryBundles: 0,
          materialPalettes: 0,
        })
      }
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetCtx
    }
  })

  it("returns all ref-counted caches strictly to baseline (0) after building and disposing OfficeWorld3D twice, packing all 24 desk plates into 1 atlas", () => {
    const origGetCtx = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = (() =>
      makeFake2DContext()) as unknown as typeof HTMLCanvasElement.prototype.getContext
    try {
      const members: OfficeMember[] = Array.from({ length: 24 }, (_, idx) => ({
        id: `m-${idx + 1}`,
        userId: `u-${idx + 1}`,
        role: "staff",
        displayName: `Nhân viên ${idx + 1}`,
        avatar: null,
        avatarColor: null,
        deskIndex: idx,
        accentColor: "#1D6FE8",
        online: false,
      }))
      const desks = buildDeskPositions(members)

      for (let cycle = 0; cycle < 2; cycle += 1) {
        const scene = new THREE.Scene()
        const worldCfg: WorldTransformConfig = {
          logicalW: OFFICE_BASE_W,
          logicalH: OFFICE_BASE_H,
          scale: OFFICE_WORLD_SCALE,
        }
        const office = new OfficeWorld3D(scene, worldCfg, false)
        office.rebuildTeamProps("Lê Huy", desks, "u-1", OFFICE_BASE_H, 24)

        // Both self plate and merged member plates share ONE atlas material/texture
        const selfPlate = scene.getObjectByName(
          "office-self-desk-plate"
        ) as THREE.Mesh
        const otherPlates = scene.getObjectByName(
          "office-member-desk-plate"
        ) as THREE.Mesh
        expect(selfPlate).toBeTruthy()
        expect(otherPlates).toBeTruthy()
        expect(selfPlate.material).toBe(otherPlates.material)

        // Static subtrees frozen
        const arch = scene.getObjectByName("office-architecture")!
        const team = scene.getObjectByName("office-team-props")!
        expect(arch.matrixAutoUpdate).toBe(false)
        expect(team.matrixAutoUpdate).toBe(false)

        // Tight draw-call & texture budget across a full 24-desk furnished office (regression guards)
        const stats = countSceneStats(office.group)
        expect(stats.drawCalls, JSON.stringify(stats)).toBeLessThanOrEqual(245)
        expect(stats.uniqueTextures, JSON.stringify(stats)).toBeLessThanOrEqual(60)

        office.dispose()

        expect(getTextureCacheStats().total).toBe(0)
        expect(getFurnitureCacheStats()).toEqual({
          geometries: 0,
          materials: 0,
          chairSpecs: 0,
          plantSpecs: 0,
          lanternSpecs: 0,
        })
      }
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetCtx
    }
  })

  it("throttles OverlayLayer DOM transform writes to >= 0.5 px deltas and skips off-screen nodes", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const layer = new OverlayLayer(container)
    const rootEl = container.querySelector(".tf-overlay-layer") as HTMLElement
    Object.defineProperty(rootEl, "clientWidth", { value: 1440, configurable: true })
    Object.defineProperty(rootEl, "clientHeight", { value: 900, configurable: true })

    layer.setNameplate({
      id: "self",
      name: "Minh Anh",
      kind: "self",
      badges: [],
    })
    const plateEl = rootEl.querySelector(".tf-nameplate") as HTMLElement
    let transformWrites = 0
    let currentTransform = ""
    Object.defineProperty(plateEl.style, "transform", {
      configurable: true,
      get: () => currentTransform,
      set: (v: string) => {
        transformWrites += 1
        currentTransform = v
      },
    })

    // First visible frame writes once
    layer.positionNameplate("self", { x: 400, y: 300, visible: true, depth: 0 }, 500)
    expect(transformWrites).toBe(1)

    // Sub-0.5px jitter does NOT trigger DOM write
    layer.positionNameplate("self", { x: 400.3, y: 300.2, visible: true, depth: 0 }, 500)
    expect(transformWrites).toBe(1)

    // >= 0.5px movement writes once
    layer.positionNameplate("self", { x: 401.2, y: 300.2, visible: true, depth: 0 }, 500)
    expect(transformWrites).toBe(2)

    // Off-screen hides once and never writes transform again
    layer.positionNameplate("self", { x: -500, y: -500, visible: false, depth: 0 }, 500)
    expect(plateEl.style.display).toBe("none")
    layer.positionNameplate("self", { x: -600, y: -600, visible: false, depth: 0 }, 500)
    expect(transformWrites).toBe(2)

    layer.dispose()
    container.remove()
  })
})
