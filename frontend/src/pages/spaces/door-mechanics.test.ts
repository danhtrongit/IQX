import * as THREE from "three"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ChibiSceneHost } from "@/lib/chibi-3d/scene-host.ts"
import {
  logicalToWorld,
  type WorldTransformConfig,
} from "@/lib/chibi-3d/types.ts"
import { OfficeController } from "@/pages/office/engine/office-controller.ts"
import {
  MAX_STAFF_DESKS,
  OFFICE_BASE_H,
  OFFICE_BASE_W,
  OFFICE_BOSS_SPAWN,
  OFFICE_STAFF_FALLBACK_SPAWN,
  OFFICE_STATION_RADIUS,
  OFFICE_WORLD_SCALE,
  buildOfficeObstacles,
  computeOfficeDimensions,
  getOfficeExitDoor,
  isOfficeBlocked,
} from "@/pages/office/engine/office-layout.ts"
import type { OfficeMe } from "@/pages/office/types.ts"
import { resetBridge, ui } from "@/pages/trading-floor/bridge.ts"
import { FloorController } from "@/pages/trading-floor/engine/floor-controller.ts"
import {
  FLOOR_WORLD_CONFIG,
  buildFloorNavGrid,
} from "@/pages/trading-floor/engine/floor-world-3d.ts"
import {
  FLOOR_OFFICE_DOOR,
  SPAWN,
  WALK_SPEED,
} from "@/pages/trading-floor/engine/layout.ts"

import { createChibiPortalDoor } from "./door-3d.ts"
import {
  DOOR_MAX_WALK_SECONDS,
  DOOR_STEP_THROUGH_S,
  DOOR_SWING_OPEN_S,
  findOfficeDoorPath,
  shouldAutoWalkToDoor,
} from "./door-transition.ts"

const origMatchMedia = window.matchMedia

function mockReducedMotion(reduced: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduced : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

function createFakeHost(
  worldCfg: WorldTransformConfig,
  pickObjectsImpl: () => THREE.Intersection[] = () => []
) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.2, 220)
  const dom = document.createElement("canvas")
  const world = { ...worldCfg }
  let frameCb: ((dt: number, elapsedS: number) => void) | null = null
  let paused = false
  let zoom = 1

  const host: ChibiSceneHost = {
    scene,
    camera,
    renderer: {
      domElement: dom,
      getContext: () => ({ isContextLost: () => false }),
      dispose: vi.fn(),
      forceContextLoss: vi.fn(),
      render: vi.fn(),
    } as unknown as THREE.WebGLRenderer,
    world,
    lights: {
      hemi: new THREE.HemisphereLight(),
      sun: new THREE.DirectionalLight(),
      rim: new THREE.DirectionalLight(),
    },
    lite: false,
    followLogical: vi.fn(),
    setWorldSize: vi.fn((w: number, h: number) => {
      world.logicalW = w
      world.logicalH = h
    }),
    setWorldDimensions: vi.fn(),
    setZoom: vi.fn((z: number) => {
      zoom = z
    }),
    getZoom: () => zoom,
    getTargetZoom: () => zoom,
    setCameraShake: vi.fn(),
    setPaused: (p: boolean) => {
      paused = p
    },
    isPaused: () => paused,
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
    getViewportSize: () => ({ width: 1440, height: 840, dpr: 1 }),
    screenToLogical: vi.fn(() => ({ x: 500, y: 700 })),
    pickObjects: vi.fn(pickObjectsImpl),
    projectToScreen: vi.fn(() => ({ x: 400, y: 300, visible: true, depth: 0 })),
    projectLogicalToScreen: vi.fn((lx: number, ly: number) => {
      const pt = logicalToWorld(lx, ly, world)
      return {
        x: 720 + pt.x * 40,
        y: 420 + pt.z * 40,
        visible: true,
        depth: 0.5,
      }
    }),
    start: (cb) => {
      frameCb = cb
    },
    renderOnce: vi.fn(),
    prepare: vi.fn(() => Promise.resolve()),
    waitForFirstFrame: vi.fn(() => Promise.resolve()),
    resize: vi.fn(),
    dispose: vi.fn(),
    setSuspended: vi.fn(),
    isSuspended: () => false,
    getSuspendReasons: () => [],
    requestFrame: vi.fn(),
    markActive: vi.fn(),
    markShadowDirty: vi.fn(),
  }

  let elapsed = 0
  return {
    host,
    dom,
    step: (dt: number) => {
      elapsed += dt
      frameCb?.(dt, elapsed)
    },
  }
}

