import { afterEach, describe, expect, it, vi } from "vitest"

import { findOfficeDoorPath } from "@/pages/spaces/door-transition.ts"

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
  MAX_STAFF_DESKS,
  OFFICE_BASE_DESK_ROWS,
  OFFICE_BASE_H,
  OFFICE_BASE_W,
  OFFICE_BOSS_SPAWN,
  OFFICE_DESK_COLS,
  OFFICE_EXTRA_BAND_STEP,
  OFFICE_HAS_ENCLOSING_WALLS,
  OFFICE_LOUNGE_PROPS,
  OFFICE_NORTH_PROPS,
  OFFICE_NORTH_WALL_Y,
  OFFICE_STAFF_FALLBACK_SPAWN,
  OFFICE_STATION_RADIUS,
  buildAllDeskSlots,
  buildDeskPositions,
  buildOfficeObstacles,
  buildOfficeStations,
  computeOfficeDimensions,
  deskSlotCoords,
  findClickedStation,
  findNearestStation,
  getMeetingPlanters,
  getOfficeExitDoor,
  getOfficeFloorLabels,
  getOfficeNorthWindows,
  getOfficePlants,
  getOfficePodDividers,
  getOfficeZones,
  getPrinterStationRect,
  getSouthLoungeRect,
  getSouthWelcomeDeskRect,
  getTeamBannerRugRect,
  getZoneRugs,
  isOfficeBlocked,
  moveWithSlide,
  officeFacingFromDelta,
  officeFacingToRadians,
  type OfficeRect,
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

/**
 * Runs 4-neighbor BFS over a logical walk grid of `step` px using the live
 * `isOfficeBlocked` & `moveWithSlide` collision helpers. Returns the set of
 * reachable grid keys `"gx,gy"`.
 */
function runWalkGridBfs(
  startX: number,
  startY: number,
  obstacles: readonly OfficeRect[],
  worldW: number,
  worldH: number,
  step = 16
): { visited: Set<string>; step: number } {
  const sx = Math.round(startX / step) * step
  const sy = Math.round(startY / step) * step
  const visited = new Set<string>()
  const queue: Array<[number, number]> = []

  const seedCandidates: Array<[number, number]> = [
    [sx, sy],
    [sx + step, sy],
    [sx - step, sy],
    [sx, sy + step],
    [sx, sy - step],
  ]
  for (const [cx, cy] of seedCandidates) {
    if (!isOfficeBlocked(cx, cy, obstacles, worldW, worldH)) {
      const key = `${cx},${cy}`
      visited.add(key)
      queue.push([cx, cy])
      break
    }
  }

  let head = 0
  const dirs: readonly [number, number][] = [
    [step, 0],
    [-step, 0],
    [0, step],
    [0, -step],
  ]
  while (head < queue.length) {
    const [cx, cy] = queue[head++]!
    for (const [dx, dy] of dirs) {
      const nx = cx + dx
      const ny = cy + dy
      const key = `${nx},${ny}`
      if (visited.has(key)) continue
      if (isOfficeBlocked(nx, ny, obstacles, worldW, worldH)) continue
      const moved = moveWithSlide(cx, cy, dx, dy, obstacles, worldW, worldH)
      if (moved.x === nx && moved.y === ny) {
        visited.add(key)
        queue.push([nx, ny])
      }
    }
  }
  return { visited, step }
}

function isTargetReachedByBfs(
  tx: number,
  ty: number,
  bfs: { visited: Set<string>; step: number },
  maxGridDist = 24
): boolean {
  const gx = Math.round(tx / bfs.step) * bfs.step
  const gy = Math.round(ty / bfs.step) * bfs.step
  for (let ox = -bfs.step; ox <= bfs.step; ox += bfs.step) {
    for (let oy = -bfs.step; oy <= bfs.step; oy += bfs.step) {
      const cx = gx + ox
      const cy = gy + oy
      if (
        bfs.visited.has(`${cx},${cy}`) &&
        Math.hypot(cx - tx, cy - ty) <= maxGridDist
      ) {
        return true
      }
    }
  }
  return false
}

afterEach(() => {
  window.localStorage.removeItem(OFFICE_HUD_STORAGE_KEY)
})

