import { describe, expect, it } from 'vitest';

import type { ScreenerRow } from '../../src/modules/screener/screener.schemas.js';
import { SCREENER_SORT_KEY_PATTERN, sortRows } from '../../src/modules/screener/screener.sort.js';

/**
 * Bộ lọc 4.0 §4.3: server-side sort of the WHOLE stored result. Blank / non-ok cells last in both
 * directions, ties by Mã A→Z, so the order is total and identical for every page.
 */

const metric = (value: number | null, status: 'ok' | 'missing' = 'ok') =>
  ({ metric_id: 'roe', status, value }) as unknown as ScreenerRow['metrics'][string];

const tech = (sortValue: number | null, status: 'ok' | 'missing' = 'ok') =>
  ({ key: 'rsi.level', status, sort_value: sortValue }) as unknown as ScreenerRow['technical'][string];

const row = (symbol: string, patch: Partial<ScreenerRow> = {}): ScreenerRow => ({
  symbol,
  name: `Công ty ${symbol}`,
  sector: null,
  exchange: 'HOSE',
  group: 'thuong',
  passed: true,
  market: { price: null, change_pct: null, market_cap: null, avg_value: null },
  technical: {},
  metrics: {},
  ...patch,
});

const order = (rows: ScreenerRow[]) => rows.map((item) => item.symbol);

describe('sortRows (spec §4.3)', () => {
  it('numbers: descending puts the largest first, blanks always last, ties by Mã A→Z', () => {
    const rows = [
      row('CCC', { market: { price: 20, change_pct: null, market_cap: null, avg_value: null } }),
      row('AAA', { market: { price: null, change_pct: null, market_cap: null, avg_value: null } }),
      row('DDD', { market: { price: 20, change_pct: null, market_cap: null, avg_value: null } }),
      row('BBB', { market: { price: 35.5, change_pct: null, market_cap: null, avg_value: null } }),
    ];
    expect(order(sortRows(rows, 'price', 'desc'))).toEqual(['BBB', 'CCC', 'DDD', 'AAA']);
    // Ascending: smallest first; the blank is STILL last and the tie stays A→Z.
    expect(order(sortRows(rows, 'price', 'asc'))).toEqual(['CCC', 'DDD', 'BBB', 'AAA']);
  });

  it('text: Mã, Tên and Sàn sort alphabetically; Vietnamese letters use the vi collation', () => {
    const rows = [
      row('CCC', { name: 'Đầu tư X', exchange: 'UPCOM' }),
      row('AAA', { name: 'Ánh Dương', exchange: 'HOSE' }),
      row('BBB', { name: 'Bình An', exchange: null }),
    ];
    expect(order(sortRows(rows, 'symbol', 'desc'))).toEqual(['CCC', 'BBB', 'AAA']);
    expect(order(sortRows(rows, 'name', 'asc'))).toEqual(['AAA', 'BBB', 'CCC']);
    // No exchange is blank: last, asc or desc.
    expect(order(sortRows(rows, 'exchange', 'asc'))).toEqual(['AAA', 'CCC', 'BBB']);
    expect(order(sortRows(rows, 'exchange', 'desc'))).toEqual(['CCC', 'AAA', 'BBB']);
  });

  it('Ngành follows the display order Thường, Ngân hàng, Chứng khoán, Bảo hiểm, not the alphabet of the codes', () => {
    const rows = [
      row('AAA', { group: 'bh' }),
      row('BBB', { group: 'thuong' }),
      row('CCC', { group: 'ck' }),
      row('DDD', { group: 'nh' }),
      row('EEE', { group: null }),
    ];
    expect(order(sortRows(rows, 'group', 'asc'))).toEqual(['BBB', 'DDD', 'CCC', 'AAA', 'EEE']);
    expect(order(sortRows(rows, 'group', 'desc'))).toEqual(['AAA', 'CCC', 'DDD', 'BBB', 'EEE']);
  });

  it('fundamental and technical columns read only ok cells', () => {
    const rows = [
      row('AAA', { metrics: { roe: metric(0.12) }, technical: { 'rsi.level': tech(63.7) } }),
      row('BBB', { metrics: { roe: metric(0.3, 'missing') }, technical: { 'rsi.level': tech(40) } }),
      row('CCC', { metrics: { roe: metric(0.25) }, technical: { 'rsi.level': tech(null, 'missing') } }),
      row('DDD', { metrics: {}, technical: {} }),
    ];
    // The missing ROE of BBB (0.3) must not outrank the ok values.
    expect(order(sortRows(rows, 'metric:roe', 'desc'))).toEqual(['CCC', 'AAA', 'BBB', 'DDD']);
    expect(order(sortRows(rows, 'metric:roe', 'asc'))).toEqual(['AAA', 'CCC', 'BBB', 'DDD']);
    expect(order(sortRows(rows, 'tech:rsi.level', 'desc'))).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
    expect(order(sortRows(rows, 'tech:rsi.level', 'asc'))).toEqual(['BBB', 'AAA', 'CCC', 'DDD']);
  });

  it('is stable and total: the same input in any order gives the same output; the input is not modified', () => {
    const rows = ['E', 'B', 'D', 'A', 'C'].map((letter) =>
      row(`${letter}${letter}${letter}`, {
        market: { price: letter === 'A' || letter === 'B' ? 10 : 12, change_pct: null, market_cap: null, avg_value: null },
      }),
    );
    const copy = [...rows];
    const first = order(sortRows(rows, 'price', 'desc'));
    expect(first).toEqual(['CCC', 'DDD', 'EEE', 'AAA', 'BBB']);
    expect(order(sortRows([...rows].reverse(), 'price', 'desc'))).toEqual(first);
    expect(rows).toEqual(copy);
  });

  it('no key, an unknown key or a malformed key falls back to Mã (the direction is still honoured)', () => {
    const rows = [row('BBB'), row('AAA'), row('CCC')];
    expect(order(sortRows(rows, undefined))).toEqual(['AAA', 'BBB', 'CCC']);
    expect(order(sortRows(rows, 'nonsense', 'desc'))).toEqual(['CCC', 'BBB', 'AAA']);
    expect(order(sortRows(rows, 'metric:ROE; drop table', 'asc'))).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('every documented key matches the pattern and bad ones do not', () => {
    for (const key of [
      'symbol',
      'name',
      'exchange',
      'group',
      'price',
      'change_pct',
      'market_cap',
      'avg_value',
      'metric:roe',
      'metric:revenue_yoy',
      'tech:rsi.level',
      'tech:macd.cross',
      'tech:volume.r1',
      'tech:rsi',
    ])
      expect(SCREENER_SORT_KEY_PATTERN.test(key), key).toBe(true);
    for (const key of ['', 'Symbol', 'metric:', 'tech:', 'metric:a b', 'tech:rsi.level.x', '__proto__', 'price '])
      expect(SCREENER_SORT_KEY_PATTERN.test(key), key).toBe(false);
  });

  it('a result missing the new blocks (a row stored before 4.0) sorts as blank, never throws', () => {
    const legacy = { symbol: 'OLD', name: null, sector: null, exchange: null, passed: true, metrics: {} } as unknown as ScreenerRow;
    const rows = [legacy, row('AAA', { market: { price: 1, change_pct: null, market_cap: null, avg_value: null } })];
    expect(order(sortRows(rows, 'price', 'asc'))).toEqual(['AAA', 'OLD']);
    expect(order(sortRows(rows, 'tech:rsi.level', 'asc'))).toEqual(['AAA', 'OLD']);
    expect(order(sortRows(rows, 'group', 'asc'))).toEqual(['AAA', 'OLD']);
  });
});
