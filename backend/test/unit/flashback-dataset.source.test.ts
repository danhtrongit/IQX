import { describe, expect, it, vi } from 'vitest';

import { MarketFlashbackDatasetSource } from '../../src/modules/flashback/flashback-dataset.source.js';
import type { DnseMarketProvider, MarketDataService } from '../../src/modules/market-data/index.js';
import type { IndexMembershipProvider } from '../../src/modules/market-integration/index.js';
import { weekdaysFrom } from './helpers/flashback-dataset-fixtures.js';

/** Dấu thời gian giữa trưa giờ Việt Nam: đổi ra đúng ngày giao dịch ở mọi múi giờ. */
const seconds = (date: string) => Date.parse(`${date}T05:00:00Z`) / 1000;
const dnseRow = (date: string, close = 57.6) => ({
  time: seconds(date),
  open: close,
  high: close,
  low: close,
  close,
  volume: 1_000,
});
const vciRow = (date: string, close = 57_600) => ({
  time: seconds(date),
  open: close,
  high: close,
  low: close,
  close,
  volume: 1_000,
});
const vciDate = (row: { time: number }) => new Date(row.time * 1000).toISOString().slice(0, 10);

interface Fakes {
  dnseHistory?: () => Promise<{ data: unknown[] }>;
  dnseIndex?: () => Promise<{ data: unknown[] }>;
  vciRows?: Array<{ time: number }>;
  vciError?: Error;
  tradingHistory?: (symbol: string, options: Record<string, unknown>) => Promise<{ data: unknown[] }>;
}

function setup(fakes: Fakes = {}) {
  const dnse = {
    fetchFullHistory: vi.fn(fakes.dnseHistory ?? (async () => ({ data: [] }))),
    fetchFullIndexHistory: vi.fn(fakes.dnseIndex ?? (async () => ({ data: [] }))),
  };
  // VCI trả tối đa 1.000 nến mới nhất không muộn hơn `end` (đã gồm cả ngày `end`).
  const ohlcv = vi.fn(async (_symbol: string, query: { start?: string; end?: string }) => {
    if (fakes.vciError) throw fakes.vciError;
    const rows = (fakes.vciRows ?? []).filter(
      (row) => vciDate(row) <= (query.end ?? '9999') && vciDate(row) >= (query.start ?? '0000'),
    );
    return { data: rows.slice(-1_000) };
  });
  const fetchTradingHistory = vi.fn(
    fakes.tradingHistory ?? (async () => ({ data: [] as unknown[] })),
  );
  const fetchCurrent = vi.fn(async (code: string) => ({
    symbols: ['AAA', 'BBB'],
    source: `VCI:${code}`,
  }));
  const source = new MarketFlashbackDatasetSource(
    dnse as unknown as DnseMarketProvider,
    { ohlcv, vci: { fetchTradingHistory } } as unknown as MarketDataService,
    { fetchCurrent } as unknown as IndexMembershipProvider,
  );
  return { source, dnse, ohlcv, fetchTradingHistory, fetchCurrent };
}

describe('MarketFlashbackDatasetSource.basket', () => {
  it('lấy rổ từ nguồn thị trường (không nhập tay)', async () => {
    const { source, fetchCurrent } = setup();
    expect(await source.basket('VN100')).toEqual({ symbols: ['AAA', 'BBB'], source: 'VCI:VN100' });
    expect(fetchCurrent).toHaveBeenCalledWith('VN100');
  });
});

