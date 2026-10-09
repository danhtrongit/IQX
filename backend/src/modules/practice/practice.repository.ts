import { Injectable } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import type { PracticeConfig } from './practice.types.js';

/** `[YYYY-MM-DD, open, high, low, close, volume]` (server-only; dates never leave the server). */
export type FrozenBarRow = [string, number, number, number, number, number];

export type SymbolDataRow = {
  set_version: string;
  symbol: string;
  data_version: string;
  source: string | null;
  source_priority: number | null;
  adjusted: boolean;
  price_scale: number;
  warmup_bars: number;
  observation_bars: number;
  test_bars: number;
  warnings: string[];
  bars: FrozenBarRow[];
};

export type ProgressRow = {
  id: string;
  user_id: string;
  indicator_id: string;
  set_version: string;
  cursor_ordinal: number;
  draft: PracticeConfig;
  draft_revision: number;
  created_at: Date;
  updated_at: Date;
};

export type NewProgress = Pick<ProgressRow, 'id' | 'user_id' | 'indicator_id' | 'set_version'> & {
  draft: PracticeConfig;
};

export type CaseRow = { progress_id: string; ordinal: number; case_id: string; symbol: string };
export type NewCase = Pick<CaseRow, 'ordinal' | 'case_id' | 'symbol'>;

export type ProgressSummaryRow = {
  indicator_id: string;
  cursor_ordinal: number;
  completed_count: number;
  current_status: RunStatus | null;
};

export type RunStatus = 'computing' | 'succeeded' | 'failed';

export type StoredError = { code: string; message: string };

export type RunHeader = {
  id: string;
  progress_id: string;
  user_id: string;
  indicator_id: string;
  set_version: string;
  ordinal: number;
  case_id: string;
  status: RunStatus;
  config: PracticeConfig;
  config_hash: string;
  hold_max_sessions: number;
  idempotency_key: string;
  request_hash: string;
  data_version: string;
  profile_version: string;
  calculation_version: string;
  rule_version: string;
  engine_version: string;
  execution_version: string;
  comment_version: string;
  summary: Record<string, unknown> | null;
  error: StoredError | null;
  attempts: number;
  created_at: Date;
  completed_at: Date | null;
};

export type RunRow = RunHeader & {
  result: Record<string, unknown> | null;
  chart: Record<string, unknown> | null;
};

export type NewRun = Pick<
  RunHeader,
  | 'id'
  | 'progress_id'
  | 'user_id'
  | 'indicator_id'
  | 'set_version'
  | 'ordinal'
  | 'case_id'
  | 'config'
  | 'config_hash'
  | 'hold_max_sessions'
  | 'idempotency_key'
  | 'request_hash'
  | 'data_version'
  | 'profile_version'
  | 'calculation_version'
  | 'rule_version'
  | 'engine_version'
  | 'execution_version'
  | 'comment_version'
>;

export type RunCompletion = {
  summary: Record<string, unknown>;
  result: Record<string, unknown>;
  chart: Record<string, unknown>;
};

export type AdvanceRow = {
  progress_id: string;
  from_ordinal: number;
  to_ordinal: number;
  idempotency_key: string;
};

/** Persistence used by the practice service; one instance per client/transaction. */
export interface PracticeStore {
  symbolData(setVersion: string, symbol: string): Promise<SymbolDataRow | null>;
  /** Inserts the frozen bars unless another worker froze them first (never overwrites). */
  insertSymbolData(row: SymbolDataRow): Promise<void>;

