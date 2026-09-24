import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KbsMarketProvider,
  MarketDataService,
  MarketHttpTransport,
  MarketTransportError,
  VciMarketProvider,
  VndMarketProvider,
} from '../../src/modules/market-data/index.js';

afterEach(() => vi.unstubAllGlobals());

describe('MarketHttpTransport', () => {
  it('blocks arbitrary and insecure upstream origins before fetch', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const transport = new MarketHttpTransport();

    await expect(transport.requestJson('https://attacker.example/data')).rejects.toBeInstanceOf(
      MarketTransportError,
    );
    await expect(
      transport.requestJson('http://trading.vietcap.com.vn/api/data'),
    ).rejects.toBeInstanceOf(MarketTransportError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retries a bounded 5xx and then parses JSON', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetch);

    await expect(
      new MarketHttpTransport().requestJson(
        'https://trading.vietcap.com.vn/api/test',
        {},
        {
          retries: 1,
          timeoutMs: 2_000,
        },
      ),
    ).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent cache misses and serves the TTL cache', async () => {
    let resolveResponse: ((value: Response) => void) | undefined;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const transport = new MarketHttpTransport();
    const a = transport.requestJson(
      'https://trading.vietcap.com.vn/api/once',
      {},
      {
        cacheTtlMs: 10_000,
      },
    );
    const b = transport.requestJson(
      'https://trading.vietcap.com.vn/api/once',
      {},
      {
        cacheTtlMs: 10_000,
      },
    );
    await Promise.resolve();
    resolveResponse?.(Response.json({ value: 1 }));

    await expect(Promise.all([a, b])).resolves.toEqual([{ value: 1 }, { value: 1 }]);
    await expect(
      transport.requestJson(
        'https://trading.vietcap.com.vn/api/once',
        {},
        {
          cacheTtlMs: 10_000,
        },
      ),
    ).resolves.toEqual({ value: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('VCI normalization', () => {
  it('keeps only bars in the requested range and rejects unsupported intraday intervals', async () => {
    const http = {
      requestJson: vi.fn().mockResolvedValue([
        {
          t: ['2026-09-22', '2026-09-23', '2026-09-24'],
          o: [1, 2, 3],
          h: [1, 2, 3],
          l: [1, 2, 3],
          c: [1, 2, 3],
          v: [1, 2, 3],
        },
      ]),
    } as unknown as MarketHttpTransport;
    const provider = new VciMarketProvider(http);
    const start = Date.parse('2026-09-23') / 1000;
    const end = Date.parse('2026-09-24') / 1000;

    const result = await provider.fetchOhlcv('VCB', start, end, '1D');
    expect(result.data.map((bar) => bar.time)).toEqual(['2026-09-23']);
    await expect(provider.fetchOhlcv('VCB', start, end, '1m')).rejects.toBeInstanceOf(
      MarketTransportError,
    );
    expect(http.requestJson).toHaveBeenCalledTimes(1);
  });

  it('preserves absent prices as null instead of manufacturing zero', async () => {
    const http = {
      requestJson: vi.fn().mockResolvedValue([
        {
          listingInfo: { symbol: 'VCB', board: 'HSX', refPrice: null },
          matchPrice: { matchPrice: null, accumulatedValue: null },
          bidAsk: {},
        },
      ]),
    } as unknown as MarketHttpTransport;
    const result = await new VciMarketProvider(http).fetchPriceBoard(['VCB']);

    expect(result.data[0]).toMatchObject({
      symbol: 'VCB',
      exchange: 'HOSE',
      reference_price: null,
      close_price: null,
      total_value: null,
      price_change: null,
      percent_change: null,
    });
  });
});

describe('VND OHLCV request', () => {
  it('omits the Accept header rejected by the chart endpoint', async () => {
    const http = {
      requestJson: vi
        .fn()
        .mockResolvedValue({ t: [1790235900], o: [1], h: [2], l: [1], c: [2], v: [10] }),
    } as unknown as MarketHttpTransport;
    const result = await new VndMarketProvider(http).fetchOhlcv(
      'VNINDEX',
      1790208000,
      1790294400,
      '1m',
    );
    const [url, init] = vi.mocked(http.requestJson).mock.calls[0]!;

    expect(String(url)).toContain('resolution=1');
    expect(new Headers(init?.headers).has('Accept')).toBe(false);
    expect(result.data).toHaveLength(1);
  });
});

describe('MarketDataService compatible fallback', () => {
  it('includes the full requested end date in OHLCV upstream bounds', async () => {
    const vnd = {
      fetchOhlcv: vi.fn().mockResolvedValue({ data: [], rawEndpoint: 'vnd' }),
    } as unknown as VndMarketProvider;
    const service = new MarketDataService({} as VciMarketProvider, vnd, {} as KbsMarketProvider);

    await service.ohlcv('VCB', { interval: '1m', start: '2026-09-24', end: '2026-09-24' });
    expect(vnd.fetchOhlcv).toHaveBeenCalledWith(
      'VCB',
      Date.parse('2026-09-24') / 1000,
      Date.parse('2026-09-25') / 1000,
      '1m',
    );
  });

  it('rejects a start date after the inclusive end date before calling upstream', async () => {
    const vnd = { fetchOhlcv: vi.fn() };
    const service = new MarketDataService(
      {} as VciMarketProvider,
      vnd as unknown as VndMarketProvider,
      {} as KbsMarketProvider,
    );
    await expect(
      service.ohlcv('VCB', { interval: '1D', start: '2026-09-25', end: '2026-09-24' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_DATE_RANGE' } });
    expect(vnd.fetchOhlcv).not.toHaveBeenCalled();
  });

  it('falls back from VND to VCI for the same OHLCV contract', async () => {
    const vci = {
      fetchOhlcv: vi.fn().mockResolvedValue({
        data: [{ time: 1, open: 1, high: 2, low: 1, close: 2, volume: 10 }],
        rawEndpoint: 'vci',
      }),
    } as unknown as VciMarketProvider;
    const vnd = {
      fetchOhlcv: vi.fn().mockRejectedValue(new MarketTransportError('down')),
    } as unknown as VndMarketProvider;
    const service = new MarketDataService(vci, vnd, {} as KbsMarketProvider);

    const result = await service.ohlcv('VCB', { interval: '1D' });
    expect(result.data[0]).toEqual({
      time: 1,
      open: 1,
      high: 2,
      low: 1,
      close: 2,
      volume: 10,
    });
    expect(result.meta).toMatchObject({ source: 'VCI', source_priority: 2, fallback_used: true });
  });

  it('does not return a fabricated quote when upstream price is absent', async () => {
    const vci = {
      fetchPriceBoard: vi.fn().mockResolvedValue({ data: [{ symbol: 'VCB', close_price: null }] }),
    } as unknown as VciMarketProvider;
    const service = new MarketDataService(vci, {} as VndMarketProvider, {} as KbsMarketProvider);
    await expect(service.getQuote('VCB')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps exhausted upstream failures to 502', async () => {
    const vci = {
      fetchIndustries: vi.fn().mockRejectedValue(new MarketTransportError('down')),
    } as unknown as VciMarketProvider;
    const service = new MarketDataService(vci, {} as VndMarketProvider, {} as KbsMarketProvider);
    await expect(service.industries()).rejects.toBeInstanceOf(BadGatewayException);
  });
});
