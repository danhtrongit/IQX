import { randomUUID } from 'node:crypto';

import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type { AcademyGrantsPort } from '../../src/modules/academy/academy.ports.js';
import { ApiAuthGuard, PremiumGuard } from '../../src/modules/auth/index.js';
import { AUTH_PREMIUM_KEY } from '../../src/modules/auth/auth.decorators.js';
import type { VciMarketProvider } from '../../src/modules/market-data/index.js';
import { ScreenerEnabledGuard } from '../../src/modules/screener/screener-enabled.guard.js';
import { ScreenerController } from '../../src/modules/screener/screener.controller.js';
import type {
  NewScreenerRun,
  ScreenerRunStore,
  StoredScreenerRun,
} from '../../src/modules/screener/screener.repository.js';
import {
  legacyScreenerDefinitionSchema,
  screenerDefinitionSchema,
  screenerRunInputSchema,
  SCREENER_FETCH_CONCURRENCY,
  SCREENER_MAX_UNIVERSE,
  type ScreenerDefinition,
} from '../../src/modules/screener/screener.schemas.js';
import {
  mapWithConcurrency,
  rulePasses,
  ScreenerService,
  summarizeRows,
} from '../../src/modules/screener/screener.service.js';
import type { Environment } from '../../src/platform/config/environment.js';
import type { DatabaseService } from '../../src/platform/database/index.js';

type Row = Record<string, unknown>;

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER_USER = '00000000-0000-4000-8000-000000000002';

function grants(capabilities: string[]): AcademyGrantsPort {
  return { grantedCapabilities: async () => new Set(capabilities) };
}

/** In-memory twin of the screener_runs table: owner-scoped reads, immutable rows. */
class InMemoryRunStore implements ScreenerRunStore {
  readonly rows: Array<NewScreenerRun & { id: string; created_at: Date }> = [];

  async insert(run: NewScreenerRun): Promise<string> {
    const id = randomUUID();
    this.rows.push({ ...structuredClone(run), id, created_at: new Date() });
    return id;
  }

  async find(userId: string, resultId: string): Promise<StoredScreenerRun | null> {
    const row = this.rows.find((item) => item.id === resultId && item.user_id === userId);
    if (!row) return null;
    return {
      header: { result_id: row.id, ...structuredClone(row.header) },
      results: structuredClone(row.results),
      created_at: row.created_at,
    };
  }
}

interface UniverseSymbol {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
}

function fakeDatabase(symbols: UniverseSymbol[]) {
  const calls: unknown[][] = [];
  const database = {
    query: async (_sql: string, params: unknown[]) => {
      calls.push(params);
      const [market, sector, limit] = params as [string, string | null, number];
      return symbols
        .filter((row) => market === 'ALL' || row.exchange === market)
        .filter((row) => sector === null || row.sector.toLowerCase() === sector.toLowerCase())
        .slice(0, limit);
    },
  } as unknown as DatabaseService;
  return { database, calls };
}

/** Eight discrete quarters + four fiscal years; revenue grows YoY by revenueNow / revenueBase. */
function statementRows(revenueNow: number, revenueBase: number) {
  const quarters: Record<'income' | 'cash' | 'balance', Row[]> = {
    income: [],
    cash: [],
    balance: [],
  };
  const years: Record<'income' | 'cash' | 'balance', Row[]> = { income: [], cash: [], balance: [] };
  for (const year of [2023, 2024])
    for (const q of [1, 2, 3, 4]) {
      const meta = {
        year_report: year,
        length_report: q,
        public_date: `${year}-${String(q * 3).padStart(2, '0')}-28T00:00:00`,
        update_date: `${year}-${String(q * 3).padStart(2, '0')}-28T08:00:00`,
      };
      const revenue = (year === 2024 ? revenueNow : revenueBase) / 4;
      quarters.income.push({
        ...meta,
        isa3: revenue,
        isa5: revenue * 0.25,
        isa8: -1,
        isa16: 10,
        isa20: 8,
        isa22: 8,
      });
      quarters.cash.push({ ...meta, cfa2: 1, cfa18: 9, cfa19: -2 });
      quarters.balance.push({
        ...meta,
        bsa1: 300,
        bsa53: 1000,
        bsa55: 200,
        bsa56: 50,
        bsa71: 50,
        bsa78: 400,
        bsa174: 0,
        bsa210: 0,
      });
    }
  for (const year of [2021, 2022, 2023, 2024]) {
    const meta = { year_report: year, length_report: 5, public_date: `${year + 1}-03-01T00:00:00` };
    years.income.push({ ...meta, isa3: 100 * (year - 2019), isa22: 10 });
    years.cash.push({ ...meta, cfa18: 9, cfa19: -2 });
    years.balance.push({ ...meta, bsa78: 400 });
  }
  return {
    BALANCE_SHEET: { years: years.balance, quarters: quarters.balance },
    INCOME_STATEMENT: { years: years.income, quarters: quarters.income },
    CASH_FLOW: { years: years.cash, quarters: quarters.cash },
  };
}

