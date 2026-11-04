/**
 * Kho dữ liệu Flashback v2.2 trong bộ nhớ cho test: cùng quy tắc với bản Postgres (một phiên bản
 * `building` một lúc, `activate` chuyển bản cũ sang `retired`, mã lỗi không để lại dữ liệu dở) và
 * một nguồn dữ liệu giả có thể bơm lỗi từng mã.
 */

import type { FlashbackAlertLevel } from '../../../src/modules/flashback/flashback.repository.js';
import {
  computePrefix,
  type DatasetBar,
  type DatasetPrefix,
  type DatasetRawRow,
} from '../../../src/modules/flashback/flashback-dataset.logic.js';
import {
  DATASET_PURGED_NOTE,
  FlashbackDatasetRepository,
  type DatasetAlertCode,
  type DatasetAlertRow,
  type DatasetCutRow,
  type DatasetFinishInput,
  type DatasetProgress,
  type DatasetSymbolInput,
  type DatasetSymbolRow,
  type DatasetTrigger,
  type DatasetVersionRow,
  type DatasetVersionStatus,
} from '../../../src/modules/flashback/flashback-dataset.repository.js';
import type {
  DatasetBasket,
  DatasetCalendarData,
  DatasetHistory,
  FlashbackDatasetSourcePort,
} from '../../../src/modules/flashback/flashback-dataset.source.js';
import type { DatasetPriceSource } from '../../../src/modules/flashback/flashback-dataset.config.js';

interface MemoryVersion {
  version: number;
  createdAt: Date;
  status: DatasetVersionStatus;
  symbolsCount: number;
  source: string;
  log: Record<string, unknown>;
  trigger: DatasetTrigger;
  requestedBy: string | null;
  heartbeatAt: Date;
  progress: DatasetProgress;
  maxGapSessions: number;
  finishedAt: Date | null;
  activatedAt: Date | null;
}

const key = (version: number, symbol: string): string => `${version}:${symbol}`;

export class MemoryDatasetRepository extends FlashbackDatasetRepository {
  /** Giá trị `flashback_settings.dataset`; `null` = chưa lưu tham số nào. */
  config: unknown = null;
  readonly versionRows = new Map<number, MemoryVersion>();
  readonly symbolRows = new Map<string, DatasetSymbolRow>();
  readonly barRows = new Map<string, DatasetBar[]>();
  readonly prefixRows = new Map<string, DatasetPrefix>();
  readonly alertRows: DatasetAlertRow[] = [];
  /** Các mã mà `saveSymbol` phải ném lỗi (mô phỏng lỗi ghi CSDL). */
  readonly failSaveFor = new Set<string>();
  readonly calls = { loadPrefix: 0, loadBars: 0, activate: 0, markFailed: 0 };
  private nextVersion = 1;

  constructor(private readonly clock: () => Date = () => new Date()) {
    super();
  }

  // ------------------------------------------------------------------ dựng sẵn dữ liệu cho test

  /**
   * Tạo ngay một phiên bản `active` từ các chuỗi nến cho trước (bỏ qua bộ dựng): dùng cho test
   * cắt đề và trang quản trị.
   */
  seedActive(
    seriesBySymbol: Record<string, readonly DatasetBar[]>,
    options: {
      maxGapSessions?: number;
      source?: string;
      createdAt?: Date;
      priceSource?: string;
    } = {},
  ): number {
    const version = this.nextVersion++;
    const createdAt = options.createdAt ?? this.clock();
    for (const row of this.versionRows.values()) {
      if (row.status === 'active') row.status = 'retired';
    }
    const maxGap = options.maxGapSessions ?? 5;
    this.versionRows.set(version, {
      version,
      createdAt,
      status: 'active',
      symbolsCount: Object.keys(seriesBySymbol).length,
      source: options.source ?? 'DNSE:x1000:adjusted',
      log: {},
      trigger: 'cli',
      requestedBy: null,
      heartbeatAt: createdAt,
      progress: { phase: 'done', total: 0, done: 0, ok: 0, excluded: 0 },
      maxGapSessions: maxGap,
      finishedAt: createdAt,
      activatedAt: createdAt,
    });
    for (const [symbol, bars] of Object.entries(seriesBySymbol)) {
      this.storeSymbol(
        version,
        { symbol, priceSource: options.priceSource ?? 'DNSE:x1000:adjusted', valueBasis: 'matched', badCount: 0 },
        bars,
        computePrefix(bars, maxGap),
      );
    }
    return version;
  }

