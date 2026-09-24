import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.useRealTimers());

import { BotMarketSnapshotProvider } from '../../src/modules/market-integration/bot-market-snapshot.provider.js';
import { MarketHuntDataSource } from '../../src/modules/market-integration/market-hunt-data-source.js';
import { MarketInputSnapshotService } from '../../src/modules/market-integration/market-input-snapshot.service.js';

const envelope = (data: unknown) => ({
  data,
  meta: {
    source: 'VCI',
    source_priority: 1,
    fallback_used: false,
    as_of: '2026-01-02T10:00:00Z',
    raw_endpoint: 'fixture',
  },
});

describe('MarketHuntDataSource', () => {
  it('maps real OHLCV/value and does not turn missing value into zero', async () => {
    const market = {
      getOhlcv: vi.fn().mockResolvedValue(
        envelope([
          { time: '2026-01-01', open: 10, high: 12, low: 9, close: 11, volume: 100, value: 2 },
          { time: '2026-01-02', open: 11, high: 13, low: 10, close: 12, volume: 200 },
        ]),
      ),
    };
    const source = new MarketHuntDataSource(market as never, { current: vi.fn() } as never);

    const result = await source.dailyBarsThrough(['aaa'], 21, '2026-01-02');

    expect(market.getOhlcv).toHaveBeenCalledWith(
      'AAA',
      expect.objectContaining({ end: '2026-01-02', source: 'VCI' }),
    );
    expect(result.get('AAA')).toEqual([
      expect.objectContaining({ time: '2026-01-01', gtgdVnd: 2_000_000 }),
      expect.objectContaining({ time: '2026-01-02', gtgdVnd: null }),
    ]);
  });

  it('returns null only when every VCI flow request fails and omits incomplete symbols', async () => {
    const market = {
      foreignTrade: vi.fn(async (symbol: string) => {
        if (symbol === 'BBB') throw new Error('upstream');
        return envelope([
          { trading_date: '2026-01-01', foreign_buy_value: 30, foreign_sell_value: 10 },
          { trading_date: '2026-01-02', foreign_buy_value: 10, foreign_sell_value: 15 },
        ]);
      }),
    };
    const source = new MarketHuntDataSource(market as never, { current: vi.fn() } as never);

    const result = await source.netFlowThrough(['AAA', 'BBB'], 'ngoai', 2, '2026-01-02');

    expect(result).not.toBeNull();
    expect(result?.get('AAA')).toEqual([20, -5]);
    expect(result?.has('BBB')).toBe(false);
  });
});

