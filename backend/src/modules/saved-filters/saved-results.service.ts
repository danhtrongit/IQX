import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import { readStoredDefinition } from '../screener/screener.definition.js';
import type { ScreenerRow } from '../screener/screener.schemas.js';
import { vnDate } from '../strategy-config/strategy-config.calendar.js';
import { findBotUsage, listInUseByBot } from './saved-filters.bot-usage.js';
import type { FilterDefinition } from './saved-filters.definition.js';
import { canonicalHash } from './saved-filters.hash.js';
import type {
  ListFromResultInput,
  ResultSnapshot,
  ResultSnapshotCreateInput,
  ResultSnapshotSummary,
  SavedList,
  SelectionInput,
} from './saved-filters.schemas.js';
import { LIST_COLUMNS, toSavedList } from './saved-filters.service.js';

type Timestamp = Date | string;

type RunRecord = {
  id: string;
  definition: FilterDefinition;
  as_of: Timestamp;
  data_source: string;
  calculation_version: string;
  registry_version: string;
  summary: { counts?: Record<string, unknown> };
  results: ScreenerRow[];
};

type SnapshotRecord = {
  id: string;
  name: string;
  visibility: 'saved' | 'internal';
  run_id: string | null;
  filter_id: string | null;
  filter_version: number | null;
  definition: FilterDefinition;
  definition_hash: string;
  as_of: Timestamp;
  run_at: Timestamp;
  data_source: string;
  calculation_version: string;
  registry_version: string;
  selection: { mode: 'all' | 'subset'; symbols: string[] };
  symbols: string[];
  rows: ScreenerRow[];
  totals: Record<string, unknown>;
  created_at: Timestamp;
};

type IdempotencyRow = { id: string; request_hash: string | null };

const SNAPSHOT_COLUMNS = `id, name, visibility, run_id, filter_id, filter_version, definition,
       definition_hash, as_of, run_at, data_source, calculation_version, registry_version,
       selection, symbols, rows, totals, created_at`;

const toIso = (value: Timestamp): string =>
  (value instanceof Date ? value : new Date(value)).toISOString();

const runNotFound = () =>
  new NotFoundException({
    code: 'SCREENER_RESULT_NOT_FOUND',
    message: 'Không tìm thấy kết quả lọc (có thể đã hết hạn lưu); hãy chạy lại bộ lọc.',
  });
const snapshotNotFound = () =>
  new NotFoundException({
    code: 'RESULT_SNAPSHOT_NOT_FOUND',
    message: 'Không tìm thấy kết quả đã lưu',
  });
const filterNotFound = () =>
  new NotFoundException({ code: 'FILTER_NOT_FOUND', message: 'Không tìm thấy bộ lọc' });
const idempotencyConflict = () =>
  new ConflictException({
    code: 'IDEMPOTENCY_KEY_CONFLICT',
    message: 'Khóa idempotency đã được dùng cho một yêu cầu khác',
  });

function summaryOf(record: SnapshotRecord): ResultSnapshotSummary {
  return {
    id: record.id,
    name: record.name,
    visibility: record.visibility,
    run_id: record.run_id,
    filter_id: record.filter_id,
    filter_version: record.filter_version,
    definition_hash: record.definition_hash,
    as_of: toIso(record.as_of),
    run_at: toIso(record.run_at),
    data_source: record.data_source,
    calculation_version: record.calculation_version,
    registry_version: record.registry_version,
    selection: record.selection,
    symbols: record.symbols,
    totals: record.totals,
    row_count: record.rows.length,
    created_at: toIso(record.created_at),
  };
}

function fullOf(record: SnapshotRecord): ResultSnapshot {
  return {
    ...summaryOf(record),
    definition: record.definition,
    rows: record.rows as unknown as ResultSnapshot['rows'],
  };
}

/** Criteria only (not the display name): two runs of the same criteria are the same filter. */
function criteriaHash(definition: unknown): string {
  const normalized = readStoredDefinition(definition)?.definition;
  const source = normalized ?? (definition as FilterDefinition);
  return canonicalHash({
    rules: source.rules,
    columns: source.columns ?? [],
    scope: source.scope,
    data_mode: source.data_mode ?? 'latest_disclosed',
  });
}

/**
 * Picks the rows a snapshot/list freezes, from a SERVER-held result only. `all` means every row
 * that passed in the whole result (never just a page); `subset` symbols must be passed rows of
 * that result — nothing outside it is accepted and nothing is silently dropped.
 */
