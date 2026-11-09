import { calc } from '../quant/v2/indicators.js';
import type { Bar } from '../quant/v2/types.js';
import { SUGGESTION_MIN_DISTANCE_RATIO } from './bulletin.constants.js';
import { round0 } from './bulletin.format.js';
import type { IndexBar, MarketStats, VnIndexModel } from './bulletin.types.js';

/** Tối thiểu để có RSI(14), MACD(12,26,9) ở phiên T cùng giá trị phiên trước. */
const MIN_BARS = 40;

const toBars = (bars: readonly IndexBar[]): Bar[] =>
  bars.map((bar) => ({
    date: bar.date,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }));

/** Trung bình trượt khối lượng gồm cả phiên hiện tại (MA20 khối lượng của biểu đồ). */
function volumeMa(bars: readonly IndexBar[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  let sum = 0;
  for (let i = 0; i < bars.length; i += 1) {
    sum += bars[i]!.volume;
    if (i >= period) sum -= bars[i - period]!.volume;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Số liệu VN-Index của phiên `date` từ nến ngày. Chỉ báo dùng đúng hàm tính của Bot và Bộ lọc (`calc`):
 * SMA, RSI Wilder, MACD. Null khi chưa đủ nến hoặc nến cuối không phải phiên `date`.
 */
export function buildVnIndexModel(
  allBars: readonly IndexBar[],
  date: string,
  stats: MarketStats | null,
): VnIndexModel | null {
  const bars = allBars.filter((bar) => bar.date <= date);
  if (bars.length < MIN_BARS || bars.at(-1)!.date !== date) return null;
  const input = toBars(bars);
  const last = bars.length - 1;
  const sma = (period: number) => calc('ma', { period }, input).value!;
  const macd = calc('macd', { fast: 12, slow: 26, signal: 9 }, input);
  const close = bars[last]!.close;
  const previousClose = bars[last - 1]!.close;
  const vma = volumeMa(bars, 20);
  return {
    date,
    bars,
    last,
    close,
    previousClose,
    change: close - previousClose,
    changePct: (close / previousClose - 1) * 100,
    volume: bars[last]!.volume,
    volumeMa20: vma[last] ?? null,
    stats,
    series: {
      sma20: sma(20),
      sma50: sma(50),
      sma200: sma(200),
      rsi: calc('rsi', { period: 14 }, input).value!,
      macd: macd.value!,
      signal: macd.signal!,
      hist: macd.histogram!,
      volumeMa20: vma,
    },
  };
}

export type LevelSuggestion = { label: string; value: number; side: 'resistance' | 'support' };

type RawLevel = { name: string; value: number };

/**
 * Hợp các nhãn của cùng một mức: "Đỉnh 20 phiên" + "Đỉnh 60 phiên" → "Đỉnh 20/60 phiên",
 * "SMA20" + "SMA50" → "SMA20/50"; khác loại thì nối bằng " · ".
 */
function mergeLabels(names: readonly string[]): string {
  if (names.length === 1) return names[0]!;
  const parts = names.map((name) => /^(.*?)(\d+)( phiên)?$/.exec(name));
  if (parts.every(Boolean)) {
    const prefix = parts[0]![1]!;
    const suffix = parts[0]![3] ?? '';
    if (parts.every((part) => part![1] === prefix && (part![3] ?? '') === suffix))
      return `${prefix}${parts.map((part) => part![2]).join('/')}${suffix}`;
  }
  return names.join(' · ');
}

/**
 * Gợi ý hỗ trợ, kháng cự (spec §3.4 bước 2): đỉnh/đáy 20 và 60 phiên, SMA20/50/200, làm tròn tới điểm.
 * Mức trùng nhau gộp một nút; bỏ mức cách giá đóng cửa dưới 0,3%.
 */
export function suggestLevels(model: VnIndexModel): LevelSuggestion[] {
  const { bars, last, close, series } = model;
  const window = (period: number) => bars.slice(Math.max(0, last - period + 1), last + 1);
  const raw: RawLevel[] = [
    { name: 'Đỉnh 20 phiên', value: Math.max(...window(20).map((bar) => bar.high)) },
    { name: 'Đáy 20 phiên', value: Math.min(...window(20).map((bar) => bar.low)) },
    { name: 'Đỉnh 60 phiên', value: Math.max(...window(60).map((bar) => bar.high)) },
    { name: 'Đáy 60 phiên', value: Math.min(...window(60).map((bar) => bar.low)) },
  ];
  for (const [name, values] of [
    ['SMA20', series.sma20],
    ['SMA50', series.sma50],
    ['SMA200', series.sma200],
  ] as const) {
    const value = values[last];
    if (value !== null && value !== undefined) raw.push({ name, value });
  }
  const grouped = new Map<number, string[]>();
  for (const { name, value } of raw) {
    const rounded = round0(value);
    if (Math.abs(rounded - close) / close <= SUGGESTION_MIN_DISTANCE_RATIO) continue;
    grouped.set(rounded, [...(grouped.get(rounded) ?? []), name]);
  }
  return [...grouped.entries()].map(([value, names]) => ({
    label: mergeLabels(names),
    value,
    side: value > close ? ('resistance' as const) : ('support' as const),
  }));
}

/** Số liệu tự động hiển thị ở bước 1 màn soạn (spec §3.4). */
export type AutoMetrics = {
  close: number;
  change: number;
  change_pct: number;
  volume_millions: number;
  volume_ma20_millions: number | null;
  value_bn: number | null;
  advances: number | null;
  unchanged: number | null;
  declines: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi: number | null;
  rsi_previous: number | null;
  macd: number | null;
  signal: number | null;
  histogram: number | null;
};

export function autoMetrics(model: VnIndexModel): AutoMetrics {
  const { series, last, stats } = model;
  const at = (values: readonly (number | null)[], index = last) => values[index] ?? null;
  return {
    close: model.close,
    change: model.change,
    change_pct: model.changePct,
    volume_millions: model.volume / 1e6,
    volume_ma20_millions: model.volumeMa20 === null ? null : model.volumeMa20 / 1e6,
    value_bn: stats?.value_bn ?? null,
    advances: stats?.advances ?? null,
    unchanged: stats?.unchanged ?? null,
    declines: stats?.declines ?? null,
    sma20: at(series.sma20),
    sma50: at(series.sma50),
    sma200: at(series.sma200),
    rsi: at(series.rsi),
    rsi_previous: at(series.rsi, last - 1),
    macd: at(series.macd),
    signal: at(series.signal),
    histogram: at(series.hist),
  };
}
