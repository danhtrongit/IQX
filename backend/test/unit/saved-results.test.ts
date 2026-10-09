import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { ScreenerRow } from '../../src/modules/screener/screener.schemas.js';
import {
  listFromResultSchema,
  resultSnapshotCreateSchema,
  selectionSchema,
} from '../../src/modules/saved-filters/saved-filters.schemas.js';
import {
  SavedResultsService,
  selectResultRows,
} from '../../src/modules/saved-filters/saved-results.service.js';
import { canonicalHash } from '../../src/modules/saved-filters/saved-filters.hash.js';
import type { DatabaseService, SqlClient } from '../../src/platform/database/index.js';

const USER_A = '00000000-0000-4000-8000-00000000000a';
const USER_B = '00000000-0000-4000-8000-00000000000b';
const RUN_ID = '00000000-0000-4000-8000-0000000000c1';
const FILTER_ID = '00000000-0000-4000-8000-0000000000f1';

const cell = (status: string) => ({
  metric_id: 'roe',
  period_mode: 'ttm',
  status,
  value: status === 'ok' ? 0.2 : null,
  unit: 'ratio',
  actual_period_label: 'TTM Q4/2025',
  comparison_period_label: null,
  published_at: '2026-01-30',
  available_at: '2026-01-31T00:00:00+07:00',
  source_revision: 'VCI:2026-01-30T10:00:00',
  components: [{ label: 'Q4/2025', published_at: '2026-01-30', updated_at: null }],
});
const row = (symbol: string, passed: boolean): ScreenerRow =>
  ({
    symbol,
    name: `Công ty ${symbol}`,
    sector: 'Ngành',
    exchange: 'HOSE',
    passed,
    metrics: { roe: cell(passed ? 'ok' : 'missing') },
  }) as unknown as ScreenerRow;

const ROWS = [row('AAA', true), row('BBB', true), row('CCC', false), row('DDD', true)];