describe('MarketFlashbackDatasetSource.history · DNSE là nguồn chính, VCI dự phòng', () => {
  const dates = weekdaysFrom('2014-01-06', 400);

  it('mặc định dùng DNSE: giá nghìn đồng nhân 1.000, bỏ phiên từ hôm nay trở đi, không gọi VCI', async () => {
    const { source, dnse, ohlcv } = setup({
      dnseHistory: async () => ({ data: [...dates.map((date) => dnseRow(date)), dnseRow('2026-11-04', 60)] }),
    });
    const history = await source.history('FPT', '2026-11-04');
    expect(history.source).toBe('DNSE:x1000:adjusted');
    expect(history.rows).toHaveLength(400);
    expect(history.rows[0]).toEqual({
      date: '2014-01-06',
      open: 57_600,
      high: 57_600,
      low: 57_600,
      close: 57_600,
      volume: 1_000,
    });
    expect(dnse.fetchFullHistory).toHaveBeenCalledWith('FPT');
    expect(ohlcv).not.toHaveBeenCalled();
  });

  it('DNSE lỗi: dùng VCI (giá đồng, không nhân), nguồn ghi VCI', async () => {
    const vciRows = dates.map((date) => vciRow(date));
    const { source, ohlcv } = setup({
      dnseHistory: async () => {
        throw new Error('DNSE HTTP 503');
      },
      vciRows,
    });
    const history = await source.history('FPT', '2026-11-04');
    expect(history.source).toBe('VCI:dong:adjusted');
    expect(history.rows).toHaveLength(400);
    expect(history.rows[0]!.close).toBe(57_600);
    expect(ohlcv).toHaveBeenCalledWith(
      'FPT',
      expect.objectContaining({ interval: '1D', source: 'VCI' }),
    );
  });

  it('DNSE không trả nến nào của mã: dùng VCI', async () => {
    const { source } = setup({ dnseHistory: async () => ({ data: [] }), vciRows: dates.map((date) => vciRow(date)) });
    expect((await source.history('FPT', '2026-11-04')).source).toBe('VCI:dong:adjusted');
  });

  it('DNSE trả giá sai đơn vị (đã là đồng nên nhân 1.000 vượt 1.000.000đ): coi như lỗi và dùng VCI', async () => {
    const { source } = setup({
      dnseHistory: async () => ({ data: dates.map((date) => dnseRow(date, 57_600)) }),
      vciRows: dates.map((date) => vciRow(date)),
    });
    const history = await source.history('FPT', '2026-11-04');
    expect(history.source).toBe('VCI:dong:adjusted');
    expect(history.rows[0]!.close).toBe(57_600);
  });

  it('thứ tự nguồn đổi được: VCI trước thì không gọi DNSE, lịch sử VCI có thể trước 2012', async () => {
    const early = weekdaysFrom('2007-01-01', 2_600);
    const { source, dnse } = setup({ vciRows: early.map((date) => vciRow(date)) });
    const history = await source.history('FPT', '2026-11-04', ['VCI', 'DNSE']);
    expect(history.source).toBe('VCI:dong:adjusted');
    expect(history.rows).toHaveLength(2_600);
    expect(history.rows[0]!.date).toBe('2007-01-01');
    expect(history.rows.at(-1)!.date).toBe(early.at(-1));
    expect(dnse.fetchFullHistory).not.toHaveBeenCalled();
  });

  it('VCI phân trang lùi 1.000 nến một trang tới hết lịch sử', async () => {
    const early = weekdaysFrom('2014-01-06', 2_500);
    const { source, ohlcv } = setup({ vciRows: early.map((date) => vciRow(date)) });
    const history = await source.history('FPT', '2026-11-04', ['VCI']);
    expect(history.rows).toHaveLength(2_500);
    expect(history.rows.map((row) => row.date)).toEqual(early);
    // 3 trang có dữ liệu (1.000 + 1.000 + 500) và một lần gọi kiểm tra hết dữ liệu.
    expect(ohlcv).toHaveBeenCalledTimes(4);
  });

  it('cả hai nguồn đều hỏng: lỗi nêu lý do của từng nguồn', async () => {
    const { source } = setup({
      dnseHistory: async () => {
        throw new Error('DNSE timeout');
      },
      vciError: new Error('VCI chặn IP'),
    });
    await expect(source.history('FPT', '2026-11-04')).rejects.toThrow(/DNSE: DNSE timeout; VCI: VCI chặn IP/);
  });

  it('không có nguồn nào được bật thì báo lỗi rõ ràng', async () => {
    const { source } = setup();
    await expect(source.history('FPT', '2026-11-04', [])).rejects.toThrow('Không có nguồn dữ liệu nào được bật');
  });
});

