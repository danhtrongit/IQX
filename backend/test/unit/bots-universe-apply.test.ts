import { describe, expect, it } from 'vitest';

import type { AcademyGrantsPort } from '../../src/modules/academy/academy.ports.js';
import { BotUniverseService } from '../../src/modules/bots/bot-universe.service.js';
import type { IndexMembershipService } from '../../src/modules/market-integration/index-membership.service.js';
import type { DatabaseService, SqlClient } from '../../src/platform/database/index.js';

/**
 * `applyList` against a scripted SQL fake: it proves the Bot only buys from a list tied to a
 * server-held screener result (Bot SPEC 6.2, Strategy SPEC 8.4) and that `metric:<id>` grants are
 * checked against the result's own filter definition. The real SQL runs in
 * strategy-sql.pg.test.ts (STRATEGY_PG_URL).
 */
const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const LIST = '10000000-0000-4000-8000-000000000001';
const SNAPSHOT = '20000000-0000-4000-8000-000000000001';
const KEY = 'idempotency-key-1';

const rule = (metric: string) => ({
  id: `r-${metric}`,
  metric_id: metric,
  period: 'ttm',
  operator: '>',
  value: 0.1,
  api_unit: 'ratio',
});
const definition = (metrics: string[], columns: string[] = []) => ({
  schema_version: '3.0',
  name: 'ROE',
  logic: 'AND',
  data_mode: 'latest_disclosed',
  rules: metrics.map(rule),
  columns: columns.map((metric) => ({ metric_id: metric, period: 'ttm' })),
  scope: { market: 'HOSE', sector: '' },
});

type Scenario = {
  list: Record<string, unknown> | null;
  snapshot: { symbols: string[]; definition: unknown } | null;
  granted: string[];
};

function harness(scenario: Scenario) {
  const queries: string[] = [];
  const inserted: unknown[][] = [];
  const baseList = {
    id: LIST,
    name: 'Danh mục thử',
    tickers: ['FPT', 'HPG'],
    filter_id: null,
    filter_version: null,
    as_of: '2026-09-29',
    data_source: 'VCI',
    scope: { market: 'HOSE' },
    result_snapshot_id: SNAPSHOT,
    run_id: null,
    created_at: new Date('2026-09-29T03:00:00Z'),
  };
  let stored: Record<string, unknown> | null = null;
  const tx: SqlClient = {
    query: (async (text: string, values?: readonly unknown[]) => {
      queries.push(text);
      if (text.includes('pg_advisory_xact_lock')) return [];
      if (text.includes('from bot_accounts')) return [{ id: 'acc-1' }];
      if (text.includes('idempotency_key = $2')) return [];
      if (text.includes('select max(revision)')) return [{ revision: stored ? 1 : 0 }];
      if (text.includes('from list_snapshots')) {
        const owner = values?.[1];
        return scenario.list && owner === USER ? [{ ...baseList, ...scenario.list }] : [];
      }
      if (text.includes('from result_snapshots')) {
        return scenario.snapshot && values?.[1] === USER ? [scenario.snapshot] : [];
      }
      if (text.includes('from symbols')) {
        const wanted = (values?.[0] as string[]) ?? [];
        return wanted.map((symbol) => ({
          symbol,
          name: symbol,
          exchange: 'HOSE',
          is_active: true,
          is_index: false,
          asset_type: 'stock',
        }));
      }
      if (text.includes('virtual_trading_configs')) {
        return [{ holidays: JSON.stringify(['2026-10-02']) }];
      }
      if (text.includes('insert into bot_universe_revisions')) {
        inserted.push([...(values ?? [])]);
        const v = values ?? [];
        stored = {
          id: v[0],
          user_id: v[1],
          bot_account_id: v[2],
          revision: v[3],
          kind: v[4],
          saved_list_id: v[5],
          list_as_of: v[6],
          list_filter_id: v[7],
          list_filter_version: v[8],
          name: v[9],
          tickers: v[10],
          provenance: JSON.parse(String(v[11])),
          requested_at: v[12],
          effective_session: v[13],
          status: v[14],
          superseded_by: null,
          idempotency_key: v[15],
          request_hash: v[16],
          created_at: v[12],
          cancelled_at: null,
        };
        return [stored];
      }
      if (text.includes('update bot_universe_revisions')) return [];
      if (text.includes('from bot_universe_revisions')) {
        return text.includes('effective_session <= $2::date') ? [] : stored ? [stored] : [];
      }
      throw new Error(`unscripted query: ${text}`);
    }) as SqlClient['query'],
  };
  const database = {
    transaction: async <T>(work: (client: SqlClient) => Promise<T>) => work(tx),
    query: tx.query,
  } as unknown as DatabaseService;
  const grants: AcademyGrantsPort = {
    grantedCapabilities: async () => new Set(scenario.granted),
  };
  const membership = { latestOnOrBefore: async () => null } as unknown as IndexMembershipService;
  return {
    service: new BotUniverseService(database, membership, grants),
    queries,
    inserted,
  };
}

