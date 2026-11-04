import { describe, expect, it } from 'vitest';

import {
  canonicalMarket,
  canonicalizeV4,
  criteriaOf,
  emptyMarketScope,
  enabledTechnical,
  marketFromV3Scope,
  marketIsOpen,
  marketIssues,
  normalizeDefinition,
  readStoredDefinition,
  type MarketScope,
  type ScreenerDefinitionV3,
  type ScreenerDefinitionV4,
  type TechnicalRow,
} from '../../src/modules/screener/screener.definition.js';
import {
  cheapVerdict,
  computeMarketValues,
  EMPTY_MARKET_VALUES,
  marketNeedsBars,
  scopeVerdict,
  valueVerdict,
  type BasketMembers,
  type UniverseRecord,
} from '../../src/modules/screener/screener.market.js';
import { barsFromCloses, record } from './helpers/screener-fixtures.js';

const SESSION = '2025-05-30';

const scope = (patch: Partial<MarketScope> = {}): MarketScope => ({ ...emptyMarketScope(), ...patch });

describe('Bộ lọc 4.0 §2.2 / §5: Thị trường values at session T (units: nghìn đ, tỷ đ)', () => {
  it('takes the close, the change vs the previous close, Vốn hóa = close × shares and GTGD = mean(close × volume)', () => {
    const bars = barsFromCloses(SESSION, {
      closes: [10, 11, 12, 13, 14, 15],
      volumes: [1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 2_000_000],
    });
    const values = computeMarketValues(bars, SESSION, 200_000_000, 5);
    expect(values.price).toBe(15);
    expect(values.change_pct).toBeCloseTo(((15 / 14) - 1) * 100, 10);
    // 15 nghìn đ × 200 triệu cp = 3.000 tỷ đ.
    expect(values.market_cap).toBeCloseTo(3000, 8);
    // Last 5 sessions (T included): closes 11..15, volumes 1M ×4 and 2M → (11+12+13+14)·1M + 15·2M = 80M·1000đ.
    // In tỷ đ: 80_000_000 / 5 / 1e6 = 16.
    expect(values.avg_value).toBeCloseTo(16, 10);
  });

  it('a symbol without a bar at T has no value at all: the older bar is never read as T', () => {
    const bars = barsFromCloses('2025-05-29', { closes: [10, 11, 12] });
    expect(computeMarketValues(bars, SESSION, 1_000_000, 5)).toBe(EMPTY_MARKET_VALUES);
    expect(computeMarketValues(null, SESSION, 1_000_000, 5)).toBe(EMPTY_MARKET_VALUES);
    expect(computeMarketValues({ dates: [], open: [], high: [], low: [], close: [], volume: [] }, SESSION, 1, 5)).toBe(
      EMPTY_MARKET_VALUES,
    );
  });

  it('fewer than N sessions: no average (never a shorter window), the other values stay', () => {
    const bars = barsFromCloses(SESSION, { closes: [10, 12, 15] });
    const values = computeMarketValues(bars, SESSION, 100, 5);
    expect(values.avg_value).toBeNull();
    expect(values.price).toBe(15);
    expect(values.market_cap).toBeCloseTo(0.0015, 10);
    // N equal to the number of bars is enough.
    expect(computeMarketValues(bars, SESSION, 100, 3).avg_value).not.toBeNull();
  });

  it('no share count: no Vốn hóa; a first bar has no change', () => {
    const bars = barsFromCloses(SESSION, { closes: [20] });
    const values = computeMarketValues(bars, SESSION, null, 5);
    expect(values.market_cap).toBeNull();
    expect(values.change_pct).toBeNull();
    expect(computeMarketValues(bars, SESSION, 0, 5).market_cap).toBeNull();
  });
});