function fakeVci(options: {
  revenue: Record<string, [number, number]>;
  failing?: string[];
  prices?: Record<string, number>;
  shares?: Record<string, number>;
}) {
  let inFlight = 0;
  let maxInFlight = 0;
  const statementCalls: string[] = [];
  const vci = {
    fetchFinancialRaw: async (
      symbol: string,
      section: 'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'CASH_FLOW',
    ) => {
      statementCalls.push(`${symbol}:${section}`);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      if (options.failing?.includes(symbol)) throw new Error('upstream 503');
      const revenue = options.revenue[symbol] ?? [0, 0];
      return { data: statementRows(revenue[0], revenue[1])[section], rawEndpoint: 'fake' };
    },
    fetchPriceBoard: async (symbols: string[]) => ({
      data: symbols
        .filter((symbol) => options.prices?.[symbol] !== undefined)
        .map((symbol) => ({ symbol, close_price: options.prices![symbol], reference_price: null })),
      rawEndpoint: 'fake',
    }),
    fetchFinancialReport: async (symbol: string) => ({
      data: options.shares?.[symbol] ? [{ number_of_shares_mkt_cap: options.shares[symbol] }] : [],
      rawEndpoint: 'fake',
    }),
  } as unknown as VciMarketProvider;
  return { vci, statementCalls, maxInFlight: () => maxInFlight };
}

const UNIVERSE: UniverseSymbol[] = [
  { symbol: 'AAA', name: 'Công ty A', exchange: 'HOSE', sector: 'Hóa chất' },
  { symbol: 'BBB', name: 'Công ty B', exchange: 'HOSE', sector: 'Xây dựng' },
  { symbol: 'CCC', name: 'Công ty C', exchange: 'HNX', sector: 'Hóa chất' },
  { symbol: 'DDD', name: 'Công ty D', exchange: 'HOSE', sector: 'Hóa chất' },
  { symbol: 'EEE', name: 'Công ty E', exchange: 'HOSE', sector: 'Hóa chất' },
];

function definition(overrides: Partial<ScreenerDefinition> = {}): ScreenerDefinition {
  return screenerDefinitionSchema.parse({
    schema_version: '3.0',
    name: 'Tăng trưởng',
    logic: 'AND',
    rules: [
      {
        id: 'r1',
        metric_id: 'revenue_yoy',
        period: 'ttm',
        operator: '>',
        value: 0.15,
        api_unit: 'ratio',
      },
    ],
    scope: { market: 'HOSE', sector: '' },
    ...overrides,
  });
}

function service(
  universe: UniverseSymbol[],
  vci: VciMarketProvider,
  capabilities: string[],
  store = new InMemoryRunStore(),
) {
  const { database, calls } = fakeDatabase(universe);
  return {
    store,
    calls,
    service: new ScreenerService(database, vci, grants(capabilities), store),
  };
}

const NOW = new Date('2025-06-01T03:00:00Z');

