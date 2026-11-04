import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { ApiAuthGuard, PremiumGuard } from '../../src/modules/auth/index.js';
import { AUTH_PREMIUM_KEY } from '../../src/modules/auth/auth.decorators.js';
import type { VciMarketProvider } from '../../src/modules/market-data/index.js';
import { ScreenerEnabledGuard } from '../../src/modules/screener/screener-enabled.guard.js';
import { ScreenerController } from '../../src/modules/screener/screener.controller.js';
import type { UniverseRecord } from '../../src/modules/screener/screener.market.js';
import {
  legacyScreenerDefinitionSchema,
  screenerDefinitionSchema,
  screenerRunInputSchema,
  SCREENER_FETCH_CONCURRENCY,
  screenerV3DefinitionSchema,
  type ScreenerDefinition,
} from '../../src/modules/screener/screener.schemas.js';
import {
  mapWithConcurrency,
  rulePasses,
  ScreenerService,
  summarizeRows,
} from '../../src/modules/screener/screener.service.js';
import type { Environment } from '../../src/platform/config/environment.js';
import {
  fakeVci,
  FakeMarketData,
  grants,
  InMemoryRunStore,
  record,
} from './helpers/screener-fixtures.js';

type Row = Record<string, unknown>;

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER_USER = '00000000-0000-4000-8000-000000000002';
const NOW = new Date('2025-06-01T03:00:00Z');
const SESSION = '2025-05-30';

const UNIVERSE: UniverseRecord[] = [
  record('AAA', { name: 'Công ty A', exchange: 'HOSE', sector: 'Hóa chất' }),
  record('BBB', { name: 'Công ty B', exchange: 'HOSE', sector: 'Xây dựng' }),
  record('CCC', { name: 'Công ty C', exchange: 'HNX', sector: 'Hóa chất' }),
  record('DDD', { name: 'Công ty D', exchange: 'HOSE', sector: 'Hóa chất' }),
  record('EEE', { name: 'Công ty E', exchange: 'HOSE', sector: 'Hóa chất' }),
];

const marketBlock = (patch: Row = {}) => ({
  exchanges: [],
  baskets: [],
  statement_groups: [],
  market_cap: { min: null, max: null },
  avg_value: { sessions: 20, min: null },
  close_price: { min: null, max: null },
  ...patch,
});

function definition(overrides: Partial<ScreenerDefinition> = {}): ScreenerDefinition {
  return screenerDefinitionSchema.parse({
    schema_version: '4.0',
    name: 'Tăng trưởng',
    logic: 'AND',
    market: marketBlock({ exchanges: ['HOSE'] }),
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
    technical: [],
    ...overrides,
  });
}

function service(
  universe: UniverseRecord[],
  vci: VciMarketProvider,
  capabilities: string[],
  store = new InMemoryRunStore(),
  session: string | null = SESSION,
) {
  const market = new FakeMarketData(universe, new Map(), session);
  return {
    store,
    market,
    service: new ScreenerService(vci, grants(capabilities), store, market),
  };
}

