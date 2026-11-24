import * as THREE from "three"
import { afterEach, describe, expect, it, vi } from "vitest"

import { runBuildChunked } from "@/lib/chibi-3d/chunked-build.ts"

import {
  computeCameraClampBounds,
  type ChibiSceneHost,
} from "@/lib/chibi-3d/scene-host.ts"
import {
  logicalToWorld,
  type WorldTransformConfig,
} from "@/lib/chibi-3d/types.ts"

import type { OfficeMe, OfficeMember } from "../types.ts"
import {
  OFFICE_CAMERA_BASE_DISTANCE,
  OFFICE_CAMERA_FOV,
  OFFICE_CAMERA_NORTH_MARGIN,
  OFFICE_CAMERA_PITCH_DEG,
  OFFICE_CAMERA_SOUTH_MARGIN,
  OFFICE_DESKTOP_HUD_COL_PX,
  OFFICE_MAX_ZOOM,
  OFFICE_MIN_ZOOM,
  OFFICE_TABLET_HUD_COL_PX,
  OfficeController,
  computeOfficeCameraTarget,
  computeOfficeCoverMinZoom,
  computeOfficeResponsiveZoom,
  resolveOfficeHudInsets,
} from "./office-controller.ts"
import {
  MAX_STAFF_DESKS,
  OFFICE_BASE_H,
  OFFICE_BASE_W,
  OFFICE_BOSS_SPAWN,
  OFFICE_EXTRA_BAND_STEP,
  OFFICE_NORTH_PROPS,
  OFFICE_WORLD_SCALE,
  buildDeskPositions,
  deskSlotCoords,
  getOfficeNorthWindows,
  getZoneRugs,
  prefersReducedMotion,
} from "./office-layout.ts"
import { OfficeWorld3D } from "./office-world-3d.ts"

const { createHostMock } = vi.hoisted(() => ({
  createHostMock: vi.fn(),
}))

vi.mock("@/lib/chibi-3d/scene-host.ts", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/chibi-3d/scene-host.ts")
  >("@/lib/chibi-3d/scene-host.ts")
  return {
    ...actual,
    createChibiSceneHost: createHostMock,
  }
})

import { startOffice } from "./start-office.ts"

