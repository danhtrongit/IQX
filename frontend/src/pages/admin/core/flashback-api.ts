/**
 * Lớp dữ liệu của màn quản trị Flashback (spec v1.2 §7).
 *
 * Màn quản trị chỉ để xem: danh sách đề, lịch sử cảnh báo, tài khoản bị đánh dấu
 * nghi gian lận, tạm dừng Flashback và xem mã của một đề đã đóng (mỗi lần xem máy
 * chủ ghi nhật ký kiểm tra).
 *
 * Cấu trúc trên dây lấy từ contract sinh (`ApiResponseFor`), rồi đổi sang tên
 * dùng trong giao diện. Mã và giai đoạn của đề KHÔNG được đưa vào kiểu dùng
 * trong giao diện: đề đã đóng cũng chỉ lộ qua endpoint xem mã (có ghi nhật ký).
 */
import { requestOperation } from "@/lib/contract-client"
import type { ApiResponseFor } from "@/lib/contract-types"

export type FlashbackRoundsResponse = ApiResponseFor<"GET /api/v2/admin/flashback/rounds">
export type FlashbackAlertsResponse = ApiResponseFor<"GET /api/v2/admin/flashback/alerts">
export type FlashbackSuspectsResponse = ApiResponseFor<"GET /api/v2/admin/flashback/suspects">
export type FlashbackRewardHoldsResponse = ApiResponseFor<"GET /api/v2/admin/flashback/reward-holds">
export type FlashbackSettingsResponse = ApiResponseFor<"GET /api/v2/admin/flashback/settings">

/** Mức độ cảnh báo (spec v1.2 §6.1). */
export type FlashbackAlertLevel = "high" | "medium" | "low"

export type FlashbackRound = {
  roundNo: number
  status: string
  scheduledOpenAt: string
  opensAt: string | null
  closesAt: string | null
  playerCount: number
  totalFeeXu: number
  totalRewardXu: number
  /** Thưởng đang tạm giữ chờ duyệt (spec 22-10 FB-07). */
  heldRewardXu: number
  /** Mức nới điều kiện đã dùng khi tạo đề (0 = không nới). */
  fallbackLevel: number
  /** Định danh đề: dùng cho endpoint xem mã. */
  id: string
}

export type FlashbackAlert = {
  runAt: string
  step: string
  roundId: string | null
  result: string
  error: string | null
  level: FlashbackAlertLevel | null
  /** Nhãn tiếng Việt do máy chủ gửi kèm. */
  levelLabel: string | null
}

export type FlashbackSuspect = {
  roundId: string
  reason: string
  shared: string
  userCount: number
  usernames: string[]
}

/** Trạng thái tạm dừng và quyền của người đang xem (spec 22-10 FB-08). */
export type FlashbackPauseStatus = {
  paused: boolean
  /** Có trong `SUPER_ADMIN_USER_IDS`: được tạm dừng và xem mã. */
  superAdmin: boolean
}

export type FlashbackRewardHoldStatus = "held" | "released" | "voided"

/** Một khoản thưởng bị tạm giữ vì tài khoản nằm trong nhóm nghi gian lận (FB-07). */
export type FlashbackRewardHold = {
  id: string
  roundId: string
  roundNo: number
  userId: string
  username: string
  amount: number
  reason: string
  status: FlashbackRewardHoldStatus
  createdAt: string
  decidedAt: string | null
}

/** Một tham số vận hành chỉ đọc (spec v1.2 §9, spec 22-10 FB-11i). */
export type FlashbackSetting = {
  key: string
  label: string
  value: string | number
  defaultValue: string | number
}

export type FlashbackReveal = {
  roundNo: number
  symbol: string
  startDate: string
  sessionRange: string
}

type RoundRow = FlashbackRoundsResponse["rounds"][number]
type AlertRow = FlashbackAlertsResponse["alerts"][number]
type SuspectRow = FlashbackSuspectsResponse["suspects"][number]
type RewardHoldRow = FlashbackRewardHoldsResponse["holds"][number]
type SettingRow = FlashbackSettingsResponse["settings"][number]

export function adaptRound(row: RoundRow): FlashbackRound {
  return {
    roundNo: row.round_no,
    status: row.status,
    scheduledOpenAt: row.scheduled_open_at,
    opensAt: row.opens_at ?? null,
    closesAt: row.closes_at ?? null,
    playerCount: row.player_count,
    totalFeeXu: row.total_fee_xu,
    totalRewardXu: row.total_reward_xu,
    heldRewardXu: row.held_reward_xu,
    fallbackLevel: row.fallback_level,
    id: row.id,
  }
}

