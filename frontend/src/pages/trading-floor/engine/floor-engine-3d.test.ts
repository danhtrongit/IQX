import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createElement } from "react"
import * as THREE from "three"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ChibiSceneHost } from "@/lib/chibi-3d/scene-host.ts"
import { logicalToWorld, worldToLogical } from "@/lib/chibi-3d/types.ts"

import { openPanel, openPosts, resetBridge, ui } from "../bridge.ts"
import {
  FloorController,
  computeResponsiveZoom,
  facingOf,
  isModifierResetEvent,
} from "./floor-controller.ts"
import { FloorFx3D } from "./floor-fx-3d.ts"
import {
  FLOOR_WORLD_CONFIG,
  FloorWorld3D,
  buildFloorNavGrid,
} from "./floor-world-3d.ts"
import { SPAWN, WORLD_H, WORLD_W } from "./layout.ts"
import { OverlayLayer } from "./overlay-layer.ts"
import { prefersReducedMotion } from "./reduced-motion.ts"
import { startFloor } from "./start-floor.ts"

const openAuth = vi.hoisted(() => vi.fn())
const navigateMock = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: null, openAuth }),
}))
vi.mock("react-router", () => ({
  useNavigate: () => navigateMock,
}))
vi.mock("@/pages/demo-trading/shop/use-shop", () => ({
  useShopState: () => ({ data: { wallet: { balance: 500 } } }),
}))

const { JoinScreen } = await import("../ui/JoinScreen.tsx")
const { Hud } = await import("../ui/Hud.tsx")
const { FloorUi } = await import("../ui/FloorUi.tsx")

const origMatchMedia = window.matchMedia

function mockMatchMedia(matcher: (query: string) => boolean): void {
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

function createFakeSceneHost(opts?: {
  lite?: boolean
  width?: number
  height?: number
}): {
  host: ChibiSceneHost
  dom: HTMLCanvasElement
  step: (dt: number, elapsedS: number) => void
  setCameraShake: ReturnType<typeof vi.fn>
} {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.2, 220)
  const dom = document.createElement("canvas")
  const width = opts?.width ?? 1440
  const height = opts?.height ?? 844
  let frameCb: ((dt: number, elapsedS: number) => void) | null = null
  let paused = false
  let zoom = 1
  const setCameraShake = vi.fn()

  const host: ChibiSceneHost = {
    scene,
    camera,
    renderer: {
      domElement: dom,
      dispose: vi.fn(),
      forceContextLoss: vi.fn(),
      render: vi.fn(),
    } as unknown as THREE.WebGLRenderer,
    world: { ...FLOOR_WORLD_CONFIG },
    lights: {
      hemi: new THREE.HemisphereLight(),
      sun: new THREE.DirectionalLight(),
      rim: new THREE.DirectionalLight(),
    },
    lite: opts?.lite ?? false,
    followLogical: vi.fn(),
    setWorldSize: vi.fn(),
    setWorldDimensions: vi.fn(),
    setZoom: vi.fn((z) => {
      zoom = z
    }),
    getZoom: () => zoom,
    getTargetZoom: () => zoom,
    setCameraShake,
    setPaused: (p) => {
      paused = p
    },
    isPaused: () => paused,
    setSuspended: vi.fn(),
    isSuspended: () => paused,
    getSuspendReasons: () => (paused ? ["paused"] : []),
    requestFrame: vi.fn(),
    markActive: vi.fn(),
    markShadowDirty: vi.fn(),
    isContextLost: () => false,
    getClampBounds: () => ({
      minX: -8,
      maxX: 8,
      minZ: -3,
      maxZ: 5,
      northSpan: 13,
      southSpan: 7,
      targetPlaneHalfVisX: 11,
      nearHalfVisX: 9,
      farHalfVisX: 13,
      minFillZoom: 0.75,
    }),
    getViewportSize: () => ({ width, height, dpr: opts?.lite ? 1.5 : 2 }),
    screenToLogical: vi.fn(() => ({ x: 1120, y: 740 })),
    pickObjects: vi.fn(() => []),
    projectToScreen: vi.fn(() => ({ x: 400, y: 300, visible: true, depth: 0 })),
    projectLogicalToScreen: vi.fn(() => ({
      x: 400,
      y: 300,
      visible: true,
      depth: 0,
    })),
    start: (cb) => {
      frameCb = cb
    },
    renderOnce: vi.fn(),
    prepare: vi.fn(() => Promise.resolve()),
    waitForFirstFrame: vi.fn(() => Promise.resolve()),
    resize: vi.fn(),
    dispose: vi.fn(),
  }

  return {
    host,
    dom,
    setCameraShake,
    step: (dt, elapsedS) => frameCb?.(dt, elapsedS),
  }
}

