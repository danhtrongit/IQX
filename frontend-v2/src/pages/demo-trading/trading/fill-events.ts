/**
 * One tiny in-process bus for FILLED virtual orders.
 *
 * The order panel and the globally-mounted trading runtime are siblings in the
 * tree (Main mounts the runtime next to the page, the panel lives inside a
 * sidebar), and a Kết sổ must open from a SELL fill however it was placed.
 * Rather than duplicating the submit pipeline, the panel publishes here and the
 * runtime reacts.
 *
 * The event carries the level + the plan the order was placed WITH, so the
 * Kết sổ can reconcile the buy decision without extra requests. It is
 * deliberately not the source of truth: after a reload the bus is empty, which
 * is why the runtime also recovers closed round trips from server order history
 * and the per-level plan routes.
 *
 * Delivery is isolated per listener — one failing listener must never stop the
 * others, the same "one broken bookkeeping must not swallow the chain" rule the
 * legacy panel applied to its per-level buses.
 */
import type { TradingOrder } from "@/pages/demo-trading/types"
import type { JourneyPlanInput } from "./journey-plan"
import type { Lop5Partial } from "./plan-math"

export type FilledOrderEvent = {
  order: TradingOrder
  /** Journey level the order was placed at (`null` = outside the journey). */
  level: number | null
  /** What the buy actually committed to (null on SELL / outside the journey). */
  plan: JourneyPlanInput | null
  /** The AI's own five-layer read at BUY time, when it was available. */
  ai5Lop: Lop5Partial | null
}

type Listener = (event: FilledOrderEvent) => void

const listeners = new Set<Listener>()

/** Subscribe; returns the unsubscribe function (React effect-friendly). */
export function onOrderFilled(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function notifyOrderFilled(event: FilledOrderEvent): void {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch (error) {
      console.error("Không xử lý được sự kiện lệnh đã khớp", error)
    }
  }
}