describe('MarketFlashbackDatasetSource.calendar', () => {
  const sessions = weekdaysFrom('2012-03-20', 1_200);

  it('lịch phiên lấy từ chỉ số VNINDEX của DNSE', async () => {
    const { source, dnse } = setup({ dnseIndex: async () => ({ data: sessions.map((date) => dnseRow(date, 1_200)) }) });
    const calendar = await source.calendar();
    expect(calendar.source).toBe('DNSE:VNINDEX');
    expect(calendar.dates).toEqual(sessions);
    expect(dnse.fetchFullIndexHistory).toHaveBeenCalledWith('VNINDEX');
  });

  it('DNSE trả quá ít phiên hoặc lỗi: dùng VNINDEX của VCI', async () => {
    const short = setup({
      dnseIndex: async () => ({ data: sessions.slice(0, 500).map((date) => dnseRow(date, 1_200)) }),
      vciRows: sessions.map((date) => vciRow(date, 1_200)),
    });
    const fromShort = await short.source.calendar();
    expect(fromShort.source).toBe('VCI:VNINDEX');
    expect(fromShort.dates).toEqual(sessions);

    const broken = setup({
      dnseIndex: async () => {
        throw new Error('DNSE 500');
      },
      vciRows: sessions.map((date) => vciRow(date, 1_200)),
    });
    expect((await broken.source.calendar()).source).toBe('VCI:VNINDEX');
  });

  it('cả hai nguồn không đủ lịch phiên: lỗi nêu lý do của từng nguồn', async () => {
    const { source } = setup({
      dnseIndex: async () => {
        throw new Error('DNSE 500');
      },
      vciRows: sessions.slice(0, 100).map((date) => vciRow(date, 1_200)),
    });
    await expect(source.calendar()).rejects.toThrow(/Không tải được lịch phiên của sàn \(DNSE: DNSE 500; VCI: chỉ có 100 phiên\)/);
  });
});

describe('MarketFlashbackDatasetSource.matchedValues (giá trị khớp thật của VCI)', () => {
  const tradingRow = (date: string, value: unknown) => ({
    trading_date: `${date}T00:00:00`,
    total_match_value: value,
  });

  it('lấy từng trang 1.000 phiên tới khi gặp trang ngắn, ghép theo ngày', async () => {
    const all = weekdaysFrom('2014-01-06', 1_300);
    const { source, fetchTradingHistory } = setup({
      tradingHistory: async (_symbol, options) => ({
        data: all
          .slice(Number(options.page) * 1_000, Number(options.page) * 1_000 + 1_000)
          .map((date, index) => tradingRow(date, 10_000_000_000 + index)),
      }),
    });
    const values = (await source.matchedValues('FPT', '2026-11-04'))!;
    expect(values.size).toBe(1_300);
    expect(values.get('2014-01-06')).toBe(10_000_000_000);
    expect(fetchTradingHistory).toHaveBeenCalledTimes(2);
    expect(fetchTradingHistory).toHaveBeenNthCalledWith(1, 'FPT', {
      resolution: '1D',
      start: '1995-01-01',
      end: '2026-11-04',
      page: 0,
      size: 1_000,
    });
    expect(fetchTradingHistory).toHaveBeenNthCalledWith(2, 'FPT', expect.objectContaining({ page: 1 }));
  });

  it('bỏ dòng sai (giá trị âm, không phải số, thiếu ngày); nguồn không có dữ liệu thì trả null', async () => {
    const { source } = setup({
      tradingHistory: async () => ({
        data: [
          tradingRow('2024-03-04', 5_000_000_000),
          tradingRow('2024-03-05', -1),
          tradingRow('2024-03-06', 'abc'),
          { trading_date: null, total_match_value: 7 },
          tradingRow('2024-03-07', '8000000000'),
        ],
      }),
    });
    const values = (await source.matchedValues('FPT', '2026-11-04'))!;
    expect([...values]).toEqual([
      ['2024-03-04', 5_000_000_000],
      ['2024-03-07', 8_000_000_000],
    ]);
    expect(await setup().source.matchedValues('FPT', '2026-11-04')).toBeNull();
  });

  it('lỗi nguồn được ném ra để bộ dựng dùng giá trị xấp xỉ và đếm cho bộ ngắt mạch', async () => {
    const { source } = setup({
      tradingHistory: async () => {
        throw new Error('VCI 429');
      },
    });
    await expect(source.matchedValues('FPT', '2026-11-04')).rejects.toThrow('VCI 429');
  });
});

