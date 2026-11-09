import { buildVnIndexModel } from '../../src/modules/market-bulletins/bulletin-model.js';
import {
  EMPTY_LEVELS,
  type BulletinContent,
  type IndexBar,
  type MarketStats,
  type MiniChartData,
  type SlotSnapshot,
  type VnIndexModel,
} from '../../src/modules/market-bulletins/bulletin.types.js';

/** Danh sách `n` ngày giao dịch (thứ Hai đến thứ Sáu) kết thúc đúng `lastIso`. */
export function tradingDays(lastIso: string, n: number): string[] {
  const out: string[] = [];
  const cursor = new Date(`${lastIso}T00:00:00Z`);
  while (out.length < n) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) out.unshift(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return out;
}

/** Chuỗi giá giả lập, tất định (không dùng random) để test lặp lại được. */
export function syntheticIndexBars(lastIso: string, n = 260): IndexBar[] {
  return tradingDays(lastIso, n).map((date, index) => {
    const base = 1180 + index * 2.1 + Math.sin(index / 7) * 38 + Math.sin(index / 19) * 55;
    const open = base + Math.sin(index * 1.7) * 6;
    const close = base + Math.cos(index * 1.3) * 7;
    return {
      date,
      open,
      high: Math.max(open, close) + 4 + Math.abs(Math.sin(index)) * 6,
      low: Math.min(open, close) - 4 - Math.abs(Math.cos(index)) * 6,
      close,
      volume: 600_000_000 + Math.abs(Math.sin(index / 3)) * 300_000_000,
    };
  });
}

export const FIXTURE_DATE = '2026-11-06';

export const FIXTURE_STATS: MarketStats = {
  value_bn: 21_345.6,
  advances: 212,
  unchanged: 61,
  declines: 143,
  symbols: 416,
  source: 'market_daily_bars',
  computed_at: '2026-11-06T09:10:00.000Z',
};

export function fixtureModel(stats: MarketStats | null = FIXTURE_STATS): VnIndexModel {
  const model = buildVnIndexModel(syntheticIndexBars(FIXTURE_DATE), FIXTURE_DATE, stats);
  if (!model) throw new Error('fixture model must build');
  return model;
}

export function fixtureContent(model: VnIndexModel): BulletinContent {
  const close = Math.round(model.close);
  return {
    trend: `VN-Index đóng cửa ${close} điểm, giữ trên đường SMA20 và tiếp tục xu hướng tăng ngắn hạn.`,
    momentum: 'RSI(14) còn dư địa tăng, MACD nằm trên Signal.',
    liquidity: 'Khối lượng cao hơn trung bình 20 phiên, dòng tiền cải thiện.',
    levels: {
      ...EMPTY_LEVELS,
      r1: close + 40,
      r2: close + 90,
      s1: close - 30,
      s2: close - 80,
      pa: close - 10,
      pt: close + 60,
      na: close - 40,
      nt: close - 110,
    },
  };
}

export function fixtureChart(symbol = 'FPT', lastIso = FIXTURE_DATE, n = 109): MiniChartData {
  const days = tradingDays(lastIso, n);
  const c = days.map((_, i) => 90 + i * 0.4 + Math.sin(i / 4) * 5);
  return {
    symbol,
    d: days,
    o: c.map((value, i) => value + Math.sin(i) * 0.8),
    h: c.map((value) => value + 1.8),
    l: c.map((value) => value - 1.8),
    c,
    v: days.map((_, i) => 1_000_000 + Math.abs(Math.sin(i)) * 900_000),
  };
}

export function fixtureSlot(
  slot: 1 | 2 | 3,
  options: { passed?: number; date?: string; chart?: boolean } = {},
): SlotSnapshot {
  const passed = options.passed ?? 4;
  const symbols = [
    'FPT',
    'MWG',
    'HPG',
    'VCB',
    'SSI',
    'VNM',
    'ACB',
    'TCB',
    'MBB',
    'VPB',
    'CTG',
    'STB',
  ];
  return {
    slot,
    trade_date: options.date ?? FIXTURE_DATE,
    display_name: `Cổ phiếu tăng giá, thanh khoản cao ${slot}`,
    filter_id: `00000000-0000-4000-8000-00000000000${slot}`,
    filter_name: `Bộ lọc ${slot}`,
    filter_version: 3,
    result_id: `00000000-0000-4000-8000-0000000001${slot}0`,
    conditions: [
      'Giá đóng cửa lớn hơn SMA20',
      'RSI(14) lớn hơn 55',
      'Giá trị giao dịch lớn hơn 20 tỷ đồng',
      'Khối lượng lớn hơn trung bình 20 phiên',
    ],
    passed_count: passed,
    picks: symbols.slice(0, Math.min(passed, 10)).map((symbol, index) => ({
      symbol,
      close: 95.4 - index * 3.1,
      change_pct: index % 3 === 0 ? 2.15 : index % 3 === 1 ? -0.74 : 0,
      value_bn: 480.5 - index * 31.7,
    })),
    chart: options.chart === false || passed === 0 ? null : fixtureChart(symbols[0]),
    pushed_by: null,
    pushed_at: '2026-11-06T09:30:00.000Z',
  };
}
