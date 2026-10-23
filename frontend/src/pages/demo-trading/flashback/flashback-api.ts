/**
 * Data layer của Flashback (spec Flashback v1.1 §2.3, §3.2).
 *
 * Mọi số liệu của đề do server quyết định: trình duyệt không bao giờ có tên mã, ngày thật
 * hay nến tương lai. Chỉ có nến lịch sử và nến đã chơi mới được trả về; nến kế tiếp chỉ tới
 * sau khi server đã ghi nhận lượt bấm "Phiên tiếp".
 *
 * Kiểu ở đây lấy từ contract đã sinh (`frontend/src/lib/generated/backend-v2.ts`) cho phần
 * contract mô tả chính xác; các phần server khai báo `looseObject` (lượt chơi, lệnh, dòng xếp
 * hạng, metadata chỉ báo) dùng kiểu cục bộ bám sát view của server
 * (`backend/src/modules/flashback/flashback.service.ts` và `flashback.indicators.ts`).
 */
import { requestOperation } from "@/lib/contract-client"
import type { ApiOperation, ApiResponseFor } from "@/lib/contract-types"

type CurrentResponse = ApiResponseFor<"GET /api/v2/flashback/current">
type OrderResponse = ApiResponseFor<"POST /api/v2/flashback/entries/{id}/orders">
type LeaderboardResponse = ApiResponseFor<"GET /api/v2/flashback/current/leaderboard">
type IndicatorsResponse = ApiResponseFor<"GET /api/v2/flashback/indicators">
type SaveIndicatorsResponse = ApiResponseFor<"PUT /api/v2/flashback/entries/{id}/indicators">

/** Một nến gửi cho trình duyệt: không có ngày thật, không có mã. */
export type FlashbackBar = CurrentResponse["bars"][number]

/** Một lô cổ phiếu đang giữ. */
export type FlashbackPosition = {
  qty: number
  price: string
  step: number
  sellable_step: number
  status: "settled" | "pending"
  sessions_left: number
  pnl_pct: number
  value: string
}

/** Một lệnh mua bán đã khớp. */
export type FlashbackOrder = {
  id: string
  side: "buy" | "sell"
  qty: number
  price: string
  step: number
  amount: string
  fee: string
  tax: string
  created_at: string
}

/** Lượt chơi của người dùng trong đề hiện tại. */
export type FlashbackEntry = {
  id: string
  step: number
  cash: string
  holdings: number
  total_assets: string
  pnl_pct: number | null
  pnl_percent: number | null
  max_drawdown: number | null
  max_drawdown_percent: number | null
  status: "playing" | "finished"
  joined_at: string
  finished_at: string | null
  final_nav: string | null
  rank: number | null
  reward_xu: number
  /** Đủ điều kiện nhận thưởng (đã xác thực số điện thoại, tài khoản tạo đủ 7 ngày). */
  reward_eligible: boolean
  indicator_params: FlashbackIndicatorInstance[]
  positions: FlashbackPosition[]
  orders: FlashbackOrder[]
}

/** Một chỉ báo đã chọn trong lượt chơi: id chỉ báo + bộ tham số đã chọn. */
export type FlashbackIndicatorInstance = {
  id: string
  params: FlashbackIndicatorParams
}

/** Giá trị một tham số: số đơn hoặc cặp ngưỡng dưới/trên. */
export type FlashbackIndicatorParamValue = number | { lower: number; upper: number }
export type FlashbackParamValue = FlashbackIndicatorParamValue
export type FlashbackIndicatorParams = Record<string, FlashbackIndicatorParamValue>

/** Một phía của ngưỡng (phía Mua của Bot là "dưới", phía Bán là "trên"). */
export type FlashbackParamSide = {
  min: number
  max: number
  default: number
  label: string
}

/** Metadata một tham số. */
export type FlashbackIndicatorParamMeta = {
  key: string
  label: string
  type: "integer" | "number"
  min: number
  max: number
  step: number
  unit: string
  default: number
  lower: FlashbackParamSide | null
  upper: FlashbackParamSide | null
}

/** Metadata một chỉ báo đã mở. */
export type FlashbackIndicatorMeta = {
  id: string
  name: string
  chapter: number
  lesson_id: string | null
  params: FlashbackIndicatorParamMeta[]
  cross_fields: { left: string; op: ">" | "<"; right: string }[]
  warmup_sessions: number
}

export type FlashbackRewardRow = {
  from_rank: number
  to_rank: number | null
  xu?: number
  reward_xu?: number
}

/** Đề đang mở. */
export type FlashbackCurrent = Omit<CurrentResponse, "my_entry" | "reward_table"> & {
  my_entry: FlashbackEntry | null
  reward_table: FlashbackRewardRow[]
}

export type FlashbackJoinResult = ApiResponseFor<"POST /api/v2/flashback/current/join">
export type FlashbackNextResult = ApiResponseFor<"POST /api/v2/flashback/entries/{id}/next">
export type FlashbackFinishResult = ApiResponseFor<"POST /api/v2/flashback/entries/{id}/finish">
export type FlashbackOrderResult = Omit<OrderResponse, "order"> & { order: FlashbackOrder }