describe('BotMarketSnapshotProvider', () => {
  it('uses only requested-session closes, exact DB fee rules and stored exact-session layers', async () => {
    const bars = Array.from({ length: 40 }, (_, index) => {
      const date = new Date('2025-11-24T00:00:00Z');
      date.setUTCDate(date.getUTCDate() + index);
      const base = 10_000 + index * 50;
      const close = index === 39 ? base * 1.08 : base;
      return {
        time: date.toISOString().slice(0, 10),
        open: base,
        high: close + 100,
        low: base - 100,
        close,
        volume: index === 39 ? 1_000_000 : 100_000,
        gtgdVnd: 2_000_000_000,
      };
    });
    const tradingDate = bars.at(-1)!.time;
    const database = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('from symbols')) return [{ symbol: 'AAA' }];
        if (sql.includes('from ai_insight_history')) {
          return [
            {
              symbol: 'AAA',
              session_date: tradingDate,
              payload: {
                L1: { statusLabel: 'Rất mạnh' },
                L2: { statusLabel: 'Tốt' },
                L3: { statusLabel: 'Hỗ trợ mạnh' },
                L4: { statusLabel: 'Trung tính' },
                L5: { statusLabel: 'Tích cực' },
              },
            },
          ];
        }
        if (sql.includes('from virtual_trading_configs')) {
          return [
            {
              id: 'fee-1',
              buy_fee_rate_bps: 15,
              sell_fee_rate_bps: 16,
              sell_tax_rate_bps: 10,
              board_lot_size: 100,
              updated_at: '2026-01-02T00:00:00Z',
            },
          ];
        }
        return [];
      }),
    };
    const hunt = {
      dailyBarsThrough: vi.fn().mockResolvedValue(new Map([['AAA', bars]])),
      netFlowThrough: vi.fn().mockResolvedValue(new Map([['AAA', [1, 2, 3, 4, 5]]])),
    };
    const market = {
      getOhlcv: vi.fn().mockResolvedValue(envelope([{ time: tradingDate, close: 1_250 }])),
    };
    const provider = new BotMarketSnapshotProvider(
      database as never,
      market as never,
      hunt as never,
      { current: vi.fn().mockResolvedValue(new Set<string>()) } as never,
    );

    const result = await provider.buildSnapshot(tradingDate, { openSymbols: ['AAA'] });

    expect(result.symbols.AAA).toMatchObject({
      close_is_official: true,
      close_vnd: String(Math.round(bars.at(-1)!.close)),
      security_status_verified: false,
      tradable_security_status: false,
    });
    expect(Object.keys(result.symbols.AAA!.layers ?? {})).toEqual([
      'ky_thuat',
      'dong_tien',
      'noi_bo',
      'tin_tuc',
      'dinh_gia',
    ]);
    expect(result.symbols.AAA?.l1_amplitude_source_ref).toContain(`:${tradingDate}:v1`);
    expect(result.fee_rules).toEqual({
      buy_fee_rate_bps: 15,
      sell_fee_rate_bps: 16,
      sell_tax_rate_bps: 10,
      board_lot_size: 100,
      source_ref: 'virtual_trading_configs:fee-1:2026-01-02T00:00:00Z',
    });
    expect(result.buy_inputs_complete).toBe(false);
    expect(hunt.dailyBarsThrough).toHaveBeenCalledWith(expect.any(Array), 40, tradingDate);
  });
});

