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

/** Optimistic row shown until the server answers; replaced by the refetch. */
function optimisticWatchlistItem(symbol: string, existing: WatchlistItem[]): WatchlistItem {
  return {
    id: `optimistic:${symbol}`,
    symbol,
    sortOrder: existing.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1,
    createdAt: new Date().toISOString(),
  }
}

/**
 * `POST /watchlists` with an optimistic row. A failure removes only that row
 * again (never restores a stale snapshot over a concurrent change) and the error
 * reaches the caller, so nothing reports success the server did not confirm.
 */
export function useAddToWatchlist() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const key = ["watchlist", "list", user?.id] as const
  return useMutation({
    mutationFn: (symbol: string) => addToWatchlist(symbol),
    onMutate: async (symbol) => {
      const code = symbol.trim().toUpperCase()
      await queryClient.cancelQueries({ queryKey: key })
      queryClient.setQueryData<WatchlistItem[]>(key, (current) => {
        if (!current || current.some((item) => item.symbol === code)) return current
        return [...current, optimisticWatchlistItem(code, current)]
      })
      return { code }
    },
    onError: (_error, _symbol, context) => {
      if (!context) return
      queryClient.setQueryData<WatchlistItem[]>(key, (current) =>
        current?.filter((item) => !(item.symbol === context.code && item.id.startsWith("optimistic:"))),
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  })
}

/** `DELETE /watchlists/{symbol}` with optimistic removal and a targeted rollback. */
export function useRemoveFromWatchlist() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const key = ["watchlist", "list", user?.id] as const
  return useMutation({
    mutationFn: (symbol: string) => removeFromWatchlist(symbol),
    onMutate: async (symbol) => {
      const code = symbol.trim().toUpperCase()
      await queryClient.cancelQueries({ queryKey: key })
      const removed = queryClient.getQueryData<WatchlistItem[]>(key)?.find((item) => item.symbol === code) ?? null
      queryClient.setQueryData<WatchlistItem[]>(key, (current) => current?.filter((item) => item.symbol !== code))
      return { code, removed }
    },
    onError: (_error, _symbol, context) => {
      if (!context?.removed) return
      const { removed, code } = context
      queryClient.setQueryData<WatchlistItem[]>(key, (current) => {
        if (!current || current.some((item) => item.symbol === code)) return current
        return [...current, removed].sort((a, b) => a.sortOrder - b.sortOrder)
      })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
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
