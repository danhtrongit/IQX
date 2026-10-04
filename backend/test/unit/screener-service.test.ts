import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type { AcademyGrantsPort } from '../../src/modules/academy/academy.ports.js';
import { ApiAuthGuard, PremiumGuard } from '../../src/modules/auth/index.js';
import { AUTH_PREMIUM_KEY } from '../../src/modules/auth/auth.decorators.js';
import type { VciMarketProvider } from '../../src/modules/market-data/index.js';
import { ScreenerEnabledGuard } from '../../src/modules/screener/screener-enabled.guard.js';
import { ScreenerController } from '../../src/modules/screener/screener.controller.js';
import {
  screenerDefinitionSchema,
  SCREENER_FETCH_CONCURRENCY,
  SCREENER_MAX_UNIVERSE,
  type ScreenerDefinition,
} from '../../src/modules/screener/screener.schemas.js';
import {
  mapWithConcurrency,
  rulePasses,
  ScreenerService,
} from '../../src/modules/screener/screener.service.js';
import type { Environment } from '../../src/platform/config/environment.js';
import type { DatabaseService } from '../../src/platform/database/index.js';

type Row = Record<string, unknown>;

const USER = '00000000-0000-4000-8000-000000000001';

function grants(capabilities: string[]): AcademyGrantsPort {
  return { grantedCapabilities: async () => new Set(capabilities) };
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

/** Eight discrete quarters + four fiscal years; revenue grows `growth` YoY. */
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
    schema_version: '2.0',
    name: 'Tăng trưởng',
    logic: 'AND',
    rules: [{ id: 'r1', metric_id: 'revenue_yoy', operator: '>', value: 0.15, api_unit: 'ratio' }],
    scope: { market: 'HOSE', sector: '', period: 'TTM' },
    ...overrides,
  });
}

const NOW = new Date('2025-06-01T03:00:00Z');

describe('screenerDefinitionSchema (filter.schema.json 2.0)', () => {
  it('accepts a valid definition and scope-only filters', () => {
    expect(definition().rules).toHaveLength(1);
    expect(definition({ rules: [] }).rules).toEqual([]);
  });

  it('rejects api_unit not matching the registry, unknown metrics, extra keys and bad logic', () => {
    const base = {
      schema_version: '2.0',
      name: 'x',
      logic: 'AND',
      scope: { market: 'ALL', sector: '', period: 'TTM' },
    };
    const rule = { id: 'r', metric_id: 'roe', operator: '>', value: 0.1, api_unit: 'ratio' };
    expect(screenerDefinitionSchema.safeParse({ ...base, rules: [rule] }).success).toBe(true);
    expect(
      screenerDefinitionSchema.safeParse({ ...base, rules: [{ ...rule, api_unit: 'lần' }] })
        .success,
    ).toBe(false);
    expect(
      screenerDefinitionSchema.safeParse({ ...base, rules: [{ ...rule, metric_id: 'rsi' }] })
        .success,
    ).toBe(false);
    expect(
      screenerDefinitionSchema.safeParse({ ...base, rules: [{ ...rule, operator: '>=' }] }).success,
    ).toBe(false);
    expect(
      screenerDefinitionSchema.safeParse({ ...base, rules: [{ ...rule, extra: 1 }] }).success,
    ).toBe(false);
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
        scope: { ...base.scope, period: 'monthly' },
      }).success,
    ).toBe(false);
    expect(
      screenerDefinitionSchema.safeParse({
        ...base,
        rules: [],
        scope: { ...base.scope, market: 'NYSE' },
      }).success,
    ).toBe(false);
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
  it('lists the 42 registry metrics with learned and supported flags', async () => {
    const { database } = fakeDatabase(UNIVERSE);
    const { vci } = fakeVci({ revenue: {} });
    const service = new ScreenerService(database, vci, grants(['metric:roe', 'lesson:ch03-l01']));
    const metrics = await service.metrics(USER);
    expect(metrics).toHaveLength(42);
    expect(metrics.find((m) => m.id === 'roe')).toMatchObject({
      learned: true,
      supported: true,
      unsupported_reason: null,
      api_unit: 'ratio',
    });
    expect(metrics.find((m) => m.id === 'pe')).toMatchObject({ learned: false, supported: true });
    const dividend = metrics.find((m) => m.id === 'dividend_yield')!;
    expect(dividend.supported).toBe(false);
    expect(dividend.unsupported_reason).toBeTruthy();
  });
});