describe('screenerDefinitionSchema (filter definition 4.0: Thị trường + a period per rule + Kỹ thuật)', () => {
  const base = {
    schema_version: '4.0',
    name: 'x',
    logic: 'AND',
    market: marketBlock(),
    technical: [],
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
    // `technical` may be left out: the definition then has no technical condition.
    const { technical: _technical, ...withoutTechnical } = base;
    expect(screenerDefinitionSchema.parse({ ...withoutTechnical, rules: [] }).technical).toEqual([]);
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
        market: marketBlock({ exchanges: ['NYSE'] }),
      }).success,
    ).toBe(false);
  });

  it('has no scope / sector / filter-wide period and accepts no client-supplied cutoff', () => {
    for (const extra of [
      { scope: { market: 'ALL', sector: '' } },
      { scope: { market: 'ALL', sector: '', period: 'ttm' } },
    ])
      expect(screenerDefinitionSchema.safeParse({ ...base, rules: [], ...extra }).success).toBe(
        false,
      );
    for (const key of ['as_of', 'date', 'cutoff', 'session_date'])
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

  it('still accepts the 3.0 and 2.0 shapes through the run input union (mapped by the service)', () => {
    const v3 = {
      schema_version: '3.0',
      name: 'cũ 3.0',
      logic: 'AND',
      rules: [rule],
      scope: { market: 'HOSE', sector: '' },
    };
    expect(screenerV3DefinitionSchema.safeParse(v3).success).toBe(true);
    expect(screenerRunInputSchema.safeParse(v3).success).toBe(true);
    expect(screenerDefinitionSchema.safeParse(v3).success).toBe(false);
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

  it('checks Thị trường with the messages of spec §2.4 (prefix "Cơ bản · Thị trường: ")', () => {
    const messages = (market: Row) => {
      const parsed = screenerDefinitionSchema.safeParse({ ...base, rules: [], market });
      return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
    };
    expect(messages(marketBlock({ market_cap: { min: -1, max: null } }))).toEqual([
      'Cơ bản · Thị trường: Vốn hóa không được âm.',
    ]);
    expect(messages(marketBlock({ close_price: { min: 20, max: 10 } }))).toEqual([
      'Cơ bản · Thị trường: Giá: "từ" phải nhỏ hơn hoặc bằng "đến".',
    ]);
    expect(messages(marketBlock({ avg_value: { sessions: 4, min: null } }))).toEqual([
      'Cơ bản · Thị trường: Số phiên phải từ 5 đến 100, số nguyên.',
    ]);
    expect(messages(marketBlock({ avg_value: { sessions: 20.5, min: null } }))).toHaveLength(1);
    expect(messages(marketBlock({ avg_value: { sessions: 20, min: -3 } }))).toEqual([
      'Cơ bản · Thị trường: Giá trị giao dịch phải là số không âm.',
    ]);
    expect(messages(marketBlock({ avg_value: { sessions: 100, min: 0 } }))).toEqual([]);
  });

  it('checks Kỹ thuật with the Bot messages (no "Mua · " prefix) and Khối lượng bounds', () => {
    const messages = (technical: unknown[]) => {
      const parsed = screenerDefinitionSchema.safeParse({ ...base, rules: [], technical });
      return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
    };
    expect(
      messages([
        {
          indicator: 'rsi',
          rules: [
            { id: 'rsi.level', enabled: true, period: 1, op: '<', threshold: 30 },
            { id: 'rsi.trend', enabled: true, period: 14, dir: 'up' },
          ],
        },
      ]),
    ).toEqual(['RSI · Dòng 1: Chu kỳ RSI phải từ 2 đến 200, số nguyên.']);
    expect(
      messages([{ indicator: 'volume', sessions: 4, factor: 1.1, ops: ['>', '>'] }]),
    ).toEqual(['Khối lượng · Số phiên tham chiếu phải từ 5 đến 100, số nguyên.']);
    expect(
      messages([{ indicator: 'volume', sessions: 20, factor: 3.5, ops: ['>', '>'] }]),
    ).toEqual(['Khối lượng · Hệ số khối lượng phải từ 0,5 đến 3.']);
    expect(
      messages([{ indicator: 'volume', sessions: 20, factor: 1.15, ops: ['>', '>'] }]),
    ).toEqual(['Khối lượng · Hệ số khối lượng phải theo bước 0,1.']);
    expect(
      messages([{ indicator: 'volume', sessions: 20, factor: 1.1, ops: ['>', '>'] }]),
    ).toEqual([]);
    expect(messages([{ indicator: 'volume', sessions: 20, factor: 1.1, ops: ['>', '='] }])).toEqual([
      'Khối lượng · Dấu so sánh của hai dòng chỉ chọn > hoặc <.',
    ]);
    // Each indicator at most once.
    expect(
      messages([
        { indicator: 'volume', sessions: 20, factor: 1.1, ops: ['>', '>'] },
        { indicator: 'volume', sessions: 20, factor: 1.1, ops: ['>', '>'] },
      ]),
    ).toEqual(['Khối lượng: mỗi chỉ báo chỉ được thêm một lần.']);
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
  it('Học viện v4: lists all 42 registry metrics whatever the grants (no lesson filter)', async () => {
    const lessonless = ['fcf_yoy', 'accrual', 'dividend_yield', 'buyback_yield'];
    const { service: svc } = service(
      UNIVERSE,
      fakeVci({ revenue: {} }).vci,
      lessonless.map((id) => `metric:${id}`),
    );
    const metrics = await svc.metrics(USER);
    expect(metrics).toHaveLength(42);
    expect(metrics.map((m) => m.id)).toEqual(
      expect.arrayContaining([...lessonless, 'payout_ratio']),
    );
    expect(metrics.find((m) => m.id === 'fcf_yoy')).toMatchObject({
      learned: true,
      lesson_id: null,
    });
    expect(metrics.find((m) => m.id === 'payout_ratio')).toMatchObject({
      learned: false,
      lesson_id: null,
    });
    // The lesson that teaches a metric is its v4 lesson (chapters 8-9), for the "Học" link.
    expect(metrics.find((m) => m.id === 'roe')?.lesson_id).toBe('ch08-l11');
    expect(metrics.find((m) => m.id === 'pe')?.lesson_id).toBe('ch08-l14');
    expect(metrics.find((m) => m.id === 'debt_equity')?.lesson_id).toBe('ch09-l06');
  });

  it('lists the registry metrics with learned flags, readiness and the period policy', async () => {
    const { service: svc } = service(UNIVERSE, fakeVci({ revenue: {} }).vci, [
      'metric:roe',
      'lesson:ch03-l01',
      'metric:dividend_yield', // legacy grant keeps this lesson-less metric visible
    ]);
    const metrics = await svc.metrics(USER);
    expect(metrics).toHaveLength(42);
    expect(metrics.find((m) => m.id === 'fcf_yoy')).toMatchObject({ learned: false });
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
    expect(metrics.find((m) => m.id === 'roic')?.readiness).toBe('ready');
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

  it('Kỹ thuật and Thị trường need no capability (spec §8)', async () => {
    const { service: svc } = service(UNIVERSE, fakeVci({ revenue: {} }).vci, []);
    const result = await svc.run(
      USER,
      definition({
        rules: [],
        market: marketBlock({ exchanges: ['HOSE'], statement_groups: ['thuong'] }) as never,
        technical: [{ indicator: 'volume', sessions: 20, factor: 1.1, ops: ['>', '>'] }],
      }),
      NOW,
    );
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('filters with strict AND logic, per-rule periods and one documented status per cell', async () => {
    const fake = fakeVci({
      revenue: { AAA: [1200, 1000], BBB: [1150, 1000], DDD: [900, 0] },
      failing: ['EEE'],
    });
    const { service: svc, market, store } = service(UNIVERSE, fake.vci, [
      'metric:revenue_yoy',
      'metric:gross_margin',
    ]);
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
    expect(market.universeCalls).toBe(1);
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
      schema_version: '4.0',
      data_mode: 'latest_disclosed',
      as_of: NOW.toISOString(),
      session_date: SESSION,
      data_source: 'VCI',
      price_source: 'DNSE',
      // Bộ lọc 4.0 §7: the fundamental and the market+technical engine versions.
      calculation_version: 'iqx-fund-2.0+tech-1.0',
      universe_truncated: false,
      fundamental_candidates: 4,
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
    expect(store.rows[0]!.header.session_date).toBe(SESSION);
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

  it('with no condition and no column every company in scope passes, with no provider call', async () => {
    const fake = fakeVci({ revenue: {} });
    const { service: svc } = service(UNIVERSE, fake.vci, []);
    const result = await svc.run(
      USER,
      definition({ rules: [], market: marketBlock({ exchanges: ['HOSE', 'HNX'] }) as never }),
      NOW,
    );
    // Spec §11.2.13: behaves as before: the whole scope passes.
    expect(result.results.map((r) => [r.symbol, r.passed])).toEqual([
      ['AAA', true],
      ['BBB', true],
      ['CCC', true],
      ['DDD', true],
      ['EEE', true],
    ]);
    expect(result.counts).toMatchObject({ universe: 5, passed: 5, missing: 0 });
    expect(result.data_quality.metrics).toEqual([]);
    expect(result.fundamental_candidates).toBeNull();
    expect(result.universe_truncated).toBe(false);
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
      'metric:payout_ratio',
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
          columns: [{ metric_id: 'payout_ratio', period: 'ttm' }],
        }),
        NOW,
      )
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'METRIC_NOT_READY',
      details: [
        { metric_id: 'dividend_yield', readiness: 'data_unavailable' },
        { metric_id: 'payout_ratio', readiness: 'data_unavailable' },
      ],
    });
    expect(fake.statementCalls).toEqual([]);
  });

  it('maps a legacy 2.0 definition onto every rule, then to 4.0, and runs it', async () => {
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
    expect(result.definition.schema_version).toBe('4.0');
    expect(result.definition.market.exchanges).toEqual(['HOSE']);
    expect(result.definition.technical).toEqual([]);
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

  it('runs a stored 3.0 definition: scope.market becomes the exchange list, sector "all" stays open', async () => {
    const fake = fakeVci({ revenue: { AAA: [1200, 1000], CCC: [1200, 1000] } });
    const { service: svc } = service(UNIVERSE, fake.vci, ['metric:revenue_yoy']);
    const v3 = (market: string) =>
      screenerV3DefinitionSchema.parse({
        schema_version: '3.0',
        name: 'cũ 3.0',
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
        scope: { market, sector: 'all' },
      });
    const hnx = await svc.run(USER, v3('HNX'), NOW);
    expect(hnx.results.map((row) => row.symbol)).toEqual(['CCC']);
    expect(hnx.definition.market).toMatchObject({ exchanges: ['HNX'], statement_groups: [] });
    const all = await svc.run(USER, v3('ALL'), NOW);
    expect(all.results.map((row) => row.symbol)).toEqual(['AAA', 'BBB', 'CCC', 'DDD', 'EEE']);
    expect(all.definition.market.exchanges).toEqual([]);
  });

  it('422 SECTOR_REVIEW_REQUIRED for a 3.0 filter that still has an ICB sector; nothing runs or is stored', async () => {
    const fake = fakeVci({ revenue: {} });
    const { service: svc, store, market } = service(UNIVERSE, fake.vci, ['metric:revenue_yoy']);
    const v3 = screenerV3DefinitionSchema.parse({
      schema_version: '3.0',
      name: 'cũ 3.0',
      logic: 'AND',
      rules: [],
      scope: { market: 'HOSE', sector: 'Ngân hàng' },
    });
    const error = await svc.run(USER, v3, NOW).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'SECTOR_REVIEW_REQUIRED',
      message: 'Chọn lại ngành: ngành ICB “Ngân hàng” của bộ lọc cũ không còn được hỗ trợ.',
    });
    expect(store.rows).toEqual([]);
    expect(market.universeCalls).toBe(0);
    // The flag also blocks a 4.0 definition that still carries it.
    const flagged = definition({
      rules: [],
      market: marketBlock({ needs_review: 'sector', legacy_sector: 'Bảo hiểm' }) as never,
    });
    await expect(svc.run(USER, flagged, NOW)).rejects.toMatchObject({
      response: { code: 'SECTOR_REVIEW_REQUIRED' },
    });
  });

  it('422 DEFINITION_INVALID when a definition bypassing the schema breaks a Thị trường or Kỹ thuật rule', async () => {
    const { service: svc } = service(UNIVERSE, fakeVci({ revenue: {} }).vci, []);
    const broken = {
      ...definition({ rules: [] }),
      market: marketBlock({ market_cap: { min: 10, max: 5 } }),
      technical: [{ indicator: 'volume', sessions: 3, factor: 1.1, ops: ['>', '>'] }],
    } as unknown as ScreenerDefinition;
    const error = await svc.run(USER, broken, NOW).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const response = (error as UnprocessableEntityException).getResponse() as {
      code: string;
      message: string;
    };
    expect(response.code).toBe('DEFINITION_INVALID');
    expect(response.message).toContain('Cơ bản · Thị trường: Vốn hóa: "từ" phải nhỏ hơn hoặc bằng "đến".');
    expect(response.message).toContain('Khối lượng · Số phiên tham chiếu phải từ 5 đến 100, số nguyên.');
  });
});

describe('ScreenerService.getResult (stored result pages)', () => {
  const query = (patch: Row = {}) => ({
    offset: 0,
    limit: 100,
    passed_only: false,
    order: 'asc' as const,
    ...patch,
  });

  it('serves every page of one run with the same as_of, and only to its owner', async () => {
    const fake = fakeVci({
      revenue: { AAA: [1200, 1000], BBB: [1200, 1000], DDD: [1200, 1000], EEE: [900, 1000] },
    });
    const { service: svc } = service(UNIVERSE, fake.vci, ['metric:revenue_yoy']);
    const run = await svc.run(USER, definition(), NOW);
    expect(run.counts.passed).toBe(3);

    const first = await svc.getResult(USER, run.result_id, query({ limit: 2 }));
    const second = await svc.getResult(USER, run.result_id, query({ offset: 2, limit: 2 }));
    expect(first.as_of).toBe(second.as_of);
    expect(first.as_of).toBe(NOW.toISOString());
    expect(first.session_date).toBe(SESSION);
    expect(first.total).toBe(4);
    expect([...first.results, ...second.results]).toEqual(run.results);

    const onlyPassed = await svc.getResult(USER, run.result_id, query({ passed_only: true }));
    expect(onlyPassed.total).toBe(3);
    expect(onlyPassed.results.every((row) => row.passed)).toBe(true);
    // The header (definition, counts, quality) is identical on every page.
    expect(onlyPassed.definition).toEqual(first.definition);
    expect(onlyPassed.counts).toEqual(first.counts);

    const foreign = await svc
      .getResult(OTHER_USER, run.result_id, query({ limit: 10 }))
      .catch((caught: unknown) => caught);
    expect(foreign).toBeInstanceOf(NotFoundException);
    expect((foreign as NotFoundException).getResponse()).toMatchObject({
      code: 'SCREENER_RESULT_NOT_FOUND',
    });
  });

  it('sorts the WHOLE result before paging (spec §4.3): default Mã A→Z, number columns by value, blanks last', async () => {
    const fake = fakeVci({
      revenue: { AAA: [1300, 1000], BBB: [1200, 1000], DDD: [1500, 1000], EEE: [900, 1000] },
    });
    const { service: svc } = service(UNIVERSE, fake.vci, ['metric:revenue_yoy']);
    const run = await svc.run(USER, definition(), NOW);
    const symbols = async (patch: Row) =>
      (await svc.getResult(USER, run.result_id, query(patch))).results.map((row) => row.symbol);
    expect(await symbols({})).toEqual(['AAA', 'BBB', 'DDD', 'EEE']);
    expect(await symbols({ sort: 'symbol', order: 'desc' })).toEqual(['EEE', 'DDD', 'BBB', 'AAA']);
    // A fundamental cell by its value; the page is cut AFTER ordering, so page 1 holds the top rows.
    expect(await symbols({ sort: 'metric:revenue_yoy', order: 'desc' })).toEqual([
      'DDD',
      'AAA',
      'BBB',
      'EEE',
    ]);
    expect(await symbols({ sort: 'metric:revenue_yoy', order: 'desc', limit: 2 })).toEqual([
      'DDD',
      'AAA',
    ]);
    expect(await symbols({ sort: 'metric:revenue_yoy', order: 'desc', offset: 2, limit: 2 })).toEqual([
      'BBB',
      'EEE',
    ]);
    // Ascending: the same order reversed; no blank here (every cell is ok).
    expect(await symbols({ sort: 'metric:revenue_yoy', order: 'asc' })).toEqual([
      'EEE',
      'BBB',
      'AAA',
      'DDD',
    ]);
    // Sorting never changes what a page of another sort returns, nor the stored result.
    expect(await symbols({ sort: 'name', order: 'asc' })).toEqual(['AAA', 'BBB', 'DDD', 'EEE']);
    expect(await symbols({ passed_only: true, sort: 'metric:revenue_yoy', order: 'desc' })).toEqual([
      'DDD',
      'AAA',
      'BBB',
    ]);
  });

  it('rejects an unknown sort key at the schema, not in the service', async () => {
    const { screenerResultQuerySchema } = await import(
      '../../src/modules/screener/screener.schemas.js'
    );
    expect(screenerResultQuerySchema.safeParse({ sort: 'price' }).success).toBe(true);
    expect(screenerResultQuerySchema.safeParse({ sort: 'tech:rsi.level', order: 'desc' }).success).toBe(true);
    expect(screenerResultQuerySchema.safeParse({ sort: 'metric:roe' }).success).toBe(true);
    expect(screenerResultQuerySchema.safeParse({ sort: 'DROP TABLE' }).success).toBe(false);
    expect(screenerResultQuerySchema.safeParse({ order: 'up' }).success).toBe(false);
    expect(screenerResultQuerySchema.parse({}).order).toBe('asc');
  });
});

describe('summarizeRows', () => {
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
  const rule = {
    id: 'r',
    metric_id: 'roe' as const,
    period: 'ttm' as const,
    operator: '>' as const,
    value: 0.1,
    api_unit: 'ratio' as const,
  };

  it('separates "did not pass" from exceptions and counts reasons per cell', () => {
    const rows = [
      { symbol: 'A', passed: true, technical: {}, metrics: { roe: cell('ok') } },
      { symbol: 'B', passed: false, technical: {}, metrics: { roe: cell('ok') } },
      { symbol: 'C', passed: false, technical: {}, metrics: { roe: cell('missing', 'no_report') } },
      {
        symbol: 'D',
        passed: false,
        technical: {},
        metrics: { roe: cell('not_applicable', 'financial_sector') },
      },
    ] as unknown as Parameters<typeof summarizeRows>[0];
    const summary = summarizeRows(rows, [rule], []);
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
    expect(summary.data_quality.technical).toEqual([]);
  });

  it('counts a NO_SIGNAL technical row as "có điều kiện không tính được", and a company that failed Kỹ thuật (no fundamentals read) as a plain fail', () => {
    const tech = (status: 'ok' | 'missing', result: boolean | null, reason_code?: string) => ({
      key: 'ma.price_cross',
      indicator: 'ma',
      row_id: 'ma.price_cross',
      label: 'Giá / SMA200',
      status,
      result,
      ...(reason_code ? { reason_code } : {}),
    });
    const rows = [
      { symbol: 'A', passed: true, technical: { 'ma.price_cross': tech('ok', true) }, metrics: { roe: cell('ok') } },
      // Kỹ thuật false: fundamentals never read -> failed_threshold, not an exception.
      { symbol: 'B', passed: false, technical: { 'ma.price_cross': tech('ok', false) }, metrics: {} },
      // NO_SIGNAL (short history): an exception, also counted as missing.
      {
        symbol: 'C',
        passed: false,
        technical: { 'ma.price_cross': tech('missing', null, 'insufficient_price_history') },
        metrics: {},
      },
    ] as unknown as Parameters<typeof summarizeRows>[0];
    const summary = summarizeRows(
      rows,
      [rule],
      [],
      [{ key: 'ma.price_cross', indicator: 'ma', row_id: 'ma.price_cross', label: 'Giá / SMA200' }],
    );
    expect(summary.counts).toEqual({
      universe: 3,
      passed: 1,
      failed_threshold: 1,
      with_required_exceptions: 1,
      missing: 1,
    });
    expect(summary.data_quality.technical).toEqual([
      {
        key: 'ma.price_cross',
        indicator: 'ma',
        row_id: 'ma.price_cross',
        label: 'Giá / SMA200',
        by_status: { ok: 2, missing: 1 },
        by_reason: { insufficient_price_history: 1 },
      },
    ]);
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
