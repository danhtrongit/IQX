import type { PracticeKpis, PracticeTrade } from './practice.types.js';

/**
 * Deterministic, pre-written comments (SPEC §11.5; port of the reference `commentFor`).
 * No AI, no pass/fail score. Rule id + version and every interpolated number are stored with the
 * run so an old result is always re-read with the text it was produced with.
 */

export type PracticeCommentValues = {
  indicator_name: string;
  buy_count: number;
  closed_trade_count: number;
  time_exit_count: number;
  open_position: boolean;
  /** Exact comparison of NAV with the starting capital (never of a rounded percentage). */
  direction: 'higher' | 'lower' | 'flat' | null;
};

export type PracticeComment =
  | {
      status: 'ok';
      rule_id: string;
      version: string;
      text: string;
      values: PracticeCommentValues;
    }
  | {
      /** Missing valuation / engine problem: never rendered as a strategy comment. */
      status: 'unavailable';
      rule_id: 'unavailable_missing_valuation';
      version: string;
      text: null;
      values: PracticeCommentValues;
    };

export const COMMENT_RULE_IDS = [
  'no_buy_insufficient_cash',
  'no_buy_condition_not_met',
  'buy_open_without_sell',
  'portfolio_result',
] as const;

export function buildComment(input: {
  kpis: PracticeKpis;
  trades: readonly PracticeTrade[];
  indicatorName: string;
  version: string;
}): PracticeComment {
  const { kpis, indicatorName, version } = input;
  const timeExits = input.trades.filter(
    (trade) => trade.status === 'closed' && trade.sell?.reason === 'max_holding',
  ).length;
  const values: PracticeCommentValues = {
    indicator_name: indicatorName,
    buy_count: kpis.buy_count,
    closed_trade_count: kpis.closed_trade_count,
    time_exit_count: timeExits,
    open_position: kpis.open_position,
    direction: null,
  };
  if (kpis.valuation !== 'ok' || kpis.nav_end === null) {
    return {
      status: 'unavailable',
      rule_id: 'unavailable_missing_valuation',
      version,
      text: null,
      values,
    };
  }
  const ok = (
    rule_id: string,
    text: string,
    extra: Partial<PracticeCommentValues> = {},
  ): PracticeComment => ({
    status: 'ok',
    rule_id,
    version,
    text,
    values: { ...values, ...extra },
  });

  if (kpis.buy_count === 0) {
    return kpis.insufficient_cash_buys > 0
      ? ok(
          'no_buy_insufficient_cash',
          'Điều kiện Mua đã xuất hiện, nhưng tiền sau phí chưa đủ một lô. Không có vị thế được mở.',
        )
      : ok(
          'no_buy_condition_not_met',
          'Điều kiện đã chọn chưa tạo lần Mua nào trong giai đoạn này.',
        );
  }
  if (kpis.closed_trade_count === 0 && kpis.open_position) {
    return ok(
      'buy_open_without_sell',
      'Đã có Mua nhưng chưa có Bán. Tổng lợi nhuận bao gồm lãi/lỗ tạm tính của vị thế đang giữ.',
    );
  }
  const direction =
    kpis.nav_end > kpis.capital_initial
      ? 'higher'
      : kpis.nav_end < kpis.capital_initial
        ? 'lower'
        : 'flat';
  let text =
    direction === 'higher'
      ? 'Danh mục kết thúc cao hơn vốn ban đầu.'
      : direction === 'lower'
        ? 'Danh mục kết thúc thấp hơn vốn ban đầu.'
        : 'Giá trị danh mục cuối kỳ xấp xỉ vốn ban đầu.';
  text += ` ${kpis.buy_count} lần Mua, ${kpis.closed_trade_count} giao dịch đã bán.`;
  if (timeExits > 0) {
    text += ` ${timeExits} giao dịch được đóng do hết thời gian giữ, không phải do điều kiện ${indicatorName}.`;
  }
  if (kpis.open_position) text += ' Kết quả còn bao gồm một vị thế chưa bán.';
  return ok('portfolio_result', text, { direction });
}
