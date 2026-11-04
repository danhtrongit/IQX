import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { DailyBarColumns } from '../../src/modules/market-integration/daily-bars.service.js';
import type { UniverseRecord } from '../../src/modules/screener/screener.market.js';
import {
  screenerDefinitionSchema,
  SCREENER_MAX_UNIVERSE,
  type ScreenerDefinition,
} from '../../src/modules/screener/screener.schemas.js';
import { ScreenerService } from '../../src/modules/screener/screener.service.js';
import {
  barsFromCloses,
  fakeVci,
  FakeMarketData,
  grants,
  InMemoryRunStore,
  record,
} from './helpers/screener-fixtures.js';

type Row = Record<string, unknown>;

const USER = '00000000-0000-4000-8000-000000000001';
const SESSION = '2025-05-30';
const NOW = new Date('2025-06-01T03:00:00Z');

const marketBlock = (patch: Row = {}) => ({
  exchanges: [],
  baskets: [],
  statement_groups: [],
  market_cap: { min: null, max: null },
  avg_value: { sessions: 20, min: null },
  close_price: { min: null, max: null },
  ...patch,
});

const RSI_LEVEL = {
  indicator: 'rsi',
  rules: [
    { id: 'rsi.level', enabled: true, period: 14, op: '<', threshold: 30 },
    { id: 'rsi.trend', enabled: false, period: 14, dir: 'up' },
  ],
};

function definition(overrides: Row = {}): ScreenerDefinition {
  return screenerDefinitionSchema.parse({
    schema_version: '4.0',
    name: 'Bộ lọc',
    logic: 'AND',
    market: marketBlock(),
    rules: [],
    technical: [],
    ...overrides,
  });
}

function setup(
  records: UniverseRecord[],
  bars: Record<string, DailyBarColumns> = {},
  options: {
    session?: string | null;
    baskets?: ConstructorParameters<typeof FakeMarketData>[3];
    revenue?: Record<string, [number, number]>;
    capabilities?: string[];
  } = {},
) {
  const market = new FakeMarketData(
    records,
    new Map(Object.entries(bars)),
    options.session === undefined ? SESSION : options.session,
    options.baskets ?? {},
  );
  const vci = fakeVci({ revenue: options.revenue ?? {} });
  const store = new InMemoryRunStore();
  const service = new ScreenerService(
    vci.vci,
    grants(options.capabilities ?? ['metric:revenue_yoy']),
    store,
    market,
  );
  return { service, market, vci, store };
}

const flat = (price: number, volume = 100_000, count = 40): DailyBarColumns =>
  barsFromCloses(SESSION, {
    closes: Array.from({ length: count }, () => price),
    volumes: Array.from({ length: count }, () => volume),
  });
const symbolsOf = (result: { results: Array<{ symbol: string }> }) =>
  result.results.map((row) => row.symbol);

