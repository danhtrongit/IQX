/**
 * Phân ngành ICB của VCI theo mã, cho ngành dashboard v3 (spec v3 §1.3 bước 2, PLAN D2).
 *
 * - Một lần gọi `v2/company/search-bar` trả ICB của ~2.100 mã; giữ trong bộ nhớ 12 giờ.
 * - Lỗi nguồn: giữ bản cũ (stale-on-error) và không gọi lại trong 5 phút; không có bản nào thì
 *   trả `null` (→ ngành `thuong`, §13.1) và ghi cảnh báo. Không bao giờ ném lỗi ra ngoài.
 * - Mã thiếu trong danh bạ (hoặc thiếu mã ICB): dự phòng `v1/company/{sym}`, cũng có cache.
 * - Nhiều yêu cầu cùng lúc chỉ tạo một lần gọi (single-flight).
 *
 * Dữ liệu là cache của nguồn, không lưu DB (spec cấm bảng ngoại lệ).
 */
import { Injectable, Logger } from '@nestjs/common';

import { VciMarketProvider } from '../market-data/index.js';
import type { IcbCodes } from './dashboard.nganh.js';

/** Thời gian giữ danh bạ ICB và kết quả từng mã. */
export const ICB_TTL_MS = 12 * 3_600_000;
/** Sau một lần lỗi, chờ chừng này mới gọi lại nguồn. */
export const ICB_RETRY_MS = 5 * 60_000;
/** Giới hạn số mã giữ trong cache dự phòng từng mã. */
const MAX_SYMBOL_ENTRIES = 5_000;

interface SymbolEntry {
  codes: IcbCodes | null;
  at: number;
  ok: boolean;
}

const hasCodes = (codes: IcbCodes | null | undefined): codes is IcbCodes =>
  !!codes && (!!codes.lv2 || !!codes.lv4);

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

@Injectable()
export class IcbDirectory {
  private readonly logger = new Logger(IcbDirectory.name);
  private directory: Map<string, IcbCodes> | null = null;
  private loadedAt = 0;
  private failedAt = Number.NEGATIVE_INFINITY;
  private loading: Promise<void> | null = null;
  private readonly symbols = new Map<string, SymbolEntry>();
  private readonly pending = new Map<string, Promise<IcbCodes | null>>();

  constructor(private readonly vci: VciMarketProvider) {}

  /** ICB cấp 2/4 của một mã; `null` khi nguồn không có hoặc không gọi được. */
  async lookup(symbol: string): Promise<IcbCodes | null> {
    const sym = symbol.toUpperCase();
    await this.refresh();
    const hit = this.directory?.get(sym);
    if (hasCodes(hit)) return hit;
    return this.lookupOne(sym);
  }

  private async refresh(): Promise<void> {
    const now = Date.now();
    if (this.directory && now - this.loadedAt < ICB_TTL_MS) return;
    if (now - this.failedAt < ICB_RETRY_MS) return;
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    await this.loading;
  }

  private async load(): Promise<void> {
    try {
      const result = await this.vci.fetchIcbDirectory();
      if (result.data.length === 0) throw new Error('empty ICB directory');
      const directory = new Map<string, IcbCodes>();
      for (const row of result.data) directory.set(row.symbol, { lv2: row.lv2, lv4: row.lv4 });
      this.directory = directory;
      this.loadedAt = Date.now();
    } catch (error) {
      this.failedAt = Date.now();
      this.logger.warn(
        `VCI ICB directory unavailable (${this.directory ? 'keeping the stale copy' : 'symbols fall back to thuong'}): ${message(error)}`,
      );
    }
  }

  private lookupOne(symbol: string): Promise<IcbCodes | null> {
    const now = Date.now();
    const cached = this.symbols.get(symbol);
    if (cached && now - cached.at < (cached.ok ? ICB_TTL_MS : ICB_RETRY_MS))
      return Promise.resolve(cached.codes);
    let request = this.pending.get(symbol);
    if (!request) {
      request = this.fetchOne(symbol, cached).finally(() => this.pending.delete(symbol));
      this.pending.set(symbol, request);
    }
    return request;
  }

  private async fetchOne(symbol: string, stale: SymbolEntry | undefined): Promise<IcbCodes | null> {
    try {
      const result = await this.vci.fetchCompanyIcb(symbol);
      const codes = hasCodes(result.data) ? result.data : null;
      this.remember(symbol, { codes, at: Date.now(), ok: true });
      return codes;
    } catch (error) {
      this.logger.warn(`VCI ICB of ${symbol} unavailable: ${message(error)}`);
      const codes = stale?.codes ?? null;
      this.remember(symbol, { codes, at: Date.now(), ok: false });
      return codes;
    }
  }

  private remember(symbol: string, entry: SymbolEntry): void {
    if (this.symbols.size >= MAX_SYMBOL_ENTRIES && !this.symbols.has(symbol)) this.symbols.clear();
    this.symbols.set(symbol, entry);
  }
}
