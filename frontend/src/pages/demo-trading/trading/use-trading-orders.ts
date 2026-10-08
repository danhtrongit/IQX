/**
 * Order mutations for the demo-trading ticket.
 *
 * `POST /virtual-trading/orders` is the one engine: it validates the order and
 * answers with the persisted order, including a persisted `rejected` order.
 * The body carries only what the manual ticket collects (symbol, side, type,
 * quantity and, for a limit order, its price).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { TradingAccount, TradingOrder } from "@/pages/demo-trading/types"

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

export type PlaceOrderInput = {
  symbol: string
  side: "buy" | "sell"
  method: "market" | "limit"
  quantity: number
  /** Required for a LO order (VND). */
  price: number
}

/** Wire body. The limit price is omitted for a market order. */
export function orderBody(input: PlaceOrderInput) {
  const body: Record<string, unknown> = {
    symbol: input.symbol.trim().toUpperCase(),
    side: input.side,
    order_type: input.method,
    quantity: input.quantity,
  }
  if (input.method === "limit") body.limit_price_vnd = Math.round(input.price)
  return JSON.stringify(body)
}

export function orderRejectionMessage(order: Pick<TradingOrder, "status" | "rejection_reason">): string | null {
  return order.status === "rejected" ? order.rejection_reason ?? "Lệnh bị từ chối" : null
}

/** POST /virtual-trading/account/activate — fallback for an account the workspace has not created yet. */
export function useActivateAccount() {
  const queryClient = useQueryClient()
  return useMutation<TradingAccount, unknown, void>({
    mutationFn: () => api<TradingAccount>("/virtual-trading/account/activate", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trading"] }),
  })
}

export function usePlaceOrder() {
  const queryClient = useQueryClient()
  return useMutation<TradingOrder, unknown, PlaceOrderInput>({
    mutationFn: async (input) => {
      const order = unwrap<TradingOrder>(await api<unknown>("/virtual-trading/orders", {
        method: "POST",
        body: orderBody(input),
      }))
      const rejection = orderRejectionMessage(order)
      if (rejection) throw new Error(rejection)
      return order
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["trading"] })
    },
    onError: () => {
      // A rejected order is persisted server-side, so the order book changed.
      void queryClient.invalidateQueries({ queryKey: ["trading"] })
    },
  })
}