export function selectResultRows(
  rows: readonly ScreenerRow[],
  selection: SelectionInput,
  limit = 500,
): { rows: ScreenerRow[]; symbols: string[] } {
  const passed = rows.filter((row) => row.passed);
  let chosen: ScreenerRow[];
  if (selection.mode === 'all') {
    chosen = passed;
  } else {
    const bySymbol = new Map(rows.map((row) => [row.symbol, row]));
    const invalid: Array<{ symbol: string; reason: 'not_in_result' | 'not_passed' }> = [];
    for (const symbol of selection.symbols) {
      const row = bySymbol.get(symbol);
      if (!row) invalid.push({ symbol, reason: 'not_in_result' });
      else if (!row.passed) invalid.push({ symbol, reason: 'not_passed' });
    }
    if (invalid.length)
      throw new UnprocessableEntityException({
        code: 'SELECTION_INVALID',
        message: 'Có mã không thuộc tập kết quả đã đạt; hãy chọn lại, hệ thống không tự bỏ mã.',
        details: invalid,
      });
    const wanted = new Set(selection.symbols);
    chosen = passed.filter((row) => wanted.has(row.symbol));
  }
  if (!chosen.length)
    throw new UnprocessableEntityException({
      code: 'SELECTION_EMPTY',
      message: 'Chưa có mã nào để lưu hoặc áp dụng.',
    });
  if (chosen.length > limit)
    throw new UnprocessableEntityException({
      code: 'SELECTION_TOO_LARGE',
      message: `Tối đa ${limit} mã mỗi lần lưu; hãy chọn tập con.`,
      details: [{ limit, selected: chosen.length }],
    });
  return { rows: chosen, symbols: chosen.map((row) => row.symbol) };
}

/**
 * Saved result snapshots (immutable, owner-scoped, soft delete) and lists created from a
 * server-held filter result. Rows and tickers always come from `screener_runs`/the snapshot,
 * never from the client.
 */
@Injectable()
export class SavedResultsService {
  constructor(private readonly database: DatabaseService) {}

  async listSnapshots(
    userId: string,
    includeInternal = false,
  ): Promise<{ items: ResultSnapshotSummary[] }> {
    const rows = await this.database.query<SnapshotRecord>(
      `SELECT ${SNAPSHOT_COLUMNS}
         FROM result_snapshots
        WHERE user_id = $1 AND deleted_at IS NULL AND ($2::boolean OR visibility = 'saved')
        ORDER BY created_at DESC, id`,
      [userId, includeInternal],
    );
    return { items: rows.map(summaryOf) };
  }

