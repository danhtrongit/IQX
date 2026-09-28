import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { api, ApiError } from "@/lib/api"
import type { OrderPage, TradingAccount, TradingPortfolio } from "@/pages/demo-trading/types"

/** v2 journey/identity endpoints may be `{data, meta}`, while trading DTOs
 * themselves are direct objects. This unwraps only that explicit envelope and
 * never synthesizes missing fields in the DTO. */
export function unwrapV2Data<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

export function useTradingAccount() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["trading", "account", user?.id],
    enabled: !!user,
    queryFn: async ({ signal }) => {
      try {
        return unwrapV2Data<TradingAccount>(await api<unknown>("/virtual-trading/account", { signal }))
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
  })
}

export function useTradingPortfolio() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["trading", "portfolio", user?.id],
    enabled: !!user,
    queryFn: async ({ signal }) => {
      try {
        return unwrapV2Data<TradingPortfolio>(await api<unknown>("/virtual-trading/portfolio", { signal }))
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
  })
}

export function useTradingOrders(filters: { status?: string; side?: string; page?: number; allPages?: boolean } = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["trading", "orders", user?.id, filters],
    enabled: !!user,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ page: String(filters.page ?? 1), page_size: "50" })
      if (filters.status) params.set("status", filters.status)
      if (filters.side) params.set("side", filters.side)
      const first = unwrapV2Data<OrderPage>(await api<unknown>(`/virtual-trading/orders?${params}`, { signal }))
      if (!filters.allPages || first.orders.length >= first.total) return first
      const orders = new Map(first.orders.map(order => [order.id, order]))
      let page = first
      for (let number = (filters.page ?? 1) + 1; orders.size < page.total; number++) {
        params.set("page", String(number))
        page = unwrapV2Data<OrderPage>(await api<unknown>(`/virtual-trading/orders?${params}`, { signal }))
        const before = orders.size
        for (const order of page.orders) orders.set(order.id, order)
        if (orders.size === before) throw new Error("Lịch sử lệnh vừa thay đổi. Vui lòng tải lại để đối chiếu đầy đủ.")
      }
      return { ...first, total: page.total, orders: [...orders.values()] }
    },
  })
}
