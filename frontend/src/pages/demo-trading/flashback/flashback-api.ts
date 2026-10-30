/**
 * Data layer của Flashback v2 "Phòng chơi" (spec v2 §10).
 *
 * Mọi số liệu của ván do server quyết định: trình duyệt không bao giờ có tên mã, ngày thật hay
 * nến tương lai trước khi ván kết thúc. Nến kế tiếp chỉ tới sau khi server đã ghi nhận lượt bấm
 * "Phiên tiếp" của chính người chơi, và % của người khác đã được server cắt tại phiên mình đang xem.
 *
 * Kiểu lấy từ contract đã sinh (`frontend/src/lib/generated/backend-v2.ts`); riêng metadata chỉ
 * báo server khai báo `looseObject` nên dùng kiểu cục bộ bám `flashback.indicators.ts`.
 */
import { requestOperation } from "@/lib/contract-client"
import type { ApiResponseFor } from "@/lib/contract-types"

type RoomResponse = ApiResponseFor<"GET /api/v2/flashback/rooms/{code}">
type RoomListResponse = ApiResponseFor<"GET /api/v2/flashback/rooms">
type MineResponse = ApiResponseFor<"GET /api/v2/flashback/rooms/me">
type SnapshotResponse = ApiResponseFor<"GET /api/v2/flashback/matches/{id}">
type StateResponse = ApiResponseFor<"GET /api/v2/flashback/matches/{id}/state">
type ResultResponse = ApiResponseFor<"GET /api/v2/flashback/matches/{id}/result">
type NextResponse = ApiResponseFor<"POST /api/v2/flashback/matches/{id}/next">
type OrderResponse = ApiResponseFor<"POST /api/v2/flashback/matches/{id}/orders">
type FinishResponse = ApiResponseFor<"POST /api/v2/flashback/matches/{id}/finish">
type StartResponse = ApiResponseFor<"POST /api/v2/flashback/rooms/{code}/start">
type IndicatorsResponse = ApiResponseFor<"GET /api/v2/flashback/indicators">

/** Một nến gửi cho trình duyệt: không có ngày thật, không có mã. */
export type FlashbackBar = SnapshotResponse["history_bars"][number]

/** Một phòng chơi (phòng chờ hoặc phòng đang chơi) với danh sách thành viên. */
export type FlashbackRoom = RoomResponse
export type FlashbackRoomMember = RoomResponse["members"][number]
export type FlashbackRoomMatch = NonNullable<RoomResponse["match"]>
export type FlashbackRoomListItem = RoomListResponse["rooms"][number]
export type FlashbackRoomFilter = "all" | "waiting" | "playing"
export type FlashbackMine = MineResponse

/** Ảnh chụp ván chơi của chính người gọi: nến đã mở, tài khoản và các số của đồng hồ. */
export type FlashbackSnapshot = SnapshotResponse
export type FlashbackMe = SnapshotResponse["me"]
export type FlashbackOrder = FlashbackMe["orders"][number]
export type FlashbackPosition = FlashbackMe["positions"][number]

/** Trạng thái chung của ván: đồng hồ, người chơi và % theo phiên mình đang xem. */
export type FlashbackMatchState = StateResponse
export type FlashbackPlayer = StateResponse["players"][number]

export type FlashbackMatchResult = ResultResponse
export type FlashbackResultRow = ResultResponse["rows"][number]

export type FlashbackNextResult = NextResponse
export type FlashbackOrderResult = OrderResponse
export type FlashbackFinishResult = FinishResponse
export type FlashbackStartResult = StartResponse

export type FlashbackOrderSide = "buy" | "sell"
export type FlashbackOrderBody = { side: FlashbackOrderSide; qty: number; idempotency_key?: string }

export type FlashbackCreateRoomBody = {
  view_bars: number
  play_bars: number
  minutes: number
  max_players: number
  stake_xu: number | null
  password: string | null
}

/** Một chỉ báo đã chọn: id chỉ báo + bộ tham số đã chọn. */
export type FlashbackIndicatorInstance = {
  id: string
  params: FlashbackIndicatorParams
}

/** Giá trị một tham số: số đơn hoặc cặp ngưỡng dưới/trên. */
export type FlashbackIndicatorParamValue = number | { lower: number; upper: number }
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

