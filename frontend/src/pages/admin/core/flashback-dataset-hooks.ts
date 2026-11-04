/**
 * Hook React Query cho mục "Kho dữ liệu Flashback" (spec v2.2 §6).
 *
 * Tổng quan đọc theo nhịp: 30 giây khi rảnh, 2 giây khi có một lần làm mới đang chạy hoặc vừa được
 * gửi đi mà chưa thấy lần dựng nào bắt đầu. Danh sách mã và lịch sử phiên bản gắn `signature` (số
 * phiên bản đang dùng, bản thất bại và bản đang dựng) vào khoá cache: có phiên bản mới hoặc một
 * lần dựng kết thúc thì chúng tự tải lại, không cần đoán lúc nào lần làm mới xong.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  datasetSignature,
  fetchDatasetStatus,
  fetchDatasetSymbols,
  fetchDatasetVersions,
  refreshDataset,
  updateDatasetConfig,
  type DatasetConfigPatch,
} from "./flashback-dataset-api"

export const datasetKeys = {
  status: ["admin", "flashback", "dataset", "status"] as const,
  symbols: (version: number | null, signature: string | null) =>
    ["admin", "flashback", "dataset", "symbols", version ?? "current", signature] as const,
  versions: (signature: string | null) => ["admin", "flashback", "dataset", "versions", signature] as const,
}

/** Nhịp đọc tiến độ khi có lần làm mới đang chạy. */
export const DATASET_POLL_MS = 2_000
/** Nhịp đọc khi không có gì đang chạy. */
export const DATASET_IDLE_POLL_MS = 30_000

/**
 * `waitingFor`: dấu hiệu của kho lúc vừa gửi yêu cầu làm mới. Tới khi dấu hiệu đổi (có lần dựng
 * mới bắt đầu) thì đọc nhanh để thấy tiến độ ngay.
 */
export function useDatasetStatus({ waitingFor }: { waitingFor: string | null }) {
  return useQuery({
    queryKey: datasetKeys.status,
    queryFn: ({ signal }) => fetchDatasetStatus(signal),
    staleTime: 10_000,
    refetchInterval: (query) => {
      const data = query.state.data
      if (data?.building) return DATASET_POLL_MS
      if (waitingFor !== null && datasetSignature(data) === waitingFor) return DATASET_POLL_MS
      return DATASET_IDLE_POLL_MS
    },
    refetchIntervalInBackground: false,
  })
}

/**
 * Danh sách mã. `version = null` là phiên bản đang dùng (hoặc bản mới nhất nếu chưa có bản nào).
 * Chỉ tải sau khi đã có tổng quan để khoá cache có `signature` đúng, tránh tải hai lần.
 */
export function useDatasetSymbols(version: number | null, signature: string | null) {
  return useQuery({
    queryKey: datasetKeys.symbols(version, signature),
    queryFn: ({ signal }) => fetchDatasetSymbols(version, signal),
    enabled: signature !== null,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  })
}

export function useDatasetVersions(signature: string | null) {
  return useQuery({
    queryKey: datasetKeys.versions(signature),
    queryFn: ({ signal }) => fetchDatasetVersions(signal),
    enabled: signature !== null,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  })
}

/** Gửi yêu cầu làm mới; đọc lại tổng quan ngay để thấy lần dựng bắt đầu. */
export function useRefreshDataset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => refreshDataset(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: datasetKeys.status })
    },
  })
}

/** Đổi tham số kho; tổng quan đọc lại để bảng tham số và cảnh báo phản ánh máy chủ. */
export function useUpdateDatasetConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: DatasetConfigPatch) => updateDatasetConfig(patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: datasetKeys.status })
    },
  })
}
