/**
 * Kho mẫu nến tính sẵn của Flashback trong bộ nhớ cho test (Candle Dojo v1.3, migration 0046): cùng
 * quy tắc với bản Postgres (một lần chạy `running` mỗi phiên bản, ghi một mã thay thế giá gốc và mẫu,
 * ghi thẻ của ván chỉ khi người chơi sở hữu thẻ) và đọc nến từ `MemoryDatasetRepository`.
 */

import type { DatasetBar } from '../../../src/modules/flashback/flashback-dataset.logic.js';
import {
  FlashbackPatternsRepository,
  type FinishRun,
  type MatchCardRow,
  type NewRun,
  type PatternCountRow,
  type PatternExchange,
  type PatternLookupFilter,
  type PatternRawRow,
  type PatternRow,
  type PatternRunRow,
  type PatternSeriesBar,
} from '../../../src/modules/flashback/flashback-patterns.repository.js';
import type { MemoryDatasetRepository } from './flashback-dataset-memory.js';

type MutableRun = { -readonly [K in keyof PatternRunRow]: PatternRunRow[K] };

const key = (...parts: Array<string | number>): string => parts.join(':');

export class MemoryPatternsRepository extends FlashbackPatternsRepository {
  readonly runs: MutableRun[] = [];
  /** `version:symbol` → giá gốc đã lưu. */
  readonly rawRows = new Map<string, { exchange: PatternExchange; rows: PatternRawRow[] }>();
  /** `version:symbol:detector` → mẫu. */
  readonly patternRows = new Map<string, PatternRow[]>();
  readonly exchangeBySymbol = new Map<string, PatternExchange>();
  /** `userId:cardId` → thẻ đang sở hữu, giá trị là `seen_at`. */
  readonly owned = new Map<string, Date | null>();
  readonly matchCardRows: Array<{ matchId: string; userId: string; playIdx: number; cardId: string; cardN: number }> = [];
  /** Các mã mà `loadSeries` / `saveSymbol` phải ném lỗi. */
  readonly failLoadFor = new Set<string>();
  readonly failSaveFor = new Set<string>();
  readonly calls = { patternAt: 0, latestDoneRun: 0, recordCard: 0, saveSymbol: 0 };
  private nextRun = 1;

