import { render, screen, waitFor } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { logicalToWorld, worldToLogical } from "@/lib/chibi-3d/types.ts"

import { resetBridge, ui } from "../bridge.ts"
import { facingOf } from "./floor-controller.ts"
import { FLOOR_WORLD_CONFIG, buildFloorNavGrid } from "./floor-world-3d.ts"
import { SPAWN, WORLD_H, WORLD_W } from "./layout.ts"
import { OverlayLayer } from "./overlay-layer.ts"
import { startFloor } from "./start-floor.ts"

const openAuth = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: null, openAuth }),
}))

const { JoinScreen } = await import("../ui/JoinScreen.tsx")

afterEach(() => {
  resetBridge()
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
