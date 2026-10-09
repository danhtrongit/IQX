import { afterEach, describe, expect, it, vi } from 'vitest';

import { BotMarketSnapshotProvider } from '../../src/modules/market-integration/bot-market-snapshot.provider.js';

afterEach(() => vi.useRealTimers());

const SESSION = '2026-01-02';

const feeRow = {
  id: 'fee-1',
  buy_fee_rate_bps: 10,
  sell_fee_rate_bps: 10,
  sell_tax_rate_bps: 10,
  board_lot_size: 100,
  updated_at: '2026-01-02T00:00:00Z',
};

/** `count` daily bars ending on SESSION, each with the given traded value. */
function bars(count = 25, options: { endDate?: string; gtgdVnd?: number | null } = {}) {
  const end = new Date(`${options.endDate ?? SESSION}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (count - 1 - index));
    return {
      time: date.toISOString().slice(0, 10),
      open: 10_000,
      high: 10_100,
      low: 9_900,
      close: 10_000 + index,
      volume: 100_000,
      gtgdVnd: options.gtgdVnd === undefined ? 2_000_000_000 : options.gtgdVnd,
    };
  });
}

function fixture(
  options: {
    barsBySymbol?: Record<string, ReturnType<typeof bars>>;
    tradableSymbols?: string[];
    restricted?: Set<string> | null;
  } = {},
) {
  const barsBySymbol = options.barsBySymbol ?? { AAA: bars() };
  const database = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('from symbols')) {
        return (options.tradableSymbols ?? Object.keys(barsBySymbol)).map((symbol) => ({ symbol }));
      }
      if (sql.includes('from virtual_trading_configs')) return [feeRow];
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
  const barSource = {
    dailyBarsThrough: vi.fn(
      async (symbols: readonly string[]) =>
        new Map(
          symbols.flatMap((symbol) =>
            barsBySymbol[symbol] ? [[symbol, barsBySymbol[symbol]]] : [],
          ),
        ),
    ),
    // The Hunt filters must never be reached from the Bot provider.
    netFlowThrough: vi.fn(),
  };
  const restrictions = {
    current: vi
      .fn()
      .mockResolvedValue(options.restricted === undefined ? new Set<string>() : options.restricted),
  };
  const market = { getOhlcv: vi.fn().mockResolvedValue({ data: [] }) };
  const provider = new BotMarketSnapshotProvider(
    database as never,
    market as never,
    barSource as never,
    restrictions as never,
  );
  return { database, barSource, restrictions, provider };
}

function afterClose() {
  vi.useFakeTimers().setSystemTime(new Date('2026-01-02T19:00:00+07:00'));
}

describe('BotMarketSnapshotProvider (universe + held positions, no Hunt)', () => {
  it('P01 delivers close and 20-session value for universe members AND held positions', async () => {
    afterClose();
    const { provider, barSource } = fixture({
      barsBySymbol: { AAA: bars(), BBB: bars(), HELD: bars() },
      tradableSymbols: ['AAA', 'BBB'],
    });

    const result = await provider.buildSnapshot(SESSION, {
      openSymbols: ['HELD'],
      universeSymbols: ['bbb', 'AAA'],
    });

    expect(Object.keys(result.symbols).sort()).toEqual(['AAA', 'BBB', 'HELD']);
    for (const name of ['AAA', 'BBB', 'HELD']) {
      expect(result.symbols[name]).toMatchObject({
        close_is_official: true,
        close_vnd: '10024',
        trading_value_avg20_vnd: '2000000000',
      });
    }
    expect(barSource.dailyBarsThrough).toHaveBeenCalledWith(['AAA', 'BBB', 'HELD'], 25, SESSION);
    // Held positions outside the universe carry no buy-side status.
    expect(result.symbols.HELD?.tradable_security_status).toBeUndefined();
    expect(result.symbols.AAA).toMatchObject({
      security_status_verified: true,
      tradable_security_status: true,
    });
    expect(result.buy_inputs_complete).toBe(true);
    expect(result.close_is_official).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.data_version).toMatch(/^bot-v1:2026-01-02:/);
  });

  it('P02 never touches Hunt flows, AI layers or L1 amplitude', async () => {
    afterClose();
    const { provider, barSource, database } = fixture();

    const result = await provider.buildSnapshot(SESSION, {
      openSymbols: [],
      universeSymbols: ['AAA'],
    });

    expect(barSource.netFlowThrough).not.toHaveBeenCalled();
    expect(database.query.mock.calls.some(([sql]) => String(sql).includes('ai_insight'))).toBe(
      false,
    );
    expect(result.symbols.AAA).not.toHaveProperty('filter_ids');
    expect(result.symbols.AAA).not.toHaveProperty('layers');
    expect(result.symbols.AAA).not.toHaveProperty('l1_amplitude_vnd');
    expect(JSON.stringify(result.source_refs)).not.toContain('khoi_ngoai_gom');
  });

  it('P03 one symbol without bars does not fail the snapshot or other symbols', async () => {
    afterClose();
    const { provider } = fixture({
      barsBySymbol: { AAA: bars() },
      tradableSymbols: ['AAA', 'BBB'],
    });

    const result = await provider.buildSnapshot(SESSION, {
      openSymbols: [],
      universeSymbols: ['AAA', 'BBB'],
    });

    expect(result.symbols.AAA?.close_is_official).toBe(true);
    expect(result.symbols.BBB).toMatchObject({ close_is_official: false });
    expect(result.symbols.BBB?.close_vnd).toBeUndefined();
    expect(result.buy_inputs_complete).toBe(true);
    expect(result.source_refs).toMatchObject({
      universe: { symbols_with_gaps: 1, gaps: { BBB: 'no_bars' } },
    });
  });

  it('P04 a symbol with fewer than 20 valued sessions keeps its close but has no average', async () => {
    afterClose();
    const { provider } = fixture({ barsBySymbol: { AAA: bars(12) } });

    const result = await provider.buildSnapshot(SESSION, {
      openSymbols: [],
      universeSymbols: ['AAA'],
    });

    expect(result.symbols.AAA?.close_is_official).toBe(true);
    expect(result.symbols.AAA?.trading_value_avg20_vnd).toBeUndefined();
  });

  it('P05 a missing traded value is never turned into zero', async () => {
    afterClose();
    const { provider } = fixture({ barsBySymbol: { AAA: bars(25, { gtgdVnd: null }) } });

    const result = await provider.buildSnapshot(SESSION, {
      openSymbols: [],
      universeSymbols: ['AAA'],
    });

    expect(result.symbols.AAA?.trading_value_avg20_vnd).toBeUndefined();
    expect(result.symbols.AAA?.close_is_official).toBe(true);
  });

  it('P06 an unavailable HOSE status feed blocks buys but never the held positions', async () => {
    afterClose();
    const { provider } = fixture({
      barsBySymbol: { AAA: bars(), HELD: bars() },
      restricted: null,
    });

    const result = await provider.buildSnapshot(SESSION, {
      openSymbols: ['HELD'],
      universeSymbols: ['AAA'],
    });

    expect(result.buy_inputs_complete).toBe(false);
    expect(result.symbols.AAA).toMatchObject({
      security_status_verified: false,
      tradable_security_status: false,
    });
    expect(result.symbols.HELD?.close_is_official).toBe(true);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'missing_security_status' }),
    );
  });

  it('P07 restricted or not-tradable universe members are flagged individually', async () => {
    afterClose();
    const { provider } = fixture({
      barsBySymbol: { AAA: bars(), BBB: bars(), CCC: bars() },
      tradableSymbols: ['AAA', 'BBB'],
      restricted: new Set(['BBB']),
    });

    const result = await provider.buildSnapshot(SESSION, {
      openSymbols: [],
      universeSymbols: ['AAA', 'BBB', 'CCC'],
    });

    expect(result.symbols.AAA?.tradable_security_status).toBe(true);
    expect(result.symbols.BBB).toMatchObject({
      security_status_verified: true,
      tradable_security_status: false,
    });
    expect(result.symbols.CCC).toMatchObject({
      security_status_verified: true,
      tradable_security_status: false,
    });
    expect(result.buy_inputs_complete).toBe(true);
  });

  it('P08 an empty universe skips the status feed and the universe scan entirely', async () => {
    afterClose();
    const { provider, restrictions, barSource } = fixture({ barsBySymbol: { HELD: bars() } });

    const result = await provider.buildSnapshot(SESSION, {
      openSymbols: ['HELD'],
      universeSymbols: [],
    });

    expect(restrictions.current).not.toHaveBeenCalled();
    expect(barSource.dailyBarsThrough).toHaveBeenCalledWith(['HELD'], 25, SESSION);
    expect(result.buy_inputs_complete).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('P09 stale bars are not an official close and a held symbol without one is reported', async () => {
    afterClose();
    const stale = bars(25, { endDate: '2026-01-01' });
    const { provider } = fixture({ barsBySymbol: { HELD: stale } });

    const result = await provider.buildSnapshot(SESSION, {
      openSymbols: ['HELD'],
      universeSymbols: [],
    });

    expect(result.symbols.HELD?.close_is_official).toBe(false);
    expect(result.close_is_official).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'missing_official_close' }),
    );
  });

  it('P10 refuses to build without active fee rules instead of inventing them', async () => {
    afterClose();
    const { provider, database } = fixture();
    database.query.mockImplementation(async (sql: string) =>
      sql.includes('from symbols') ? [{ symbol: 'AAA' }] : [],
    );

    await expect(
      provider.buildSnapshot(SESSION, { openSymbols: [], universeSymbols: ['AAA'] }),
    ).rejects.toMatchObject({ response: { code: 'BOT_FEE_RULES_MISSING' } });
  });
});
