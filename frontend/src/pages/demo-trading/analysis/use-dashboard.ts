import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  fetchDashboardCatalog,
  fetchDashboardSettings,
  fetchFundamental,
  fetchInstrument,
  fetchValuation,
  saveDashboardSettings,
  type PeriodMode,
  type SaveSettingsBody,
} from "./api"

export const dashboardKeys = {
  settings: ["dashboard", "settings"] as const,
  catalog: ["dashboard", "catalog"] as const,
  fundamental: (symbol: string, charts: string) => ["dashboard", "fundamental", symbol, charts] as const,
  valuation: (symbol: string, from: string, charts: string) =>
    ["dashboard", "valuation", symbol, from, charts] as const,
}

/** Thiết lập dashboard của tài khoản; máy chủ trả sẵn bộ mặc định nếu chưa lưu. */
export function useDashboardSettings(enabled: boolean) {
  return useQuery({
    queryKey: dashboardKeys.settings,
    queryFn: ({ signal }) => fetchDashboardSettings(signal),
    enabled,
    staleTime: 5 * 60_000,
  })
}

/** Danh mục 33 chỉ tiêu chia 6 nhóm, kèm cờ "không áp dụng cho ngân hàng". */
export function useDashboardCatalog() {
  return useQuery({
    queryKey: dashboardKeys.catalog,
    queryFn: ({ signal }) => fetchDashboardCatalog(signal),
    staleTime: 60 * 60_000,
  })
}

/**
 * Số liệu các biểu đồ được chọn. Máy chủ trả đủ 20 quý và 10 năm cho cả hai
 * chế độ, nên đổi số kỳ hoặc chuyển Quý/Năm không phải gọi lại.
 */
export function useFundamental(symbol: string, charts: string[], per: PeriodMode, enabled: boolean) {
  return useQuery({
    queryKey: dashboardKeys.fundamental(symbol, charts.join(",")),
    queryFn: ({ signal }) => fetchFundamental(symbol, charts, per, signal),
    enabled: enabled && charts.length > 0,
    staleTime: 5 * 60_000,
    // Đổi danh sách biểu đồ không làm tắt các thẻ đang có: số liệu cũ đứng
    // cho tới khi số mới về. Đổi mã thì không dùng số của mã trước.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === symbol ? keepPreviousData(previous) : undefined,
  })
}

/** Chuỗi định giá theo ngày của các chỉ tiêu khuôn F. */
export function useValuation(symbol: string, from: string, charts: string[], enabled: boolean) {
  return useQuery({
    queryKey: dashboardKeys.valuation(symbol, from, charts.join(",")),
    queryFn: ({ signal }) => fetchValuation(symbol, from, charts, signal),
    enabled: enabled && charts.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === symbol ? keepPreviousData(previous) : undefined,
  })
}

/** Ngành cấp 2 của mã báo đây là ngân hàng (VCI ghi "Ngân hàng", có nguồn ghi "Banks"). */
export function isBankIndustry(industry: string | null | undefined): boolean {
  return !!industry && /ng[âa]n h[àa]ng|\bbanks?\b/i.test(industry)
}

/**
 * Loại doanh nghiệp đoán từ danh sách mã (cùng nguồn với ô tìm kiếm), để nhãn
 * "Ngân hàng" hiện ngay trước khi số liệu về (DB-05d). `null` khi chưa biết.
 */
export function useInstrumentIsBank(symbol: string): boolean | null {
  const query = useQuery({
    queryKey: ["instruments", "detail", symbol],
    queryFn: ({ signal }) => fetchInstrument(symbol, signal),
    enabled: symbol.length > 0,
    staleTime: 60 * 60_000,
    retry: false,
  })
  if (!query.data) return null
  const instrument = query.data.data
  return isBankIndustry(instrument.icbLv2) || isBankIndustry(instrument.icbLv1)
}

/** Lưu thiết lập theo tài khoản; câu trả lời là thiết lập đã lưu. */
export function useSaveDashboardSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: SaveSettingsBody) => saveDashboardSettings(body),
    onSuccess: (saved) => {
      queryClient.setQueryData(dashboardKeys.settings, saved)
    },
  })
}
