import { describe, expect, it } from 'vitest';
import { buildReportVisuals } from '../../src/modules/reports/report-visuals.js';

describe('deterministic report visuals', () => {
  it('normalizes snapshot values into legacy chart units without relabeling EMA as MA', () => {
    const result = buildReportVisuals(
      {
        breadth: { advances: 30, declines: 10, unchanged: 5, ceiling: 2, floor: 1 },
        meta: { generated_for_date: '2026-01-02' },
        market_health: {
          ema20: [
            { count: 40, total: 100, percent: 0.4 },
            { count: 45, total: 100, percent: 0.45 },
          ],
          ema50: [{ count: 50, total: 100, percent: 0.5 }],
        },
        point_contribution: {
          top_up: [{ symbol: 'AAA', impact: 1.2 }],
          top_down: [{ symbol: 'BBB', impact: -0.7 }],
        },
        foreign_flow: {
          buy_value_vnd_billion: 120,
          sell_value_vnd_billion: 80,
          trading_date: '2026-01-02',
          top_verified: true,
          top: { net_buy: [{ symbol: 'AAA', net_value_vnd: 2_000_000_000 }] },
        },
        chart_sources: {
          foreign_history: [
            { foreign_buy_value_vnd: 120_000_000_000, foreign_sell_value_vnd: 80_000_000_000 },
          ],
        },
        prop_trading: {
          buy_value_vnd_billion: 10,
          sell_value_vnd_billion: 8,
          net_value_vnd_billion: 2,
        },
        sectors: [{ icb_code: 10, icb_change_percent: 1.2 }],
        vnindex: { value: 1200, change_points: 2, change_pct: 0.17 },
        volume: { total_value_vnd_billion: 1000, ma20_value_vnd_billion: 800, ratio_vs_ma20: 1.25 },
      },
      'daily',
    );
    expect(result.charts).toMatchObject({
      breadth: { up: 30, down: 10, pct_above_ma20: null },
      contribution: { top_positive: [{ ticker: 'AAA', points: 1.2 }] },
      foreign_detail: {
        total_buy_vnd_billion: 120,
        top_buy: [{ ticker: 'AAA', value: 2 }],
      },
      market_health_detail: {
        indicator_basis: 'EMA',
        pct_above_ema20: 45,
        pct_above_ma20: null,
      },
      sector_rotation: { sectors_today: [{ name: 'ICB 10', pct: 1.2 }] },
    });
    expect(result.pulse).toBeNull();
  });

  it('sorts and bounds histories while preserving gaps and zero breadth truthfully', () => {
    const result = buildReportVisuals(
      {
        meta: { generated_for_date: '2026-01-03' },
        breadth: { advances: 0, declines: 10, unchanged: 2, ceiling: 0, floor: 1 },
        market_health: {
          ema20: [
            { count: 45, total: 100, percent: 45 },
            { count: 46, total: 100, percent: 0.46 },
          ],
        },
        foreign_flow: { trading_date: '2026-01-03', top_verified: false },
        chart_sources: {
          foreign_history: [
            { trading_date: '2026-01-03', foreign_buy_value_vnd: 5e9, foreign_sell_value_vnd: 5e9 },
            { trading_date: '2026-01-05', foreign_buy_value_vnd: 9e9, foreign_sell_value_vnd: 1e9 },
            { trading_date: '2026-01-01', foreign_buy_value_vnd: 2e9, foreign_sell_value_vnd: 1e9 },
            {
              trading_date: '2026-01-02',
              foreign_buy_value_vnd: null,
              foreign_sell_value_vnd: 1e9,
            },
          ],
        },
      },
      'daily',
    );
    expect(result.charts).toMatchObject({
      breadth: { ratio_up_down: '0 : 10' },
      foreign_detail: {
        streak: { count: 0, direction: 'mixed', last_5d_cumulative: null },
        last_12_sessions: [0],
        top_buy: [],
      },
      market_health_detail: { trend_ema20_20d: [45, 46] },
    });
  });

  it('emits unavailable midday tiers instead of filling missing sources with zero', () => {
    const result = buildReportVisuals({ vnindex: {}, breadth: null }, 'midday');
    expect(result.charts).toMatchObject({
      breadth: { data_state: 'unavailable' },
      market_health_detail: { data_state: 'unavailable' },
      sector_rotation: { data_state: 'unavailable' },
    });
    expect(result.pulse).toMatchObject({
      vn_index: { value: null, change: null, change_pct: null, sparkline: [] },
      foreign_net_billion: null,
    });
  });

  it('treats a zero-flow session as a streak boundary', () => {
    const result = buildReportVisuals(
      {
        meta: { generated_for_date: '2026-01-03' },
        foreign_flow: { trading_date: '2026-01-03', top_verified: false },
        chart_sources: {
          foreign_history: [
            { trading_date: '2026-01-01', foreign_buy_value_vnd: 1e9, foreign_sell_value_vnd: 2e9 },
            { trading_date: '2026-01-02', foreign_buy_value_vnd: 1e9, foreign_sell_value_vnd: 1e9 },
            { trading_date: '2026-01-03', foreign_buy_value_vnd: 1e9, foreign_sell_value_vnd: 2e9 },
          ],
        },
      },
      'daily',
    );
    expect(result.charts).toMatchObject({
      foreign_detail: { streak: { count: 1, direction: 'sell' } },
    });
  });
});