/** Metadata một chỉ báo; từ v2 mọi người đều có đủ 16 chỉ báo, không phụ thuộc Học viện. */
export type FlashbackIndicatorMeta = {
  id: string
  name: string
  chapter: number
  lesson_id: string | null
  params: FlashbackIndicatorParamMeta[]
  cross_fields: { left: string; op: ">" | "<"; right: string }[]
  warmup_sessions: number
}

export type FlashbackIndicatorList = Omit<IndicatorsResponse, "indicators"> & {
  indicators: FlashbackIndicatorMeta[]
}

// ------------------------------------------------------------------ sảnh và phòng

export function fetchRooms(status: FlashbackRoomFilter, signal?: AbortSignal): Promise<RoomListResponse> {
  return requestOperation("GET /api/v2/flashback/rooms", { query: { status } }, signal ? { signal } : {})
}

/** Phòng người dùng đang ở (nếu có) và thông báo một lần, ví dụ "bạn bị đưa ra vì không đủ xu". */
export function fetchMyRoom(signal?: AbortSignal): Promise<FlashbackMine> {
  return requestOperation("GET /api/v2/flashback/rooms/me", {}, signal ? { signal } : {})
}

export function fetchRoom(code: string, signal?: AbortSignal): Promise<FlashbackRoom> {
  return requestOperation("GET /api/v2/flashback/rooms/{code}", { path: { code } }, signal ? { signal } : {})
}

export function createRoom(body: FlashbackCreateRoomBody): Promise<FlashbackRoom> {
  return requestOperation("POST /api/v2/flashback/rooms", { body })
}

export function joinRoom(code: string, password?: string): Promise<FlashbackRoom> {
  return requestOperation("POST /api/v2/flashback/rooms/{code}/join", {
    path: { code },
    body: password ? { password } : {},
  })
}

export function randomJoinRoom(): Promise<FlashbackRoom> {
  return requestOperation("POST /api/v2/flashback/rooms/random-join", {})
}

export function leaveRoom(code: string): Promise<ApiResponseFor<"POST /api/v2/flashback/rooms/{code}/leave">> {
  return requestOperation("POST /api/v2/flashback/rooms/{code}/leave", { path: { code } })
}

export function startRoom(code: string): Promise<FlashbackStartResult> {
  return requestOperation("POST /api/v2/flashback/rooms/{code}/start", { path: { code } })
}

export function replayRoom(code: string): Promise<FlashbackRoom> {
  return requestOperation("POST /api/v2/flashback/rooms/{code}/replay", { path: { code } })
}

// ------------------------------------------------------------------ ván chơi

export function fetchMatch(matchId: string, signal?: AbortSignal): Promise<FlashbackSnapshot> {
  return requestOperation("GET /api/v2/flashback/matches/{id}", { path: { id: matchId } }, signal ? { signal } : {})
}

export function fetchMatchState(matchId: string, signal?: AbortSignal): Promise<FlashbackMatchState> {
  return requestOperation("GET /api/v2/flashback/matches/{id}/state", { path: { id: matchId } }, signal ? { signal } : {})
}

export function fetchMatchResult(matchId: string, signal?: AbortSignal): Promise<FlashbackMatchResult> {
  return requestOperation("GET /api/v2/flashback/matches/{id}/result", { path: { id: matchId } }, signal ? { signal } : {})
}

export function nextBar(matchId: string): Promise<FlashbackNextResult> {
  return requestOperation("POST /api/v2/flashback/matches/{id}/next", { path: { id: matchId } })
}

export function placeOrder(matchId: string, body: FlashbackOrderBody): Promise<FlashbackOrderResult> {
  return requestOperation("POST /api/v2/flashback/matches/{id}/orders", { path: { id: matchId }, body })
}

export function finishMatch(matchId: string): Promise<FlashbackFinishResult> {
  return requestOperation("POST /api/v2/flashback/matches/{id}/finish", { path: { id: matchId } })
}

/** Đủ 16 chỉ báo cho mọi người: tên, tham số và miền cho phép (metadata dùng chung với Bot). */
export async function fetchIndicators(signal?: AbortSignal): Promise<FlashbackIndicatorList> {
  const response = await requestOperation("GET /api/v2/flashback/indicators", {}, signal ? { signal } : {})
  return response as unknown as FlashbackIndicatorList
}
