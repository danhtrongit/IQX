import { describe, expect, it } from 'vitest';

import { COMMENT_RULE_IDS, buildComment } from '../../src/modules/practice/practice.comments.js';
import type { PracticeKpis, PracticeTrade } from '../../src/modules/practice/practice.types.js';

const VERSION = 'practice-comments-v1';

const kpis = (patch: Partial<PracticeKpis> = {}): PracticeKpis => ({
  capital_initial: 100_000_000,
  cash_end: 100_000_000,
  open_position_value: 0,
  nav_end: 100_000_000,
  total_return: 0,
  valuation: 'ok',
  buy_count: 0,
  closed_trade_count: 0,
  open_position: false,
  insufficient_cash_buys: 0,
  ...patch,
});

const closed = (reason: 'indicator' | 'max_holding'): PracticeTrade =>
  ({ status: 'closed', sell: { reason } }) as unknown as PracticeTrade;

const comment = (k: PracticeKpis, trades: PracticeTrade[] = []) =>
  buildComment({ kpis: k, trades, indicatorName: 'RSI', version: VERSION });

describe('practice comments (reference commentFor)', () => {
  it('1: no buy and a missed lot -> insufficient cash, no position opened', () => {
    const result = comment(kpis({ insufficient_cash_buys: 2 }));
    expect(result).toMatchObject({
      status: 'ok',
      rule_id: 'no_buy_insufficient_cash',
      version: VERSION,
    });
    expect(result.text).toBe(
      'Điều kiện Mua đã xuất hiện, nhưng tiền sau phí chưa đủ một lô. Không có vị thế được mở.',
    );
  });

  it('2: no buy otherwise -> the chosen condition never produced a buy', () => {
    const result = comment(kpis());
    expect(result.rule_id).toBe('no_buy_condition_not_met');
    expect(result.text).toBe('Điều kiện đã chọn chưa tạo lần Mua nào trong giai đoạn này.');
  });

  it('3: a buy, no closed round trip, still open -> unrealized wording', () => {
    const result = comment(
      kpis({ buy_count: 1, open_position: true, nav_end: 99_000_000, total_return: -0.01 }),
    );
    expect(result.rule_id).toBe('buy_open_without_sell');
    expect(result.text).toBe(
      'Đã có Mua nhưng chưa có Bán. Tổng lợi nhuận bao gồm lãi/lỗ tạm tính của vị thế đang giữ.',
    );
  });

  it('4: other cases -> direction vs the initial capital, buys and sells', () => {
    const higher = comment(kpis({ buy_count: 3, closed_trade_count: 3, nav_end: 105_000_000 }), [
      closed('indicator'),
      closed('indicator'),
      closed('indicator'),
    ]);
    expect(higher.rule_id).toBe('portfolio_result');
    expect(higher.text).toBe(
      'Danh mục kết thúc cao hơn vốn ban đầu. 3 lần Mua, 3 giao dịch đã bán.',
    );
    const lower = comment(kpis({ buy_count: 1, closed_trade_count: 1, nav_end: 90_000_000 }), [
      closed('indicator'),
    ]);
    expect(lower.text).toBe(
      'Danh mục kết thúc thấp hơn vốn ban đầu. 1 lần Mua, 1 giao dịch đã bán.',
    );
    const flat = comment(kpis({ buy_count: 1, closed_trade_count: 1 }), [closed('indicator')]);
    expect(flat.text).toBe(
      'Giá trị danh mục cuối kỳ xấp xỉ vốn ban đầu. 1 lần Mua, 1 giao dịch đã bán.',
    );
    expect(flat.values.direction).toBe('flat');
  });

  it('adds the time-exit and open-position notes and stores the interpolated numbers', () => {
    const result = comment(
      kpis({ buy_count: 4, closed_trade_count: 3, open_position: true, nav_end: 101_000_000 }),
      [closed('max_holding'), closed('indicator'), closed('max_holding')],
    );
    expect(result.text).toBe(
      'Danh mục kết thúc cao hơn vốn ban đầu. 4 lần Mua, 3 giao dịch đã bán. 2 giao dịch được đóng do hết thời gian giữ, không phải do điều kiện RSI. Kết quả còn bao gồm một vị thế chưa bán.',
    );
    expect(result.values).toEqual({
      indicator_name: 'RSI',
      buy_count: 4,
      closed_trade_count: 3,
      time_exit_count: 2,
      open_position: true,
      direction: 'higher',
    });
  });

  it('decides the direction on exact NAV, not on a rounded percentage', () => {
    const tiny = comment(kpis({ buy_count: 1, closed_trade_count: 1, nav_end: 100_000_001 }), [
      closed('indicator'),
    ]);
    expect(tiny.values.direction).toBe('higher');
  });

  it('never turns a missing valuation into a strategy comment', () => {
    const result = comment(
      kpis({
        buy_count: 1,
        open_position: true,
        nav_end: null,
        total_return: null,
        valuation: 'missing',
      }),
    );
    expect(result).toMatchObject({
      status: 'unavailable',
      rule_id: 'unavailable_missing_valuation',
      text: null,
    });
    expect(COMMENT_RULE_IDS).not.toContain(result.rule_id);
  });
});
