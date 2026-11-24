/**
 * Open-Floor Khu Văn phòng floorplan geometry (KGD presentation language):
 * - NO enclosing west/east/south walls, NO glass room partitions, NO enclosed rooms.
 * - ONE grand North Back Wall (`y = 0..OFFICE_NORTH_WALL_Y`) carrying the Big Team LED Board,
 *   stock-ticker ribbon, world clocks, panoramic city-skyline windows, meeting screen,
 *   bookshelves, and the portal door to Khu giao dịch.
 * - 6 open zones marked by large bordered rugs & painted floor decals:
 *   "BÀN SẾP", "PHÒNG HỌP" (soft low-planter border, no glass), "TÀI LIỆU",
 *   "KHU LÀM VIỆC" (24-desk open-plan pod grid + dynamic >24 expansion),
 *   "GÓC NGHỈ" (sofa, espresso bar, water cooler, snack shelf, foosball, mini arcade),
 *   and "GÓC THÀNH TÍCH" (3 trophy pedestals, framed certificates, live standee).
 *
 * Canonical base world: `2400 × 1560 px` (`24.0u × 15.6u` at `scale = 1 / 100`).
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
/** Depth of the single North back wall band (`y = 0..76`). No west/east/south walls exist. */
export const OFFICE_NORTH_WALL_Y = 76
/** Open-floor flag: zero enclosing side/south walls and zero interior room partitions. */
export const OFFICE_HAS_ENCLOSING_WALLS = false

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
export const OFFICE_POD_W =
  OFFICE_DESK_W * OFFICE_DESKS_PER_POD_COL + OFFICE_POD_GAP_X
export const OFFICE_POD_PITCH_X = OFFICE_POD_W + OFFICE_POD_AISLE_X

/**
 * 3 pod columns × 2 desks each starting at x = 200:
 * - Pod 0: [200..390], [396..586] -> 150 px aisle
 * - Pod 1: [736..926], [932..1122] -> 150 px aisle
 * - Pod 2: [1272..1462], [1468..1658] -> 187 px main boulevard before Góc Nghỉ (x = 1845)
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
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
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

export interface OfficeExitDoorSpec {
  /** Center of the portal doorway flush along the North back wall. */
  readonly x: number
  readonly y: number
  /** Solid door-frame collision box flush against the North back wall. */
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
 * Portal door on the East bay of the North back wall connecting Khu Văn phòng <-> Khu giao dịch.
 * Facing South (`+Z`) directly toward the camera; fixed position across base (24-desk) and
 * expanded (>24-desk) maps.
 */
export function getOfficeExitDoor(
  worldHeight = OFFICE_BASE_H
): OfficeExitDoorSpec {
  const x = 2235
  const y = Math.min(OFFICE_NORTH_WALL_Y, Math.max(40, worldHeight - 200))
  return {
    x,
    y,
    obstacle: {
      x: x - 76,
      y,
      w: 152,
      h: 36,
      label: "office-exit-door",
    },
    access: { x, y: 184 },
    through: { x, y: 98 },
    spawnInside: { x, y: 148 },
    label: "Khu giao dịch",
    radius: OFFICE_STATION_RADIUS,
  }
}

export type OfficeZoneId =
  | "boss"
  | "meet"
  | "docs"
  | "work"
  | "lounge"
  | "awards"

export interface OfficeZoneRect extends OfficeRect {
  readonly id: OfficeZoneId
  readonly title: string
}

