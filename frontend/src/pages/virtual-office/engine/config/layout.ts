import type { Cell, Point, Slot } from '../types';

/**
 * Office floor plan (1 cell = 1 m). Grid x → world X, grid y → world Z.
 * Solid walls run along x = 0 (left, with windows) and z = 0 (back). The front/right edges are open (dollhouse view).
 *
 *  x:  0 ........ 14 15 16 ...... 21 22 23 ...... 29
 *  z0  TRADING FLOOR  |  BOSS OFFICE  |  VIP CONSULTATION   (z 0..5)
 *      (desks)        |  (z 0..7)     |  ---- glass z=6 ---
 *                     |  -- glass --  |  quiet nook | SERVER (x27..29, z7..10)
 *                     |  MEETING ROOM |  ---- glass z=11 (x26..29) ---
 *      mini pantry    |  (z 9..15)    |  CAFETERIA (z 12..20)
 *  z16 ==== partition (reception wall x0..8, glass x9..21), openings at x = 1, 13, 14 ====
 *  z17 LOBBY (x0..8)  | LOUNGE (x9..15) | PHONE BOOTHS (x16..21) | corridor x22
 *  z20 elevator + WC on left wall
 */

/** Trading desks (top-left corner, 2x1 cells). Owner sits at (x+1, y+1.45) facing -y. */
export const DESK_ROWS = [3, 6, 9, 12];
export const DESK_COLS = [3, 5, 7, 9, 11];

export const BOSS_DESK: Point = { x: 18, y: 2 };
export const MEETING_TABLE: Point = { x: 17, y: 10 };

/** Glass partitions inherited from the original layout. */
export const GLASS_X = 15;
export const GLASS_X_DOORS = [5, 12];
export const GLASS_Y = 8;

/** Partition between the main floor and the front strip (row y = 16, x 0..21). */
export const FRONT_WALL_Y = 16;
export const FRONT_WALL_OPENINGS = [1, 13, 14];
/** Solid reception backdrop occupies x 0..8 of that row; the rest is glass. */
export const RECEPTION_WALL_X1 = 8;

/** Partition between boss/meeting rooms and the right wing (column x = 22, y 0..16, no doors). */
export const RIGHT_WALL_X = 22;

/** Aisles used for boss patrols and the cleaning robot. */
export const AISLE_ROWS = [2, 5, 8, 11, 14, 17, 20];

// ---------------------------------------------------------------- lobby (x 0..8, y 17..20)

/** Elevator door on the left wall (x = 0) spanning y 17.4..18.6; people appear/disappear in cell ELEVATOR. */
export const ELEVATOR: Slot = { cell: { x: 0, y: 18 }, face: { x: -1, y: 0 } };
export const ELEVATOR_DOOR = { y0: 17.4, y1: 18.6 };
/** Restroom door on the left wall spanning y 19.6..20.6. */
export const RESTROOM_DOOR = { y0: 19.6, y1: 20.6 };

/** Reception counter cells (4..6, 18); receptionist sits behind it facing +y. */
export const RECEPTION_DESK = { x: 4, y: 18, w: 3 };
export const RECEPTIONIST_SEAT: Point = { x: 5.5, y: 17.5 };
export const RECEPTIONIST_CELL: Cell = { x: 5, y: 17 };
export const CHECK_IN: Slot = { cell: { x: 5, y: 19 }, face: { x: 0, y: -1 } };
/** Waiting armchairs (occupant faces -y); a small coffee table blocks (2,19) and (3,19). */
export const WAITING_SEATS: Slot[] = [
  { cell: { x: 2, y: 20 }, face: { x: 0, y: -1 } },
  { cell: { x: 3, y: 20 }, face: { x: 0, y: -1 } },
];
export const LOBBY_TABLE_CELLS: Cell[] = [{ x: 2, y: 19 }, { x: 3, y: 19 }];

// ---------------------------------------------------------------- lounge (x 9..15, y 17..20)

/** Ping-pong table cells x 10..12, y 18..19 (net runs along y at x = 11.5). */
export const PINGPONG_TABLE = { x: 10, y: 18, w: 3, d: 2 };
/** Foosball table in cell (15,18), rods run along x; players stand on the y sides. */
export const FOOSBALL_CELL: Cell = { x: 15, y: 18 };
/** Vending machines against the partition, cells (9,17) and (10,17), facing +y. */
export const VENDING_CELLS: Cell[] = [{ x: 9, y: 17 }, { x: 10, y: 17 }];

// ---------------------------------------------------------------- phone booths (x 16..21, y 17..20)

/** Phone pods: interior cells are walkable, door on the +y side. Cells (16,17), (18,17), (20,17) are blocked (pod walls / planters). */
export const PHONE_PODS: Cell[] = [{ x: 17, y: 17 }, { x: 19, y: 17 }];
export const POD_BLOCKED: Cell[] = [{ x: 16, y: 17 }, { x: 18, y: 17 }, { x: 20, y: 17 }];

