import { afterEach, describe, expect, it, vi } from "vitest"

import {
  OFFICE_CLOSE_AUTH,
  OFFICE_CLOSE_FORBIDDEN,
  createOfficeSocket,
  type OfficeWebSocketLike,
} from "../office-socket.ts"
import type { OfficeMember } from "../types.ts"
import {
  OFFICE_HUD_STORAGE_KEY,
  formatDayMonth,
  formatFileSize,
  formatFullDate,
  formatHm,
  formatTenureVi,
  isWorkdayToday,
  nextMonthResetLabel,
  normalizeVi,
  readHudCollapseState,
  writeHudCollapseState,
} from "../utils.ts"
import {
  OFFICE_BASE_H,
  OFFICE_BASE_W,
  OFFICE_BOSS_SPAWN,
  OFFICE_DIVIDER_Y,
  OFFICE_DOORWAYS,
  OFFICE_STAFF_FALLBACK_SPAWN,
  OFFICE_STATION_RADIUS,
  buildDeskPositions,
  buildOfficeObstacles,
  buildOfficeStations,
  computeOfficeDimensions,
  findNearestStation,
  isOfficeBlocked,
  moveWithSlide,
  officeFacingFromDelta,
  officeFacingToRadians,
} from "./office-layout.ts"
import { startOffice } from "./start-office.ts"