describe('Thị trường (spec §2): OR inside a list, AND between lists', () => {
  const universe = [
    record('AAA', { exchange: 'HOSE', group: 'thuong' }),
    record('BBB', { exchange: 'HOSE', group: 'nh' }),
    record('CCC', { exchange: 'HNX', group: 'ck' }),
    record('DDD', { exchange: 'UPCOM', group: 'bh' }),
    record('EEE', { exchange: 'HOSE', group: 'thuong' }),
    record('FFF', { exchange: 'HOSE', group: null }),
  ];
  const bars = Object.fromEntries(universe.map((item) => [item.symbol, flat(20)]));
  const baskets = {
    VN30: ['AAA', 'CCC'],
    VN100: ['AAA', 'BBB', 'CCC', 'EEE'],
    HNX30: ['CCC'],
  };
  const run = (market: Row) =>
    setup(universe, bars, { baskets }).service.run(USER, definition({ market: marketBlock(market) }), NOW);

  it('11.2.12 HOSE + HNX is the UNION of the two exchanges', async () => {
    expect(symbolsOf(await run({ exchanges: ['HOSE', 'HNX'] }))).toEqual([
      'AAA',
      'BBB',
      'CCC',
      'EEE',
      'FFF',
    ]);
    expect(symbolsOf(await run({ exchanges: ['UPCOM'] }))).toEqual(['DDD']);
    // HSX is HOSE.
    expect(symbolsOf(await run({ exchanges: ['HSX'] }))).toEqual(['AAA', 'BBB', 'EEE', 'FFF']);
  });

  it('11.2.12 HOSE + VN30 is the INTERSECTION of the exchange and the basket', async () => {
    expect(symbolsOf(await run({ exchanges: ['HOSE'], baskets: ['VN30'] }))).toEqual(['AAA']);
    // Baskets are OR inside the list.
    expect(symbolsOf(await run({ baskets: ['VN30', 'HNX30'] }))).toEqual(['AAA', 'CCC']);
    expect(symbolsOf(await run({ baskets: ['VN100'] }))).toEqual(['AAA', 'BBB', 'CCC', 'EEE']);
    expect(symbolsOf(await run({ exchanges: ['HNX'], baskets: ['VN30'] }))).toEqual(['CCC']);
  });

  it('filters by statement group (Ngành) and combines it with the other lists', async () => {
    expect(symbolsOf(await run({ statement_groups: ['nh', 'ck'] }))).toEqual(['BBB', 'CCC']);
    expect(symbolsOf(await run({ exchanges: ['HOSE'], statement_groups: ['thuong'] }))).toEqual([
      'AAA',
      'EEE',
    ]);
    // A company whose group is not read yet cannot be decided: out of scope, counted (spec §2.2).
    const result = await run({ statement_groups: ['thuong'] });
    expect(symbolsOf(result)).toEqual(['AAA', 'EEE']);
    expect(result.data_quality.market.excluded_missing.statement_group).toBe(1);
  });

  it('no selection and no value means no filter; every row still carries its Giá, +/- %, Vốn hóa, GTGD columns', async () => {
    const result = await run({});
    expect(symbolsOf(result)).toEqual(['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF']);
    expect(result.results[0]).toMatchObject({
      exchange: 'HOSE',
      group: 'thuong',
      passed: true,
      // 20 nghìn đ × 100 triệu cp / 1e6 = 2.000 tỷ; GTGD = 20 × 100k / 1e6 = 2 tỷ.
      market: { price: 20, change_pct: 0, market_cap: 2000, avg_value: 2 },
    });
    expect(result.data_quality.market).toMatchObject({
      universe: 6,
      in_scope: 6,
      baskets_unavailable: [],
      without_session_bar: 0,
    });
  });

  it('a chosen basket with no stored constituents puts everything out of scope and says which basket', async () => {
    const { service } = setup(universe, bars, { baskets: { VN30: ['AAA'], VNSMALLCAP: null } });
    const result = await service.run(
      USER,
      definition({ market: marketBlock({ baskets: ['VNSMALLCAP'] }) }),
      NOW,
    );
    expect(result.results).toEqual([]);
    expect(result.data_quality.market.baskets_unavailable).toEqual(['VNSMALLCAP']);
    expect(result.data_quality.market.excluded_missing.basket).toBe(6);
    // One known and one unknown basket: the known one still decides.
    const partial = await service.run(
      USER,
      definition({ market: marketBlock({ baskets: ['VN30', 'VNSMALLCAP'] }) }),
      NOW,
    );
    expect(symbolsOf(partial)).toEqual(['AAA']);
    expect(partial.data_quality.market.baskets_unavailable).toEqual(['VNSMALLCAP']);
  });

  it('reads bars only for the symbols that passed Sàn / Rổ / Ngành, never one provider call per symbol', async () => {
    const { service, market } = setup(universe, bars, { baskets });
    await service.run(
      USER,
      definition({ market: marketBlock({ exchanges: ['HNX'] }), technical: [RSI_LEVEL] }),
      NOW,
    );
    expect(market.loadCalls).toEqual([['CCC']]);
  });
});