describe('selectResultRows (server-held result, never client rows)', () => {
  it('all = every passed row of the whole result, not a page', () => {
    const picked = selectResultRows(ROWS, { mode: 'all' });
    expect(picked.symbols).toEqual(['AAA', 'BBB', 'DDD']);
    expect(picked.rows.map((item) => item.symbol)).toEqual(['AAA', 'BBB', 'DDD']);
  });

  it('subset keeps exactly the chosen passed rows in result order', () => {
    expect(selectResultRows(ROWS, { mode: 'subset', symbols: ['DDD', 'AAA'] }).symbols).toEqual([
      'AAA',
      'DDD',
    ]);
  });

  it('U19 refuses symbols outside the result, or not passed, naming each; nothing is dropped silently', () => {
    const error = (() => {
      try {
        selectResultRows(ROWS, { mode: 'subset', symbols: ['AAA', 'CCC', 'ZZZ'] });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'SELECTION_INVALID',
      details: [
        { symbol: 'CCC', reason: 'not_passed' },
        { symbol: 'ZZZ', reason: 'not_in_result' },
      ],
    });
  });

  it('U04 an empty selection is refused (no fallback), and so is a result with nothing passed', () => {
    expect(() => selectResultRows([row('CCC', false)], { mode: 'all' })).toThrow(
      UnprocessableEntityException,
    );
    expect(selectionSchema.safeParse({ mode: 'subset', symbols: [] }).success).toBe(false);
    expect(selectionSchema.safeParse({ mode: 'all', symbols: ['AAA'] }).success).toBe(false);
  });

  it('caps one save at 500 symbols', () => {
    const many = Array.from({ length: 501 }, (_, i) => row(`S${i}`, true));
    expect(() => selectResultRows(many, { mode: 'all' })).toThrow(/500/);
  });
});

describe('request schemas', () => {
  it('normalises subset symbols and keeps the filter pair together', () => {
    const parsed = resultSnapshotCreateSchema.parse({
      name: 'Kết quả',
      run_id: RUN_ID,
      selection: { mode: 'subset', symbols: ['aaa', ' AAA ', 'bbb'] },
    });
    expect(parsed.selection).toEqual({ mode: 'subset', symbols: ['AAA', 'BBB'] });
    expect(parsed.visibility).toBe('saved');
    expect(
      resultSnapshotCreateSchema.safeParse({
        name: 'x',
        run_id: RUN_ID,
        selection: { mode: 'all' },
        filter_version: 2,
      }).success,
    ).toBe(false);
  });

  it('a list needs exactly one source and never accepts client tickers or rows', () => {
    const base = { name: 'L', selection: { mode: 'all' } };
    expect(listFromResultSchema.safeParse({ ...base, run_id: RUN_ID }).success).toBe(true);
    expect(listFromResultSchema.safeParse({ ...base }).success).toBe(false);
    expect(
      listFromResultSchema.safeParse({ ...base, run_id: RUN_ID, result_snapshot_id: RUN_ID })
        .success,
    ).toBe(false);
    expect(
      listFromResultSchema.safeParse({ ...base, run_id: RUN_ID, tickers: ['AAA'] }).success,
    ).toBe(false);
    expect(listFromResultSchema.safeParse({ ...base, run_id: RUN_ID, rows: [] }).success).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Service with a statement-level fake (the real SQL runs in strategy-sql.pg.test.ts).

type SnapshotRecord = Record<string, unknown> & {
  id: string;
  user_id: string;
  visibility: string;
  deleted_at: Date | null;
  idempotency_key: string | null;
  request_hash: string | null;
  created_at: Date;
};

const DEFINITION = {
  schema_version: '3.0',
  name: 'ROE',
  logic: 'AND',
  data_mode: 'latest_disclosed',
  rules: [
    { id: 'r1', metric_id: 'roe', period: 'ttm', operator: '>', value: 0.1, api_unit: 'ratio' },
  ],
  scope: { market: 'HOSE', sector: '' },
};

class FakeDb {
  runs = [
    {
      id: RUN_ID,
      user_id: USER_A,
      definition: DEFINITION,
      as_of: new Date('2026-02-01T03:00:00.000Z'),
      data_source: 'VCI',
      calculation_version: 'iqx-fund-2.0',
      registry_version: 'iqx-fund-registry-2.1',
      summary: { counts: { universe: 4, passed: 3 } },
      results: ROWS,
    },
  ];
  snapshots: SnapshotRecord[] = [];
  lists: Array<
    Record<string, unknown> & { id: string; user_id: string; result_snapshot_id: string | null }
  > = [];
  filters = [{ id: FILTER_ID, user_id: USER_A, current_version: 2, deleted_at: null }];
  filterVersions: Array<{ filter_id: string; version: number; definition: unknown }> = [
    { filter_id: FILTER_ID, version: 1, definition: DEFINITION },
    {
      filter_id: FILTER_ID,
      version: 2,
      definition: { ...DEFINITION, rules: [{ ...DEFINITION.rules[0]!, value: 0.3 }] },
    },
  ];
  usage: Array<Record<string, unknown>> = [];
  locks = 0;
  private tick = Date.parse('2026-02-01T05:00:00.000Z');
  private nextId = 1;

  async query<T>(text: string, v: readonly unknown[] = []): Promise<T[]> {
    return this.execute(text.replace(/\s+/g, ' ').trim(), v) as T[];
  }

  async transaction<T>(work: (client: SqlClient) => Promise<T>): Promise<T> {
    const snapshot = structuredClone({ s: this.snapshots, l: this.lists });
    try {
      return await work({ query: (t, v) => this.query(t, v) });
    } catch (error) {
      this.snapshots = snapshot.s;
      this.lists = snapshot.l;
      throw error;
    }
  }

  private now() {
    this.tick += 1000;
    return new Date(this.tick);
  }

  private execute(sql: string, v: readonly unknown[]): unknown[] {
    if (sql.startsWith('SELECT pg_advisory_xact_lock')) {
      this.locks += 1;
      return [];
    }
    if (sql.startsWith('SELECT id, request_hash FROM result_snapshots')) {
      return this.snapshots
        .filter((item) => item.user_id === v[0] && item.idempotency_key === v[1])
        .map(({ id, request_hash }) => ({ id, request_hash }));
    }
    if (sql.startsWith('SELECT id, request_hash FROM list_snapshots')) {
      return this.lists
        .filter((item) => item.user_id === v[0] && item.idempotency_key === v[1])
        .map((item) => ({ id: item.id, request_hash: item.request_hash }));
    }
    if (sql.includes('FROM screener_runs')) {
      return this.runs.filter((item) => item.id === v[0] && item.user_id === v[1]);
    }
    if (sql.startsWith('SELECT current_version FROM strategy_filters')) {
      return this.filters.filter((item) => item.id === v[0] && item.user_id === v[1]);
    }
    if (sql.startsWith('SELECT definition FROM filter_versions')) {
      return this.filterVersions.filter((item) => item.filter_id === v[0] && item.version === v[1]);
    }
    if (sql.startsWith('INSERT INTO result_snapshots')) {
      const [
        id,
        userId,
        name,
        runId,
        filterId,
        filterVersion,
        definition,
        hash,
        asOf,
        source,
        calc,
        registry,
        selection,
        symbols,
        rows,
        totals,
        visibility,
        key,
        requestHash,
      ] = v as [
        string,
        string,
        string,
        string,
        string | null,
        number | null,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string[],
        string,
        string,
        string,
        string | null,
        string,
      ];
      if (
        key !== null &&
        this.snapshots.some((item) => item.user_id === userId && item.idempotency_key === key)
      )
        return [];
      const record: SnapshotRecord = {
        id,
        user_id: userId,
        name,
        visibility,
        run_id: runId,
        filter_id: filterId,
        filter_version: filterVersion,
        definition: JSON.parse(definition) as unknown,
        definition_hash: hash,
        as_of: new Date(asOf),
        run_at: new Date(asOf),
        data_source: source,
        calculation_version: calc,
        registry_version: registry,
        selection: JSON.parse(selection) as unknown,
        symbols,
        rows: JSON.parse(rows) as unknown,
        totals: JSON.parse(totals) as unknown,
        idempotency_key: key,
        request_hash: requestHash,
        created_at: this.now(),
        deleted_at: null,
      };
      this.snapshots.push(record);
      return [record];
    }
    if (sql.startsWith('INSERT INTO list_snapshots')) {
      const [
        id,
        userId,
        name,
        filterId,
        filterVersion,
        tickers,
        asOf,
        source,
        scope,
        visibility,
        snapshotId,
        runId,
        provenance,
        key,
        requestHash,
      ] = v as [
        string,
        string,
        string,
        string | null,
        number | null,
        string[],
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string | null,
        string,
      ];
      const record = {
        id,
        user_id: userId,
        name,
        filter_id: filterId,
        filter_version: filterVersion,
        tickers,
        as_of: asOf,
        data_source: source,
        scope: JSON.parse(scope) as unknown,
        visibility,
        result_snapshot_id: snapshotId,
        run_id: runId,
        provenance: JSON.parse(provenance) as unknown,
        idempotency_key: key,
        request_hash: requestHash,
        created_at: this.now(),
        deleted_at: null,
      };
      this.lists.push(record);
      return [record];
    }
    if (sql.includes('FROM result_snapshots WHERE user_id = $1 AND deleted_at IS NULL AND')) {
      return this.snapshots.filter(
        (item) =>
          item.user_id === v[0] &&
          item.deleted_at === null &&
          (v[1] === true || item.visibility === 'saved'),
      );
    }
    if (sql.includes('FROM result_snapshots WHERE id = $1 AND user_id = $2 AND ($3::boolean')) {
      return this.snapshots.filter(
        (item) =>
          item.id === v[0] && item.user_id === v[1] && (v[2] === true || item.deleted_at === null),
      );
    }
    if (
      sql.includes('FROM result_snapshots WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL')
    ) {
      return this.snapshots.filter(
        (item) => item.id === v[0] && item.user_id === v[1] && item.deleted_at === null,
      );
    }
    if (sql.includes('FROM result_snapshots WHERE id = $1 AND user_id = $2')) {
      return this.snapshots.filter((item) => item.id === v[0] && item.user_id === v[1]);
    }
    if (sql.startsWith('SELECT id FROM list_snapshots WHERE result_snapshot_id')) {
      return this.lists.filter((item) => item.result_snapshot_id === v[0] && item.user_id === v[1]);
    }
    if (sql.includes('FROM bot_universe_revisions r')) {
      const wanted = new Set(v[1] as string[]);
      return this.usage.filter((item) => wanted.has(item.saved_list_id as string));
    }
    if (sql.startsWith('UPDATE result_snapshots SET deleted_at')) {
      const target = this.snapshots.find((item) => item.id === v[0] && item.user_id === v[1]);
      if (target) target.deleted_at = this.now();
      return [];
    }
    if (sql.includes('FROM list_snapshots WHERE id = $1 AND user_id = $2')) {
      return this.lists.filter((item) => item.id === v[0] && item.user_id === v[1]);
    }
    throw new Error(`Unexpected SQL in fake: ${sql}`);
  }
}

function setup() {
  const database = new FakeDb();
  return { database, service: new SavedResultsService(database as unknown as DatabaseService) };
}

describe('SavedResultsService', () => {
  it('freezes the selected rows of the stored run with the run cutoff and the real save time', async () => {
    const { service } = setup();
    const snapshot = await service.createSnapshot(
      USER_A,
      resultSnapshotCreateSchema.parse({
        name: 'Danh mục ROE',
        run_id: RUN_ID,
        selection: { mode: 'subset', symbols: ['BBB', 'AAA'] },
      }),
    );
    expect(snapshot).toMatchObject({
      name: 'Danh mục ROE',
      symbols: ['AAA', 'BBB'],
      row_count: 2,
      visibility: 'saved',
      run_id: RUN_ID,
      data_source: 'VCI',
      calculation_version: 'iqx-fund-2.0',
      registry_version: 'iqx-fund-registry-2.1',
      selection: { mode: 'subset', symbols: ['AAA', 'BBB'] },
      totals: { run_universe: 4, run_passed: 3, selected: 2 },
    });
    // as_of is the data cutoff of the run; created_at is when it was saved. Never one field.
    expect(snapshot.as_of).toBe('2026-02-01T03:00:00.000Z');
    expect(snapshot.run_at).toBe('2026-02-01T03:00:00.000Z');
    expect(snapshot.created_at).not.toBe(snapshot.as_of);
    expect(snapshot.definition_hash).toBe(canonicalHash(DEFINITION));
    // F23: values, statuses, actual periods and provenance are those of the run, not recomputed.
    expect(snapshot.rows).toHaveLength(2);
    expect(snapshot.rows[0]).toMatchObject({
      symbol: 'AAA',
      metrics: { roe: { actual_period_label: 'TTM Q4/2025', published_at: '2026-01-30' } },
    });
    expect(snapshot.definition).toEqual(DEFINITION);
  });

  it('F24 "all" saves every passed row of the result, whatever page the user was on', async () => {
    const { service } = setup();
    const snapshot = await service.createSnapshot(
      USER_A,
      resultSnapshotCreateSchema.parse({
        name: 'Tất cả',
        run_id: RUN_ID,
        selection: { mode: 'all' },
      }),
    );
    expect(snapshot.symbols).toEqual(['AAA', 'BBB', 'DDD']);
  });

  it('is owner-scoped: another account cannot snapshot or read a run or snapshot it does not own', async () => {
    const { service } = setup();
    const input = resultSnapshotCreateSchema.parse({
      name: 'x',
      run_id: RUN_ID,
      selection: { mode: 'all' },
    });
    await expect(service.createSnapshot(USER_B, input)).rejects.toMatchObject({
      response: { code: 'SCREENER_RESULT_NOT_FOUND' },
    });
    const mine = await service.createSnapshot(USER_A, input);
    await expect(service.getSnapshot(USER_B, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await service.listSnapshots(USER_B)).toEqual({ items: [] });
    await expect(service.deleteSnapshot(USER_B, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await service.listSnapshots(USER_A)).items.map((item) => item.id)).toEqual([mine.id]);
  });

  it('replays an idempotency key and refuses it for another payload', async () => {
    const { database, service } = setup();
    const input = resultSnapshotCreateSchema.parse({
      name: 'x',
      run_id: RUN_ID,
      selection: { mode: 'all' },
      idempotency_key: 'snapshot-key-1',
    });
    const first = await service.createSnapshot(USER_A, input);
    expect((await service.createSnapshot(USER_A, input)).id).toBe(first.id);
    expect(database.snapshots).toHaveLength(1);
    await expect(service.createSnapshot(USER_A, { ...input, name: 'khác' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('F22 links a result to the filter version whose criteria it used, and refuses another', async () => {
    const { service } = setup();
    const linked = await service.createSnapshot(
      USER_A,
      resultSnapshotCreateSchema.parse({
        name: 'v1',
        run_id: RUN_ID,
        selection: { mode: 'all' },
        filter_id: FILTER_ID,
        filter_version: 1,
      }),
    );
    expect(linked).toMatchObject({ filter_id: FILTER_ID, filter_version: 1 });
    // Version 2 has another threshold: this run was not produced by it.
    await expect(
      service.createSnapshot(
        USER_A,
        resultSnapshotCreateSchema.parse({
          name: 'v2',
          run_id: RUN_ID,
          selection: { mode: 'all' },
          filter_id: FILTER_ID,
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'FILTER_MISMATCH' } });
    await expect(
      service.createSnapshot(
        USER_B,
        resultSnapshotCreateSchema.parse({
          name: 'x',
          run_id: RUN_ID,
          selection: { mode: 'all' },
          filter_id: FILTER_ID,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('U06 creates the list and its evidence from a run without a prior save; internal lists stay hidden', async () => {
    const { database, service } = setup();
    const list = await service.createListFromResult(
      USER_A,
      listFromResultSchema.parse({
        name: 'Danh mục áp cho Bot',
        run_id: RUN_ID,
        selection: { mode: 'subset', symbols: ['AAA', 'DDD'] },
        visibility: 'internal',
      }),
    );
    expect(list).toMatchObject({
      name: 'Danh mục áp cho Bot',
      tickers: ['AAA', 'DDD'],
      visibility: 'internal',
      run_id: RUN_ID,
      as_of: '2026-02-01',
      data_source: 'VCI',
      scope: { market: 'HOSE', source: 'filter_result', run_id: RUN_ID },
    });
    expect(list.result_snapshot_id).toBe(database.snapshots[0]!.id);
    expect(list.provenance).toMatchObject({
      kind: 'filter_result',
      run_id: RUN_ID,
      definition_hash: canonicalHash(DEFINITION),
      selection: { mode: 'subset', selected_count: 2 },
      criteria: { rules: DEFINITION.rules, scope: DEFINITION.scope },
    });
    // The evidence snapshot is internal too: not part of "saved" results.
    expect(database.snapshots[0]!.visibility).toBe('internal');
    expect((await service.listSnapshots(USER_A)).items).toEqual([]);
    expect((await service.listSnapshots(USER_A, true)).items).toHaveLength(1);
  });

  it('builds a list from an existing snapshot and refuses symbols that snapshot did not freeze', async () => {
    const { service } = setup();
    const snapshot = await service.createSnapshot(
      USER_A,
      resultSnapshotCreateSchema.parse({
        name: 's',
        run_id: RUN_ID,
        selection: { mode: 'subset', symbols: ['AAA', 'BBB'] },
      }),
    );
    const list = await service.createListFromResult(
      USER_A,
      listFromResultSchema.parse({
        name: 'Một phần',
        result_snapshot_id: snapshot.id,
        selection: { mode: 'subset', symbols: ['BBB'] },
      }),
    );
    expect(list).toMatchObject({
      tickers: ['BBB'],
      visibility: 'saved',
      result_snapshot_id: snapshot.id,
    });
    await expect(
      service.createListFromResult(
        USER_A,
        listFromResultSchema.parse({
          name: 'Ngoài',
          result_snapshot_id: snapshot.id,
          selection: { mode: 'subset', symbols: ['DDD'] },
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'SELECTION_INVALID' } });
  });

  it('list creation is atomic and idempotent: a refused selection leaves no snapshot behind', async () => {
    const { database, service } = setup();
    await expect(
      service.createListFromResult(
        USER_A,
        listFromResultSchema.parse({
          name: 'Lỗi',
          run_id: RUN_ID,
          selection: { mode: 'subset', symbols: ['CCC'] },
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'SELECTION_INVALID' } });
    expect(database.snapshots).toHaveLength(0);
    expect(database.lists).toHaveLength(0);
    const input = listFromResultSchema.parse({
      name: 'Ổn',
      run_id: RUN_ID,
      selection: { mode: 'all' },
      idempotency_key: 'list-from-result-1',
    });
    const first = await service.createListFromResult(USER_A, input);
    expect((await service.createListFromResult(USER_A, input)).id).toBe(first.id);
    expect(database.lists).toHaveLength(1);
    expect(database.snapshots).toHaveLength(1);
  });

  it('serializes keyed list creation per user (a replay never inserts a second snapshot)', async () => {
    const { database, service } = setup();
    const keyed = listFromResultSchema.parse({
      name: 'Khóa',
      run_id: RUN_ID,
      selection: { mode: 'all' },
      idempotency_key: 'list-from-result-lock',
    });
    await service.createListFromResult(USER_A, keyed);
    await service.createListFromResult(USER_A, keyed);
    // One per-user lock for each keyed request, taken before the replay check.
    expect(database.locks).toBe(2);
    expect(database.snapshots).toHaveLength(1);
    // Without a key there is nothing to replay and no lock is needed.
    await service.createListFromResult(
      USER_A,
      listFromResultSchema.parse({
        name: 'Không khóa',
        run_id: RUN_ID,
        selection: { mode: 'all' },
      }),
    );
    expect(database.locks).toBe(2);
  });

  it('refuses to delete a snapshot whose list is the Bot buy source, then soft-deletes once released', async () => {
    const { database, service } = setup();
    const list = await service.createListFromResult(
      USER_A,
      listFromResultSchema.parse({ name: 'L', run_id: RUN_ID, selection: { mode: 'all' } }),
    );
    database.usage = [
      {
        revision: 4,
        role: 'effective',
        status: 'effective',
        effective_session: '2026-02-02',
        source_name: 'L',
        saved_list_id: list.id,
      },
    ];
    await expect(
      service.deleteSnapshot(USER_A, list.result_snapshot_id!, new Date('2026-02-03T03:00:00Z')),
    ).rejects.toMatchObject({
      response: { code: 'LIST_IN_USE_BY_BOT', details: [{ revision: 4, role: 'effective' }] },
    });
    expect(database.snapshots[0]!.deleted_at).toBeNull();
    database.usage = [];
    await service.deleteSnapshot(USER_A, list.result_snapshot_id!);
    expect(database.snapshots[0]!.deleted_at).toBeInstanceOf(Date);
    expect(database.locks).toBe(2);
    // The list keeps its evidence reference; the snapshot is only hidden.
    expect(database.lists[0]!.result_snapshot_id).toBe(list.result_snapshot_id);
    await expect(service.getSnapshot(USER_A, list.result_snapshot_id!)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
