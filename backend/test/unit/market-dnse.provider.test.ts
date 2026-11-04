import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DNSE_CHART_BASE,
  DnseMarketProvider,
  MarketHttpTransport,
  MarketTransportError,
} from '../../src/modules/market-data/index.js';
import { MARKET_UPSTREAM_ORIGINS } from '../../src/modules/market-data/providers/http.transport.js';

afterEach(() => vi.unstubAllGlobals());

/** Trả lời đúng dạng của DNSE: các mảng song song t/o/h/l/c/v và nextTime. */
const chart = (rows: Array<[number, number, number, number, number, number]>) => ({
  t: rows.map((row) => row[0]),
  o: rows.map((row) => row[1]),
  h: rows.map((row) => row[2]),
  l: rows.map((row) => row[3]),
  c: rows.map((row) => row[4]),
  v: rows.map((row) => row[5]),
  nextTime: 0,
});

function setup(body: unknown = chart([])) {
  const fetch = vi.fn(async () => Response.json(body));
  vi.stubGlobal('fetch', fetch);
  return { fetch, provider: new DnseMarketProvider(new MarketHttpTransport()) };
}

const requestedUrl = (fetch: ReturnType<typeof vi.fn>, call = 0): URL =>
  fetch.mock.calls[call]![0] as URL;

describe('DnseMarketProvider (DNSE / Entrade chart API)', () => {
  it('nằm trong danh sách nguồn thị trường được phép gọi', () => {
    expect(DNSE_CHART_BASE).toBe('https://services.entrade.com.vn/chart-api/v2/ohlcs');
    expect(MARKET_UPSTREAM_ORIGINS.has(new URL(DNSE_CHART_BASE).origin)).toBe(true);
  });

  it('nến cổ phiếu: GET /stock?from&to&symbol&resolution=1D, mã viết hoa, đổi mảng song song thành danh sách nến', async () => {
    const { fetch, provider } = setup(
      chart([
        [1_710_720_000, 57.4, 58.15, 57.05, 57.6, 1_234_500],
        [1_710_806_400, 57.6, 58, 57.1, 57.2, 987_600],
      ]),
    );
    const result = await provider.fetchOhlcv('fpt', 1_700_000_000, 1_720_000_000);

    const url = requestedUrl(fetch);
    expect(`${url.origin}${url.pathname}`).toBe(`${DNSE_CHART_BASE}/stock`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      from: '1700000000',
      to: '1720000000',
      symbol: 'FPT',
      resolution: '1D',
    });
    expect(result.rawEndpoint).toBe(`${DNSE_CHART_BASE}/stock`);
    expect(result.data).toEqual([
      { time: 1_710_720_000, open: 57.4, high: 58.15, low: 57.05, close: 57.6, volume: 1_234_500 },
      { time: 1_710_806_400, open: 57.6, high: 58, low: 57.1, close: 57.2, volume: 987_600 },
    ]);
  });

  it('chỉ số: gọi /index và giữ nguyên điểm số', async () => {
    const { fetch, provider } = setup(chart([[1_710_720_000, 1_260.5, 1_270, 1_255, 1_268.2, 600_000_000]]));
    const result = await provider.fetchIndexOhlcv('VNINDEX', 0, 1_720_000_000);
    const url = requestedUrl(fetch);
    expect(url.pathname.endsWith('/index')).toBe(true);
    expect(url.searchParams.get('symbol')).toBe('VNINDEX');
    expect(result.data[0]).toMatchObject({ close: 1_268.2, volume: 600_000_000 });
  });

  it('toàn bộ lịch sử trong một lần gọi: from = 0, to = hôm nay + 1 ngày (hoặc mốc chỉ định)', async () => {
    const { fetch, provider } = setup();
    const before = Math.floor(Date.now() / 1000);
    await provider.fetchFullHistory('HPG');
    const url = requestedUrl(fetch);
    expect(url.searchParams.get('from')).toBe('0');
    const to = Number(url.searchParams.get('to'));
    expect(to).toBeGreaterThanOrEqual(before + 86_400 - 1);
    expect(to).toBeLessThanOrEqual(before + 86_400 + 5);

    await provider.fetchFullIndexHistory('VNINDEX', 1_730_000_000);
    expect(requestedUrl(fetch, 1).searchParams.get('to')).toBe('1730000000');
    expect(requestedUrl(fetch, 1).pathname.endsWith('/index')).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('không có nến (no_data, nextTime) trả danh sách rỗng; mảng thiếu phần tử được điền 0', async () => {
    const empty = setup({ s: 'no_data', nextTime: 1_700_000_000 });
    expect((await empty.provider.fetchFullHistory('FPT')).data).toEqual([]);

    const ragged = setup({ t: [1_710_720_000], o: [57.4], h: [58], l: [], c: [57.6] });
    expect((await ragged.provider.fetchOhlcv('FPT', 0, 1_720_000_000)).data).toEqual([
      { time: 1_710_720_000, open: 57.4, high: 58, low: 0, close: 57.6, volume: 0 },
    ]);
  });

  it('chỉ hỗ trợ khung 1D (đã kiểm chứng) và từ chối mã có ký tự lạ trước khi gọi mạng', async () => {
    const { fetch, provider } = setup();
    await expect(provider.fetchOhlcv('FPT', 0, 1, '1H')).rejects.toBeInstanceOf(MarketTransportError);
    await expect(provider.fetchIndexOhlcv('VNINDEX', 0, 1, '1W')).rejects.toBeInstanceOf(MarketTransportError);
    await expect(provider.fetchOhlcv('FPT&resolution=1m', 0, 1)).rejects.toBeInstanceOf(MarketTransportError);
    await expect(provider.fetchOhlcv('', 0, 1)).rejects.toBeInstanceOf(MarketTransportError);
    await expect(provider.fetchOhlcv('A'.repeat(17), 0, 1)).rejects.toBeInstanceOf(MarketTransportError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lỗi HTTP của nguồn thành MarketTransportError (không nuốt lỗi)', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetch);
    await expect(
      new DnseMarketProvider(new MarketHttpTransport()).fetchFullHistory('XXX'),
    ).rejects.toBeInstanceOf(MarketTransportError);
  });

  it('không dùng bộ nhớ đệm chung của transport: hai lần gọi cùng URL gọi mạng hai lần', async () => {
    const { fetch, provider } = setup(chart([[1_710_720_000, 1, 1, 1, 1, 1]]));
    await provider.fetchOhlcv('FPT', 0, 1_720_000_000);
    await provider.fetchOhlcv('FPT', 0, 1_720_000_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
