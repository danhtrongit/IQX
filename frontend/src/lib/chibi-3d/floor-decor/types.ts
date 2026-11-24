import type * as THREE from "three"

import type { WorldTransformConfig } from "../types.ts"

/**
 * Axis-aligned collision obstacle in logical 2048×1408 trading-floor coordinates.
 * Used identically by `buildFloorNavGrid()` and the 3D decor placement builder so visuals
 * and walkability never drift out of sync.
 */
export interface FloorDecorObstacle {
  readonly id: string
  /** Center X in logical floor space (0..2048). */
  readonly cx: number
  /** Center Y in logical floor space (0..1408). */
  readonly cy: number
  /** Blocked width in logical units. */
  readonly footW: number
  /** Blocked depth in logical units. */
  readonly footH: number
  /** Optional yaw rotation in radians around +Y. */
  readonly rotY?: number
}

export interface DecorContactShadowSpec {
  readonly wx: number
  readonly wz: number
  readonly w: number
  readonly d: number
  readonly kind: "oval" | "box"
  readonly opacity: number
}

export interface FloorDecorOptions {
  readonly world: WorldTransformConfig
  readonly lite: boolean
  readonly wallH: number
  readonly side: number
}

export interface FloorDecorMount {
  /** Static merged + instanced decor group (mounted under `staticGroup` so matrices freeze once). */
  readonly staticGroup: THREE.Group
  /** Lightweight animated group (koi fish + pond ripple ring) mounted under live `group`. */
  readonly animatedGroup: THREE.Group
  /** Contact shadows to merge into the floor's existing batched shadow plane pass. */
  readonly contactShadows: readonly DecorContactShadowSpec[]
  /** World-space center of the koi pond wishing fountain for cheap coin-toss sparkles. */
  readonly fountainSparkPos: { readonly x: number; readonly y: number; readonly z: number }
  /** Cheap shader-free animation tick (0 per-frame allocations). */
  readonly update: (dt: number, elapsedS: number, reducedMotion: boolean) => void
  /** Re-flags dynamic canvas textures (2nd LED ticker) after WebGL context restoration. */
  readonly refreshDynamicTextures: () => void
  /** Disposes every geometry, material, and texture owned by this floor-decor mount. */
  readonly dispose: () => void
}

/**
 * Canonical placement layout for all new Khu Giao Dịch decor items in logical `2048 × 1408` space.
 * Every obstacle strictly avoids:
 * - All 4 backend bot corridors:
 *   - FLOOR_CENTRAL: x 800..1320, y 560..1270
 *   - NORTH_WALKWAY: x 260..1800, y 500..560
 *   - SW_LOUNGE_CLEARANCE: x 110..700, y 1030..1200
 *   - SE_FAME_CLEARANCE: x 1390..1940, y 1190..1290
 * - Interactive hotspots & access points (Thần Tài, LED, SACO, Statues 1-3, Reception, West Portal Door)
 * - Existing furniture footprints in `layout.ts`.
 */
