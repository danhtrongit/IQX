/**
 * "Đẩy vào bản tin" (chỉ quản trị viên): bản tin đang chờ mã, danh sách mã đạt kèm GTGD hôm nay và
 * lệnh đẩy vào một trong ba ô. Máy chủ kiểm lại mọi điều kiện đẩy; client chỉ báo trước bằng đúng
 * các câu của spec để người dùng không phải chờ phản hồi lỗi.
 */
import { requestOperation } from "@/lib/contract-client"
import type { ApiResponseFor } from "@/lib/contract-types"

export type PushContext = ApiResponseFor<"GET /api/v2/admin/market-bulletins/push-context">
export type PushSlotState = PushContext["slots"][number]
export type PushCandidates = ApiResponseFor<"GET /api/v2/admin/market-bulletins/push-candidates">
export type PushCandidate = PushCandidates["items"][number]
export type PushResult = ApiResponseFor<"POST /api/v2/market/bulletins/{date}/slots/{slot}">

export type PushSlot = 1 | 2 | 3

export type PushBody = {
  resultId: string
  filterId: string
  filterVersion: number
  picks: readonly string[]
  displayName: string
  conditions: readonly string[]
}

export function getPushContext(signal?: AbortSignal): Promise<PushContext> {
  return requestOperation("GET /api/v2/admin/market-bulletins/push-context", {}, { signal })
}

export function getPushCandidates(resultId: string, signal?: AbortSignal): Promise<PushCandidates> {
  return requestOperation("GET /api/v2/admin/market-bulletins/push-candidates", { query: { result_id: resultId } }, { signal })
}

export function pushToBulletin(date: string, slot: PushSlot, body: PushBody): Promise<PushResult> {
  return requestOperation("POST /api/v2/market/bulletins/{date}/slots/{slot}", {
    path: { date, slot },
    body: {
      result_id: body.resultId,
      filter_id: body.filterId,
      filter_version: body.filterVersion,
      picks: [...body.picks],
      display_name: body.displayName,
      conditions: [...body.conditions],
    },
  })
}
