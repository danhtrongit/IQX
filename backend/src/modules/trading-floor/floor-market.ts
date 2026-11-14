/**
 * Dữ liệu thị trường cho nghi lễ Thần Tài, lấy trong cùng tiến trình (không gọi API công khai):
 * điểm VN-Index đang chạy, danh sách mã niêm yết và điểm đóng cửa đã chốt của một phiên.
 *
 * - Điểm đang chạy: `VietcapOverviewProvider.marketIndex` (cùng nguồn với trang Tổng quan), nhớ 20 giây.
 * - Mã niêm yết: bảng `symbols` (đang hoạt động, không phải chỉ số), nhớ 12 giờ.
 * - Điểm đã chốt: bảng `market_index_bars` do tác vụ Bản tin điền sau 15:15 (nến chốt, không có nến dở dang).
 */

import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import { VietcapOverviewProvider } from '../market-extended/index.js';
import { parseQuoteTime } from './floor-ritual.logic.js';

export const FLOOR_MARKET = Symbol('FLOOR_MARKET');

export interface FloorIndexQuote {
  readonly value: number;
  readonly change: number;
  /** Giờ của báo giá (epoch ms) hoặc null khi không đọc được. */
  readonly time: number | null;
}

export interface FloorIndexClose {
  readonly close: number;
  /** Chênh so với nến liền trước; null khi không có nến trước. */
  readonly change: number | null;
}

export interface FloorMarketPort {
  /** Điểm VN-Index hiện tại, null khi không có nguồn. */
  vnindex(now: number): Promise<FloorIndexQuote | null>;
  /** Tập mã niêm yết, null khi không đọc được (khi đó mọi mã đúng định dạng đều được nhận). */
  listedSymbols(now: number): Promise<Set<string> | null>;
  /** Điểm đóng cửa đã chốt của phiên `YYYY-MM-DD`, null khi chưa có nến. */
  indexClose(session: string): Promise<FloorIndexClose | null>;
}

const INDEX_TTL_MS = 20_000;
const LISTED_TTL_MS = 12 * 60 * 60 * 1000;
const VNINDEX = 'VNINDEX';

const finite = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};

@Injectable()
export class PgFloorMarket implements FloorMarketPort {
  private readonly logger = new Logger(PgFloorMarket.name);
  private indexCache: { at: number; value: FloorIndexQuote | null } | null = null;
  private listedCache: { at: number; symbols: Set<string> } | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly overview: VietcapOverviewProvider,
  ) {}

  async vnindex(now: number): Promise<FloorIndexQuote | null> {
    if (this.indexCache && now - this.indexCache.at < INDEX_TTL_MS) return this.indexCache.value;
    try {
      const { data } = await this.overview.marketIndex([VNINDEX]);
      const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
      const row = rows.find((item) => String(item.symbol ?? '').toUpperCase() === VNINDEX);
      const value = finite(row?.price);
      this.indexCache = {
        at: now,
        value:
          row && value !== null && value > 0
            ? { value, change: finite(row.change) ?? 0, time: parseQuoteTime(row.time) }
            : null,
      };
    } catch (error) {
      this.logger.warn(
        `VNINDEX unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.indexCache = { at: now, value: this.indexCache?.value ?? null };
    }
    return this.indexCache.value;
  }

  async listedSymbols(now: number): Promise<Set<string> | null> {
    if (this.listedCache && now - this.listedCache.at < LISTED_TTL_MS)
      return this.listedCache.symbols;
    try {
      const rows = await this.database.query<{ symbol: string }>(
        `select upper(symbol) as symbol from symbols
          where is_active = true and coalesce(is_index, false) = false`,
      );
      if (rows.length === 0) return this.listedCache?.symbols ?? null;
      this.listedCache = { at: now, symbols: new Set(rows.map((row) => String(row.symbol))) };
    } catch (error) {
      this.logger.warn(
        `Symbol directory unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.listedCache?.symbols ?? null;
    }
    return this.listedCache.symbols;
  }

  async indexClose(session: string): Promise<FloorIndexClose | null> {
    const rows = await this.database.query<{ close: string; prev_close: string | null }>(
      `select b.close, prev.close as prev_close
         from market_index_bars b
         left join lateral (
           select p.close from market_index_bars p
            where p.symbol = b.symbol and p.trade_date < b.trade_date
            order by p.trade_date desc limit 1
         ) prev on true
        where b.symbol = $1 and b.trade_date = $2::date`,
      [VNINDEX, session],
    );
    const row = rows[0];
    const close = finite(row?.close);
    if (!row || close === null) return null;
    const previous = finite(row.prev_close);
    return { close, change: previous === null ? null : Math.round((close - previous) * 100) / 100 };
  }
}