afterEach(() => {
  resetBridge()
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: origMatchMedia,
  })
  vi.restoreAllMocks()
})

describe("Trading Floor 3D layout & backend bot corridor preservation", () => {
  const BOT_CORRIDORS = [
    { name: "FLOOR_CENTRAL", minX: 800, maxX: 1320, minY: 560, maxY: 1270 },
    { name: "NORTH_WALKWAY", minX: 260, maxX: 1800, minY: 500, maxY: 560 },
    { name: "SW_LOUNGE_CLEARANCE", minX: 110, maxX: 700, minY: 1030, maxY: 1200 },
    { name: "SE_FAME_CLEARANCE", minX: 1390, maxX: 1940, minY: 1190, maxY: 1290 },
  ] as const

  it("keeps all 4 backend bot corridors 100% obstacle-free in NavGrid", () => {
    const nav = buildFloorNavGrid()
    expect(nav.free(SPAWN)).toBe(true)

    for (const rect of BOT_CORRIDORS) {
      for (let y = rect.minY; y <= rect.maxY; y += 16) {
        for (let x = rect.minX; x <= rect.maxX; x += 16) {
          expect(
            nav.free({ x, y }),
            `${rect.name} blocked at (${x}, ${y})`
          ).toBe(true)
        }
      }
    }
  })

  it("maps logical 2048x1408 coordinates round-trip into 32u x 22u Three.js space", () => {
    expect(FLOOR_WORLD_CONFIG.logicalW).toBe(WORLD_W)
    expect(FLOOR_WORLD_CONFIG.logicalH).toBe(WORLD_H)
    expect(WORLD_W * FLOOR_WORLD_CONFIG.scale).toBe(32)
    expect(WORLD_H * FLOOR_WORLD_CONFIG.scale).toBe(22)

    const samples = [
      { x: 0, y: 0 },
      { x: 1024, y: 704 },
      { x: SPAWN.x, y: SPAWN.y },
      { x: 2048, y: 1408 },
    ]
    for (const pt of samples) {
      const worldPt = logicalToWorld(pt.x, pt.y, FLOOR_WORLD_CONFIG)
      const back = worldToLogical(worldPt.x, worldPt.z, FLOOR_WORLD_CONFIG)
      expect(back.x).toBeCloseTo(pt.x, 5)
      expect(back.y).toBeCloseTo(pt.y, 5)
    }

    expect(facingOf(1, 0)).toBe("e")
    expect(facingOf(0, 1)).toBe("s")
    expect(facingOf(-1, 0)).toBe("w")
    expect(facingOf(0, -1)).toBe("n")
  })
})