const input = (symbols = ['FPT', 'HPG']) => ({
  list_id: LIST,
  symbols,
  expected_revision: 0,
  idempotency_key: KEY,
});

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const e = error as {
      getStatus: () => number;
      getResponse: () => { code?: string; message?: string; details?: unknown };
    };
    return { status: e.getStatus(), ...e.getResponse() };
  }
  throw new Error('expected the call to be rejected');
}

const verified: Scenario = {
  list: {},
  snapshot: { symbols: ['FPT', 'HPG', 'VNM'], definition: definition(['roe']) },
  granted: ['metric:roe'],
};

describe('BotUniverseService.applyList: only server-verified lists', () => {
  it('V01 applies a list made from a stored result and records the evidence in the provenance', async () => {
    const { service, inserted } = harness(verified);
    const result = await service.applyList(USER, input());
    expect(result.request).toMatchObject({ kind: 'custom', saved_list_id: LIST, symbol_count: 2 });
    expect(inserted).toHaveLength(1);
    expect(result.request.provenance).toMatchObject({
      result: { snapshot_id: SNAPSHOT, run_id: null },
      list: { id: LIST },
    });
  });

  it('V02 refuses a client-declared list (no result evidence) with 422 LIST_NOT_VERIFIED', async () => {
    const { service, inserted } = harness({
      ...verified,
      list: { result_snapshot_id: null },
      snapshot: null,
    });
    const error = await rejection(service.applyList(USER, input()));
    expect(error).toMatchObject({
      status: 422,
      code: 'LIST_NOT_VERIFIED',
      details: [{ field: 'list_id', reason: 'no_result' }],
    });
    expect(error.message).toMatch(/Bộ lọc/);
    expect(inserted).toHaveLength(0);
  });

  it('V03 a list with a filter id but no result is still not verified (a filter alone proves nothing)', async () => {
    const { service } = harness({
      ...verified,
      list: { result_snapshot_id: null, filter_id: SNAPSHOT, filter_version: 1 },
      snapshot: null,
    });
    expect(await rejection(service.applyList(USER, input()))).toMatchObject({
      status: 422,
      code: 'LIST_NOT_VERIFIED',
    });
  });

  it('V04 a missing or foreign snapshot fails verification', async () => {
    const { service } = harness({ ...verified, snapshot: null });
    expect(await rejection(service.applyList(USER, input()))).toMatchObject({
      status: 422,
      code: 'LIST_NOT_VERIFIED',
      details: [{ reason: 'result_missing' }],
    });
  });

  it('V05 tickers outside the frozen result fail verification', async () => {
    const { service } = harness({
      ...verified,
      list: { tickers: ['FPT', 'HPG', 'SSI'] },
    });
    expect(await rejection(service.applyList(USER, input(['FPT'])))).toMatchObject({
      status: 422,
      code: 'LIST_NOT_VERIFIED',
      details: [{ reason: 'tickers_outside_result' }],
    });
  });

  it('V06 an unreadable stored definition cannot prove the grants, so it fails closed', async () => {
    const { service } = harness({
      ...verified,
      snapshot: { symbols: ['FPT', 'HPG'], definition: { nope: true } },
    });
    expect(await rejection(service.applyList(USER, input()))).toMatchObject({
      status: 422,
      code: 'LIST_NOT_VERIFIED',
    });
  });

  it('V07 another user cannot apply a list they do not own (404, never verified)', async () => {
    const { service } = harness(verified);
    expect(await rejection(service.applyList(OTHER, input()))).toMatchObject({
      status: 404,
      code: 'LIST_NOT_FOUND',
    });
  });
});

describe('BotUniverseService.applyList: metric grants of the result definition', () => {
  it('G01 needs metric:<id> for every rule and column of the result, listing the missing ones', async () => {
    const { service, inserted } = harness({
      ...verified,
      snapshot: {
        symbols: ['FPT', 'HPG'],
        definition: definition(['roe', 'pe'], ['gross_margin']),
      },
      granted: ['metric:roe'],
    });
    const error = await rejection(service.applyList(USER, input()));
    expect(error).toMatchObject({
      status: 403,
      code: 'CAPABILITY_LOCKED',
      details: [
        { capability: 'metric:gross_margin', reason: 'not_learned' },
        { capability: 'metric:pe', reason: 'not_learned' },
      ],
    });
    expect(inserted).toHaveLength(0);
  });

  it('G02 passes when every metric of the result is learned', async () => {
    const { service } = harness({
      ...verified,
      snapshot: { symbols: ['FPT', 'HPG'], definition: definition(['roe', 'pe']) },
      granted: ['metric:roe', 'metric:pe', 'indicator:rsi'],
    });
    expect((await service.applyList(USER, input())).request.kind).toBe('custom');
  });

  it('G03 verification comes before the grant check, so an unverified list never leaks the metrics', async () => {
    const { service } = harness({
      list: { result_snapshot_id: null },
      snapshot: null,
      granted: [],
    });
    expect(await rejection(service.applyList(USER, input()))).toMatchObject({
      code: 'LIST_NOT_VERIFIED',
    });
  });
});