describe('Thị trường ranges: Vốn hóa, Giá đóng cửa, GTGD bình quân N phiên', () => {
  const universe = [
    record('AAA', { shares: 100_000_000 }),
    record('BBB', { shares: 50_000_000 }),
    record('CCC', { shares: 20_000_000 }),
    record('DDD', { shares: null }),
    record('EEE', { shares: 100_000_000 }),
    record('FFF', { shares: 100_000_000 }),
  ];
  const bars = {
    AAA: flat(25, 1_000_000),
    BBB: flat(10, 200_000),
    CCC: flat(100, 3_000_000),
    DDD: flat(30, 100_000),
    // Only three sessions of history.
    EEE: flat(40, 100_000, 3),
    // Last bar is the session before T: no bar at T (suspended).
    FFF: barsFromCloses('2025-05-29', { closes: [50, 50, 50, 50, 50, 50] }),
  };
  const run = (market: Row, technical: unknown[] = []) =>
    setup(universe, bars).service.run(
      USER,
      definition({ market: marketBlock(market), technical }),
      NOW,
    );

  it('Vốn hóa = Giá[T] × số cổ phiếu, in tỷ đồng; both ends are inclusive', async () => {
    const all = await run({});
    const cap = Object.fromEntries(all.results.map((row) => [row.symbol, row.market.market_cap]));
    // 25 nghìn × 100 triệu = 2.500 tỷ; 10 × 50 triệu = 500 tỷ; 100 × 20 triệu = 2.000 tỷ.
    expect(cap).toMatchObject({ AAA: 2500, BBB: 500, CCC: 2000, DDD: null, EEE: 4000, FFF: null });
    expect(symbolsOf(await run({ market_cap: { min: 2000, max: null } }))).toEqual(['AAA', 'CCC', 'EEE']);
    expect(symbolsOf(await run({ market_cap: { min: null, max: 2000 } }))).toEqual(['BBB', 'CCC']);
    expect(symbolsOf(await run({ market_cap: { min: 500, max: 2500 } }))).toEqual(['AAA', 'BBB', 'CCC']);
    expect(symbolsOf(await run({ market_cap: { min: 2500, max: 2500 } }))).toEqual(['AAA']);
  });

  it('a company without a share count or without a bar at T is out of scope for a range it cannot decide, and counted', async () => {
    const result = await run({ market_cap: { min: 0, max: null } });
    expect(symbolsOf(result)).toEqual(['AAA', 'BBB', 'CCC', 'EEE']);
    // DDD: no shares; FFF: no bar at T hence no price and no cap.
    expect(result.data_quality.market.excluded_missing).toMatchObject({ market_cap: 2 });
    const priced = await run({ close_price: { min: 0, max: null } });
    expect(symbolsOf(priced)).toEqual(['AAA', 'BBB', 'CCC', 'DDD', 'EEE']);
    expect(priced.data_quality.market.excluded_missing.close_price).toBe(1);
  });

  it('Giá đóng cửa is the close at T in nghìn đồng, inclusive', async () => {
    expect(symbolsOf(await run({ close_price: { min: 10, max: 30 } }))).toEqual(['AAA', 'BBB', 'DDD']);
    expect(symbolsOf(await run({ close_price: { min: 25, max: 25 } }))).toEqual(['AAA']);
    expect(symbolsOf(await run({ close_price: { min: null, max: 10 } }))).toEqual(['BBB']);
  });

  it('11.2.11 GTGD TB N: the mean of close × volume over the last N sessions, T included (3 symbols by hand)', async () => {
    // Last five sessions, thousand VND × shares: 1,0 + 2,2 + 3,6 + 5,2 + 7,0 = 19,0 triệu nghìn đ -> mean 3,8 tỷ.
    const hand: Record<string, DailyBarColumns> = {
      AAA: barsFromCloses(SESSION, {
        closes: [99, 99, 10, 11, 12, 13, 14],
        volumes: [9_999_999, 9_999_999, 100_000, 200_000, 300_000, 400_000, 500_000],
      }),
      // 20 × 1.000.000 for the last 5 sessions = 20 tỷ.
      BBB: barsFromCloses(SESSION, {
        closes: [1, 1, 20, 20, 20, 20, 20],
        volumes: [1, 1, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000],
      }),
      // Only the last session is large: (5 × 0 + 100.000 × 50) / 5 -> but volume 0 is allowed.
      CCC: barsFromCloses(SESSION, {
        closes: [7, 7, 7, 7, 7, 7, 50],
        volumes: [0, 0, 0, 0, 0, 0, 100_000],
      }),
    };
    const { service } = setup(universe.slice(0, 3), hand);
    const result = await service.run(
      USER,
      definition({ market: marketBlock({ avg_value: { sessions: 5, min: null } }) }),
      NOW,
    );
    const avg = Object.fromEntries(result.results.map((row) => [row.symbol, row.market.avg_value]));
    expect(avg.AAA).toBeCloseTo(3.8, 12);
    expect(avg.BBB).toBeCloseTo(20, 12);
    // (0×7 ×4 + 0×7 + 50×100.000) / 5 = 1.000.000 -> 1 tỷ.
    expect(avg.CCC).toBeCloseTo(1, 12);
    const gate = await service.run(
      USER,
      definition({ market: marketBlock({ avg_value: { sessions: 5, min: 3.8 } }) }),
      NOW,
    );
    expect(symbolsOf(gate)).toEqual(['AAA', 'BBB']);
  });

  it('11.2.11 a company with fewer than N sessions has no GTGD and is out of scope once a threshold is set', async () => {
    const withThreshold = await run({ avg_value: { sessions: 20, min: 0 } });
    expect(symbolsOf(withThreshold)).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
    expect(withThreshold.data_quality.market.excluded_missing.avg_value).toBe(2);
    // No threshold: nothing is excluded, the cell is just blank.
    const noThreshold = await run({ avg_value: { sessions: 20, min: null } });
    expect(noThreshold.results.find((row) => row.symbol === 'EEE')!.market.avg_value).toBeNull();
    expect(symbolsOf(noThreshold)).toHaveLength(6);
    // A smaller N makes the three-session company eligible.
    const shorter = await run({ avg_value: { sessions: 5, min: 0 } });
    expect(symbolsOf(shorter)).not.toContain('FFF');
  });

  it('a company with no bar at T keeps NO_SIGNAL for technical rows and is counted as without a session bar', async () => {
    const result = await run({}, [RSI_LEVEL]);
    const suspended = result.results.find((row) => row.symbol === 'FFF')!;
    expect(suspended.market).toEqual({ price: null, change_pct: null, market_cap: null, avg_value: null });
    expect(suspended.technical['rsi.level']).toMatchObject({
      status: 'missing',
      result: null,
      reason_code: 'no_session_bar',
    });
    expect(suspended.passed).toBe(false);
    expect(result.data_quality.market.without_session_bar).toBe(1);
  });

  it('change % is against the previous session of the same company', async () => {
    const { service } = setup(universe.slice(0, 1), {
      AAA: barsFromCloses(SESSION, { closes: [20, 20, 22] }),
    });
    const result = await service.run(USER, definition(), NOW);
    expect(result.results[0]!.market.change_pct).toBeCloseTo(10, 10);
    expect(result.results[0]!.market.price).toBe(22);
  });
});

