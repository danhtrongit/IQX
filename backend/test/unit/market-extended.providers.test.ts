import { describe, expect, it, vi } from 'vitest';
import { MarketHttpClient } from '../../src/modules/market-extended/market-http.client.js';
import { CommoditySheetsNewsProvider } from '../../src/modules/market-extended/commodity-sheets-news.provider.js';
import { VietcapOverviewProvider } from '../../src/modules/market-extended/vietcap-overview.provider.js';
import { GlobalMarketProvider } from '../../src/modules/market-extended/global-market.provider.js';

function response(value: unknown, contentType = 'application/json') {
  return new Response(typeof value === 'string' ? value : JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': contentType },
  });
}

describe('market extended upstream adapters', () => {
  it('normalizes Vietcap liquidity and preserves bounded request body', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        response([
          { symbol: ['ALL'], t: [1], accumulatedVolume: ['2.5'], accumulatedValue: ['3.1'] },
        ]),
      );
    const provider = new VietcapOverviewProvider(new MarketHttpClient());
    const result = await provider.liquidity({
      symbols: 'ALL',
      timeFrame: 'ONE_DAY',
      from: 1,
      to: 2,
    });
    expect(result.data).toEqual([
      {
        symbols: ['ALL'],
        timestamps: [1],
        accumulated_volume: [2],
        accumulated_value_million_vnd: [3.1],
        min_batch_trunc_time: null,
      },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ from: 1, to: 2, symbols: ['ALL'], timeFrame: 'ONE_DAY' }),
      }),
    );
    fetch.mockRestore();
  });

  it('normalizes public sheets CSV without inventing values', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response('KỲ HẠN,TODAY,YESTERDAY,CHÊNH LỆNH %\nON,5,4,1', 'text/csv'),
    );
    const result = await new CommoditySheetsNewsProvider(new MarketHttpClient()).sheet('VND');
    expect(result.data).toEqual([
      {
        tenor: 'ON',
        today: '5',
        yesterday: '4',
        change: '1',
        todayNumeric: 5,
        yesterdayNumeric: 4,
        changeNumeric: 1,
      },
    ]);
    vi.restoreAllMocks();
  });

  it('does not mix Binance OHLC units with a VND fallback', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response([[0, '1', '2', '0.5', '1.5', '10']]));
    const result = await new GlobalMarketProvider(new MarketHttpClient()).cryptoOhlc(
      'BTCUSDT',
      '1d',
      1,
    );
    expect(result.data).toEqual([
      { time: '1970-01-01', timestamp: 0, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockRestore();
  });
});
