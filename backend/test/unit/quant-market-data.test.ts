import { describe, expect, it } from 'vitest';
import { QuantMarketDataAdapter } from '../../src/modules/quant/market-data.adapter.js';

describe('quant market data normalization', () => {
  it('rejects incomplete or impossible bars instead of fabricating OHLCV', async () => {
    const market = {
      ohlcv: async () => ({
        data: [
          { time: '2026-01-01', open: 10, high: 11, low: 9, close: 10, volume: 100 },
          { time: '2026-01-02', open: null, high: 11, low: 9, close: 10, volume: 100 },
          { time: '2026-01-03', open: 10, high: 8, low: 9, close: 10, volume: 100 },
          { time: '2026-01-04', open: 10, high: 11, low: 9, close: 10, volume: null },
        ],
        meta: {
          source: 'TEST',
          source_priority: 1,
          fallback_used: false,
          as_of: '2026-01-04',
          raw_endpoint: 'test',
        },
      }),
    };
    const result = await new QuantMarketDataAdapter(market as never).getHistoricalOhlcv(
      'AAA',
      '2026-01-01',
      '2026-01-04',
    );
    expect(result.records).toHaveLength(1);
    expect(result.skippedRows).toBe(3);
    expect(result.records[0]).toEqual({
      time: '2026-01-01',
      open: 10,
      high: 11,
      low: 9,
      close: 10,
      volume: 100,
    });
    expect(result.adjusted).toBe(false);
  });
});