function makeOfficeMe(): OfficeMe {
  return {
    member: true,
    role: "staff",
    serverTime: "2026-11-24T01:30:00.000Z",
    todayDate: "2026-11-24",
    periodMonth: "2026-11",
    isWorkday: true,
    isAttendanceLocked: false,
    cutoffs: { onTime: "08:30", lock: "12:00" },
    onlineCount: 1,
    onlineUserIds: ["u-staff-1"],
    team: {
      id: "t-1",
      name: "Nhóm Lê Huy",
      bossUserId: "u-boss",
      bossName: "Lê Huy",
      checkinOnTimeCutoff: "08:30",
      checkinLockCutoff: "12:00",
    },
    self: {
      id: "m-1",
      userId: "u-staff-1",
      role: "staff",
      displayName: "Lê Ngọc Hạnh",
      avatar: "female01",
      avatarColor: null,
      deskIndex: 0,
      accentColor: "#C2417D",
      online: true,
    },
    members: [
      {
        id: "m-boss",
        userId: "u-boss",
        role: "boss",
        displayName: "Lê Huy",
        avatar: "male04",
        avatarColor: null,
        deskIndex: null,
        accentColor: "#B7791F",
        online: false,
      },
      {
        id: "m-1",
        userId: "u-staff-1",
        role: "staff",
        displayName: "Lê Ngọc Hạnh",
        avatar: "female01",
        avatarColor: null,
        deskIndex: 0,
        accentColor: "#C2417D",
        online: true,
      },
    ],
    hud: {
      kind: "staff",
      todayDoneCount: 0,
      todayTotalCount: 2,
      pendingCount: 0,
      returnedCount: 0,
      monthlyPoints: 100,
      myAttendanceStatus: "ok",
      myCheckedInAt: "2026-11-24T01:15:00.000Z",
    },
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

describe("Procedural 3D Portal Door & shared transition logic", () => {
  it("builds, animates hinge & beacon, and disposes cleanly in normal and lite modes", () => {
    for (const lite of [false, true]) {
      const door = createChibiPortalDoor({
        signText: lite ? "KHU GIAO DỊCH" : "VĂN PHÒNG NHÓM",
        signSubtext: "LỐI VÀO",
        doubleSidedSign: lite,
        lite,
      })
      expect(door.group.name).toBe("chibi-portal-door")
      expect(door.hitTarget).toBeTruthy()
      expect(door.getOpenProgress()).toBe(0)

      // Side-wall doors include an outer back-cap; cutaway South-wall doors omit it and add a camera-facing sconce
      expect(Boolean(door.group.getObjectByName("door-outer-cap"))).toBe(!lite)
      expect(Boolean(door.group.getObjectByName("door-sconce-back"))).toBe(lite)

      door.setOpenProgress(0.5)
      expect(door.getOpenProgress()).toBeCloseTo(0.5, 5)
      door.setOpenProgress(1.5)
      expect(door.getOpenProgress()).toBe(1)

      door.update(0.016, 1.0, false)
      door.update(0.016, 1.5, true)
      expect(() => door.dispose()).not.toThrow()
    }
  })

  it("evaluates auto-walk vs skip threshold accurately at 4 seconds", () => {
    expect(
      shouldAutoWalkToDoor({ x: 100, y: 100 }, { x: 110, y: 100 }, [], 115)
        .mode
    ).toBe("at-door")

    // 300u at 115 u/s = 2.61s <= 4s -> walk
    expect(
      shouldAutoWalkToDoor(
        { x: 100, y: 100 },
        { x: 400, y: 100 },
        [{ x: 400, y: 100 }],
        WALK_SPEED,
        DOOR_MAX_WALK_SECONDS
      ).mode
    ).toBe("walk")

    // 600u at 115 u/s = 5.22s > 4s -> skip
    expect(
      shouldAutoWalkToDoor(
        { x: 100, y: 100 },
        { x: 700, y: 100 },
        [{ x: 700, y: 100 }],
        WALK_SPEED,
        DOOR_MAX_WALK_SECONDS
      ).mode
    ).toBe("skip")

    // Blocked (empty waypoints when far) -> skip
    expect(
      shouldAutoWalkToDoor({ x: 100, y: 100 }, { x: 300, y: 100 }, [], 115).mode
    ).toBe("skip")
  })
})

describe("Trading Floor door collision, nav reachability, interaction radius & exit choreography", () => {
  it("blocks West-wall door footprint while keeping all 4 bot corridors free and door access reachable from SPAWN", () => {
    const nav = buildFloorNavGrid()
    const obs = FLOOR_OFFICE_DOOR.obstacle
    nav.blockRect(obs.x, obs.y, obs.w, obs.h)

    // Door frame itself is blocked as part of the wall
    expect(nav.free({ x: obs.x + 12, y: FLOOR_OFFICE_DOOR.y })).toBe(false)

    // Access & spawnInside points are walkable and reachable via A* from SPAWN
    expect(nav.free(FLOOR_OFFICE_DOOR.access)).toBe(true)
    expect(nav.free(FLOOR_OFFICE_DOOR.spawnInside)).toBe(true)
    const path = nav.findPath(SPAWN, FLOOR_OFFICE_DOOR.access)
    expect(path.length).toBeGreaterThan(0)

    // All 4 backend bot corridors stay 100% obstacle-free
    const BOT_CORRIDORS = [
      { minX: 800, maxX: 1320, minY: 560, maxY: 1270 },
      { minX: 260, maxX: 1800, minY: 500, maxY: 560 },
      { minX: 110, maxX: 700, minY: 1030, maxY: 1200 },
      { minX: 1390, maxX: 1940, minY: 1190, maxY: 1290 },
    ]
    for (const c of BOT_CORRIDORS) {
      for (let y = c.minY; y <= c.maxY; y += 16) {
        for (let x = c.minX; x <= c.maxX; x += 16) {
          expect(nav.free({ x, y })).toBe(true)
        }
      }
    }
  })

  it("shows Floor door hint strictly within interaction radius, triggers on KeyE & door mesh click, and animates arrival/exit", () => {
    mockReducedMotion(false)
    const container = document.createElement("div")
    document.body.appendChild(container)
    ui.profile.set({ name: "Minh", avatar: "male01", color: "default" })

    const onDoorHintChange = vi.fn()
    const onDoorRequest = vi.fn()
    let hitDoor = false
    const { host, dom, step } = createFakeHost(FLOOR_WORLD_CONFIG, () =>
      hitDoor
        ? ([{ object: new THREE.Object3D() }] as THREE.Intersection[])
        : []
    )

    // Spawn via door -> places player just inside the West door within proximity radius!
    const controller = new FloorController(host, container, {
      arrivedViaDoor: true,
      onDoorHintChange,
      onDoorRequest,
    })

    // Advance arrival step so player settles at FLOOR_OFFICE_DOOR.access & door closes
    for (let i = 0; i < 20; i += 1) step(0.05)
    expect(onDoorHintChange).toHaveBeenCalledWith(true)

    // Pressing E while near door triggers onDoorRequest
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }))
    expect(onDoorRequest).toHaveBeenCalledTimes(1)

    // Clicking the 3D door mesh triggers onDoorRequest
    hitDoor = true
    const ptrDown = new Event("pointerdown", { bubbles: true }) as PointerEvent
    Object.defineProperty(ptrDown, "button", { value: 0 })
    Object.defineProperty(ptrDown, "pointerType", { value: "mouse" })
    Object.defineProperty(ptrDown, "clientX", { value: 200 })
    Object.defineProperty(ptrDown, "clientY", { value: 300 })
    dom.dispatchEvent(ptrDown)
    expect(onDoorRequest).toHaveBeenCalledTimes(2)

    // Starting door exit at the door swings open (~0.35s) + walks through (~0.26s) -> fires onFadeStart
    const onFadeStart = vi.fn()
    controller.beginDoorExit(onFadeStart)
    step(DOOR_SWING_OPEN_S * 0.5)
    expect(onFadeStart).not.toHaveBeenCalled()
    for (let i = 0; i < 20; i += 1) step(0.05)
    expect(onFadeStart).toHaveBeenCalledTimes(1)

    controller.dispose()
    container.remove()
  })

  it("skips walk & door swing under prefers-reduced-motion on Trading Floor", () => {
    mockReducedMotion(true)
    const container = document.createElement("div")
    document.body.appendChild(container)
    ui.profile.set({ name: "Minh", avatar: "male01", color: "default" })

    const { host } = createFakeHost(FLOOR_WORLD_CONFIG)
    const controller = new FloorController(host, container, {})
    const onFadeStart = vi.fn()

    controller.beginDoorExit(onFadeStart)
    expect(onFadeStart).toHaveBeenCalledTimes(1)

    controller.dispose()
    container.remove()
  })

  it("hides Floor door hint outside interaction radius (> 84u) and ignores KeyE while typing in an input", () => {
    mockReducedMotion(false)
    const container = document.createElement("div")
    document.body.appendChild(container)
    ui.profile.set({ name: "Minh", avatar: "male01", color: "default" })

    // 1. Default SPAWN (1024, 540) is far outside the West door radius (84u)
    const onDoorHintChangeFar = vi.fn()
    const onDoorRequestFar = vi.fn()
    const farRun = createFakeHost(FLOOR_WORLD_CONFIG)
    const farCtrl = new FloorController(farRun.host, container, {
      arrivedViaDoor: false,
      onDoorHintChange: onDoorHintChangeFar,
      onDoorRequest: onDoorRequestFar,
    })
    farRun.step(0.05)
    expect(onDoorHintChangeFar).not.toHaveBeenCalledWith(true)
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }))
    expect(onDoorRequestFar).not.toHaveBeenCalled()
    // Reset bridge panel state (KeyE at SPAWN opens Thần Tài) before testing door proximity
    ui.panel.set(null)
    farCtrl.dispose()

    // 2. Near the door, KeyE is ignored while an input has focus
    const onDoorRequestNear = vi.fn()
    const nearRun = createFakeHost(FLOOR_WORLD_CONFIG)
    const nearCtrl = new FloorController(nearRun.host, container, {
      arrivedViaDoor: true,
      onDoorRequest: onDoorRequestNear,
    })
    for (let i = 0; i < 20; i += 1) nearRun.step(0.05)

    const input = document.createElement("input")
    document.body.appendChild(input)
    input.focus()
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }))
    expect(onDoorRequestNear).not.toHaveBeenCalled()

    input.blur()
    input.remove()
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }))
    expect(onDoorRequestNear).toHaveBeenCalledTimes(1)

    nearCtrl.dispose()
    container.remove()
  })
})

