import type { Employee } from '../objects/Employee';

export interface Point {
  x: number;
  y: number;
}

export interface Cell {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  z?: number;
}

export type ActivityKind =
  | 'coffee' | 'water' | 'print' | 'board' | 'chat' | 'patrol' | 'meeting'
  | 'lunch' | 'pingpong' | 'foosball' | 'spectate' | 'phoneBooth' | 'deskPhone' | 'stretch'
  | 'restroom' | 'server' | 'consult' | 'wait'
  | 'sneakyGame' | 'scroll' | 'nap' | 'argue';

export type LineKind =
  | ActivityKind | 'work' | 'boss' | 'reply' | 'bull' | 'bear'
  | 'greet' | 'visitor' | 'arrive' | 'leave' | 'cheer' | 'stress'
  | 'fight' | 'fall' | 'caught' | 'breakup' | 'dance' | 'concern';

export interface Slot {
  cell: Cell;
  face: Point;
  pos?: Point;
}

export type Period = 'trading' | 'lunch' | 'after';

export type Role = 'staff' | 'boss' | 'reception' | 'it' | 'visitor';

export interface ActivitySpec {
  kind: ActivityKind;
  label: string;
  /** Selection weight for regular staff in each period. */
  weight: Record<Period, number>;
  /** Weight override for special roles (0 = never). */
  roles?: Partial<Record<Role, number>>;
  duration: [number, number];
  /** Two people take part (partner fills the second slot). */
  pair?: boolean;
  /** Performed at the employee's own desk without walking. */
  inPlace?: boolean;
}

export interface EmployeeProfile {
  name: string;
  /** Job title shown in the HUD. */
  title: string;
  shirt: number;
  pants: number;
  hair: number;
  skin: number;
  longHair: boolean;
  tie: number | null;
  isBoss: boolean;
  role: Role;
}

/** One board row from the IQX price board (prices in thousand VND, x1000 convention). */
export interface BoardQuote {
  symbol: string;
  ref: number | null;
  ceiling: number | null;
  floor: number | null;
  /** Last matched price, or null before the first match of the session. */
  price: number | null;
  change: number | null;
  pct: number | null;
  volume: number | null;
  bid: { price: number; volume: number }[];
  ask: { price: number; volume: number }[];
}

export interface IndexSnapshot {
  value: number;
  change: number;
  pct: number;
}

/** Everything the office shows about the market, as the IQX API reported it. */
export interface MarketSnapshot {
  index: IndexSnapshot | null;
  quotes: BoardQuote[];
  /** Today's VN-Index 5-minute closes (ascending). */
  intraday: number[];
  /** Previous session close of VN-Index. */
  intradayRef: number | null;
  /** Epoch ms of the newest data. */
  updatedAt: number | null;
}

/** CSS colours of the Vietnamese price semantics (`--price-*` tokens). */
export interface PricePalette {
  up: string;
  down: string;
  ref: string;
  ceiling: string;
  floor: string;
}

export interface SelectionInfo {
  name: string;
  role: string;
  status: string;
  color: number;
}

export interface DoorLike {
  open(): void;
  close(): void;
}

export interface OfficeWorld {
  findPath(from: Cell, to: Cell): Cell[] | null;
  reserveSlot(kind: ActivityKind): Slot | null;
  releaseSlot(slot: Slot): void;
  pickChatTarget(self: Employee): { slot: Slot; target: Employee } | null;
  pickPatrolSlot(): Slot;
  /** Reserves both slots of a two-player game and recruits a partner. */
  pickPair(kind: ActivityKind, self: Employee): { mine: Slot; theirs: Slot; partner: Employee } | null;
  /** Two aisle slots facing each other next to a colleague's desk (for arguments). */
  pickConfrontation(self: Employee): { mine: Slot; theirs: Slot; partner: Employee } | null;
  /** Distance in metres from the boss (Infinity if the boss is away). */
  bossDistance(e: Employee): number;
  /** Someone needs the boss to come over and calm things down. */
  callBoss(at: Slot): void;
  line(kind: LineKind): string;
  period(): Period;
  isLunch(): boolean;
  readonly elevator: DoorLike;
  readonly restroom: DoorLike;
}