describe('screenerDefinitionSchema (filter definition 3.0: a period per rule)', () => {
  const base = {
    schema_version: '3.0',
    name: 'x',
    logic: 'AND',
    scope: { market: 'ALL', sector: '' },
  };
  const rule = {
    id: 'r',
    metric_id: 'roe',
    period: 'ttm',
    operator: '>',
    value: 0.1,
    api_unit: 'ratio',
  };

  it('accepts a valid definition and scope-only filters; data_mode defaults to latest_disclosed', () => {
    expect(definition().rules).toHaveLength(1);
    expect(definition({ rules: [] }).rules).toEqual([]);
    expect(definition().data_mode).toBe('latest_disclosed');
  });

  it('F02/F03 offers only the periods of the registry: ROE has TTM and year, never quarter', () => {
    for (const period of ['ttm', 'year'])
      expect(
        screenerDefinitionSchema.safeParse({ ...base, rules: [{ ...rule, period }] }).success,
      ).toBe(true);
    const quarter = screenerDefinitionSchema.safeParse({
      ...base,
      rules: [{ ...rule, period: 'quarter' }],
    });
    expect(quarter.success).toBe(false);
    expect(JSON.stringify(quarter.error?.issues)).toContain('ROE'.toLowerCase());
    // The three growth metrics allow quarter / ttm / year.
    for (const metric_id of ['revenue_yoy', 'profit_yoy'])
      for (const period of ['quarter', 'ttm', 'year'])
        expect(
          screenerDefinitionSchema.safeParse({
            ...base,
            rules: [{ ...rule, metric_id, period }],
          }).success,
        ).toBe(true);
    // 3-year metrics have one period.
    expect(
      screenerDefinitionSchema.safeParse({
        ...base,
        rules: [{ ...rule, metric_id: 'revenue_cagr3', period: 'ttm' }],
      }).success,
    ).toBe(false);
  });

  it('rejects api_unit not matching the registry, unknown metrics, extra keys and bad logic', () => {
    expect(screenerDefinitionSchema.safeParse({ ...base, rules: [rule] }).success).toBe(true);
    const bad = (patch: Row) =>
      screenerDefinitionSchema.safeParse({ ...base, rules: [{ ...rule, ...patch }] }).success;
    expect(bad({ api_unit: 'lần' })).toBe(false);
    expect(bad({ metric_id: 'rsi' })).toBe(false);
    expect(bad({ operator: '>=' })).toBe(false);
    expect(bad({ extra: 1 })).toBe(false);
    expect(bad({ period: undefined })).toBe(false);
    expect(screenerDefinitionSchema.safeParse({ ...base, logic: 'OR', rules: [] }).success).toBe(
      false,
    );
    expect(
      screenerDefinitionSchema.safeParse({ ...base, schema_version: '1.0', rules: [] }).success,
    ).toBe(false);
    expect(
      screenerDefinitionSchema.safeParse({
        ...base,
        rules: [],
        scope: { ...base.scope, market: 'NYSE' },
      }).success,
    ).toBe(false);
  });

  it('has no filter-wide period and accepts no client-supplied cutoff', () => {
    const withPeriod = screenerDefinitionSchema.safeParse({
      ...base,
      rules: [],
      scope: { ...base.scope, period: 'ttm' },
    });
    expect(withPeriod.success).toBe(false);
    for (const key of ['as_of', 'date', 'cutoff'])
      expect(
        screenerDefinitionSchema.safeParse({ ...base, rules: [], [key]: '2020-01-01' }).success,
      ).toBe(false);
  });

  it('one metric, one period: a metric cannot repeat in rules or reference columns', () => {
    const duplicate = screenerDefinitionSchema.safeParse({
      ...base,
      rules: [rule, { ...rule, id: 'r2', period: 'year' }],
    });
    expect(duplicate.success).toBe(false);
    expect(
      screenerDefinitionSchema.safeParse({
        ...base,
        rules: [rule],
        columns: [{ metric_id: 'roe', period: 'year' }],
      }).success,
    ).toBe(false);
    expect(
      screenerDefinitionSchema.safeParse({
        ...base,
        rules: [rule],
        columns: [{ metric_id: 'gross_margin', period: 'ttm' }],
      }).success,
    ).toBe(true);
  });

  it('still accepts the legacy 2.0 shape through the run input union', () => {
    const legacy = {
      schema_version: '2.0',
      name: 'cũ',
      logic: 'AND',
      rules: [{ id: 'r', metric_id: 'roe', operator: '>', value: 0.1, api_unit: 'ratio' }],
      scope: { market: 'HOSE', sector: '', period: 'TTM' },
    };
    expect(legacyScreenerDefinitionSchema.safeParse(legacy).success).toBe(true);
    expect(screenerRunInputSchema.safeParse(legacy).success).toBe(true);
    expect(screenerDefinitionSchema.safeParse(legacy).success).toBe(false);
  });
});