describe("office-layout open-floor geometry, zones, collision & 24-desk pods", () => {
  it("has ONE North back wall only — zero enclosing side/south walls and zero interior room partitions", () => {
    expect(OFFICE_HAS_ENCLOSING_WALLS).toBe(false)

    const obstacles = buildOfficeObstacles(11)
    const wallObstacles = obstacles.filter((o) =>
      (o.label ?? "").includes("wall")
    )
    expect(wallObstacles).toHaveLength(1)
    expect(wallObstacles[0]!.label).toBe("north-wall")
    expect(wallObstacles[0]!.y).toBe(0)
    expect(wallObstacles[0]!.h).toBe(OFFICE_NORTH_WALL_Y)

    // Former interior partition coordinates (y = 540 horizontal glass, x = 740 & x = 1560 vertical glass)
    // are now open walkable floor!
    for (const openX of [180, 620, 1210, 1740]) {
      expect(
        isOfficeBlocked(openX, 540, obstacles),
        `open floor at (${openX}, 540) must NOT be blocked by a partition`
      ).toBe(false)
    }
    expect(isOfficeBlocked(775, 260, obstacles)).toBe(false)
    expect(isOfficeBlocked(1650, 260, obstacles)).toBe(false)

    // Soft-border low planters around Phòng họp leave a wide open center entry
    expect(getMeetingPlanters().length).toBeGreaterThanOrEqual(4)
    expect(isOfficeBlocked(1210, 456, obstacles)).toBe(false)

    // Boss spawn & staff fallback spawn are walkable across normal & expanded layouts
    expect(
      isOfficeBlocked(OFFICE_BOSS_SPAWN.x, OFFICE_BOSS_SPAWN.y, obstacles)
    ).toBe(false)
    for (const count of [0, 1, 2, 12, MAX_STAFF_DESKS, MAX_STAFF_DESKS + 6, 37]) {
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

    // Playable perimeter bounds keep avatars inside the open floor
    expect(isOfficeBlocked(20, 300, obstacles)).toBe(true)
    expect(isOfficeBlocked(OFFICE_BASE_W - 20, 300, obstacles)).toBe(true)
    expect(isOfficeBlocked(500, 30, obstacles)).toBe(true)
    expect(isOfficeBlocked(500, OFFICE_BASE_H - 10, obstacles)).toBe(true)
  })

  it("defines all open-floor zones, painted floor labels, zone rugs, north windows, and multi-variety plants", () => {
    const zones = getOfficeZones()
    const zoneTitles = zones.map((z) => z.title)
    expect(zoneTitles).toEqual(
      expect.arrayContaining([
        "BÀN SẾP",
        "PHÒNG HỌP",
        "KHU LÀM VIỆC",
        "GÓC NGHỈ",
        "GÓC THÀNH TÍCH",
        "TÀI LIỆU",
      ])
    )

    const labels = getOfficeFloorLabels().map((l) => l.text)
    expect(labels).toEqual(
      expect.arrayContaining([
        "BÀN SẾP",
        "PHÒNG HỌP",
        "KHU LÀM VIỆC",
        "GÓC NGHỈ",
        "GÓC THÀNH TÍCH",
      ])
    )

    expect(getZoneRugs().length).toBeGreaterThanOrEqual(10)
    expect(getOfficeNorthWindows().length).toBeGreaterThanOrEqual(3)

    const plantKinds = new Set(getOfficePlants().map((p) => p.kind))
    expect(plantKinds).toEqual(new Set(["fiddle", "monstera", "snake"]))

    // Floor labels must sit in clear open floor space (zero overlap with obstacles or each other)
    const obs24 = buildOfficeObstacles(MAX_STAFF_DESKS)
    const floorLabels = getOfficeFloorLabels()
    for (let i = 0; i < floorLabels.length; i += 1) {
      const lbl = floorLabels[i]!
      const halfW = (lbl.widthU * 100) / 2
      const halfH = (lbl.heightU * 100) / 2
      const lx1 = lbl.x - halfW
      const lx2 = lbl.x + halfW
      const ly1 = lbl.y - halfH
      const ly2 = lbl.y + halfH
      for (const o of obs24) {
        const overlaps =
          lx1 < o.x + o.w && lx2 > o.x && ly1 < o.y + o.h && ly2 > o.y
        expect(
          overlaps,
          `floor label "${lbl.text}" must not overlap obstacle "${o.label ?? "unnamed"}"`
        ).toBe(false)
      }
      for (let j = i + 1; j < floorLabels.length; j += 1) {
        const other = floorLabels[j]!
        const ow = (other.widthU * 100) / 2
        const oh = (other.heightU * 100) / 2
        const labelOverlap =
          lx1 < other.x + ow &&
          lx2 > other.x - ow &&
          ly1 < other.y + oh &&
          ly2 > other.y - oh
        expect(
          labelOverlap,
          `floor label "${lbl.text}" must not overlap "${other.text}"`
        ).toBe(false)
      }
    }

    // Deliberate south welcome & support strip sits cleanly south of Band 1 and scales with worldHeight
    const welcome = getSouthWelcomeDeskRect(OFFICE_BASE_H)
    const printer = getPrinterStationRect(OFFICE_BASE_H)
    const southLounge = getSouthLoungeRect(OFFICE_BASE_H)
    expect(welcome.x + welcome.w).toBeLessThan(printer.x - 100)
    expect(printer.x + printer.w).toBeLessThan(southLounge.x - 100)
    expect(
      getSouthWelcomeDeskRect(OFFICE_BASE_H + OFFICE_EXTRA_BAND_STEP).y
    ).toBe(welcome.y + OFFICE_EXTRA_BAND_STEP)
  })

  it("slides smoothly along X and Y axes when pushing diagonally into the north wall or furniture", () => {
    const obstacles = buildOfficeObstacles(11)

    // Standing just south of Boss Desk (y=180..280) at (440, 294): moving up-right (-y blocked, +x free)
    const slideX = moveWithSlide(440, 294, 20, -20, obstacles)
    expect(slideX.moved).toBe(true)
    expect(slideX.x).toBe(460)
    expect(slideX.y).toBe(294)

    // Standing just west of West Meeting Planter (x=860..904, y=205..400) at (848, 300): +x blocked, +y free
    const slideY = moveWithSlide(848, 300, 20, 25, obstacles)
    expect(slideY.moved).toBe(true)
    expect(slideY.x).toBe(848)
    expect(slideY.y).toBe(325)
  })

  it("builds exact role-filtered stations, supports click hit-testing, and detects proximity strictly within < 95 px", () => {
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

    // Direct click on Boss Desk or Conference Table resolves the station
    expect(
      findClickedStation(
        OFFICE_NORTH_PROPS.bossDesk.x + 40,
        OFFICE_NORTH_PROPS.bossDesk.y + 40,
        bossStations
      )?.id
    ).toBe("boss")
    expect(
      findClickedStation(
        OFFICE_NORTH_PROPS.conferenceTable.x + 80,
        OFFICE_NORTH_PROPS.conferenceTable.y + 60,
        bossStations
      )?.id
    ).toBe("meet")

    const desk0 = deskSlotCoords(0)
    const staffStations = buildOfficeStations("staff", desk0.home, 12, {
      x: desk0.x,
      y: desk0.y,
      w: desk0.w,
      h: desk0.h,
    })
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
    expect(staffStations[4]?.x).toBe(desk0.home.x)
    expect(staffStations[4]?.y).toBe(desk0.home.y + 10)

    // Direct click on own desk resolves mydesk
    expect(
      findClickedStation(desk0.x + 50, desk0.y + 30, staffStations)?.id
    ).toBe("mydesk")

    // Within < 95 px triggers, >= 95 px does not
    expect(findNearestStation(440, 340 + 94, staffStations)?.id).toBe("boss")
    expect(
      findNearestStation(440, 340 + OFFICE_STATION_RADIUS, staffStations)
    ).toBeNull()
  })

  it("assigns 24 unique desk positions in deskIndex order, keeps empty desks as obstacles, and expands cleanly above 24 staff", () => {
    expect(MAX_STAFF_DESKS).toBe(24)
    expect(OFFICE_BASE_DESK_ROWS * OFFICE_DESK_COLS).toBe(MAX_STAFF_DESKS)

    // Verify all 24 desk slots have strictly unique (x, y) and non-overlapping footprints
    const seen = new Set<string>()
    const slots24 = Array.from({ length: MAX_STAFF_DESKS }, (_, i) =>
      deskSlotCoords(i)
    )
    for (let i = 0; i < slots24.length; i += 1) {
      const a = slots24[i]!
      const key = `${a.x},${a.y}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
      for (let j = i + 1; j < slots24.length; j += 1) {
        const b = slots24[j]!
        const overlap =
          a.x < b.x + b.w &&
          a.x + a.w > b.x &&
          a.y < b.y + b.h &&
          a.y + a.h > b.y
        expect(overlap, `desk ${i} and desk ${j} must not overlap`).toBe(false)
      }
    }

    // Small 2-member team still furnishes all 24 desks (2 occupied + 22 empty) on base map
    const desks2 = buildDeskPositions(makeStaffMembers(2))
    const dims2 = computeOfficeDimensions(2)
    expect(dims2.width).toBe(OFFICE_BASE_W)
    expect(dims2.height).toBe(OFFICE_BASE_H)
    expect(dims2.rows).toBe(OFFICE_BASE_DESK_ROWS)
    expect(dims2.totalDesks).toBe(MAX_STAFF_DESKS)

    const allSlots2 = buildAllDeskSlots(desks2, dims2.totalDesks)
    expect(allSlots2).toHaveLength(MAX_STAFF_DESKS)
    expect(allSlots2.filter((s) => s.occupied)).toHaveLength(2)
    expect(allSlots2.filter((s) => !s.occupied)).toHaveLength(
      MAX_STAFF_DESKS - 2
    )

    // Every empty desk AND pod divider is still a solid collision obstacle
    const obstacles2 = buildOfficeObstacles(desks2)
    for (const slot of allSlots2) {
      expect(
        isOfficeBlocked(
          slot.x + slot.w / 2,
          slot.y + slot.h / 2,
          obstacles2,
          dims2.width,
          dims2.height
        ),
        `desk slot ${slot.index} (${slot.occupied ? "occupied" : "empty"}) must block`
      ).toBe(true)
    }
    for (const div of getOfficePodDividers(dims2.podBands)) {
      expect(
        isOfficeBlocked(
          div.x + div.w / 2,
          div.y + div.h / 2,
          obstacles2,
          dims2.width,
          dims2.height
        ),
        `pod divider band=${div.band} col=${div.podCol} must block`
      ).toBe(true)
    }

    // 6th desk leaves generous main boulevard (>= 150 px) before Góc Nghỉ coffee bar
    const sixthSlot = deskSlotCoords(5)
    expect(
      OFFICE_LOUNGE_PROPS.coffeeBar.x - (sixthSlot.x + sixthSlot.w)
    ).toBeGreaterThanOrEqual(150)

    // Team Banner Rug is 100% walkable
    const banner = getTeamBannerRugRect()
    expect(
      isOfficeBlocked(
        banner.x + banner.w / 2,
        banner.y + banner.h / 2,
        obstacles2
      )
    ).toBe(false)

    // Exceeding MAX_STAFF_DESKS appends extra pod bands cleanly
    const desks25 = buildDeskPositions(makeStaffMembers(MAX_STAFF_DESKS + 1))
    const dims25 = computeOfficeDimensions(MAX_STAFF_DESKS + 1)
    expect(dims25.rows).toBe(6)
    expect(dims25.totalDesks).toBe(36)
    expect(dims25.height).toBe(OFFICE_BASE_H + OFFICE_EXTRA_BAND_STEP)

    const obstacles25 = buildOfficeObstacles(desks25)
    for (let idx = 0; idx < dims25.totalDesks; idx += 1) {
      const slot = deskSlotCoords(idx)
      expect(
        isOfficeBlocked(
          slot.home.x,
          slot.home.y,
          obstacles25,
          dims25.width,
          dims25.height
        ),
        `expanded desk ${idx} home should be walkable`
      ).toBe(false)
    }

    const dims37 = computeOfficeDimensions(37)
    expect(dims37.rows).toBe(8)
    expect(dims37.totalDesks).toBe(48)
    expect(dims37.height).toBe(OFFICE_BASE_H + OFFICE_EXTRA_BAND_STEP * 2)

    expect(officeFacingFromDelta(10, 2)).toBe("right")
    expect(officeFacingFromDelta(-10, 2)).toBe("left")
    expect(officeFacingFromDelta(1, 10)).toBe("down")
    expect(officeFacingFromDelta(1, -10)).toBe("up")
    expect(officeFacingToRadians("down")).toBe(0)
    expect(officeFacingToRadians("up")).toBe(Math.PI)
  })

  it("proves via BFS & A* that all stations, all 24+ desk positions, and the Khu giao dịch portal door are reachable from spawn", () => {
    for (const staffCount of [2, MAX_STAFF_DESKS, MAX_STAFF_DESKS + 6]) {
      const dims = computeOfficeDimensions(staffCount)
      const obstacles = buildOfficeObstacles(staffCount)
      const sharedStations = buildOfficeStations("boss", null, 11)
      const exitDoor = getOfficeExitDoor(dims.height)

      for (const spawn of [OFFICE_BOSS_SPAWN, OFFICE_STAFF_FALLBACK_SPAWN]) {
        const bfs = runWalkGridBfs(
          spawn.x,
          spawn.y,
          obstacles,
          dims.width,
          dims.height,
          16
        )

        // All 4 shared stations reachable
        for (const station of sharedStations) {
          expect(
            isTargetReachedByBfs(station.x, station.y, bfs, 24),
            `station "${station.id}" must be reachable from (${spawn.x},${spawn.y}) for staffCount=${staffCount}`
          ).toBe(true)
        }

        // Portal door access & spawnInside reachable via both BFS and A*
        expect(
          isTargetReachedByBfs(exitDoor.access.x, exitDoor.access.y, bfs, 24),
          `door access must be reachable via BFS for staffCount=${staffCount}`
        ).toBe(true)
        const doorPath = findOfficeDoorPath(
          spawn,
          exitDoor.access,
          obstacles,
          dims.width,
          dims.height
        )
        expect(doorPath.length).toBeGreaterThan(0)

        // Every desk slot's home AND mydesk interaction point reachable
        for (let idx = 0; idx < dims.totalDesks; idx += 1) {
          const slot = deskSlotCoords(idx)
          expect(
            isTargetReachedByBfs(slot.home.x, slot.home.y, bfs, 24),
            `desk ${idx} home (${slot.home.x},${slot.home.y}) must be reachable for staffCount=${staffCount}`
          ).toBe(true)
          expect(
            isTargetReachedByBfs(slot.home.x, slot.home.y + 10, bfs, 24),
            `desk ${idx} mydesk interaction (${slot.home.x},${slot.home.y + 10}) must be reachable for staffCount=${staffCount}`
          ).toBe(true)
        }
      }
    }
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
    expect(formatHm("2026-11-23T01:47:00.000Z")).toBe("08:47")
    expect(formatFileSize(0)).toBe("0 B")
    expect(formatFileSize(1536)).toBe("1.5 KB")
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB")
    expect(isWorkdayToday("2026-11-23")).toBe(true)
    expect(isWorkdayToday("2026-11-22")).toBe(false)
    expect(isWorkdayToday("2026-11-21")).toBe(false)
  })

  it("persists and safely parses HUD collapse state in localStorage", () => {
    expect(readHudCollapseState()).toEqual({})
    writeHudCollapseState({ att: true, task: false })
    expect(readHudCollapseState()).toEqual({ att: true, task: false })

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
          x: 295,
          y: 932,
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

    expect(
      client.sendState({ x: 300, y: 932, facing: "right", moving: true })
    ).toBe(true)
    expect(
      client.sendState({ x: 305, y: 932, facing: "right", moving: true })
    ).toBe(false)
    expect(
      client.sendState({ x: 310, y: 932, facing: "right", moving: false })
    ).toBe(true)

    fakeSocket!.onmessage?.({
      data: JSON.stringify({
        type: "office:sync",
        scope: "tasks",
        teamId: "t-1",
        at: Date.now(),
      }),
    })
    expect(onSync).toHaveBeenCalledWith("tasks")

    fakeSocket!.onmessage?.({
      data: JSON.stringify({
        type: "peer:leave",
        peerId: "p-boss-second-tab",
        userId: "u-boss",
        onlineCount: 2,
      }),
    })
    expect(client.getPeers()).toHaveLength(1)

    fakeSocket!.onclose?.({ code: OFFICE_CLOSE_FORBIDDEN })
    expect(client.getStatus()).toBe("closed")

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