describe('Kỹ thuật (spec §3): one evaluation function shared with the Bot', () => {
  const falling = (count: number) =>
    barsFromCloses(SESSION, { closes: Array.from({ length: count }, (_, i) => 100 - i * 0.5) });
  const rising = (count: number) =>
    barsFromCloses(SESSION, { closes: Array.from({ length: count }, (_, i) => 50 + i * 0.5) });
  const universe = [record('AAA'), record('BBB'), record('CCC')];

  it('an enabled row is true / false per company; passing requires every enabled row true', async () => {
    const { service } = setup(universe, { AAA: falling(80), BBB: rising(80), CCC: falling(80) });
    const result = await service.run(USER, definition({ technical: [RSI_LEVEL] }), NOW);
    const byRow = Object.fromEntries(
      result.results.map((row) => [row.symbol, row.technical['rsi.level']!]),
    );
    expect(byRow.AAA).toMatchObject({
      key: 'rsi.level',
      indicator: 'rsi',
      label: 'RSI14',
      status: 'ok',
      result: true,
      op: '<',
      value: 0,
      display: '0,0',
      sort_value: 0,
      params: { period: 14, op: '<', threshold: 30 },
      // The detail dialog shows T−1 in the same format as T.
      previous: { value: 0, value2: null, value3: null, display: '0,0' },
    });
    expect(byRow.BBB).toMatchObject({ status: 'ok', result: false, value: 100, display: '100,0' });
    expect(result.results.map((row) => [row.symbol, row.passed])).toEqual([
      ['AAA', true],
      ['BBB', false],
      ['CCC', true],
    ]);
    // The switched-off row is not evaluated and has no cell.
    expect(Object.keys(result.results[0]!.technical)).toEqual(['rsi.level']);
    expect(result.counts).toMatchObject({
      universe: 3,
      passed: 2,
      failed_threshold: 1,
      with_required_exceptions: 0,
    });
    expect(result.data_quality.technical).toEqual([
      {
        key: 'rsi.level',
        indicator: 'rsi',
        row_id: 'rsi.level',
        label: 'RSI14',
        by_status: { ok: 3 },
        by_reason: {},
      },
    ]);
  });

  it('11.2.10 a row that needs SMA200 on a young listing is NO_SIGNAL: "Chưa đủ lịch sử giá", counted, never a pass', async () => {
    const sma200 = {
      indicator: 'ma',
      rules: [
        { id: 'ma.price_cross', enabled: true, op: 'cross_up', period: 200 },
        { id: 'ma.ma_cross', enabled: false, fast: 10, op: 'cross_up', slow: 20 },
        { id: 'ma.trend', enabled: false, period: 20, dir: 'up' },
      ],
    };
    const { service } = setup(
      [record('OLD'), record('NEW')],
      { OLD: rising(450), NEW: rising(150) },
    );
    const result = await service.run(USER, definition({ technical: [sma200] }), NOW);
    const byRow = Object.fromEntries(result.results.map((row) => [row.symbol, row]));
    const cell = byRow.NEW!.technical['ma.price_cross']!;
    expect(cell).toMatchObject({
      status: 'missing',
      result: null,
      value: null,
      display: null,
      sort_value: null,
      reason: 'Chưa đủ lịch sử giá',
      reason_code: 'insufficient_price_history',
    });
    expect(byRow.NEW!.passed).toBe(false);
    // 450 sessions are enough for SMA200: the row is evaluated (false: no fresh cross-up at T).
    expect(byRow.OLD!.technical['ma.price_cross']).toMatchObject({ status: 'ok', result: false });
    expect(byRow.OLD!.passed).toBe(false);
    expect(result.counts).toMatchObject({
      universe: 2,
      passed: 0,
      failed_threshold: 1,
      with_required_exceptions: 1,
      missing: 1,
    });
    expect(result.data_quality.technical[0]).toMatchObject({
      key: 'ma.price_cross',
      by_status: { ok: 1, missing: 1 },
      by_reason: { insufficient_price_history: 1 },
    });
  });

  it('11.2.9 no look-ahead: a signal that first appears at T+1 is not a pass at T, and is at T+1', async () => {
    // 200 sessions rising one per day, then one big drop on the last session (T+1).
    const closes = [...Array.from({ length: 200 }, (_, i) => 100 + i), 40];
    const columns = barsFromCloses('2025-05-30', { closes });
    const tPlus1 = columns.dates.at(-1)!;
    const t = columns.dates.at(-2)!;
    const atT = await setup([record('AAA')], { AAA: columns }, { session: t }).service.run(
      USER,
      definition({ technical: [RSI_LEVEL] }),
      NOW,
    );
    expect(atT.session_date).toBe(t);
    expect(atT.results[0]!.technical['rsi.level']).toMatchObject({ status: 'ok', result: false });
    expect(atT.results[0]!.passed).toBe(false);
    const atNext = await setup([record('AAA')], { AAA: columns }, { session: tPlus1 }).service.run(
      USER,
      definition({ technical: [RSI_LEVEL] }),
      NOW,
    );
    expect(atNext.results[0]!.technical['rsi.level']).toMatchObject({ status: 'ok', result: true });
    expect(atNext.results[0]!.passed).toBe(true);
  });

  it('Khối lượng: close vs the previous close and volume vs k × the mean of the N previous sessions', async () => {
    const closes = Array.from({ length: 40 }, (_, i) => 20 + (i === 39 ? 1 : 0));
    const volumes = Array.from({ length: 40 }, (_, i) => (i === 39 ? 230_000 : 189_000));
    const item = { indicator: 'volume', sessions: 20, factor: 1.1, ops: ['>', '>'] };
    const { service } = setup([record('AAA'), record('BBB')], {
      AAA: barsFromCloses(SESSION, { closes, volumes }),
      // The same volume spike but the close fell: row 1 is false.
      BBB: barsFromCloses(SESSION, { closes: closes.map((value, i) => (i === 39 ? 19 : value)), volumes }),
    });
    const result = await service.run(USER, definition({ technical: [item] }), NOW);
    const aaa = result.results.find((row) => row.symbol === 'AAA')!;
    expect(Object.keys(aaa.technical)).toEqual(['volume.r1', 'volume.r2']);
    expect(aaa.technical['volume.r1']).toMatchObject({ status: 'ok', result: true });
    // Mean of the 20 PRIOR sessions (T excluded) = 189.000; 1,1 × 189.000 = 207.900 < 230.000.
    expect(aaa.technical['volume.r2']).toMatchObject({
      status: 'ok',
      result: true,
      label: 'KL / 1,1×TB20 (nghìn cp)',
      display: '230 / 208',
    });
    expect(aaa.passed).toBe(true);
    const bbb = result.results.find((row) => row.symbol === 'BBB')!;
    expect(bbb.technical['volume.r1']).toMatchObject({ result: false });
    expect(bbb.passed).toBe(false);
  });

  it('every enabled row is a column; a company that fails Kỹ thuật is not sent for fundamentals', async () => {
    const { service, vci } = setup(
      universe,
      { AAA: falling(80), BBB: rising(80), CCC: falling(80) },
      { revenue: { AAA: [1200, 1000], BBB: [1200, 1000], CCC: [900, 1000] } },
    );
    const result = await service.run(
      USER,
      definition({
        technical: [RSI_LEVEL],
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
      }),
      NOW,
    );
    // Step 2 reads VCI statements for AAA and CCC only (RSI < 30); BBB failed Kỹ thuật.
    expect([...new Set(vci.statementCalls.map((call) => call.split(':')[0]))].sort()).toEqual([
      'AAA',
      'CCC',
    ]);
    const byRow = Object.fromEntries(result.results.map((row) => [row.symbol, row]));
    expect(byRow.AAA).toMatchObject({ passed: true });
    expect(byRow.AAA!.metrics.revenue_yoy).toMatchObject({ status: 'ok' });
    expect(byRow.BBB).toMatchObject({ passed: false, metrics: {} });
    expect(byRow.CCC).toMatchObject({ passed: false });
    expect(byRow.CCC!.metrics.revenue_yoy).toMatchObject({ status: 'ok' });
    // BBB is "không đạt ngưỡng" (it is not an exception); CCC fails the revenue threshold.
    expect(result.counts).toEqual({
      universe: 3,
      passed: 1,
      failed_threshold: 2,
      with_required_exceptions: 0,
      missing: 0,
    });
    expect(result.fundamental_candidates).toBe(2);
    // Per-metric quality counts only the companies that reached the fundamental step.
    expect(result.data_quality.metrics[0]).toMatchObject({ by_status: { ok: 2 } });
  });

  it('no enabled technical row: Kỹ thuật does not affect the result and no bar is needed for it', async () => {
    const switchedOff = {
      indicator: 'rsi',
      rules: RSI_LEVEL.rules.map((row) => ({ ...row, enabled: false })),
    };
    const { service, market } = setup(universe, {}, { session: null });
    const result = await service.run(USER, definition({ technical: [switchedOff] }), NOW);
    expect(symbolsOf(result)).toEqual(['AAA', 'BBB', 'CCC']);
    expect(result.results.every((row) => row.passed && Object.keys(row.technical).length === 0)).toBe(true);
    expect(result.session_date).toBeNull();
    expect(result.price_source).toBeNull();
    expect(market.loadCalls).toEqual([]);
    // The definition keeps the switched-off rows (spec §6.3).
    expect(JSON.stringify(result.definition.technical)).toContain('"enabled":false');
  });

  it('503 MARKET_DATA_UNAVAILABLE when the filter needs the stored bars and none are stored yet', async () => {
    const { service, store } = setup(universe, {}, { session: null });
    for (const patch of [
      { technical: [RSI_LEVEL] },
      { market: marketBlock({ close_price: { min: 1, max: null } }) },
      { market: marketBlock({ baskets: ['VN30'] }) },
    ]) {
      const error = await service
        .run(USER, definition(patch), NOW)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
        code: 'MARKET_DATA_UNAVAILABLE',
      });
    }
    expect(store.rows).toEqual([]);
    // A scope that needs no bar still runs: the market columns are blank.
    const scopeOnly = await service.run(
      USER,
      definition({ market: marketBlock({ exchanges: ['HOSE'] }) }),
      NOW,
    );
    expect(symbolsOf(scopeOnly)).toEqual(['AAA', 'BBB', 'CCC']);
    expect(scopeOnly.results[0]!.market.price).toBeNull();
  });
});