function makeStaffMembers(count: number): OfficeMember[] {
  return Array.from({ length: count }, (_, idx) => ({
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
}

afterEach(() => {
  window.localStorage.removeItem(OFFICE_HUD_STORAGE_KEY)
})

describe("office-layout geometry, doorways, collision & dynamic desks", () => {
  it("keeps all 3 doorways passable and interior walls solid", () => {
    const obstacles = buildOfficeObstacles(11)

    // Boss spawn & staff fallback spawn are walkable across normal & expanded (>12) layouts
    expect(
      isOfficeBlocked(OFFICE_BOSS_SPAWN.x, OFFICE_BOSS_SPAWN.y, obstacles)
    ).toBe(false)
    for (const count of [0, 1, 11, 12, 18]) {
      const dims = computeOfficeDimensions(count)
      const obs = buildOfficeObstacles(count)
      expect(
        isOfficeBlocked(
          OFFICE_STAFF_FALLBACK_SPAWN.x,
          OFFICE_STAFF_FALLBACK_SPAWN.y,
          obs,
          dims.width,
          dims.height
        ),
        `fallback spawn should be clear for staffCount=${count}`
      ).toBe(false)
    }

    // All 3 doorways along y = 540 must be passable at their midpoints
    for (const door of OFFICE_DOORWAYS) {
      const midX = (door.x1 + door.x2) / 2
      expect(
        isOfficeBlocked(midX, OFFICE_DIVIDER_Y + 8, obstacles),
        `doorway ${door.id} should be passable`
      ).toBe(false)
    }

    // Solid horizontal divider segments block actors
    for (const solidX of [120, 760, 1560, 2200]) {
      expect(
        isOfficeBlocked(solidX, OFFICE_DIVIDER_Y + 8, obstacles),
        `divider wall at x=${solidX} should block`
      ).toBe(true)
    }

    // Vertical top-room dividers block actors
    expect(isOfficeBlocked(748, 260, obstacles)).toBe(true)
    expect(isOfficeBlocked(1568, 260, obstacles)).toBe(true)

    // Outer world bounds enforce margins
    expect(isOfficeBlocked(20, 300, obstacles)).toBe(true)
    expect(isOfficeBlocked(OFFICE_BASE_W - 20, 300, obstacles)).toBe(true)
    expect(isOfficeBlocked(500, 30, obstacles)).toBe(true)
    expect(isOfficeBlocked(500, OFFICE_BASE_H - 10, obstacles)).toBe(true)
  })

  it("slides smoothly along X and Y axes when pushing diagonally into a wall", () => {
    const obstacles = buildOfficeObstacles(11)

    // Standing right below the corridor wall at x=600, y=572: moving up-right (-y blocked, +x free)
    const slideX = moveWithSlide(600, 572, 20, -20, obstacles)
    expect(slideX.moved).toBe(true)
    expect(slideX.x).toBe(620)
    expect(slideX.y).toBe(572)

    // Standing right to the left of vertical wall x=740 at x=726, y=300: moving right-down (+x blocked, +y free)
    const slideY = moveWithSlide(726, 300, 20, 25, obstacles)
    expect(slideY.moved).toBe(true)
    expect(slideY.x).toBe(726)
    expect(slideY.y).toBe(325)
  })

  it("builds exact role-filtered stations and detects proximity strictly within < 95 px", () => {
    const bossStations = buildOfficeStations("boss", null, 11)
    expect(bossStations.map((s) => s.id)).toEqual([
      "boss",
      "meet",
      "docs",
      "stand",
    ])
    expect(bossStations[0]?.label).toBe("Bàn sếp · Quản lý")
    expect(bossStations[0]?.modal).toBe("mgr")
    expect(bossStations[0]?.focusProposal).toBe(false)

    const staffHome = { x: 245, y: 870 }
    const staffStations = buildOfficeStations("staff", staffHome, 12)
    expect(staffStations.map((s) => s.id)).toEqual([
      "boss",
      "meet",
      "docs",
      "stand",
      "mydesk",
    ])
    expect(staffStations[0]?.label).toBe("Bàn sếp · Gửi đề xuất")
    expect(staffStations[0]?.modal).toBe("mine")
    expect(staffStations[0]?.focusProposal).toBe(true)
    expect(staffStations[3]?.label).toBe("Thành tích tháng 12")
    expect(staffStations[4]?.x).toBe(staffHome.x)
    expect(staffStations[4]?.y).toBe(staffHome.y + 10)

    // Within < 95 px triggers, >= 95 px does not
    expect(findNearestStation(440, 340 + 94, staffStations)?.id).toBe("boss")
    expect(
      findNearestStation(440, 340 + OFFICE_STATION_RADIUS, staffStations)
    ).toBeNull()
  })

  it("spaces desks comfortably away from Coffee Counter and dynamically expands rows for >12 staff", () => {
    const desks12 = buildDeskPositions(makeStaffMembers(12))
    const dims12 = computeOfficeDimensions(12)
    expect(dims12.width).toBe(OFFICE_BASE_W)
    expect(dims12.height).toBe(OFFICE_BASE_H)
    expect(dims12.rows).toBe(2)

    // 6th desk in row 0 must leave generous aisle (> 150 px) before Coffee Bar at x=1860
    const sixthDesk = desks12[5]!
    expect(1860 - (sixthDesk.x + sixthDesk.w)).toBeGreaterThanOrEqual(150)

    // 16 staff expands into 3 rows and keeps every staff desk home walkable
    const desks16 = buildDeskPositions(makeStaffMembers(16))
    const dims16 = computeOfficeDimensions(16)
    expect(dims16.rows).toBe(3)
    expect(dims16.height).toBe(OFFICE_BASE_H + 330)

    const obstacles16 = buildOfficeObstacles(desks16)
    for (const desk of desks16) {
      expect(
        isOfficeBlocked(
          desk.home.x,
          desk.home.y,
          obstacles16,
          dims16.width,
          dims16.height
        ),
        `desk ${desk.index} home should be walkable`
      ).toBe(false)
    }

    // Facing conversion sanity
    expect(officeFacingFromDelta(10, 2)).toBe("right")
    expect(officeFacingFromDelta(-10, 2)).toBe("left")
    expect(officeFacingFromDelta(1, 10)).toBe("down")
    expect(officeFacingFromDelta(1, -10)).toBe("up")
    expect(officeFacingToRadians("down")).toBe(0)
    expect(officeFacingToRadians("up")).toBe(Math.PI)
  })
})

describe("office utils (Vietnamese search, tenure, UTC+7 dates & HUD persistence)", () => {
  it("normalizes Vietnamese diacritics and đ/Đ cleanly", () => {
    expect(normalizeVi("Đặng Ngọc Hạnh")).toBe("dang ngoc hanh")
    expect(normalizeVi("  Nguyễn Văn Ân  ")).toBe("nguyen van an")
    expect(normalizeVi("PHẠM THỊ BÌNH")).toBe("pham thi binh")
  })

  it("formats tenure with zero-unit omission and zero UTC drift across month boundaries", () => {
    expect(formatTenureVi("2026-11-23", "2026-11-23")).toBe("0 ngày")
    expect(formatTenureVi("2026-12-01", "2026-11-23")).toBe("0 ngày")
    expect(formatTenureVi("2024-11-23", "2026-11-23")).toBe("2 năm")
    expect(formatTenureVi("2026-08-18", "2026-11-23")).toBe("3 tháng 5 ngày")
    expect(formatTenureVi("2025-11-19", "2026-11-23")).toBe("1 năm 4 ngày")
    // Clamped month-end anchor: Jan 31 -> Feb 28 (1 month) + 2 days = Mar 02
    expect(formatTenureVi("2025-01-31", "2025-03-02")).toBe("1 tháng 2 ngày")
  })

  it("computes next-month reset labels including December -> January rollover", () => {
    expect(nextMonthResetLabel("2026-11")).toBe("01/12")
    expect(nextMonthResetLabel("2026-12")).toBe("01/01")
    expect(nextMonthResetLabel("2027-01")).toBe("01/02")
  })

  it("formats UTC+7 dates, times, file sizes, and workday checks accurately", () => {
    expect(formatDayMonth("2026-11-23")).toBe("23/11")
    expect(formatFullDate("2026-11-23")).toBe("23/11/2026")
    // 2026-11-23T01:47:00Z === 08:47 UTC+7
    expect(formatHm("2026-11-23T01:47:00.000Z")).toBe("08:47")
    expect(formatFileSize(0)).toBe("0 B")
    expect(formatFileSize(1536)).toBe("1.5 KB")
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB")
    // 2026-11-23 is Monday, 2026-11-22 is Sunday, 2026-11-21 is Saturday
    expect(isWorkdayToday("2026-11-23")).toBe(true)
    expect(isWorkdayToday("2026-11-22")).toBe(false)
    expect(isWorkdayToday("2026-11-21")).toBe(false)
  })

  it("persists and safely parses HUD collapse state in localStorage", () => {
    expect(readHudCollapseState()).toEqual({})
    writeHudCollapseState({ att: true, task: false })
    expect(readHudCollapseState()).toEqual({ att: true, task: false })

    // Corrupted JSON recovers cleanly
    window.localStorage.setItem(OFFICE_HUD_STORAGE_KEY, "{broken")
    expect(readHudCollapseState()).toEqual({})
  })
})

describe("office-socket & startOffice fallback", () => {
  it("authenticates, throttles state, handles sync, and stops cleanly on 4401/4403", () => {
    const sent: string[] = []
    let fakeSocket: OfficeWebSocketLike | null = null
    const onPeersChange = vi.fn()
    const onSync = vi.fn()
    const onStatusChange = vi.fn()

    const client = createOfficeSocket({
      getToken: () => "jwt-token",
      url: () => "ws://localhost/api/v2/office/ws",
      createSocket: () => {
        fakeSocket = {
          readyState: 1,
          onopen: null,
          onmessage: null,
          onclose: null,
          onerror: null,
          send: (data: string) => {
            sent.push(data)
          },
          close: () => undefined,
        }
        return fakeSocket
      },
      onPeersChange,
      onSync,
      onStatusChange,
    })

    client.start()
    expect(fakeSocket).not.toBeNull()
    fakeSocket!.onopen?.({})
    expect(JSON.parse(sent[0]!)).toEqual({ type: "auth", token: "jwt-token" })

    fakeSocket!.onmessage?.({
      data: JSON.stringify({
        type: "welcome",
        self: {
          peerId: "p-self",
          userId: "u-self",
          role: "staff",
          name: "Hạnh",
          x: 245,
          y: 870,
          facing: "down",
          moving: false,
        },
        peers: [
          {
            peerId: "p-1",
            userId: "u-boss",
            role: "boss",
            name: "Lê Huy",
            x: 440,
            y: 310,
            facing: "down",
            moving: false,
          },
        ],
        onlineCount: 2,
      }),
    })

    expect(client.getStatus()).toBe("online")
    expect(client.getOnlineCount()).toBe(2)
    expect(client.getPeers()).toHaveLength(1)

    // Throttled outbound state while moving; immediate flush on stop
    expect(
      client.sendState({ x: 250, y: 870, facing: "right", moving: true })
    ).toBe(true)
    expect(
      client.sendState({ x: 255, y: 870, facing: "right", moving: true })
    ).toBe(false)
    expect(
      client.sendState({ x: 260, y: 870, facing: "right", moving: false })
    ).toBe(true)

    // Sync event triggers callback
    fakeSocket!.onmessage?.({
      data: JSON.stringify({
        type: "office:sync",
        scope: "tasks",
        teamId: "t-1",
        at: Date.now(),
      }),
    })
    expect(onSync).toHaveBeenCalledWith("tasks")

    // Multi-tab peer:leave with another tab's peerId keeps active tab online
    fakeSocket!.onmessage?.({
      data: JSON.stringify({
        type: "peer:leave",
        peerId: "p-boss-second-tab",
        userId: "u-boss",
        onlineCount: 2,
      }),
    })
    expect(client.getPeers()).toHaveLength(1)

    // 4403 stops permanently without scheduling reconnect
    fakeSocket!.onclose?.({ code: OFFICE_CLOSE_FORBIDDEN })
    expect(client.getStatus()).toBe("closed")

    // Verify 4401 also stops cleanly
    const authClient = createOfficeSocket({
      getToken: () => "bad-token",
      url: () => "ws://localhost/api/v2/office/ws",
      createSocket: () => {
        fakeSocket = {
          readyState: 1,
          onopen: null,
          onmessage: null,
          onclose: null,
          onerror: null,
          send: () => undefined,
          close: () => undefined,
        }
        return fakeSocket
      },
    })
    authClient.start()
    fakeSocket!.onopen?.({})
    fakeSocket!.onclose?.({ code: OFFICE_CLOSE_AUTH })
    expect(authClient.getStatus()).toBe("closed")
  })

  it("handles WebGL unavailability gracefully in jsdom and disposes safely", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const onError = vi.fn()

    const handle = startOffice(container, { onError })
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1))

    handle.setZoomDelta(1)
    handle.setModalOpen(true)
    handle.dispose()
    container.remove()
  })
})
