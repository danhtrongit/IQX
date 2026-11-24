/**
 * Floorplan geometry, fixed open-plan staff desk pod grid, dynamic overflow
 * row-band expansion, AABB obstacles, X/Y wall-sliding collision resolver,
 * and proximity interactive stations for Khu Văn phòng.
 *
 * Canonical base world: `2400 × 1560 px` (`24.0u × 15.6u` at `scale = 1 / 100`).
 *
 * Staff Area Capacity (`MAX_STAFF_DESKS = 24`):
 * - Base map furnishes 2 back-to-back pod bands × 2 rows/band × 6 desks/row = 24 desks
 *   arranged as 6 four-person pods (3 pod columns × 2 bands) separated by 150 px vertical
 *   aisles, a central Team Banner Promenade, and a 202 px main boulevard before Coffee Corner.
 * - Unassigned desks remain rendered as tidy empty workstations and stay solid AABB obstacles.
 * - When `staffCount > MAX_STAFF_DESKS` (> 24), `computeOfficeDimensions` appends extra
 *   back-to-back pod bands (+2 rows = +12 desks per band, +350 px map height each), updating
 *   world bounds, obstacles, architecture, and camera clamp bounds automatically.
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
export const OFFICE_BASE_DESK_ROWS = 4
export const OFFICE_POD_COLS = 3
export const OFFICE_DESKS_PER_POD_COL = 2
/**
 * Maximum staff desks fitting on the canonical base office map (`2400 × 1560`):
 * 4 rows × 6 desks = 24 desks (2 back-to-back pod bands of 3 four-person pods).
 * Teams larger than `MAX_STAFF_DESKS` automatically append extra back-to-back pod
 * bands (+12 desks, +350 px height per band) via `computeOfficeDimensions`.
 */
export const MAX_STAFF_DESKS = OFFICE_BASE_DESK_ROWS * OFFICE_DESK_COLS

export const OFFICE_DESK_W = 190
export const OFFICE_DESK_H = 78
export const OFFICE_POD_GAP_X = 6
export const OFFICE_POD_AISLE_X = 150
export const OFFICE_POD_DIVIDER_H = 14
export const OFFICE_POD_W = OFFICE_DESK_W * OFFICE_DESKS_PER_POD_COL + OFFICE_POD_GAP_X
export const OFFICE_POD_PITCH_X = OFFICE_POD_W + OFFICE_POD_AISLE_X

/**
 * 3 pod columns × 2 desks each starting at x = 200:
 * - Pod 0: [200..390], [396..586] -> 150 px aisle
 * - Pod 1: [736..926], [932..1122] -> 150 px aisle
 * - Pod 2: [1272..1462], [1468..1658] -> 202 px main boulevard before Coffee Bar (x = 1860)
 */
export const OFFICE_DESK_START_X = 200
export const OFFICE_DESK_COL_STEP = 270
export const OFFICE_DESK_START_Y = 706
/** Vertical pitch from Pod Band 0 to Pod Band 1 (frames the Central Team Banner Promenade). */
export const OFFICE_POD_BAND_STEP = 390
/** Vertical pitch per overflow Pod Band appended when `staffCount > MAX_STAFF_DESKS`. */
export const OFFICE_EXTRA_BAND_STEP = 350
export const OFFICE_DESK_ROW_STEP = OFFICE_EXTRA_BAND_STEP
export const OFFICE_DESK_HOME_OFFSET = 56

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

export interface OfficeExitDoorSpec {
  /** Center of the doorway along the South staff-area entrance outer wall. */
  readonly x: number
  readonly y: number
  /** Solid door-frame collision box along the South outer wall. */
  readonly obstacle: OfficeRect
  /** Walkable point in front of the door where E prompt activates. */
  readonly access: { readonly x: number; readonly y: number }
  /** Threshold point stepped into as the door swings open during exit. */
  readonly through: { readonly x: number; readonly y: number }
  /** Spawn point just inside the door when arriving from Khu giao dịch. */
  readonly spawnInside: { readonly x: number; readonly y: number }
  readonly label: string
  readonly radius: number
}