describe("startFloor WebGL fallback & JoinScreen Chibi 3D preview", () => {
  it("seeds Chibi portraits immediately and invokes onError gracefully when WebGL is unavailable in jsdom", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const onError = vi.fn()

    const stop = startFloor(container, onError)
    expect(Object.keys(ui.avatarImages.get()).length).toBeGreaterThanOrEqual(11)

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))

    stop()
    container.remove()
  })

  it("keeps the JoinScreen (and its 3D preview) unmounted until the profile is known to be absent", () => {
    ui.guest.set(true)
    render(createElement(FloorUi, { suggestedName: "Minh Anh" }))
    // Profile not loaded yet: a returning player must not see the join card flash up.
    expect(
      screen.queryByRole("button", { name: "Vào khu giao dịch" })
    ).toBeNull()

    act(() => {
      ui.profileKnown.set(true)
    })
    expect(
      screen.getByRole("button", { name: "Vào khu giao dịch" })
    ).toBeTruthy()
  })

  it("never mounts the JoinScreen for a player whose saved profile arrives with the known flag", () => {
    render(createElement(FloorUi, { suggestedName: "Minh Anh" }))
    act(() => {
      ui.profile.set({ name: "Minh Anh", avatar: "male01", color: "default" })
      ui.profileKnown.set(true)
    })
    expect(
      screen.queryByRole("button", { name: "Vào khu giao dịch" })
    ).toBeNull()
  })

  it("renders JoinScreen with live ChibiAvatar3DPreview and portrait cards", () => {
    ui.guest.set(true)
    const onDone = vi.fn()
    render(
      createElement(JoinScreen, {
        initial: null,
        suggestedName: "Minh Anh",
        onDone,
      })
    )

    expect(screen.getByText("Khu Giao Dịch")).toBeTruthy()
    expect(
      screen.getByRole("img", { name: /Vest xám hiện đại/i })
    ).toBeTruthy()
    expect(screen.getByRole("tab", { name: /Nam \(5\)/ })).toBeTruthy()
    expect(screen.getByRole("tab", { name: /Nữ \(5\)/ })).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Vào khu giao dịch" })
    ).toBeTruthy()
  })

  it("clamps Trading Floor speech bubbles inside 390px mobile viewport, below top HUD, and clear of nearby nameplates ([R2-U-M3])", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const layer = new OverlayLayer(container)
    const rootEl = container.querySelector(".tf-overlay-layer") as HTMLElement
    Object.defineProperty(rootEl, "clientWidth", { value: 390 })
    Object.defineProperty(rootEl, "clientHeight", { value: 788 })

    layer.setNameplate({
      id: "self",
      name: "Minh Anh",
      kind: "self",
      badges: [],
    })
    layer.setNameplate({
      id: "saco-1",
      name: "SACO Ngọc Lan",
      kind: "peer",
      badges: [{ text: "SACO", tone: "saco" }],
    })
    layer.positionNameplate("self", { x: 190, y: 294, visible: true, depth: 0 }, 540)
    layer.positionNameplate("saco-1", { x: 340, y: 330, visible: true, depth: 0 }, 590)

    layer.showBubble("npc:deity", "A, Minh Anh! Gieo một quẻ lấy hên đầu phiên nhé!", "right", 1000)
    layer.showBubble("saco-1", "Chào mừng cả nhà đến Khu Giao Dịch 3D!", "above", 1000)

    const deityEl = rootEl.querySelector(".tf-bubble-right") as HTMLElement
    const sacoEl = rootEl.querySelector(".tf-bubble:not(.tf-bubble-right)") as HTMLElement
    Object.defineProperty(deityEl, "offsetWidth", { value: 216 })
    Object.defineProperty(deityEl, "offsetHeight", { value: 44 })
    Object.defineProperty(sacoEl, "offsetWidth", { value: 210 })
    Object.defineProperty(sacoEl, "offsetHeight", { value: 44 })

    // Thần Tài near top-right on 390px mobile: must clamp horizontally inside [10..380] and top >= 114px
    layer.positionBubble("npc:deity", { x: 220, y: 72, visible: true, depth: 0 })
    const deityMatch = /translate3d\((-?\d+)px,\s*(-?\d+)px/.exec(deityEl.style.transform)
    expect(deityMatch).not.toBeNull()
    const deityLeft = Number(deityMatch![1])
    const deityTop = Number(deityMatch![2])
    expect(deityLeft).toBeGreaterThanOrEqual(10)
    expect(deityLeft + 216).toBeLessThanOrEqual(380)
    expect(deityTop).toBeGreaterThanOrEqual(114)

    // SACO Ngọc Lan near right edge & overlapping Minh Anh's nameplate: must clamp inside [10..380] & lift above self plate
    layer.positionBubble("saco-1", { x: 340, y: 330, visible: true, depth: 0 })
    const sacoMatch = /translate3d\((-?\d+)px,\s*(-?\d+)px/.exec(sacoEl.style.transform)
    expect(sacoMatch).not.toBeNull()
    const sacoLeft = Number(sacoMatch![1])
    const sacoTop = Number(sacoMatch![2])
    expect(sacoLeft).toBeGreaterThanOrEqual(10)
    expect(sacoLeft + 210).toBeLessThanOrEqual(380)
    expect(sacoTop + 44).toBeLessThanOrEqual(272) // lifted cleanly above self nameplate top (~272px)

    layer.dispose()
    container.remove()
  })
})