  /** With `lock` the row is held `for update` until the transaction ends. */
  progress(
    userId: string,
    indicatorId: string,
    setVersion: string,
    options?: { lock?: boolean },
  ): Promise<ProgressRow | null>;
  progressSummaries(userId: string, setVersion: string): Promise<ProgressSummaryRow[]>;
  /** Creates the progress row and its 30 cases; null when it already exists. */
  insertProgress(progress: NewProgress, cases: readonly NewCase[]): Promise<ProgressRow | null>;
  caseAt(progressId: string, ordinal: number): Promise<CaseRow | null>;
  /** Optimistic draft write; null when `expectedRevision` is stale. */
  updateDraft(
    progressId: string,
    expectedRevision: number,
    draft: PracticeConfig,
  ): Promise<ProgressRow | null>;
  /** Moves the cursor from `expected` to `expected + 1`; null when the cursor is not `expected`. */
  advanceCursor(progressId: string, expected: number): Promise<ProgressRow | null>;
  advanceFrom(progressId: string, fromOrdinal: number): Promise<AdvanceRow | null>;
  advanceByKey(progressId: string, idempotencyKey: string): Promise<AdvanceRow | null>;
  insertAdvance(advance: AdvanceRow): Promise<void>;

  runByOrdinal(progressId: string, ordinal: number): Promise<RunRow | null>;
  runById(userId: string, runId: string): Promise<RunRow | null>;
  runByIdempotencyKey(userId: string, idempotencyKey: string): Promise<RunRow | null>;
  /** Inserts a locked run; null when the (owner, indicator, set, ordinal) or key already exists. */
  insertRun(run: NewRun): Promise<RunRow | null>;
  /** `computing|failed` -> `succeeded` (immutable afterwards); null when already completed. */
  completeRun(runId: string, completion: RunCompletion): Promise<RunRow | null>;
  /** Keeps the reservation: marks the run failed with an error for a later retry. */
  failRun(runId: string, error: StoredError): Promise<RunRow | null>;
  runHeaders(progressId: string): Promise<RunHeader[]>;
  historyPage(
    progressId: string,
    limit: number,
    offset: number,
  ): Promise<{ rows: RunHeader[]; total: number }>;
}

export interface PracticeStoreProvider {
  store(): PracticeStore;
  transaction<T>(operation: (store: PracticeStore) => Promise<T>): Promise<T>;
}

/** Nest injection token of the store provider (repository in production, memory in tests). */
export const PRACTICE_STORE = Symbol('PRACTICE_STORE');

const PROGRESS_COLUMNS = `id, user_id, indicator_id, set_version, cursor_ordinal, draft, draft_revision,
  created_at, updated_at`;
const HEADER_COLUMNS = `id, progress_id, user_id, indicator_id, set_version, ordinal, case_id, status,
  config, config_hash, hold_max_sessions, idempotency_key, request_hash, data_version,
  profile_version, calculation_version, rule_version, engine_version, execution_version,
  comment_version, summary, error, attempts, created_at, completed_at`;
const RUN_COLUMNS = `${HEADER_COLUMNS}, result, chart`;
const SYMBOL_COLUMNS = `set_version, symbol, data_version, source, source_priority, adjusted,
  price_scale, warmup_bars, observation_bars, test_bars, warnings, bars`;

export class PracticeSqlStore implements PracticeStore {
  constructor(private readonly client: SqlClient) {}

  async symbolData(setVersion: string, symbol: string) {
    const rows = await this.client.query<SymbolDataRow>(
      `select ${SYMBOL_COLUMNS} from practice_symbol_data where set_version = $1 and symbol = $2`,
      [setVersion, symbol],
    );
    return rows[0] ?? null;
  }

  async insertSymbolData(row: SymbolDataRow) {
    await this.client.query(
      `insert into practice_symbol_data
         (set_version, symbol, data_version, source, source_priority, adjusted, price_scale,
          warmup_bars, observation_bars, test_bars, warnings, bars)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)
       on conflict (set_version, symbol) do nothing`,
      [
        row.set_version,
        row.symbol,
        row.data_version,
        row.source,
        row.source_priority,
        row.adjusted,
        row.price_scale,
        row.warmup_bars,
        row.observation_bars,
        row.test_bars,
        JSON.stringify(row.warnings),
        JSON.stringify(row.bars),
      ],
    );
  }

  async progress(
    userId: string,
    indicatorId: string,
    setVersion: string,
    options: { lock?: boolean } = {},
  ) {
    const rows = await this.client.query<ProgressRow>(
      `select ${PROGRESS_COLUMNS} from practice_progress
       where user_id = $1 and indicator_id = $2 and set_version = $3${options.lock ? ' for update' : ''}`,
      [userId, indicatorId, setVersion],
    );
    return rows[0] ?? null;
  }