export function adaptAlert(row: AlertRow): FlashbackAlert {
  return {
    runAt: row.run_at,
    step: row.step,
    roundId: row.round_id ?? null,
    result: row.result,
    error: row.error ?? null,
    level: row.level ?? null,
    levelLabel: row.level_label ?? null,
  }
}

export function adaptSuspect(row: SuspectRow): FlashbackSuspect {
  return {
    roundId: row.round_id,
    reason: row.reason,
    shared: row.shared,
    userCount: row.user_count,
    usernames: row.usernames ?? [],
  }
}

export function adaptRewardHold(row: RewardHoldRow): FlashbackRewardHold {
  return {
    id: row.id,
    roundId: row.round_id,
    roundNo: row.round_no,
    userId: row.user_id,
    username: row.username,
    amount: row.amount,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  }
}

export function adaptSetting(row: SettingRow): FlashbackSetting {
  return { key: row.key, label: row.label, value: row.value, defaultValue: row.default_value }
}

/** Danh sách đề: số đề, trạng thái, giờ mở/đóng, người chơi, phí và thưởng. */
export async function fetchFlashbackRounds(signal?: AbortSignal): Promise<FlashbackRound[]> {
  const response = await requestOperation("GET /api/v2/admin/flashback/rounds", {}, { signal })
  return response.rounds.map(adaptRound)
}

/** Lịch sử cảnh báo của tác vụ, kèm mức độ. */
export async function fetchFlashbackAlerts(signal?: AbortSignal): Promise<FlashbackAlert[]> {
  const response = await requestOperation("GET /api/v2/admin/flashback/alerts", {}, { signal })
  return response.alerts.map(adaptAlert)
}

/** Nhóm tài khoản bị đánh dấu nghi gian lận. */
export async function fetchFlashbackSuspects(signal?: AbortSignal): Promise<FlashbackSuspect[]> {
  const response = await requestOperation("GET /api/v2/admin/flashback/suspects", {}, { signal })
  return response.suspects.map(adaptSuspect)
}

/** Trạng thái tạm dừng do máy chủ giữ, kèm quyền quản trị cao nhất của người đang xem. */
export async function fetchFlashbackPauseStatus(signal?: AbortSignal): Promise<FlashbackPauseStatus> {
  const response = await requestOperation("GET /api/v2/admin/flashback/pause", {}, { signal })
  return { paused: response.paused, superAdmin: response.super_admin }
}

/**
 * Tạm dừng Flashback (dừng mở đề mới) hoặc chạy lại. Đề đang mở vẫn chạy tới
 * giờ đóng và trả thưởng bình thường. Chỉ quản trị cao nhất (máy chủ kiểm tra).
 */
export async function setFlashbackPaused(paused: boolean): Promise<boolean> {
  const response = await requestOperation("POST /api/v2/admin/flashback/pause", { body: { paused } })
  return response.paused
}

/** Mã và giai đoạn của một đề đã đóng; máy chủ ghi nhật ký mỗi lần xem. */
export async function revealFlashbackRound(id: string): Promise<FlashbackReveal> {
  const response = await requestOperation("GET /api/v2/admin/flashback/rounds/{id}/reveal", { path: { id } })
  return {
    roundNo: response.round_no,
    symbol: response.symbol,
    startDate: response.start_date,
    sessionRange: response.session_range,
  }
}

/** Thưởng bị tạm giữ (mặc định: đang chờ duyệt). */
export async function fetchFlashbackRewardHolds(
  status: FlashbackRewardHoldStatus = "held",
  signal?: AbortSignal,
): Promise<FlashbackRewardHold[]> {
  const response = await requestOperation("GET /api/v2/admin/flashback/reward-holds", { query: { status } }, { signal })
  return response.holds.map(adaptRewardHold)
}

/** Trả khoản thưởng đang giữ vào ví xu của người chơi (máy chủ ghi nhật ký). */
export async function releaseFlashbackRewardHold(id: string): Promise<FlashbackRewardHold> {
  return adaptRewardHold(
    await requestOperation("POST /api/v2/admin/flashback/reward-holds/{id}/release", { path: { id } }),
  )
}

/** Huỷ khoản thưởng đang giữ: không cộng xu (máy chủ ghi nhật ký). */
export async function voidFlashbackRewardHold(id: string): Promise<FlashbackRewardHold> {
  return adaptRewardHold(
    await requestOperation("POST /api/v2/admin/flashback/reward-holds/{id}/void", { path: { id } }),
  )
}

/** Bảng tham số vận hành chỉ đọc. */
export async function fetchFlashbackSettings(signal?: AbortSignal): Promise<FlashbackSetting[]> {
  const response = await requestOperation("GET /api/v2/admin/flashback/settings", {}, { signal })
  return response.settings.map(adaptSetting)
}
