/**
 * Dụng cụ cho test mẫu nến tính sẵn: đổi chuỗi nến mô phỏng của Candle Dojo thành nến của kho
 * Flashback (kèm ngày), và dựng giá gốc cho nguồn dữ liệu giả.
 */

import type { CdBar } from '../../../src/modules/candle-dojo/shared/detector.js';
import type { DatasetBar } from '../../../src/modules/flashback/flashback-dataset.logic.js';
import type { DatasetRawPrice } from '../../../src/modules/flashback/flashback-dataset.source.js';
import type { PatternSeriesBar } from '../../../src/modules/flashback/flashback-patterns.repository.js';
import { weekdaysFrom } from './flashback-dataset-fixtures.js';

export const PATTERN_START = '2014-01-06';

/** Ngày giao dịch (thứ Hai-thứ Sáu) cho `count` phiên. */
export const sessionDates = (count: number, from = PATTERN_START): string[] => weekdaysFrom(from, count);

/** Nến kho đã điều chỉnh từ chuỗi nến mô phỏng: khối lượng lớn, không nến lỗi, không khoảng nghỉ. */
export function datasetBarsOf(
  bars: readonly CdBar[],
  overrides: Record<number, Partial<DatasetBar>> = {},
  from = PATTERN_START,
): DatasetBar[] {
  const dates = sessionDates(bars.length, from);
  return bars.map((bar, idx) => ({
    idx,
    date: dates[idx]!,
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: 1_000_000,
    valueRaw: 50_000_000_000,
    gapBefore: 0,
    bad: 0,
    ret: idx === 0 ? 0 : bar.c / bars[idx - 1]!.c - 1,
    ...overrides[idx],
  }));
}

export function seriesOf(
  bars: readonly CdBar[],
  overrides: Record<number, Partial<DatasetBar>> = {},
  from = PATTERN_START,
): PatternSeriesBar[] {
  return datasetBarsOf(bars, overrides, from).map((bar) => ({
    idx: bar.idx,
    date: bar.date,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    gapBefore: bar.gapBefore,
    bad: bar.bad,
  }));
}

/** Giá gốc của nguồn giả: bằng giá đã điều chỉnh, tham chiếu = đóng cửa phiên trước (phiên đầu: chính nó). */
export function rawPricesOf(
  bars: readonly CdBar[],
  from = PATTERN_START,
  skip: ReadonlySet<number> = new Set(),
): Map<string, DatasetRawPrice> {
  const dates = sessionDates(bars.length, from);
  const out = new Map<string, DatasetRawPrice>();
  bars.forEach((bar, idx) => {
    if (skip.has(idx)) return;
    out.set(dates[idx]!, {
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      ref: idx === 0 ? bar.c : bars[idx - 1]!.c,
    });
  });
  return out;
}
