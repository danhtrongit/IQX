import { describe, expect, it } from 'vitest';

import {
  applyDatasetConfigPatch,
  datasetConfigToStored,
  datasetCutConfigKey,
  datasetMinBars,
  decideScheduledRefresh,
  firstMondayOf,
  FLASHBACK_DATASET_CONFIG_KEY,
  FLASHBACK_DATASET_DEFAULTS,
  FLASHBACK_NO_DATA_MESSAGE,
  flashbackDatasetConfigPatchSchema,
  latestRefreshAnchor,
  readFlashbackDatasetConfig,
  rebalanceEffectiveDates,
} from '../../src/modules/flashback/flashback-dataset.config.js';

describe('Flashback dataset · tham số mặc định (spec §5)', () => {
  it('khớp các giá trị của spec và lưu ở flashback_settings khoá "dataset"', () => {
    expect(FLASHBACK_DATASET_CONFIG_KEY).toBe('dataset');
    expect(datasetConfigToStored(FLASHBACK_DATASET_DEFAULTS)).toEqual({
      basket: 'VN100',
      warmup_sessions: 252,
      min_months_ago: 12,
      max_gap_sessions: 5,
      max_zero_volume_ratio: 0.025,
      min_liquidity_vnd: 3_000_000_000,
      min_daily_volatility: 0.01,
      min_symbols: 80,
      price_sources: ['DNSE', 'VCI'],
      refresh_months: [2, 8],
      refresh_delay_days: 7,
      rebalance_dates: [],
    });
    expect(datasetMinBars(FLASHBACK_DATASET_DEFAULTS)).toBe(312);
    expect(datasetMinBars({ warmupSessions: 100 })).toBe(160);
    expect(FLASHBACK_NO_DATA_MESSAGE).toBe('Chưa tạo được dữ liệu ván chơi, vui lòng thử lại sau');
  });
});

describe('Flashback dataset · đọc tham số đã lưu', () => {
  it.each([[null], [undefined], [[]], ['text'], [42]])('%j: dùng toàn bộ mặc định, không báo lỗi', (stored) => {
    const { config, invalid } = readFlashbackDatasetConfig(stored);
    expect(config).toEqual(FLASHBACK_DATASET_DEFAULTS);
    expect(invalid).toEqual([]);
  });

  it('khoá nào có thì dùng khoá đó, khoá thiếu hoặc null lấy mặc định, khoá lạ bị bỏ qua', () => {
    const { config, invalid } = readFlashbackDatasetConfig({
      min_symbols: 70,
      basket: 'vn30',
      min_liquidity_vnd: null,
      something_else: 1,
    });
    expect(config).toMatchObject({ minSymbols: 70, basket: 'VN30', minLiquidityVnd: 3_000_000_000 });
    expect(invalid).toEqual([]);
  });

  it('từng khoá không hợp lệ chỉ bị thay bằng mặc định của khoá đó và được liệt kê', () => {
    const { config, invalid } = readFlashbackDatasetConfig({
      warmup_sessions: 50,
      min_months_ago: 6,
      max_zero_volume_ratio: 'x',
      min_liquidity_vnd: -1,
      price_sources: ['XYZ'],
      refresh_months: [2, 2],
      rebalance_dates: ['2026-02-30', '2026-13-01'],
    });
    expect(invalid.sort()).toEqual(
      ['warmup_sessions', 'max_zero_volume_ratio', 'min_liquidity_vnd', 'price_sources', 'refresh_months', 'rebalance_dates'].sort(),
    );
    expect(config).toEqual({ ...FLASHBACK_DATASET_DEFAULTS, minMonthsAgo: 6 });
  });

  it('danh sách được sắp xếp', () => {
    const { config } = readFlashbackDatasetConfig({
      refresh_months: [8, 2, 5],
      rebalance_dates: ['2026-09-14', '2026-03-02'],
    });
    expect(config.refreshMonths).toEqual([2, 5, 8]);
    expect(config.rebalanceDates).toEqual(['2026-03-02', '2026-09-14']);
  });
});