/**
 * Một dòng bảng xếp hạng (spec 22-10 FB-10): chỉ hạng, tên đăng nhập, lãi lỗ và `is_me`. Riêng
 * dòng của mình có thêm phiên đang chơi và trạng thái.
 */
export type FlashbackLeaderboardRow = LeaderboardResponse["rows"][number]

export type FlashbackLeaderboard = LeaderboardResponse

export type FlashbackIndicatorList = Omit<IndicatorsResponse, "indicators"> & {
  indicators: FlashbackIndicatorMeta[]
}

export type FlashbackSaveIndicatorsResult = Omit<SaveIndicatorsResponse, "indicators"> & {
  indicators: FlashbackIndicatorInstance[]
}

export type FlashbackOrderSide = "buy" | "sell"
export type FlashbackLeaderboardScope = "all" | "team"
export type FlashbackOrderBody = { side: FlashbackOrderSide; qty: number; idempotency_key?: string }
export type FlashbackSaveIndicatorsBody = { indicators: FlashbackIndicatorInstance[] }

/** Các operation của Flashback trong contract; đổi route là biết ngay. */
const FLASHBACK_OPERATIONS = {
  current: "GET /api/v2/flashback/current",
  join: "POST /api/v2/flashback/current/join",
  next: "POST /api/v2/flashback/entries/{id}/next",
  orders: "POST /api/v2/flashback/entries/{id}/orders",
  finish: "POST /api/v2/flashback/entries/{id}/finish",
  leaderboard: "GET /api/v2/flashback/current/leaderboard",
  indicators: "GET /api/v2/flashback/indicators",
  saveIndicators: "PUT /api/v2/flashback/entries/{id}/indicators",
} as const satisfies Record<string, ApiOperation>

/**
 * Contract khai báo thân yêu cầu của Flashback là `never` (OpenAPI chưa mô tả body), nên thân
 * được gửi theo kiểu riêng của từng operation và kiểm tra ở server.
 */
function call<T>(key: ApiOperation, request: unknown, signal?: AbortSignal): Promise<T> {
  return requestOperation(key, request as never, signal ? { signal } : {}) as Promise<T>
}

export function fetchCurrent(signal?: AbortSignal): Promise<FlashbackCurrent> {
  return call<FlashbackCurrent>(FLASHBACK_OPERATIONS.current, {}, signal)
}

/** Khoá lưu mã thiết bị của trình duyệt (spec 22-10 FB-07). */
const DEVICE_ID_KEY = "iqx.flashback.device-id"
let memoryDeviceId: string | null = null

function randomDeviceId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
  }
}

/**
 * Mã thiết bị do trình duyệt sinh một lần và giữ trong localStorage, gửi kèm khi tham gia để
 * nhận diện nhiều tài khoản trên cùng một máy. Không đọc được localStorage thì dùng mã trong bộ
 * nhớ của tab.
 */
export function flashbackDeviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY)
    if (stored && /^[A-Za-z0-9_-]{8,64}$/.test(stored)) return stored
    const created = randomDeviceId()
    localStorage.setItem(DEVICE_ID_KEY, created)
    return created
  } catch {
    memoryDeviceId ??= randomDeviceId()
    return memoryDeviceId
  }
}

export function joinRound(signal?: AbortSignal): Promise<FlashbackJoinResult> {
  return call<FlashbackJoinResult>(
    FLASHBACK_OPERATIONS.join,
    { body: { device_id: flashbackDeviceId() } },
    signal,
  )
}

export function fetchNextBar(entryId: string, signal?: AbortSignal): Promise<FlashbackNextResult> {
  return call<FlashbackNextResult>(FLASHBACK_OPERATIONS.next, { path: { id: entryId } }, signal)
}

export function placeOrder(
  entryId: string,
  body: FlashbackOrderBody,
  signal?: AbortSignal,
): Promise<FlashbackOrderResult> {
  return call<FlashbackOrderResult>(FLASHBACK_OPERATIONS.orders, { path: { id: entryId }, body }, signal)
}

export function finishRound(entryId: string, signal?: AbortSignal): Promise<FlashbackFinishResult> {
  return call<FlashbackFinishResult>(FLASHBACK_OPERATIONS.finish, { path: { id: entryId } }, signal)
}

export function fetchLeaderboard(scope: FlashbackLeaderboardScope, signal?: AbortSignal): Promise<FlashbackLeaderboard> {
  return call<FlashbackLeaderboard>(FLASHBACK_OPERATIONS.leaderboard, { query: { scope } }, signal)
}

export function fetchIndicators(signal?: AbortSignal): Promise<FlashbackIndicatorList> {
  return call<FlashbackIndicatorList>(FLASHBACK_OPERATIONS.indicators, {}, signal)
}

export function saveIndicators(
  entryId: string,
  indicators: FlashbackIndicatorInstance[],
  signal?: AbortSignal,
): Promise<FlashbackSaveIndicatorsResult> {
  return call<FlashbackSaveIndicatorsResult>(
    FLASHBACK_OPERATIONS.saveIndicators,
    { path: { id: entryId }, body: { indicators } },
    signal,
  )
}