describe('MarketFlashbackDatasetSource.rawPrices (giá gốc và giá tham chiếu của VCI, Candle Dojo v1.3 §2.3)', () => {
  /** Dòng `price-history` của VCI sau `snakeObject`: giá chưa điều chỉnh, đồng nguyên, kèm bản điều chỉnh. */
  const priceRow = (date: string, over: Record<string, unknown> = {}) => ({
    trading_date: `${date}T00:00:00`,
    open_price: 23_850,
    highest_price: 24_050,
    lowest_price: 23_600,
    close_price: 23_850,
    reference_price: 23_500,
    open_price_adjusted: 16_000,
    close_price_adjusted: 16_129.64,
    reference_price_adjusted: 15_892.93,
    total_match_value: 9_000_000_000,
    ...over,
  });

  it('lấy giá gốc (không phải giá điều chỉnh) và giá tham chiếu theo ngày, đồng nguyên', async () => {
    const { source, fetchTradingHistory } = setup({
      tradingHistory: async () => ({
        data: [priceRow('2022-08-25'), priceRow('2022-08-26', { close_price: 23_500.4 })],
      }),
    });
    const prices = (await source.rawPrices('HPG', '2026-11-04'))!;
    expect([...prices]).toEqual([
      ['2022-08-25', { open: 23_850, high: 24_050, low: 23_600, close: 23_850, ref: 23_500 }],
      ['2022-08-26', { open: 23_850, high: 24_050, low: 23_600, close: 23_500, ref: 23_500 }],
    ]);
    expect(fetchTradingHistory).toHaveBeenCalledWith('HPG', {
      resolution: '1D',
      start: '1995-01-01',
      end: '2026-11-04',
      page: 0,
      size: 1_000,
    });
  });

  it('phân trang như giá trị khớp thật: tới khi gặp trang ngắn', async () => {
    const all = weekdaysFrom('2014-01-06', 1_300);
    const { source, fetchTradingHistory } = setup({
      tradingHistory: async (_symbol, options) => ({
        data: all
          .slice(Number(options.page) * 1_000, Number(options.page) * 1_000 + 1_000)
          .map((date) => priceRow(date)),
      }),
    });
    expect((await source.rawPrices('HPG', '2026-11-04'))!.size).toBe(1_300);
    expect(fetchTradingHistory).toHaveBeenCalledTimes(2);
  });

  it('phiên thiếu một trong năm giá (VCI trả 0, null hoặc chữ) bị bỏ cả phiên; không có phiên nào thì null', async () => {
    const { source } = setup({
      tradingHistory: async () => ({
        data: [
          priceRow('2024-03-04'),
          priceRow('2024-03-05', { open_price: 0 }),
          priceRow('2024-03-06', { reference_price: null }),
          priceRow('2024-03-07', { close_price: 'abc' }),
          priceRow('2024-03-08', { highest_price: -5 }),
          { ...priceRow('2024-03-09'), trading_date: null },
          priceRow('2024-03-11', { lowest_price: '23600' }),
        ],
      }),
    });
    const prices = (await source.rawPrices('HPG', '2026-11-04'))!;
    expect([...prices.keys()]).toEqual(['2024-03-04', '2024-03-11']);
    expect(await setup().source.rawPrices('HPG', '2026-11-04')).toBeNull();
    const allBad = setup({
      tradingHistory: async () => ({ data: [priceRow('2024-03-05', { open_price: 0 })] }),
    });
    expect(await allBad.source.rawPrices('HPG', '2026-11-04')).toBeNull();
  });

  it('không lấy phiên hôm nay trở đi (chưa chốt) và ngày rác trước 1995', async () => {
    const { source } = setup({
      tradingHistory: async () => ({
        data: [
          priceRow('1970-01-01'),
          priceRow('2026-11-03'),
          priceRow('2026-11-04'),
          priceRow('2026-11-05'),
        ],
      }),
    });
    expect([...(await source.rawPrices('HPG', '2026-11-04'))!.keys()]).toEqual(['2026-11-03']);
  });

  it('giá gốc ngoài khoảng 1.000đ-1.000.000đ (nguồn đổi đơn vị) bị từ chối, không ghi giá sai', async () => {
    const { source } = setup({
      tradingHistory: async () => ({
        data: [
          priceRow('2024-03-04', {
            open_price: 23.8,
            highest_price: 24,
            lowest_price: 23.6,
            close_price: 23.85,
            reference_price: 23.5,
          }),
        ],
      }),
    });
    await expect(source.rawPrices('HPG', '2026-11-04')).rejects.toThrow(
      /ngoài khoảng 1\.000đ-1\.000\.000đ/,
    );
  });

  it('lỗi nguồn được ném ra để bước tính mẫu ghi log và dùng lại giá gốc đã lưu', async () => {
    const { source } = setup({
      tradingHistory: async () => {
        throw new Error('VCI 403');
      },
    });
    await expect(source.rawPrices('HPG', '2026-11-04')).rejects.toThrow('VCI 403');
  });
});