describe('Bộ lọc 4.0 §2: scope verdicts (OR inside a list, AND between criteria, missing = out of scope)', () => {
  const baskets: BasketMembers = new Map([
    ['VN30', new Set(['AAA', 'BBB'])],
    ['VN100', new Set(['AAA', 'BBB', 'CCC'])],
    ['HNX30', null],
  ]);
  const values = (patch: Partial<typeof EMPTY_MARKET_VALUES> = {}) => ({
    price: 25,
    change_pct: 1,
    market_cap: 5_000,
    avg_value: 40,
    ...patch,
  });
  const verdict = (rec: UniverseRecord, market: MarketScope, vals = values()) =>
    scopeVerdict(rec, vals, market, baskets);

  it('an open scope keeps everything, even a symbol without any attribute', () => {
    expect(verdict(record('AAA', { exchange: null, group: null, shares: null }), scope(), EMPTY_MARKET_VALUES)).toEqual({
      in_scope: true,
    });
    expect(marketIsOpen(scope())).toBe(true);
    expect(marketNeedsBars(scope())).toBe(false);
  });

  it('Sàn: OR inside the list; a symbol with no exchange is missing', () => {
    const market = scope({ exchanges: ['HOSE', 'HNX'] });
    expect(verdict(record('AAA', { exchange: 'HNX' }), market).in_scope).toBe(true);
    expect(verdict(record('AAA', { exchange: 'UPCOM' }), market)).toEqual({ in_scope: false, missing: null });
    expect(verdict(record('AAA', { exchange: null }), market)).toEqual({ in_scope: false, missing: 'exchange' });
  });

  it('Rổ chỉ số: OR over the chosen baskets that have members; none stored at all is missing', () => {
    expect(verdict(record('AAA'), scope({ baskets: ['VN30'] })).in_scope).toBe(true);
    expect(verdict(record('CCC'), scope({ baskets: ['VN30'] }))).toEqual({ in_scope: false, missing: null });
    // OR: CCC is in VN100 although not in VN30.
    expect(verdict(record('CCC'), scope({ baskets: ['VN30', 'VN100'] })).in_scope).toBe(true);
    // HNX30 has no snapshot: it contributes nothing, VN30 still decides.
    expect(verdict(record('AAA'), scope({ baskets: ['HNX30', 'VN30'] })).in_scope).toBe(true);
    // Only baskets without a snapshot: nothing can be decided.
    expect(verdict(record('AAA'), scope({ baskets: ['HNX30'] }))).toEqual({ in_scope: false, missing: 'basket' });
  });

  it('Ngành: a statement group in the list; no group read yet is missing', () => {
    const market = scope({ statement_groups: ['nh', 'ck'] });
    expect(verdict(record('AAA', { group: 'nh' }), market).in_scope).toBe(true);
    expect(verdict(record('AAA', { group: 'thuong' }), market)).toEqual({ in_scope: false, missing: null });
    expect(verdict(record('AAA', { group: null }), market)).toEqual({ in_scope: false, missing: 'statement_group' });
  });

  it('Giá, Vốn hóa and GTGD ranges are inclusive and decided on the values at T', () => {
    const market = scope({
      close_price: { min: 25, max: 25 },
      market_cap: { min: 5_000, max: 5_000 },
      avg_value: { sessions: 20, min: 40 },
    });
    expect(verdict(record('AAA'), market).in_scope).toBe(true);
    expect(verdict(record('AAA'), market, values({ price: 24.99 }))).toEqual({ in_scope: false, missing: null });
    expect(verdict(record('AAA'), market, values({ market_cap: 5_000.01 }))).toEqual({ in_scope: false, missing: null });
    expect(verdict(record('AAA'), market, values({ avg_value: 39.9 }))).toEqual({ in_scope: false, missing: null });
  });

  it('a value that cannot be computed is missing, whichever criterion needs it; a bound left open never needs it', () => {
    expect(
      verdict(record('AAA'), scope({ close_price: { min: 1, max: null } }), values({ price: null })),
    ).toEqual({ in_scope: false, missing: 'close_price' });
    expect(
      verdict(record('AAA'), scope({ market_cap: { min: null, max: 9_000 } }), values({ market_cap: null })),
    ).toEqual({ in_scope: false, missing: 'market_cap' });
    expect(
      verdict(record('AAA'), scope({ avg_value: { sessions: 20, min: 10 } }), values({ avg_value: null })),
    ).toEqual({ in_scope: false, missing: 'avg_value' });
    // N alone (no minimum) restricts nothing.
    expect(verdict(record('AAA'), scope({ avg_value: { sessions: 50, min: null } }), EMPTY_MARKET_VALUES).in_scope).toBe(
      true,
    );
  });

  it('cheap criteria are decided first and need no bars; value criteria compose on top', () => {
    const market = scope({ exchanges: ['HOSE'], close_price: { min: 10, max: null } });
    expect(cheapVerdict(record('AAA', { exchange: 'HNX' }), market, baskets)).toEqual({ in_scope: false, missing: null });
    expect(cheapVerdict(record('AAA'), market, baskets)).toEqual({ in_scope: true });
    expect(valueVerdict(EMPTY_MARKET_VALUES, market)).toEqual({ in_scope: false, missing: 'close_price' });
    // The first failing criterion decides which one is reported (Sàn before Giá).
    expect(verdict(record('AAA', { exchange: null }), market, EMPTY_MARKET_VALUES)).toEqual({
      in_scope: false,
      missing: 'exchange',
    });
  });

  it('marketNeedsBars: only price, cap or traded value ranges read the stored bars', () => {
    expect(marketNeedsBars(scope({ exchanges: ['HOSE'], baskets: ['VN30'], statement_groups: ['nh'] }))).toBe(false);
    expect(marketNeedsBars(scope({ close_price: { min: null, max: 100 } }))).toBe(true);
    expect(marketNeedsBars(scope({ market_cap: { min: 1, max: null } }))).toBe(true);
    expect(marketNeedsBars(scope({ avg_value: { sessions: 10, min: 1 } }))).toBe(true);
    // A traded-value window without a minimum is a display setting.
    expect(marketNeedsBars(scope({ avg_value: { sessions: 10, min: null } }))).toBe(false);
  });
});

