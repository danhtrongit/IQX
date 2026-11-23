/**
 * Floorplan geometry, dynamic desk allocation, AABB obstacles, X/Y wall-sliding
 * collision resolver, and proximity interactive stations for Khu Văn phòng.
 *
 * Canonical base world: `2400 × 1560 px` (`24.0u × 15.6u` at `scale = 1 / 100`).
 * Automatically expands world height in `+330 px` row bands when `staffCount > 12`.
 */
import type {
  OfficeFacing,
  OfficeMember,
  OfficeModalId,
  OfficeRole,
  OfficeStationId,
} from "../types.ts"

export const OFFICE_BASE_W = 2400
export const OFFICE_BASE_H = 1560
export const OFFICE_WORLD_SCALE = 1 / 100
export const OFFICE_WALK_SPEED = 250
export const OFFICE_STATION_RADIUS = 95
export const OFFICE_DESK_DECLUTTER_RADIUS = 70
export const OFFICE_WALL_THICK = 16
export const OFFICE_DIVIDER_Y = 540

export const OFFICE_DESK_COLS = 6
export const OFFICE_DESK_W = 190
export const OFFICE_DESK_H = 84
/**
 * 6 columns starting at x = 150 with 270 px pitch:
 * last column ends at 150 + 5*270 + 190 = 1690, leaving a comfortable 170 px corridor
 * before Coffee Bar (x = 1860) and 390 px before Standee (x = 2080).
 */
export const OFFICE_DESK_START_X = 150
export const OFFICE_DESK_COL_STEP = 270
export const OFFICE_DESK_START_Y = 720
export const OFFICE_DESK_ROW_STEP = 330

export const OFFICE_BOSS_SPAWN = { x: 440, y: 310 } as const
export const OFFICE_STAFF_FALLBACK_SPAWN = { x: 440, y: 920 } as const

/** Returns true when the user has enabled `prefers-reduced-motion: reduce`. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export interface OfficeRect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly label?: string
}

export interface OfficeDoorway {
  readonly id: "boss" | "meet" | "docs"
  readonly x1: number
  readonly x2: number
  readonly y: number
}

export const OFFICE_DOORWAYS: readonly OfficeDoorway[] = [
  { id: "boss", x1: 320, x2: 450, y: OFFICE_DIVIDER_Y },
  { id: "meet", x1: 1090, x2: 1230, y: OFFICE_DIVIDER_Y },
  { id: "docs", x1: 1910, x2: 2040, y: OFFICE_DIVIDER_Y },
] as const

export interface OfficeZoneRect extends OfficeRect {
  readonly id: "boss" | "meet" | "docs" | "staff"
  readonly title: string
}

export interface OfficeDeskPlacement {
  readonly userId: string
  readonly displayName: string
  readonly accentColor: string
  readonly index: number
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly hasMug: boolean
  readonly home: { readonly x: number; readonly y: number }
}

export interface OfficeStation {
  readonly id: OfficeStationId
  readonly x: number
  readonly y: number
  readonly label: string
  readonly modal: OfficeModalId
  readonly focusProposal?: boolean
}

export interface OfficeDimensions {
  readonly width: number
  readonly height: number
  readonly rows: number
}

/** Computes world dimensions, expanding height cleanly when `staffCount > 12`. */
export function computeOfficeDimensions(staffCount: number): OfficeDimensions {
  const safeCount = Math.max(0, Math.floor(staffCount))
  const rows = Math.max(2, Math.ceil(Math.max(1, safeCount) / OFFICE_DESK_COLS))
  const extraRows = Math.max(0, rows - 2)
  return {
    width: OFFICE_BASE_W,
    height: OFFICE_BASE_H + extraRows * OFFICE_DESK_ROW_STEP,
    rows,
  }
}

/** Returns the 4 canonical office floor zones for a given `worldHeight`. */
export function getOfficeZones(
  worldHeight = OFFICE_BASE_H
): readonly OfficeZoneRect[] {
  return [
    { id: "boss", title: "PHÒNG SẾP", x: 16, y: 16, w: 724, h: 524 },
    { id: "meet", title: "PHÒNG HỌP", x: 756, y: 16, w: 804, h: 524 },
    { id: "docs", title: "PHÒNG TÀI LIỆU", x: 1576, y: 16, w: 808, h: 524 },
    {
      id: "staff",
      title: "KHU NHÂN VIÊN",
      x: 16,
      y: 556,
      w: 2368,
      h: Math.max(988, worldHeight - 572),
    },
  ]
}

