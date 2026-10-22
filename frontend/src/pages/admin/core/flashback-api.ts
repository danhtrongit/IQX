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
import { ApiError, api } from "@/lib/api"
import { requestOperation } from "@/lib/contract-client"
import type { ApiResponseFor } from "@/lib/contract-types"

export type FlashbackRoundsResponse = ApiResponseFor<"GET /api/v2/admin/flashback/rounds">
export type FlashbackAlertsResponse = ApiResponseFor<"GET /api/v2/admin/flashback/alerts">
export type FlashbackSuspectsResponse = ApiResponseFor<"GET /api/v2/admin/flashback/suspects">

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

export type FlashbackReveal = {
  roundNo: number
  symbol: string
  startDate: string
  sessionRange: string
}

type RoundRow = FlashbackRoundsResponse["rounds"][number]
type AlertRow = FlashbackAlertsResponse["alerts"][number]
type SuspectRow = FlashbackSuspectsResponse["suspects"][number]

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

/** Trạng thái tạm dừng hiện tại do máy chủ giữ. */
export async function fetchFlashbackPauseStatus(signal?: AbortSignal): Promise<boolean> {
  const response = await requestOperation("GET /api/v2/admin/flashback/pause", {}, { signal })
  return response.paused
}

/**
 * Tạm dừng Flashback (dừng mở đề mới) hoặc chạy lại. Đề đang mở vẫn chạy tới
 * giờ đóng và trả thưởng bình thường.
 *
 * Contract sinh cho lời gọi này chưa có kiểu thân (`body?: never`) nên dùng
 * `api()` của `@/lib/api` — cùng ranh giới HTTP, cùng token và làm mới phiên.
 */
export async function setFlashbackPaused(paused: boolean): Promise<boolean> {
  const raw = await api<{ paused?: boolean }>("/admin/flashback/pause", {
    method: "POST",
    body: JSON.stringify({ paused }),
  })
  return raw.paused === true
}

/**
 * Mã và giai đoạn của một đề đã đóng; máy chủ ghi nhật ký mỗi lần xem.
 *
 * Contract sinh cho route này chưa khai báo kiểu tham đường dẫn (`path?: never`)
 * nên dùng `api()` của `@/lib/api` với đường dẫn dựng tay.
 */
export async function revealFlashbackRound(id: string): Promise<FlashbackReveal> {
  const raw = await api<unknown>(`/admin/flashback/rounds/${encodeURIComponent(id)}/reveal`)
  return parseReveal(raw)
}

/** Câu trả lời của endpoint xem mã là đối tượng lỏng: kiểm lại từng trường. */
function parseReveal(raw: unknown): FlashbackReveal {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ApiError("Phản hồi Flashback không hợp lệ", 502, { code: "INVALID_RESPONSE" })
  }
  const row = raw as Record<string, unknown>
  const number = typeof row.round_no === "number" ? row.round_no : null
  const symbol = typeof row.symbol === "string" ? row.symbol : null
  const startDate = typeof row.start_date === "string" ? row.start_date : null
  const sessionRange = typeof row.session_range === "string" ? row.session_range : null
  if (number === null || symbol === null || startDate === null || sessionRange === null) {
    throw new ApiError("Phản hồi Flashback không hợp lệ", 502, { code: "INVALID_RESPONSE" })
  }
  return { roundNo: number, symbol, startDate, sessionRange }
}
