/**
 * Hook React Query cho khối "Mẫu nến" (Candle Dojo spec v1.3 §7).
 *
 * Trạng thái chỉ đọc theo nhịp khi có lần tính đang chạy, hoặc vừa gửi yêu cầu mà chưa thấy lần
 * tính nào xuất hiện; rảnh thì không đọc lặp. Tra cứu và tổng quan gắn mã lần tính đang dùng vào
 * khoá cache: một lần tính xong thì chúng tự tải lại, không cần đoán lúc nào xong.
 */
import { keepPreviousData, skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  fetchPatternLookup,
  fetchPatternOverview,
  fetchPatternStatus,
  recomputePatterns,
  type PatternLookupParams,
} from "./flashback-patterns-api"

export const patternKeys = {
  status: ["admin", "flashback", "patterns", "status"] as const,
  lookup: (params: PatternLookupParams | null, usedRunId: number | null) =>
    [
      "admin",
      "flashback",
      "patterns",
      "lookup",
      params?.symbol ?? "all",
      params?.from ?? null,
      params?.to ?? null,
      usedRunId,
    ] as const,
  overview: (usedRunId: number | null) => ["admin", "flashback", "patterns", "overview", usedRunId] as const,
}

/** Nhịp đọc tiến độ khi có lần tính đang chạy. */
export const PATTERN_POLL_MS = 3_000

/**
 * `waitingFor`: mã lần tính mới nhất lúc vừa gửi yêu cầu (`null` khi kho chưa có lần nào). Tới khi
 * mã đó đổi, tức lần tính mới đã xuất hiện, thì đọc nhanh để thấy tiến độ ngay.
 *
 * `datasetSignature`: dấu hiệu của kho dữ liệu (xem `datasetSignature`). Có phiên bản kho mới thì
 * trạng thái đọc lại, trong lúc đó vẫn hiện số liệu cũ thay vì nhấp nháy.
 */
export function usePatternStatus({
  waitingFor,
  datasetSignature,
}: {
  waitingFor: { latestId: number | null } | null
  datasetSignature: string
}) {
  return useQuery({
    queryKey: [...patternKeys.status, datasetSignature],
    queryFn: ({ signal }) => fetchPatternStatus(signal),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    refetchInterval: (query) => {
      const data = query.state.data
      if (data?.running) return PATTERN_POLL_MS
      if (waitingFor !== null && (data?.latest?.id ?? null) === waitingFor.latestId) return PATTERN_POLL_MS
      return false
    },
    refetchIntervalInBackground: false,
  })
}

/** Tra cứu số lần theo từng thẻ; chỉ chạy sau khi người dùng bấm Tra cứu với ô nhập hợp lệ. */
export function usePatternLookup(params: PatternLookupParams | null, usedRunId: number | null) {
  return useQuery({
    queryKey: patternKeys.lookup(params, usedRunId),
    queryFn: params ? ({ signal }) => fetchPatternLookup(params, signal) : skipToken,
    staleTime: 5 * 60_000,
  })
}

/** Tổng quan 47 thẻ trên cả kho; chỉ tải sau khi đã biết lần tính đang dùng. */
export function usePatternOverview(usedRunId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: patternKeys.overview(usedRunId),
    queryFn: ({ signal }) => fetchPatternOverview(signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  })
}

/** Gửi yêu cầu tính lại; đọc lại trạng thái ngay để thấy lần tính bắt đầu. */
export function useRecomputePatterns() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => recomputePatterns(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: patternKeys.status })
    },
  })
}
