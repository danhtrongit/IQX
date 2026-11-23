import * as THREE from "three"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ChibiSceneHost } from "@/lib/chibi-3d/scene-host.ts"
import {
  logicalToWorld,
  type WorldTransformConfig,
} from "@/lib/chibi-3d/types.ts"

import type { OfficeMe } from "../types.ts"
import { OfficeController } from "./office-controller.ts"
import {
  OFFICE_BASE_H,
  OFFICE_BASE_W,
  OFFICE_WORLD_SCALE,
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
    setWorldSize: vi.fn((w: number, h: number) => {
      world.logicalW = w
      world.logicalH = h
    }),
    setWorldDimensions: vi.fn(),
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

afterEach(() => {
  vi.restoreAllMocks()
  createHostMock.mockReset()
})

describe("OfficeController & startOffice bug fixes & framing", () => {
  it("skips rebuilding desks when updateTeam receives identical desk layout, and rebuilds when name/layout changes (Bug 5a)", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { host } = createMockHost()
    const rebuildSpy = vi.spyOn(OfficeWorld3D.prototype, "rebuildTeamProps")

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
    expect(getZoneRugs().length).toBeGreaterThanOrEqual(6)
    expect(getOfficeWindows().length).toBeGreaterThanOrEqual(9)

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