describe('rulePasses', () => {
  it('is strict, AND-friendly and never passes on null', () => {
    expect(rulePasses({ value: 0.15, status: 'ok' }, '>', 0.15)).toBe(false);
    expect(rulePasses({ value: 0.15, status: 'ok' }, '<', 0.15)).toBe(false);
    expect(rulePasses({ value: 0.16, status: 'ok' }, '>', 0.15)).toBe(true);
    expect(rulePasses({ value: null, status: 'missing' }, '<', 0.15)).toBe(false);
    expect(rulePasses({ value: null, status: 'not_applicable' }, '>', -1)).toBe(false);
    expect(rulePasses({ value: null, status: 'insufficient_base' }, '<', 1e12)).toBe(false);
    expect(rulePasses({ value: null, status: 'data_unavailable' }, '<', 1e12)).toBe(false);
    expect(rulePasses({ value: null, status: 'definition_pending' }, '>', -1e12)).toBe(false);
  });

  it('F19 compares the unrounded value: 8.164965… passes > 8.16 although it displays 8.16', () => {
    expect(rulePasses({ value: 8.164965, status: 'ok' }, '>', 8.16)).toBe(true);
    expect(rulePasses({ value: 8.164965, status: 'ok' }, '<', 8.165)).toBe(true);
  });

  it('a lower-bound streak can satisfy `>` but never `<`', () => {
    expect(rulePasses({ value: 5, status: 'ok', lower_bound: true }, '>', 3)).toBe(true);
    expect(rulePasses({ value: 5, status: 'ok', lower_bound: true }, '<', 10)).toBe(false);
  });
});

describe('mapWithConcurrency', () => {
  it('keeps order and bounds in-flight work', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9], 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18]);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe('ScreenerService.metrics', () => {
  it('lists the 42 registry metrics with learned flags, readiness and the period policy', async () => {
    const { service: svc } = service(UNIVERSE, fakeVci({ revenue: {} }).vci, [
      'metric:roe',
      'lesson:ch03-l01',
    ]);
    const metrics = await svc.metrics(USER);
    expect(metrics).toHaveLength(42);
    expect(metrics.find((m) => m.id === 'roe')).toMatchObject({
      learned: true,
      supported: true,
      readiness: 'ready',
      unsupported_reason: null,
      api_unit: 'ratio',
      default_period: 'ttm',
      allowed_periods: [
        { id: 'ttm', label: 'Bốn quý gần nhất' },
        { id: 'year', label: 'Năm tài chính gần nhất' },
      ],
    });
    // Spec §7.3: revenue / LNST / EPS default to the latest quarter; margins and ROE to TTM.
    const defaults = Object.fromEntries(metrics.map((m) => [m.id, m.default_period]));
    expect(defaults).toMatchObject({
      revenue_yoy: 'quarter',
      profit_yoy: 'quarter',
      eps_yoy: 'quarter',
      gross_margin: 'ttm',
      net_margin: 'ttm',
      roe: 'ttm',
    });
    expect(metrics.find((m) => m.id === 'gross_margin')?.allowed_periods.map((p) => p.id)).toEqual([
      'ttm',
      'quarter',
      'year',
    ]);
    expect(metrics.find((m) => m.id === 'pe')).toMatchObject({ learned: false, supported: true });
    // Balance metrics read the balance at the end of the period.
    expect(metrics.find((m) => m.id === 'debt_equity')?.allowed_periods[0]).toEqual({
      id: 'quarter',
      label: 'Số dư cuối quý gần nhất',
    });
    // Metrics the repo cannot compute never claim a formula.
    const dividend = metrics.find((m) => m.id === 'dividend_yield')!;
    expect(dividend).toMatchObject({ supported: false, readiness: 'data_unavailable' });
    expect(dividend.unsupported_reason).toBeTruthy();
    expect(metrics.find((m) => m.id === 'roic')?.readiness).toBe('definition_pending');
    expect(metrics.every((m) => m.allowed_periods.some((p) => p.id === m.default_period))).toBe(
      true,
    );
  });
});