describe('ScreenerService.run', () => {
  it('403 CAPABILITY_LOCKED when a rule uses an unlearned metric', async () => {
    const { database } = fakeDatabase(UNIVERSE);
    const { vci, statementCalls } = fakeVci({ revenue: {} });
    const service = new ScreenerService(database, vci, grants(['metric:roe']));
    const error = await service.run(USER, definition(), NOW).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: 'CAPABILITY_LOCKED',
      capability: 'metric:revenue_yoy',
      reason: 'not_learned',
    });
    expect(statementCalls).toEqual([]);
  });

  it('filters the scope with strict AND logic and reports per-metric status', async () => {
    const { database, calls } = fakeDatabase(UNIVERSE);
    const fake = fakeVci({
      revenue: { AAA: [1200, 1000], BBB: [1150, 1000], DDD: [900, 0] },
      failing: ['EEE'],
    });
    const service = new ScreenerService(
      database,
      fake.vci,
      grants(['metric:revenue_yoy', 'metric:gross_margin']),
    );
    const result = await service.run(
      USER,
      definition({
        rules: [
          { id: 'r1', metric_id: 'revenue_yoy', operator: '>', value: 0.15, api_unit: 'ratio' },
          { id: 'r2', metric_id: 'gross_margin', operator: '>', value: 0.2, api_unit: 'ratio' },
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
      period: 'TTM Q4/2024',
    });
    expect(bySymbol.AAA!.metrics.revenue_yoy!.value).toBeCloseTo(0.2, 12);
    expect(bySymbol.AAA!.metrics.revenue_yoy!.available_at).toBe('2024-12-28T00:00:00+07:00');
    // 15% YoY is not strictly greater than 0.15.
    expect(bySymbol.BBB!.metrics.revenue_yoy!.value).toBeCloseTo(0.15, 12);
    expect(bySymbol.BBB!.passed).toBe(false);
    expect(bySymbol.DDD!.metrics.revenue_yoy).toMatchObject({
      status: 'insufficient_base',
      value: null,
    });
    expect(bySymbol.DDD!.passed).toBe(false);
    expect(bySymbol.EEE!.metrics.revenue_yoy).toMatchObject({ status: 'missing', value: null });
    expect(bySymbol.EEE!.metrics.revenue_yoy!.reason).toBeTruthy();
    expect(bySymbol.EEE!.passed).toBe(false);
    expect(result.counts).toEqual({ universe: 4, passed: 1, missing: 1 });
    expect(result).toMatchObject({
      period: 'TTM',
      calculation_version: 'iqx-fund-2.0',
      universe_truncated: false,
    });
    expect(fake.maxInFlight()).toBeLessThanOrEqual(SCREENER_FETCH_CONCURRENCY * 3);
  });

  it('applies the sector scope and treats empty rules as a scope-only filter without provider calls', async () => {
    const { database, calls } = fakeDatabase(UNIVERSE);
    const fake = fakeVci({ revenue: {} });
    const service = new ScreenerService(database, fake.vci, grants([]));
    const result = await service.run(
      USER,
      definition({ rules: [], scope: { market: 'all', sector: 'Hóa chất', period: 'annual' } }),
      NOW,
    );
    expect(calls[0]).toEqual(['ALL', 'Hóa chất', SCREENER_MAX_UNIVERSE + 1]);
    expect(result.results.map((r) => [r.symbol, r.passed])).toEqual([
      ['AAA', true],
      ['CCC', true],
      ['DDD', true],
      ['EEE', true],
    ]);
    expect(result.counts).toEqual({ universe: 4, passed: 4, missing: 0 });
    expect(fake.statementCalls).toEqual([]);
  });

  it('valuation uses the observed price and share basis; unsupported metrics stay missing', async () => {
    const { database } = fakeDatabase(UNIVERSE.slice(0, 2));
    const fake = fakeVci({
      revenue: { AAA: [1200, 1000], BBB: [1200, 1000] },
      prices: { AAA: 20 },
      shares: { AAA: 4, BBB: 4 },
    });
    const service = new ScreenerService(
      database,
      fake.vci,
      grants(['metric:pe', 'metric:dividend_yield']),
    );
    const result = await service.run(
      USER,
      definition({
        rules: [
          { id: 'r1', metric_id: 'pe', operator: '<', value: 15, api_unit: 'lần' },
          { id: 'r2', metric_id: 'dividend_yield', operator: '>', value: 0.01, api_unit: 'ratio' },
        ],
      }),
      NOW,
    );
    const [aaa, bbb] = result.results;
    // TTM parent profit 32 over 4 shares → EPS 8; P/E = 20 / 8.
    expect(aaa!.metrics.pe).toMatchObject({ status: 'ok', unit: 'lần' });
    expect(aaa!.metrics.pe!.value).toBeCloseTo(2.5, 12);
    expect(bbb!.metrics.pe).toMatchObject({ status: 'missing', value: null });
    expect(aaa!.metrics.dividend_yield).toMatchObject({ status: 'missing', value: null });
    expect(result.results.every((r) => !r.passed)).toBe(true);
    expect(result.counts.missing).toBe(2);
  });

  it('bounds the universe and flags truncation', async () => {
    const many = Array.from({ length: SCREENER_MAX_UNIVERSE + 20 }, (_, i) => ({
      symbol: `S${String(i).padStart(4, '0')}`,
      name: `Mã ${i}`,
      exchange: 'HOSE',
      sector: 'Khác',
    }));
    const { database } = fakeDatabase(many);
    const service = new ScreenerService(database, fakeVci({ revenue: {} }).vci, grants([]));
    const result = await service.run(USER, definition({ rules: [] }), NOW);
    expect(result.results).toHaveLength(SCREENER_MAX_UNIVERSE);
    expect(result.universe_truncated).toBe(true);
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
