import { afterEach, describe, expect, it, vi } from 'vitest';

import { HuntEngine } from '../../src/modules/journey/cap5/hunt.engine.js';
import type { HuntDataSource, HuntFilter } from '../../src/modules/journey/cap5/cap5.types.js';
import { BotMarketSnapshotProvider } from '../../src/modules/market-integration/bot-market-snapshot.provider.js';

afterEach(() => vi.useRealTimers());

const feeRow = {
  id: 'fee-1',
  buy_fee_rate_bps: 10,
  sell_fee_rate_bps: 10,
  sell_tax_rate_bps: 10,
  board_lot_size: 100,
  updated_at: '2026-01-02T00:00:00Z',
};

function flatBars() {
  return Array.from({ length: 21 }, (_, index) => {
    const date = new Date('2025-12-13T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + index);
    return {
      time: date.toISOString().slice(0, 10),
      open: 10_000,
      high: 10_000,
      low: 10_000,
      close: 10_000,
      volume: 100_000,
      gtgdVnd: 2_000_000_000,
    };
  });
}

function rangedBars() {
  return flatBars().map((bar) => ({ ...bar, high: 10_100, low: 9_900 }));
}

function volumeBreakoutBars() {
  return flatBars().map((bar, index) => ({ ...bar, volume: index === 20 ? 200_000 : 100_000 }));
}

function fixture(bulkBars = flatBars()) {
  const huntBars = flatBars();
  const database = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('from symbols')) return [{ symbol: 'AAA' }];
      if (sql.includes('from virtual_trading_configs')) return [feeRow];
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
  const hunt = {
    dailyBarsThrough: vi.fn(
      async (_symbols: readonly string[], candleCount: number) =>
        new Map([['AAA', candleCount === 21 ? huntBars : bulkBars]]),
    ),
    netFlowThrough: vi.fn(async () => new Map([['AAA', [1, 1, 1, 1, 1]]])),
  };
  const provider = new BotMarketSnapshotProvider(
    database as never,
    { getOhlcv: vi.fn().mockResolvedValue({ data: [] }) } as never,
    hunt as never,
    { current: vi.fn().mockResolvedValue(new Set<string>()) } as never,
  );
  return { database, provider };
}

describe('BotMarketSnapshotProvider academy activation', () => {
  it('C01 removes the AI-layer query and leaves layer evidence empty', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-01-02T19:00:00+07:00'));
    const { database, provider } = fixture();

    const result = await provider.buildSnapshot('2026-01-02', { openSymbols: [] });

    expect(result.symbols.AAA?.filter_ids).toEqual(['khoi_ngoai_gom', 'tu_doanh_gom']);
    expect(result.symbols.AAA?.layers).toEqual({});
    expect(
      database.query.mock.calls.some(([sql]) => String(sql).includes('ai_insight_history')),
    ).toBe(false);
  });

  it('E03 keeps shared buy inputs complete when one candidate has no valid L1', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-01-02T19:00:00+07:00'));
    const { provider } = fixture();

    const result = await provider.buildSnapshot('2026-01-02', { openSymbols: [] });

    expect(result.symbols.AAA?.l1_amplitude_vnd).toBeNull();
    expect(result.buy_inputs_complete).toBe(true);
    expect(result.issues).not.toContainEqual(
      expect.objectContaining({ code: 'invalid_or_missing_l1_amplitude', symbol: 'AAA' }),
    );
  });

  it('E03 keeps shared buy inputs complete when one candidate lacks an exact close', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-01-02T19:00:00+07:00'));
    const staleBars = flatBars().slice(0, -1);
    const { provider } = fixture(staleBars);

    const result = await provider.buildSnapshot('2026-01-02', { openSymbols: [] });

    expect((result.symbols.AAA?.filter_ids ?? []).length).toBeGreaterThan(0);
    expect(result.symbols.AAA?.close_is_official).toBe(false);
    expect(result.buy_inputs_complete).toBe(true);
    expect(result.issues).not.toContainEqual(
      expect.objectContaining({ code: 'missing_official_close', symbol: 'AAA' }),
    );
  });

  it('D01 exposes the L1 source session and VND/share unit for position evidence', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-01-02T19:00:00+07:00'));
    const { provider } = fixture(rangedBars());

    const result = await provider.buildSnapshot('2026-01-02', { openSymbols: [] });

    expect(result.symbols.AAA?.l1_amplitude_vnd).toBe(200);
    expect(result.symbols.AAA?.source_refs).toMatchObject({
      l1_amplitude: {
        session: '2026-01-02',
        unit: 'VND/share',
        basis: 'ATR(14), true range, VCI unadjusted daily OHLCV',
      },
    });
  });
});

describe('Bot candidate Hunt policy', () => {
  it.each(['ngoai', 'tudoanh'] as const)(
    'C05 %s keeps 3/5-session positive-flow semantics and requires a positive total',
    async (filter) => {
      const symbols = ['AAA', 'BBB', 'CCC'];
      const bars = new Map(symbols.map((symbol) => [symbol, flatBars()]));
      const flows = new Map([
        ['AAA', [10, 10, 10, -1, -1]],
        ['BBB', [10, 10, -1, -1, -1]],
        ['CCC', [1, 1, 1, -5, -5]],
      ]);
      const source: HuntDataSource = {
        dailyBars: vi.fn(async () => bars),
        netFlow: vi.fn(async (_symbols, side) => (side === filter ? flows : null)),
        restrictedSymbols: vi.fn(async () => new Set<string>()),
      };

      const result = await new HuntEngine(source).run(filter, symbols);

      expect(result.complete).toBe(true);
      expect(result.matchedCount).toBe(1);
      expect(result.items.map((item) => item.symbol)).toEqual(['AAA']);
      expect(result.items[0]?.tin_hieu).toContain('3/5 phiên');
    },
  );

  it('C06 applies top 10 per filter and breaks equal ranks by symbol ascending', async () => {
    const symbols = Array.from({ length: 12 }, (_, index) => `S${String(index).padStart(2, '0')}`);
    const bars = new Map(symbols.map((symbol) => [symbol, volumeBreakoutBars()]));
    const source: HuntDataSource = {
      dailyBars: vi.fn(async () => bars),
      netFlow: vi.fn(async (_symbols, _side: Extract<HuntFilter, 'ngoai' | 'tudoanh'>) => null),
      restrictedSymbols: vi.fn(async () => new Set<string>()),
    };

    const result = await new HuntEngine(source).run('kl', [...symbols].reverse());

    expect(result.complete).toBe(true);
    expect(result.matchedCount).toBe(12);
    expect(result.items.map((item) => item.symbol)).toEqual(symbols.slice(0, 10));
  });
});
