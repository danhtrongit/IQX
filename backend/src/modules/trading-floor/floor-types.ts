/**
 * Kiểu dùng chung của Khu giao dịch (hợp đồng: JSON camelCase, thời gian là epoch ms).
 * Phản chiếu `shared/protocol.ts` và `shared/chat.ts` của IQX-KhuGiaoDich, với id đổi sang uuid.
 */

export const FLOOR_FACINGS = ['s', 'se', 'e', 'ne', 'n', 'sw', 'w', 'nw'] as const;
export type FloorFacing = (typeof FLOOR_FACINGS)[number];

export const FLOOR_AVATARS = [
  'male01',
  'male02',
  'male03',
  'male04',
  'male05',
  'female01',
  'female02',
  'female03',
  'female04',
  'female05',
] as const;
export type FloorAvatarId = (typeof FLOOR_AVATARS)[number];

export const FLOOR_OUTFIT_COLORS = [
  'default',
  'navy',
  'charcoal',
  'burgundy',
  'forest',
  'cobalt',
  'beige',
  'plum',
  'gold',
  'teal',
] as const;
export type FloorOutfitColorId = (typeof FLOOR_OUTFIT_COLORS)[number];

export interface FloorProfile {
  name: string;
  avatar: FloorAvatarId;
  color: FloorOutfitColorId;
}

export interface FloorPeerState {
  x: number;
  y: number;
  facing: FloorFacing;
  moving: boolean;
}

/** `id` là mã kết nối, không bao giờ là id tài khoản. */
export interface FloorPeer extends FloorProfile, FloorPeerState {
  id: string;
}

// ---------- chat ----------

export type ChatSender = 'u' | 's' | 'x';

export interface ChatMessage {
  id: number;
  from: ChatSender;
  text: string;
  at: number;
}

export interface SacoSelf {
  id: string;
  name: string;
  icon: string;
  /** Tên hiển thị của trưởng nhóm. */
  team: string;
  active: boolean;
  onDuty: boolean;
  /** Vị trí trong hàng khớp (1..n) giữa các SACO còn hoạt động. */
  position: number | null;
}

export interface ConvSummary {
  id: string;
  side: 'user' | 'saco';
  peerName: string;
  peerIcon: string;
  matched: boolean;
  writable: boolean;
  online: boolean;
  last: ChatMessage | null;
  unread: number;
}

export interface ConvDetail extends ConvSummary {
  messages: ChatMessage[];
  peerReadAt: number;
}

export interface Inbox {
  saco: SacoSelf | null;
  asUser: ConvSummary[];
  asSaco: ConvSummary[];
  matchedConvId: string | null;
}

export type MatchEvent =
  | { state: 'asking'; turn: number; deadline: number }
  | { state: 'matched'; convId: string }
  | { state: 'none' }
  | { state: 'cancelled' };

export interface InviteEvent {
  id: number;
  userName: string;
  deadline: number;
}

export type InviteResult = 'accept' | 'decline' | 'timeout' | 'skip-off' | 'skip-busy' | 'cancel';

// ---------- nghi lễ ----------

export type RitualDirection = 'up' | 'down';

export interface RitualQue {
  id: number;
  name: string;
  luck: 1 | 2 | 3 | 4 | 5;
  verse: string;
  advice: string;
}

export interface TickerCount {
  symbol: string;
  count: number;
}

export interface RitualStats {
  session: string;
  total: number;
  up: number;
  down: number;
  avgLevel: number | null;
  topTickers: TickerCount[];
}

export interface MyRitual {
  session: string;
  queId: number;
  direction: RitualDirection | null;
  level: number | null;
  tickers: string[];
  createdAt: number;
  correct: boolean | null;
  error: number | null;
}

export interface RitualToday {
  session: string;
  cutoffAt: number;
  mine: MyRitual | null;
  stats: RitualStats;
  lastResult: {
    session: string;
    close: number;
    change: number;
    total: number;
    correct: number;
  } | null;
}

export interface LeaderRow {
  rank: number;
  id: string;
  name: string;
  avatar: FloorAvatarId;
  correct: number;
  total: number;
  avgError: number | null;
}

export interface Leaderboard {
  month: string;
  rows: LeaderRow[];
}

// ---------- quản trị SACO ----------

export interface ManageSaco {
  id: string;
  userId: string;
  name: string;
  email: string;
  icon: string;
  leadUserId: string;
  leadName: string;
  active: boolean;
  onDuty: boolean;
  online: boolean;
  position: number | null;
  convs: number;
  accepted: number;
  declined: number;
  timedOut: number;
  mine: boolean;
}

export interface ManageInvite {
  at: number;
  userName: string;
  sacoName: string;
  sacoIcon: string;
  result: InviteResult;
}

export interface ManageConv {
  id: string;
  userName: string;
  sacoName: string;
  sacoIcon: string;
  matched: boolean;
  last: ChatMessage | null;
}

export interface ManageConvDetail extends ManageConv {
  messages: ChatMessage[];
}
