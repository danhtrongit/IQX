import { describe, expect, it, vi } from 'vitest';

import {
  DEMO_PROFIT_BASE_VND,
  TradingService,
  demoProfitVnd,
  demoReturnPct,
} from '../../src/modules/trading/trading.service.js';
import type {
  TradingAccount,
  TradingPosition,
  TradingQuote,
} from '../../src/modules/trading/trading.types.js';

const now = new Date();
const account: TradingAccount = {
  id: 'account',
  userId: 'user',
  status: 'active',
  initialCashVnd: 2_000_000n,
  cashAvailableVnd: 700_000n,
  cashReservedVnd: 200_000n,
  cashPendingVnd: 100_000n,
  netDepositedCashVnd: 2_000_000n,
  activatedAt: now,
  resetAt: null,
  frozenAt: null,
  createdAt: now,
  updatedAt: now,
};
const position: TradingPosition = {
  id: 'position',
  accountId: 'account',
  symbol: 'VCB',
  quantityTotal: 10,
  quantitySellable: 10,
  quantityPending: 0,
  quantityReserved: 0,
  avgCostVnd: 80_000n,
  activePlanBuyOrderId: null,
  activeOriginalStopVnd: null,
  activeOriginalTakeProfitVnd: null,
  activeDynamicStopVnd: null,
};

function service(
  getQuote: (symbol: string) => Promise<TradingQuote>,
  positions = [position],
  accountOverride: TradingAccount = account,
) {
  return new TradingService(
    {
      getAccountByUser: vi.fn().mockResolvedValue(accountOverride),
      listPositions: vi.fn().mockResolvedValue(positions),
    } as never,
    { getQuote, validateSymbol: async () => true },
    { pendingTotals: vi.fn().mockResolvedValue(new Map()) } as never,
  );
}

describe('trading portfolio valuation', () => {
  it('includes available, reserved and pending cash in NAV', async () => {
    const result = await service(async (symbol) => quote(symbol, 90_000n)).getPortfolio('user');
    expect(result.nav_vnd).toBe(1_900_000);
    expect(result.total_market_value_vnd).toBe(900_000);
    expect(result.total_unrealized_pnl_vnd).toBe(100_000);
    expect(result.return_pct).toBe(-98.1);
  });

  it('does not publish cash-only NAV when a holding cannot be valued', async () => {
    await expect(
      service(async () => {
        throw new Error('provider down');
      }).getPortfolio('user'),
    ).rejects.toMatchObject({ status: 503, response: { code: 'PORTFOLIO_PRICE_UNAVAILABLE' } });
  });

  it('rejects non-positive holding prices', async () => {
    await expect(
      service(async (symbol) => quote(symbol, 0n)).getPortfolio('user'),
    ).rejects.toMatchObject({ status: 503, response: { code: 'PORTFOLIO_PRICE_UNAVAILABLE' } });
  });

  it('values an empty portfolio without requiring market data', async () => {
    let quotes = 0;
    const getQuote = async (symbol: string) => {
      quotes += 1;
      return quote(symbol, 90_000n);
    };
    const result = await service(getQuote, []).getPortfolio('user');
    expect(result.nav_vnd).toBe(1_000_000);
    expect(quotes).toBe(0);
  });

  it('measures the Demo profit against the fixed 100.000.000 VND, never the net deposit', async () => {
    const rich: TradingAccount = {
      ...account,
      initialCashVnd: 100_000_000n,
      cashAvailableVnd: 110_000_000n,
      cashReservedVnd: 0n,
      cashPendingVnd: 0n,
      // A legacy net deposit must not change the base any more.
      netDepositedCashVnd: 1_000_000n,
    };
    const result = await service(async () => quote('VCB', 90_000n), [], rich).getPortfolio('user');
    expect(result.nav_vnd).toBe(110_000_000);
    expect(result.return_pct).toBe(10);
  });

  it('counts an account below 100.000.000 VND as a loss, even with no net deposit', async () => {
    const empty: TradingAccount = {
      ...account,
      initialCashVnd: 0n,
      cashAvailableVnd: 0n,
      cashReservedVnd: 0n,
      cashPendingVnd: 0n,
      netDepositedCashVnd: 0n,
    };
    const result = await service(async () => quote('VCB', 90_000n), [], empty).getPortfolio('user');
    expect(result.return_pct).toBe(-100);
  });

  it('computes (equity − 100.000.000) / 100.000.000 with 2 decimals', () => {
    expect(DEMO_PROFIT_BASE_VND).toBe(100_000_000n);
    expect(demoProfitVnd(100_000_000n)).toBe(0n);
    expect(demoReturnPct(100_000_000n)).toBe(0);
    expect(demoReturnPct(112_345_678n)).toBe(12.35);
    expect(demoReturnPct(95_000_000n)).toBe(-5);
    expect(demoProfitVnd(95_000_000n)).toBe(-5_000_000n);
  });
});

function quote(symbol: string, priceVnd: bigint): TradingQuote {
  const timestamp = new Date();
  return { symbol, priceVnd, source: 'test', priceTime: timestamp, obtainedAt: timestamp };
}
