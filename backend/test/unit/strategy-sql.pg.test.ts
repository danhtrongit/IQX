import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { definitionHash } from '../../src/modules/alerts/strategy-alerts.evaluation.js';
import { StrategyAlertsRepository } from '../../src/modules/alerts/strategy-alerts.repository.js';
import type { NewVersionInput } from '../../src/modules/alerts/strategy-alerts.store.js';
import {
  configHash,
  defaultConfig,
  type IndicatorConfig,
} from '../../src/modules/quant/v2/index.js';
import { ScreenerRunRepository } from '../../src/modules/screener/screener.repository.js';
import type {
  ScreenerRow,
  ScreenerRunHeader,
} from '../../src/modules/screener/screener.schemas.js';
import { SavedFiltersService } from '../../src/modules/saved-filters/saved-filters.service.js';
import { SavedResultsService } from '../../src/modules/saved-filters/saved-results.service.js';
import type { DatabaseService, SqlClient } from '../../src/platform/database/index.js';

/**
 * Executes the real SQL of the Strategy repositories against PostgreSQL (migrations 0001-0019
 * applied). Skipped unless STRATEGY_PG_URL points at a throw-away database, e.g.
 *   STRATEGY_PG_URL=postgresql://postgres@127.0.0.1:55491/iqx_v2_strategy npx vitest run \
 *     test/unit/strategy-sql.pg.test.ts
 * The unit fakes mirror these rules; this file proves the SQL itself (unique keys, triggers,
 * the Bot-usage query, soft deletes, pruning).
 */
const URL = process.env.STRATEGY_PG_URL;

pg.types.setTypeParser(1082, (value: string) => value);

