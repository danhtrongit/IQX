import { useLiveCheck, type LiveCheck } from "@/components/layout/use-live-check"

import { teamLeadsApi, type TeamLeadLookup } from "./api"

/** Tên đăng nhập có ít nhất 4 ký tự; email luôn có "@". Ngắn hơn thì chưa hỏi máy chủ. */
export function lookupKey(input: string): string | null {
  const value = input.trim().toLowerCase()
  return value.length >= 3 ? value : null
}

/**
 * Tra cứu có debounce cho hộp thoại Bổ nhiệm và Thêm vào nhóm. Kết quả `null` nghĩa là
 * không có người dùng đó. Với `leadId`, máy chủ đánh giá điều kiện thêm vào đúng nhóm này.
 */
export function useUserLookup(input: string, leadId?: string): LiveCheck<TeamLeadLookup | null> {
  return useLiveCheck(lookupKey(input), (q, signal) => teamLeadsApi.lookup(q, leadId, signal))
}
