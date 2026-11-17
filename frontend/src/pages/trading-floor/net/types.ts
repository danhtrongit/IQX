/**
 * Shapes shared by the REST client, the socket and the UI of the trading floor. They mirror
 * `backend/src/modules/trading-floor` (camelCase JSON, times in epoch milliseconds).
 */
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
  { id: "danhtrongit", gender: "male", label: "Nam · IT ngầu ngầu" },
] as const
export type AvatarGender = (typeof AVATARS)[number]["gender"]
export type AvatarId = (typeof AVATARS)[number]["id"]

/** Owner-only avatars: the account username allowed to wear each (the server enforces the same rule). */
export const RESERVED_AVATARS: Partial<Record<AvatarId, readonly string[]>> = {
  // Both accounts of the owner.
  danhtrongit: ["danhtrongit", "danhtrong.it"],
}

/** Tag shown before the name of whoever wears the avatar. */
export const AVATAR_BADGES: Partial<Record<AvatarId, string>> = {
  danhtrongit: "IT",
}

export function avatarAllowedFor(
  id: AvatarId,
  username: string | null | undefined
): boolean {
  const owners = RESERVED_AVATARS[id]
  return !owners || owners.includes((username ?? "").toLowerCase())
}

/** Public floor chat is off for everyone but these usernames (mirror of the server's FLOOR_PUBLIC_CHAT_USERS). */
export const PUBLIC_CHAT_USERS: readonly string[] = ["danhtrong.it"]

export function publicChatAllowedFor(
  username: string | null | undefined
): boolean {
  return PUBLIC_CHAT_USERS.includes((username ?? "").toLowerCase())
}

export function avatarBadge(id: string): string | undefined {
  return AVATAR_BADGES[id as AvatarId]
}

/** A pill drawn before the name over a character's head. */
export interface NameBadge {
  text: string
  tone: "owner" | "saco"
}

/** Badges of a character: the owner-avatar tag first, then SACO for an account holding the SACO right. */
export function nameBadges(
  avatar: string,
  saco: boolean | undefined
): NameBadge[] {
  const badges: NameBadge[] = []
  const owner = avatarBadge(avatar)
  if (owner) badges.push({ text: owner, tone: "owner" })
  if (saco) badges.push({ text: "SACO", tone: "saco" })
  return badges
}

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
  /** The account holds an active SACO right: a SACO badge sits before the name. Absent otherwise. */
  saco?: boolean
  /** That SACO's id (what `POST chat/open` takes): tapping the figure opens the chat with them. */
  sacoId?: string
}

export interface MeResponse {
  profile: Profile | null
  /** Prefill for the join card (empty for a guest). */
  suggestedName: string
  saco: SacoSelf | null
  /** The visitor is not signed in: a guest character with no SACO rights. */
  guest: boolean
}

/** `POST /trading-floor/guest`: the token is kept in the browser and shown to the server once only. */
export interface GuestCreated {
  token: string
  guestId: string
  profile: Profile
}

// ---------- Thần Tài (CONTRACT: backend/docs/than-tai/CONTRACT.md) ----------

export type Hang =
  "dai_cat" | "thuong_cat" | "trung_cat" | "tieu_cat" | "than_trong"
export type Hanh = "kim" | "moc" | "thuy" | "hoa" | "tho"
export type Direction = "up" | "flat" | "down"
export type ThanTaiStatus = "chua_khan" | "dang_do" | "da_xong" | "het_gio"
export type ThanTaiStep = 1 | 2 | 3 | 4

export interface HanhMau {
  ten: string
  hex: string
}

export interface HanhGroup {
  hanh: Hanh
  label: string
  /** At most 4 industries, names only. */
  nganh: string[]
}

export interface ThanTaiDay {
  /** `YYYY-MM-DD`, Vietnam calendar day. */
  date: string
  canChi: string
  napAm: string
  hanh: Hanh
  hanhLabel: string
  hop: HanhGroup[]
  kieng: HanhGroup[]
  mau: HanhMau[]
  huong: string
}

