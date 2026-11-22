import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';

/** `basket` = update 22-11 runs; the others are pre-22-11 runs (read-only, `legacy`). */
export type BacktestRunKind =
  'single' | 'sensitivity' | 'out_of_sample' | 'walk_forward' | 'portfolio' | 'basket';

export type StrategyRunSourceColumn = 'iqx' | 'user' | 'draft';

export type StoredRunError = {
  status: number;
  code: string;
  message: string;
  details?: unknown[];
};

export type BacktestRunRecord = {
  user_id: string;
  kind: BacktestRunKind;
  shared_revision: number | null;
  strategy_source: StrategyRunSourceColumn | null;
  strategy_ref_id: string | null;
  strategy_version: number | null;
  request: Record<string, unknown>;
  request_hash: string;
  snapshot: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  config_hash: string;
  data_hash: string | null;
  engine_version: string;
  calculation_version: string;
  rule_version: string;
  idempotency_key: string;
  status: 'succeeded' | 'failed';
  error: StoredRunError | null;
};

export type BacktestRunRow = BacktestRunRecord & {
  id: string;
  created_at: Date;
  /** Legacy columns, read for pre-22-11 runs only. */
  system_result?: Record<string, unknown> | null;
};

export type BacktestRunSummaryRow = {
  id: string;
  kind: BacktestRunKind;
  status: 'succeeded' | 'failed';
  strategy_source: StrategyRunSourceColumn | null;
  strategy_ref_id: string | null;
  strategy_version: number | null;
  created_at: Date;
  config_hash: string;
  /** Basket: `snapshot` labels; legacy: request symbol/start/end. */
  strategy_label: string | null;
  version_label: string | null;
  universe_label: string | null;
  start: string | null;
  end: string | null;
  symbol: string | null;
  /** Basket: result.kpis; legacy: engine kpis (system or single). */
  kpis: Record<string, unknown> | null;
};

export type BacktestListFilter = {
  strategy_source?: StrategyRunSourceColumn | undefined;
  strategy_id?: string | undefined;
  limit: number;
};

/** Persistence + owner-scoped lookups used by the backtest service (faked in unit tests). */
export interface StrategyBacktestStore {
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<BacktestRunRow | null>;
  /** Insert unless (user, idempotency_key) already exists; null when another request won. */
  insert(record: BacktestRunRecord): Promise<BacktestRunRow | null>;
  findById(userId: string, id: string): Promise<BacktestRunRow | null>;
  list(userId: string, filter: BacktestListFilter): Promise<BacktestRunSummaryRow[]>;
  /** One `iqx_template_used` event (§7.2): `strategy_run` for a stored IQX run. */
  recordIqxEvent(
    templateId: string,
    version: number,
    userId: string,
    event: 'strategy_run',
  ): Promise<void>;
}

const RUN_COLUMNS = `id, user_id, kind, shared_revision, strategy_source, strategy_ref_id,
  strategy_version, request, request_hash, snapshot, result, system_result, config_hash, data_hash,
  engine_version, calculation_version, rule_version, idempotency_key, status, error, created_at`;

type RawRunRow = Omit<BacktestRunRow, 'shared_revision' | 'strategy_version' | 'created_at'> & {
  shared_revision: number | string | null;
  strategy_version: number | string | null;
  created_at: Date | string;
};

const numOrNull = (value: number | string | null) => (value === null ? null : Number(value));

const toRunRow = (row: RawRunRow): BacktestRunRow => ({
  ...row,
  shared_revision: numOrNull(row.shared_revision),
  strategy_version: numOrNull(row.strategy_version),
  created_at: new Date(row.created_at),
  config_hash: row.config_hash.trim(),
  data_hash: row.data_hash?.trim() ?? null,
});

const json = (value: unknown): string | null => (value === null ? null : JSON.stringify(value));

@Injectable()
export class StrategyBacktestRepository implements StrategyBacktestStore {
  constructor(private readonly database: DatabaseService) {}

  async findByIdempotencyKey(userId: string, idempotencyKey: string) {
    const [row] = await this.database.query<RawRunRow>(
      `select ${RUN_COLUMNS} from backtest_runs where user_id = $1 and idempotency_key = $2`,
      [userId, idempotencyKey],
    );
    return row ? toRunRow(row) : null;
  }

  async insert(record: BacktestRunRecord) {
    const [row] = await this.database.query<RawRunRow>(
      `insert into backtest_runs
         (user_id, kind, shared_revision, strategy_source, strategy_ref_id, strategy_version,
          request, request_hash, snapshot, result, config_hash, data_hash, engine_version,
          calculation_version, rule_version, idempotency_key, status, error)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14,
               $15, $16, $17, $18::jsonb)
       on conflict (user_id, idempotency_key) do nothing
       returning ${RUN_COLUMNS}`,
      [
        record.user_id,
        record.kind,
        record.shared_revision,
        record.strategy_source,
        record.strategy_ref_id,
        record.strategy_version,
        JSON.stringify(record.request),
        record.request_hash,
        json(record.snapshot),
        json(record.result),
        record.config_hash,
        record.data_hash,
        record.engine_version,
        record.calculation_version,
        record.rule_version,
        record.idempotency_key,
        record.status,
        json(record.error),
      ],
    );
    return row ? toRunRow(row) : null;
  }

  async findById(userId: string, id: string) {
    const [row] = await this.database.query<RawRunRow>(
      `select ${RUN_COLUMNS} from backtest_runs where id = $1 and user_id = $2`,
      [id, userId],
    );
    return row ? toRunRow(row) : null;
  }

  async list(userId: string, filter: BacktestListFilter) {
    const rows = await this.database.query<
      Omit<BacktestRunSummaryRow, 'created_at' | 'strategy_version'> & {
        created_at: Date | string;
        strategy_version: number | string | null;
      }
    >(
      `select id, kind, status, strategy_source, strategy_ref_id, strategy_version, created_at,
              trim(config_hash) as config_hash,
              snapshot->>'strategy_label' as strategy_label,
              snapshot->>'version_label' as version_label,
              snapshot->>'universe_label' as universe_label,
              request->>'start' as start, request->>'end' as "end", request->>'symbol' as symbol,
              case when kind = 'basket' then result->'kpis'
                   else coalesce(system_result->'kpis', result->'kpis') end as kpis
         from backtest_runs
        where user_id = $1
          and ($2::text is null or strategy_source = $2::text)
          and ($3::text is null or strategy_ref_id = $3::text)
        order by created_at desc, id desc
        limit $4`,
      [userId, filter.strategy_source ?? null, filter.strategy_id ?? null, filter.limit],
    );
    return rows.map((row) => ({
      ...row,
      strategy_version: numOrNull(row.strategy_version),
      created_at: new Date(row.created_at),
    }));
  }

  async recordIqxEvent(templateId: string, version: number, userId: string, event: 'strategy_run') {
    await this.database.query(
      `insert into iqx_template_used (template_id, version, user_id, event) values ($1, $2, $3, $4)`,
      [templateId, version, userId, event],
    );
  }
}