function sceneSignature(root: THREE.Object3D): string[] {
  const out: string[] = []
  root.traverse((o) => {
    const geo = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
    const verts = geo?.attributes?.position?.count ?? 0
    const p = o.position
    out.push(`${o.type}:${o.name}:${verts}:${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`)
  })
  return out
}

describe("FloorWorld3D & FloorFx3D graphics, lite mode, and prefers-reduced-motion", () => {
  it("time-sliced boot build (deferBuild + buildAsync) produces the same scene as the synchronous build", async () => {
    const build = async (deferred: boolean) => {
      const scene = new THREE.Scene()
      const container = document.createElement("div")
      document.body.appendChild(container)
      const overlay = new OverlayLayer(container)
      const world3d = new FloorWorld3D(scene, overlay, { lite: false, deferBuild: deferred })
      if (deferred) {
        expect(world3d.hotspots.length).toBe(0)
        const progress: number[] = []
        const yieldFn = vi.fn(() => Promise.resolve())
        await expect(
          world3d.buildAsync({ budgetMs: 1, yieldFn, onProgress: (f) => progress.push(f) })
        ).resolves.toBe(true)
        expect(yieldFn).toHaveBeenCalled()
        expect(progress.at(-1)).toBe(1)
      }
      const result = { sig: sceneSignature(scene), hotspots: world3d.hotspots.length }
      world3d.dispose()
      overlay.dispose()
      container.remove()
      return result
    }
    const sync = await build(false)
    const sliced = await build(true)
    expect(sliced.hotspots).toBe(sync.hotspots)
    expect(sliced.sig).toEqual(sync.sig)
  })

  it("disposes a world abandoned mid-build without throwing", async () => {
    const scene = new THREE.Scene()
    const container = document.createElement("div")
    document.body.appendChild(container)
    const overlay = new OverlayLayer(container)
    const world3d = new FloorWorld3D(scene, overlay, { deferBuild: true })
    let calls = 0
    const finished = await world3d.buildAsync({
      budgetMs: 1,
      yieldFn: () => Promise.resolve(),
      isCancelled: () => ++calls >= 2,
    })
    expect(finished).toBe(false)
    expect(() => world3d.dispose()).not.toThrow()
    expect(scene.getObjectByName("trading-floor-world-3d")).toBeUndefined()
    overlay.dispose()
    container.remove()
  })

  it("builds Trading Floor world with skirting/columns/ticker/contact-shadows in normal & lite mode and disposes cleanly", () => {
    for (const lite of [false, true]) {
      const scene = new THREE.Scene()
      const container = document.createElement("div")
      document.body.appendChild(container)
      const overlay = new OverlayLayer(container)
      const world3d = new FloorWorld3D(scene, overlay, { lite })

      expect(world3d.hotspots.length).toBeGreaterThanOrEqual(7)
      expect(world3d.group.getObjectByName("arch-skirting")).toBeTruthy()
      expect(world3d.group.getObjectByName("arch-warm-glow")).toBeTruthy()
      world3d.updateMarket(null, null)
      world3d.updatePosts([])
      world3d.updateLeaderboard(null, overlay)
      world3d.refreshDynamicTextures()
      world3d.celebrate(4, 1.0)
      world3d.update(
        0.016,
        1.1,
        () => ({ x: 400, y: 300, visible: true, depth: 0 }),
        overlay
      )

      expect(() => world3d.dispose()).not.toThrow()
      overlay.dispose()
      container.remove()
    }
  })

  it("caps FX particles in lite mode and disables camera shake & trims FX under prefers-reduced-motion", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() =>
      Promise.resolve()
    )
    const container = document.createElement("div")
    document.body.appendChild(container)
    const overlay = new OverlayLayer(container)

    // Normal mode: egg crack triggers camera shake and rich particle burst
    mockMatchMedia(() => false)
    const normalScene = new THREE.Scene()
    const normalFx = new FloorFx3D(normalScene, FLOOR_WORLD_CONFIG, overlay, {
      lite: false,
    })
    normalFx.playXaXui(1024, 540, { isSelf: true })
    normalFx.update(0.3)
    const normalShake = normalFx.getCameraShakeOffset()
    expect(
      Math.abs(normalShake.x) + Math.abs(normalShake.y) + Math.abs(normalShake.z)
    ).toBeGreaterThan(0)
    const normalCount = normalFx.getActiveParticleCount()
    normalFx.dispose()

    // Reduced-motion mode: zero camera shake & fewer particles
    mockMatchMedia((q) => q.includes("prefers-reduced-motion: reduce"))
    expect(prefersReducedMotion()).toBe(true)
    const rmScene = new THREE.Scene()
    const rmFx = new FloorFx3D(rmScene, FLOOR_WORLD_CONFIG, overlay, {
      lite: false,
    })
    rmFx.playXaXui(1024, 540, { isSelf: true })
    rmFx.update(0.3)
    expect(rmFx.getCameraShakeOffset()).toEqual({ x: 0, y: 0, z: 0 })
    expect(rmFx.getActiveParticleCount()).toBeLessThan(normalCount)
    rmFx.playGay(1024, 540, "Minh Anh", "Tím trần!", { isSelf: true })
    rmFx.playKhan(1024, 540, "Minh Anh", "Xin lộc!", { isSelf: true })
    rmFx.update(1.5)
    expect(() => rmFx.dispose()).not.toThrow()

    // Lite mode: particle count stays tightly bounded even under repeated Gáy
    mockMatchMedia(() => false)
    const liteScene = new THREE.Scene()
    const liteFx = new FloorFx3D(liteScene, FLOOR_WORLD_CONFIG, overlay, {
      lite: true,
    })
    liteFx.playGay(1024, 540, "A", "B", { isSelf: true })
    liteFx.playGay(1024, 540, "C", "D", { isSelf: false })
    for (let t = 0; t < 2.0; t += 0.1) liteFx.update(0.1)
    expect(liteFx.getActiveParticleCount()).toBeLessThanOrEqual(72)
    liteFx.dispose()

    overlay.dispose()
    container.remove()
  })
})