  async getSnapshot(userId: string, snapshotId: string): Promise<ResultSnapshot> {
    const [row] = await this.database.query<SnapshotRecord>(
      `SELECT ${SNAPSHOT_COLUMNS}
         FROM result_snapshots WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [snapshotId, userId],
    );
    if (!row) throw snapshotNotFound();
    return fullOf(row);
  }

  createSnapshot(userId: string, input: ResultSnapshotCreateInput): Promise<ResultSnapshot> {
    const key = input.idempotency_key ?? null;
    const requestHash = canonicalHash({
      name: input.name,
      run_id: input.run_id,
      selection:
        input.selection.mode === 'all'
          ? input.selection
          : { mode: 'subset', symbols: [...input.selection.symbols].sort() },
      filter_id: input.filter_id ?? null,
      filter_version: input.filter_version ?? null,
      visibility: input.visibility,
    });
    return this.database.transaction(async (client) => {
      const replay = await this.findIdempotent(
        client,
        'result_snapshots',
        userId,
        key,
        requestHash,
      );
      if (replay) return this.loadSnapshot(client, userId, replay, true);
      const created = await this.insertSnapshotFromRun(client, userId, input, key, requestHash);
      return fullOf(created);
    });
  }

  /** Soft delete; refused while a list made from the snapshot is the Bot's pending/effective source. */
  async deleteSnapshot(userId: string, snapshotId: string, now: Date = new Date()): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('bot_universe_revisions:' || $1::text))`,
        [userId],
      );
      const [owned] = await client.query<{ id: string }>(
        `SELECT id FROM result_snapshots WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [snapshotId, userId],
      );
      if (!owned) throw snapshotNotFound();
      const lists = await client.query<{ id: string }>(
        `SELECT id FROM list_snapshots
          WHERE result_snapshot_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [snapshotId, userId],
      );
      const usage = await findBotUsage(
        client,
        userId,
        lists.map((list) => list.id),
        vnDate(now),
      );
      if (usage.length) throw listInUseByBot(usage);
      await client.query(
        `UPDATE result_snapshots SET deleted_at = now()
          WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [snapshotId, userId],
      );
    });
  }

  /**
   * Creates a list (and, from a run, its evidence snapshot) in one transaction. With
   * `visibility = 'internal'` the list only exists to feed "Áp dụng cho Bot" and is not shown in
   * "Danh mục đã lưu".
   */
  createListFromResult(userId: string, input: ListFromResultInput): Promise<SavedList> {
    const key = input.idempotency_key ?? null;
    const requestHash = canonicalHash({
      op: 'list-from-result',
      name: input.name,
      run_id: input.run_id ?? null,
      result_snapshot_id: input.result_snapshot_id ?? null,
      selection:
        input.selection.mode === 'all'
          ? input.selection
          : { mode: 'subset', symbols: [...input.selection.symbols].sort() },
      filter_id: input.filter_id ?? null,
      filter_version: input.filter_version ?? null,
      visibility: input.visibility,
    });
    return this.database.transaction(async (client) => {
      // The evidence snapshot has no idempotency key of its own, so two concurrent requests with
      // the same key would both insert one before the list's unique key stops the second. A
      // per-user transaction lock serializes them: the loser waits, then replays the winner's
      // committed list and never leaves an orphan snapshot.
      if (key !== null) {
        await client.query(
          `SELECT pg_advisory_xact_lock(hashtext('saved_results_create_list:' || $1::text))`,
          [userId],
        );
      }
      const replay = await this.findIdempotent(client, 'list_snapshots', userId, key, requestHash);
      if (replay) return this.loadList(client, userId, replay);

      let snapshot: SnapshotRecord;
      if (input.run_id !== undefined) {
        snapshot = await this.insertSnapshotFromRun(
          client,
          userId,
          {
            name: input.name,
            run_id: input.run_id,
            selection: input.selection,
            ...(input.filter_id !== undefined ? { filter_id: input.filter_id } : {}),
            ...(input.filter_version !== undefined ? { filter_version: input.filter_version } : {}),
            visibility: input.visibility,
          },
          null,
          requestHash,
        );
      } else {
        const [existing] = await client.query<SnapshotRecord>(
          `SELECT ${SNAPSHOT_COLUMNS}
             FROM result_snapshots WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
          [input.result_snapshot_id, userId],
        );
        if (!existing) throw snapshotNotFound();
        // A list from a snapshot picks only from the symbols the snapshot froze.
        snapshot = existing;
      }
      const picked = selectResultRows(snapshot.rows, input.selection);
      const definition = snapshot.definition;
      const provenance = {
        kind: 'filter_result',
        result_snapshot_id: snapshot.id,
        run_id: snapshot.run_id,
        definition_hash: snapshot.definition_hash,
        criteria: {
          rules: definition.rules,
          columns: definition.columns ?? [],
          scope: definition.scope,
          data_mode: definition.data_mode ?? 'latest_disclosed',
        },
        as_of: toIso(snapshot.as_of),
        run_at: toIso(snapshot.run_at),
        calculation_version: snapshot.calculation_version,
        registry_version: snapshot.registry_version,
        selection: { mode: input.selection.mode, selected_count: picked.symbols.length },
      };
      const [created] = await client.query<SnapshotRecordList>(
        `INSERT INTO list_snapshots
           (id, user_id, name, filter_id, filter_version, tickers, as_of, data_source, scope,
            visibility, result_snapshot_id, run_id, provenance, idempotency_key, request_hash)
         VALUES ($1, $2, $3, $4, $5, $6::text[], $7::date, $8, $9::jsonb, $10, $11, $12,
                 $13::jsonb, $14, $15)
         ON CONFLICT (user_id, idempotency_key) DO NOTHING
         RETURNING ${LIST_COLUMNS}`,
        [
          randomUUID(),
          userId,
          input.name,
          snapshot.filter_id,
          snapshot.filter_version,
          picked.symbols,
          vnDate(new Date(snapshot.as_of)),
          snapshot.data_source,
          JSON.stringify({
            market: definition.scope.market,
            sector: definition.scope.sector,
            source: 'filter_result',
            result_snapshot_id: snapshot.id,
            run_id: snapshot.run_id,
          }),
          input.visibility,
          snapshot.id,
          snapshot.run_id,
          JSON.stringify(provenance),
          key,
          requestHash,
        ],
      );
      if (created) return toSavedList(created);
      const raced = await this.findIdempotent(client, 'list_snapshots', userId, key, requestHash);
      if (!raced) throw new Error('Idempotent list was not found after conflict');
      return this.loadList(client, userId, raced);
    });
  }

  // -------------------------------------------------------------------------------------

  private async insertSnapshotFromRun(
    client: SqlClient,
    userId: string,
    input: Pick<
      ResultSnapshotCreateInput,
      'name' | 'run_id' | 'selection' | 'filter_id' | 'filter_version' | 'visibility'
    >,
    key: string | null,
    requestHash: string,
  ): Promise<SnapshotRecord> {
    const [run] = await client.query<RunRecord>(
      `SELECT id, definition, as_of, data_source, calculation_version, registry_version, summary, results
         FROM screener_runs WHERE id = $1 AND user_id = $2`,
      [input.run_id, userId],
    );
    if (!run) throw runNotFound();

    let filterVersion: number | null = null;
    if (input.filter_id !== undefined) {
      const [filter] = await client.query<{ current_version: number }>(
        `SELECT current_version FROM strategy_filters
          WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [input.filter_id, userId],
      );
      if (!filter) throw filterNotFound();
      filterVersion = input.filter_version ?? filter.current_version;
      const [stored] = await client.query<{ definition: unknown }>(
        `SELECT definition FROM filter_versions WHERE filter_id = $1 AND version = $2`,
        [input.filter_id, filterVersion],
      );
      if (!stored)
        throw new NotFoundException({
          code: 'FILTER_VERSION_NOT_FOUND',
          message: 'Không tìm thấy phiên bản bộ lọc',
          version: filterVersion,
        });
      if (criteriaHash(stored.definition) !== criteriaHash(run.definition))
        throw new UnprocessableEntityException({
          code: 'FILTER_MISMATCH',
          message: 'Kết quả này không được tạo từ phiên bản bộ lọc đã chọn.',
        });
    }

    const picked = selectResultRows(run.results, input.selection);
    const totals = {
      run_universe: run.results.length,
      run_passed: run.results.filter((row) => row.passed).length,
      selected: picked.symbols.length,
      counts: run.summary.counts ?? null,
    };
    const selection = { mode: input.selection.mode, symbols: picked.symbols };
    const definitionHash = canonicalHash(run.definition);
    const [created] = await client.query<SnapshotRecord>(
      `INSERT INTO result_snapshots
         (id, user_id, name, run_id, filter_id, filter_version, definition, definition_hash,
          as_of, run_at, data_source, calculation_version, registry_version, selection, symbols,
          rows, totals, visibility, idempotency_key, request_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::timestamptz, $9::timestamptz, $10, $11,
               $12, $13::jsonb, $14::text[], $15::jsonb, $16::jsonb, $17, $18, $19)
       ON CONFLICT (user_id, idempotency_key) DO NOTHING
       RETURNING ${SNAPSHOT_COLUMNS}`,
      [
        randomUUID(),
        userId,
        input.name,
        run.id,
        input.filter_id ?? null,
        filterVersion,
        JSON.stringify(run.definition),
        definitionHash,
        toIso(run.as_of),
        run.data_source,
        run.calculation_version,
        run.registry_version,
        JSON.stringify(selection),
        picked.symbols,
        JSON.stringify(picked.rows),
        JSON.stringify(totals),
        input.visibility,
        key,
        requestHash,
      ],
    );
    if (created) return created;
    // A concurrent request with the same idempotency key committed first.
    const raced = await this.findIdempotent(client, 'result_snapshots', userId, key, requestHash);
    if (!raced) throw new Error('Idempotent result snapshot was not found after conflict');
    const [row] = await client.query<SnapshotRecord>(
      `SELECT ${SNAPSHOT_COLUMNS} FROM result_snapshots WHERE id = $1 AND user_id = $2`,
      [raced, userId],
    );
    if (!row) throw snapshotNotFound();
    return row;
  }

  private async findIdempotent(
    client: SqlClient,
    table: 'result_snapshots' | 'list_snapshots',
    userId: string,
    key: string | null,
    requestHash: string,
  ): Promise<string | undefined> {
    if (key === null) return undefined;
    const [row] = await client.query<IdempotencyRow>(
      `SELECT id, request_hash FROM ${table} WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, key],
    );
    if (!row) return undefined;
    if (row.request_hash !== requestHash) throw idempotencyConflict();
    return row.id;
  }

  private async loadSnapshot(
    client: SqlClient,
    userId: string,
    snapshotId: string,
    includeDeleted = false,
  ): Promise<ResultSnapshot> {
    const [row] = await client.query<SnapshotRecord>(
      `SELECT ${SNAPSHOT_COLUMNS}
         FROM result_snapshots
        WHERE id = $1 AND user_id = $2 AND ($3::boolean OR deleted_at IS NULL)`,
      [snapshotId, userId, includeDeleted],
    );
    if (!row) throw snapshotNotFound();
    return fullOf(row);
  }

  private async loadList(client: SqlClient, userId: string, listId: string): Promise<SavedList> {
    const [row] = await client.query<SnapshotRecordList>(
      `SELECT ${LIST_COLUMNS} FROM list_snapshots WHERE id = $1 AND user_id = $2`,
      [listId, userId],
    );
    if (!row)
      throw new NotFoundException({ code: 'LIST_NOT_FOUND', message: 'Không tìm thấy danh sách' });
    return toSavedList(row);
  }
}

type SnapshotRecordList = Parameters<typeof toSavedList>[0];
