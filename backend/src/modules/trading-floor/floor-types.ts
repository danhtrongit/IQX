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
  'danhtrongit',
] as const;
export type FloorAvatarId = (typeof FLOOR_AVATARS)[number];

/** Nhân vật riêng: chỉ tài khoản có username này được mặc (khách và bot không bao giờ). */
export const FLOOR_RESERVED_AVATARS: Partial<Record<FloorAvatarId, readonly string[]>> = {
  // Hai tài khoản của chủ sở hữu.
  danhtrongit: ['danhtrongit', 'danhtrong.it'],
};

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
