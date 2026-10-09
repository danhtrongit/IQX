/**
 * Pure helpers for the order ticket (port of frontend trading/order-math.ts). The backend stays the
 * authority on lot size, price steps, fees and balances.
 */
import type { OrderSide, OrderType } from './types';

export const BOARD_LOT = 100;
export const FEE_RATE = 0.0015;
export const QUICK_PERCENTS = [25, 50, 75, 100] as const;

export function roundToLot(shares: number, lot: number = BOARD_LOT): number {
  if (!Number.isFinite(shares) || shares <= 0) return 0;
  return Math.round(shares / lot) * lot;
}

/** Quantity for a quick-fill percentage; `null` when there is nothing to base it on. */
export function quantityForPercent(input: {
  side: OrderSide;
  percent: number;
  price: number | null;
  cashAvailable: number | null;
  sellable: number;
}): number | null {
  const { side, percent, price, cashAvailable, sellable } = input;
  if (side === 'buy') {
    if (price === null || !(price > 0) || cashAvailable === null) return null;
    const affordable = Math.floor(cashAvailable / (price * (1 + FEE_RATE)) / BOARD_LOT) * BOARD_LOT;
    return Math.max(BOARD_LOT, roundToLot((affordable * percent) / 100));
  }
  if (sellable <= 0) return null;
  return Math.max(BOARD_LOT, roundToLot((sellable * percent) / 100));
}

export type OrderCheck = { ok: true } | { ok: false; message: string };

export function checkOrderInput(input: { hasQuote: boolean; quantity: number; method: OrderType; limitPrice: number | null }): OrderCheck {
  if (!input.hasQuote) return { ok: false, message: 'Không có dữ liệu mã CK' };
  if (!Number.isFinite(input.quantity) || input.quantity < BOARD_LOT) {
    return { ok: false, message: `Khối lượng tối thiểu là ${BOARD_LOT} CP` };
  }
  if (input.quantity % BOARD_LOT !== 0) return { ok: false, message: `Khối lượng phải là bội số của ${BOARD_LOT}` };
  if (input.method === 'limit' && !((input.limitPrice ?? 0) > 0)) {
    return { ok: false, message: 'Vui lòng nhập giá hợp lệ cho lệnh giới hạn' };
  }
  return { ok: true };
}

/** Indicative gross / fee / total for the review step (sell total is net of fee; tax is server-side). */
export function estimateOrder(input: { side: OrderSide; quantity: number; price: number | null }) {
  if (input.price === null || !(input.price > 0) || !(input.quantity > 0)) return null;
  const gross = input.quantity * input.price;
  const fee = Math.round(gross * FEE_RATE);
  return {
    gross,
    fee,
    total: input.side === 'buy' ? gross + fee : gross - fee,
  };
}

/** Parse a user-typed integer ("1.200", "1200", "") → number | null. */
export function parseIntInput(text: string): number | null {
  const digits = text.replace(/[^\d]/g, '');
  if (digits === '') return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}