describe("FloorController input safety, modal walk cancellation, responsive zoom & HUD", () => {
  it("computes responsive zoom for desktop, tablet, phone portrait, and ultrawide", () => {
    const desktop = computeResponsiveZoom(1, 1440, 844, 0.75)
    const phone = computeResponsiveZoom(1, 390, 788, 0.75)
    const ultrawide = computeResponsiveZoom(0.72, 2560, 900, 1.15)
    expect(desktop).toBeCloseTo(0.94, 2)
    expect(phone).toBeGreaterThan(desktop)
    expect(ultrawide).toBeGreaterThanOrEqual(1.1)
    expect(isModifierResetEvent({ code: "MetaLeft" })).toBe(true)
    expect(isModifierResetEvent({ code: "KeyW", metaKey: true })).toBe(true)
    expect(isModifierResetEvent({ code: "KeyW" })).toBe(false)
  })

  it("uses event.code, clears held keys on blur / visibility hidden / Meta-Ctrl, and clears click-to-walk when modal opens", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    ui.profile.set({ name: "Minh Anh", avatar: "male01", color: "default" })

    const fake = createFakeSceneHost({ lite: false })
    const controller = new FloorController(fake.host, container)

    // Press KeyD with non-Latin event.key (e.g. Vietnamese / Cyrillic layout): moves East by code
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", key: "đ" }))
    fake.step(0.1, 0.1)
    const posAfterKeyD = (controller as unknown as { player: { x: number; y: number } }).player.x
    expect(posAfterKeyD).toBeGreaterThan(SPAWN.x - 60)

    // Pressing Meta key clears all held keys (prevents macOS Cmd+Tab stuck walk)
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "MetaLeft", metaKey: true }))
    const xBeforeStep = (controller as unknown as { player: { x: number } }).player.x
    fake.step(0.1, 0.2)
    expect((controller as unknown as { player: { x: number } }).player.x).toBe(xBeforeStep)

    // Hold KeyS then blur window -> clears held keys immediately
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS", key: "s" }))
    window.dispatchEvent(new Event("blur"))
    const yAfterBlur = (controller as unknown as { player: { y: number } }).player.y
    fake.step(0.1, 0.3)
    expect((controller as unknown as { player: { y: number } }).player.y).toBe(yAfterBlur)

    // Click-to-walk sets a path; opening a panel or posts clears the walk target immediately
    fake.dom.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1440, height: 844, right: 1440, bottom: 844 }) as DOMRect
    fake.dom.dispatchEvent(
      new MouseEvent("pointerdown", { button: 0, clientX: 600, clientY: 500 })
    )
    expect(
      (controller as unknown as { path: unknown[] }).path.length
    ).toBeGreaterThan(0)
    openPanel("market")
    expect((controller as unknown as { path: unknown[] }).path).toHaveLength(0)

    ui.panel.set(null)
    fake.dom.dispatchEvent(
      new MouseEvent("pointerdown", { button: 0, clientX: 600, clientY: 500 })
    )
    expect(
      (controller as unknown as { path: unknown[] }).path.length
    ).toBeGreaterThan(0)
    openPosts()
    expect((controller as unknown as { path: unknown[] }).path).toHaveLength(0)

    controller.dispose()
    container.remove()
  })

  it("hides keyboard help line on touch devices, supports tapping the E/Chạm hint, and collapses FxBar on phones", () => {
    const queryClient = new QueryClient()
    ui.profile.set({ name: "Minh Anh", avatar: "male01", color: "default" })
    ui.hint.set({ kind: "thantai", label: "Thần Tài" })

    mockMatchMedia(
      (q) => q.includes("pointer: coarse") || q.includes("max-width: 640px")
    )

    const { container, unmount } = render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(Hud, { onEditProfile: vi.fn() })
      )
    )

    // Keyboard help line is hidden on touch devices
    expect(container.querySelector(".help")).toBeNull()

    // Touch hint shows "Chạm để mở" and tapping it opens the panel
    const hintBtn = screen.getByRole("button", {
      name: /Thần Tài.*Chạm để mở/i,
    })
    expect(hintBtn.textContent).toContain("Chạm để mở")
    fireEvent.click(hintBtn)
    expect(ui.panel.get()?.kind).toBe("thantai")

    // FxBar starts collapsed on mobile and expands on tap
    const fxToggle = screen.getByRole("button", { name: "Mở hành động" })
    expect(fxToggle.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(fxToggle)
    expect(screen.getByRole("button", { name: "Thu gọn hành động" })).toBeTruthy()
    expect(screen.getByTitle(/Xả xui/i)).toBeTruthy()

    unmount()
  })

  it("throttles far peer rig animations in lite mode and suppresses character bob under prefers-reduced-motion", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    ui.profile.set({ name: "Minh Anh", avatar: "male01", color: "default" })

    const fake = createFakeSceneHost({ lite: true })
    const controller = new FloorController(fake.host, container)

    // Add a near peer and a far peer directly through private addPeer hook
    const internal = controller as unknown as {
      addPeer: (p: {
        id: string
        name: string
        avatar: string
        color: string
        x: number
        y: number
        facing: "s"
        moving: boolean
      }) => void
      peers: Map<string, { rig: { update: (...args: unknown[]) => void } }>
      player: { rig: { update: (...args: unknown[]) => void } }
    }
    internal.addPeer({
      id: "peer-near",
      name: "Gần",
      avatar: "male02",
      color: "default",
      x: SPAWN.x + 40,
      y: SPAWN.y,
      facing: "s",
      moving: true,
    })
    internal.addPeer({
      id: "peer-far",
      name: "Xa",
      avatar: "female02",
      color: "default",
      x: 1950,
      y: 1300,
      facing: "s",
      moving: true,
    })

    const nearSpy = vi.spyOn(internal.peers.get("peer-near")!.rig, "update")
    const farSpy = vi.spyOn(internal.peers.get("peer-far")!.rig, "update")
    const playerSpy = vi.spyOn(internal.player.rig, "update")

    mockMatchMedia((q) => q.includes("prefers-reduced-motion: reduce"))
    for (let i = 1; i <= 10; i += 1) {
      fake.step(0.016, i * 0.016)
    }

    // Near peer updates every frame (10x); very far peer (>850u) is throttled to ~5Hz (1 initial update in 160ms)
    expect(nearSpy.mock.calls.length).toBe(10)
    expect(farSpy.mock.calls.length).toBeLessThanOrEqual(2)

    // Under prefers-reduced-motion, player idle passes moveFactor=0 and animTime=0 (no bobbing)
    const lastPlayerCall = playerSpy.mock.calls.at(-1)?.[1] as {
      moveFactor?: number
      animTime?: number
    }
    expect(lastPlayerCall.moveFactor).toBe(0)
    expect(lastPlayerCall.animTime).toBe(0)

    controller.dispose()
    container.remove()
  })
})