export interface OfficeFloorLabelSpec {
  readonly id: OfficeZoneId
  readonly text: string
  readonly x: number
  readonly y: number
  readonly widthU: number
  readonly heightU: number
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
  /** Optional click hitbox in logical coordinates so direct clicks on the station work. */
  readonly hitRect?: OfficeRect
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

/** Returns the 6 open-floor zones marked on the stone tile floor (zero walls between zones). */
export function getOfficeZones(
  worldHeight = OFFICE_BASE_H
): readonly OfficeZoneRect[] {
  return [
    { id: "boss", title: "BÀN SẾP", x: 60, y: 110, w: 670, h: 390 },
    { id: "meet", title: "PHÒNG HỌP", x: 850, y: 110, w: 770, h: 400 },
    { id: "docs", title: "TÀI LIỆU", x: 1680, y: 110, w: 420, h: 330 },
    {
      id: "work",
      title: "KHU LÀM VIỆC",
      x: 150,
      y: 570,
      w: 1560,
      h: Math.max(820, worldHeight - 620),
    },
    { id: "lounge", title: "GÓC NGHỈ", x: 1800, y: 530, w: 540, h: 470 },
    { id: "awards", title: "GÓC THÀNH TÍCH", x: 1800, y: 1045, w: 540, h: 410 },
  ]
}

/** Painted floor zone decals (same KGD bronze typography as "PHÒNG CHỜ" / "VINH DANH TOP DỰ ĐOÁN"). */
export function getOfficeFloorLabels(): readonly OfficeFloorLabelSpec[] {
  return [
    { id: "boss", text: "BÀN SẾP", x: 440, y: 474, widthU: 3.1, heightU: 0.72 },
    { id: "meet", text: "PHÒNG HỌP", x: 1210, y: 498, widthU: 3.4, heightU: 0.74 },
    { id: "docs", text: "TÀI LIỆU", x: 1890, y: 426, widthU: 2.9, heightU: 0.68 },
    { id: "work", text: "KHU LÀM VIỆC", x: 930, y: 590, widthU: 4.1, heightU: 0.8 },
    { id: "lounge", text: "GÓC NGHỈ", x: 2070, y: 536, widthU: 3.2, heightU: 0.72 },
    {
      id: "awards",
      text: "GÓC THÀNH TÍCH",
      x: 2072,
      y: 1054,
      widthU: 4.3,
      heightU: 0.78,
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

/** Soft-border low wooden/stone planters framing PHÒNG HỌP (zero glass partitions). */
export function getMeetingPlanters(): readonly OfficeRect[] {
  return [
    { x: 860, y: 205, w: 44, h: 195, label: "meeting-planter-w" },
    { x: 1516, y: 205, w: 44, h: 195, label: "meeting-planter-e" },
    { x: 924, y: 440, w: 112, h: 36, label: "meeting-planter-sw" },
    { x: 1384, y: 440, w: 112, h: 36, label: "meeting-planter-se" },
  ]
}

export type OfficePlantVariety = "fiddle" | "monstera" | "snake"

export interface OfficePlantSpec {
  readonly x: number
  readonly y: number
  readonly kind: OfficePlantVariety
  readonly scale?: number
}

/** Potted corner trees & lush plants of 3 kinds distributed cleanly around open zones & corners. */
export function getOfficePlants(
  worldHeight = OFFICE_BASE_H
): readonly OfficePlantSpec[] {
  return [
    // Corner trees (fiddle-leaf fig)
    { x: 56, y: 152, kind: "fiddle", scale: 1.08 },
    { x: 2346, y: 156, kind: "fiddle", scale: 1.05 },
    { x: 72, y: worldHeight - 116, kind: "fiddle", scale: 1.1 },
    { x: 2334, y: worldHeight - 98, kind: "fiddle", scale: 1.08 },
    // Flanking north open-zone transitions
    { x: 772, y: 128, kind: "fiddle", scale: 0.96 },
    { x: 1646, y: 128, kind: "fiddle", scale: 0.96 },
    // Tropical Monstera clusters along open promenades
    { x: 76, y: 540, kind: "monstera", scale: 1.02 },
    { x: 76, y: 976, kind: "monstera", scale: 1.0 },
    { x: 2328, y: 622, kind: "monstera", scale: 0.98 },
    { x: 2328, y: 1016, kind: "monstera", scale: 0.98 },
    { x: 460, y: worldHeight - 102, kind: "monstera", scale: 0.96 },
    { x: 1410, y: worldHeight - 102, kind: "monstera", scale: 0.96 },
    // Architectural Snake Plants accenting zones
    { x: 238, y: 378, kind: "snake", scale: 1.0 },
    { x: 2120, y: 132, kind: "snake", scale: 0.96 },
    { x: 1790, y: 622, kind: "snake", scale: 0.95 },
    { x: 1782, y: 1170, kind: "snake", scale: 0.98 },
    { x: 730, y: worldHeight - 102, kind: "snake", scale: 0.95 },
    { x: 1156, y: worldHeight - 102, kind: "snake", scale: 0.95 },
  ]
}

/** Low supply & copier credenza along the south open strip (moves with expanded map height). */
export function getPrinterStationRect(
  worldHeight = OFFICE_BASE_H
): OfficeRect {
  return {
    x: 800,
    y: worldHeight - 118,
    w: 290,
    h: 58,
    label: "printer-station",
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

/** Góc nghỉ (Break Zone) furniture coordinates: sofa, coffee table, espresso bar, water cooler, snack shelf, foosball & mini arcade. */
export const OFFICE_LOUNGE_PROPS = {
  coffeeBar: { x: 1845, y: 594, w: 166, h: 58, label: "coffee-bar" } as OfficeRect,
  waterCooler: { x: 2032, y: 598, w: 50, h: 50, label: "water-cooler" } as OfficeRect,
  snackShelf: { x: 2106, y: 592, w: 168, h: 54, label: "snack-shelf" } as OfficeRect,
  sofa: { x: 1845, y: 742, w: 186, h: 64, label: "lounge-sofa" } as OfficeRect,
  coffeeTable: { x: 1882, y: 834, w: 112, h: 46, label: "lounge-table" } as OfficeRect,
  foosball: { x: 2116, y: 736, w: 146, h: 86, label: "foosball-table" } as OfficeRect,
  arcade: { x: 2258, y: 862, w: 56, h: 56, label: "arcade-cabinet" } as OfficeRect,
} as const

/** Góc thành tích (Achievement Zone) furniture coordinates: 3 trophy pedestals, standee, 2 certificate easels. */
export const OFFICE_AWARDS_PROPS = {
  pedestals: { x: 1848, y: 1132, w: 208, h: 60, label: "trophy-pedestals" } as OfficeRect,
  standee: { x: 2104, y: 1128, w: 204, h: 44, label: "standee-base" } as OfficeRect,
  easelWest: { x: 1848, y: 1326, w: 56, h: 44, label: "certificate-easel-1" } as OfficeRect,
  easelEast: { x: 2248, y: 1326, w: 56, h: 44, label: "certificate-easel-2" } as OfficeRect,
} as const

/** North-wall & North-zone static furniture coordinates. */
export const OFFICE_NORTH_PROPS = {
  bossShelf: { x: 76, y: 78, w: 184, h: 48, label: "boss-shelf" } as OfficeRect,
  bossDesk: { x: 300, y: 180, w: 280, h: 100, label: "boss-desk" } as OfficeRect,
  bossSofa: { x: 596, y: 332, w: 132, h: 64, label: "boss-sofa" } as OfficeRect,
  meetCredenza: { x: 1330, y: 78, w: 270, h: 48, label: "meet-credenza" } as OfficeRect,
  conferenceTable: { x: 1005, y: 215, w: 410, h: 146, label: "conference-table" } as OfficeRect,
  whiteboard: { x: 1574, y: 256, w: 38, h: 96, label: "meeting-whiteboard" } as OfficeRect,
  docsShelf1: { x: 1690, y: 78, w: 185, h: 52, label: "docs-shelf-1" } as OfficeRect,
  docsShelf2: { x: 1895, y: 78, w: 185, h: 52, label: "docs-shelf-2" } as OfficeRect,
  readingDesk: { x: 1790, y: 230, w: 195, h: 86, label: "reading-desk" } as OfficeRect,
} as const

export interface OfficeZoneRugSpec extends OfficeRect {
  readonly id: string
  readonly shape: "oval" | "rounded"
  readonly colorHex: string
  readonly borderHex: string
  readonly innerBorderHex?: string
}

/** Per-zone decorative open-floor rugs (100% walkable, KGD visual language). */
export function getZoneRugs(
  worldHeight = OFFICE_BASE_H
): readonly OfficeZoneRugSpec[] {
  const extraBands = Math.max(
    0,
    Math.round((worldHeight - OFFICE_BASE_H) / OFFICE_EXTRA_BAND_STEP)
  )
  const podBands = 2 + extraBands

  const rugs: OfficeZoneRugSpec[] = [
    // BÀN SẾP: executive navy & brushed-gold bordered rug
    {
      id: "boss-rug",
      x: 215,
      y: 138,
      w: 520,
      h: 306,
      shape: "rounded",
      colorHex: "#203457",
      borderHex: "#d9a03a",
      innerBorderHex: "rgba(246, 210, 122, 0.42)",
    },
    // PHÒNG HỌP: slate-navy & gold rug beneath conference table
    {
      id: "meet-rug",
      x: 922,
      y: 162,
      w: 576,
      h: 294,
      shape: "rounded",
      colorHex: "#364a6d",
      borderHex: "#c9a24b",
      innerBorderHex: "rgba(246, 210, 122, 0.36)",
    },
    // TÀI LIỆU: warm parchment & walnut bordered reading rug
    {
      id: "docs-rug",
      x: 1710,
      y: 176,
      w: 360,
      h: 222,
      shape: "rounded",
      colorHex: "#ece0c9",
      borderHex: "#8c653c",
      innerBorderHex: "rgba(140, 101, 60, 0.35)",
    },
    // GÓC NGHỈ: cozy cream & navy bordered open lounge rug (like KGD PHÒNG CHỜ)
    {
      id: "lounge-rug",
      x: 1806,
      y: 564,
      w: 524,
      h: 416,
      shape: "rounded",
      colorHex: "#efe2cc",
      borderHex: "#243760",
      innerBorderHex: "rgba(36, 55, 96, 0.28)",
    },
    // GÓC THÀNH TÍCH: VIP crimson/gold-trimmed showcase rug (echoing KGD Hall of Fame!)
    {
      id: "awards-rug",
      x: 1814,
      y: 1086,
      w: 516,
      h: 350,
      shape: "rounded",
      colorHex: "#f2e5ce",
      borderHex: "#9b1c26",
      innerBorderHex: "#e9b949",
    },
  ]

  // Framed warm woven mats beneath each back-to-back staff pod band
  for (let band = 0; band < podBands; band += 1) {
    const bandY = podBandTopY(band)
    rugs.push({
      id: `staff-band-mat-${band}`,
      x: 174,
      y: bandY - 22,
      w: 1510,
      h: OFFICE_DESK_H * 2 + OFFICE_POD_DIVIDER_H + 44,
      shape: "rounded",
      colorHex: "#ede0ca",
      borderHex: "#c4a77d",
      innerBorderHex: "rgba(184, 155, 114, 0.35)",
    })
  }

  return rugs
}

export interface OfficeNorthWindowSpec {
  /** Logical center X along the North back wall. */
  readonly x: number
  /** Width along the wall in logical px. */
  readonly span: number
  /** Vertical center height in world units. */
  readonly centerY: number
  /** Window height in world units. */
  readonly heightU: number
  readonly mullions: number
  readonly sunPool?: boolean
}

/** Panoramic city-skyline window strips along the single North back wall. */
export function getOfficeNorthWindows(): readonly OfficeNorthWindowSpec[] {
  return [
    // Bay 1 (behind Bàn sếp): panoramic city skyline window
    { x: 475, span: 365, centerY: 2.32, heightU: 1.56, mullions: 4, sunPool: true },
    // Bay 3 (above Phòng họp live screen): clerestory city skyline strip
    { x: 1470, span: 300, centerY: 3.44, heightU: 0.66, mullions: 3, sunPool: false },
    // Bay 4 (above Archive bookshelves): clerestory city skyline strip
    { x: 1890, span: 350, centerY: 3.44, heightU: 0.66, mullions: 3, sunPool: false },
  ]
}

/**
 * Builds the exact static + dynamic AABB collision boxes for the open-floor office:
 * - ONE North back wall (`y = 0..76`) — ZERO side walls, ZERO south wall, ZERO interior room partitions!
 * - All zone furniture, low meeting planters, ALL furnished staff desks (occupied & empty),
 *   pod dividers, south printer credenza, exit portal door frame, and potted plants.
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
  const podDividers = getOfficePodDividers(dims.podBands)
  const plants = getOfficePlants(worldH)
  const planters = getMeetingPlanters()
  const printer = getPrinterStationRect(worldH)
  const exitDoor = getOfficeExitDoor(worldH)

  const obstacles: OfficeRect[] = [
    // Single North back wall (NO west, east, south, or interior glass partition walls!)
    {
      x: 0,
      y: 0,
      w: OFFICE_BASE_W,
      h: OFFICE_NORTH_WALL_Y,
      label: "north-wall",
    },

    // North zones: Bàn sếp, Phòng họp, Tài liệu
    OFFICE_NORTH_PROPS.bossShelf,
    OFFICE_NORTH_PROPS.bossDesk,
    OFFICE_NORTH_PROPS.bossSofa,
    OFFICE_NORTH_PROPS.meetCredenza,
    OFFICE_NORTH_PROPS.conferenceTable,
    OFFICE_NORTH_PROPS.whiteboard,
    OFFICE_NORTH_PROPS.docsShelf1,
    OFFICE_NORTH_PROPS.docsShelf2,
    OFFICE_NORTH_PROPS.readingDesk,

    // Soft-border low planters around Phòng họp
    ...planters,

    // Góc Nghỉ: espresso bar, water cooler, snack shelf, sofa, coffee table, foosball, mini arcade
    OFFICE_LOUNGE_PROPS.coffeeBar,
    OFFICE_LOUNGE_PROPS.waterCooler,
    OFFICE_LOUNGE_PROPS.snackShelf,
    OFFICE_LOUNGE_PROPS.sofa,
    OFFICE_LOUNGE_PROPS.coffeeTable,
    OFFICE_LOUNGE_PROPS.foosball,
    OFFICE_LOUNGE_PROPS.arcade,

    // Góc Thành Tích: trophy pedestals, standee, certificate easels
    OFFICE_AWARDS_PROPS.pedestals,
    OFFICE_AWARDS_PROPS.standee,
    OFFICE_AWARDS_PROPS.easelWest,
    OFFICE_AWARDS_PROPS.easelEast,

    // South supply & copier credenza + North-wall portal door frame
    printer,
    exitDoor.obstacle,
  ]

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
      x: plant.x - 18,
      y: plant.y - 16,
      w: 36,
      h: 32,
      label: "plant",
    })
  }

  return obstacles
}

/**
 * Open-floor AABB collision test:
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
 * so chibi characters glide smoothly along desk edges and furniture.
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
 * Builds the exact 5 interactive proximity stations from Spec §3.2 (`mydesk` is Staff-only),
 * each with an optional direct-click logical hit rectangle so clicking the boss desk,
 * own desk, meeting table, archive shelf, or achievement showcase works seamlessly.
 */
export function buildOfficeStations(
  role: OfficeRole,
  selfDeskHome: { readonly x: number; readonly y: number } | null,
  currentMonth: number,
  selfDeskRect?: OfficeRect | null
): OfficeStation[] {
  const stations: OfficeStation[] = [
    {
      id: "boss",
      x: 440,
      y: 340,
      label: role === "boss" ? "Bàn sếp · Quản lý" : "Bàn sếp · Gửi đề xuất",
      modal: role === "boss" ? "mgr" : "mine",
      focusProposal: role === "staff",
      hitRect: OFFICE_NORTH_PROPS.bossDesk,
    },
    {
      id: "meet",
      x: 1210,
      y: 420,
      label: "Phòng họp",
      modal: "meet",
      hitRect: OFFICE_NORTH_PROPS.conferenceTable,
    },
    {
      id: "docs",
      x: 1888,
      y: 365,
      label: "Kệ tài liệu",
      modal: "docs",
      hitRect: { x: 1690, y: 78, w: 390, h: 240 },
    },
    {
      id: "stand",
      x: 2076,
      y: 1255,
      label: `Thành tích tháng ${currentMonth}`,
      modal: "stand",
      hitRect: { x: 1848, y: 1110, w: 465, h: 125 },
    },
  ]

  if (role === "staff" && selfDeskHome) {
    stations.push({
      id: "mydesk",
      x: selfDeskHome.x,
      y: selfDeskHome.y + 10,
      label: "Bàn của tôi · Nhiệm vụ",
      modal: "mine",
      hitRect: selfDeskRect ?? {
        x: selfDeskHome.x - OFFICE_DESK_W / 2,
        y: selfDeskHome.y - OFFICE_DESK_H - OFFICE_DESK_HOME_OFFSET,
        w: OFFICE_DESK_W,
        h: OFFICE_DESK_H,
      },
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

/** Finds an interactive station whose `hitRect` contains logical click point `(lx, ly)`. */
export function findClickedStation(
  lx: number,
  ly: number,
  stations: readonly OfficeStation[]
): OfficeStation | null {
  for (const station of stations) {
    const r = station.hitRect
    if (!r) continue
    if (lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) {
      return station
    }
  }
  return null
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
