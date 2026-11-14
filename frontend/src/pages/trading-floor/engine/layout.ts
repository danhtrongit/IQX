/**
 * The trading floor plan in world units (1 unit = 1 px of a character drawn at 1x; a character is 104 tall).
 * y grows downward; the back wall with its windows is the top band.
 *
 *   ┌──────── LED wall ─────── Thần Tài ─────── SACO NHẬN ĐỊNH ────────┐
 *   │  lounge + pantry          red carpet       hall of fame           │
 *   │  (left)                       │            (right)                │
 *   └── reception ─────────────  door ──────────────────────────────────┘
 */
import type { InteractKind } from "../bridge.ts"
import type { Facing } from "../net/types.ts"

export const WORLD_W = 2048
export const WORLD_H = 1408
export const WALL_H = 224
export const SIDE = 24
export const NAV_CELL = 16
/** New arrivals stand in front of the shrine, facing Thần Tài, who greets them. */
export const SPAWN = { x: 1024, y: 540, facing: "n" as Facing }
/** Walking speed in world units per second. The walk plays at its native cadence regardless. */
export const WALK_SPEED = 115

/** Code-drawn stand-ins for props whose art is not in the manifest. */
export type Placeholder =
  | "plant"
  | "plant-small"
  | "offering"
  | "sofa"
  | "coffee-table"
  | "counter"
  | "reception"
  | "rug"
  | "podium"

export interface Interact {
  kind: InteractKind
  label: string
  data?: Record<string, unknown>
  /** Where the player stands to use it, and the way they face. */
  access: { x: number; y: number }
  face: Facing
}

export interface Placement {
  id: string
  /** Key in the art manifest. */
  art?: string
  placeholder?: Placeholder
  /** Bottom-centre of the object, where it meets the floor. */
  x: number
  y: number
  /** Size used for the placeholder and when the art is missing. */
  w: number
  h: number
  /** Blocked floor rectangle [width, depth] centred on x, ending at y. */
  foot?: [number, number]
  /** Drawn flat on the floor, under everything that stands. */
  flat?: boolean
  interact?: Interact
}

export const PLACEMENTS: Placement[] = [
  // Shrine
  {
    id: "thantai",
    art: "thantai",
    x: 1024,
    y: 372,
    w: 150,
    h: 202,
    foot: [160, 110],
    interact: {
      kind: "thantai",
      label: "Thần Tài",
      access: { x: 1024, y: 520 },
      face: "n",
    },
  },
  {
    id: "offering",
    art: "offering_table",
    placeholder: "offering",
    x: 1024,
    y: 456,
    w: 176,
    h: 64,
    foot: [180, 40],
    interact: {
      kind: "thantai",
      label: "Thần Tài",
      access: { x: 1024, y: 520 },
      face: "n",
    },
  },
  {
    id: "plant-shrine-l",
    art: "plant_tall",
    placeholder: "plant",
    x: 878,
    y: 360,
    w: 64,
    h: 130,
    foot: [44, 26],
  },
  {
    id: "plant-shrine-r",
    art: "plant_tall",
    placeholder: "plant",
    x: 1170,
    y: 360,
    w: 64,
    h: 130,
    foot: [44, 26],
  },

  // Hall of fame (right): rank 2, 1, 3 from left to right, on a rug of their own.
  {
    id: "rug-fame",
    placeholder: "rug",
    x: 1650,
    y: 1000,
    w: 600,
    h: 300,
    flat: true,
  },
  ...[
    [1440, 880, 2],
    [1650, 840, 1],
    [1860, 880, 3],
  ].map(([x, y, rank]): Placement => ({
    id: `statue-${rank}`,
    placeholder: "podium",
    x,
    y,
    w: 118,
    h: 48,
    foot: [124, 60],
    interact: {
      kind: "leaderboard",
      label: "Bảng vinh danh",
      data: { rank },
      access: { x, y: y + 64 },
      face: "n",
    },
  })),
  {
    id: "plant-fame-1",
    art: "plant_small",
    placeholder: "plant-small",
    x: 1400,
    y: 1350,
    w: 48,
    h: 64,
    foot: [36, 20],
  },
  {
    id: "plant-fame-2",
    art: "plant_small",
    placeholder: "plant-small",
    x: 1996,
    y: 1350,
    w: 48,
    h: 64,
    foot: [36, 20],
  },

  // Lounge (left)
  {
    id: "rug",
    art: "rug_round",
    placeholder: "rug",
    x: 398,
    y: 870,
    w: 420,
    h: 210,
    flat: true,
  },
  {
    id: "sofa",
    art: "sofa",
    placeholder: "sofa",
    x: 398,
    y: 750,
    w: 230,
    h: 96,
    foot: [230, 50],
  },
  {
    id: "coffee-table",
    art: "coffee_table",
    placeholder: "coffee-table",
    x: 398,
    y: 852,
    w: 124,
    h: 52,
    foot: [124, 30],
  },
  {
    id: "pantry",
    art: "pantry_counter",
    placeholder: "counter",
    x: 132,
    y: 580,
    w: 200,
    h: 112,
    foot: [204, 56],
  },
  {
    id: "plant-lounge-1",
    art: "plant_small",
    placeholder: "plant-small",
    x: 648,
    y: 970,
    w: 48,
    h: 64,
    foot: [36, 20],
  },
  {
    id: "plant-lounge-2",
    art: "plant_small",
    placeholder: "plant-small",
    x: 52,
    y: 970,
    w: 48,
    h: 64,
    foot: [36, 20],
  },

  // Reception at the door
  {
    id: "reception",
    art: "reception_desk",
    placeholder: "reception",
    x: 640,
    y: 1300,
    w: 254,
    h: 105,
    foot: [256, 48],
    interact: {
      kind: "reception",
      label: "Lễ tân · Hướng dẫn",
      access: { x: 640, y: 1352 },
      face: "n",
    },
  },

  // Corners
  {
    id: "plant-c1",
    art: "plant_tall",
    placeholder: "plant",
    x: 64,
    y: 320,
    w: 64,
    h: 130,
    foot: [44, 26],
  },
  {
    id: "plant-c2",
    art: "plant_tall",
    placeholder: "plant",
    x: 1984,
    y: 320,
    w: 64,
    h: 130,
    foot: [44, 26],
  },
  {
    id: "plant-c3",
    art: "plant_tall",
    placeholder: "plant",
    x: 64,
    y: 1350,
    w: 64,
    h: 130,
    foot: [44, 26],
  },
]

/** Wall boards; their content is drawn by the game from live data. */
export const BOARDS = {
  led: {
    x: 460,
    y: 114,
    w: 760,
    h: 200,
    interact: {
      kind: "market",
      label: "Bảng điện thị trường",
      access: { x: 460, y: 300 },
      face: "n",
    } as Interact,
  },
  saco: {
    x: 1560,
    y: 112,
    w: 470,
    h: 176,
    interact: {
      kind: "posts",
      label: "SACO NHẬN ĐỊNH",
      access: { x: 1560, y: 300 },
      face: "n",
    } as Interact,
  },
}

export const RECEPTIONIST = {
  art: "female02",
  name: "Lễ tân IQX",
  x: 640,
  y: 1248,
  facing: "s" as Facing,
}

/** Floor labels for the zones. */
export const ZONE_LABELS = [
  { text: "PHÒNG CHỜ", x: 398, y: 630 },
  { text: "VINH DANH TOP DỰ ĐOÁN", x: 1650, y: 590 },
]