describe('MarketInputSnapshotService', () => {
  it.each([false, true])(
    'persists only verified sources, including when current=%s',
    async (current) => {
      vi.useFakeTimers().setSystemTime(
        new Date(current ? '2026-01-02T16:30:00+07:00' : '2026-01-03T16:30:00+07:00'),
      );
      const inserted: unknown[][] = [];
      const recoveredImpact = {
        id: 'verified-impact-snapshot',
        captured_at: '2026-01-02T16:44:26+07:00',
        payload: {
          meta: { generated_for_date: '2026-01-02', input_hash: 'verified-hash' },
          point_contribution: {
            group: 'ALL',
            time_frame: 'ONE_DAY',
            top_up: [{ symbol: 'AAA', impact: 1.25 }],
            top_down: [{ symbol: 'BBB', impact: -0.75 }],
          },
          breadth: { advances: 999, declines: 1 },
          sectors: [{ icb_code: 9999, icb_change_percent: 99 }],
        },
        quality: {
          sources: [
            {
              source: 'index_impact',
              ok: true,
              verified_session: true,
              as_of: '2026-01-02',
              source_ref: 'VCI:index-impact',
            },
          ],
        },
      };
      const database = {
        query: vi.fn(async (sql: string, values?: readonly unknown[]) => {
          if (sql.includes('select id, payload, quality, captured_at'))
            return current ? [] : [recoveredImpact];
          if (sql.includes('insert into market_report_input_snapshots'))
            inserted.push([...(values ?? [])]);
          return [];
        }),
      };
      const indexRows = [
        {
          time: '2026-01-01',
          open: 1000,
          high: 1010,
          low: 990,
          close: 1000,
          volume: 10,
          value: 20,
        },
        {
          time: '2026-01-02',
          open: 1000,
          high: 1020,
          low: 995,
          close: 1010,
          volume: 12,
          value: 25,
        },
      ];
      const market = {
        getOhlcv: vi.fn(async (symbol: string) =>
          envelope(symbol === 'VNINDEX' ? indexRows : indexRows),
        ),
        events: vi.fn(),
      };
      const source = (data: unknown) => Promise.resolve({ data, sourceUrl: 'fixture' });
      const breadthRows = [
        { trading_date: '2026-01-01', count: 40, total: 100, percent: 0.4 },
        { trading_date: '2026-01-02', count: 45, total: 100, percent: 0.45 },
      ];
      const extended = {
        overview: {
          marketIndex: vi.fn().mockRejectedValue(new Error('upstream')),
          breadth: vi.fn(() => source(breadthRows)),
          indexImpact: vi.fn().mockRejectedValue(new Error('upstream')),
          foreign: vi.fn(() =>
            source([
              { trading_date: '2026-01-01', foreign_buy_value_vnd: 20, foreign_sell_value_vnd: 15 },
              { trading_date: '2026-01-02', foreign_buy_value_vnd: 30, foreign_sell_value_vnd: 10 },
            ]),
          ),
          foreignTop: vi.fn(() => source({ net_buy: [], net_sell: [] })),
          proprietary: vi.fn(() =>
            source([
              { trading_date: '2026-01-01', total_buy_value_vnd: 10, total_sell_value_vnd: 15 },
              { trading_date: '2026-01-02', total_buy_value_vnd: 20, total_sell_value_vnd: 15 },
            ]),
          ),
          proprietaryTop: vi.fn(() =>
            source({
              buy: [{ ticker: 'AAA', total_value_vnd: 2_000_000_000 }],
              sell: [],
              trading_date: '02/01/2026',
            }),
          ),
          sectorsAllocation: vi.fn().mockRejectedValue(new Error('upstream')),
        },
      };
      const service = new MarketInputSnapshotService(
        database as never,
        market as never,
        extended as never,
      );

      const result = await service.capture('daily', '2026-01-02');

      expect(result.complete).toBe(true);
      expect(result.payload.vnindex).toMatchObject({ close: 1010, change_pct: 1 });
      expect(result.payload.charts).toMatchObject({
        market_health_detail: {
          indicator_basis: 'EMA',
          pct_above_ema20: 45,
          pct_above_ema50: 45,
        },
        foreign_detail: { last_12_sessions: [0, 0] },
        prop_detail: { top_buy: [{ ticker: 'AAA', value: 2 }] },
        ...(current ? {} : { contribution: { top_positive: [{ ticker: 'AAA', points: 1.25 }] } }),
      });
      expect(result.quality).toMatchObject({ exact_index_session: true, complete: true });
      expect(inserted).toHaveLength(1);
      expect(inserted[0]?.at(-1)).toBe(true);
      const sources = result.quality.sources as Array<{ ok: boolean; verified_session: boolean }>;
      expect(sources.filter((row) => !row.ok).every((row) => !row.verified_session)).toBe(true);
      expect(result.quality.verified_source_count).toBe(current ? 7 : 8);
      if (!current) {
        expect(result.payload.breadth).toBeNull();
        expect(result.payload.sectors).toBeNull();
        expect(result.payload.meta).toMatchObject({
          chart_provenance: {
            point_contribution: {
              snapshot_id: 'verified-impact-snapshot',
              source_ref: 'VCI:index-impact',
            },
          },
        });
        expect(result.quality.recovered_sources).toEqual([
          expect.objectContaining({
            field: 'point_contribution',
            snapshot_id: 'verified-impact-snapshot',
          }),
        ]);
      }
      expect(extended.overview.breadth).toHaveBeenCalledTimes(2);
      expect(extended.overview.foreign).toHaveBeenCalledWith(
        expect.objectContaining({
          timeFrame: 'ONE_DAY',
          from: Math.floor(new Date('2025-11-23T00:00:00+07:00').getTime() / 1000),
        }),
      );
      expect(extended.overview.proprietary).toHaveBeenCalledWith('ALL', 'ONE_MONTH');
      if (!current) expect(extended.overview.marketIndex).not.toHaveBeenCalled();
    },
  );
});
