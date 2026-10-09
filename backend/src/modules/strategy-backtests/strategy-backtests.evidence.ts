import {
  sideSignalsWithEvidence,
  type Bar,
  type RunResult,
  type SharedConfig,
  type Side,
  type SideSignalsEvidence,
} from '../quant/v2/index.js';
import {
  STRATEGY_BACKTEST_CONTRACT,
  type ConditionEvidence,
  type PendingOrderView,
  type StrategyRunExtras,
  type TradeEvidence,
} from './strategy-backtests.presenter.js';

const toEvidence = (item: SideSignalsEvidence | undefined): ConditionEvidence | null =>
  item ? { indicator_ids: [...item.active_indicator_ids], rules: item.rules } : null;

/**
 * Condition values/operators at the SIGNAL bar of every fill (spec §6.8: "các giá trị và dấu của
 * điều kiện tại thời điểm đó"). Computed once when the run is stored, because the bars are not
 * stored with the run; a stored run is never recomputed with newer data.
 */
export function buildRunExtras(
  config: SharedConfig,
  bars: readonly Bar[],
  result: RunResult,
): StrategyRunExtras {
  const indexByDate = new Map(bars.map((bar, index) => [bar.date, index] as const));
  const evidence: Record<Side, SideSignalsEvidence[]> = {
    buy: sideSignalsWithEvidence(config, bars, 'buy'),
    sell: sideSignalsWithEvidence(config, bars, 'sell'),
  };
  const at = (side: Side, date: string): ConditionEvidence | null => {
    const index = indexByDate.get(date);
    return index === undefined ? null : toEvidence(evidence[side][index]);
  };

  const tradeEvidence: TradeEvidence[] = result.trades.map((trade) => ({
    number: trade.number,
    entry: at('buy', trade.entry_signal_date),
    exit: at('sell', trade.exit_signal_date),
  }));

  const pending: PendingOrderView[] = result.canceled.map((order) => {
    const date = bars[order.signalIndex]?.date ?? '';
    return {
      action: order.action,
      signal_date: date,
      reason: 'end_of_range',
      note: 'Tín hiệu ở phiên cuối khoảng kiểm thử; chưa có phiên khớp trong khoảng nên lệnh chưa khớp và không tính vào giao dịch.',
      evidence: date ? at(order.action, date) : null,
    };
  });

  return {
    contract: STRATEGY_BACKTEST_CONTRACT,
    trade_evidence: tradeEvidence,
    open_position_evidence: result.open_position
      ? at('buy', result.open_position.signal_date)
      : null,
    pending_orders: pending,
  };
}

/**
 * Next-open fills that landed after a benchmark session in which the symbol had no usable bar.
 * The engine never substitutes another price for a missing session, but it does fill on the next
 * available bar; the page must say so instead of presenting it as the immediate next session.
 */
export function fillGapTrades(
  result: RunResult,
  benchmarkDates: ReadonlySet<string> | null,
): Array<{ number: number; leg: 'entry' | 'exit'; signal_date: string; fill_date: string }> {
  if (!benchmarkDates || result.snapshot.options.execution !== 'next_open') return [];
  const sessions = [...benchmarkDates].sort();
  const between = (from: string, to: string): number =>
    sessions.filter((date) => date > from && date < to).length;
  const gaps: Array<{
    number: number;
    leg: 'entry' | 'exit';
    signal_date: string;
    fill_date: string;
  }> = [];
  for (const trade of result.trades) {
    if (between(trade.entry_signal_date, trade.entry_date) > 0)
      gaps.push({
        number: trade.number,
        leg: 'entry',
        signal_date: trade.entry_signal_date,
        fill_date: trade.entry_date,
      });
    if (between(trade.exit_signal_date, trade.exit_date) > 0)
      gaps.push({
        number: trade.number,
        leg: 'exit',
        signal_date: trade.exit_signal_date,
        fill_date: trade.exit_date,
      });
  }
  const open = result.open_position;
  if (open && between(open.signal_date, open.date) > 0)
    gaps.push({
      number: result.trades.length + 1,
      leg: 'entry',
      signal_date: open.signal_date,
      fill_date: open.date,
    });
  return gaps;
}