describe('the 500-company cap applies to the fundamental step only (spec §9)', () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, index) => record(`S${String(index).padStart(4, '0')}`));
  const rule = {
    id: 'r1',
    metric_id: 'revenue_yoy',
    period: 'ttm',
    operator: '>',
    value: 0.15,
    api_unit: 'ratio',
  };

  it('Thị trường and Kỹ thuật run over the whole universe: more than 500 companies are listed when no fundamental is asked', async () => {
    const universe = many(SCREENER_MAX_UNIVERSE + 120);
    const { service, vci } = setup(universe, {});
    const result = await service.run(
      USER,
      definition({ market: marketBlock({ exchanges: ['HOSE'] }) }),
      NOW,
    );
    expect(result.results).toHaveLength(SCREENER_MAX_UNIVERSE + 120);
    expect(result.universe_truncated).toBe(false);
    expect(result.fundamental_candidates).toBeNull();
    expect(result.counts.passed).toBe(SCREENER_MAX_UNIVERSE + 120);
    expect(vci.statementCalls).toEqual([]);
  });

  it('above 500 survivors only the first 500 (A→Z) get fundamentals, and the run says how many survived', async () => {
    const universe = many(SCREENER_MAX_UNIVERSE + 20);
    const { service, vci } = setup(universe, {}, { revenue: {} });
    const result = await service.run(USER, definition({ rules: [rule] }), NOW);
    expect(result.universe_truncated).toBe(true);
    expect(result.fundamental_candidates).toBe(SCREENER_MAX_UNIVERSE + 20);
    expect(result.results).toHaveLength(SCREENER_MAX_UNIVERSE);
    expect(result.results.at(-1)!.symbol).toBe(`S${String(SCREENER_MAX_UNIVERSE - 1).padStart(4, '0')}`);
    expect(new Set(vci.statementCalls.map((call) => call.split(':')[0])).size).toBe(
      SCREENER_MAX_UNIVERSE,
    );
  });

  it('a technical filter narrows the field BEFORE the cap: 520 listed companies, 3 survivors, no truncation', async () => {
    const universe = many(SCREENER_MAX_UNIVERSE + 20);
    const rising = barsFromCloses(SESSION, {
      closes: Array.from({ length: 60 }, (_, i) => 50 + i * 0.5),
    });
    const falling = barsFromCloses(SESSION, {
      closes: Array.from({ length: 60 }, (_, i) => 100 - i * 0.5),
    });
    const bars = Object.fromEntries(
      universe.map((item, index) => [item.symbol, index < 3 ? falling : rising]),
    );
    const { service, vci } = setup(universe, bars, {
      revenue: { S0000: [1200, 1000], S0001: [1200, 1000], S0002: [1200, 1000] },
    });
    const result = await service.run(
      USER,
      definition({ rules: [rule], technical: [RSI_LEVEL] }),
      NOW,
    );
    expect(result.universe_truncated).toBe(false);
    expect(result.fundamental_candidates).toBe(3);
    expect(result.results).toHaveLength(SCREENER_MAX_UNIVERSE + 20);
    expect(result.counts.passed).toBe(3);
    expect([...new Set(vci.statementCalls.map((call) => call.split(':')[0]))].sort()).toEqual([
      'S0000',
      'S0001',
      'S0002',
    ]);
  });
});