  async progressSummaries(userId: string, setVersion: string) {
    const rows = await this.client.query<ProgressSummaryRow>(
      `select p.indicator_id,
              p.cursor_ordinal::int as cursor_ordinal,
              count(r.id) filter (where r.status = 'succeeded')::int as completed_count,
              max(r.status) filter (where r.ordinal = p.cursor_ordinal) as current_status
       from practice_progress p
       left join practice_runs r on r.progress_id = p.id
       where p.user_id = $1 and p.set_version = $2
       group by p.id`,
      [userId, setVersion],
    );
    return rows;
  }

  async insertProgress(progress: NewProgress, cases: readonly NewCase[]) {
    const rows = await this.client.query<ProgressRow>(
      `insert into practice_progress (id, user_id, indicator_id, set_version, draft)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (user_id, indicator_id, set_version) do nothing
       returning ${PROGRESS_COLUMNS}`,
      [
        progress.id,
        progress.user_id,
        progress.indicator_id,
        progress.set_version,
        JSON.stringify(progress.draft),
      ],
    );
    const created = rows[0];
    if (!created) return null;
    await this.client.query(
      `insert into practice_cases (progress_id, ordinal, case_id, symbol)
       select $1::uuid, c.ordinal, c.case_id, c.symbol
       from unnest($2::int[], $3::uuid[], $4::text[]) as c(ordinal, case_id, symbol)`,
      [
        progress.id,
        cases.map((item) => item.ordinal),
        cases.map((item) => item.case_id),
        cases.map((item) => item.symbol),
      ],
    );
    return created;
  }

  async caseAt(progressId: string, ordinal: number) {
    const rows = await this.client.query<CaseRow>(
      `select progress_id, ordinal::int as ordinal, case_id, symbol
       from practice_cases where progress_id = $1 and ordinal = $2`,
      [progressId, ordinal],
    );
    return rows[0] ?? null;
  }

  async updateDraft(progressId: string, expectedRevision: number, draft: PracticeConfig) {
    const rows = await this.client.query<ProgressRow>(
      `update practice_progress
       set draft = $3::jsonb, draft_revision = draft_revision + 1, updated_at = now()
       where id = $1 and draft_revision = $2
       returning ${PROGRESS_COLUMNS}`,
      [progressId, expectedRevision, JSON.stringify(draft)],
    );
    return rows[0] ?? null;
  }

  async advanceCursor(progressId: string, expected: number) {
    const rows = await this.client.query<ProgressRow>(
      `update practice_progress
       set cursor_ordinal = cursor_ordinal + 1, updated_at = now()
       where id = $1 and cursor_ordinal = $2
       returning ${PROGRESS_COLUMNS}`,
      [progressId, expected],
    );
    return rows[0] ?? null;
  }

  async advanceFrom(progressId: string, fromOrdinal: number) {
    const rows = await this.client.query<AdvanceRow>(
      `select progress_id, from_ordinal::int as from_ordinal, to_ordinal::int as to_ordinal,
              idempotency_key
       from practice_advances where progress_id = $1 and from_ordinal = $2`,
      [progressId, fromOrdinal],
    );
    return rows[0] ?? null;
  }

  async advanceByKey(progressId: string, idempotencyKey: string) {
    const rows = await this.client.query<AdvanceRow>(
      `select progress_id, from_ordinal::int as from_ordinal, to_ordinal::int as to_ordinal,
              idempotency_key
       from practice_advances where progress_id = $1 and idempotency_key = $2`,
      [progressId, idempotencyKey],
    );
    return rows[0] ?? null;
  }

  async insertAdvance(advance: AdvanceRow) {
    await this.client.query(
      `insert into practice_advances (progress_id, from_ordinal, to_ordinal, idempotency_key)
       values ($1, $2, $3, $4)`,
      [advance.progress_id, advance.from_ordinal, advance.to_ordinal, advance.idempotency_key],
    );
  }

