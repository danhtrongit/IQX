/**
 * Shapes shared by the REST client, the socket and the UI of the trading floor. They mirror
 * `backend/src/modules/trading-floor` (camelCase JSON, times in epoch milliseconds).
 */
import type { Direction } from "../ritual.ts"

export type Facing = "s" | "se" | "e" | "ne" | "n" | "sw" | "w" | "nw"

/** Avatars a visitor can pick, each with baked art in `public/trading-floor/assets/characters`. */
export const AVATARS = [
  { id: "male01", gender: "male", label: "Nam · Vest xám hiện đại" },
  { id: "male02", gender: "male", label: "Nam · Sơ mi xanh lịch lãm" },
  { id: "male03", gender: "male", label: "Nam · Áo polo năng động" },
  { id: "male04", gender: "male", label: "Nam · Blazer xanh navy" },
  { id: "male05", gender: "male", label: "Nam · Chuyên gia SACO" },
  { id: "female01", gender: "female", label: "Nữ · Vest công sở thanh lịch" },
  { id: "female02", gender: "female", label: "Nữ · Sơ mi chân váy" },
  { id: "female03", gender: "female", label: "Nữ · Đầm tài chính hiện đại" },
  { id: "female04", gender: "female", label: "Nữ · Blazer trắng kem" },
  { id: "female05", gender: "female", label: "Nữ · Chuyên gia tư vấn" },
] as const
export type AvatarGender = (typeof AVATARS)[number]["gender"]
export type AvatarId = (typeof AVATARS)[number]["id"]

export function normalizeAvatarId(raw: unknown): AvatarId | null {
  if (typeof raw !== "string") return null
  return AVATARS.some((a) => a.id === raw) ? (raw as AvatarId) : null
}

export const OUTFIT_COLORS = [
  { id: "default", label: "Mặc định", hex: null },
  { id: "navy", label: "Xanh navy", hex: "#23395d" },
  { id: "charcoal", label: "Than chì", hex: "#2f3542" },
  { id: "burgundy", label: "Đỏ rượu", hex: "#7c1f2c" },
  { id: "forest", label: "Xanh rêu", hex: "#234f3e" },
  { id: "cobalt", label: "Xanh lam", hex: "#2458b8" },
  { id: "beige", label: "Kem cát", hex: "#c8b294" },
  { id: "plum", label: "Tím trầm", hex: "#58346e" },
  { id: "gold", label: "Vàng IQX", hex: "#c69328" },
  { id: "teal", label: "Xanh ngọc", hex: "#1d6b73" },
] as const
export type OutfitColorId = (typeof OUTFIT_COLORS)[number]["id"]

export function cleanOutfitColor(raw: unknown): OutfitColorId {
  if (typeof raw === "string" && OUTFIT_COLORS.some((c) => c.id === raw))
    return raw as OutfitColorId
  return "default"
}

export interface Profile {
  name: string
  avatar: AvatarId
  color: OutfitColorId
}

export interface PeerState {
  x: number
  y: number
  facing: Facing
  moving: boolean
}

/** `id` is the connection id, never the account id. */
export interface Peer extends Profile, PeerState {
  id: string
}

export interface MeResponse {
  profile: Profile | null
  /** Prefill for the join card. */
  suggestedName: string
  saco: SacoSelf | null
}

// ---------- ritual ----------

export interface TickerCount {
  symbol: string
  count: number
}

export interface RitualStats {
  session: string
  total: number
  up: number
  down: number
  /** Mean predicted close, null with no ritual. */
  avgLevel: number | null
  topTickers: TickerCount[]
}

export interface MyRitual {
  session: string
  queId: number
  direction: Direction | null
  level: number | null
  tickers: string[]
  createdAt: number
  /** Set once the session is scored. */
  correct: boolean | null
  error: number | null
}

export interface RitualToday {
  session: string
  /** Epoch ms after which this session takes no more predictions. */
  cutoffAt: number
  /** A drawn quẻ without a finished prediction is a ritual with `direction` null. */
  mine: MyRitual | null
  stats: RitualStats
  /** Last scored session, so people can see how the crowd did. */
  lastResult: {
    session: string
    close: number
    change: number
    total: number
    correct: number
  } | null
}

export interface LeaderRow {
  rank: number
  id: string
  name: string
  avatar: AvatarId
  correct: number
  total: number
  /** Mean absolute error of the predicted close on correct calls. */
  avgError: number | null
}

export interface Leaderboard {
  month: string
  rows: LeaderRow[]
}

// ---------- chat ----------

/** Who wrote a message: the user, the SACO, or the system (match notice, SACO removed). */
export type Sender = "u" | "s" | "x"

export interface ChatMessage {
  id: number
  from: Sender
  text: string
  at: number
}