  /** Đặt một phiên bản đang `building` với nhịp báo cách đây `heartbeatAgoMs`. */
  seedBuilding(heartbeatAgoMs: number, trigger: DatasetTrigger = 'manual'): number {
    const version = this.nextVersion++;
    const heartbeatAt = new Date(this.clock().getTime() - heartbeatAgoMs);
    this.versionRows.set(version, {
      version,
      createdAt: heartbeatAt,
      status: 'building',
      symbolsCount: 0,
      source: '',
      log: {},
      trigger,
      requestedBy: null,
      heartbeatAt,
      progress: { phase: 'symbols', total: 100, done: 10, ok: 10, excluded: 0 },
      maxGapSessions: 5,
      finishedAt: null,
      activatedAt: null,
    });
    return version;
  }

  /** Đặt một phiên bản đã `failed` (lần dựng trước thất bại) tạo vào lúc `createdAt`. */
  seedFailed(createdAt: Date, error = 'Làm mới kho thất bại: nguồn dữ liệu lỗi', symbolsCount = 0): number {
    const version = this.nextVersion++;
    this.versionRows.set(version, {
      version,
      createdAt,
      status: 'failed',
      symbolsCount,
      source: '',
      log: { outcome: 'failed', error },
      trigger: 'scheduled',
      requestedBy: null,
      heartbeatAt: createdAt,
      progress: { phase: 'done', total: 100, done: 100, ok: symbolsCount, excluded: 100 - symbolsCount },
      maxGapSessions: 5,
      finishedAt: createdAt,
      activatedAt: null,
    });
    return version;
  }

  private storeSymbol(
    version: number,
    symbol: DatasetSymbolInput,
    bars: readonly DatasetBar[],
    prefix: DatasetPrefix,
  ): void {
    this.symbolRows.set(key(version, symbol.symbol), {
      version,
      symbol: symbol.symbol,
      barsCount: bars.length,
      firstDate: bars[0]?.date ?? null,
      lastDate: bars.at(-1)?.date ?? null,
      status: 'ok',
      reason: null,
      priceSource: symbol.priceSource,
      valueBasis: symbol.valueBasis,
      badCount: symbol.badCount,
    });
    this.barRows.set(key(version, symbol.symbol), [...bars]);
    this.prefixRows.set(key(version, symbol.symbol), prefix);
  }

  private toRow(row: MemoryVersion): DatasetVersionRow {
    const ok = [...this.symbolRows.values()].filter(
      (symbol) => symbol.version === row.version && symbol.status === 'ok',
    );
    const firsts = ok.map((symbol) => symbol.firstDate).filter((date): date is string => date !== null);
    const lasts = ok.map((symbol) => symbol.lastDate).filter((date): date is string => date !== null);
    return {
      version: row.version,
      createdAt: row.createdAt,
      status: row.status,
      symbolsCount: row.symbolsCount,
      source: row.source,
      log: row.log as DatasetVersionRow['log'],
      trigger: row.trigger,
      requestedBy: row.requestedBy,
      heartbeatAt: row.heartbeatAt,
      progress: row.progress,
      maxGapSessions: row.maxGapSessions,
      finishedAt: row.finishedAt,
      activatedAt: row.activatedAt,
      firstDate: firsts.length > 0 ? firsts.sort()[0]! : null,
      lastDate: lasts.length > 0 ? lasts.sort().at(-1)! : null,
    };
  }

  // ------------------------------------------------------------------ tham số

  async readConfig(): Promise<unknown> {
    return this.config;
  }

  async writeConfig(value: unknown): Promise<void> {
    this.config = value;
  }

  // ------------------------------------------------------------------ tạo kho

  async failStaleBuilds(staleMs: number): Promise<number[]> {
    const failed: number[] = [];
    for (const row of this.versionRows.values()) {
      if (row.status !== 'building') continue;
      if (this.clock().getTime() - row.heartbeatAt.getTime() < staleMs) continue;
      row.status = 'failed';
      row.finishedAt = this.clock();
      row.log = { ...row.log, outcome: 'failed', error: 'Lần tạo kho bị ngắt giữa chừng' };
      failed.push(row.version);
      this.purge(row.version);
    }
    return failed;
  }