describe('ScreenerService.run', () => {
  it('403 CAPABILITY_LOCKED when a rule or a reference column uses an unlearned metric', async () => {
    const { service: svc } = service(UNIVERSE, fakeVci({ revenue: {} }).vci, ['metric:roe']);
    const error = await svc.run(USER, definition(), NOW).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: 'CAPABILITY_LOCKED',
      capability: 'metric:revenue_yoy',
      reason: 'not_learned',
      details: [{ capability: 'metric:revenue_yoy', reason: 'not_learned' }],
    });
    const column = await svc
      .run(
        USER,
        definition({ rules: [], columns: [{ metric_id: 'gross_margin', period: 'ttm' }] }),
        NOW,
      )
      .catch((caught: unknown) => caught);
    expect(column).toBeInstanceOf(ForbiddenException);
  });

  it('filters with strict AND logic, per-rule periods and one documented status per cell', async () => {
    const fake = fakeVci({
      revenue: { AAA: [1200, 1000], BBB: [1150, 1000], DDD: [900, 0] },
      failing: ['EEE'],
    });
    const {
      service: svc,
      calls,
      store,
    } = service(UNIVERSE, fake.vci, ['metric:revenue_yoy', 'metric:gross_margin']);
    const result = await svc.run(
      USER,
      definition({
        rules: [
          {
            id: 'r1',
            metric_id: 'revenue_yoy',
            period: 'ttm',
            operator: '>',
            value: 0.15,
            api_unit: 'ratio',
          },
          {
            id: 'r2',
            metric_id: 'gross_margin',
            period: 'quarter',
            operator: '>',
            value: 0.2,
            api_unit: 'ratio',
          },
        ],
      }),
      NOW,
    );
    expect(calls[0]).toEqual(['HOSE', null, SCREENER_MAX_UNIVERSE + 1]);
    expect(result.results.map((r) => r.symbol)).toEqual(['AAA', 'BBB', 'DDD', 'EEE']);
    const bySymbol = Object.fromEntries(result.results.map((r) => [r.symbol, r]));
    expect(bySymbol.AAA!.passed).toBe(true);
    expect(bySymbol.AAA!.metrics.revenue_yoy).toMatchObject({
      status: 'ok',
      unit: 'ratio',
      period_mode: 'ttm',
      actual_period_label: 'TTM Q4/2024',
      comparison_period_label: 'TTM Q4/2023',
      published_at: '2024-12-28',
      available_at: '2024-12-29T00:00:00+07:00',
    });
    expect(bySymbol.AAA!.metrics.revenue_yoy!.value).toBeCloseTo(0.2, 12);
    // Each rule is evaluated on its own period (F04): the margin is the latest quarter.
    expect(bySymbol.AAA!.metrics.gross_margin).toMatchObject({
      period_mode: 'quarter',
      actual_period_label: 'Q4/2024',
    });
    // 15% YoY is not strictly greater than 0.15.
    expect(bySymbol.BBB!.metrics.revenue_yoy!.value).toBeCloseTo(0.15, 12);
    expect(bySymbol.BBB!.passed).toBe(false);
    expect(bySymbol.DDD!.metrics.revenue_yoy).toMatchObject({
      status: 'insufficient_base',
      value: null,
      reason_code: 'non_positive_base',
    });
    expect(bySymbol.EEE!.metrics.revenue_yoy).toMatchObject({
      status: 'missing',
      value: null,
      reason_code: 'provider_error',
    });
    expect(bySymbol.EEE!.passed).toBe(false);
    expect(result.counts).toEqual({
      universe: 4,
      passed: 1,
      failed_threshold: 1,
      with_required_exceptions: 2,
      missing: 1,
    });
    expect(result).toMatchObject({
      schema_version: '3.0',
      data_mode: 'latest_disclosed',
      as_of: NOW.toISOString(),
      calculation_version: 'iqx-fund-2.0',
      universe_truncated: false,
      provenance_notes: { period_dates: 'not_provided_by_source' },
    });
    expect(fake.maxInFlight()).toBeLessThanOrEqual(SCREENER_FETCH_CONCURRENCY * 3);
    // F18: exceptions are counted per metric, apart from "did not pass".
    const quality = result.data_quality.metrics.find((m) => m.metric_id === 'revenue_yoy')!;
    expect(quality).toMatchObject({
      period_mode: 'ttm',
      role: 'condition',
      by_status: { ok: 2, insufficient_base: 1, missing: 1 },
      by_reason: { non_positive_base: 1, provider_error: 1 },
    });
    // The run is stored once, owner-scoped, as the exact payload that was returned.
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]!.user_id).toBe(USER);
    expect(store.rows[0]!.results).toEqual(result.results);
    expect(result.result_id).toBe(store.rows[0]!.id);
  });

  it('F17 reference columns show data but never decide pass/fail and are not counted as required', async () => {
    const fake = fakeVci({ revenue: { AAA: [1200, 1000], BBB: [1200, 1000] } });
    const { service: svc } = service(UNIVERSE.slice(0, 2), fake.vci, [
      'metric:revenue_yoy',
      'metric:net_margin',
      'metric:pe',
    ]);
    const result = await svc.run(
      USER,
      definition({
        columns: [
          { metric_id: 'net_margin', period: 'ttm' },
          // No price/share basis: a reference cell that is missing must not drop the company.
          { metric_id: 'pe', period: 'ttm' },
        ],
      }),
      NOW,
    );
    expect(result.results.map((row) => row.passed)).toEqual([true, true]);
    expect(result.results[0]!.metrics.pe).toMatchObject({ status: 'missing', value: null });
    expect(result.results[0]!.metrics.net_margin).toMatchObject({ status: 'ok' });
    const roles = result.data_quality.metrics.map((item) => [item.metric_id, item.role]);
    expect(roles).toEqual([
      ['revenue_yoy', 'condition'],
      ['net_margin', 'reference'],
      ['pe', 'reference'],
    ]);
    expect(result.counts).toMatchObject({ passed: 2, with_required_exceptions: 0, missing: 2 });
  });

  it('applies the sector scope and treats empty rules as a scope-only filter without provider calls', async () => {
    const fake = fakeVci({ revenue: {} });
    const { service: svc, calls } = service(UNIVERSE, fake.vci, []);
    const result = await svc.run(
      USER,
      definition({ rules: [], scope: { market: 'all', sector: 'Hóa chất' } }),
      NOW,
    );
    expect(calls[0]).toEqual(['ALL', 'Hóa chất', SCREENER_MAX_UNIVERSE + 1]);
    expect(result.results.map((r) => [r.symbol, r.passed])).toEqual([
      ['AAA', true],
      ['CCC', true],
      ['DDD', true],
      ['EEE', true],
    ]);
    expect(result.counts).toMatchObject({ universe: 4, passed: 4, missing: 0 });
    expect(result.data_quality.metrics).toEqual([]);
    expect(fake.statementCalls).toEqual([]);
  });

  it('valuation uses the observed price and share basis', async () => {
    const fake = fakeVci({
      revenue: { AAA: [1200, 1000], BBB: [1200, 1000] },
      prices: { AAA: 20 },
      shares: { AAA: 4, BBB: 4 },
    });
    const { service: svc } = service(UNIVERSE.slice(0, 2), fake.vci, ['metric:pe']);
    const result = await svc.run(
      USER,
      definition({
        rules: [
          {
            id: 'r1',
            metric_id: 'pe',
            period: 'ttm',
            operator: '<',
            value: 15,
            api_unit: 'lần',
          },
        ],
      }),
      NOW,
    );
    const [aaa, bbb] = result.results;
    // TTM parent profit 32 over 4 shares → EPS 8; P/E = 20 / 8.
    expect(aaa!.metrics.pe).toMatchObject({ status: 'ok', unit: 'lần' });
    expect(aaa!.metrics.pe!.value).toBeCloseTo(2.5, 12);
    expect(aaa!.passed).toBe(true);
    expect(bbb!.metrics.pe).toMatchObject({
      status: 'missing',
      value: null,
      reason_code: 'price_unavailable',
    });
    expect(bbb!.passed).toBe(false);
  });

  it('refuses metrics without a definition or data source instead of running them', async () => {
    const fake = fakeVci({ revenue: {} });
    const { service: svc } = service(UNIVERSE, fake.vci, [
      'metric:dividend_yield',
      'metric:roic',
      'metric:roe',
    ]);
    const error = await svc
      .run(
        USER,
        definition({
          rules: [
            {
              id: 'r1',
              metric_id: 'dividend_yield',
              period: 'ttm',
              operator: '>',
              value: 0.01,
              api_unit: 'ratio',
            },
          ],
          columns: [{ metric_id: 'roic', period: 'ttm' }],
        }),
        NOW,
      )
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'METRIC_NOT_READY',
      details: [
        { metric_id: 'dividend_yield', readiness: 'data_unavailable' },
        { metric_id: 'roic', readiness: 'definition_pending' },
      ],
    });
    expect(fake.statementCalls).toEqual([]);
  });

  it('maps a legacy 2.0 definition onto every rule and runs it', async () => {
    const fake = fakeVci({ revenue: { AAA: [1200, 1000] } });
    const { service: svc } = service(UNIVERSE.slice(0, 1), fake.vci, ['metric:revenue_yoy']);
    const result = await svc.run(
      USER,
      legacyScreenerDefinitionSchema.parse({
        schema_version: '2.0',
        name: 'cũ',
        logic: 'AND',
        rules: [
          { id: 'r1', metric_id: 'revenue_yoy', operator: '>', value: 0.15, api_unit: 'ratio' },
        ],
        scope: { market: 'HOSE', sector: '', period: 'quarter' },
      }),
      NOW,
    );
    expect(result.definition.rules[0]).toMatchObject({
      metric_id: 'revenue_yoy',
      period: 'quarter',
    });
    expect(result.legacy_review).toMatchObject({
      stored_schema_version: '2.0',
      legacy_period: 'quarter',
      needs_review: false,
    });
    expect(result.results[0]!.metrics.revenue_yoy).toMatchObject({
      period_mode: 'quarter',
      actual_period_label: 'Q4/2024',
    });
  });

  it('I06 refuses a legacy definition whose period is no longer supported (ROE quarter)', async () => {
    const fake = fakeVci({ revenue: {} });
    const { service: svc, store } = service(UNIVERSE, fake.vci, ['metric:roe']);
    const error = await svc
      .run(
        USER,
        legacyScreenerDefinitionSchema.parse({
          schema_version: '2.0',
          name: 'cũ',
          logic: 'AND',
          rules: [{ id: 'r1', metric_id: 'roe', operator: '>', value: 0.1, api_unit: 'ratio' }],
          scope: { market: 'HOSE', sector: '', period: 'quarter' },
        }),
        NOW,
      )
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'PERIOD_REVIEW_REQUIRED',
      details: [
        { rule_id: 'r1', metric_id: 'roe', legacy_period: 'quarter', status: 'needs_review' },
      ],
    });
    expect(fake.statementCalls).toEqual([]);
    expect(store.rows).toEqual([]);
  });

  it('bounds the universe and flags truncation', async () => {
    const many = Array.from({ length: SCREENER_MAX_UNIVERSE + 20 }, (_, i) => ({
      symbol: `S${String(i).padStart(4, '0')}`,
      name: `Mã ${i}`,
      exchange: 'HOSE',
      sector: 'Khác',
    }));
    const { service: svc } = service(many, fakeVci({ revenue: {} }).vci, []);
    const result = await svc.run(USER, definition({ rules: [] }), NOW);
    expect(result.results).toHaveLength(SCREENER_MAX_UNIVERSE);
    expect(result.universe_truncated).toBe(true);
  });
});

