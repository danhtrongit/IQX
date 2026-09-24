import { describe, expect, it, vi } from 'vitest';

import { TradingService } from '../../src/modules/trading/trading.service.js';
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

function service(getQuote: (symbol: string) => Promise<TradingQuote>, positions = [position]) {
  return new TradingService(
    {
      getAccountByUser: vi.fn().mockResolvedValue(account),
      listPositions: vi.fn().mockResolvedValue(positions),
    } as never,
    { getQuote, validateSymbol: async () => true },
  );
}

describe('trading portfolio valuation', () => {
  it('includes available, reserved and pending cash in NAV', async () => {
    const result = await service(async (symbol) => quote(symbol, 90_000n)).getPortfolio('user');
    expect(result.nav_vnd).toBe(1_900_000);
    expect(result.total_market_value_vnd).toBe(900_000);
    expect(result.total_unrealized_pnl_vnd).toBe(100_000);
    expect(result.return_pct).toBe(-5);
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
});

function quote(symbol: string, priceVnd: bigint): TradingQuote {
  const timestamp = new Date();
  return { symbol, priceVnd, source: 'test', priceTime: timestamp, obtainedAt: timestamp };
}