  /** Như bản Postgres: phiên bản không được kích hoạt bị dọn nến và mảng cộng dồn, giữ dòng mã. */
  private purge(version: number): void {
    for (const key of [...this.barRows.keys()]) if (key.startsWith(`${version}:`)) this.barRows.delete(key);
    for (const key of [...this.prefixRows.keys()]) if (key.startsWith(`${version}:`)) this.prefixRows.delete(key);
    for (const [key, row] of this.symbolRows) {
      if (row.version === version && row.status === 'ok') {
        this.symbolRows.set(key, { ...row, reason: DATASET_PURGED_NOTE });
      }
    }
  }

  async createBuilding(input: {
    trigger: DatasetTrigger;
    requestedBy: string | null;
    maxGapSessions: number;
    progress: DatasetProgress;
  }): Promise<DatasetVersionRow | null> {
    // Ràng buộc duy nhất `where status = 'building'` của CSDL.
    if ([...this.versionRows.values()].some((row) => row.status === 'building')) return null;
    const version = this.nextVersion++;
    const now = this.clock();
    const row: MemoryVersion = {
      version,
      createdAt: now,
      status: 'building',
      symbolsCount: 0,
      source: '',
      log: {},
      trigger: input.trigger,
      requestedBy: input.requestedBy,
      heartbeatAt: now,
      progress: input.progress,
      maxGapSessions: input.maxGapSessions,
      finishedAt: null,
      activatedAt: null,
    };
    this.versionRows.set(version, row);
    return this.toRow(row);
  }

  async updateProgress(version: number, progress: DatasetProgress): Promise<void> {
    const row = this.versionRows.get(version);
    if (row?.status !== 'building') return;
    row.progress = progress;
    row.heartbeatAt = this.clock();
  }

  async saveSymbol(
    version: number,
    symbol: DatasetSymbolInput,
    bars: readonly DatasetBar[],
    prefix: DatasetPrefix,
  ): Promise<void> {
    if (this.failSaveFor.has(symbol.symbol)) throw new Error(`lỗi ghi CSDL của ${symbol.symbol}`);
    if (bars.length === 0) throw new RangeError('Không có nến để ghi');
    this.storeSymbol(version, symbol, bars, prefix);
  }

  async saveExcluded(
    version: number,
    input: { symbol: string; barsCount: number; firstDate: string | null; lastDate: string | null; reason: string },
  ): Promise<void> {
    if (this.symbolRows.has(key(version, input.symbol))) return;
    this.symbolRows.set(key(version, input.symbol), {
      version,
      symbol: input.symbol,
      barsCount: input.barsCount,
      firstDate: input.firstDate,
      lastDate: input.lastDate,
      status: 'excluded',
      reason: input.reason,
      priceSource: null,
      valueBasis: null,
      badCount: 0,
    });
  }

  async markFailed(version: number, input: DatasetFinishInput): Promise<void> {
    this.calls.markFailed += 1;
    const row = this.versionRows.get(version);
    if (row?.status !== 'building') return;
    row.status = 'failed';
    row.finishedAt = this.clock();
    row.symbolsCount = input.symbolsCount;
    row.source = input.source;
    row.log = input.log as unknown as Record<string, unknown>;
    row.progress = input.progress;
    this.purge(version);
  }

  async activate(version: number, input: DatasetFinishInput): Promise<void> {
    this.calls.activate += 1;
    const row = this.versionRows.get(version);
    if (row?.status !== 'building')
      throw new Error(`Phiên bản kho ${version} không còn ở trạng thái building`);
    for (const other of this.versionRows.values()) {
      if (other.status === 'active') other.status = 'retired';
    }
    row.status = 'active';
    row.activatedAt = this.clock();
    row.finishedAt = this.clock();
    row.symbolsCount = input.symbolsCount;
    row.source = input.source;
    row.log = input.log as unknown as Record<string, unknown>;
    row.progress = input.progress;
  }

  // ------------------------------------------------------------------ đọc

  private find(status: DatasetVersionStatus): MemoryVersion | undefined {
    return [...this.versionRows.values()]
      .filter((row) => row.status === status)
      .sort((a, b) => b.version - a.version)[0];
  }

  async activeVersion(): Promise<DatasetVersionRow | null> {
    const row = this.find('active');
    return row ? this.toRow(row) : null;
  }

  async activeVersionNumber(): Promise<number | null> {
    return this.find('active')?.version ?? null;
  }

  async buildingVersion(): Promise<DatasetVersionRow | null> {
    const row = this.find('building');
    return row ? this.toRow(row) : null;
  }

