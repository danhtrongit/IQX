/**
 * Nguồn dữ liệu của bộ dựng kho Flashback v2.2 (spec §1.1, §2.2).
 *
 * | Việc | Nguồn chính | Dự phòng |
 * |---|---|---|
 * | Rổ VN100 | nhóm VN100 của VCI (qua `IndexMembershipProvider`, không nhập tay) | — |
 * | Nến ngày của một mã | DNSE (`DnseMarketProvider`): một lần gọi trả toàn bộ lịch sử, giá đã điều chỉnh, nghìn đồng, từ 2012-03 | VCI `gap-chart` (đồng, từ ngày lên sàn), phân trang 1.000 nến |
 * | Lịch phiên của sàn | chỉ số VNINDEX của DNSE (từ 2000) | VNINDEX của VCI |
 * | Giá trị khớp thật mỗi phiên | VCI `price-history` (`totalMatchValue`, giá chưa điều chỉnh) | không có: bộ dựng dùng giá đóng điều chỉnh × khối lượng |
 *
 * DNSE là nguồn chính theo chỉ đạo của chủ sản phẩm; VCI chỉ dùng khi DNSE lỗi hoặc không có dữ
 * liệu của mã đó. Không đổi chuỗi nguồn mặc định của `MarketDataService` (Bot, bảng giá).
 */

import { Injectable } from '@nestjs/common';

import { DnseMarketProvider, MarketDataService } from '../market-data/index.js';
import { IndexMembershipProvider } from '../market-integration/index.js';
import { vietnamDate } from './flashback.round-builder.js';
import {
  FLASHBACK_PRICE_MAX_VND,
  FLASHBACK_PRICE_MIN_VND,
  flashbarDate,
} from './flashback.market-data.js';
import type { DatasetPriceSource } from './flashback-dataset.config.js';
import { normalizeVendorRows, type DatasetRawRow } from './flashback-dataset.logic.js';

export const FLASHBACK_DATASET_SOURCE = Symbol('FLASHBACK_DATASET_SOURCE');

export interface DatasetBasket {
  readonly symbols: string[];
  readonly source: string;
}

export interface DatasetCalendarData {
  /** Các ngày giao dịch của sàn, YYYY-MM-DD. */
  readonly dates: string[];
  readonly source: string;
}

export interface DatasetHistory {
  /** Nến đã đổi về đồng, một nến mỗi ngày, tăng dần, chưa gồm phiên hôm nay. */
  readonly rows: DatasetRawRow[];
  /** Ví dụ `DNSE:x1000:adjusted` hoặc `VCI:dong:adjusted`. */
  readonly source: string;
}

/** Cổng dữ liệu của bộ dựng kho (để test thay bằng bản giả). */
export interface FlashbackDatasetSourcePort {
  basket(indexCode: string): Promise<DatasetBasket>;
  calendar(): Promise<DatasetCalendarData>;
  /**
   * Toàn bộ lịch sử nến ngày của một mã. `order` là thứ tự nguồn: nguồn đầu là nguồn chính, nguồn
   * sau chỉ dùng khi nguồn trước lỗi hoặc không có dữ liệu.
   */
  history(
    symbol: string,
    beforeDate: string,
    order?: readonly DatasetPriceSource[],
  ): Promise<DatasetHistory>;
  /**
   * Giá trị khớp thật theo ngày (đồng, giá chưa điều chỉnh × khối lượng chưa điều chỉnh).
   * `null` nếu nguồn không có dữ liệu của mã; ném lỗi nếu nguồn không gọi được.
   */
  matchedValues?(symbol: string, beforeDate: string): Promise<ReadonlyMap<string, number> | null>;
}

/** Lịch phiên ít nhất phải có chừng này ngày, nếu không coi như nguồn hỏng. */
const MIN_CALENDAR_SESSIONS = 1_000;
const EARLIEST_FETCH_DATE = '1995-01-01';
/** VCI trả tối đa 1.000 nến mỗi lần gọi: 15 trang đủ 60 năm. */
const MAX_VCI_PAGES = 15;
const MATCHED_VALUE_PAGE_SIZE = 1_000;
const MAX_MATCHED_VALUE_PAGES = 20;

const message = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, 160);

function previousDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

function median(values: readonly number[]): number {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]!;
}

/** Giá sau chuẩn hoá phải ở khoảng 1.000đ-1.000.000đ; ngoài khoảng là nguồn đổi đơn vị. */
function assertPriceUnit(source: string, rows: readonly DatasetRawRow[]): void {
  const center = median(rows.map((row) => row.close));
  if (rows.length > 0 && (center < FLASHBACK_PRICE_MIN_VND || center > FLASHBACK_PRICE_MAX_VND)) {
    // Không ghi tên mã để nhật ký không lộ mã của đề.
    throw new Error(`Giá ${source} sau chuẩn hoá có trung vị ${center}đ, ngoài khoảng 1.000đ-1.000.000đ`);
  }
}

