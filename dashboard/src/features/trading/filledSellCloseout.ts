export interface FilledSellOrderEvent {
  symbol: string
  side: "sell"
  quantity: number
  price: number
  orderId: string
}

export interface FilledSellCloseoutHandler {
  onOrderFilled?: (order: FilledSellOrderEvent) => void
}

/**
 * Deliver one completed SELL to every inherited Level 1–6 closeout listener.
 * The delivery is deliberately isolated per listener: one display-side Kết sổ
 * must not prevent another level's closeout from opening, and this dispatcher
 * is the sole path used by both the trade panel and Holdings exit modal.
 */
export function dispatchFilledSellCloseouts(
  order: FilledSellOrderEvent,
  ...handlers: FilledSellCloseoutHandler[]
): void {
  for (const handler of handlers) {
    try {
      handler.onOrderFilled?.(order)
    } catch (error) {
      console.error("Không thể mở một Kết sổ sau lệnh BÁN đã khớp", error)
    }
  }
}