describe('ScreenerService.getResult (stored result pages)', () => {
  it('serves every page of one run with the same as_of, and only to its owner', async () => {
    const fake = fakeVci({
      revenue: { AAA: [1200, 1000], BBB: [1200, 1000], DDD: [1200, 1000], EEE: [900, 1000] },
    });
    const { service: svc } = service(UNIVERSE, fake.vci, ['metric:revenue_yoy']);
    const run = await svc.run(USER, definition(), NOW);
    expect(run.counts.passed).toBe(3);

    const first = await svc.getResult(USER, run.result_id, {
      offset: 0,
      limit: 2,
      passed_only: false,
    });
    const second = await svc.getResult(USER, run.result_id, {
      offset: 2,
      limit: 2,
      passed_only: false,
    });
    expect(first.as_of).toBe(second.as_of);
    expect(first.as_of).toBe(NOW.toISOString());
    expect(first.total).toBe(4);
    expect([...first.results, ...second.results]).toEqual(run.results);

    const onlyPassed = await svc.getResult(USER, run.result_id, {
      offset: 0,
      limit: 100,
      passed_only: true,
    });
    expect(onlyPassed.total).toBe(3);
    expect(onlyPassed.results.every((row) => row.passed)).toBe(true);
    // The header (definition, counts, quality) is identical on every page.
    expect(onlyPassed.definition).toEqual(first.definition);
    expect(onlyPassed.counts).toEqual(first.counts);

    const foreign = await svc
      .getResult(OTHER_USER, run.result_id, { offset: 0, limit: 10, passed_only: false })
      .catch((caught: unknown) => caught);
    expect(foreign).toBeInstanceOf(NotFoundException);
    expect((foreign as NotFoundException).getResponse()).toMatchObject({
      code: 'SCREENER_RESULT_NOT_FOUND',
    });
  });
});