function createMockHost(viewport = { width: 1440, height: 900 }): {
  host: ChibiSceneHost
  step: (dt: number) => void
  forceContextLoss: ReturnType<typeof vi.fn>
  followLogical: ReturnType<typeof vi.fn>
  setWorldSize: ReturnType<typeof vi.fn>
  setZoom: ReturnType<typeof vi.fn>
  setViewport: (w: number, h: number) => void
} {
  const scene = new THREE.Scene()
  const world: WorldTransformConfig = {
    logicalW: OFFICE_BASE_W,
    logicalH: OFFICE_BASE_H,
    scale: OFFICE_WORLD_SCALE,
  }
  let vp = { ...viewport, dpr: 1 }
  let zoom = 1.04
  let onFrame: ((dt: number, elapsed: number) => void) | null = null
  const forceContextLoss = vi.fn()
  const followLogical = vi.fn()
  const setWorldSize = vi.fn((w: number, h: number) => {
    world.logicalW = w
    world.logicalH = h
  })
  const setZoom = vi.fn((z: number) => {
    zoom = z
  })

  const host = {
    scene,
    camera: new THREE.PerspectiveCamera(
      OFFICE_CAMERA_FOV,
      vp.width / vp.height,
      0.2,
      220
    ),
    renderer: {
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 1.08,
      getContext: () => ({ isContextLost: () => false }),
      forceContextLoss,
      dispose: vi.fn(),
    } as unknown as THREE.WebGLRenderer,
    world,
    lights: {
      hemi: new THREE.HemisphereLight(),
      sun: new THREE.DirectionalLight(),
      rim: new THREE.DirectionalLight(),
    },
    lite: false,
    followLogical,
    setWorldSize,
    setWorldDimensions: setWorldSize,
    setZoom,
    getZoom: () => zoom,
    getTargetZoom: () => zoom,
    setCameraShake: vi.fn(),
    setPaused: vi.fn(),
    isPaused: () => false,
    getClampBounds: (z = zoom) =>
      computeCameraClampBounds({
        roomW: world.logicalW * world.scale,
        roomH: world.logicalH * world.scale,
        baseDistance: OFFICE_CAMERA_BASE_DISTANCE,
        zoom: z,
        fovDeg: OFFICE_CAMERA_FOV,
        pitchRad: (OFFICE_CAMERA_PITCH_DEG * Math.PI) / 180,
        aspect: vp.width / Math.max(1, vp.height),
        boundsMargin: 0.6,
        northMargin: OFFICE_CAMERA_NORTH_MARGIN,
        southMargin: OFFICE_CAMERA_SOUTH_MARGIN,
      }),
    getViewportSize: () => vp,
    screenToLogical: vi.fn((x: number, y: number) => ({ x, y })),
    pickObjects: vi.fn(() => []),
    projectToScreen: vi.fn((wx: number, _wy: number, wz: number) => ({
      x: vp.width / 2 + wx * 40,
      y: vp.height / 2 + wz * 40,
      visible: true,
      depth: 0.5,
    })),
    projectLogicalToScreen: vi.fn((lx: number, ly: number) => {
      const pt = logicalToWorld(lx, ly, world)
      return {
        x: vp.width / 2 + pt.x * 40,
        y: vp.height / 2 + pt.z * 40,
        visible: true,
        depth: 0.5,
      }
    }),
    start: vi.fn((cb: (dt: number, elapsed: number) => void) => {
      onFrame = cb
    }),
    renderOnce: vi.fn(),
    prepare: vi.fn(() => Promise.resolve()),
    waitForFirstFrame: vi.fn(() => Promise.resolve()),
    resize: vi.fn(),
    dispose: vi.fn(),
  } as unknown as ChibiSceneHost

  return {
    host,
    step: (dt: number) => onFrame?.(dt, dt),
    forceContextLoss,
    followLogical,
    setWorldSize,
    setZoom,
    setViewport: (w: number, h: number) => {
      vp = { width: w, height: h, dpr: 1 }
    },
  }
}

function makeStaffMe(overrides: Partial<OfficeMe> = {}): OfficeMe {
  return {
    member: true,
    role: "staff",
    serverTime: "2026-11-23T01:20:00.000Z",
    todayDate: "2026-11-23",
    periodMonth: "2026-11",
    isWorkday: true,
    isAttendanceLocked: false,
    cutoffs: { onTime: "08:30", lock: "12:00" },
    onlineCount: 2,
    onlineUserIds: ["u-staff-1", "u-boss"],
    team: {
      id: "team-1",
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
        online: true,
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
      myAttendanceStatus: "absent",
      myCheckedInAt: null,
    },
    ...overrides,
  }
}

/** Projects a logical X coordinate to CSS screen X using the actual perspective host clamp math. */
function projectLogicalXWithHostClamp(
  lx: number,
  targetLx: number,
  vpW: number,
  vpH: number,
  zoom = 1.04,
  worldW = OFFICE_BASE_W,
  worldH = OFFICE_BASE_H
): number {
  const aspect = vpW / Math.max(1, vpH)
  const bounds = computeCameraClampBounds({
    roomW: worldW * OFFICE_WORLD_SCALE,
    roomH: worldH * OFFICE_WORLD_SCALE,
    baseDistance: OFFICE_CAMERA_BASE_DISTANCE,
    zoom,
    fovDeg: OFFICE_CAMERA_FOV,
    pitchRad: (OFFICE_CAMERA_PITCH_DEG * Math.PI) / 180,
    aspect,
    boundsMargin: 0.6,
    northMargin: OFFICE_CAMERA_NORTH_MARGIN,
    southMargin: OFFICE_CAMERA_SOUTH_MARGIN,
  })
  const rawWorldX = (targetLx - worldW / 2) * OFFICE_WORLD_SCALE
  const clampedWorldX = Math.max(bounds.minX, Math.min(bounds.maxX, rawWorldX))
  const clampedLx = clampedWorldX / OFFICE_WORLD_SCALE + worldW / 2
  const halfVisXLogical = bounds.targetPlaneHalfVisX / OFFICE_WORLD_SCALE
  return vpW / 2 + ((lx - clampedLx) / halfVisXLogical) * (vpW / 2)
}

