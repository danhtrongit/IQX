import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import {
  tradingApi,
  type VTAccount,
  type VTOrder,
  type VTOrderResult,
  type VTPortfolio,
} from "./api"
import { tradingKeys } from "./keys"

/** GET /virtual-trading/account. `data` is `undefined` until activated. */
export function useAccount() {
  const { isAuthenticated } = useAuth()
  return useQuery<VTAccount>({
    queryKey: tradingKeys.account,
    queryFn: tradingApi.getAccount,
    enabled: isAuthenticated,
    staleTime: 10_000,
    retry: false,
  })
}

/** GET /virtual-trading/portfolio — positions + totals. */
export function usePortfolio() {
  const { isAuthenticated } = useAuth()
  return useQuery<VTPortfolio>({
    queryKey: tradingKeys.portfolio,
    queryFn: tradingApi.getPortfolio,
    enabled: isAuthenticated,
    staleTime: 10_000,
    retry: false,
  })
}

/**
 * GET /virtual-trading/orders (optional status filter).
 *
 * `enabled` (default `true`) lets a caller that only conditionally needs the
 * history skip the request entirely — same opt-out convention as
 * `useCap0Progress(enabled)`. Used by `Gbar`, which only reads order history
 * while Cấp 0 nhiệm vụ ⑥ is still unfinished.
 */
export function useOrders(status?: string, enabled = true) {
  const { isAuthenticated } = useAuth()
  const normalized = status && status !== "all" ? status : undefined
  return useQuery<VTOrder[]>({
    queryKey: tradingKeys.orders(normalized),
    queryFn: () => tradingApi.getOrders(1, 30, normalized),
    enabled: isAuthenticated && enabled,
    staleTime: 10_000,
  })
}

/** GET pending orders only. */
export function usePendingOrders() {
  const { isAuthenticated } = useAuth()
  return useQuery<VTOrder[]>({
    queryKey: tradingKeys.pendingOrders,
    queryFn: tradingApi.getPendingOrders,
    enabled: isAuthenticated,
    staleTime: 10_000,
  })
}

/** Invalidate every trading query (account, portfolio, all order lists). */
function useInvalidateTrading() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: tradingKeys.all })
}

/** POST /virtual-trading/account/activate. */
export function useActivateAccount() {
  const invalidate = useInvalidateTrading()
  return useMutation<VTAccount, unknown, void>({
    mutationFn: tradingApi.activate,
    onSuccess: invalidate,
  })
}

export interface PlaceOrderInput {
  symbol: string
  side: "buy" | "sell"
  /** "market" or "limit". */
  method: "market" | "limit"
  quantity: number
  /** Required for limit orders (VND). */
  price?: number
}

/**
 * Place a buy/sell through the sole virtual-trading engine. `afterFilled` runs
 * before cache invalidation, allowing Level 8 to persist server-derived exit
 * evidence before Holdings/Kết sổ refetches the changed position.
 */
export function usePlaceOrder(afterFilled?: (order: VTOrderResult) => Promise<void>) {
  const invalidate = useInvalidateTrading()
  return useMutation<VTOrderResult, unknown, PlaceOrderInput>({
    mutationFn: ({ symbol, side, method, quantity, price }) => {
      if (method === "market") {
        return side === "buy"
          ? tradingApi.buyMarket(symbol, quantity)
          : tradingApi.sellMarket(symbol, quantity)
      }
      return side === "buy"
        ? tradingApi.buyLimit(symbol, quantity, price ?? 0)
        : tradingApi.sellLimit(symbol, quantity, price ?? 0)
    },
    onSuccess: async (order) => {
      try {
        await afterFilled?.(order)
      } catch {
        // The exchange accepted this order. Post-fill enrichment (for example
        // Level 8 evidence) must never turn that completed trade into a failed
        // mutation that a caller might blindly submit again.
      } finally {
        await invalidate()
      }
    },
  })
}

/** POST /virtual-trading/orders/{id}/cancel; refetches trading state. */
export function useCancelOrder() {
  const invalidate = useInvalidateTrading()
  return useMutation<void, unknown, string>({
    mutationFn: (id: string) => tradingApi.cancelOrder(id),
    onSuccess: invalidate,
  })
}