describe('summarizeRows', () => {
  it('separates "did not pass" from exceptions and counts reasons per cell', () => {
    const cell = (status: string, reason_code?: string) => ({
      metric_id: 'roe',
      period_mode: 'ttm',
      status,
      value: status === 'ok' ? 0.2 : null,
      unit: 'ratio',
      actual_period_label: null,
      comparison_period_label: null,
      published_at: null,
      available_at: null,
      source_revision: null,
      components: [],
      ...(reason_code ? { reason_code } : {}),
    });
    const rows = [
      { symbol: 'A', passed: true, metrics: { roe: cell('ok') } },
      { symbol: 'B', passed: false, metrics: { roe: cell('ok') } },
      { symbol: 'C', passed: false, metrics: { roe: cell('missing', 'no_report') } },
      { symbol: 'D', passed: false, metrics: { roe: cell('not_applicable', 'financial_sector') } },
    ] as unknown as Parameters<typeof summarizeRows>[0];
    const summary = summarizeRows(
      rows,
      [{ id: 'r', metric_id: 'roe', period: 'ttm', operator: '>', value: 0.1, api_unit: 'ratio' }],
      [],
    );
    expect(summary.counts).toEqual({
      universe: 4,
      passed: 1,
      failed_threshold: 1,
      with_required_exceptions: 2,
      missing: 1,
    });
    expect(summary.data_quality.metrics[0]).toMatchObject({
      by_status: { ok: 2, missing: 1, not_applicable: 1 },
      by_reason: { no_report: 1, financial_sector: 1 },
    });
  });
});

describe('ScreenerController wiring', () => {
  it('is Premium with the feature guard running before auth and premium guards', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ScreenerController)).toEqual([
      ScreenerEnabledGuard,
      ApiAuthGuard,
      PremiumGuard,
    ]);
    expect(Reflect.getMetadata(AUTH_PREMIUM_KEY, ScreenerController)).toBe(true);
  });

  it('returns 404 FEATURE_DISABLED when STRATEGY_V2_ENABLED=false', () => {
    const guard = (enabled: boolean) =>
      new ScreenerEnabledGuard({
        get: (key: keyof Environment) => (key === 'STRATEGY_V2_ENABLED' ? enabled : undefined),
      } as unknown as ConfigService<Environment, true>);
    expect(guard(true).canActivate()).toBe(true);
    let error: unknown;
    try {
      guard(false).canActivate();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'FEATURE_DISABLED' });
  });
});