/**
 * Staff-area outer-wall entrance door connecting Khu Văn phòng <-> Khu giao dịch.
 * Placed at the foot of the 202 px main boulevard (`x = 1715`) on the South outer wall,
 * cleanly clear of Pod 2 (`x <= 1658`), Huddle Nook (`x <= 1565`), and Printer (`x >= 1850`)
 * across both canonical (`2400 × 1560`) and dynamically expanded (`> 24` staff) layouts.
 */
export function getOfficeExitDoor(
  worldHeight = OFFICE_BASE_H
): OfficeExitDoorSpec {
  const x = 1715
  const wallY = worldHeight - OFFICE_WALL_THICK
  return {
    x,
    y: wallY,
    obstacle: {
      x: x - 76,
      y: worldHeight - 32,
      w: 152,
      h: 16,
      label: "office-exit-door",
    },
    access: { x, y: worldHeight - 70 },
    through: { x, y: worldHeight - 22 },
    spawnInside: { x, y: worldHeight - 54 },
    label: "Khu giao dịch",
    radius: OFFICE_STATION_RADIUS,
  }
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

export type OfficeDeskFacing = "north" | "south"

export interface OfficeDeskPlacement {
  readonly userId: string
  readonly displayName: string
  readonly accentColor: string
  readonly index: number
  readonly row: number
  readonly col: number
  readonly band: number
  readonly facing: OfficeDeskFacing
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly hasMug: boolean
  readonly home: { readonly x: number; readonly y: number }
}

export interface OfficeDeskSlot {
  readonly index: number
  readonly row: number
  readonly col: number
  readonly band: number
  readonly facing: OfficeDeskFacing
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly home: { readonly x: number; readonly y: number }
  readonly occupied: boolean
  readonly member: OfficeDeskPlacement | null
}

export interface OfficePodDividerRect extends OfficeRect {
  readonly band: number
  readonly podCol: number
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
  readonly podBands: number
  readonly totalDesks: number
}

/**
 * Computes world dimensions and total furnished desk slots:
 * - Up to `MAX_STAFF_DESKS` (24): canonical `2400 × 1560` with 4 rows (2 back-to-back pod bands).
 * - Above `MAX_STAFF_DESKS`: appends full back-to-back pod bands (+2 rows = +12 desks,
 *   `+OFFICE_EXTRA_BAND_STEP` height each) so world bounds, collision, and camera clamp scale cleanly.
 */
export function computeOfficeDimensions(staffCount: number): OfficeDimensions {
  const safeCount = Math.max(0, Math.floor(staffCount))
  const desksPerBand = OFFICE_DESK_COLS * 2
  const extraBands =
    safeCount > MAX_STAFF_DESKS
      ? Math.ceil((safeCount - MAX_STAFF_DESKS) / desksPerBand)
      : 0
  const podBands = 2 + extraBands
  const rows = podBands * 2
  return {
    width: OFFICE_BASE_W,
    height: OFFICE_BASE_H + extraBands * OFFICE_EXTRA_BAND_STEP,
    rows,
    podBands,
    totalDesks: rows * OFFICE_DESK_COLS,
  }
}

/** Returns the North edge `y` of a back-to-back pod band (`band = 0, 1, 2, ...`). */
export function podBandTopY(band: number): number {
  if (band <= 0) return OFFICE_DESK_START_Y
  return (
    OFFICE_DESK_START_Y +
    OFFICE_POD_BAND_STEP +
    (band - 1) * OFFICE_EXTRA_BAND_STEP
  )
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

/**
 * Deterministic open-plan desk pod coordinates for slot index `0..N-1`.
 *
 * Within each back-to-back pod band:
 * - Even logical rows (`0, 2, 4...`) occupy the camera-facing South side of the pod (`facing: "south"`)
 *   so small teams sit in front-facing seats with visible screens and unobstructed avatars.
 * - Odd logical rows (`1, 3, 5...`) occupy the North side of the same pod (`facing: "north"`),
 *   backing directly onto the low acoustic divider.
 */
export function deskSlotCoords(index: number): {
  x: number
  y: number
  w: number
  h: number
  row: number
  col: number
  band: number
  facing: OfficeDeskFacing
  home: { x: number; y: number }
} {
  const row = Math.floor(index / OFFICE_DESK_COLS)
  const col = index % OFFICE_DESK_COLS
  const podCol = Math.floor(col / OFFICE_DESKS_PER_POD_COL)
  const inPodCol = col % OFFICE_DESKS_PER_POD_COL
  const band = Math.floor(row / 2)
  const isSouthFacing = row % 2 === 0
  const bandY = podBandTopY(band)

  const x =
    OFFICE_DESK_START_X +
    podCol * OFFICE_POD_PITCH_X +
    inPodCol * (OFFICE_DESK_W + OFFICE_POD_GAP_X)
  const y = isSouthFacing
    ? bandY + OFFICE_DESK_H + OFFICE_POD_DIVIDER_H
    : bandY
  const homeY = isSouthFacing
    ? y + OFFICE_DESK_H + OFFICE_DESK_HOME_OFFSET
    : y - OFFICE_DESK_HOME_OFFSET

  return {
    x,
    y,
    w: OFFICE_DESK_W,
    h: OFFICE_DESK_H,
    row,
    col,
    band,
    facing: isSouthFacing ? "south" : "north",
    home: { x: x + OFFICE_DESK_W / 2, y: homeY },
  }
}

/**
 * Assigns every staff member a deterministic desk footprint + walkable `home` spot,
 * sorted by `deskIndex` then Vietnamese `displayName`.
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
      row: slot.row,
      col: slot.col,
      band: slot.band,
      facing: slot.facing,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
      hasMug: idx % 3 === 0,
      home: slot.home,
    }
  })
}

/**
 * Builds the full furnished desk slot grid (`totalDesks >= MAX_STAFF_DESKS`) combining
 * assigned staff members in `deskIndex` order with empty desks for all remaining slots.
 */
export function buildAllDeskSlots(
  assignedDesks: readonly OfficeDeskPlacement[],
  totalDesks?: number
): OfficeDeskSlot[] {
  const resolvedTotal =
    totalDesks ?? computeOfficeDimensions(assignedDesks.length).totalDesks
  const byIndex = new Map<number, OfficeDeskPlacement>()
  for (const desk of assignedDesks) {
    byIndex.set(desk.index, desk)
  }

  const slots: OfficeDeskSlot[] = []
  for (let idx = 0; idx < resolvedTotal; idx += 1) {
    const coords = deskSlotCoords(idx)
    const member = byIndex.get(idx) ?? null
    slots.push({
      index: idx,
      row: coords.row,
      col: coords.col,
      band: coords.band,
      facing: coords.facing,
      x: coords.x,
      y: coords.y,
      w: coords.w,
      h: coords.h,
      home: coords.home,
      occupied: member !== null,
      member,
    })
  }
  return slots
}

/** Low acoustic divider spines between every back-to-back pair of desks in each pod. */
export function getOfficePodDividers(
  podBands = 2
): readonly OfficePodDividerRect[] {
  const dividers: OfficePodDividerRect[] = []
  for (let band = 0; band < podBands; band += 1) {
    const y = podBandTopY(band) + OFFICE_DESK_H
    for (let podCol = 0; podCol < OFFICE_POD_COLS; podCol += 1) {
      const x = OFFICE_DESK_START_X + podCol * OFFICE_POD_PITCH_X
      dividers.push({
        band,
        podCol,
        x,
        y,
        w: OFFICE_POD_W,
        h: OFFICE_POD_DIVIDER_H,
        label: "pod-divider",
      })
    }
  }
  return dividers
}

export interface OfficePlantSpec {
  readonly x: number
  readonly y: number
  readonly tall: boolean
}

/** Lush potted plant clusters framing rooms, aisles, lounge, credenza & printer without blocking paths. */
export function getOfficePlants(
  worldHeight = OFFICE_BASE_H
): readonly OfficePlantSpec[] {
  const plants: OfficePlantSpec[] = [
    // Phòng Sếp
    { x: 660, y: 40, tall: true },
    { x: 40, y: 360, tall: true },
    // Phòng Họp
    { x: 780, y: 40, tall: true },
    { x: 1480, y: 40, tall: true },
    // Phòng Tài Liệu
    { x: 2290, y: 420, tall: false },
    // Khu Nhân Viên: NW corridor entry cluster
    { x: 34, y: 575, tall: true },
    { x: 86, y: 595, tall: false },
    // West promenade sunlit cluster
    { x: 34, y: 935, tall: true },
    { x: 84, y: 955, tall: false },
    // East Coffee Corner & Standee edge clusters
    { x: 2310, y: 620, tall: true },
    { x: 2310, y: 865, tall: false },
    // South strip clusters flanking Lounge, Credenza, Printer & East corner
    { x: 36, y: worldHeight - 150, tall: true },
    { x: 525, y: worldHeight - 135, tall: false },
    { x: 730, y: worldHeight - 135, tall: true },
    { x: 1140, y: worldHeight - 135, tall: false },
    { x: 2036, y: worldHeight - 235, tall: false },
    { x: 2245, y: worldHeight - 115, tall: false },
    { x: 2305, y: worldHeight - 130, tall: true },
  ]
  return plants
}

export interface OfficeLockerSpec extends OfficeRect {
  readonly wall: "west" | "east"
  readonly bays: number
}

/** Personal staff locker banks tucked flush along West & East walls clear of windows & aisles. */
export function getOfficeLockers(
  worldHeight = OFFICE_BASE_H
): readonly OfficeLockerSpec[] {
  const lockers: OfficeLockerSpec[] = [
    {
      wall: "west",
      bays: 3,
      x: 26,
      y: 730,
      w: 56,
      h: 145,
      label: "locker-west-1",
    },
    {
      wall: "west",
      bays: 3,
      x: 26,
      y: 1100,
      w: 56,
      h: 145,
      label: "locker-west-2",
    },
    {
      wall: "east",
      bays: 3,
      x: 2312,
      y: 1245,
      w: 56,
      h: 160,
      label: "locker-east-1",
    },
  ]

  const extraBands = Math.max(
    0,
    Math.round((worldHeight - OFFICE_BASE_H) / OFFICE_EXTRA_BAND_STEP)
  )
  for (let b = 0; b < extraBands; b += 1) {
    const bandY = podBandTopY(2 + b)
    lockers.push({
      wall: "west",
      bays: 3,
      x: 26,
      y: bandY + 12,
      w: 56,
      h: 145,
      label: `locker-west-extra-${b + 1}`,
    })
  }
  return lockers
}

/** Multifunction office printer / copier & supply station in the South-East staff zone. */
export function getPrinterStationRect(
  worldHeight = OFFICE_BASE_H
): OfficeRect {
  return {
    x: 1850,
    y: worldHeight - 240,
    w: 170,
    h: 74,
    label: "printer-station",
  }
}

/** Low magazine & supply credenza framing the South-Center promenade. */
export function getSouthCredenzaRect(worldHeight = OFFICE_BASE_H): OfficeRect {
  return {
    x: 800,
    y: worldHeight - 134,
    w: 320,
    h: 66,
    label: "staff-credenza",
  }
}

/** Compact collaborative huddle table & stools nook in the South-Center-Right zone. */
export function getHuddleNookPositions(worldHeight = OFFICE_BASE_H): {
  readonly rug: OfficeRect
  readonly obstacle: OfficeRect
  readonly table: OfficeRect
} {
  return {
    rug: { x: 1295, y: worldHeight - 178, w: 270, h: 144 },
    obstacle: {
      x: 1330,
      y: worldHeight - 142,
      w: 200,
      h: 74,
      label: "huddle-nook",
    },
    table: { x: 1372, y: worldHeight - 140, w: 116, h: 70 },
  }
}

/** Big walkable Team Banner Rug centered on the main Staff Promenade (`IQX · NHÓM {TÊN SẾP}`). */
export function getTeamBannerRugRect(): OfficeRect {
  return {
    x: 530,
    y: 928,
    w: 800,
    h: 112,
    label: "team-banner-rug",
  }
}

/** Lounge oval rug, sofa & coffee table positions aligned cleanly with bottom-left corner. */
export function getLoungePositions(worldHeight = OFFICE_BASE_H): {
  readonly rug: OfficeRect
  readonly sofa: OfficeRect
  readonly table: OfficeRect
} {
  return {
    rug: { x: 110, y: worldHeight - 188, w: 360, h: 154 },
    sofa: { x: 170, y: worldHeight - 172, w: 210, h: 66 },
    table: { x: 215, y: worldHeight - 92, w: 120, h: 48 },
  }
}

export interface OfficeZoneRugSpec extends OfficeRect {
  readonly id: string
  readonly shape: "oval" | "rounded"
  readonly colorHex: string
  readonly borderHex: string
  readonly borderWidth: number
}

/** Per-zone decorative rugs and pod-band carpets that stay 100% walkable. */
export function getZoneRugs(
  worldHeight = OFFICE_BASE_H
): readonly OfficeZoneRugSpec[] {
  const extraBands = Math.max(
    0,
    Math.round((worldHeight - OFFICE_BASE_H) / OFFICE_EXTRA_BAND_STEP)
  )
  const podBands = 2 + extraBands

  const rugs: OfficeZoneRugSpec[] = [
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
      y: 576,
      w: 1840,
      h: 60,
      shape: "rounded",
      colorHex: "#213358",
      borderHex: "#d9a03a",
      borderWidth: 0.08,
    },
    // Góc Cà Phê warm bistro mat
    {
      id: "coffee-rug",
      x: 1825,
      y: 620,
      w: 495,
      h: 260,
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

  // Framed woven work mats beneath each back-to-back pod band (keeps cross-aisles & walkways crisp)
  for (let band = 0; band < podBands; band += 1) {
    const bandY = podBandTopY(band)
    rugs.push({
      id: `staff-band-mat-${band}`,
      x: 176,
      y: bandY - 20,
      w: 1506,
      h: OFFICE_DESK_H * 2 + OFFICE_POD_DIVIDER_H + 40,
      shape: "rounded",
      colorHex: "#e5d5bc",
      borderHex: "#b89b72",
      borderWidth: 0.09,
    })
  }

  return rugs
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

/** Sunlit architectural windows placed cleanly clear of shelves, lockers & wall art. */
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
    // West cutaway wall windows (Boss room, corridor entry, Central Promenade, Lounge)
    { wall: "west", pos: 220, span: 170, centerY: 1.32, heightU: 0.9, sunPool: true },
    { wall: "west", pos: 640, span: 130, centerY: 1.34, heightU: 0.86, sunPool: true },
    { wall: "west", pos: 985, span: 170, centerY: 1.34, heightU: 0.88, sunPool: true },
    { wall: "west", pos: 1350, span: 150, centerY: 1.34, heightU: 0.86, sunPool: true },
    // East cutaway wall windows (Coffee Corner & Standee)
    { wall: "east", pos: 760, span: 170, centerY: 1.34, heightU: 0.88, sunPool: true },
    { wall: "east", pos: 1090, span: 165, centerY: 1.34, heightU: 0.88, sunPool: false },
  ]
  if (worldHeight > OFFICE_BASE_H) {
    const extraBands = Math.round(
      (worldHeight - OFFICE_BASE_H) / OFFICE_EXTRA_BAND_STEP
    )
    for (let b = 0; b < extraBands; b += 1) {
      const y = OFFICE_BASE_H + b * OFFICE_EXTRA_BAND_STEP + 140
      wins.push(
        { wall: "west", pos: y, span: 170, centerY: 1.34, heightU: 0.88, sunPool: true },
        { wall: "east", pos: y, span: 170, centerY: 1.34, heightU: 0.88, sunPool: false }
      )
    }
  }
  return wins
}

export interface OfficeWallArtSpec {
  readonly wall: "west" | "east"
  readonly pos: number
  readonly widthU: number
  readonly heightU: number
  readonly centerY: number
  readonly variant: "chart" | "crest" | "mountain" | "motto" | "target"
}

/** Framed office wall art along West & East Staff Area walls, clear of windows. */
export function getOfficeWallArt(
  worldHeight = OFFICE_BASE_H
): readonly OfficeWallArtSpec[] {
  const art: OfficeWallArtSpec[] = [
    { wall: "west", pos: 802, widthU: 1.06, heightU: 0.66, centerY: 1.48, variant: "motto" },
    { wall: "west", pos: 1172, widthU: 1.06, heightU: 0.66, centerY: 1.48, variant: "mountain" },
    { wall: "east", pos: 925, widthU: 1.04, heightU: 0.66, centerY: 1.46, variant: "chart" },
    { wall: "east", pos: 1325, widthU: 1.08, heightU: 0.66, centerY: 1.48, variant: "target" },
  ]
  if (worldHeight > OFFICE_BASE_H) {
    art.push({
      wall: "east",
      pos: worldHeight - 230,
      widthU: 1.04,
      heightU: 0.66,
      centerY: 1.46,
      variant: "crest",
    })
  }
  return art
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
 * ALL furnished staff desks (both assigned & empty), pod dividers, lockers,
 * printer/copier station, south credenza, huddle nook, coffee counter, standee base,
 * lounge sofa/table, and potted plants.
 */
export function buildOfficeObstacles(
  staffCountOrDesks: number | readonly OfficeDeskPlacement[] = MAX_STAFF_DESKS
): OfficeRect[] {
  const staffCount =
    typeof staffCountOrDesks === "number"
      ? Math.max(0, staffCountOrDesks)
      : staffCountOrDesks.length

  const dims = computeOfficeDimensions(staffCount)
  const worldH = dims.height
  const lounge = getLoungePositions(worldH)
  const huddle = getHuddleNookPositions(worldH)
  const printer = getPrinterStationRect(worldH)
  const credenza = getSouthCredenzaRect(worldH)
  const lockers = getOfficeLockers(worldH)
  const podDividers = getOfficePodDividers(dims.podBands)
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

    // Góc Cà Phê, Standee base, Lounge, Credenza, Huddle Nook & Printer Station
    { x: 1860, y: 640, w: 170, h: 60, label: "coffee-bar" },
    OFFICE_COFFEE_COOLER_RECT,
    OFFICE_COFFEE_TABLE_RECT,
    { x: 2090, y: 1046, w: 210, h: 40, label: "standee-base" },
    { ...lounge.sofa, label: "lounge-sofa" },
    { ...lounge.table, label: "lounge-table" },
    credenza,
    huddle.obstacle,
    printer,
    getOfficeExitDoor(worldH).obstacle,
  ]

  for (const locker of lockers) {
    obstacles.push({
      x: locker.x,
      y: locker.y,
      w: locker.w,
      h: locker.h,
      label: locker.label,
    })
  }

  for (const divider of podDividers) {
    obstacles.push({
      x: divider.x,
      y: divider.y,
      w: divider.w,
      h: divider.h,
      label: divider.label,
    })
  }

  // All furnished staff desks (both occupied member desks and empty desks) are solid obstacles
  for (let idx = 0; idx < dims.totalDesks; idx += 1) {
    const slot = deskSlotCoords(idx)
    obstacles.push({
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
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