/** Deterministic desk coordinates for a slot index `0..N-1`. */
export function deskSlotCoords(index: number): {
  x: number
  y: number
  w: number
  h: number
  home: { x: number; y: number }
} {
  const row = Math.floor(index / OFFICE_DESK_COLS)
  const col = index % OFFICE_DESK_COLS
  const x = OFFICE_DESK_START_X + col * OFFICE_DESK_COL_STEP
  const y = OFFICE_DESK_START_Y + row * OFFICE_DESK_ROW_STEP
  return {
    x,
    y,
    w: OFFICE_DESK_W,
    h: OFFICE_DESK_H,
    home: { x: x + OFFICE_DESK_W / 2, y: y + 150 },
  }
}

/**
 * Assigns every staff member a desk footprint + walkable `home` spot `(x+95, y+150)`,
 * sorted deterministically by `deskIndex` then `displayName`.
 */
export function buildDeskPositions(
  members: readonly OfficeMember[]
): OfficeDeskPlacement[] {
  const staff = members
    .filter((m) => m.role === "staff")
    .slice()
    .sort((a, b) => {
      const ia = a.deskIndex ?? Number.MAX_SAFE_INTEGER
      const ib = b.deskIndex ?? Number.MAX_SAFE_INTEGER
      if (ia !== ib) return ia - ib
      return a.displayName.localeCompare(b.displayName, "vi")
    })

  return staff.map((member, idx) => {
    const slot = deskSlotCoords(idx)
    return {
      userId: member.userId,
      displayName: member.displayName,
      accentColor: member.accentColor,
      index: idx,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
      hasMug: idx % 3 === 0,
      home: slot.home,
    }
  })
}

export interface OfficePlantSpec {
  readonly x: number
  readonly y: number
  readonly tall: boolean
}

/** Potted plant placements scaled cleanly with `worldHeight`. */
export function getOfficePlants(
  worldHeight = OFFICE_BASE_H
): readonly OfficePlantSpec[] {
  return [
    // Phòng Sếp
    { x: 660, y: 40, tall: true },
    { x: 40, y: 360, tall: true },
    // Phòng Họp
    { x: 780, y: 40, tall: true },
    { x: 1480, y: 40, tall: true },
    // Khu Nhân Viên
    { x: 40, y: 640, tall: true },
    { x: 2310, y: 620, tall: true },
    { x: 1960, y: worldHeight - 140, tall: false },
    { x: 860, y: worldHeight - 120, tall: false },
    { x: 2300, y: worldHeight - 120, tall: true },
  ]
}

/** Lounge oval rug, sofa & coffee table positions aligned cleanly with bottom-left corner. */
export function getLoungePositions(worldHeight = OFFICE_BASE_H): {
  readonly rug: OfficeRect
  readonly sofa: OfficeRect
  readonly table: OfficeRect
} {
  return {
    rug: { x: 70, y: worldHeight - 260, w: 300, h: 170 },
    sofa: { x: 130, y: worldHeight - 220, w: 200, h: 70 },
    table: { x: 165, y: worldHeight - 132, w: 130, h: 56 },
  }
}

export interface OfficeZoneRugSpec extends OfficeRect {
  readonly id: string
  readonly shape: "oval" | "rounded"
  readonly colorHex: string
  readonly borderHex: string
  readonly borderWidth: number
}

