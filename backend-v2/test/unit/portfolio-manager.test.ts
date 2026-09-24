import { describe, expect, it } from 'vitest';
import {
  buildAnalysis,
  dailyReturns,
  maxDrawdown,
} from '../../src/modules/portfolio-manager/portfolio.math.js';
import type {
  PortfolioHolding,
  PortfolioInput,
  PortfolioPricePoint,
} from '../../src/modules/portfolio-manager/portfolio.types.js';

function history(
  values: number[],
  dates = ['2026-06-16', '2026-06-17', '2026-06-18'],
): PortfolioPricePoint[] {
  return values.map((close, index) => ({
    date: dates[index]!,
    timestampMs: Date.parse(`${dates[index]}T00:00:00.000Z`),
    close,
    volume: 1,
  }));
}

function holding(overrides: Partial<PortfolioHolding> = {}): PortfolioHolding {
  return {
    ticker: 'AAA',
    quantity: 10,
    avgCostVnd: 100n,
    currentPriceVnd: 120n,
    marketValueVnd: 1200n,
    unrealizedPnlVnd: 200n,
    costBasisVnd: 1000n,
    sector: 'Bank',
    priceHistory: history([100, 110, 120]),
    priceSource: 'symbol_snapshot',
    priceAsOf: '2026-06-18T00:00:00.000Z',
    priceAgeDays: 0,
    priceStale: false,
    pe: 10,
    pb: 1,
    roe: 0.2,
    fundamentalsSource: 'fixture',
    ...overrides,
  };
}

function input(overrides: Partial<PortfolioInput> = {}): PortfolioInput {
  return {
    accountId: 'acct-1',
    navVnd: 1300n,
    cashVnd: 100n,
    cashAvailableVnd: 40n,
    cashReservedVnd: 50n,
    cashPendingVnd: 10n,
    asOf: '2026-06-18',
    benchmarkHistory: history([100, 105, 110]),
    trades: [],
    holdings: [holding()],
    ...overrides,
  };
}

function object(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('portfolio manager quant layers', () => {
  it('calculates returns and drawdown without random values', () => {
    expect(dailyReturns([100, 110, 99])).toEqual([0.1, -0.1]);
    expect(maxDrawdown([100, 120, 90])).toBe(-0.25);
  });

  it('includes every cash bucket in NAV and exposes date-aligned risk metrics', () => {
    const analysis = buildAnalysis(input());
    const overview = object(analysis.overview);
    const risk = object(analysis.risk);
    expect(overview.nav).toBe('1300');
    expect(overview.cash).toEqual({ available: '40', reserved: '50', pending: '10', total: '100' });
    expect(object(analysis.performance).portfolio_return).toBe(0.185);
    expect(risk.beta).not.toBeNull();
    expect(object(risk.data_quality).benchmark_aligned_observations).toBe(3);
    expect(object(analysis.scores).overall).toBeNull();
  });

  it('does not fabricate benchmark, risk, or score values when price history is missing', () => {
    const analysis = buildAnalysis(
      input({
        benchmarkHistory: [],
        holdings: [holding({ priceHistory: [], marketValueVnd: 1000n, currentPriceVnd: 100n })],
        navVnd: 1000n,
        cashVnd: 0n,
        cashAvailableVnd: 0n,
        cashReservedVnd: 0n,
        cashPendingVnd: 0n,
      }),
    );
    const performance = object(analysis.performance);
    const risk = object(analysis.risk);
    const scores = object(analysis.scores);
    expect(performance.portfolio_return).toBeNull();
    expect(performance.benchmark_return).toBeNull();
    expect(risk.beta).toBeNull();
    expect(risk.volatility).toBeNull();
    expect(risk.max_drawdown).toBeNull();
    expect(scores.overall).toBeNull();
  });

  it('requires complete aligned histories for all holdings instead of silently omitting one', () => {
    const incomplete = holding({
      ticker: 'BBB',
      priceHistory: history([100, 99], ['2026-06-17', '2026-06-18']),
      marketValueVnd: 100n,
    });
    const analysis = buildAnalysis(input({ holdings: [holding(), incomplete], navVnd: 1400n }));
    const performance = object(analysis.performance);
    const risk = object(analysis.risk);
    expect(performance.portfolio_return).toBeNull();
    expect(risk.volatility).toBeNull();
    expect(object(risk.data_quality).complete).toBe(false);
    expect(object(risk.data_quality).missing_history).toContain('BBB');
  });

  it('leaves discipline null without closed-lot evidence and scores only evidence-backed behavior', () => {
    const withoutTrades = buildAnalysis(
      input({ holdings: [holding({ unrealizedPnlVnd: -400n })] }),
    );
    expect(object(withoutTrades.behavior).losing_count).toBe(1);
    expect(object(object(withoutTrades.scores).pillars).discipline).toBeNull();

    const closed = buildAnalysis(
      input({
        trades: [
          {
            symbol: 'AAA',
            side: 'buy',
            quantity: 1,
            priceVnd: 100n,
            tradedAt: new Date('2026-01-01'),
          },
          {
            symbol: 'AAA',
            side: 'sell',
            quantity: 1,
            priceVnd: 110n,
            tradedAt: new Date('2026-01-02'),
          },
          {
            symbol: 'AAA',
            side: 'buy',
            quantity: 1,
            priceVnd: 100n,
            tradedAt: new Date('2026-01-01'),
          },
          {
            symbol: 'AAA',
            side: 'sell',
            quantity: 1,
            priceVnd: 90n,
            tradedAt: new Date('2026-01-20'),
          },
        ],
      }),
    );
    expect(object(object(closed.behavior).evidence).evaluated).toBe(true);
    expect(object(object(closed.scores).pillars).discipline).toBe(2);
  });
});