export interface TrigramView {
  key: string
  ten: string
  symbol: string
}

export interface ThanTaiLa {
  id: number
  hang: Hang
  hangLabel: string
  que: {
    id: number
    ten: string
    chuHan: string
    /** 6 chars `0`/`1`, bottom line first. */
    hao: string
    tren: TrigramView
    duoi: TrigramView
    tuong: string
    thoan: string
    thoanNghia: string
  }
  haoDong: { so: number; ten: string; van: string; nghia: string }
  luan: string
  chot: string
}

export interface ThanTaiToday {
  status: ThanTaiStatus
  /** Next step to do: 1 draw, 2 predict, 3 cầu mã, 4 finished. */
  step: ThanTaiStep
  /** Server clock when the answer was made, epoch ms. */
  serverTime: number
  /** 11:30 Vietnam time today, epoch ms. */
  deadline: number
  day: ThanTaiDay
  /** VNINDEX reference (previous close) of the session. */
  vnindexRef: number | null
  la: ThanTaiLa | null
  prediction: Direction | null
  /** null = not yet, [] = skipped. */
  tickers: string[] | null
}

export interface ThanTaiResults {
  total: number
  up: number
  flat: number
  down: number
  top5: { ticker: string; count: number }[]
  asOf: number
}

/** One line of the monthly hall of fame. */
export interface LeaderRow {
  rank: number
  name: string
  avatar: string
  color: string
  correct: number
  total: number
}

/** `GET /than-tai/leaderboard`: top 10 of the month by correct VNINDEX calls, and the caller's own line. */
export interface ThanTaiLeaderboard {
  /** `YYYY-MM`. */
  month: string
  /** Trading days of the month that already have a settled close. */
  scoredDays: number
  rows: LeaderRow[]
  /** The caller's line with the real rank; null for guests and for people with nothing scored. */
  me: LeaderRow | null
  asOf: number
}

/** Admin library: one quẻ (trigram keys `can|khon|chan|kham|can_son|ton|ly|doai`). */
export interface AdminQue {
  id: number
  ten: string
  chuHan: string
  hao: string
  queTren: string
  queDuoi: string
  tuong: string
  thoan: string
  thoanNghia: string
  updatedAt: number
}

/** Admin library: one lá (quẻ + hào động), flat with its quẻ's text. */
export interface AdminLa {
  id: number
  queId: number
  queTen: string
  chuHan: string
  hao: string
  queTren: string
  queDuoi: string
  tuong: string
  thoan: string
  thoanNghia: string
  haoDong: number
  tenHao: string
  haoVan: string
  haoNghia: string
  hang: Hang
  luan: string
  chot: string
  active: boolean
  updatedAt: number
}

export interface HanhConfig {
  hanh: Hanh
  nganh: string[]
  mau: HanhMau[]
  huong: string
  updatedAt?: number
}

export type AdminLaPatch = Partial<
  Pick<
    AdminLa,
    "tenHao" | "haoVan" | "haoNghia" | "hang" | "luan" | "chot" | "active"
  >
>
export interface AdminQuePatch {
  ten?: string
  chuHan?: string
  tuong?: string
  thoan?: string
  thoanNghia?: string
}
export type HanhConfigPatch = Partial<
  Pick<HanhConfig, "nganh" | "mau" | "huong">
>

// ---------- chat ----------

/** Who wrote a message: the user, the SACO, or the system (match notice, SACO removed). */
export type Sender = "u" | "s" | "x"

/** An image in a message, at its size after the server re-encoded it. */
export interface ChatImage {
  id: string
  w: number
  h: number
}

export interface ChatMessage {
  id: number
  from: Sender
  /** Empty for an image message and for a recalled one (the staff history keeps the original text). */
  text: string
  at: number
  image?: ChatImage
  /** The sender recalled it: no text, no image (see `chat-preview.ts`). */
  recalled?: true
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
  /** First message the visitor already sent (up to 120 characters); absent for an old-style search. */
  preview?: string
}

