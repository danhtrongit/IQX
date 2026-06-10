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

/** GET /virtual-trading/orders (optional status filter). */
export function useOrders(status?: string) {
  const { isAuthenticated } = useAuth()
  const normalized = status && status !== "all" ? status : undefined
  return useQuery<VTOrder[]>({
    queryKey: tradingKeys.orders(normalized),
    queryFn: () => tradingApi.getOrders(1, 30, normalized),
    enabled: isAuthenticated,
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

/** Place a buy/sell, market/limit order; refetches account + portfolio + orders. */
export function usePlaceOrder() {
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
    onSuccess: invalidate,
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
