import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';

export type BacktestRunKind =
  'single' | 'sensitivity' | 'out_of_sample' | 'walk_forward' | 'portfolio';

export type StoredRunError = {
  status: number;
  code: string;
  message: string;
  details?: unknown[];
};

export type BacktestRunRecord = {
  user_id: string;
  kind: BacktestRunKind;
  shared_revision: number;
  request: Record<string, unknown>;
  request_hash: string;
  snapshot: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  research_result: Record<string, unknown> | null;
  system_result: Record<string, unknown> | null;
  config_hash: string;
  data_hash: string | null;
  engine_version: string;
  calculation_version: string;
  rule_version: string;
  idempotency_key: string;
  status: 'succeeded' | 'failed';
  error: StoredRunError | null;
};

export type BacktestRunRow = BacktestRunRecord & { id: string; created_at: Date };

export type BacktestRunSummaryRow = {
  id: string;
  kind: BacktestRunKind;
  status: 'succeeded' | 'failed';
  shared_revision: number;
  symbol: string;
  start: string;
  end: string;
  created_at: Date;
  config_hash: string;
  kpis: Record<string, unknown> | null;
  error_code: string | null;
};

/** Persistence + owner-scoped lookups used by the v2 backtest service (faked in unit tests). */
export interface StrategyBacktestStore {
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<BacktestRunRow | null>;
  /** Insert unless (user, idempotency_key) already exists; null when another request won. */
  insert(record: BacktestRunRecord): Promise<BacktestRunRow | null>;
  findById(userId: string, id: string): Promise<BacktestRunRow | null>;
  list(userId: string, limit: number): Promise<BacktestRunSummaryRow[]>;
  /** Tickers of the caller's own saved list snapshot; null when not found or not owned. */
  listTickers(userId: string, listId: string): Promise<string[] | null>;
  /** Active listed stocks of an exchange (HOSE also matches the legacy HSX code). */
  marketSymbols(market: 'HOSE' | 'HNX' | 'UPCOM' | 'ALL'): Promise<string[]>;
  /** Current ICB sector per symbol (not point-in-time); missing symbols are absent. */
  sectors(symbols: readonly string[]): Promise<Map<string, string | null>>;
}

const RUN_COLUMNS = `id, user_id, kind, shared_revision, request, request_hash, snapshot, result,
  research_result, system_result, config_hash, data_hash, engine_version, calculation_version,
  rule_version, idempotency_key, status, error, created_at`;

type RawRunRow = Omit<
  BacktestRunRow,
  'shared_revision' | 'created_at' | 'config_hash' | 'data_hash'
> & {
  shared_revision: number | string;
  created_at: Date | string;
  config_hash: string;
  data_hash: string | null;
};

const toRunRow = (row: RawRunRow): BacktestRunRow => ({
  ...row,
  shared_revision: Number(row.shared_revision),
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
         (user_id, kind, shared_revision, request, request_hash, snapshot, result, research_result,
          system_result, config_hash, data_hash, engine_version, calculation_version, rule_version,
          idempotency_key, status, error)
       values ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12,
               $13, $14, $15, $16, $17::jsonb)
       on conflict (user_id, idempotency_key) do nothing
       returning ${RUN_COLUMNS}`,
      [
        record.user_id,
        record.kind,
        record.shared_revision,
        JSON.stringify(record.request),
        record.request_hash,
        json(record.snapshot),
        json(record.result),
        json(record.research_result),
        json(record.system_result),
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

  async list(userId: string, limit: number) {
    const rows = await this.database.query<
      Omit<BacktestRunSummaryRow, 'shared_revision' | 'created_at'> & {
        shared_revision: number | string;
        created_at: Date | string;
      }
    >(
      `select id, kind, status, shared_revision, request->>'symbol' as symbol,
              request->>'start' as start, request->>'end' as "end", created_at,
              trim(config_hash) as config_hash,
              coalesce(system_result->'kpis', result->'kpis') as kpis,
              error->>'code' as error_code
         from backtest_runs
        where user_id = $1
        order by created_at desc, id desc
        limit $2`,
      [userId, limit],
    );
    return rows.map((row) => ({
      ...row,
      shared_revision: Number(row.shared_revision),
      created_at: new Date(row.created_at),
    }));
  }

  async listTickers(userId: string, listId: string) {
    const [row] = await this.database.query<{ tickers: string[] }>(
      `select tickers from list_snapshots where id = $1 and user_id = $2 and deleted_at is null`,
      [listId, userId],
    );
    return row ? row.tickers.map((ticker) => ticker.toUpperCase()) : null;
  }

  async marketSymbols(market: 'HOSE' | 'HNX' | 'UPCOM' | 'ALL') {
    const rows = await this.database.query<{ symbol: string }>(
      `select distinct upper(symbol) as symbol
         from symbols
        where is_active = true
          and coalesce(is_index, false) = false
          and lower(asset_type) = 'stock'
          and ($1::text = 'ALL' or upper(exchange) = $1 or ($1 = 'HOSE' and upper(exchange) = 'HSX'))
        order by 1`,
      [market],
    );
    return rows.map((row) => row.symbol);
  }

  async sectors(symbols: readonly string[]) {
    const rows = await this.database.query<{ symbol: string; sector: string | null }>(
      `select upper(symbol) as symbol,
              coalesce(nullif(trim(icb_lv2), ''), nullif(trim(icb_lv1), '')) as sector
         from symbols
        where upper(symbol) = any($1::text[])`,
      [symbols],
    );
    return new Map(rows.map((row) => [row.symbol, row.sector]));
  }
}
