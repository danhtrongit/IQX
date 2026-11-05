/**
 * Trạng thái dùng chung của Flashback v2 (spec v2 §1, §2, §4, §6).
 *
 * Luồng màn hình: Sảnh, Phòng chờ, Màn chơi, Cửa sổ kết quả. Vùng chính và panel phải (khung đặt
 * lệnh, cổ phiếu đang giữ, lệnh đã khớp) dùng chung một ván, nên trạng thái nằm ở đây.
 */
import { createContext, useContext } from "react"

import type {
  FlashbackBar,
  FlashbackChat,
  FlashbackChatMessage,
  FlashbackCreateRoomBody,
  FlashbackIndicatorMeta,
  FlashbackIndicatorParams,
  FlashbackMatchResult,
  FlashbackMe,
  FlashbackOrderSide,
  FlashbackPlayer,
  FlashbackRoom,
  FlashbackRoomFilter,
  FlashbackRoomListItem,
  FlashbackSnapshot,
} from "./flashback-api"
import type { IndicatorPlot } from "./flashback-indicators"
import type { ChatImagesApi } from "./use-chat-images"
import type { CallApi } from "./use-flashback-call"

/** Một instance chỉ báo trong ván: khoá ổn định phía client + id + tham số. */
export type LocalIndicator = {
  key: string
  id: string
  params: FlashbackIndicatorParams
}

/** Một chỉ báo đã chọn, đã tính sẵn để vẽ. */
export type ChartIndicator = {
  key: string
  id: string
  params?: FlashbackIndicatorParams
  label: string
  color: string
  hidden: boolean
  plot: IndicatorPlot
}

/** Một biểu cảm đang bay ở avatar của người gửi (v2.1 §6.4); `ageMs` là tuổi của nó lúc tới máy này. */
export type ReactionBubble = { key: string; userId: string; emoji: string; ageMs: number }

/** Màn đang mở. `boot` là lúc hỏi server xem mình có đang ở phòng nào không. */
export type FlashbackPhase = "boot" | "lobby" | "room" | "match"

/** Kết quả một lần vào phòng: vào được, cần mật khẩu, hay lỗi (server đã báo bằng toast). */
export type JoinOutcome =
  | { status: "joined" }
  | { status: "password"; wrong: boolean; message: string }
  | { status: "failed"; message: string }

export type LobbyApi = {
  filter: FlashbackRoomFilter
  setFilter: (filter: FlashbackRoomFilter) => void
  rooms: FlashbackRoomListItem[] | undefined
  loading: boolean
  failed: boolean
  /** Một lần vào phòng hoặc tạo phòng đang chạy. */
  busy: boolean
  joinById: (raw: string) => Promise<JoinOutcome | null>
  join: (code: string, password?: string) => Promise<JoinOutcome>
  randomJoin: () => void
  /** Trả về dòng lỗi một dòng của hộp tạo phòng, hoặc null khi tạo xong. */
  createRoom: (body: FlashbackCreateRoomBody) => Promise<string | null>
  /** Số xu đang có, nếu đã biết (để chặn cược vượt số xu ngay trong hộp). */
  balance: number | null
}

export type RoomApi = {
  room: FlashbackRoom | undefined
  loading: boolean
  failed: boolean
  copyId: () => void
  leave: () => void
  leaveBusy: boolean
  start: () => void
  startBusy: boolean
  /** Bấm "Sẵn sàng" (true) hoặc "Huỷ sẵn sàng" (false) của chính mình. */
  setReady: (ready: boolean) => void
  readyBusy: boolean
  /** Chủ phòng đuổi một thành viên khỏi phòng chờ (đã qua hộp xác nhận). */
  kick: (userId: string) => void
  kickBusy: boolean
}

/** Chat của phòng đang ở (v2.4 §3): dùng chung cho phòng chờ, trong ván và cửa sổ kết quả. */
export type ChatApi = {
  /** Chủ phòng bật chat khi tạo phòng; tắt thì không có khung chat và nút Chat ở mọi màn. */
  enabled: boolean
  /** Đúng những tin server đã giao cho mình, theo thứ tự hiện. */
  messages: FlashbackChatMessage[]
  muted: FlashbackChat["muted"]
  /** Số tin chưa đọc của người khác khi khung đang đóng. */
  unread: number
  /** Khung chat trong ván đang mở. */
  open: boolean
  setOpen: (open: boolean) => void
  /** Gửi một tin; true khi đã gửi (để xoá ô nhập). */
  send: (text: string) => Promise<boolean>
  sendBusy: boolean
  setMuted: (userId: string, name: string, muted: boolean) => void
  report: (messageId: string) => void
} & Omit<ChatImagesApi, "imageUnread">