describe('Bộ lọc 4.0 §2.4: Thị trường validation messages', () => {
  it('has no issue for a clean scope and for the documented defaults', () => {
    expect(marketIssues(scope())).toEqual([]);
    expect(
      marketIssues(
        scope({
          market_cap: { min: 1_000, max: 50_000 },
          close_price: { min: 10, max: 100 },
          avg_value: { sessions: 5, min: 0 },
        }),
      ),
    ).toEqual([]);
    expect(marketIssues(scope({ avg_value: { sessions: 100, min: 1 } }))).toEqual([]);
  });

  it('every message starts with "Cơ bản · Thị trường: " and names the field', () => {
    const issues = marketIssues(
      scope({
        market_cap: { min: 9, max: 3 },
        close_price: { min: -1, max: null },
        avg_value: { sessions: 4, min: -5 },
      }),
    );
    expect(issues.map((issue) => issue.code)).toEqual(['RANGE', 'NEGATIVE', 'NEGATIVE', 'SESSIONS']);
    for (const issue of issues) expect(issue.message.startsWith('Cơ bản · Thị trường: ')).toBe(true);
    expect(issues[0]!.message).toBe('Cơ bản · Thị trường: Vốn hóa: "từ" phải nhỏ hơn hoặc bằng "đến".');
    expect(issues[1]!.message).toBe('Cơ bản · Thị trường: Giá không được âm.');
    expect(issues[2]!.message).toBe('Cơ bản · Thị trường: Giá trị giao dịch phải là số không âm.');
    expect(issues[3]!.message).toBe('Cơ bản · Thị trường: Số phiên phải từ 5 đến 100, số nguyên.');
    expect(issues[3]!.path).toEqual(['market', 'avg_value', 'sessions']);
  });

  it('N must be an integer between 5 and 100', () => {
    for (const sessions of [4, 101, 20.5, Number.NaN])
      expect(marketIssues(scope({ avg_value: { sessions, min: null } }))).toHaveLength(1);
    for (const sessions of [5, 20, 100])
      expect(marketIssues(scope({ avg_value: { sessions, min: null } }))).toEqual([]);
  });

  it('negative Vốn hóa is reported as negative, not as an inverted range', () => {
    const issues = marketIssues(scope({ market_cap: { min: -10, max: -20 } }));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toBe('Cơ bản · Thị trường: Vốn hóa không được âm.');
  });
});