  async getVersion(version: number): Promise<DatasetVersionRow | null> {
    const row = this.versionRows.get(version);
    return row ? this.toRow(row) : null;
  }

  async listVersions(limit: number): Promise<DatasetVersionRow[]> {
    return [...this.versionRows.values()]
      .sort((a, b) => b.version - a.version)
      .slice(0, limit)
      .map((row) => this.toRow(row));
  }

  async latestFailedVersion(): Promise<DatasetVersionRow | null> {
    const row = this.find('failed');
    return row ? this.toRow(row) : null;
  }

  async listSymbols(version: number): Promise<DatasetSymbolRow[]> {
    return [...this.symbolRows.values()]
      .filter((row) => row.version === version)
      .sort(
        (a, b) =>
          Number(b.status === 'ok') - Number(a.status === 'ok') || a.symbol.localeCompare(b.symbol),
      );
  }

  async listOkSymbols(version: number): Promise<string[]> {
    return (await this.listSymbols(version)).filter((row) => row.status === 'ok').map((row) => row.symbol);
  }

  async loadPrefix(version: number, symbol: string): Promise<DatasetPrefix | null> {
    this.calls.loadPrefix += 1;
    return this.prefixRows.get(key(version, symbol)) ?? null;
  }

  async loadBars(version: number, symbol: string, from: number, count: number): Promise<DatasetCutRow[]> {
    this.calls.loadBars += 1;
    const bars = this.barRows.get(key(version, symbol)) ?? [];
    return bars.slice(from, from + count).map((bar) => ({
      idx: bar.idx,
      date: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    }));
  }

  // ------------------------------------------------------------------ cảnh báo

  async appendAlert(level: FlashbackAlertLevel, code: DatasetAlertCode, message: string): Promise<void> {
    this.alertRows.push({ runAt: this.clock(), level, code, message });
  }

  async hasRecentAlert(code: DatasetAlertCode, withinMinutes: number): Promise<boolean> {
    const since = this.clock().getTime() - withinMinutes * 60_000;
    return this.alertRows.some((row) => row.code === code && row.runAt.getTime() > since);
  }

  async countAlerts(code: DatasetAlertCode, withinHours: number): Promise<number> {
    const since = this.clock().getTime() - withinHours * 3_600_000;
    return this.alertRows.filter((row) => row.code === code && row.runAt.getTime() > since).length;
  }

  async listAlerts(limit: number): Promise<DatasetAlertRow[]> {
    return [...this.alertRows].sort((a, b) => b.runAt.getTime() - a.runAt.getTime()).slice(0, limit);
  }
}

/** Nguồn dữ liệu giả: rổ, lịch phiên, lịch sử từng mã và giá trị khớp thật do test đặt. */
export class FakeDatasetSource implements FlashbackDatasetSourcePort {
  basketSymbols: string[] = [];
  calendarDates: string[] = [];
  readonly histories = new Map<string, DatasetRawRow[]>();
  readonly historyErrors = new Map<string, Error>();
  basketError: Error | null = null;
  calendarError: Error | null = null;
  historySource = 'DNSE:x1000:adjusted';
  readonly historyCalls: Array<{ symbol: string; beforeDate: string; order: readonly DatasetPriceSource[] | undefined }> = [];
  matchedCalls = 0;
  /** Đặt để bật bước lấy giá trị khớp thật; trả `null` = nguồn không có dữ liệu của mã. */
  matchedValues?: (symbol: string, beforeDate: string) => Promise<ReadonlyMap<string, number> | null>;

  async basket(): Promise<DatasetBasket> {
    if (this.basketError) throw this.basketError;
    return { symbols: [...this.basketSymbols], source: 'VCI:VN100' };
  }

  async calendar(): Promise<DatasetCalendarData> {
    if (this.calendarError) throw this.calendarError;
    return { dates: [...this.calendarDates], source: 'DNSE:VNINDEX' };
  }

  async history(
    symbol: string,
    beforeDate: string,
    order?: readonly DatasetPriceSource[],
  ): Promise<DatasetHistory> {
    this.historyCalls.push({ symbol, beforeDate, order });
    const failure = this.historyErrors.get(symbol);
    if (failure) throw failure;
    const rows = this.histories.get(symbol);
    if (!rows) throw new Error('nguồn không có dữ liệu của mã');
    return { rows: rows.filter((row) => row.date < beforeDate), source: this.historySource };
  }
}
