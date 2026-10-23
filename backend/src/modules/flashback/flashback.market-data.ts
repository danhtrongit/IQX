/**
 * Nguồn nến ngày cho Flashback.
 *
 * Dùng đúng `MarketDataService` của repo nhưng gọi từng nguồn một cách tường minh để biết đơn vị
 * giá (spec 22-10 FB-04). Kết quả dò trên dữ liệu thật ngày 2026-10-23 (FPT, VCB, HPG, VNINDEX):
 *
 * | Nguồn | Đơn vị cổ phiếu | Giá điều chỉnh | Lịch sử |
 * |---|---|---|---|
 * | VCI `gap-chart` | đồng (57400) | có (FPT 09/02/2018: 12.900,03) | ≥ 2010, `countBack = 1000` mỗi lần |
 * | VND `dchart` | nghìn đồng (57.4) | có (FPT 09/02/2018: 12,9) | cổ phiếu từ 2013, VNINDEX từ 08/2017 |
 *
 * Vì vậy VCI là nguồn chính (đúng đơn vị, đủ lịch sử để có phiên khởi tạo trước 2012), VND chỉ
 * là nguồn dự phòng và được nhân 1.000. Chỉ số (VNINDEX) giữ nguyên điểm. Mọi giá cổ phiếu được
 * làm tròn về đồng nguyên và kiểm tra phạm vi trước khi dùng.
 */

import { Injectable } from '@nestjs/common';

import { MarketDataService } from '../market-data/index.js';
import type { FlashbackBar } from './flashback.types.js';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Ngày phiên (theo giờ Việt Nam) của một dòng nến. */
export function flashbarDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const seconds = value > 1e11 ? value / 1000 : value;
    return new Date(seconds * 1000 + VN_OFFSET_MS).toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) return flashbarDate(Number(value));
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Chuỗi nến kèm nguồn và đơn vị đã chuẩn hoá (để lưu `flashback_rounds.price_source`). */
export interface FlashbackSeries {
  readonly bars: FlashbackBar[];
  /** Ví dụ `VCI:dong:adjusted` hoặc `VND:x1000:adjusted`. */
  readonly source: string;
}

/** Cổng dữ liệu nến ngày của Flashback (để test thay bằng bản giả). */
export interface FlashbackMarketDataPort {
  /** Nến ngày của một mã trong khoảng `[from, to]` (ngày theo định dạng YYYY-MM-DD), giá theo đồng. */
  dailyBars(symbol: string, from: string, to: string): Promise<FlashbackBar[]>;
  /** Như `dailyBars` nhưng kèm nguồn giá. Bản giả có thể không cài, khi đó nguồn là `unknown`. */
  dailySeries?(symbol: string, from: string, to: string): Promise<FlashbackSeries>;
  /** Danh sách mã VN30 hiện hành (tuỳ chọn, nếu cung cấp trực tiếp qua cổng dữ liệu). */
  vn30Symbols?(): Promise<string[]>;
}

/** Giá cổ phiếu VN30 hợp lệ theo đồng (spec 22-10 FB-04). */
export const FLASHBACK_PRICE_MIN_VND = 1_000;
export const FLASHBACK_PRICE_MAX_VND = 1_000_000;

/** Mã chỉ số: giữ nguyên điểm, không đổi đơn vị, không kiểm tra phạm vi giá cổ phiếu. */
export function isFlashbackIndexSymbol(symbol: string): boolean {
  return /^(VNINDEX|VN30|VN100|HNXINDEX|HNX30|UPCOMINDEX|VNMID|VNSML|VNALL)$/i.test(symbol);
}

/** Hệ số đổi về đồng theo nguồn (đã dò trên dữ liệu thật, xem đầu tệp). */
const SOURCE_SCALE: Record<string, number> = { VCI: 1, VND: 1_000 };

/**
 * Hệ số đổi về đồng của một chuỗi nến cổ phiếu. Biết nguồn thì dùng bảng `SOURCE_SCALE`; nguồn lạ
 * thì đoán theo độ lớn của trung vị giá đóng cửa (dưới 1.000 thì là nghìn đồng).
 */
export function flashbackPriceScale(source: string, closes: readonly number[]): number {
  const known = SOURCE_SCALE[source.toUpperCase()];
  if (known !== undefined) return known;
  const median = medianOf(closes);
  return median > 0 && median < FLASHBACK_PRICE_MIN_VND ? 1_000 : 1;
}

function medianOf(values: readonly number[]): number {
  const positive = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (positive.length === 0) return 0;
  return positive[Math.floor(positive.length / 2)]!;
}