/** Per-zone decorative rugs and floor runners that stay 100% walkable. */
export function getZoneRugs(
  worldHeight = OFFICE_BASE_H
): readonly OfficeZoneRugSpec[] {
  const staffBandH = Math.max(540, worldHeight - 920)
  return [
    // Phòng Sếp: executive navy & gold rug framing boss desk
    {
      id: "boss-rug",
      x: 200,
      y: 112,
      w: 480,
      h: 296,
      shape: "rounded",
      colorHex: "#203457",
      borderHex: "#d9a03a",
      borderWidth: 0.13,
    },
    // Phòng Họp: slate & gold rug anchoring conference table
    {
      id: "meet-rug",
      x: 878,
      y: 130,
      w: 560,
      h: 296,
      shape: "rounded",
      colorHex: "#3b4e6f",
      borderHex: "#c9a24b",
      borderWidth: 0.12,
    },
    // Phòng Tài Liệu: warm parchment & walnut rug under reading desk
    {
      id: "docs-rug",
      x: 1755,
      y: 175,
      w: 370,
      h: 230,
      shape: "rounded",
      colorHex: "#e6d8be",
      borderHex: "#8c653c",
      borderWidth: 0.11,
    },
    // Main corridor runner uniting Boss, Meeting & Documents doorways
    {
      id: "corridor-runner",
      x: 260,
      y: 582,
      w: 1840,
      h: 72,
      shape: "rounded",
      colorHex: "#213358",
      borderHex: "#d9a03a",
      borderWidth: 0.08,
    },
    // Staff work area subtle woven floor mat under desk rows
    {
      id: "staff-work-mat",
      x: 105,
      y: 682,
      w: 1630,
      h: staffBandH,
      shape: "rounded",
      colorHex: "#e5d5bc",
      borderHex: "#b89b72",
      borderWidth: 0.1,
    },
    // Góc Cà Phê warm bistro mat
    {
      id: "coffee-rug",
      x: 1825,
      y: 620,
      w: 495,
      h: 280,
      shape: "rounded",
      colorHex: "#dac5a6",
      borderHex: "#7a5230",
      borderWidth: 0.11,
    },
    // Achievement Standee VIP navy-gold showcase carpet
    {
      id: "standee-rug",
      x: 2040,
      y: 990,
      w: 310,
      h: 210,
      shape: "rounded",
      colorHex: "#1c2d4f",
      borderHex: "#e9b949",
      borderWidth: 0.13,
    },
  ]
}

export interface OfficeWindowSpec {
  readonly wall: "north" | "west" | "east"
  /** Logical center coordinate along the wall (`x` for north wall, `y` for west/east walls). */
  readonly pos: number
  /** Width along the wall in logical px. */
  readonly span: number
  /** Vertical center height in world units. */
  readonly centerY: number
  /** Window height in world units. */
  readonly heightU: number
  /** Cast soft sunlight pool onto the floor. */
  readonly sunPool?: boolean
}

/** Sunlit architectural windows placed cleanly clear of shelves & wall boards. */
export function getOfficeWindows(
  worldHeight = OFFICE_BASE_H
): readonly OfficeWindowSpec[] {
  const wins: OfficeWindowSpec[] = [
    // North wall windows (Boss room right, Meeting room flanking wall screen)
    { wall: "north", pos: 575, span: 190, centerY: 1.56, heightU: 1.12, sunPool: true },
    { wall: "north", pos: 870, span: 150, centerY: 1.56, heightU: 1.1, sunPool: true },
    { wall: "north", pos: 1450, span: 150, centerY: 1.56, heightU: 1.1, sunPool: true },
    // Clerestory bright windows above Documents bookshelves
    { wall: "north", pos: 1720, span: 150, centerY: 2.18, heightU: 0.48, sunPool: false },
    { wall: "north", pos: 1970, span: 150, centerY: 2.18, heightU: 0.48, sunPool: false },
    { wall: "north", pos: 2220, span: 150, centerY: 2.18, heightU: 0.48, sunPool: false },
    // West cutaway wall windows
    { wall: "west", pos: 220, span: 170, centerY: 1.32, heightU: 0.9, sunPool: true },
    { wall: "west", pos: 830, span: 200, centerY: 1.32, heightU: 0.9, sunPool: true },
    { wall: "west", pos: 1160, span: 200, centerY: 1.32, heightU: 0.9, sunPool: true },
    // East cutaway wall windows
    { wall: "east", pos: 800, span: 200, centerY: 1.32, heightU: 0.9, sunPool: true },
    { wall: "east", pos: 1180, span: 190, centerY: 1.32, heightU: 0.9, sunPool: false },
  ]
  if (worldHeight > OFFICE_BASE_H) {
    wins.push(
      { wall: "west", pos: 1490, span: 200, centerY: 1.32, heightU: 0.9, sunPool: true },
      { wall: "east", pos: 1490, span: 200, centerY: 1.32, heightU: 0.9, sunPool: false }
    )
  }
  return wins
}

