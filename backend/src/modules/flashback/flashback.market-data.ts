/**
 * Nguồn nến ngày cho Flashback.
 *
 * Dùng đúng `MarketDataService` của repo (VND dchart trước, VCI fallback). VCI giới hạn
 * `countBack = 1000` nên phải gọi lùi từng trang để lấy được lịch sử dài hơn 1000 phiên.
 */

import { Injectable } from '@nestjs/common';

import { MarketDataService } from '../market-data/index.js';
import type { FlashbackBar } from './flashback.types.js';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Ngày phiên (theo giờ Việt Nam) của một dòng nến. */
export function flashbarDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value))
    return new Date(value * 1000 + VN_OFFSET_MS).toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d+$/.test(value))
    return new Date(Number(value) * 1000 + VN_OFFSET_MS).toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Cổng dữ liệu nến ngày của Flashback (để test thay bằng bản giả). */
export interface FlashbackMarketDataPort {
  /** Nến ngày của một mã trong khoảng `[from, to]` (ngày theo định dạng YYYY-MM-DD). */
  dailyBars(symbol: string, from: string, to: string): Promise<FlashbackBar[]>;
}

function previousDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

/** Số trang gọi lùi tối đa khi lấy lịch sử dài (VCI chỉ trả 1000 nến mỗi lần gọi). */
const MAX_HISTORY_PAGES = 8;

@Injectable()
export class MarketFlashbackMarketData implements FlashbackMarketDataPort {
  constructor(private readonly market: MarketDataService) {}

  async dailyBars(symbol: string, from: string, to: string): Promise<FlashbackBar[]> {
    const byDate = new Map<string, FlashbackBar>();
    let end = to;
    for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
      if (end < from) break;
      const response = await this.market.ohlcv(symbol, { interval: '1D', start: from, end });
      const rows = Array.isArray(response.data) ? response.data : [];
      let earliest: string | null = null;
      for (const raw of rows) {
        const row = (raw ?? {}) as Record<string, unknown>;
        const date = flashbarDate(row.time);
        const open = finite(row.open);
        const high = finite(row.high);
        const low = finite(row.low);
        const close = finite(row.close);
        const volume = finite(row.volume);
        // Không dựng nến giả: nến thiếu hoặc không hợp lệ thì bỏ qua.
        if (
          !date ||
          date > to ||
          open === null ||
          high === null ||
          low === null ||
          close === null ||
          volume === null ||
          open <= 0 ||
          high <= 0 ||
          low <= 0 ||
          close <= 0 ||
          volume < 0 ||
          high < Math.max(open, close) ||
          low > Math.min(open, close)
        ) {
          continue;
        }
        byDate.set(date, { d: date, o: open, h: high, l: low, c: close, v: volume });
        if (!earliest || date < earliest) earliest = date;
      }
      if (!earliest || earliest <= from) break;
      const next = previousDay(earliest);
      if (next >= end) break;
      end = next;
    }
    return [...byDate.values()].sort((left, right) => left.d.localeCompare(right.d));
  }
}