/** The SACO behind this account. `active` false: rights removed, old chats read-only. */
export interface SacoSelf {
  id: string
  name: string
  icon: string
  /** Display name of the team lead. */
  team: string
  active: boolean
  onDuty: boolean
  /** Place in the Chat SACO order among active SACOs, 1-based. */
  position: number | null
}

export interface ConvSummary {
  id: string
  /** Which side this account is on. */
  side: "user" | "saco"
  peerName: string
  /** Emoji for a SACO peer, empty for a user peer. */
  peerIcon: string
  /** Matched through Chat SACO, as opposed to a direct message. */
  matched: boolean
  /** False once the SACO lost its rights: the chat is read-only. */
  writable: boolean
  /** SACO peer: on duty and connected. User peer: connected. */
  online: boolean
  last: ChatMessage | null
  unread: number
}

export interface ConvDetail extends ConvSummary {
  messages: ChatMessage[]
  /** The other side read everything up to here (epoch ms, 0 = nothing). */
  peerReadAt: number
}

export interface Inbox {
  saco: SacoSelf | null
  /** Conversations this account started with SACOs. */
  asUser: ConvSummary[]
  /** Conversations users started with this SACO (empty unless an active SACO). */
  asSaco: ConvSummary[]
  /** The conversation from the last Chat SACO match, while that SACO is active. */
  matchedConvId: string | null
}

export type MatchEvent =
  | { state: "asking"; turn: number; deadline: number }
  | { state: "matched"; convId: string }
  | { state: "none" }
  | { state: "cancelled" }

export interface InviteEvent {
  id: number
  userName: string
  deadline: number
}

export type InviteResult =
  "accept" | "decline" | "timeout" | "skip-off" | "skip-busy" | "cancel"

// ---------- SACO nhận định (posts) ----------

export interface PostCard {
  id: string
  sacoId: string
  sacoName: string
  headline: string
  publishedAt: number
  hearts: number
  comments: number
  hearted: boolean
}

export interface PostDetail extends PostCard {
  bodyHtml: string
  sacoOnDuty: boolean
  sacoActive: boolean
  /** The viewer may hide comments: author SACO, admin, the SACO's team lead. */
  canModerate: boolean
  isAuthor: boolean
}

export interface PostComment {
  id: string
  postId: string
  authorName: string
  isAuthor: boolean
  mine: boolean
  text: string
  at: number
  /** Reported by the viewer. */
  reported: boolean
}

export type PostStatus = "draft" | "published" | "hidden"

export interface MyPost {
  id: string
  headline: string
  status: PostStatus
  savedAt: number
  publishedAt: number | null
  hearts: number
  comments: number
  newComments: number
}

export interface MyPostDetail extends MyPost {
  bodyHtml: string
  revision: number
}

// ---------- WebSocket protocol (`/api/v2/trading-floor/ws`) ----------

/** Messages the client sends after `auth`. */
export type ClientMessage =
  | { type: "hello"; x: number; y: number; facing: Facing; moving: boolean }
  | { type: "state"; x: number; y: number; facing: Facing; moving: boolean }
  | { type: "emote"; text: string }
  | { type: "chat:typing"; convId: string }
  | { type: "ping" }

/** Messages the server sends. */
export type ServerMessage =
  | { type: "ready"; userId: string }
  | { type: "error"; code: string; message?: string }
  | { type: "pong" }
  | { type: "welcome"; self: Peer; peers: Peer[] }
  /** The hall is full: waiting in line, `position` 1 is next. */
  | { type: "queue"; position: number; total: number; capacity: number }
  | { type: "peer:join"; peer: Peer }
  | ({ type: "peer:state"; id: string } & PeerState)
  | { type: "peer:leave"; id: string }
  | { type: "peer:emote"; id: string; text: string }
  | { type: "peer:update"; peer: Peer }
  | {
      type: "ritual:done"
      name: string
      que: string
      luck: number
      direction: Direction
    }
  | { type: "leaderboard:changed" }
  | { type: "chat:msg"; convId: string; message: ChatMessage }
  | { type: "chat:read"; convId: string; side: "user" | "saco"; at: number }
  | { type: "chat:typing"; convId: string; side: "user" | "saco" }
  | { type: "chat:inbox" }
  | { type: "chat:match"; event: MatchEvent }
  | { type: "chat:invite"; invite: InviteEvent }
  | { type: "chat:invite:end"; id: number }
  | { type: "post:new"; post: PostCard }
  | { type: "post:hidden"; id: string }
  | { type: "post:heart"; id: string; hearts: number }
  | { type: "post:comment"; postId: string; comments: number }

export type ServerMessageType = ServerMessage["type"]
export type ServerMessageOf<T extends ServerMessageType> = Extract<
  ServerMessage,
  { type: T }
>