describe('sorting a stored result by the Thị trường and Kỹ thuật columns (spec §4.3)', () => {
  const universe = [record('AAA'), record('BBB'), record('CCC'), record('DDD')];
  const bars = {
    AAA: barsFromCloses(SESSION, { closes: Array.from({ length: 60 }, (_, i) => 30 + i * 0.1) }),
    BBB: barsFromCloses(SESSION, { closes: Array.from({ length: 60 }, (_, i) => 90 - i * 0.5) }),
    CCC: barsFromCloses(SESSION, { closes: Array.from({ length: 60 }, (_, i) => 90 - i * 0.5) }),
    // No bar at T: every Thị trường and Kỹ thuật value is blank.
    DDD: barsFromCloses('2025-05-28', { closes: Array.from({ length: 60 }, () => 20) }),
  };
  const query = (patch: Row) => ({
    offset: 0,
    limit: 100,
    passed_only: false,
    order: 'asc' as const,
    ...patch,
  });

  it('numbers sort by value, blank cells are last whatever the direction, ties go by Mã A→Z', async () => {
    const { service } = setup(universe, bars);
    const run = await service.run(USER, definition({ technical: [RSI_LEVEL] }), NOW);
    const order = async (patch: Row) =>
      (await service.getResult(USER, run.result_id, query(patch))).results.map((row) => row.symbol);
    // Prices at T: AAA 35,9; BBB/CCC 60,5 (tie); DDD none.
    expect(await order({ sort: 'price', order: 'desc' })).toEqual(['BBB', 'CCC', 'AAA', 'DDD']);
    expect(await order({ sort: 'price', order: 'asc' })).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
    // RSI at T: AAA 100 (rising), BBB/CCC 0 (falling) tie; DDD NO_SIGNAL (no bar at T).
    expect(await order({ sort: 'tech:rsi.level', order: 'desc' })).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
    expect(await order({ sort: 'tech:rsi.level', order: 'asc' })).toEqual(['BBB', 'CCC', 'AAA', 'DDD']);
    expect(await order({ sort: 'market_cap', order: 'desc' })).toEqual(['BBB', 'CCC', 'AAA', 'DDD']);
    expect(await order({ sort: 'avg_value', order: 'asc' })).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
    expect(await order({ sort: 'change_pct', order: 'desc' })).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
    // Text columns.
    expect(await order({ sort: 'exchange', order: 'desc' })).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
    expect(await order({ sort: 'group', order: 'desc' })).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
    // Paging happens after ordering: page 2 of a descending price sort.
    expect(await order({ sort: 'price', order: 'desc', offset: 2, limit: 2 })).toEqual(['AAA', 'DDD']);
  });
});
