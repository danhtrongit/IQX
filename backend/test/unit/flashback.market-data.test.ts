import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { MarketDataService } from '../../src/modules/market-data/index.js';
import {
  FlashbackPriceUnitError,
  MarketFlashbackMarketData,
  flashbarDate,
  normalizeFlashbackRows,
} from '../../src/modules/flashback/flashback.market-data.js';

/**
 * Nến thật của FPT (02/2018) dò ngày 2026-10-23 qua hai nguồn (spec 22-10 FB-04): VND trả nghìn
 * đồng, VCI trả đồng, cả hai đã điều chỉnh (FPT 09/02/2018 đóng cửa 12,9 / 12.900,03).
 */
const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/flashback/fpt-2018-02-ohlcv.json', import.meta.url), 'utf8'),
) as { vnd: Record<string, unknown>[]; vci: Record<string, unknown>[] };

describe('Flashback market data (FB-04)', () => {
  it('đổi VND (nghìn đồng) và VCI (đồng) về cùng giá đồng nguyên', () => {
    const vnd = normalizeFlashbackRows('FPT', 'VND', fixture.vnd, '2018-01-01', '2018-12-31');
    const vci = normalizeFlashbackRows('FPT', 'VCI', fixture.vci, '2018-01-01', '2018-12-31');
    expect(vnd.source).toBe('VND:x1000:adjusted');
    expect(vci.source).toBe('VCI:dong:adjusted');

    const byDate = new Map(vci.bars.map((bar) => [bar.d, bar]));
    const shared = vnd.bars.filter((bar) => byDate.has(bar.d));
    expect(shared.length).toBeGreaterThanOrEqual(5);
    for (const bar of shared) {
      const other = byDate.get(bar.d)!;
      expect(Number.isInteger(bar.c)).toBe(true);
      expect(Number.isInteger(other.c)).toBe(true);
      // Hai nguồn lệch nhau không quá 1đ sau khi làm tròn.
      expect(Math.abs(bar.c - other.c)).toBeLessThanOrEqual(1);
      expect(bar.v).toBe(other.v);
    }
    // Giá điều chỉnh tham chiếu: FPT 09/02/2018 đóng cửa 12.900đ.
    expect(byDate.get('2018-02-09')?.c).toBe(12_900);
    expect(vnd.bars.find((bar) => bar.d === '2018-02-09')?.c).toBe(12_900);
  });

  it('đọc ngày phiên theo giờ Việt Nam từ giây, mili giây, chuỗi số và ISO', () => {
    expect(flashbarDate(1518134400)).toBe('2018-02-09');
    expect(flashbarDate(1518134400000)).toBe('2018-02-09');
    expect(flashbarDate('1518134400')).toBe('2018-02-09');
    expect(flashbarDate('2018-02-09T00:00:00Z')).toBe('2018-02-09');
    expect(flashbarDate(null)).toBeNull();
  });

  it('giữ nguyên điểm của chỉ số và đánh dấu nến lỗi bằng -1', () => {
    const rows = [
      { time: 1518134400, open: 1050.5, high: 1060.2, low: 1040.1, close: 1055.3, volume: 100 },
      { time: 1518393600, open: 1050, high: 1040, low: 1060, close: 1055, volume: 100 },
    ];
    const series = normalizeFlashbackRows('VNINDEX', 'VCI', rows, '2018-01-01', '2018-12-31');
    expect(series.source).toBe('VCI:points:adjusted');
    expect(series.bars[0]?.c).toBe(1055.3);
    expect(series.bars[1]?.c).toBe(-1);
  });

  it('báo lỗi đơn vị khi giá sau chuẩn hoá ngoài khoảng 1.000đ-1.000.000đ', () => {
    // VCI đột nhiên trả nghìn đồng: trung vị 12,9đ.
    const rows = fixture.vnd;
    expect(() => normalizeFlashbackRows('FPT', 'VCI', rows, '2018-01-01', '2018-12-31')).toThrow(
      FlashbackPriceUnitError,
    );
    // Nguồn lạ: đoán theo độ lớn và nhân 1.000.
    const guessed = normalizeFlashbackRows('FPT', 'KBS', rows, '2018-01-01', '2018-12-31');
    expect(guessed.source).toBe('KBS:x1000:adjusted');
    expect(guessed.bars.find((bar) => bar.d === '2018-02-09')?.c).toBe(12_900);
  });

  it('gọi VCI trước, phân trang lùi; VCI lỗi thì dùng VND nhân 1.000', async () => {
    const calls: { source: string; start: string; end: string }[] = [];
    const market = {
      ohlcv: async (
        _symbol: string,
        options: { source: string; start: string; end: string },
      ): Promise<{ data: unknown[] }> => {
        calls.push(options);
        if (options.source === 'VCI') {
          // Trang 1 chỉ có 3 nến cuối, trang 2 có phần còn lại.
          return { data: calls.length === 1 ? fixture.vci.slice(3) : fixture.vci.slice(0, 3) };
        }
        return { data: fixture.vnd };
      },
    } as unknown as MarketDataService;
    const port = new MarketFlashbackMarketData(market);
    const series = await port.dailySeries('FPT', '2018-02-06', '2018-02-13');
    expect(series.source).toBe('VCI:dong:adjusted');
    expect(series.bars.map((bar) => bar.d)).toEqual([
      '2018-02-06',
      '2018-02-07',
      '2018-02-08',
      '2018-02-09',
      '2018-02-12',
      '2018-02-13',
    ]);
    expect(calls.every((call) => call.source === 'VCI')).toBe(true);
    expect(calls.length).toBeGreaterThanOrEqual(2);

    const failing = {
      ohlcv: async (_symbol: string, options: { source: string }) => {
        if (options.source === 'VCI') throw new Error('VCI down');
        return { data: fixture.vnd };
      },
    } as unknown as MarketDataService;
    const fallback = await new MarketFlashbackMarketData(failing).dailySeries(
      'FPT',
      '2018-01-01',
      '2018-12-31',
    );
    expect(fallback.source).toBe('VND:x1000:adjusted');
    expect(fallback.bars.find((bar) => bar.d === '2018-02-09')?.c).toBe(12_900);
  });
});
