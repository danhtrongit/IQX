import { randomUUID } from 'node:crypto';

import type { Bar } from '../../src/modules/quant/v2/index.js';
import { canonicalJson, sha256Hex } from '../../src/modules/quant/v2/index.js';
import {
  buildCalendar,
  type LoadedCase,
  type PracticeCaseDataPort,
} from '../../src/modules/practice/practice.data.js';
import type {
  AdvanceRow,
  CaseRow,
  FrozenBarRow,
  NewCase,
  NewProgress,
  NewRun,
  PracticeStore,
  PracticeStoreProvider,
  ProgressRow,
  ProgressSummaryRow,
  RunCompletion,
  RunHeader,
  RunRow,
  StoredError,
  SymbolDataRow,
} from '../../src/modules/practice/practice.repository.js';
import {
  defaultPracticeConfig,
  practiceEntry,
} from '../../src/modules/practice/practice.config.js';
import type {
  PracticeConfig,
  PracticeParamsConfig,
  PracticeRowsConfig,
} from '../../src/modules/practice/practice.types.js';
import { loadPracticeSet, type PracticeSet } from '../../src/modules/practice/practice.set.js';

/** Bars from closes: open = previous close (gap-free), wicks 1% around the body. */
export function makeBars(
  closes: readonly number[],
  options: { openOf?: (i: number) => number } = {},
): Bar[] {
  return closes.map((close, i) => {
    const open = options.openOf ? options.openOf(i) : (closes[i - 1] ?? close) - 1;
    const high = Math.max(open, close) + 2;
    const low = Math.min(open, close) - 2;
    return {
      date: `2000-01-${String((i % 28) + 1).padStart(2, '0')}`,
      open,
      high,
      low,
      close,
      volume: 1_000 + i,
    };
  });
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hashSeed = (text: string): number =>
  [...text].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);

/** Weekday calendar rows (a stand-in for a real market calendar) for a symbol-seeded walk. */
export function walkRows(symbol: string, from = '2021-09-01', to = '2026-06-30'): FrozenBarRow[] {
  const random = mulberry32(hashSeed(symbol));
  const rows: FrozenBarRow[] = [];
  let close = 20_000 + Math.floor(random() * 60_000);
  for (
    let day = new Date(`${from}T00:00:00Z`);
    day <= new Date(`${to}T00:00:00Z`);
    day = new Date(day.getTime() + 86_400_000)
  ) {
    if ([0, 6].includes(day.getUTCDay())) continue;
    const open = Math.max(1_000, Math.round(close * (1 + (random() - 0.5) * 0.01)));
    const next = Math.max(1_000, Math.round(open * (1 + (random() - 0.5) * 0.04)));
    const high = Math.max(open, next) + Math.round(random() * 300);
    const low = Math.max(500, Math.min(open, next) - Math.round(random() * 300));
    rows.push([
      day.toISOString().slice(0, 10),
      open,
      high,
      low,
      next,
      100_000 + Math.floor(random() * 900_000),
    ]);
    close = next;
  }
  return rows;
}

/** Frozen-data stub: deterministic bars per symbol, never touches a network or a database. */
export class FakeDataPort implements PracticeCaseDataPort {
  loads: string[] = [];
  failWith: Error | null = null;
  /** When set, the next `load` returns a calendar that makes the engine fail. */
  corruptOnce = false;
  private readonly cache = new Map<string, LoadedCase>();

  constructor(private readonly set: PracticeSet = loadPracticeSet()) {}

  async load(symbol: string): Promise<LoadedCase> {
    this.loads.push(symbol);
    await Promise.resolve();
    if (this.failWith) throw this.failWith;
    let loaded = this.cache.get(symbol);
    if (!loaded) {
      const rows = walkRows(symbol);
      loaded = {
        data_version: sha256Hex(canonicalJson({ symbol, rows: rows.length })),
        calendar: buildCalendar(rows, this.set),
        notes: ['prices_not_adjusted'],
      };
      this.cache.set(symbol, loaded);
    }
    if (this.corruptOnce) {
      this.corruptOnce = false;
      return {
        ...loaded,
        calendar: { ...loaded.calendar, lastTest: loaded.calendar.bars.length + 5 },
      };
    }
    return loaded;
  }