export const OFFICE_COFFEE_COOLER_RECT: OfficeRect = {
  x: 2050,
  y: 642,
  w: 54,
  h: 54,
  label: "water-cooler",
}

export const OFFICE_COFFEE_TABLE_RECT: OfficeRect = {
  x: 2146,
  y: 752,
  w: 110,
  h: 96,
  label: "coffee-bistro",
}

/**
 * Builds the exact static + dynamic AABB collision boxes for walls, furniture,
 * staff desks, coffee counter, standee base, lounge sofa, and plants.
 */
export function buildOfficeObstacles(
  staffCountOrDesks: number | readonly OfficeDeskPlacement[] = 11
): OfficeRect[] {
  const desks: readonly { x: number; y: number; w: number; h: number }[] =
    typeof staffCountOrDesks === "number"
      ? Array.from({ length: Math.max(0, staffCountOrDesks) }, (_, idx) =>
          deskSlotCoords(idx)
        )
      : staffCountOrDesks

  const { height: worldH } = computeOfficeDimensions(desks.length)
  const lounge = getLoungePositions(worldH)
  const plants = getOfficePlants(worldH)

  const obstacles: OfficeRect[] = [
    // Horizontal corridor divider at y = 540 split by 3 doorways (320..450, 1090..1230, 1910..2040)
    { x: 16, y: OFFICE_DIVIDER_Y, w: 304, h: OFFICE_WALL_THICK, label: "wall" },
    { x: 450, y: OFFICE_DIVIDER_Y, w: 640, h: OFFICE_WALL_THICK, label: "wall" },
    { x: 1230, y: OFFICE_DIVIDER_Y, w: 680, h: OFFICE_WALL_THICK, label: "wall" },
    { x: 2040, y: OFFICE_DIVIDER_Y, w: 344, h: OFFICE_WALL_THICK, label: "wall" },

    // Vertical top-room partitions
    { x: 740, y: 16, w: OFFICE_WALL_THICK, h: 524, label: "wall" },
    { x: 1560, y: 16, w: OFFICE_WALL_THICK, h: 524, label: "wall" },

    // Phòng Sếp
    { x: 300, y: 180, w: 280, h: 100, label: "boss-desk" },
    { x: 40, y: 40, w: 200, h: 46, label: "boss-shelf" },
    { x: 560, y: 330, w: 150, h: 70, label: "boss-sofa" },

    // Phòng Họp
    { x: 1000, y: 16, w: 320, h: 78, label: "meet-screen" },
    { x: 948, y: 200, w: 420, h: 150, label: "conference-table" },

    // Phòng Tài Liệu
    { x: 1610, y: 40, w: 220, h: 60, label: "docs-shelf-1" },
    { x: 1860, y: 40, w: 220, h: 60, label: "docs-shelf-2" },
    { x: 2110, y: 40, w: 220, h: 60, label: "docs-shelf-3" },
    { x: 2300, y: 140, w: 60, h: 240, label: "docs-shelf-east" },
    { x: 1840, y: 240, w: 200, h: 90, label: "reading-desk" },

    // Góc Cà Phê, Standee base & Lounge Sofa + Coffee Table
    { x: 1860, y: 640, w: 170, h: 60, label: "coffee-bar" },
    OFFICE_COFFEE_COOLER_RECT,
    OFFICE_COFFEE_TABLE_RECT,
    { x: 2090, y: 1046, w: 210, h: 40, label: "standee-base" },
    { ...lounge.sofa, label: "lounge-sofa" },
    { ...lounge.table, label: "lounge-table" },
  ]

  for (const desk of desks) {
    obstacles.push({
      x: desk.x,
      y: desk.y,
      w: desk.w,
      h: desk.h,
      label: "staff-desk",
    })
  }

  for (const plant of plants) {
    obstacles.push({
      x: plant.x + 10,
      y: plant.y + 40,
      w: 36,
      h: 30,
      label: "plant",
    })
  }

  return obstacles
}