/** `auto`: nobody accepted, the conversation went to a SACO by ranking. */
export type InviteResult =
  | "accept"
  | "decline"
  | "timeout"
  | "skip-off"
  | "skip-busy"
  | "cancel"
  | "auto"

/** Answer of `POST chat/start`: sent into the matched conversation, or queued while a SACO is found. */
export type StartResult =
  { convId: string; message: ChatMessage } | { pending: true }

// ---------- SACO nhận định (posts) ----------

export interface PostCard {
  id: string
  sacoId: string
  sacoName: string
  headline: string
  publishedAt: number
  /** Lần sửa gần nhất của tác giả sau khi đăng; null nếu chưa sửa. */
  editedAt: number | null
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

/** `hidden`: quản trị ẩn; `withdrawn`: tác giả tự thu hồi (đăng lại được). */
export type PostStatus = "draft" | "published" | "hidden" | "withdrawn"

export interface MyPost {
  id: string
  headline: string
  status: PostStatus
  savedAt: number
  publishedAt: number | null
  editedAt: number | null
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
  | { type: "fx"; kind: "xaxui" }
  | { type: "fx"; kind: "gay"; text: string }
  | { type: "rain:give"; amount: number; coins?: { x: number; y: number }[] }
  | { type: "rain:grab"; rainId: string; coin: number }

/** Messages the server sends. */
export type ServerMessage =
  | { type: "ready"; userId: string; guest?: boolean }
  | { type: "error"; code: string; message?: string }
  | { type: "pong" }
  | { type: "welcome"; self: Peer; peers: Peer[]; rains?: Rain[] }
  /** The hall is full: waiting in line, `position` 1 is next. */
  | { type: "queue"; position: number; total: number; capacity: number }
  | { type: "peer:join"; peer: Peer }
  | ({ type: "peer:state"; id: string } & PeerState)
  | { type: "peer:leave"; id: string }
  | { type: "peer:emote"; id: string; text: string }
  | { type: "peer:update"; peer: Peer }
  | { type: "chat:msg"; convId: string; message: ChatMessage }
  | { type: "chat:read"; convId: string; side: "user" | "saco"; at: number }
  | { type: "chat:recall"; convId: string; messageId: number }
  | { type: "chat:typing"; convId: string; side: "user" | "saco" }
  | { type: "chat:inbox" }
  | { type: "chat:match"; event: MatchEvent }
  | { type: "chat:invite"; invite: InviteEvent }
  | { type: "chat:invite:end"; id: number }
  | { type: "post:new"; post: PostCard }
  /** The author edited a published post: same card shape as `post:new`. */
  | { type: "post:updated"; post: PostCard }
  | { type: "post:hidden"; id: string }
  | { type: "post:heart"; id: string; hearts: number }
  | { type: "post:comment"; postId: string; comments: number }
  | {
      type: "peer:fx"
      id: string
      kind: "xaxui" | "gay"
      name?: string
      text?: string
    }
  | { type: "rain:start"; rain: Rain }
  | { type: "rain:given"; rainId: string; amount: number; balance: number }
  | {
      type: "rain:taken"
      rainId: string
      coin: number
      by: string
      name: string
    }
  | {
      type: "rain:caught"
      rainId: string
      coin: number
      value: number
      balance: number
    }
  | { type: "rain:end"; rainId: string }
  | { type: "rain:refund"; rainId: string; amount: number; balance: number }

export const RAIN_COIN_VALUE = 10
export const RAIN_MIN = 50
export const RAIN_MAX = 1000
export const FX_XAXUI_COOLDOWN_MS = 8000
export const FX_GAY_COOLDOWN_MS = 20000
export const FX_GAY_TEXT_MAX = 80

export interface Rain {
  id: string
  by: string | null
  giverName: string | null
  value: number
  endsAt: number
  coins: { i: number; x: number; y: number }[]
}

export type ServerMessageType = ServerMessage["type"]
export type ServerMessageOf<T extends ServerMessageType> = Extract<
  ServerMessage,
  { type: T }
>