class PgDatabase {
  constructor(readonly pool: pg.Pool) {}
  async query<T>(text: string, values: readonly unknown[] = []): Promise<T[]> {
    return (await this.pool.query(text, [...values])).rows as T[];
  }
  async transaction<T>(work: (client: SqlClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work({
        query: async (text, values) =>
          (await client.query(text, [...(values ?? [])])).rows as never,
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

const NAME_PREFIX = 'pg-smoke';

describe.skipIf(!URL)('Strategy SQL against PostgreSQL', () => {
  let pool: pg.Pool;
  let db: DatabaseService;
  let alerts: StrategyAlertsRepository;
  let runs: ScreenerRunRepository;
  let results: SavedResultsService;
  let lists: SavedFiltersService;
  const admin = randomUUID();
  const plain = randomUUID();
  const outsider = randomUUID();
  const botAccount = randomUUID();
  const created: string[] = [];

  async function insertUser(id: string, role: 'admin' | 'user') {
    await pool.query(
      `INSERT INTO users (id, email, hashed_password, full_name, role) VALUES ($1, $2, 'x', $3, $4)`,
      [id, `${NAME_PREFIX}-${id}@example.test`, `${NAME_PREFIX} ${role}`, role],
    );
    created.push(id);
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL, max: 4 });
    const database = new PgDatabase(pool);
    db = database as unknown as DatabaseService;
    alerts = new StrategyAlertsRepository(db);
    runs = new ScreenerRunRepository(db);
    results = new SavedResultsService(db);
    lists = new SavedFiltersService(db);
    await insertUser(admin, 'admin');
    await insertUser(plain, 'user');
    await insertUser(outsider, 'user');
    await pool.query(
      `INSERT INTO bot_accounts (id, user_id, initial_cash_vnd, cash_vnd, activated_at)
       VALUES ($1, $2, 100000000, 100000000, now())`,
      [botAccount, admin],
    );
    await pool.query(
      `INSERT INTO symbols (symbol, exchange, asset_type, is_index, is_active)
       VALUES ('PGA', 'HOSE', 'stock', false, true), ('PGI', 'HOSE', 'stock', true, true),
              ('PGX', 'HOSE', 'stock', false, false)
       ON CONFLICT (symbol) DO NOTHING`,
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [created]);
    await pool.query(`DELETE FROM symbols WHERE symbol IN ('PGA', 'PGI', 'PGX')`);
    await pool.end();
  });

  const config = () => {
    const value = defaultConfig();
    const ma = value.indicators.ma as IndicatorConfig;
    ma.master_enabled = true;
    ma.buy.enabled = true;
    ma.sell.enabled = true;
    return value;
  };

  function version(symbols = ['PGA'], sides: Array<'buy' | 'sell'> = ['buy']): NewVersionInput {
    const value = config();
    const hash = configHash(value);
    return {
      source: {
        kind: 'shared_config',
        revision: 1,
        saved_at: '2026-01-01T00:00:00Z',
        stored_config_hash: hash,
      },
      config: value,
      config_hash: hash,
      schema_version: '2.0',
      rule_version: 'iqx-rules-3.0',
      calculation_version: 'iqx-ta-2.0',
      scope: { kind: 'symbols' },
      symbols,
      sides,
      definition_hash: definitionHash({
        config_hash: hash,
        symbols,
        sides,
        scope: { kind: 'symbols' },
      }),
    };
  }

  it('alerts: create, unique live name, idempotency, rename/pause/resume, versions and soft delete', async () => {
    const key = `${NAME_PREFIX}-key-${randomUUID()}`;
    const input = {
      user_id: admin,
      name: `${NAME_PREFIX} A`,
      enabled: true,
      version: version(),
      idempotency_key: key,
      request_hash: 'a'.repeat(64),
    };
    const first = await alerts.create(input);
    expect(first).toMatchObject({
      name: `${NAME_PREFIX} A`,
      current_version: 1,
      observation_epoch: 1,
    });
    expect(first.version_row.symbols).toEqual(['PGA']);
    expect((await alerts.create(input)).id).toBe(first.id);
    await expect(alerts.create({ ...input, request_hash: 'b'.repeat(64) })).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_KEY_CONFLICT' },
    });
    await expect(
      alerts.create({ ...input, name: `  ${NAME_PREFIX} a `, idempotency_key: null }),
    ).rejects.toMatchObject({ response: { code: 'ALERT_NAME_TAKEN' } });

    const renamed = await alerts.update(admin, first.id, { name: `${NAME_PREFIX} B` });
    expect(renamed).toMatchObject({ name: `${NAME_PREFIX} B`, current_version: 1 });
    const paused = await alerts.update(admin, first.id, { enabled: false });
    expect(paused.enabled).toBe(false);
    expect(paused.paused_at).not.toBeNull();
    const resumed = await alerts.update(admin, first.id, { enabled: true });
    expect(resumed).toMatchObject({ enabled: true, observation_epoch: 2, paused_at: null });

    const next = await alerts.update(admin, first.id, {
      version: version(['PGA', 'PGX'], ['buy', 'sell']),
    });
    expect(next.current_version).toBe(2);
    const same = await alerts.update(admin, first.id, {
      version: version(['PGA', 'PGX'], ['buy', 'sell']),
    });
    expect(same.current_version).toBe(2);
    await expect(alerts.update(admin, first.id, { expected_version: 1 })).rejects.toMatchObject({
      response: { code: 'ALERT_VERSION_CONFLICT' },
    });
    expect((await alerts.versions(first.id)).map((row) => row.version)).toEqual([2, 1]);
    expect(await alerts.update(plain, first.id, { name: 'x' }).catch(() => 'blocked')).toBe(
      'blocked',
    );

    // Versions are immutable evidence.
    await expect(
      pool.query(`UPDATE strategy_alert_versions SET config_hash = $2 WHERE alert_id = $1`, [
        first.id,
        'c'.repeat(64),
      ]),
    ).rejects.toThrow(/immutable/);

    expect(await alerts.remove(admin, first.id)).toBe(true);
    expect(await alerts.remove(admin, first.id)).toBe(false);
    expect(await alerts.get(admin, first.id)).toBeNull();
    // A deleted alert frees its name for a new one.
    const again = await alerts.create({
      ...input,
      idempotency_key: null,
      name: `${NAME_PREFIX} B`,
    });
    expect(again.id).not.toBe(first.id);
    await alerts.remove(admin, again.id);
  });

  it('alerts: targets only for enabled alerts of entitled owners', async () => {
    const mine = await alerts.create({
      user_id: admin,
      name: `${NAME_PREFIX} target`,
      enabled: true,
      version: version(['PGA'], ['buy', 'sell']),
      idempotency_key: null,
      request_hash: 'd'.repeat(64),
    });
    const paused = await alerts.create({
      user_id: admin,
      name: `${NAME_PREFIX} paused`,
      enabled: false,
      version: version(),
      idempotency_key: null,
      request_hash: 'e'.repeat(64),
    });
    const free = await alerts.create({
      user_id: plain,
      name: `${NAME_PREFIX} free`,
      enabled: true,
      version: version(),
      idempotency_key: null,
      request_hash: 'f'.repeat(64),
    });
    const targets = await alerts.listTargets();
    const ids = targets.map((target) => target.alert_id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(paused.id);
    expect(ids).not.toContain(free.id);
    const target = targets.find((item) => item.alert_id === mine.id)!;
    expect(target).toMatchObject({
      version: 1,
      epoch: 1,
      sides: ['buy', 'sell'],
      symbols: ['PGA'],
    });
    expect(target.config.indicators.ma?.master_enabled).toBe(true);

    // Evaluation: first observation, durable key, same-session skip, unknown keeps state.
    const base = {
      target,
      symbol: 'PGA',
      side: 'buy' as const,
      evaluated_at: new Date('2026-01-06T09:00:00Z'),
      data_version: '1'.repeat(64),
      evidence: {
        session: '2026-01-06',
        bar: null,
        indicator_ids: ['ma'],
        indicator_params: {},
        rules: [],
      },
      reason: null,
    };
    const first = await alerts.applyEvaluation({ ...base, session: '2026-01-06', result: true });
    expect(first).toMatchObject({ event_created: true, duplicate: false, result: 'true' });
    const again = await alerts.applyEvaluation({ ...base, session: '2026-01-06', result: true });
    expect(again.plan).toEqual({ skip: 'already_evaluated' });
    // true -> unknown -> true: no second event, valid state kept.
    await alerts.applyEvaluation({
      ...base,
      session: '2026-01-07',
      result: null,
      reason: 'no_bar_for_session',
    });
    const back = await alerts.applyEvaluation({ ...base, session: '2026-01-08', result: true });
    expect(back).toMatchObject({ event_created: false, duplicate: false, result: 'true' });
    // false -> true: new signal.
    await alerts.applyEvaluation({ ...base, session: '2026-01-09', result: false });
    const signal = await alerts.applyEvaluation({ ...base, session: '2026-01-12', result: true });
    expect(signal.event_created).toBe(true);
    // Losing the durable state while the event exists: the unique key still stops a duplicate.
    await pool.query(`DELETE FROM strategy_alert_states WHERE alert_id = $1`, [mine.id]);
    const dup = await alerts.applyEvaluation({ ...base, session: '2026-01-12', result: true });
    expect(dup).toMatchObject({ event_created: false, duplicate: true });

    const page = await alerts.listEvents(admin, { alert_id: mine.id, offset: 0, limit: 1 });
    expect(page.total).toBe(2);
    expect(page.items[0]).toMatchObject({
      signal_session: '2026-01-12',
      event_kind: 'new_signal',
      message: 'Thỏa điều kiện Mua',
      previous_valid_result: false,
      alert_name: `${NAME_PREFIX} target`,
    });
    expect((await alerts.listEvents(admin, { side: 'sell', offset: 0, limit: 10 })).total).toBe(0);
    expect(await alerts.getEvent(plain, page.items[0]!.id)).toBeNull();
    await expect(
      pool.query(`UPDATE strategy_alert_events SET message = 'x' WHERE alert_id = $1`, [mine.id]),
    ).rejects.toThrow(/immutable/);

    const [summary] = await alerts.stateSummaries([mine.id]);
    expect(summary).toMatchObject({ total: 1, true_count: 1, last_session: '2026-01-12' });

    // Resume = epoch + 1 makes the pair due again and forgets the previous valid state.
    await alerts.update(admin, mine.id, { enabled: false });
    await alerts.update(admin, mine.id, { enabled: true });
    const fresh = (await alerts.listTargets()).find((item) => item.alert_id === mine.id)!;
    expect(fresh.epoch).toBe(2);
    const afterResume = await alerts.applyEvaluation({
      ...base,
      target: fresh,
      session: '2026-01-13',
      result: true,
    });
    expect(afterResume.plan).toMatchObject({ event: { kind: 'first_observation' } });

    for (const alert of [mine, paused, free]) await alerts.remove(alert.user_id, alert.id);
  });

  it('screener runs: owner-scoped storage, immutability and bounded retention', async () => {
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
      components: [],
    });
    const rows = (symbols: string[]): ScreenerRow[] =>
      symbols.map((symbol) => ({
        symbol,
        name: symbol,
        sector: 'S',
        exchange: 'HOSE',
        passed: symbol !== 'PGX',
        metrics: { roe: cell(symbol === 'PGX' ? 'missing' : 'ok') } as never,
      }));
    const header = (): Omit<ScreenerRunHeader, 'result_id'> => ({
      schema_version: '3.0',
      data_mode: 'latest_disclosed',
      as_of: '2026-02-01T03:00:00.000Z',
      definition: {
        schema_version: '3.0',
        name: 'ROE',
        logic: 'AND',
        data_mode: 'latest_disclosed',
        rules: [
          {
            id: 'r1',
            metric_id: 'roe',
            period: 'ttm',
            operator: '>',
            value: 0.1,
            api_unit: 'ratio',
          },
        ],
        scope: { market: 'HOSE', sector: '' },
      },
      legacy_review: null,
      data_source: 'VCI',
      calculation_version: 'iqx-fund-2.0',
      registry_version: 'iqx-fund-registry-2.1',
      universe_truncated: false,
      provenance_notes: {
        period_dates: 'not_provided_by_source',
        report_scope: 'not_provided_by_source',
        availability_rule: 'x',
      },
      counts: {
        universe: 3,
        passed: 2,
        failed_threshold: 0,
        with_required_exceptions: 1,
        missing: 1,
      },
      data_quality: { metrics: [] },
    });
    const id = await runs.insert({
      user_id: admin,
      definition_hash: '9'.repeat(64),
      header: header(),
      results: rows(['PGA', 'PGB', 'PGX']),
    });
    const stored = await runs.find(admin, id);
    expect(stored?.header).toMatchObject({
      result_id: id,
      as_of: '2026-02-01T03:00:00.000Z',
      counts: { passed: 2 },
    });
    expect(stored?.results).toHaveLength(3);
    expect(await runs.find(plain, id)).toBeNull();
    await expect(
      pool.query(`UPDATE screener_runs SET data_source = 'x' WHERE id = $1`, [id]),
    ).rejects.toThrow(/immutable/);

    // Snapshot and list from the stored run: rows come from the server, never the client.
    const snapshot = await results.createSnapshot(admin, {
      name: `${NAME_PREFIX} snapshot`,
      run_id: id,
      selection: { mode: 'subset', symbols: ['PGA'] },
      visibility: 'saved',
      idempotency_key: `${NAME_PREFIX}-snap-${randomUUID()}`,
    });
    expect(snapshot).toMatchObject({
      symbols: ['PGA'],
      row_count: 1,
      visibility: 'saved',
      run_id: id,
    });
    expect(snapshot.as_of).toBe('2026-02-01T03:00:00.000Z');
    expect(snapshot.created_at).not.toBe(snapshot.as_of);
    expect(snapshot.rows[0]).toMatchObject({ symbol: 'PGA', passed: true });
    await expect(
      results.createSnapshot(admin, {
        name: 'bad',
        run_id: id,
        selection: { mode: 'subset', symbols: ['PGX'] },
        visibility: 'saved',
      }),
    ).rejects.toMatchObject({ response: { code: 'SELECTION_INVALID' } });
    await expect(
      results.createSnapshot(plain, {
        name: 'foreign',
        run_id: id,
        selection: { mode: 'all' },
        visibility: 'saved',
      }),
    ).rejects.toMatchObject({ response: { code: 'SCREENER_RESULT_NOT_FOUND' } });
    await expect(
      pool.query(`UPDATE result_snapshots SET name = 'x' WHERE id = $1`, [snapshot.id]),
    ).rejects.toThrow(/immutable/);

    const list = await results.createListFromResult(admin, {
      name: `${NAME_PREFIX} list`,
      run_id: id,
      selection: { mode: 'all' },
      visibility: 'internal',
    });
    expect(list).toMatchObject({
      tickers: ['PGA', 'PGB'],
      visibility: 'internal',
      run_id: id,
      data_source: 'VCI',
      as_of: '2026-02-01',
    });
    expect(list.provenance).toMatchObject({
      kind: 'filter_result',
      selection: { mode: 'all', selected_count: 2 },
    });
    expect((await lists.listLists(admin)).items.map((item) => item.id)).not.toContain(list.id);
    expect((await lists.listLists(admin, true)).items.map((item) => item.id)).toContain(list.id);
    expect((await results.listSnapshots(admin)).items.map((item) => item.id)).toContain(
      snapshot.id,
    );

    // The Bot buys from the list => cannot delete the list or its snapshot (spec 8.7).
    const rev = (revision: number, patch: Record<string, unknown>) => ({
      listId: list.id,
      revision,
      kind: 'custom',
      status: 'effective',
      session: '2026-01-05',
      ...patch,
    });
    const insertRevision = async (value: ReturnType<typeof rev>) =>
      pool.query(
        `INSERT INTO bot_universe_revisions
           (user_id, bot_account_id, revision, kind, saved_list_id, list_as_of, name, tickers,
            requested_at, effective_session, status, idempotency_key, request_hash, cancelled_at)
         VALUES ($1, $2, $3, $4, $5, '2026-02-01', $6, $7::text[], now(), $8, $9, $10, $11, $12)`,
        [
          admin,
          botAccount,
          value.revision,
          value.kind,
          value.kind === 'custom' ? value.listId : null,
          `${NAME_PREFIX} src ${value.revision}`,
          value.kind === 'custom' ? ['PGA'] : null,
          value.status === 'calendar_unavailable' ? null : value.session,
          value.status,
          `${NAME_PREFIX}-idem-${randomUUID()}`,
          '8'.repeat(64),
          value.status === 'cancelled' ? new Date() : null,
        ],
      );
    const today = (iso: string) => new Date(`${iso}T05:00:00Z`);
    await insertRevision(rev(1, { status: 'pending', session: '2026-02-02' }));
    await expect(lists.deleteList(admin, list.id, today('2026-02-03'))).rejects.toMatchObject({
      response: { code: 'LIST_IN_USE_BY_BOT', details: [{ role: 'effective', revision: 1 }] },
    });
    await expect(
      results.deleteSnapshot(admin, list.result_snapshot_id!, today('2026-02-03')),
    ).rejects.toMatchObject({
      response: { code: 'LIST_IN_USE_BY_BOT' },
    });
    // Before its effective session the same revision is pending, and still blocks.
    await expect(lists.deleteList(admin, list.id, today('2026-02-01'))).rejects.toMatchObject({
      response: { details: [{ role: 'pending' }] },
    });
    // A newer revision to VN30 that has taken effect releases the list ...
    await insertRevision(rev(2, { kind: 'vn30', status: 'pending', session: '2026-02-10' }));
    await expect(lists.deleteList(admin, list.id, today('2026-02-05'))).rejects.toMatchObject({
      response: { details: [{ role: 'effective', revision: 1 }] },
    });
    await lists.deleteList(admin, list.id, today('2026-02-10'));
    // ... and a cancelled / superseded revision never blocks.
    const other = await results.createListFromResult(admin, {
      name: `${NAME_PREFIX} other`,
      run_id: id,
      selection: { mode: 'all' },
      visibility: 'saved',
    });
    await insertRevision(rev(3, { listId: other.id, status: 'cancelled', session: '2026-03-01' }));
    await insertRevision(rev(4, { listId: other.id, status: 'superseded', session: '2026-03-02' }));
    await lists.deleteList(admin, other.id, today('2026-02-10'));
    // Soft delete only: the row and its provenance survive.
    const [kept] = (
      await pool.query(`SELECT deleted_at, result_snapshot_id FROM list_snapshots WHERE id = $1`, [
        list.id,
      ])
    ).rows;
    expect(kept.deleted_at).not.toBeNull();
    expect(kept.result_snapshot_id).toBe(list.result_snapshot_id);
    await results.deleteSnapshot(admin, snapshot.id);
    await expect(results.getSnapshot(admin, snapshot.id)).rejects.toMatchObject({
      response: { code: 'RESULT_SNAPSHOT_NOT_FOUND' },
    });

    // Retention: only the newest N runs of a user are kept.
    for (let i = 0; i < 32; i += 1)
      await runs.insert({
        user_id: outsider,
        definition_hash: '7'.repeat(64),
        header: header(),
        results: [],
      });
    const [{ count }] = (
      await pool.query(`SELECT count(*)::int AS count FROM screener_runs WHERE user_id = $1`, [
        outsider,
      ])
    ).rows;
    expect(count).toBe(30);
  });
});