describe('Bộ lọc 4.0 §6: definition 4.0, the 3.0 read-mapping and the criteria', () => {
  const base = (patch: Partial<ScreenerDefinitionV4> = {}): ScreenerDefinitionV4 => ({
    schema_version: '4.0',
    name: 'Bộ lọc',
    logic: 'AND',
    data_mode: 'latest_disclosed',
    market: emptyMarketScope(),
    rules: [{ id: 'r1', metric_id: 'roe', period: 'ttm', operator: '>', value: 0.15, api_unit: 'ratio' }],
    technical: [],
    ...patch,
  });
  const v3 = (scopeValue: { market: string; sector: string }): ScreenerDefinitionV3 => ({
    schema_version: '3.0',
    name: 'Cũ',
    logic: 'AND',
    data_mode: 'latest_disclosed',
    rules: [{ id: 'r1', metric_id: 'roe', period: 'ttm', operator: '>', value: 0.15, api_unit: 'ratio' }],
    scope: scopeValue,
  });

  it('canonical form: lists sorted and unique, HSX is HOSE, empty bounds null, default N', () => {
    const market = canonicalMarket({
      exchanges: ['hnx', 'HSX', 'HOSE'] as never,
      baskets: ['vn100', 'VN30', 'VN30'] as never,
      statement_groups: ['ck', 'nh', 'ck'],
      market_cap: { min: undefined as never, max: 100 },
      avg_value: { sessions: undefined as never, min: 5 },
    });
    expect(market).toEqual({
      exchanges: ['HNX', 'HOSE'],
      baskets: ['VN100', 'VN30'],
      statement_groups: ['ck', 'nh'],
      market_cap: { min: null, max: 100 },
      avg_value: { sessions: 20, min: 5 },
      close_price: { min: null, max: null },
    });
    expect(canonicalMarket(null)).toEqual(emptyMarketScope());
    // The same selection in another order is the same bytes.
    expect(JSON.stringify(canonicalMarket({ exchanges: ['HNX', 'HOSE'] }))).toBe(
      JSON.stringify(canonicalMarket({ exchanges: ['HOSE', 'HNX', 'HOSE'] })),
    );
  });

  it('3.0 scope maps to 4.0: ALL leaves Sàn open, HSX becomes HOSE, no sector means no review', () => {
    expect(marketFromV3Scope({ market: 'ALL', sector: '' })).toEqual({
      market: emptyMarketScope(),
      sector_review: null,
    });
    expect(marketFromV3Scope({ market: 'HSX', sector: 'all' }).market.exchanges).toEqual(['HOSE']);
    expect(marketFromV3Scope({ market: 'upcom', sector: '' }).market.exchanges).toEqual(['UPCOM']);
    expect(marketFromV3Scope({ market: 'UNKNOWN', sector: '' }).market.exchanges).toEqual([]);
  });

  it('3.0 ICB sector is kept as evidence + review flag, never guessed into a statement group', () => {
    const mapped = normalizeDefinition(v3({ market: 'HOSE', sector: 'Ngân hàng' }));
    expect(mapped.definition.schema_version).toBe('4.0');
    expect(mapped.sector_review).toEqual({ sector: 'Ngân hàng' });
    expect(mapped.definition.market).toMatchObject({
      exchanges: ['HOSE'],
      statement_groups: [],
      needs_review: 'sector',
      legacy_sector: 'Ngân hàng',
    });
    expect(mapped.definition.technical).toEqual([]);
    expect(mapped.definition.rules).toHaveLength(1);
  });

  it('a stored 4.0 review flag survives a read and clears once the criteria are chosen again', () => {
    const flagged = base({ market: { ...emptyMarketScope(), needs_review: 'sector', legacy_sector: 'Bất động sản' } });
    const read = readStoredDefinition(flagged);
    expect(read?.sector_review).toEqual({ sector: 'Bất động sản' });
    const cleared = readStoredDefinition(base({ market: { ...emptyMarketScope(), statement_groups: ['thuong'] } }));
    expect(cleared?.sector_review).toBeNull();
    expect(cleared?.definition.market.needs_review).toBeUndefined();
  });

  it('readStoredDefinition: 3.0 mapped on read (stored document untouched), 4.0 canonical, garbage null', () => {
    const stored = v3({ market: 'HNX', sector: '' });
    const copy = structuredClone(stored);
    expect(readStoredDefinition(stored)?.definition.market.exchanges).toEqual(['HNX']);
    expect(stored).toEqual(copy);
    expect(readStoredDefinition({ schema_version: '4.0', rules: [] })).toBeNull();
    expect(readStoredDefinition({ schema_version: '4.0', rules: [], market: null })).toBeNull();
    expect(readStoredDefinition({ schema_version: '3.0', rules: [] })).toBeNull();
    const roundTrip = readStoredDefinition(canonicalizeV4(base({ market: scope({ exchanges: ['HOSE'] }) })));
    expect(roundTrip?.definition.market.exchanges).toEqual(['HOSE']);
  });

  it('canonicalizeV4 adds the missing technical list and forces data_mode', () => {
    const input = { ...base(), technical: undefined as never };
    expect(canonicalizeV4(input).technical).toEqual([]);
    expect(canonicalizeV4(input).data_mode).toBe('latest_disclosed');
  });

  it('criteria: disabled technical rows and the review flag are not criteria; enabled ones are', () => {
    const rsiRows = (second: boolean): TechnicalRow[] => [
      { id: 'level', enabled: true, op: '>', value: 50, period: 14 },
      { id: 'trend', enabled: second, dir: 'up', period: 14, bars: 3 },
    ];
    const withDisabled = base({ technical: [{ indicator: 'rsi', rules: rsiRows(false) }] });
    const onlyEnabled = base({
      technical: [{ indicator: 'rsi', rules: [rsiRows(false)[0]!] }],
    });
    expect(criteriaOf(withDisabled)).toEqual(criteriaOf(onlyEnabled));
    // Switching the second row on changes the criteria.
    expect(criteriaOf(base({ technical: [{ indicator: 'rsi', rules: rsiRows(true) }] }))).not.toEqual(
      criteriaOf(withDisabled),
    );
    // A card with every row off contributes nothing.
    expect(
      criteriaOf(base({ technical: [{ indicator: 'rsi', rules: rsiRows(false).map((row) => ({ ...row, enabled: false })) }] }))
        .technical,
    ).toEqual([]);
    // The review flag and the name are not criteria either.
    const flagged = base({ name: 'Khác', market: { ...emptyMarketScope(), needs_review: 'sector', legacy_sector: 'X' } });
    expect(criteriaOf(flagged)).toEqual(criteriaOf(base()));
    expect(criteriaOf(base({ market: scope({ exchanges: ['HOSE'] }) }))).not.toEqual(criteriaOf(base()));
  });

  it('enabledTechnical keeps Khối lượng and orders cards by indicator id', () => {
    const items = enabledTechnical([
      { indicator: 'volume', sessions: 20, factor: 1.1, ops: ['>', '>'] },
      { indicator: 'rsi', rules: [{ id: 'level', enabled: true, op: '>', value: 50, period: 14 }] },
      { indicator: 'macd', rules: [{ id: 'cross', enabled: false }] },
    ]);
    expect(items.map((item) => item.indicator)).toEqual(['rsi', 'volume']);
  });
});
