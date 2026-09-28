/**
 * Order mutations for the demo-trading panel.
 *
 * `POST /virtual-trading/orders` is the ONE engine: it validates the cumulative
 * `journey_plan` and persists every level's snapshot in the same transaction
 * as the order, so a filled order is never missing its learning record. The
 * response's `journey_plan_saved_levels` says which levels landed. The v2
 * engine persists the cumulative plan in the same transaction as the order;
 * this client deliberately does not POST any cap-level plan afterwards (doing
 * so would duplicate immutable learning records and could incorrectly target
 * historical Cấp 7/8 routes).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { api } from "@/lib/api"
import type { TradingAccount, TradingOrder } from "@/pages/demo-trading/types"
import { notifyOrderFilled } from "./fill-events"
import type { JourneyPlanInput } from "./journey-plan"
import type { Lop5Partial } from "./plan-math"

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
  /** The cumulative BUY commitment — `null` outside the journey and on SELL. */
  journeyPlan: JourneyPlanInput | null
  /** The level the buy was placed at (`null` = outside the journey). */
  level: number | null
  /** Cấp 3's demo capital, needed for the `% vốn` evidence row. */
  vonBanDau: number | null
  /** The AI's five-layer read at BUY time — carried to the Kết sổ, never stored here. */
  ai5Lop?: Lop5Partial | null
}

/** Wire body — `journey_plan` is omitted entirely when there is none. */
export function orderBody(input: PlaceOrderInput) {
  const body: Record<string, unknown> = {
    symbol: input.symbol.trim().toUpperCase(),
    side: input.side,
    order_type: input.method,
    quantity: input.quantity,
  }
  if (input.method === "limit") body.limit_price_vnd = Math.round(input.price)
  if (input.side === "buy" && input.journeyPlan) body.journey_plan = input.journeyPlan
  return JSON.stringify(body)
}

export function orderRejectionMessage(order: Pick<TradingOrder, "status" | "rejection_reason">): string | null {
  return order.status === "rejected" ? order.rejection_reason ?? "Lệnh bị từ chối" : null
}

/** POST /virtual-trading/account/activate — opens the 100M VND sandbox. */
export function useActivateAccount() {
  const queryClient = useQueryClient()
  return useMutation<TradingAccount, unknown, void>({
    mutationFn: () => api<TradingAccount>("/virtual-trading/account/activate", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trading"] }),
  })
}

export function usePlaceOrder() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation<TradingOrder, unknown, PlaceOrderInput>({
    mutationFn: async (input) => {
      const order = unwrap<TradingOrder>(await api<unknown>("/virtual-trading/orders", {
        method: "POST",
        body: orderBody(input),
      }))
      const rejection = orderRejectionMessage(order)
      if (rejection) throw new Error(rejection)
      // The fill is published BEFORE any bookkeeping/refetch: the Kết sổ of a
      // SELL must open off the same tick, not after a refetch round trip.
      if (order.status === "filled") {
        notifyOrderFilled({
          order,
          level: input.level,
          plan: input.journeyPlan,
          ai5Lop: input.ai5Lop ?? null,
        })
      }
      return order
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trading"] }),
        queryClient.invalidateQueries({ queryKey: ["journey"] }),
        queryClient.invalidateQueries({ queryKey: ["identity"] }),
        queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
      ])
    },
    onError: () => {
      // A rejected order changes nothing the client cached, but the journey
      // counters may have materialised a progress row server-side first.
      void queryClient.invalidateQueries({ queryKey: ["trading"] })
      void queryClient.invalidateQueries({ queryKey: ["journey", "state", user?.id] })
    },
  })
}