  constructor(
    private readonly datasets: MemoryDatasetRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  // ------------------------------------------------------------------ dựng sẵn dữ liệu

  /** Người chơi mua thẻ (chưa gặp). */
  own(userId: string, cardId: string): void {
    this.owned.set(key(userId, cardId), null);
  }

  /** Ghi thẳng một lần chạy đã xong (bỏ qua bộ tính). */
  seedRun(input: Partial<PatternRunRow> & { version: number }): PatternRunRow {
    const now = this.clock();
    const run: MutableRun = {
      id: this.nextRun++,
      detectorVersion: 1,
      status: 'done',
      trigger: 'build',
      requestedBy: null,
      startedAt: now,
      heartbeatAt: now,
      finishedAt: now,
      symbolsDone: 0,
      symbolsTotal: 0,
      patternsCount: 0,
      log: {},
      ...input,
    };
    this.runs.push(run);
    return { ...run };
  }

  seedPattern(version: number, symbol: string, detectorVersion: number, row: PatternRow): void {
    const k = key(version, symbol, detectorVersion);
    this.patternRows.set(k, [...(this.patternRows.get(k) ?? []), row]);
  }

  allPatterns(version: number, symbol: string, detectorVersion: number): PatternRow[] {
    return [...(this.patternRows.get(key(version, symbol, detectorVersion)) ?? [])];
  }

  // ------------------------------------------------------------------ nhật ký chạy

  async failStaleRuns(staleMs: number): Promise<number> {
    let closed = 0;
    for (const run of this.runs) {
      if (run.status !== 'running') continue;
      if (this.clock().getTime() - run.heartbeatAt.getTime() < staleMs) continue;
      run.status = 'failed';
      run.finishedAt = this.clock();
      run.log = { ...run.log, error: 'Lần tính mẫu nến bị ngắt giữa chừng' };
      closed += 1;
    }
    return closed;
  }

  async createRun(input: NewRun): Promise<PatternRunRow | null> {
    if (this.runs.some((run) => run.version === input.version && run.status === 'running')) return null;
    const now = this.clock();
    const run: MutableRun = {
      id: this.nextRun++,
      version: input.version,
      detectorVersion: input.detectorVersion,
      status: 'running',
      trigger: input.trigger,
      requestedBy: input.requestedBy,
      startedAt: now,
      heartbeatAt: now,
      finishedAt: null,
      symbolsDone: 0,
      symbolsTotal: input.symbolsTotal,
      patternsCount: 0,
      log: {},
    };
    this.runs.push(run);
    return { ...run };
  }

  async touchRun(runId: number, progress: { symbolsDone: number; patternsCount: number }): Promise<void> {
    const run = this.runs.find((item) => item.id === runId && item.status === 'running');
    if (!run) return;
    run.symbolsDone = progress.symbolsDone;
    run.patternsCount = progress.patternsCount;
    run.heartbeatAt = this.clock();
  }

  async finishRun(runId: number, input: FinishRun): Promise<void> {
    const run = this.runs.find((item) => item.id === runId);
    if (!run) return;
    run.status = input.status;
    run.finishedAt = this.clock();
    run.heartbeatAt = this.clock();
    run.symbolsDone = input.symbolsDone;
    run.patternsCount = input.patternsCount;
    run.log = input.log;
  }

  async latestRun(version: number): Promise<PatternRunRow | null> {
    const run = this.runs.filter((item) => item.version === version).sort((a, b) => b.id - a.id)[0];
    return run ? { ...run } : null;
  }

  async latestDoneRun(version: number): Promise<PatternRunRow | null> {
    this.calls.latestDoneRun += 1;
    const run = this.runs
      .filter((item) => item.version === version && item.status === 'done')
      .sort((a, b) => b.id - a.id)[0];
    return run ? { ...run } : null;
  }

  // ------------------------------------------------------------------ đầu vào

  async okSymbols(version: number): Promise<string[]> {
    return [...this.datasets.symbolRows.values()]
      .filter((row) => row.version === version && row.status === 'ok')
      .map((row) => row.symbol)
      .sort();
  }

  async loadSeries(version: number, symbol: string): Promise<PatternSeriesBar[]> {
    if (this.failLoadFor.has(symbol)) throw new Error(`lỗi đọc nến của ${symbol}`);
    const bars: readonly DatasetBar[] = this.datasets.barRows.get(key(version, symbol)) ?? [];
    return bars.map((bar) => ({
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

  async loadRaw(version: number, symbol: string): Promise<{ exchange: PatternExchange; rows: PatternRawRow[] }> {
    const stored = this.rawRows.get(key(version, symbol));
    return stored ? { exchange: stored.exchange, rows: [...stored.rows] } : { exchange: 'HOSE', rows: [] };
  }

  async exchanges(symbols: readonly string[]): Promise<Map<string, PatternExchange>> {
    const out = new Map<string, PatternExchange>();
    for (const symbol of symbols) {
      const exchange = this.exchangeBySymbol.get(symbol.toUpperCase());
      if (exchange) out.set(symbol.toUpperCase(), exchange);
    }
    return out;
  }

  async saveSymbol(input: {
    version: number;
    symbol: string;
    detectorVersion: number;
    exchange: PatternExchange;
    raw: readonly PatternRawRow[] | null;
    patterns: readonly PatternRow[];
  }): Promise<void> {
    this.calls.saveSymbol += 1;
    if (this.failSaveFor.has(input.symbol)) throw new Error(`lỗi ghi mẫu của ${input.symbol}`);
    if (input.raw !== null)
      this.rawRows.set(key(input.version, input.symbol), { exchange: input.exchange, rows: [...input.raw] });
    this.patternRows.set(key(input.version, input.symbol, input.detectorVersion), [...input.patterns]);
  }

  // ------------------------------------------------------------------ thống kê

  private grouped(rows: readonly PatternRow[]): PatternCountRow[] {
    const counts = new Map<string, PatternCountRow>();
    for (const row of rows) {
      const found = counts.get(row.cardId);
      counts.set(row.cardId, { cardId: row.cardId, tier: row.tier, count: (found?.count ?? 0) + 1 });
    }
    return [...counts.values()].sort(
      (a, b) => a.tier - b.tier || b.count - a.count || a.cardId.localeCompare(b.cardId),
    );
  }

  async countByCard(filter: PatternLookupFilter): Promise<PatternCountRow[]> {
    const rows: PatternRow[] = [];
    for (const [k, list] of this.patternRows) {
      const [version, symbol, detector] = k.split(':');
      if (Number(version) !== filter.version || Number(detector) !== filter.detectorVersion) continue;
      if (filter.symbol !== null && symbol !== filter.symbol) continue;
      rows.push(...list.filter((row) => row.date >= filter.from && row.date <= filter.to));
    }
    return this.grouped(rows);
  }

  async overview(version: number, detectorVersion: number): Promise<PatternCountRow[]> {
    const rows: PatternRow[] = [];
    for (const [k, list] of this.patternRows) {
      const [v, , detector] = k.split(':');
      if (Number(v) === version && Number(detector) === detectorVersion) rows.push(...list);
    }
    return this.grouped(rows);
  }

  async rawCoverage(version: number): Promise<{ symbols: number; sessions: number }> {
    let symbols = 0;
    let sessions = 0;
    for (const [k, stored] of this.rawRows) {
      if (!k.startsWith(`${version}:`) || stored.rows.length === 0) continue;
      symbols += 1;
      sessions += stored.rows.length;
    }
    return { symbols, sessions };
  }

  // ------------------------------------------------------------------ lúc chơi

  async patternAt(
    version: number,
    symbol: string,
    idx: number,
    detectorVersion: number,
  ): Promise<{ cardId: string; cardN: number } | null> {
    this.calls.patternAt += 1;
    const row = this.patternRows.get(key(version, symbol, detectorVersion))?.find((item) => item.idx === idx);
    return row ? { cardId: row.cardId, cardN: row.cardN } : null;
  }

  async recordCard(input: {
    matchId: string;
    userId: string;
    playIdx: number;
    cardId: string;
    cardN: number;
  }): Promise<boolean> {
    this.calls.recordCard += 1;
    const ownKey = key(input.userId, input.cardId);
    if (!this.owned.has(ownKey)) return false;
    const exists = this.matchCardRows.some(
      (row) => row.matchId === input.matchId && row.userId === input.userId && row.playIdx === input.playIdx,
    );
    if (!exists) this.matchCardRows.push({ ...input });
    if (this.owned.get(ownKey) === null) this.owned.set(ownKey, this.clock());
    return true;
  }

  async matchCards(matchId: string, userId: string, upToPlayIdx: number): Promise<MatchCardRow[]> {
    return this.matchCardRows
      .filter((row) => row.matchId === matchId && row.userId === userId && row.playIdx <= upToPlayIdx)
      .sort((a, b) => a.playIdx - b.playIdx)
      .map((row) => ({ playIdx: row.playIdx, cardId: row.cardId, cardN: row.cardN }));
  }
}
