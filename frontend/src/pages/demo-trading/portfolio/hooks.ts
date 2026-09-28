/**
 * React Query hooks cho panel "Danh mục" (/demo-trading).
 *
 * - Dữ liệu người dùng (`/watchlists`) khoá theo `user.id` và được xoá khi
 *   đăng nhập/đăng xuất (AuthProvider `queryClient.clear()`), nên không rò rỉ
 *   danh sách giữa các tài khoản.
 * - Mọi mutation của danh mục invalidate tiền tố `["watchlist"]`; huỷ lệnh
 *   invalidate `["trading"]` — cùng nhịp với `use-trading.ts` dùng chung.
 * - Đổi thứ tự áp dụng optimistic rồi rollback nếu server từ chối.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import {
  addToWatchlist,
  analyzePortfolio,
  cancelOrder,
  fetchDailyCloses,
  fetchSymbolInfo,
  fetchWatchlist,
  removeFromWatchlist,
  reorderWatchlist,
  type PortfolioAnalysisResponse,
  type SymbolInfo,
  type WatchlistItem,
} from "./api"

/** Danh sách theo dõi của user hiện tại. */
export function useWatchlist() {
  const { user } = useAuth()
  return useQuery<WatchlistItem[]>({
    queryKey: ["watchlist", "list", user?.id],
    enabled: !!user,
    queryFn: ({ signal }) => fetchWatchlist(signal),
  })
}

/** Tên/sàn/ngành của một mã — dữ liệu tham chiếu, cache lâu. */
export function useSymbolInfo(symbol: string) {
  const code = symbol.trim().toUpperCase()
  return useQuery<SymbolInfo | null>({
    queryKey: ["symbol-info", code],
    enabled: !!code,
    queryFn: ({ signal }) => fetchSymbolInfo(code, signal),
    staleTime: 60 * 60_000,
  })
}

/** Chuỗi giá đóng cửa cho sparkline — dữ liệu tham chiếu, cache lâu. */
export function useDailyCloses(symbol: string) {
  const code = symbol.trim().toUpperCase()
  return useQuery<number[]>({
    queryKey: ["daily-closes", code],
    enabled: !!code,
    queryFn: ({ signal }) => fetchDailyCloses(code, signal),
    staleTime: 30 * 60_000,
  })
}

export function useAddToWatchlist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (symbol: string) => addToWatchlist(symbol),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  })
}

export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (symbol: string) => removeFromWatchlist(symbol),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  })
}

/** `PUT /watchlists/reorder` với cập nhật lạc quan + rollback khi lỗi. */
export function useReorderWatchlist() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const key = ["watchlist", "list", user?.id] as const
  return useMutation({
    mutationFn: (symbols: string[]) => reorderWatchlist(symbols),
    onMutate: async (symbols) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<WatchlistItem[]>(key)
      if (previous) {
        const next = symbols.flatMap((symbol, index) => {
          const item = previous.find((candidate) => candidate.symbol === symbol)
          return item ? [{ ...item, sortOrder: index }] : []
        })
        queryClient.setQueryData<WatchlistItem[]>(key, next)
      }
      return { previous }
    },
    onError: (_error, _symbols, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  })
}

/** `POST /virtual-trading/orders/{id}/cancel` — chỉ lệnh đang chờ. */
export function useCancelOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderId: string) => cancelOrder(orderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trading"] }),
  })
}

/** Báo cáo AI `POST /portfolio-manager/analyze` (premium, có thể chạy lâu). */
export function useAnalyzePortfolio() {
  const { user } = useAuth()
  const mutation = useMutation<PortfolioAnalysisResponse, Error>({
    mutationKey: ["portfolio-manager", "analyze", user?.id],
    mutationFn: () => analyzePortfolio(),
  })
  return {
    report: mutation.data ?? null,
    analyze: mutation.mutate,
    isPending: mutation.isPending,
    error: mutation.error,
  }
}