// ---------------------------------------------------------------- right wing (x 23..29)

/** VIP consultation room y 0..5; glass row at y = 6 (x 23..29) with a door at x = 26. */
export const VIP_GLASS_Y = 6;
export const VIP_DOOR_X = 26;
/** Consultation tables (1 cell, round). Broker sits north (y-1) facing +y; client sits south (y+1) facing -y. */
export const CONSULT_TABLES: Cell[] = [{ x: 24, y: 3 }, { x: 28, y: 3 }];
/** VIP sofa against the back wall, cells (25..27, 0). */
export const VIP_SOFA = { x: 25, y: 0, w: 3 };

/** Server room x 27..29, y 7..10: glass column x = 26 (y 7..10, door at y = 8) and glass row y = 11 (x 26..29). */
export const SERVER_GLASS_X = 26;
export const SERVER_DOOR_Y = 8;
export const SERVER_GLASS_Y = 11;
/** Rack row cells (27..29, 7) facing +y. */
export const SERVER_RACKS: Cell[] = [{ x: 27, y: 7 }, { x: 28, y: 7 }, { x: 29, y: 7 }];

/** Cafeteria y 12..20, x 23..29: food counter cells (24..28, 12) facing +y; four 1-cell tables with 4 seats each. */
export const FOOD_COUNTER = { x: 24, y: 12, w: 5 };
export const FOOD_PICKUP: Slot = { cell: { x: 26, y: 13 }, face: { x: 0, y: -1 } };
export const CAFE_TABLES: Cell[] = [{ x: 24, y: 15 }, { x: 27, y: 15 }, { x: 24, y: 18 }, { x: 27, y: 18 }];

/** Robot vacuum dock (decor) in the lobby. */
export const ROBOT_DOCK: Cell = { x: 7, y: 20 };

// ---------------------------------------------------------------- activity slots

const s = (x: number, y: number, fx: number, fy: number): Slot => ({ cell: { x, y }, face: { x: fx, y: fy } });

const cafeSeats: Slot[] = CAFE_TABLES.flatMap(({ x, y }) => [
  s(x, y - 1, 0, 1), s(x, y + 1, 0, -1), s(x - 1, y, 1, 0), s(x + 1, y, -1, 0),
]);

/** Seats (occupant faces `face`) that need a chair drawn under them. */
export const CHAIR_SLOTS: Slot[] = [
  ...cafeSeats,
  ...CONSULT_TABLES.flatMap(({ x, y }) => [s(x, y - 1, 0, 1), s(x, y + 1, 0, -1)]),
];

/** Reservable slots per activity (chat / patrol / deskPhone / stretch are generated on the fly). */
export const SLOTS: Record<
  Exclude<ActivityKindWithSlots, never>,
  Slot[]
> = {
  coffee: [s(1, 11, -1, 0), s(1, 12, -1, 0), s(1, 13, -1, 0)],
  water: [s(1, 8, -1, 0)],
  print: [s(13, 1, 0, -1)],
  board: [4, 5, 6, 7, 8, 9, 10, 11].map((x) => s(x, 1, 0, -1)),
  meeting: [
    s(16, 10, 1, 0), s(16, 11, 1, 0),
    s(20, 10, -1, 0), s(20, 11, -1, 0),
    s(17, 12, 0, -1), s(18, 12, 0, -1), s(19, 12, 0, -1),
    s(17, 9, 0, 1), s(18, 9, 0, 1), s(19, 9, 0, 1),
  ],
  lunch: cafeSeats,
  pingpong: [s(9, 18, 1, 0), s(13, 19, -1, 0)],
  foosball: [s(15, 17, 0, 1), s(15, 19, 0, -1)],
  spectate: [s(10, 20, 0, -1), s(11, 20, 0, -1), s(12, 20, 0, -1)],
  phoneBooth: PHONE_PODS.map((c) => s(c.x, c.y, 0, 1)),
  restroom: [s(0, 20, -1, 0)],
  server: [s(28, 8, 0, -1), s(27, 8, 0, -1)],
  consult: CONSULT_TABLES.map(({ x, y }) => s(x, y - 1, 0, 1)),
  wait: WAITING_SEATS,
};

type ActivityKindWithSlots =
  | 'coffee' | 'water' | 'print' | 'board' | 'meeting' | 'lunch' | 'pingpong' | 'foosball'
  | 'spectate' | 'phoneBooth' | 'restroom' | 'server' | 'consult' | 'wait';

/** Client seat matching each consult slot (same index). */
export const CONSULT_CLIENT_SEATS: Slot[] = CONSULT_TABLES.map(({ x, y }) => s(x, y + 1, 0, -1));