  async runByOrdinal(progressId: string, ordinal: number) {
    const rows = await this.client.query<RunRow>(
      `select ${RUN_COLUMNS} from practice_runs where progress_id = $1 and ordinal = $2`,
      [progressId, ordinal],
    );
    return rows[0] ?? null;
  }

  async runById(userId: string, runId: string) {
    const rows = await this.client.query<RunRow>(
      `select ${RUN_COLUMNS} from practice_runs where id = $1 and user_id = $2`,
      [runId, userId],
    );
    return rows[0] ?? null;
  }

  async runByIdempotencyKey(userId: string, idempotencyKey: string) {
    const rows = await this.client.query<RunRow>(
      `select ${RUN_COLUMNS} from practice_runs where user_id = $1 and idempotency_key = $2`,
      [userId, idempotencyKey],
    );
    return rows[0] ?? null;
  }

  async insertRun(run: NewRun) {
    const rows = await this.client.query<RunRow>(
      `insert into practice_runs
         (id, progress_id, user_id, indicator_id, set_version, ordinal, case_id, config,
          config_hash, hold_max_sessions, idempotency_key, request_hash, data_version,
          profile_version, calculation_version, rule_version, engine_version,
          execution_version, comment_version)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16,
               $17, $18, $19)
       on conflict do nothing
       returning ${RUN_COLUMNS}`,
      [
        run.id,
        run.progress_id,
        run.user_id,
        run.indicator_id,
        run.set_version,
        run.ordinal,
        run.case_id,
        JSON.stringify(run.config),
        run.config_hash,
        run.hold_max_sessions,
        run.idempotency_key,
        run.request_hash,
        run.data_version,
        run.profile_version,
        run.calculation_version,
        run.rule_version,
        run.engine_version,
        run.execution_version,
        run.comment_version,
      ],
    );
    return rows[0] ?? null;
  }

  async completeRun(runId: string, completion: RunCompletion) {
    const rows = await this.client.query<RunRow>(
      `update practice_runs
       set status = 'succeeded', summary = $2::jsonb, result = $3::jsonb, chart = $4::jsonb,
           error = null, attempts = attempts + 1, completed_at = now()
       where id = $1 and status in ('computing', 'failed')
       returning ${RUN_COLUMNS}`,
      [
        runId,
        JSON.stringify(completion.summary),
        JSON.stringify(completion.result),
        JSON.stringify(completion.chart),
      ],
    );
    return rows[0] ?? null;
  }

  async failRun(runId: string, error: StoredError) {
    const rows = await this.client.query<RunRow>(
      `update practice_runs
       set status = 'failed', error = $2::jsonb, attempts = attempts + 1
       where id = $1 and status in ('computing', 'failed')
       returning ${RUN_COLUMNS}`,
      [runId, JSON.stringify(error)],
    );
    return rows[0] ?? null;
  }

  runHeaders(progressId: string) {
    return this.client.query<RunHeader>(
      `select ${HEADER_COLUMNS} from practice_runs where progress_id = $1 order by ordinal`,
      [progressId],
    );
  }

  async historyPage(progressId: string, limit: number, offset: number) {
    const rows = await this.client.query<RunHeader>(
      `select ${HEADER_COLUMNS} from practice_runs
       where progress_id = $1 and status = 'succeeded'
       order by ordinal desc limit $2 offset $3`,
      [progressId, limit, offset],
    );
    const totals = await this.client.query<{ total: number }>(
      `select count(*)::int as total from practice_runs
       where progress_id = $1 and status = 'succeeded'`,
      [progressId],
    );
    return { rows, total: Number(totals[0]?.total ?? 0) };
  }
}

@Injectable()
export class PracticeRepository implements PracticeStoreProvider {
  constructor(private readonly database: DatabaseService) {}

  store(): PracticeStore {
    return new PracticeSqlStore(this.database);
  }

  transaction<T>(operation: (store: PracticeStore) => Promise<T>): Promise<T> {
    return this.database.transaction((client) => operation(new PracticeSqlStore(client)));
  }
}