/** Lỗi khi giá sau chuẩn hoá nằm ngoài phạm vi (nguồn đổi đơn vị mà không báo trước). */
export class FlashbackPriceUnitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlashbackPriceUnitError';
  }
}

/**
 * Chuẩn hoá nến thô của một nguồn về đồng nguyên (spec 22-10 FB-04).
 *
 * - Cổ phiếu: nhân hệ số của nguồn, làm tròn về đồng, rồi kiểm tra trung vị giá đóng cửa nằm trong
 *   [1.000đ; 1.000.000đ]. Kiểm tra trên trung vị vì giá điều chỉnh của vài năm đầu có thể thấp hơn
 *   1.000đ thật (HPG 01/2013 điều chỉnh còn khoảng 1.002đ).
 * - Chỉ số: giữ nguyên.
 * - Nến lỗi giữ lại với giá -1 để bộ lọc dữ liệu sạch (BoSung §4.3) loại cả giai đoạn.
 */
export function normalizeFlashbackRows(
  symbol: string,
  source: string,
  rows: readonly unknown[],
  from: string,
  to: string,
): FlashbackSeries {
  const index = isFlashbackIndexSymbol(symbol);
  const parsed: {
    d: string;
    o: number | null;
    h: number | null;
    l: number | null;
    c: number | null;
    v: number | null;
  }[] = [];
  for (const raw of rows) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const date = flashbarDate(row.time);
    if (!date || date < from || date > to) continue;
    parsed.push({
      d: date,
      o: finite(row.open),
      h: finite(row.high),
      l: finite(row.low),
      c: finite(row.close),
      v: finite(row.volume),
    });
  }
  const scale = index
    ? 1
    : flashbackPriceScale(
        source,
        parsed.map((row) => row.c ?? 0),
      );
  const price = (value: number | null): number | null => {
    if (value === null) return null;
    return index ? value : Math.round(value * scale);
  };
  const byDate = new Map<string, FlashbackBar>();
  for (const row of parsed) {
    const open = price(row.o);
    const high = price(row.h);
    const low = price(row.l);
    const close = price(row.c);
    const volume = row.v === null ? null : Math.round(row.v);
    const valid =
      open !== null &&
      high !== null &&
      low !== null &&
      close !== null &&
      volume !== null &&
      open > 0 &&
      high > 0 &&
      low > 0 &&
      close > 0 &&
      volume >= 0 &&
      high >= low &&
      open >= low &&
      open <= high &&
      close >= low &&
      close <= high;
    byDate.set(
      row.d,
      valid
        ? { d: row.d, o: open, h: high, l: low, c: close, v: volume }
        : { d: row.d, o: -1, h: -1, l: -1, c: -1, v: volume ?? -1 },
    );
  }
  const bars = [...byDate.values()].sort((left, right) => left.d.localeCompare(right.d));
  if (!index && bars.length > 0) {
    const median = medianOf(bars.map((bar) => bar.c));
    if (median < FLASHBACK_PRICE_MIN_VND || median > FLASHBACK_PRICE_MAX_VND) {
      throw new FlashbackPriceUnitError(
        // Không ghi tên mã: nhật ký không được lộ mã của đề (BoSung §10.8).
        `Giá ${source} sau chuẩn hoá có trung vị ${median}đ, ngoài khoảng 1.000đ-1.000.000đ`,
      );
    }
  }
  const unit = index ? 'points' : scale === 1 ? 'dong' : `x${scale}`;
  return { bars, source: `${source.toUpperCase()}:${unit}:adjusted` };
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
    return (await this.dailySeries(symbol, from, to)).bars;
  }

  /** VCI trước (đồng, đủ lịch sử); VCI lỗi thì dùng VND (nghìn đồng, nhân 1.000). */
  async dailySeries(symbol: string, from: string, to: string): Promise<FlashbackSeries> {
    try {
      return await this.vciSeries(symbol, from, to);
    } catch (error) {
      if (error instanceof FlashbackPriceUnitError) throw error;
      const response = await this.market.ohlcv(symbol, {
        interval: '1D',
        start: from,
        end: to,
        source: 'VND',
      });
      const rows = Array.isArray(response.data) ? response.data : [];
      return normalizeFlashbackRows(symbol, 'VND', rows, from, to);
    }
  }

  private async vciSeries(symbol: string, from: string, to: string): Promise<FlashbackSeries> {
    const rows: unknown[] = [];
    let end = to;
    for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
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
    return normalizeFlashbackRows(symbol, 'VCI', rows, from, to);
  }
}