  /** Every historical date this stub can ever serve (for leak assertions). */
  allDates(symbol: string): string[] {
    return walkRows(symbol).map((row) => row[0]);
  }
}

const clone = <T>(value: T): T => structuredClone(value);

/**
 * In-memory store. Transactions are serialised (models the `for update` lock) and rolled back on
 * error; unique constraints and the DB triggers' rules are enforced like the real schema does.
 */
export class MemoryPracticeStore implements PracticeStoreProvider, PracticeStore {
  symbolRows: SymbolDataRow[] = [];
  progressRows: ProgressRow[] = [];
  caseRows: CaseRow[] = [];
  runRows: RunRow[] = [];
  advanceRows: AdvanceRow[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  store(): PracticeStore {
    return this;
  }

  transaction<T>(operation: (store: PracticeStore) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const snapshot = clone({
        symbolRows: this.symbolRows,
        progressRows: this.progressRows,
        caseRows: this.caseRows,
        runRows: this.runRows,
        advanceRows: this.advanceRows,
      });
      try {
        return await operation(this);
      } catch (error) {
        Object.assign(this, snapshot);
        throw error;
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async symbolData(setVersion: string, symbol: string) {
    await Promise.resolve();
    const row = this.symbolRows.find((r) => r.set_version === setVersion && r.symbol === symbol);
    return row ? clone(row) : null;
  }

  async insertSymbolData(row: SymbolDataRow) {
    await Promise.resolve();
    if (!this.symbolRows.some((r) => r.set_version === row.set_version && r.symbol === row.symbol))
      this.symbolRows.push(clone(row));
  }

  async progress(userId: string, indicatorId: string, setVersion: string) {
    await Promise.resolve();
    const row = this.progressRows.find(
      (r) => r.user_id === userId && r.indicator_id === indicatorId && r.set_version === setVersion,
    );
    return row ? clone(row) : null;
  }

  async progressSummaries(userId: string, setVersion: string): Promise<ProgressSummaryRow[]> {
    await Promise.resolve();
    return this.progressRows
      .filter((r) => r.user_id === userId && r.set_version === setVersion)
      .map((r) => ({
        indicator_id: r.indicator_id,
        cursor_ordinal: r.cursor_ordinal,
        completed_count: this.runRows.filter(
          (x) => x.progress_id === r.id && x.status === 'succeeded',
        ).length,
        current_status:
          this.runRows.find((x) => x.progress_id === r.id && x.ordinal === r.cursor_ordinal)
            ?.status ?? null,
      }));
  }

  async insertProgress(progress: NewProgress, cases: readonly NewCase[]) {
    await Promise.resolve();
    const exists = this.progressRows.some(
      (r) =>
        r.user_id === progress.user_id &&
        r.indicator_id === progress.indicator_id &&
        r.set_version === progress.set_version,
    );
    if (exists) return null;
    const now = new Date();
    const row: ProgressRow = {
      ...clone(progress),
      cursor_ordinal: 1,
      draft_revision: 1,
      created_at: now,
      updated_at: now,
    };
    this.progressRows.push(row);
    for (const item of cases) this.caseRows.push({ progress_id: progress.id, ...clone(item) });
    return clone(row);
  }

  async caseAt(progressId: string, ordinal: number) {
    await Promise.resolve();
    const row = this.caseRows.find((r) => r.progress_id === progressId && r.ordinal === ordinal);
    return row ? clone(row) : null;
  }

  async updateDraft(progressId: string, expectedRevision: number, draft: PracticeConfig) {
    await Promise.resolve();
    const row = this.progressRows.find((r) => r.id === progressId);
    if (!row || row.draft_revision !== expectedRevision) return null;
    row.draft = clone(draft);
    row.draft_revision += 1;
    row.updated_at = new Date();
    return clone(row);
  }

  async advanceCursor(progressId: string, expected: number) {
    await Promise.resolve();
    const row = this.progressRows.find((r) => r.id === progressId);
    if (!row || row.cursor_ordinal !== expected) return null;
    // Mirrors trg_practice_progress_guard + the 1..30 check constraint.
    if (expected >= 30) throw new Error('cursor out of range');
    if (
      !this.runRows.some(
        (r) => r.progress_id === progressId && r.ordinal === expected && r.status === 'succeeded',
      )
    )
      throw new Error('Practice cursor can advance only after the current run completed');
    row.cursor_ordinal = expected + 1;
    row.updated_at = new Date();
    return clone(row);
  }

  async advanceFrom(progressId: string, fromOrdinal: number) {
    await Promise.resolve();
    const row = this.advanceRows.find(
      (r) => r.progress_id === progressId && r.from_ordinal === fromOrdinal,
    );
    return row ? clone(row) : null;
  }

  async advanceByKey(progressId: string, idempotencyKey: string) {
    await Promise.resolve();
    const row = this.advanceRows.find(
      (r) => r.progress_id === progressId && r.idempotency_key === idempotencyKey,
    );
    return row ? clone(row) : null;
  }

  async insertAdvance(advance: AdvanceRow) {
    await Promise.resolve();
    if (
      this.advanceRows.some(
        (r) =>
          r.progress_id === advance.progress_id &&
          (r.from_ordinal === advance.from_ordinal ||
            r.idempotency_key === advance.idempotency_key),
      )
    )
      throw new Error('duplicate advance');
    this.advanceRows.push(clone(advance));
  }

  async runByOrdinal(progressId: string, ordinal: number) {
    await Promise.resolve();
    const row = this.runRows.find((r) => r.progress_id === progressId && r.ordinal === ordinal);
    return row ? clone(row) : null;
  }

  async runById(userId: string, runId: string) {
    await Promise.resolve();
    const row = this.runRows.find((r) => r.id === runId && r.user_id === userId);
    return row ? clone(row) : null;
  }

  async runByIdempotencyKey(userId: string, key: string) {
    await Promise.resolve();
    const row = this.runRows.find((r) => r.user_id === userId && r.idempotency_key === key);
    return row ? clone(row) : null;
  }

  async insertRun(run: NewRun) {
    await Promise.resolve();
    const conflict = this.runRows.some(
      (r) =>
        (r.user_id === run.user_id &&
          r.indicator_id === run.indicator_id &&
          r.set_version === run.set_version &&
          r.ordinal === run.ordinal) ||
        (r.user_id === run.user_id && r.idempotency_key === run.idempotency_key),
    );
    if (conflict) return null;
    const row: RunRow = {
      ...clone(run),
      status: 'computing',
      summary: null,
      result: null,
      chart: null,
      error: null,
      attempts: 0,
      created_at: new Date(),
      completed_at: null,
    };
    this.runRows.push(row);
    return clone(row);
  }

  async completeRun(runId: string, completion: RunCompletion) {
    await Promise.resolve();
    const row = this.runRows.find((r) => r.id === runId);
    if (!row || row.status === 'succeeded') return null;
    Object.assign(row, clone(completion), {
      status: 'succeeded',
      error: null,
      attempts: row.attempts + 1,
      completed_at: new Date(),
    });
    return clone(row);
  }

  async failRun(runId: string, error: StoredError) {
    await Promise.resolve();
    const row = this.runRows.find((r) => r.id === runId);
    if (!row || row.status === 'succeeded') return null;
    Object.assign(row, { status: 'failed', error: clone(error), attempts: row.attempts + 1 });
    return clone(row);
  }

  async discardUnfinishedRun(progressId: string, runId: string) {
    await Promise.resolve();
    // Mirrors `delete ... where status in ('computing', 'failed')`: a completed run is never removed.
    const index = this.runRows.findIndex(
      (r) => r.id === runId && r.progress_id === progressId && r.status !== 'succeeded',
    );
    if (index < 0) return false;
    this.runRows.splice(index, 1);
    return true;
  }

  async runHeaders(progressId: string): Promise<RunHeader[]> {
    await Promise.resolve();
    return this.runRows
      .filter((r) => r.progress_id === progressId)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((r) => {
        const { result: _result, chart: _chart, ...header } = clone(r);
        return header;
      });
  }

  async historyPage(progressId: string, limit: number, offset: number) {
    await Promise.resolve();
    const all = (await this.runHeaders(progressId))
      .filter((r) => r.status === 'succeeded')
      .sort((a, b) => b.ordinal - a.ordinal);
    return { rows: all.slice(offset, offset + limit), total: all.length };
  }
}

export const USER = '00000000-0000-4000-8000-000000000001';
export const OTHER_USER = '00000000-0000-4000-8000-000000000002';

export const newKey = (): string => `key-${randomUUID()}`;

/**
 * A condition config in the format written before SPEC V3 (`params` + `ops` per tab, no rows).
 * It is what drafts and locked runs of the row-based indicators still hold after the deploy.
 */
export const preV3Config = (
  options: { buy?: boolean; sell?: boolean; hold?: number } = {},
): PracticeParamsConfig => ({
  buy: {
    enabled: options.buy ?? true,
    params: { period: 10, level: 25 },
    ops: { r1: '<', r2: '>' },
  },
  sell: {
    enabled: options.sell ?? true,
    params: { period: 10, level: 75 },
    ops: { r1: '>', r2: '<' },
  },
  hold_max_sessions: options.hold ?? 40,
});

/**
 * Adds a run of an existing case that was locked in the pre-V3 format (RSI, `iqx-rules-3.0`,
 * `practice-engine-1`), the way the database holds it after the deploy.
 */
export function addPreV3Run(
  store: MemoryPracticeStore,
  caseId: string,
  status: 'computing' | 'failed' | 'succeeded',
  overrides: Partial<RunRow> = {},
): RunRow {
  const set = loadPracticeSet();
  const caseRow = store.caseRows.find((row) => row.case_id === caseId);
  if (!caseRow) throw new Error('unknown case');
  const config = preV3Config();
  const row: RunRow = {
    id: '00000000-0000-4000-8000-0000000000d1',
    progress_id: caseRow.progress_id,
    user_id: USER,
    indicator_id: 'rsi',
    set_version: set.set_version,
    ordinal: caseRow.ordinal,
    case_id: caseId,
    status,
    config,
    config_hash: 'a'.repeat(64),
    hold_max_sessions: config.hold_max_sessions,
    idempotency_key: 'old-run-key-0001',
    request_hash: 'b'.repeat(64),
    data_version: 'c'.repeat(64),
    profile_version: 'mini-profile-v1',
    calculation_version: 'iqx-ta-2.0',
    rule_version: 'iqx-rules-3.0',
    engine_version: 'practice-engine-1',
    execution_version: set.versions.execution,
    comment_version: set.versions.comment,
    summary: null,
    error:
      status === 'failed' ? { code: 'PRACTICE_COMPUTE_FAILED', message: 'Không tính được.' } : null,
    attempts: status === 'computing' ? 0 : 1,
    created_at: new Date('2026-10-01T00:00:00Z'),
    completed_at: null,
    result: null,
    chart: null,
    ...overrides,
  };
  store.runRows.push(row);
  return row;
}

/**
 * RSI rows that trade on every case: buy while RSI > 0, sell while RSI < 100 (one row per tab).
 * The registry defaults (RSI < 30 / RSI > 70, plus the trend row) trade on only some of the 30
 * symbols and the case order is random, so a test that needs trades cannot rely on them.
 */
export function tradingRsiConfig(hold = 10): PracticeRowsConfig {
  const config = structuredClone(
    defaultPracticeConfig(practiceEntry('rsi')!) as PracticeRowsConfig,
  );
  Object.assign(config.buy.rules[0]!, { op: '>', threshold: 0 });
  Object.assign(config.sell.rules[0]!, { op: '<', threshold: 100 });
  config.buy.rules[1]!.enabled = false;
  config.sell.rules[1]!.enabled = false;
  config.hold_max_sessions = hold;
  return config;
}
