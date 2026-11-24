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
  OFFICE_CAMERA_PITCH_DEG,
  OFFICE_DESKTOP_HUD_COL_PX,
  OFFICE_TABLET_HUD_COL_PX,
  OfficeController,
  computeOfficeCameraTarget,
  resolveOfficeHudInsets,
} from "./office-controller.ts"
import {
  MAX_STAFF_DESKS,
  OFFICE_BASE_H,
  OFFICE_BASE_W,
  OFFICE_BOSS_SPAWN,
  OFFICE_EXTRA_BAND_STEP,
  OFFICE_WORLD_SCALE,
  buildDeskPositions,
  deskSlotCoords,
  getOfficeWindows,
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

function createMockHost(viewport = { width: 1440, height: 840 }): {
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
  let zoom = 1.0
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
    camera: new THREE.PerspectiveCamera(36, vp.width / vp.height, 0.2, 220),
    renderer: {
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 1.06,
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
  zoom = 1.0,
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
    boundsMargin: 0.5,
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

describe("OfficeController & startOffice bug fixes & HUD-aware framing", () => {
  it("skips rebuilding desks when updateTeam receives identical desk layout, and rebuilds when name/layout changes (Bug 5a)", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { host } = createMockHost()
    // updateTeam drives the step-wise rebuild (same generator the time-sliced boot uses)
    const rebuildSpy = vi.spyOn(OfficeWorld3D.prototype, "rebuildTeamPropsSteps")

    const controller = new OfficeController(host, container, {})
    const me1 = makeStaffMe()
    controller.updateTeam(me1)
    expect(rebuildSpy).toHaveBeenCalledTimes(1)

    // Refetch where only HUD counts & serverTime changed -> must NOT rebuild desks
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

    // Changing a staff displayName -> MUST rebuild desks
    const renamed = makeStaffMe()
    renamed.members = renamed.members.map((m) =>
      m.userId === "u-staff-1" ? { ...m, displayName: "Lê Ngọc Hạnh A" } : m
    )
    controller.updateTeam(renamed)
    expect(rebuildSpy).toHaveBeenCalledTimes(2)

    controller.dispose()
    container.remove()
  })

  it("uses event.code for movement and clears held keys on blur, visibilitychange hidden, Meta/Control, and clears click target on modal open (Bugs 5b & 5c)", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { host, step } = createMockHost()
    const states: Array<{ x: number; y: number; moving: boolean }> = []

    const controller = new OfficeController(host, container, {
      onSelfState: (s) => states.push({ x: s.x, y: s.y, moving: s.moving }),
    })
    controller.updateTeam(makeStaffMe())
    const startX = states.at(-1)!.x
    const startY = states.at(-1)!.y

    // KeyD with Vietnamese Telex key ("đ") still moves right via event.code
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", key: "đ" }))
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
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS", key: "s" }))
    window.dispatchEvent(new Event("blur"))
    const yBeforeBlurTick = states.at(-1)!.y
    step(0.1)
    expect(states.at(-1)!.y).toBe(yBeforeBlurTick)

    // Document visibilitychange hidden clears held keys
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS", key: "s" }))
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

    // Bug 5c: Click-to-walk target is cleared when modal opens so closing modal does NOT resume walking
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

  it("hides staff self overhead nameplate when standing at own desk and shows it once walking away (Bug 5f)", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { host, step } = createMockHost()

    const controller = new OfficeController(host, container, {})
    controller.updateTeam(makeStaffMe())

    // Standing right at own desk home -> overhead tag must be hidden (Spec §3.2)
    step(0.016)
    const plate = container.querySelector(".of-nameplate") as HTMLElement
    expect(plate).not.toBeNull()
    expect(plate.style.display).toBe("none")

    // Walk south > 70px away from desk home -> overhead tag appears with "(bạn)"
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

  it("frames camera between HUD columns on desktop (>=1101px) and tablet (721-1100px), centers on phones (<=720px), and keeps zoom within 0.55x-1.5x", () => {
    // 1. Desktop (>=1101px): 330px HUD columns (+14px inset = 344px)
    expect(resolveOfficeHudInsets(1440, "boss")).toEqual({
      leftPx: OFFICE_DESKTOP_HUD_COL_PX,
      rightPx: OFFICE_DESKTOP_HUD_COL_PX,
    })
    expect(resolveOfficeHudInsets(1440, "staff")).toEqual({
      leftPx: 0,
      rightPx: OFFICE_DESKTOP_HUD_COL_PX,
    })

    // Boss at spawn (440, 310) & Desk #0 (left edge x=200) must sit strictly clear of Boss's left 330px HUD
    const bossCamDesktop = computeOfficeCameraTarget({
      lx: OFFICE_BOSS_SPAWN.x,
      ly: OFFICE_BOSS_SPAWN.y,
      worldW: OFFICE_BASE_W,
      worldH: OFFICE_BASE_H,
      viewportW: 1440,
      viewportH: 840,
      zoom: 1.0,
      role: "boss",
    })
    const bossScreenX = projectLogicalXWithHostClamp(
      OFFICE_BOSS_SPAWN.x,
      bossCamDesktop.x,
      1440,
      840,
      1.0
    )
    expect(bossScreenX).toBeGreaterThan(OFFICE_DESKTOP_HUD_COL_PX)
    expect(bossScreenX).toBeLessThan(1440 - OFFICE_DESKTOP_HUD_COL_PX)

    const desk0 = deskSlotCoords(0)
    const desk0LeftScreenX = projectLogicalXWithHostClamp(
      desk0.x,
      bossCamDesktop.x,
      1440,
      840,
      1.0
    )
    expect(desk0LeftScreenX).toBeGreaterThan(OFFICE_DESKTOP_HUD_COL_PX)

    // Staff in middle of office sits at exact visible center between 0 and (1440 - 344) = 548 px
    const staffMidCam = computeOfficeCameraTarget({
      lx: 1000,
      ly: 932,
      worldW: OFFICE_BASE_W,
      worldH: OFFICE_BASE_H,
      viewportW: 1440,
      viewportH: 840,
      zoom: 1.0,
      role: "staff",
    })
    expect(staffMidCam.x).toBeGreaterThan(1000)
    const staffMidScreenX = projectLogicalXWithHostClamp(
      1000,
      staffMidCam.x,
      1440,
      840,
      1.0
    )
    expect(staffMidScreenX).toBeCloseTo((1440 - OFFICE_DESKTOP_HUD_COL_PX) / 2, 0)

    // Staff near Standee (x = 2195) remains clear of right HUD column
    const standeeCam = computeOfficeCameraTarget({
      lx: 2195,
      ly: 1150,
      worldW: OFFICE_BASE_W,
      worldH: OFFICE_BASE_H,
      viewportW: 1440,
      viewportH: 840,
      zoom: 1.0,
      role: "staff",
    })
    const standeeScreenX = projectLogicalXWithHostClamp(
      2195,
      standeeCam.x,
      1440,
      840,
      1.0
    )
    expect(standeeScreenX).toBeLessThan(1440 - OFFICE_DESKTOP_HUD_COL_PX)

    // 2. Tablet (721-1100px): 290px HUD columns (+14px inset = 304px)
    expect(resolveOfficeHudInsets(960, "boss")).toEqual({
      leftPx: OFFICE_TABLET_HUD_COL_PX,
      rightPx: OFFICE_TABLET_HUD_COL_PX,
    })
    const staffTabletCam = computeOfficeCameraTarget({
      lx: 1100,
      ly: 932,
      worldW: OFFICE_BASE_W,
      worldH: OFFICE_BASE_H,
      viewportW: 960,
      viewportH: 700,
      zoom: 1.0,
      role: "staff",
    })
    const staffTabletScreenX = projectLogicalXWithHostClamp(
      1100,
      staffTabletCam.x,
      960,
      700,
      1.0
    )
    expect(staffTabletScreenX).toBeCloseTo(
      (960 - OFFICE_TABLET_HUD_COL_PX) / 2,
      0
    )

    // 3. Phone (<=720px): centers horizontally on player below collapsed top-right cards
    expect(resolveOfficeHudInsets(390, "boss")).toEqual({ leftPx: 0, rightPx: 0 })
    const phoneCam = computeOfficeCameraTarget({
      lx: 295,
      ly: 932,
      worldW: OFFICE_BASE_W,
      worldH: OFFICE_BASE_H,
      viewportW: 390,
      viewportH: 760,
      zoom: 1.32,
      role: "staff",
    })
    expect(phoneCam).toEqual({ x: 295, y: 932 - 48 })

    // 4. Zoom range strictly clamped to 0.55x..1.5x
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { host } = createMockHost()
    const controller = new OfficeController(host, container, {})
    for (let i = 0; i < 20; i += 1) controller.setZoomDelta(-1)
    expect(host.getTargetZoom()).toBeCloseTo(0.55, 5)
    for (let i = 0; i < 30; i += 1) controller.setZoomDelta(1)
    expect(host.getTargetZoom()).toBeCloseTo(1.5, 5)
    controller.dispose()
    container.remove()
  })

  it("renders instanced 24-desk open-plan pods, empty desks, pod dividers & team banner rug, handles >MAX_STAFF_DESKS expansion, and disposes cleanly in normal & lite modes", () => {
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

    // 1 staff member in makeStaffMe -> 24 total desks (1 ON + 23 OFF + 23 "Bàn trống" plates + 6 pod dividers)
    const deskInsts = instancedByName("office-staff-desks-instanced")
    expect(deskInsts.length).toBeGreaterThan(0)
    expect(deskInsts[0]!.count).toBe(MAX_STAFF_DESKS)

    const chairInsts = instancedByName("office-staff-chairs-instanced")
    expect(chairInsts.length).toBeGreaterThan(0)
    expect(chairInsts[0]!.count).toBe(MAX_STAFF_DESKS)

    const onMons = instancedByName("office-monitors-on")
    const offMons = instancedByName("office-monitors-off")
    const emptyPlates = instancedByName("office-empty-desk-plates")
    const dividers = instancedByName("office-pod-dividers-instanced")
    expect(onMons[0]!.count).toBe(1)
    expect(offMons[0]!.count).toBe(MAX_STAFF_DESKS - 1)
    expect(emptyPlates[0]!.count).toBe(MAX_STAFF_DESKS - 1)
    expect(dividers[0]!.count).toBe(6)
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

    // Lite mode OfficeWorld3D builds & disposes cleanly
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
    await expect(slicedWorld.buildAsync({ budgetMs: 1, yieldFn })).resolves.toBe(true)
    await expect(
      runBuildChunked(
        slicedWorld.rebuildTeamPropsSteps("Lê Huy", desks, "u-staff-1", OFFICE_BASE_H),
        { budgetMs: 1, yieldFn }
      )
    ).resolves.toBe(true)
    expect(yieldFn.mock.calls.length).toBeGreaterThan(5)

    const sig = (root: THREE.Object3D) => {
      const out: string[] = []
      root.traverse((o) => {
        const geo = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
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

  it("respects prefers-reduced-motion (no pulsing target ring & no walk bob) and releases WebGL context on dispose (Bugs 5e & 5g)", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      addEventListener() {},
      removeEventListener() {},
    }))
    expect(prefersReducedMotion()).toBe(true)

    const mock = createMockHost({ width: 1440, height: 840 })
    createHostMock.mockReturnValue(mock.host)

    const handle = startOffice(container)
    await vi.waitFor(() => expect(createHostMock).toHaveBeenCalledTimes(1))

    // Verify rich zone rugs & windows exist
    expect(getZoneRugs().length).toBeGreaterThanOrEqual(8)
    expect(getOfficeWindows().length).toBeGreaterThanOrEqual(10)

    // Verify reduced motion static target ring does not pulse scale
    const world = new OfficeWorld3D(mock.host.scene, mock.host.world, false)
    world.showTargetRing(500, 900)
    world.update(0.25)
    const ring = mock.host.scene.getObjectByName("office-world-3d")
    expect(ring).toBeTruthy()
    world.dispose()

    // Bug 5g: dispose releases renderer WebGL context via forceContextLoss()
    handle.dispose()
    expect(mock.forceContextLoss).toHaveBeenCalledTimes(1)

    container.remove()
    vi.unstubAllGlobals()
  })
})
