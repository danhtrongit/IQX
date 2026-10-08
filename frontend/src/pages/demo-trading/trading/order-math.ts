/**
 * Pure helpers for the manual order ticket. The backend stays the authority on
 * lot size, price steps, fees and balances; these only drive the form's
 * helpers and client-side guard rails.
 */

/** Board lot: every VN order quantity is a multiple of 100 shares. */
export const BOARD_LOT = 100

/** Indicative commission shown in the ticket (the server computes the real fee). */
export const FEE_RATE = 0.0015

/** Quantity helper buttons. They only fill the quantity field; they never place anything. */
export const QUICK_PERCENTS = [25, 50, 75, 100] as const

/** Round to the nearest board lot (ties round up). */
export function roundToLot(shares: number, lot: number = BOARD_LOT): number {
  if (!Number.isFinite(shares) || shares <= 0) return 0
  return Math.round(shares / lot) * lot
}

/**
 * Quantity for a percentage helper.
 * Buy: share of what the available cash can afford (fee included).
 * Sell: share of the sellable position.
 * `null` means there is nothing to base the helper on, so the field stays as typed.
 */
export function quantityForPercent(input: {
  side: "buy" | "sell"
  percent: number
  price: number
  cashAvailable: number | null
  sellable: number
}): number | null {
  const { side, percent, price, cashAvailable, sellable } = input
  if (side === "buy") {
    if (!(price > 0) || cashAvailable == null) return null
    const affordable = Math.floor(cashAvailable / (price * (1 + FEE_RATE)) / BOARD_LOT) * BOARD_LOT
    return Math.max(BOARD_LOT, roundToLot((affordable * percent) / 100))
  }
  if (sellable <= 0) return null
  return Math.max(BOARD_LOT, roundToLot((sellable * percent) / 100))
}

export type OrderCheck = { ok: true } | { ok: false; message: string }

/** The same client-side checks the ticket ran before the journey was removed. */
export function checkOrderInput(input: {
  hasQuote: boolean
  quantity: number
  method: "market" | "limit"
  limitPrice: number | null
}): OrderCheck {
  if (!input.hasQuote) return { ok: false, message: "Không có dữ liệu mã CK" }
  if (input.quantity < BOARD_LOT) return { ok: false, message: `Khối lượng tối thiểu là ${BOARD_LOT} CP` }
  if (input.quantity % BOARD_LOT !== 0) return { ok: false, message: `Khối lượng phải là bội số của ${BOARD_LOT}` }
  if (input.method === "limit" && (input.limitPrice ?? 0) <= 0) {
    return { ok: false, message: "Vui lòng nhập giá hợp lệ cho lệnh giới hạn" }
  }
  return { ok: true }
}