@Injectable()
export class MarketFlashbackDatasetSource implements FlashbackDatasetSourcePort {
  constructor(
    private readonly dnse: DnseMarketProvider,
    private readonly market: MarketDataService,
    private readonly membership: IndexMembershipProvider,
  ) {}

  async basket(indexCode: string): Promise<DatasetBasket> {
    const current = await this.membership.fetchCurrent(indexCode);
    return { symbols: current.symbols, source: current.source };
  }

  async calendar(): Promise<DatasetCalendarData> {
    const today = vietnamDate(new Date());
    let dnseError: unknown;
    try {
      const result = await this.dnse.fetchFullIndexHistory('VNINDEX');
      const dates = this.dates(result.data);
      if (dates.length >= MIN_CALENDAR_SESSIONS) return { dates, source: 'DNSE:VNINDEX' };
      dnseError = new Error(`chỉ có ${dates.length} phiên`);
    } catch (error) {
      dnseError = error;
    }
    try {
      const dates = this.dates(await this.pageVci('VNINDEX', EARLIEST_FETCH_DATE, today));
      if (dates.length >= MIN_CALENDAR_SESSIONS) return { dates, source: 'VCI:VNINDEX' };
      throw new Error(`chỉ có ${dates.length} phiên`);
    } catch (error) {
      throw new Error(
        `Không tải được lịch phiên của sàn (DNSE: ${message(dnseError)}; VCI: ${message(error)})`,
        { cause: error },
      );
    }
  }

  async history(
    symbol: string,
    beforeDate: string,
    order: readonly DatasetPriceSource[] = ['DNSE', 'VCI'],
  ): Promise<DatasetHistory> {
    const failures: string[] = [];
    for (const name of order) {
      try {
        return name === 'DNSE'
          ? await this.dnseHistory(symbol, beforeDate)
          : await this.vciHistory(symbol, beforeDate);
      } catch (error) {
        failures.push(`${name}: ${message(error)}`);
      }
    }
    throw new Error(failures.join('; ') || 'Không có nguồn dữ liệu nào được bật');
  }

  private async dnseHistory(symbol: string, beforeDate: string): Promise<DatasetHistory> {
    const result = await this.dnse.fetchFullHistory(symbol);
    const rows = normalizeVendorRows(result.data, 1_000, beforeDate);
    if (rows.length === 0) throw new Error('DNSE không trả nến nào');
    assertPriceUnit('DNSE', rows);
    return { rows, source: 'DNSE:x1000:adjusted' };
  }

  private async vciHistory(symbol: string, beforeDate: string): Promise<DatasetHistory> {
    const raw = await this.pageVci(symbol, EARLIEST_FETCH_DATE, beforeDate);
    const rows = normalizeVendorRows(raw, 1, beforeDate);
    if (rows.length === 0) throw new Error('VCI không trả nến nào');
    assertPriceUnit('VCI', rows);
    return { rows, source: 'VCI:dong:adjusted' };
  }

  async matchedValues(
    symbol: string,
    beforeDate: string,
  ): Promise<ReadonlyMap<string, number> | null> {
    const values = new Map<string, number>();
    for (let page = 0; page < MAX_MATCHED_VALUE_PAGES; page += 1) {
      const result = await this.market.vci.fetchTradingHistory(symbol, {
        resolution: '1D',
        start: EARLIEST_FETCH_DATE,
        end: beforeDate,
        page,
        size: MATCHED_VALUE_PAGE_SIZE,
      });
      for (const row of result.data) {
        const date = flashbarDate(row.trading_date);
        const value = Number(row.total_match_value);
        if (date && Number.isFinite(value) && value >= 0) values.set(date, value);
      }
      if (result.data.length < MATCHED_VALUE_PAGE_SIZE) break;
    }
    return values.size > 0 ? values : null;
  }

  private dates(rows: readonly unknown[]): string[] {
    const dates = new Set<string>();
    for (const row of rows) {
      const date = flashbarDate(((row ?? {}) as Record<string, unknown>).time);
      if (date && date >= EARLIEST_FETCH_DATE) dates.add(date);
    }
    return [...dates].sort();
  }

  /** Nến VCI `gap-chart`, lùi từng trang 1.000 nến tới `from`. */
  private async pageVci(symbol: string, from: string, to: string): Promise<unknown[]> {
    const rows: unknown[] = [];
    let end = to;
    for (let page = 0; page < MAX_VCI_PAGES; page += 1) {
      if (end < from) break;
      const response = await this.market.ohlcv(symbol, {
        interval: '1D',
        start: from,
        end,
        source: 'VCI',
      });
      const pageRows = Array.isArray(response.data) ? response.data : [];
      let earliest: string | null = null;
      for (const raw of pageRows) {
        const date = flashbarDate(((raw ?? {}) as Record<string, unknown>).time);
        if (!date) continue;
        rows.push(raw);
        if (!earliest || date < earliest) earliest = date;
      }
      if (!earliest || earliest <= from) break;
      const next = previousDay(earliest);
      if (next >= end) break;
      end = next;
    }
    return rows;
  }
}