afterEach(() => {
  vi.restoreAllMocks()
  createHostMock.mockReset()
})

describe("OfficeController & startOffice open-floor KGD camera, interactions & instanced pods", () => {
  it("skips rebuilding desks when updateTeam receives identical desk layout, and rebuilds when name/layout changes", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { host } = createMockHost()
    const rebuildSpy = vi.spyOn(
      OfficeWorld3D.prototype,
      "rebuildTeamPropsSteps"
    )

    const controller = new OfficeController(host, container, {})
    const me1 = makeStaffMe()
    controller.updateTeam(me1)
    expect(rebuildSpy).toHaveBeenCalledTimes(1)

    controller.updateTeam(
      makeStaffMe({
        serverTime: "2026-11-23T01:35:00.000Z",
        onlineCount: 5,
        hud: {
          kind: "staff",
          todayDoneCount: 2,
          todayTotalCount: 2,
          pendingCount: 1,
          returnedCount: 0,
          monthlyPoints: 250,
          myAttendanceStatus: "ok",
          myCheckedInAt: "2026-11-23T01:25:00.000Z",
        },
      })
    )
    expect(rebuildSpy).toHaveBeenCalledTimes(1)

    const renamed = makeStaffMe()
    renamed.members = renamed.members.map((m) =>
      m.userId === "u-staff-1" ? { ...m, displayName: "Lê Ngọc Hạnh A" } : m
    )
    controller.updateTeam(renamed)
    expect(rebuildSpy).toHaveBeenCalledTimes(2)

    controller.dispose()
    container.remove()
  })

  it("uses event.code for movement, supports direct station click, clears held keys on blur/hidden/Meta, and clears click target on modal open", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { host, step } = createMockHost()
    const states: Array<{ x: number; y: number; moving: boolean }> = []
    const onStationTrigger = vi.fn()

    const controller = new OfficeController(host, container, {
      onSelfState: (s) => states.push({ x: s.x, y: s.y, moving: s.moving }),
      onStationTrigger,
    })
    controller.updateTeam(makeStaffMe())
    const startX = states.at(-1)!.x
    const startY = states.at(-1)!.y

    // Direct click on own desk while standing at own desk triggers Nhiệm vụ modal immediately
    const desk0 = deskSlotCoords(0)
    const deskClick = new Event("pointerdown", { bubbles: true }) as PointerEvent
    Object.defineProperty(deskClick, "button", { value: 0 })
    Object.defineProperty(deskClick, "pointerType", { value: "mouse" })
    Object.defineProperty(deskClick, "clientX", { value: desk0.x + 40 })
    Object.defineProperty(deskClick, "clientY", { value: desk0.y + 30 })
    container.dispatchEvent(deskClick)
    expect(onStationTrigger).toHaveBeenCalledWith({
      station: "mydesk",
      modal: "mine",
      focusProposal: undefined,
    })

    // KeyD with Vietnamese Telex key ("đ") still moves right via event.code
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyD", key: "đ" })
    )
    step(0.1)
    expect(states.at(-1)!.x).toBeGreaterThan(startX)

    // Pressing Meta clears held keys immediately
    const xAfterMove = states.at(-1)!.x
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "MetaLeft", metaKey: true })
    )
    step(0.1)
    expect(states.at(-1)!.x).toBe(xAfterMove)

    // Window blur clears held keys
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyS", key: "s" })
    )
    window.dispatchEvent(new Event("blur"))
    const yBeforeBlurTick = states.at(-1)!.y
    step(0.1)
    expect(states.at(-1)!.y).toBe(yBeforeBlurTick)

    // Document visibilitychange hidden clears held keys
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyS", key: "s" })
    )
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    })
    document.dispatchEvent(new Event("visibilitychange"))
    step(0.1)
    expect(states.at(-1)!.y).toBe(yBeforeBlurTick)
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    })

    // Click-to-walk target is cleared when modal opens so closing modal does NOT resume walking
    const ptrEvent = new Event("pointerdown", { bubbles: true }) as PointerEvent
    Object.defineProperty(ptrEvent, "button", { value: 0 })
    Object.defineProperty(ptrEvent, "pointerType", { value: "mouse" })
    Object.defineProperty(ptrEvent, "clientX", { value: 600 })
    Object.defineProperty(ptrEvent, "clientY", { value: 950 })
    container.dispatchEvent(ptrEvent)
    step(0.05)
    const posBeforeModal = { ...states.at(-1)! }
    expect(posBeforeModal.moving).toBe(true)

    controller.setModalOpen(true)
    controller.setModalOpen(false)
    step(0.1)
    expect(states.at(-1)!.x).toBe(posBeforeModal.x)
    expect(states.at(-1)!.y).toBe(posBeforeModal.y)
    expect(states.at(-1)!.moving).toBe(false)
    expect(startY).toBeGreaterThan(0)

    controller.dispose()
    container.remove()
  })

  it("opens Boss ManagerModal when Boss clicks Boss Desk", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { host } = createMockHost()
    const onStationTrigger = vi.fn()

    const bossMe = makeStaffMe({
      role: "boss",
      self: {
        id: "m-boss",
        userId: "u-boss",
        role: "boss",
        displayName: "Lê Huy",
        avatar: "male04",
        avatarColor: null,
        deskIndex: null,
        accentColor: "#B7791F",
        online: true,
      },
    })
    const controller = new OfficeController(host, container, {
      onStationTrigger,
    })
    controller.updateTeam(bossMe)

    const bossClick = new Event("pointerdown", { bubbles: true }) as PointerEvent
    Object.defineProperty(bossClick, "button", { value: 0 })
    Object.defineProperty(bossClick, "pointerType", { value: "mouse" })
    Object.defineProperty(bossClick, "clientX", {
      value: OFFICE_NORTH_PROPS.bossDesk.x + 80,
    })
    Object.defineProperty(bossClick, "clientY", {
      value: OFFICE_NORTH_PROPS.bossDesk.y + 40,
    })
    container.dispatchEvent(bossClick)
    expect(onStationTrigger).toHaveBeenCalledWith({
      station: "boss",
      modal: "mgr",
      focusProposal: false,
    })

    controller.dispose()
    container.remove()
  })

  it("hides staff self overhead nameplate when standing at own desk and shows it once walking away", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { host, step } = createMockHost()

    const controller = new OfficeController(host, container, {})
    controller.updateTeam(makeStaffMe())

    step(0.016)
    const plate = container.querySelector(".of-nameplate") as HTMLElement
    expect(plate).not.toBeNull()
    expect(plate.style.display).toBe("none")

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowDown" }))
    for (let i = 0; i < 8; i += 1) {
      step(0.05)
    }
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowDown" }))
    expect(plate.style.display).toBe("inline-flex")
    expect(plate.textContent).toContain("Lê Ngọc Hạnh (bạn)")

    controller.dispose()
    container.remove()
  })

  it("uses cover default zoom (fills canvas, no empty margins), KGD wheel/pinch zoom range (0.72x..2.3x), and preserves HUD-aware clamping", () => {
    // 1. Cover default zoom across desktop (1440x900), ultrawide (1920x900), tablet (960x700), phone (390x760)
    for (const [w, h] of [
      [1440, 900],
      [1920, 900],
      [1280, 720],
      [960, 700],
      [390, 760],
    ] as const) {
      const coverMin = computeOfficeCoverMinZoom(w, h)
      const defaultZoom = computeOfficeResponsiveZoom(1.0, w, h, coverMin)
      expect(
        defaultZoom,
        `default zoom at ${w}x${h} must cover canvas (>= minFillZoom)`
      ).toBeGreaterThanOrEqual(coverMin)
      expect(defaultZoom).toBeLessThanOrEqual(OFFICE_MAX_ZOOM)

      // Even zooming all the way out stays >= coverMin (never exposes empty margins)
      const zoomedOut = computeOfficeResponsiveZoom(
        OFFICE_MIN_ZOOM,
        w,
        h,
        coverMin
      )
      expect(zoomedOut).toBeGreaterThanOrEqual(coverMin)
    }

    // 2. Desktop (>=1101px) HUD-aware framing keeps Boss, Desk #0, Staff & Standee clear of HUD columns
    expect(resolveOfficeHudInsets(1440, "boss")).toEqual({
      leftPx: OFFICE_DESKTOP_HUD_COL_PX,
      rightPx: OFFICE_DESKTOP_HUD_COL_PX,
    })
    expect(resolveOfficeHudInsets(1440, "staff")).toEqual({
      leftPx: 0,
      rightPx: OFFICE_DESKTOP_HUD_COL_PX,
    })

    const desktopZoom = computeOfficeResponsiveZoom(1.0, 1440, 900)
    const bossCamDesktop = computeOfficeCameraTarget({
      lx: OFFICE_BOSS_SPAWN.x,
      ly: OFFICE_BOSS_SPAWN.y,
      worldW: OFFICE_BASE_W,
      worldH: OFFICE_BASE_H,
      viewportW: 1440,
      viewportH: 900,
      zoom: desktopZoom,
      role: "boss",
    })
    const bossScreenX = projectLogicalXWithHostClamp(
      OFFICE_BOSS_SPAWN.x,
      bossCamDesktop.x,
      1440,
      900,
      desktopZoom
    )
    expect(bossScreenX).toBeGreaterThan(OFFICE_DESKTOP_HUD_COL_PX)
    expect(bossScreenX).toBeLessThan(1440 - OFFICE_DESKTOP_HUD_COL_PX)

    const desk0 = deskSlotCoords(0)
    const desk0LeftScreenX = projectLogicalXWithHostClamp(
      desk0.x,
      bossCamDesktop.x,
      1440,
      900,
      desktopZoom
    )
    expect(desk0LeftScreenX).toBeGreaterThan(OFFICE_DESKTOP_HUD_COL_PX)

    const staffMidCam = computeOfficeCameraTarget({
      lx: 1000,
      ly: 932,
      worldW: OFFICE_BASE_W,
      worldH: OFFICE_BASE_H,
      viewportW: 1440,
      viewportH: 900,
      zoom: desktopZoom,
      role: "staff",
    })
    expect(staffMidCam.x).toBeGreaterThan(1000)
    const staffMidScreenX = projectLogicalXWithHostClamp(
      1000,
      staffMidCam.x,
      1440,
      900,
      desktopZoom
    )
    expect(staffMidScreenX).toBeCloseTo(
      (1440 - OFFICE_DESKTOP_HUD_COL_PX) / 2,
      0
    )

    // 3. Tablet (721-1100px) & Phone (<=720px)
    expect(resolveOfficeHudInsets(960, "boss")).toEqual({
      leftPx: OFFICE_TABLET_HUD_COL_PX,
      rightPx: OFFICE_TABLET_HUD_COL_PX,
    })
    expect(resolveOfficeHudInsets(390, "boss")).toEqual({
      leftPx: 0,
      rightPx: 0,
    })
    const phoneCam = computeOfficeCameraTarget({
      lx: 295,
      ly: 932,
      worldW: OFFICE_BASE_W,
      worldH: OFFICE_BASE_H,
      viewportW: 390,
      viewportH: 760,
      zoom: 1.24,
      role: "staff",
    })
    expect(phoneCam).toEqual({ x: 295, y: 932 - 48 })

    // 4. Interactive zoom range matches KGD (cover floor .. 2.3x)
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { host } = createMockHost({ width: 1440, height: 900 })
    const controller = new OfficeController(host, container, {})
    const coverFloor = computeOfficeCoverMinZoom(1440, 900)
    expect(host.getTargetZoom()).toBeGreaterThanOrEqual(coverFloor)

    for (let i = 0; i < 20; i += 1) controller.setZoomDelta(-1)
    expect(host.getTargetZoom()).toBeCloseTo(coverFloor, 4)
    for (let i = 0; i < 30; i += 1) controller.setZoomDelta(1)
    expect(host.getTargetZoom()).toBeCloseTo(OFFICE_MAX_ZOOM, 4)

    controller.dispose()
    container.remove()
  })

  it("renders open-floor stone tile, grand Team LED Board, ticker ribbon, instanced 24-desk pods, clutter & 3 plant varieties, handles >24 expansion, and disposes cleanly", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { host, setWorldSize } = createMockHost()

    const controller = new OfficeController(host, container, {})
    controller.updateTeam(makeStaffMe())

    const instancedByName = (name: string): THREE.InstancedMesh[] => {
      const out: THREE.InstancedMesh[] = []
      host.scene.traverse((obj) => {
        if (obj instanceof THREE.InstancedMesh && obj.name === name) {
          out.push(obj)
        }
      })
      return out
    }

    // Open-floor architectural features exist
    expect(host.scene.getObjectByName("office-open-stone-floor")).toBeTruthy()
    expect(host.scene.getObjectByName("office-team-led-board")).toBeTruthy()
    expect(host.scene.getObjectByName("office-stock-ticker-ribbon")).toBeTruthy()
    expect(host.scene.getObjectByName("office-zone-label-work")).toBeTruthy()
    expect(host.scene.getObjectByName("office-zone-label-lounge")).toBeTruthy()
    expect(host.scene.getObjectByName("office-zone-label-awards")).toBeTruthy()
    expect(instancedByName("office-plant-fiddle-instanced").length).toBeGreaterThan(0)
    expect(instancedByName("office-plant-monstera-instanced").length).toBeGreaterThan(0)
    expect(instancedByName("office-plant-snake-instanced").length).toBeGreaterThan(0)

    // 1 staff member -> 24 total desks (1 ON + 23 OFF + 23 "Bàn trống" plates + 6 pod dividers + desk clutter)
    expect(instancedByName("office-staff-desks-instanced")[0]!.count).toBe(
      MAX_STAFF_DESKS
    )
    expect(instancedByName("office-staff-chairs-instanced")[0]!.count).toBe(
      MAX_STAFF_DESKS
    )
    expect(instancedByName("office-monitors-on")[0]!.count).toBe(1)
    expect(instancedByName("office-monitors-off")[0]!.count).toBe(
      MAX_STAFF_DESKS - 1
    )
    expect(instancedByName("office-empty-desk-plates")[0]!.count).toBe(
      MAX_STAFF_DESKS - 1
    )
    expect(instancedByName("office-pod-dividers-instanced")[0]!.count).toBe(6)
    expect(
      instancedByName("office-desk-succulents-instanced").length
    ).toBeGreaterThan(0)
    expect(
      instancedByName("office-desk-stickies-instanced").length
    ).toBeGreaterThan(0)
    expect(host.scene.getObjectByName("office-team-banner-rug")).toBeTruthy()
    expect(host.scene.getObjectByName("office-self-desk-plate")).toBeTruthy()

    // Exceed MAX_STAFF_DESKS (30 staff) -> world height grows to 1910, 36 instanced desks, 9 pod dividers
    const members30: OfficeMember[] = [
      {
        id: "m-boss",
        userId: "u-boss",
        role: "boss",
        displayName: "Lê Huy",
        avatar: "male04",
        avatarColor: null,
        deskIndex: null,
        accentColor: "#B7791F",
        online: true,
      },
      ...Array.from({ length: 30 }, (_, idx) => ({
        id: `m-${idx + 1}`,
        userId: idx === 0 ? "u-staff-1" : `u-staff-${idx + 1}`,
        role: "staff" as const,
        displayName: `Nhân viên ${idx + 1}`,
        avatar: null,
        avatarColor: null,
        deskIndex: idx,
        accentColor: "#1D6FE8",
        online: idx === 0,
      })),
    ]
    controller.updateTeam(makeStaffMe({ members: members30 }))
    expect(setWorldSize).toHaveBeenCalledWith(
      OFFICE_BASE_W,
      OFFICE_BASE_H + OFFICE_EXTRA_BAND_STEP
    )
    expect(instancedByName("office-staff-desks-instanced")[0]!.count).toBe(36)
    expect(instancedByName("office-monitors-on")[0]!.count).toBe(30)
    expect(instancedByName("office-monitors-off")[0]!.count).toBe(6)
    expect(instancedByName("office-pod-dividers-instanced")[0]!.count).toBe(9)

    controller.dispose()

    // Lite mode builds & disposes cleanly
    const liteScene = new THREE.Scene()
    const liteWorld = new OfficeWorld3D(
      liteScene,
      {
        logicalW: OFFICE_BASE_W,
        logicalH: OFFICE_BASE_H,
        scale: OFFICE_WORLD_SCALE,
      },
      true
    )
    const desks2 = buildDeskPositions(members30.slice(0, 3))
    liteWorld.rebuildTeamProps("Lê Huy", desks2, "u-staff-1", OFFICE_BASE_H)
    expect(liteScene.getObjectByName("office-team-banner-rug")).toBeTruthy()
    liteWorld.dispose()
    container.remove()
  })

  it("time-sliced boot build (architecture + team pods) produces the same scene as the synchronous build", async () => {
    const worldCfg = () => ({
      logicalW: OFFICE_BASE_W,
      logicalH: OFFICE_BASE_H,
      scale: OFFICE_WORLD_SCALE,
    })
    const desks = buildDeskPositions(makeStaffMe().members)
    const syncScene = new THREE.Scene()
    const syncWorld = new OfficeWorld3D(syncScene, worldCfg(), false)
    syncWorld.rebuildTeamProps("Lê Huy", desks, "u-staff-1", OFFICE_BASE_H)

    const slicedScene = new THREE.Scene()
    const slicedWorld = new OfficeWorld3D(slicedScene, worldCfg(), false, {
      deferBuild: true,
    })
    const yieldFn = vi.fn(() => Promise.resolve())
    await expect(
      slicedWorld.buildAsync({ budgetMs: 1, yieldFn })
    ).resolves.toBe(true)
    await expect(
      runBuildChunked(
        slicedWorld.rebuildTeamPropsSteps(
          "Lê Huy",
          desks,
          "u-staff-1",
          OFFICE_BASE_H
        ),
        { budgetMs: 1, yieldFn }
      )
    ).resolves.toBe(true)
    expect(yieldFn.mock.calls.length).toBeGreaterThan(5)

    const sig = (root: THREE.Object3D) => {
      const out: string[] = []
      root.traverse((o) => {
        const geo = (o as THREE.Mesh).geometry as
          | THREE.BufferGeometry
          | undefined
        const p = o.position
        out.push(
          `${o.type}:${o.name}:${geo?.attributes?.position?.count ?? 0}:${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`
        )
      })
      return out
    }
    expect(sig(slicedScene)).toEqual(sig(syncScene))
    syncWorld.dispose()
    slicedWorld.dispose()
  })

  it("respects prefers-reduced-motion and releases WebGL context on dispose", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      addEventListener() {},
      removeEventListener() {},
    }))
    expect(prefersReducedMotion()).toBe(true)

    const mock = createMockHost({ width: 1440, height: 900 })
    createHostMock.mockReturnValue(mock.host)

    const handle = startOffice(container)
    await vi.waitFor(() => expect(createHostMock).toHaveBeenCalledTimes(1))

    expect(getZoneRugs().length).toBeGreaterThanOrEqual(7)
    expect(getOfficeNorthWindows().length).toBeGreaterThanOrEqual(3)

    const world = new OfficeWorld3D(mock.host.scene, mock.host.world, false)
    world.showTargetRing(500, 900)
    world.update(0.25)
    expect(mock.host.scene.getObjectByName("office-world-3d")).toBeTruthy()
    world.dispose()

    handle.dispose()
    expect(mock.forceContextLoss).toHaveBeenCalledTimes(1)

    container.remove()
    vi.unstubAllGlobals()
  })
})
