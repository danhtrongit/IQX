import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  fetchDashboardCatalog,
  fetchDashboardIndustry,
  fetchDashboardSettings,
  fetchFundamental,
  fetchValuation,
  saveDashboardSettings,
  type DashboardSettings,
  type Industry,
  type PeriodMode,
  type SaveSettingsBody,
} from "./api"

export const dashboardKeys = {
  settings: ["dashboard", "settings"] as const,
  catalog: ["dashboard", "catalog"] as const,
  industry: (symbol: string) => ["dashboard", "industry", symbol] as const,
  fundamental: (symbol: string, charts: string) => ["dashboard", "fundamental", symbol, charts] as const,
  valuation: (symbol: string, from: string, charts: string) =>
    ["dashboard", "valuation", symbol, from, charts] as const,
}

/** Thiết lập dashboard của tài khoản theo ngành; máy chủ trả sẵn bộ mặc định của ngành chưa lưu. */
export function useDashboardSettings(enabled: boolean) {
  return useQuery({
    queryKey: dashboardKeys.settings,
    queryFn: ({ signal }) => fetchDashboardSettings(signal),
    enabled,
    staleTime: 5 * 60_000,
  })
}

/** Danh mục 62 chỉ tiêu theo ngành: chương, nhóm, khoá bài học và bộ mặc định của từng ngành. */
export function useDashboardCatalog() {
  return useQuery({
    queryKey: dashboardKeys.catalog,
    queryFn: ({ signal }) => fetchDashboardCatalog(signal),
    staleTime: 60 * 60_000,
  })
}

/** Ngành của mã theo mẫu báo cáo tài chính (spec §1.3): quyết định danh mục và thiết lập đang dùng. */
export function useDashboardIndustry(symbol: string) {
  return useQuery({
    queryKey: dashboardKeys.industry(symbol),
    queryFn: ({ signal }) => fetchDashboardIndustry(symbol, signal),
    enabled: symbol.length > 0,
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

/** Lưu thiết lập của một ngành theo tài khoản; chỉ ngành đó đổi, các ngành khác giữ nguyên. */
export function useSaveDashboardSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ nganh, body }: { nganh: Industry; body: SaveSettingsBody }) =>
      saveDashboardSettings(nganh, body),
    onSuccess: (saved, { nganh }) => {
      queryClient.setQueryData<DashboardSettings>(dashboardKeys.settings, (current) =>
        current
          ? { ...current, [nganh]: { charts: saved.charts, per: saved.per, nks: saved.nks } }
          : current,
      )
    },
  })
}
