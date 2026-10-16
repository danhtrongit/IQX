import { mockFetch } from '@/test-utils/fetch';
import { changePct, fetchQuote, isValidSymbol, searchTradableSymbols } from '../api';

describe('market api', () => {
  it('adapts a price-board row and keeps missing values null', async () => {
    const { calls } = mockFetch(({ url }) =>
      url.includes('/market-data/trading/price-board')
        ? {
            body: {
              data: [
                {
                  symbol: 'FPT',
                  close_price: 57600,
                  reference_price: 57000,
                  ceiling_price: 60900,
                  floor_price: 53100,
                  high_price: 0,
                  low_price: null,
                  total_volume: '1200',
                  bid_prices: [{ price: 57500, volume: 100 }, { price: 0, volume: 5 }],
                  ask_prices: [],
                },
              ],
            },
          }
        : undefined,
    );
    const quote = await fetchQuote(' fpt ');
    expect(JSON.parse(calls[0].init.body)).toEqual({ symbols: ['FPT'] });
    expect(quote).toMatchObject({ symbol: 'FPT', price: 57600, reference: 57000, high: null, low: null, volume: 1200 });
    expect(quote?.bids).toEqual([{ price: 57500, volume: 100 }]);
    expect(changePct(quote)).toBeCloseTo(1.0526, 3);
  });

  it('returns null for an unknown ticker row', async () => {
    mockFetch(() => ({ body: [{ symbol: '', close_price: 0 }] }));
    await expect(fetchQuote('ZZZ')).resolves.toBeNull();
  });

  it('keeps only HOSE/HNX/UPCOM search results', async () => {
    const { calls } = mockFetch(() => ({
      body: {
        data: [
          { symbol: 'fpt', name: 'FPT Corp', exchange: 'HOSE', icbLv1: 'Công nghệ' },
          { symbol: 'XYZ', name: 'OTC', exchange: 'OTC' },
        ],
      },
    }));
    const results = await searchTradableSymbols('fp');
    expect(calls[0].url).toContain('asset_type=stock');
    expect(results).toEqual([{ symbol: 'FPT', name: 'FPT Corp', exchange: 'HOSE', industry: 'Công nghệ' }]);
  });

  it('validates symbols', () => {
    expect(isValidSymbol('fpt')).toBe(true);
    expect(isValidSymbol('F P')).toBe(false);
  });
});