export const FLOOR_DECOR_LAYOUT = {
  /** 3 round high-top trading desk islands with mini candlestick monitors & 3 bar stools each. */
  tradingIslands: [
    { id: "decor-island-nw", cx: 618, cy: 426, footW: 102, footH: 102, rotY: 0.25 },
    { id: "decor-island-mw", cx: 708, cy: 742, footW: 106, footH: 106, rotY: -0.4 },
    { id: "decor-island-se", cx: 1530, cy: 1114, footW: 106, footH: 106, rotY: 0.65 },
  ] as readonly FloorDecorObstacle[],

  /** Koi pond & prosperity lotus wishing fountain in the bare NE atrium courtyard. */
  koiFountain: {
    id: "decor-koi-fountain",
    cx: 1396,
    cy: 424,
    footW: 120,
    footH: 112,
    rotY: 0,
  } as FloorDecorObstacle,

  /** Bull & Bear chibi statues on marble pedestals flanking Hall of Fame ("Vinh danh"). */
  bullStatue: {
    id: "decor-statue-bull",
    cx: 1412,
    cy: 658,
    footW: 72,
    footH: 52,
    rotY: -0.22,
  } as FloorDecorObstacle,
  bearStatue: {
    id: "decor-statue-bear",
    cx: 1888,
    cy: 658,
    footW: 72,
    footH: 52,
    rotY: 0.22,
  } as FloorDecorObstacle,

  /** Coffee & tea bar corner in the open South-West nook (facing North). */
  coffeeBar: {
    id: "decor-coffee-bar",
    cx: 274,
    cy: 1322,
    footW: 192,
    footH: 88,
    rotY: Math.PI,
  } as FloorDecorObstacle,

  /** Financial newsstand with tiny stacked newspapers & striped awning in SE promenade. */
  newsstand: {
    id: "decor-newsstand",
    cx: 1796,
    cy: 1116,
    footW: 112,
    footH: 72,
    rotY: -0.2,
  } as FloorDecorObstacle,

  /** Sleek IQX touchscreen info kiosks (1 visible near Mid-W cross aisle, 1 at South entry). */
  infoKiosks: [
    { id: "decor-kiosk-west", cx: 746, cy: 920, footW: 50, footH: 44, rotY: 0.35 },
    { id: "decor-kiosk-south", cx: 1244, cy: 1336, footW: 50, footH: 44, rotY: -2.85 },
  ] as readonly FloorDecorObstacle[],

  /** Plush walnut-and-navy gallery benches (facing LED board, SACO board, and Hall of Fame). */
  benches: [
    { id: "decor-bench-nw", cx: 362, cy: 442, footW: 122, footH: 44, rotY: Math.PI },
    { id: "decor-bench-ne", cx: 1666, cy: 442, footW: 122, footH: 44, rotY: Math.PI },
    { id: "decor-bench-se", cx: 1666, cy: 1338, footW: 132, footH: 44, rotY: Math.PI },
  ] as readonly FloorDecorObstacle[],

  /** Rectangular trough planters acting as soft architectural dividers. */
  planterDividers: [
    { id: "decor-divider-mw", cx: 738, cy: 614, footW: 84, footH: 32, rotY: 0 },
    { id: "decor-divider-sw-lounge", cx: 218, cy: 968, footW: 88, footH: 32, rotY: 0 },
    { id: "decor-divider-sw-cafe", cx: 446, cy: 1326, footW: 34, footH: 84, rotY: Math.PI / 2 },
    { id: "decor-divider-se-fame", cx: 1376, cy: 1114, footW: 34, footH: 84, rotY: Math.PI / 2 },
  ] as readonly FloorDecorObstacle[],

  /** Lunar-New-Year / Thần Tài prosperity trees: Hoa Đào (pink peach) & Hoa Mai (golden apricot). */
  peachTrees: [
    { id: "decor-peach-shrine", cx: 824, cy: 306, footW: 44, footH: 38, rotY: 0.3 },
    { id: "decor-peach-entry", cx: 1164, cy: 1344, footW: 44, footH: 38, rotY: -0.5 },
  ] as readonly FloorDecorObstacle[],
  apricotTrees: [
    { id: "decor-apricot-shrine", cx: 1224, cy: 306, footW: 44, footH: 38, rotY: -0.35 },
    { id: "decor-apricot-entry", cx: 878, cy: 1344, footW: 44, footH: 38, rotY: 0.45 },
  ] as readonly FloorDecorObstacle[],

  /** Tall potted lucky bamboo groves hugging West & East perimeter walls. */
  bambooPlanters: [
    { id: "decor-bamboo-w1", cx: 70, cy: 874, footW: 36, footH: 36, rotY: 0.2 },
    { id: "decor-bamboo-w2", cx: 70, cy: 1126, footW: 36, footH: 36, rotY: 1.1 },
    { id: "decor-bamboo-e1", cx: 1974, cy: 468, footW: 36, footH: 36, rotY: -0.4 },
    { id: "decor-bamboo-e2", cx: 1974, cy: 774, footW: 36, footH: 36, rotY: 0.8 },
    { id: "decor-bamboo-e3", cx: 1974, cy: 1044, footW: 36, footH: 36, rotY: 2.1 },
    { id: "decor-bamboo-e4", cx: 1974, cy: 1236, footW: 36, footH: 36, rotY: -1.2 },
  ] as readonly FloorDecorObstacle[],

  /** Glossy golden Maneki-Neko lucky-cat statues on carved crimson-lacquer pedestals. */
  luckyCats: [
    { id: "decor-lucky-cat-clocks", cx: 1292, cy: 302, footW: 42, footH: 38, rotY: -0.15 },
    { id: "decor-lucky-cat-ne", cx: 1900, cy: 304, footW: 42, footH: 38, rotY: -0.3 },
    { id: "decor-lucky-cat-west", cx: 74, cy: 438, footW: 42, footH: 38, rotY: Math.PI / 2 - 0.12 },
  ] as readonly FloorDecorObstacle[],

  /** Glittering gold coin & sycee ingot bowls near Thần Tài altar and Koi wishing fountain. */
  goldCoinPiles: [
    { id: "decor-coins-altar-l", cx: 896, cy: 444, footW: 34, footH: 28, rotY: 0.25 },
    { id: "decor-coins-altar-r", cx: 1152, cy: 444, footW: 34, footH: 28, rotY: -0.25 },
    { id: "decor-coins-fountain", cx: 1472, cy: 454, footW: 34, footH: 28, rotY: 0.8 },
  ] as readonly FloorDecorObstacle[],
} as const

/** Flat list of every obstacle added by floor-decor, consumed directly by `buildFloorNavGrid()`. */
export const FLOOR_DECOR_OBSTACLES: readonly FloorDecorObstacle[] = [
  ...FLOOR_DECOR_LAYOUT.tradingIslands,
  FLOOR_DECOR_LAYOUT.koiFountain,
  FLOOR_DECOR_LAYOUT.bullStatue,
  FLOOR_DECOR_LAYOUT.bearStatue,
  FLOOR_DECOR_LAYOUT.coffeeBar,
  FLOOR_DECOR_LAYOUT.newsstand,
  ...FLOOR_DECOR_LAYOUT.infoKiosks,
  ...FLOOR_DECOR_LAYOUT.benches,
  ...FLOOR_DECOR_LAYOUT.planterDividers,
  ...FLOOR_DECOR_LAYOUT.peachTrees,
  ...FLOOR_DECOR_LAYOUT.apricotTrees,
  ...FLOOR_DECOR_LAYOUT.bambooPlanters,
  ...FLOOR_DECOR_LAYOUT.luckyCats,
  ...FLOOR_DECOR_LAYOUT.goldCoinPiles,
]