export type MatchApi = {
  snapshot: FlashbackSnapshot
  me: FlashbackMe
  players: FlashbackPlayer[]
  /** "playing" cho tới khi mọi người hoàn thành hoặc hết giờ. */
  ended: boolean
  /** Nến đã hiện: các phiên xem + các phiên đã chơi. */
  bars: FlashbackBar[]
  /** Nến khởi tạo cho chỉ báo, không vẽ. */
  warmup: FlashbackBar[]
  viewBars: number
  playBars: number
  step: number
  cash: number
  totalAssets: number
  /** Tiền vốn đầu ván, để tính % lợi nhuận của mình (v2.4 §2). */
  initialCash: number
  /** Giá khớp: giá đóng cửa phiên đang hiện. */
  price: number
  /** Mình đã bấm Hoàn thành (hoặc đã bị kéo tới phiên cuối khi hết giờ). */
  finished: boolean
  playingCount: number
  /** Mốc đồng hồ: còn bao nhiêu ms vào lúc `receivedAt`; đồng hồ tự đếm tiếp từ đó. */
  clock: { remainingMs: number; receivedAt: number }
  expireClock: () => void
  /** Biểu cảm đang bay (của mình và của người khác); chỉ có trong lúc chơi. */
  bubbles: ReactionBubble[]
  /** Gửi biểu cảm được khi ván còn đang chơi (v2.1 §6.4). */
  canReact: boolean
  /** Gửi một biểu cảm tới cả phòng; quá 1 cái mỗi 1,5 giây thì báo "Từ từ thôi 😄" và không gửi. */
  sendReaction: (emoji: string) => void
  side: FlashbackOrderSide
  setSide: (side: FlashbackOrderSide) => void
  qty: string
  setQty: (value: string) => void
  /** Bộ đếm yêu cầu đưa con trỏ vào ô số cổ phiếu (phím tắt B/S, thanh Mua · Bán). */
  focusQtyTick: number
  requestQtyFocus: () => void
  orderError: string | null
  orderBusy: boolean
  submitOrder: () => void
  nextSession: () => void
  nextBusy: boolean
  finish: () => void
  finishBusy: boolean
  result: FlashbackMatchResult | undefined
  resultOpen: boolean
  setResultOpen: (open: boolean) => void
  playAgain: () => void
  playAgainBusy: boolean
  backToLobby: () => void
  backBusy: boolean
  indicatorMetas: readonly FlashbackIndicatorMeta[]
  indicatorsLoading: boolean
  indicators: ChartIndicator[]
  addIndicator: (id: string, params: FlashbackIndicatorParams) => void
  updateIndicator: (key: string, params: FlashbackIndicatorParams) => void
  removeIndicator: (key: string) => void
  toggleIndicator: (key: string) => void
}

export type FlashbackContextValue = {
  phase: FlashbackPhase
  /** Chỉ màn chơi có panel phải; sảnh và phòng chờ dùng hết bề rộng. */
  showPanel: boolean
  bootFailed: boolean
  retryBoot: () => void
  lobby: LobbyApi
  room: RoomApi
  chat: ChatApi
  /** Gọi nhóm WebRTC của phòng đang ở (v2.5): dùng chung cho phòng chờ và trong ván. */
  call: CallApi
  /** Ván đang mở: null khi chưa ở màn chơi hoặc ảnh chụp ván chưa về. */
  match: MatchApi | null
  matchLoading: boolean
  matchFailed: boolean
  retryMatch: () => void
}

export const FlashbackContext = createContext<FlashbackContextValue | null>(null)

/** Trạng thái chung của Flashback. */
export function useFlashback(): FlashbackContextValue {
  const value = useContext(FlashbackContext)
  if (!value) throw new Error("useFlashback phải nằm trong FlashbackProvider")
  return value
}
