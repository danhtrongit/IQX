import type { Bar, RunOptions } from '../quant/v2/index.js';

/** One session of "Mua và giữ": cash left + shares × close of that session. */
export type BuyHoldPoint = { date: string; value: number; return_pct: number };

/**
 * "Mua và giữ {mã}" of a run (spec Tab IQX §3.5), stored in the run snapshot. Same symbol, range,
 * capital, fill mode, lot, buy fee and price series (adjusted or not) as the strategy.
 */
export type BuyAndHold = {
  basis: 'iqx-buy-hold-1.0';
  /** Fill session: same_close → close of the first session; next_open → open of the second one. */
  entry_date: string | null;
  entry_price: number | null;
  qty: number;
  buy_fee: number;
  cash_left: number;
  capital: number;
  end_value: number;
  /** % change of the holdings value (percentage points), sell fee and tax NOT deducted (Tạm tính). */
  return_pct: number;
  /** Same sessions as the strategy curve, from the first session of the range. */
  curve: BuyHoldPoint[];
};

type BuyHoldOptions = Pick<
  RunOptions,
  'capital' | 'fee_buy' | 'lot' | 'execution' | 'start' | 'end'
>;

/**
 * Buy once at the first valid fill of the range (the most shares the lot and the buy fee allow,
 * left-over cash kept), never sell. `next_open` cannot fill on the first session's open: like the
 * strategy, the earliest decision is at its close, filled at the next session's open. The end value
 * has no sell fee or tax, like the "Tạm tính" of an open strategy position.
 */
export function buyAndHold(bars: readonly Bar[], options: BuyHoldOptions): BuyAndHold {
  const range = bars.filter((bar) => bar.date >= options.start && bar.date <= options.end);
  const fillIndex = options.execution === 'same_close' ? 0 : 1;
  const fillBar = range[fillIndex];
  const price = fillBar
    ? options.execution === 'same_close'
      ? fillBar.close
      : fillBar.open
    : null;
  let qty = 0;
  let fee = 0;
  let cash = options.capital;
  if (price !== null && price > 0) {
    qty = Math.floor(options.capital / (price * (1 + options.fee_buy) * options.lot)) * options.lot;
    if (qty >= options.lot) {
      const gross = qty * price;
      fee = gross * options.fee_buy;
      cash = options.capital - gross - fee;
    } else qty = 0;
  }
  const curve = range.map((bar, index): BuyHoldPoint => {
    const held = qty > 0 && index >= fillIndex ? qty : 0;
    const value = held > 0 ? cash + held * bar.close : options.capital;
    return { date: bar.date, value, return_pct: (value / options.capital - 1) * 100 };
  });
  const last = curve[curve.length - 1];
  const endValue = last?.value ?? options.capital;
  return {
    basis: 'iqx-buy-hold-1.0',
    entry_date: qty > 0 && fillBar ? fillBar.date : null,
    entry_price: qty > 0 ? price : null,
    qty,
    buy_fee: fee,
    cash_left: qty > 0 ? cash : options.capital,
    capital: options.capital,
    end_value: endValue,
    return_pct: (endValue / options.capital - 1) * 100,
    curve,
  };
}