describe('Flashback dataset · cập nhật tham số của quản trị viên', () => {
  const accepts = (patch: unknown) => flashbackDatasetConfigPatchSchema.safeParse(patch).success;

  it('nhận từng phần tham số hợp lệ', () => {
    expect(accepts({ min_symbols: 70 })).toBe(true);
    expect(accepts({ min_liquidity_vnd: 2_000_000_000, max_gap_sessions: 3 })).toBe(true);
    expect(accepts({ price_sources: ['VCI', 'DNSE'] })).toBe(true);
    expect(accepts({ refresh_months: [3, 9], rebalance_dates: ['2026-09-14'] })).toBe(true);
    expect(accepts({ basket: 'vn30' })).toBe(true);
  });

  it('từ chối thân rỗng, khoá lạ và giá trị ngoài khoảng', () => {
    expect(accepts({})).toBe(false);
    expect(accepts({ unknown_key: 1 })).toBe(false);
    expect(accepts({ min_symbols: 70, unknown_key: 1 })).toBe(false);
    for (const bad of [
      { warmup_sessions: 99 },
      { warmup_sessions: 501 },
      { warmup_sessions: 252.5 },
      { min_months_ago: -1 },
      { max_gap_sessions: 61 },
      { max_zero_volume_ratio: 0.6 },
      { max_zero_volume_ratio: -0.01 },
      { min_liquidity_vnd: -1 },
      { min_daily_volatility: 0.3 },
      { min_symbols: 0 },
      { min_symbols: 501 },
      { price_sources: [] },
      { price_sources: ['DNSE', 'DNSE'] },
      { price_sources: ['SSI'] },
      { refresh_months: [] },
      { refresh_months: [0] },
      { refresh_months: [13] },
      { refresh_months: [2, 2] },
      { refresh_delay_days: 61 },
      { rebalance_dates: ['2026-13-01'] },
      { rebalance_dates: ['2026-02-30'] },
      { rebalance_dates: ['2026-09-14', '2026-09-14'] },
      { basket: '' },
      { basket: 'VN 100' },
    ])
      expect(accepts(bad), JSON.stringify(bad)).toBe(false);
  });

  it('applyDatasetConfigPatch chỉ đổi các khoá được gửi', () => {
    const next = applyDatasetConfigPatch(FLASHBACK_DATASET_DEFAULTS, {
      min_symbols: 70,
      price_sources: ['VCI'],
      basket: 'vn30',
    });
    expect(next).toEqual({
      ...FLASHBACK_DATASET_DEFAULTS,
      minSymbols: 70,
      priceSources: ['VCI'],
      basket: 'VN30',
    });
  });

  it('khoá bộ nhớ đệm điểm cắt đổi theo mọi ngưỡng ảnh hưởng điểm cắt và không đổi theo ngưỡng khác', () => {
    const base = datasetCutConfigKey(FLASHBACK_DATASET_DEFAULTS);
    const key = (patch: Parameters<typeof applyDatasetConfigPatch>[1]) =>
      datasetCutConfigKey(applyDatasetConfigPatch(FLASHBACK_DATASET_DEFAULTS, patch));
    expect(key({ warmup_sessions: 300 })).not.toBe(base);
    expect(key({ min_months_ago: 6 })).not.toBe(base);
    expect(key({ max_zero_volume_ratio: 0.05 })).not.toBe(base);
    expect(key({ min_liquidity_vnd: 1_000_000_000 })).not.toBe(base);
    expect(key({ min_daily_volatility: 0.02 })).not.toBe(base);
    expect(key({ min_symbols: 70 })).toBe(base);
    expect(key({ price_sources: ['VCI'] })).toBe(base);
    expect(key({ refresh_months: [3] })).toBe(base);
  });
});