/**
 * Spec AABB collision test:
 * - World bounds margin: `x < 30 || y < 40 || x > worldW - 30 || y > worldH - 24`
 * - Actor footprint: `[x - 12, x + 12] × [y - 14, y + 2]`
 */
export function isOfficeBlocked(
  x: number,
  y: number,
  obstacles: readonly OfficeRect[],
  worldW = OFFICE_BASE_W,
  worldH = OFFICE_BASE_H
): boolean {
  if (x < 30 || y < 40 || x > worldW - 30 || y > worldH - 24) {
    return true
  }
  const ax1 = x - 12
  const ax2 = x + 12
  const ay1 = y - 14
  const ay2 = y + 2

  for (const r of obstacles) {
    if (ax2 > r.x && ax1 < r.x + r.w && ay2 > r.y && ay1 < r.y + r.h) {
      return true
    }
  }
  return false
}

/**
 * Resolves `(dx, dy)` movement by attempting X step and Y step independently
 * so chibi characters glide smoothly along walls and desk edges.
 */
export function moveWithSlide(
  x: number,
  y: number,
  dx: number,
  dy: number,
  obstacles: readonly OfficeRect[],
  worldW = OFFICE_BASE_W,
  worldH = OFFICE_BASE_H
): { x: number; y: number; moved: boolean } {
  let nx = x
  let ny = y
  if (dx !== 0 && !isOfficeBlocked(nx + dx, ny, obstacles, worldW, worldH)) {
    nx += dx
  }
  if (dy !== 0 && !isOfficeBlocked(nx, ny + dy, obstacles, worldW, worldH)) {
    ny += dy
  }
  return {
    x: nx,
    y: ny,
    moved: nx !== x || ny !== y,
  }
}

/**
 * Builds the exact 5 proximity stations from Spec §3.2 (`mydesk` is Staff-only).
 */
export function buildOfficeStations(
  role: OfficeRole,
  selfDeskHome: { readonly x: number; readonly y: number } | null,
  currentMonth: number
): OfficeStation[] {
  const stations: OfficeStation[] = [
    {
      id: "boss",
      x: 440,
      y: 340,
      label: role === "boss" ? "Bàn sếp · Quản lý" : "Bàn sếp · Gửi đề xuất",
      modal: role === "boss" ? "mgr" : "mine",
      focusProposal: role === "staff",
    },
    {
      id: "meet",
      x: 1158,
      y: 430,
      label: "Phòng họp",
      modal: "meet",
    },
    {
      id: "docs",
      x: 1940,
      y: 380,
      label: "Kệ tài liệu",
      modal: "docs",
    },
    {
      id: "stand",
      x: 2195,
      y: 1150,
      label: `Thành tích tháng ${currentMonth}`,
      modal: "stand",
    },
  ]

  if (role === "staff" && selfDeskHome) {
    stations.push({
      id: "mydesk",
      x: selfDeskHome.x,
      y: selfDeskHome.y + 10,
      label: "Bàn của tôi · Nhiệm vụ",
      modal: "mine",
    })
  }

  return stations
}

/** Finds the closest interactive station strictly within `< radius` px. */
export function findNearestStation(
  x: number,
  y: number,
  stations: readonly OfficeStation[],
  radius = OFFICE_STATION_RADIUS
): OfficeStation | null {
  let closest: OfficeStation | null = null
  let bestDist = radius
  for (const station of stations) {
    const dist = Math.hypot(x - station.x, y - station.y)
    if (dist < bestDist) {
      bestDist = dist
      closest = station
    }
  }
  return closest
}

/** Maps a movement vector `(dx, dy)` (`+y` South) to 4-way `OfficeFacing`. */
export function officeFacingFromDelta(dx: number, dy: number): OfficeFacing {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? "right" : "left"
  }
  return dy >= 0 ? "down" : "up"
}

/** Maps `OfficeFacing` to Three.js `rotation.y` radians for `+Z` South characters. */
export function officeFacingToRadians(facing: OfficeFacing): number {
  switch (facing) {
    case "down":
      return 0
    case "right":
      return Math.PI / 2
    case "up":
      return Math.PI
    case "left":
      return -Math.PI / 2
  }
}