describe("Office door placement, reachability, interaction radius & exit choreography", () => {
  it("places exit door on South staff-area outer wall, keeps frame solid, and keeps access reachable on 24-desk and 36-desk maps", () => {
    for (const staffCount of [2, MAX_STAFF_DESKS, MAX_STAFF_DESKS + 8]) {
      const dims = computeOfficeDimensions(staffCount)
      const obstacles = buildOfficeObstacles(staffCount)
      const door = getOfficeExitDoor(dims.height)

      // Door frame obstacle is blocked; access & spawnInside are walkable
      expect(
        isOfficeBlocked(
          door.x,
          door.obstacle.y + 8,
          obstacles,
          dims.width,
          dims.height
        )
      ).toBe(true)
      expect(
        isOfficeBlocked(
          door.access.x,
          door.access.y,
          obstacles,
          dims.width,
          dims.height
        )
      ).toBe(false)
      expect(
        isOfficeBlocked(
          door.spawnInside.x,
          door.spawnInside.y,
          obstacles,
          dims.width,
          dims.height
        )
      ).toBe(false)

      // Obstacle-avoiding path reaches the exit door from both Boss and Staff spawns
      const fromBoss = findOfficeDoorPath(
        OFFICE_BOSS_SPAWN,
        door.access,
        obstacles,
        dims.width,
        dims.height
      )
      const fromStaff = findOfficeDoorPath(
        OFFICE_STAFF_FALLBACK_SPAWN,
        door.access,
        obstacles,
        dims.width,
        dims.height
      )
      expect(fromBoss.length).toBeGreaterThan(0)
      expect(fromStaff.length).toBeGreaterThan(0)
    }
  })

  it("shows Office E prompt 'Khu giao dịch' within < 95 px, triggers on E / prompt click / 3D door click, and supports reduced motion", () => {
    mockReducedMotion(false)
    const container = document.createElement("div")
    document.body.appendChild(container)
    const onDoorRequest = vi.fn()
    let hitDoor = false
    const { host, step } = createFakeHost(
      {
        logicalW: OFFICE_BASE_W,
        logicalH: OFFICE_BASE_H,
        scale: OFFICE_WORLD_SCALE,
      },
      () =>
        hitDoor
          ? ([{ object: new THREE.Object3D() }] as THREE.Intersection[])
          : []
    )

    const controller = new OfficeController(host, container, {
      arrivedViaDoor: true,
      onDoorRequest,
    })
    controller.updateTeam(makeOfficeMe())

    // Step through arrival so player settles right at the exit door (< OFFICE_STATION_RADIUS)
    for (let i = 0; i < 20; i += 1) step(0.05)

    const promptBtn = container.querySelector(
      '[data-testid="office-door-prompt"]'
    ) as HTMLButtonElement | null
    expect(promptBtn).not.toBeNull()
    expect(promptBtn!.style.display).not.toBe("none")
    expect(promptBtn!.textContent).toContain("Khu giao dịch")
    expect(getOfficeExitDoor().radius).toBe(OFFICE_STATION_RADIUS)

    // Clicking the E prompt pill triggers onDoorRequest
    promptBtn!.click()
    expect(onDoorRequest).toHaveBeenCalledTimes(1)

    // Pressing E triggers onDoorRequest
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }))
    expect(onDoorRequest).toHaveBeenCalledTimes(2)

    // Clicking the 3D door mesh triggers onDoorRequest
    hitDoor = true
    const ptrDown = new Event("pointerdown", { bubbles: true }) as PointerEvent
    Object.defineProperty(ptrDown, "button", { value: 0 })
    Object.defineProperty(ptrDown, "pointerType", { value: "mouse" })
    Object.defineProperty(ptrDown, "clientX", { value: 300 })
    Object.defineProperty(ptrDown, "clientY", { value: 400 })
    container.dispatchEvent(ptrDown)
    expect(onDoorRequest).toHaveBeenCalledTimes(3)

    // Exit animation swings door open (~0.35s) + steps through (~0.26s) -> fires onFadeStart
    const onFadeStart = vi.fn()
    controller.beginDoorExit(onFadeStart)
    step(DOOR_SWING_OPEN_S * 0.5)
    expect(onFadeStart).not.toHaveBeenCalled()
    for (let i = 0; i < 20; i += 1) step(0.05)
    expect(onFadeStart).toHaveBeenCalledTimes(1)
    expect(DOOR_SWING_OPEN_S + DOOR_STEP_THROUGH_S).toBeGreaterThan(0.5)

    controller.dispose()
    container.remove()

    // Verify reduced motion triggers fade immediately
    mockReducedMotion(true)
    const c2 = document.createElement("div")
    document.body.appendChild(c2)
    const { host: h2 } = createFakeHost({
      logicalW: OFFICE_BASE_W,
      logicalH: OFFICE_BASE_H,
      scale: OFFICE_WORLD_SCALE,
    })
    const ctrl2 = new OfficeController(h2, c2, {})
    ctrl2.updateTeam(makeOfficeMe())
    const immediateFade = vi.fn()
    ctrl2.beginDoorExit(immediateFade)
    expect(immediateFade).toHaveBeenCalledTimes(1)
    ctrl2.dispose()
    c2.remove()
  })

  it("hides Office door prompt outside 95 px radius and ignores KeyE while typing in an input", () => {
    mockReducedMotion(false)
    const container = document.createElement("div")
    document.body.appendChild(container)
    const onDoorRequestFar = vi.fn()

    // 1. Default staff desk spawn is far (> 95 px) from the South exit door
    const farRun = createFakeHost({
      logicalW: OFFICE_BASE_W,
      logicalH: OFFICE_BASE_H,
      scale: OFFICE_WORLD_SCALE,
    })
    const farCtrl = new OfficeController(farRun.host, container, {
      arrivedViaDoor: false,
      onDoorRequest: onDoorRequestFar,
    })
    farCtrl.updateTeam(makeOfficeMe())
    farRun.step(0.05)
    expect(
      container.querySelector('[data-testid="office-door-prompt"]')
    ).toBeNull()
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }))
    expect(onDoorRequestFar).not.toHaveBeenCalled()
    farCtrl.dispose()

    // 2. Near the Office exit door, KeyE is ignored while typing in an <input>
    const onDoorRequestNear = vi.fn()
    const nearRun = createFakeHost({
      logicalW: OFFICE_BASE_W,
      logicalH: OFFICE_BASE_H,
      scale: OFFICE_WORLD_SCALE,
    })
    const nearCtrl = new OfficeController(nearRun.host, container, {
      arrivedViaDoor: true,
      onDoorRequest: onDoorRequestNear,
    })
    nearCtrl.updateTeam(makeOfficeMe())
    for (let i = 0; i < 20; i += 1) nearRun.step(0.05)

    const input = document.createElement("input")
    document.body.appendChild(input)
    input.focus()
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }))
    expect(onDoorRequestNear).not.toHaveBeenCalled()

    input.blur()
    input.remove()
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }))
    expect(onDoorRequestNear).toHaveBeenCalledTimes(1)

    nearCtrl.dispose()
    container.remove()
  })
})