describe('Flashback dataset · lịch làm mới sau kỳ cơ cấu VN100 (§2.1)', () => {
  it('firstMondayOf: thứ Hai đầu tiên của tháng', () => {
    expect(firstMondayOf(2026, 2)).toBe('2026-02-02'); // 01/02/2026 là Chủ nhật
    expect(firstMondayOf(2026, 8)).toBe('2026-08-03'); // 01/08/2026 là thứ Bảy
    expect(firstMondayOf(2025, 9)).toBe('2025-09-01'); // 01/09/2025 là thứ Hai
    expect(firstMondayOf(2025, 2)).toBe('2025-02-03');
    expect(firstMondayOf(2025, 8)).toBe('2025-08-04');
  });

  it('rebalanceEffectiveDates: quy tắc tháng 2 và tháng 8, hoặc danh sách ngày cụ thể nếu quản trị đặt', () => {
    expect(rebalanceEffectiveDates(FLASHBACK_DATASET_DEFAULTS, 2025, 2026)).toEqual([
      '2025-02-03',
      '2025-08-04',
      '2026-02-02',
      '2026-08-03',
    ]);
    expect(
      rebalanceEffectiveDates(
        { refreshMonths: [2, 8], rebalanceDates: ['2026-09-14', '2026-03-02'] },
        2025,
        2026,
      ),
    ).toEqual(['2026-03-02', '2026-09-14']);
  });

  it('latestRefreshAnchor: ngày hiệu lực cộng 7 ngày, lấy mốc gần nhất không muộn hơn hôm nay', () => {
    const config = FLASHBACK_DATASET_DEFAULTS;
    expect(latestRefreshAnchor('2026-11-04', config)).toBe('2026-08-10');
    expect(latestRefreshAnchor('2026-08-10', config)).toBe('2026-08-10');
    expect(latestRefreshAnchor('2026-08-09', config)).toBe('2026-02-09');
    expect(latestRefreshAnchor('2026-02-08', config)).toBe('2025-08-11');
    const explicit = { refreshMonths: [2, 8], refreshDelayDays: 7, rebalanceDates: ['2026-09-14'] };
    expect(latestRefreshAnchor('2026-09-20', explicit)).toBeNull();
    expect(latestRefreshAnchor('2026-09-21', explicit)).toBe('2026-09-21');
  });

  it('decideScheduledRefresh: chưa có kho thì dựng; kho tạo trước mốc đã qua thì dựng; còn lại thì không', () => {
    const config = FLASHBACK_DATASET_DEFAULTS;
    expect(decideScheduledRefresh('2026-11-04', null, config)).toEqual({
      due: true,
      reason: 'no_active_version',
      anchor: null,
    });
    // Mốc gần nhất là 2026-08-10.
    expect(decideScheduledRefresh('2026-11-04', '2026-08-01', config)).toEqual({
      due: true,
      reason: 'rebalance_passed',
      anchor: '2026-08-10',
    });
    expect(decideScheduledRefresh('2026-11-04', '2026-08-09', config).due).toBe(true);
    expect(decideScheduledRefresh('2026-11-04', '2026-08-10', config)).toEqual({
      due: false,
      reason: 'up_to_date',
      anchor: '2026-08-10',
    });
    expect(decideScheduledRefresh('2026-11-04', '2026-10-01', config).due).toBe(false);
    // Chạy lại nhiều lần trong cùng một kỳ không tạo thêm phiên bản: kho vừa dựng hôm nay không tới hạn.
    expect(decideScheduledRefresh('2026-11-05', '2026-11-04', config).due).toBe(false);
  });

  it('ngay sau ngày hiệu lực kỳ cơ cấu nhưng chưa đủ độ trễ thì chưa dựng; đủ độ trễ thì dựng', () => {
    const config = FLASHBACK_DATASET_DEFAULTS;
    // Kỳ 03/08/2026 + 7 ngày = 10/08/2026.
    expect(decideScheduledRefresh('2026-08-09', '2026-02-20', config).due).toBe(false);
    expect(decideScheduledRefresh('2026-08-10', '2026-02-20', config).due).toBe(true);
  });
});
