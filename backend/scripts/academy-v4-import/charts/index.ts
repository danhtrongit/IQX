import type { ChartModel, ChartTone } from '../../../src/modules/academy/content/v4/schema.js';
import { CH1_BUILDERS } from './ch1.js';
import { CH2_BUILDERS } from './ch2.js';
import { CH4_BUILDERS } from './ch4.js';
import { CH5_BUILDERS } from './ch5.js';
import { CH6_BUILDERS } from './ch6.js';
import { CH7_BUILDERS } from './ch7.js';
import { O8_BUILDERS } from './o8.js';
import { O9_BUILDERS } from './o9.js';
import { O10_BUILDERS } from './o10.js';
import { O11_BUILDERS } from './o11.js';
import { O12_BUILDERS } from './o12.js';
import { O13_BUILDERS } from './o13.js';
import { CH10_BUILDERS, CH10_LEGENDS } from './ch10.js';
import { CH11_BUILDERS, CH11_LEGENDS } from './ch11.js';
import { CH12_BUILDERS, CH12_LEGENDS } from './ch12.js';
import { MOVED_FROM } from '../catalog-table.js';
import type { Builder, LegendItem } from './kit.js';
import { DROPPED_CHARTS } from './dropped.js';
import { REPRESENTATIVE_BUILDERS } from './rep.js';
import { TEXT_FIGURES } from './text-figures.js';

export { TEXT_FIGURES };

/**
 * Every chart model, keyed by the lowercase mockup svg id ("builder key"). Chapters 1-7 and the new chapters 10-12
 * (bank, securities, insurance) use their own chapter in the key (`c10l1-g1`). The 106 charts of the 33 lessons that
 * moved from v3.3 chapters 8-13 into the new chapters 8-9 keep the mockup's old position (`o10l1-g1` = v3.3 chapter
 * 10 lesson 1); the lesson file stores them under their new position (`c8l11-g1`, see `outputChartId`).
 */
export const CHART_BUILDERS: Readonly<Record<string, Builder>> = {
  ...CH1_BUILDERS,
  ...CH2_BUILDERS,
  ...CH4_BUILDERS,
  ...CH5_BUILDERS,
  ...CH6_BUILDERS,
  ...CH7_BUILDERS,
  ...O8_BUILDERS,
  ...O9_BUILDERS,
  ...O10_BUILDERS,
  ...O11_BUILDERS,
  ...O12_BUILDERS,
  ...O13_BUILDERS,
  ...CH10_BUILDERS,
  ...CH11_BUILDERS,
  ...CH12_BUILDERS,
};

export { DROPPED_CHARTS };
export { REPRESENTATIVE_BUILDERS };

/** C1L1 hero icons (`.three3 > .p3 svg`) -> Lucide names in a `stats` block. */
export const ICONS: Readonly<Record<string, 'vault' | 'landmark' | 'chart-line'>> = {
  'C1L1-ic-ket': 'vault',
  'C1L1-ic-tk': 'landmark',
  'C1L1-ic-ck': 'chart-line',
};

/**
 * Legends the mockup draws inside the svg (no HTML `.legend`). The chart block carries them so every
 * chart has its key in HTML.
 */
const L = (...items: [string, ChartTone][]): LegendItem[] =>
  items.map(([label, tone]) => ({ label, tone }));
const PRICE_MA20 = L(['Giá', 'price'], ['MA20', 'p1']);
const BOLL = L(['Giá', 'price'], ['Dải Bollinger', 'p1'], ['Dải giữa', 'warn']);
export const SVG_LEGENDS: Readonly<Record<string, LegendItem[]>> = {
  ...CH10_LEGENDS,
  ...CH11_LEGENDS,
  ...CH12_LEGENDS,
  'c4l5-g1': PRICE_MA20,
  'c4l5-g2': L(['Giá', 'price'], ['MA20', 'p1'], ['MA50', 'p2'], ['MA200', 'p5']),
  'c4l5-g4': [...PRICE_MA20, ...L(['Bật lên từ MA', 'pos'])],
  'c4l5-g6': [...PRICE_MA20, ...L(['Tín hiệu nhiễu', 'warn'])],
  'c4l6-g5': L(['MA50', 'p1']),
  'c4l7-g1': L(['Đường MACD', 'p1'], ['Đường tín hiệu', 'warn'], ['Histogram', 'pos']),
  'c4l7-g2': L(['EMA12', 'pos'], ['EMA26', 'p5'], ['Đường MACD = EMA12 − EMA26', 'p1']),
  'c4l7-g3': L(['Cắt lên: mua', 'pos'], ['Cắt xuống: bán', 'neg']),
  'c4l7-g6': L(['MA50', 'p1']),
  'c4l8-g1': L(['Giá', 'price'], ['Dải trên và dải dưới', 'p1'], ['Dải giữa (MA20)', 'warn']),
  'c4l8-g2': BOLL,
  'c4l8-g4': BOLL,
  'c5l1-g3': L(
    ['Mua một lần 72 triệu', 'warn'],
    ['DCA 3 triệu mỗi tháng', 'pos'],
    ['Tiền DCA đã bỏ vào', 'p3'],
  ),
  'c5l2-g1': L(
    ['Giá thị trường', 'price'],
    ['Giá trị thực', 'warn'],
    ['Giá thấp hơn giá trị', 'pos'],
    ['Giá cao hơn giá trị', 'neg'],
  ),
  'c5l4-g6': L(
    ['VN-Index', 'price'],
    ['MA50', 'p1'],
    ['Ưu tiên mua', 'pos'],
    ['Đứng ngoài', 'neg'],
  ),
  /* ---- Chương 6 */
  'c6l1-g1': L(['EMA 20', 'p1'], ['MA 20', 'warn']),
  'c6l1-g3': L(['Giá đóng cửa', 'price'], ['EMA 10', 'warn'], ['EMA 20', 'p1'], ['EMA 50', 'p4']),
  'c6l1-g4': L(['EMA 20', 'p1'], ['EMA 50', 'p4'], ['Mua', 'pos'], ['Bán', 'neg']),
  'c6l2-g1': L(['SMA 20', 'warn'], ['SMA 50', 'p4'], ['Cắt lên', 'pos'], ['Cắt xuống', 'neg']),
  'c6l2-g2': L(['Giá đóng cửa', 'price'], ['MA 50', 'warn'], ['MA 200', 'p1']),
  'c6l2-g4': L(['SMA 20', 'warn'], ['SMA 50', 'p4']),
  'c6l3-g1': L(['+DI 14', 'pos'], ['−DI 14', 'neg']),
  'c6l3-g3': L(['+DI 14', 'pos'], ['−DI 14', 'neg'], ['Mua', 'pos'], ['Bán', 'neg']),
  'c6l4-g1': L(['Biên trên 20 phiên', 'p1'], ['Biên dưới 20 phiên', 'p1']),
  'c6l4-g3': L(['Kênh Donchian 20', 'p1'], ['Mua', 'pos'], ['Bán', 'neg']),
  /* ---- Chương 7 */
  'c7l1-g1': L(['%K', 'p1'], ['%D', 'p5']),
  'c7l1-g3': L(['%K', 'p1'], ['%D', 'p5'], ['Mua', 'pos'], ['Bán', 'neg']),
  'c7l1-g4': L(['%K', 'p1'], ['%D', 'p5']),
  'c7l2-g1': L(['CCI 20', 'p1']),
  'c7l2-g2': L(['Giá điển hình TP', 'p1'], ['Trung bình 20 phiên của TP', 'warn']),
  'c7l2-g3': L(['CCI 20', 'p1'], ['Mua', 'pos'], ['Bán', 'neg']),
  'c7l3-g1': L(['ROC 20', 'p1']),
  'c7l3-g2': L(['Giá đóng cửa', 'price']),
  'c7l3-g3': L(['ROC 20', 'p1'], ['Mua', 'pos'], ['Bán', 'neg']),
  'c7l4-g1': L(['Williams %R 14', 'p4']),
  'c7l4-g3': L(['Williams %R 14', 'p4'], ['Mua', 'pos'], ['Bán', 'neg']),
  'c7l5-g1': L(['OBV', 'p1'], ['SMA 20 của OBV', 'warn']),
  'c7l5-g3': L(['Giá', 'price'], ['OBV', 'p1']),
  'c7l5-g4': L(['OBV', 'p1'], ['SMA 20 của OBV', 'warn']),
  'c7l6-g1': L(['MFI 14', 'p1']),
  'c7l6-g3': L(['MFI 14', 'p1'], ['RSI 14', 'warn']),
  'c7l6-g4': L(['MFI 14', 'p1'], ['Mua', 'pos'], ['Bán', 'neg']),
  'c7l7-g1': L(['CMF 20', 'p1']),
  'c7l7-g3': L(['CMF 20', 'p1'], ['Mua', 'pos'], ['Bán', 'neg']),
};

/** svg id -> builder key: lowercase; chapter 2 ids (`L1-g1`) get the `c2` prefix; `O10L1-g1` stays `o10l1-g1`. */
export function chartIdOf(svgId: string, chapter: number): string {
  const id = svgId.toLowerCase();
  if (/^[co]\d+l/.test(id)) return id;
  if (chapter === 2 && /^l\d+-/.test(id)) return `c2${id}`;
  throw new Error(`svg id ${svgId} has no chapter prefix (chapter ${chapter})`);
}

/**
 * Builder key -> chart id stored in the lesson file. Keys of moved lessons (`o10l1-g1`) become `c{chapter}l{lesson}-g1`
 * of the lesson that now holds them; every other key is its own chart id.
 */
export function outputChartId(key: string, chapter: number, lesson: number): string {
  const moved = /^o\d+l\d+-(.+)$/.exec(key);
  return moved ? `c${chapter}l${lesson}-${moved[1]}` : key;
}

/**
 * Builder key behind a chart of a lesson file: the chart's own id, except for the 106 charts of the lessons that moved
 * from v3.3 (`c8l11-g1` of ch08-l11 is built by `o10l1-g1`, the ROE lesson's old position).
 */
export function builderKeyOf(itemId: string, chartId: string): string {
  const from = MOVED_FROM[itemId];
  const suffix = /^c\d+l\d+-(.+)$/.exec(chartId)?.[1];
  if (!from || !suffix || suffix === 'rep') return chartId;
  return `o${from[0]}l${from[1]}-${suffix}`;
}

export function buildChart(id: string): ChartModel {
  const b = CHART_BUILDERS[id] ?? REPRESENTATIVE_BUILDERS[id];
  if (!b) throw new Error(`no chart builder for ${id}`);
  return b();
}

/** DOM svg ids must be exactly builders + text figures + icons, each used once. */
export function gateSvgIds(svgIds: readonly { id: string; chapter: number }[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const { id, chapter } of svgIds) {
    if (ICONS[id]) {
      seen.add(id);
      continue;
    }
    const cid = chartIdOf(id, chapter);
    if (seen.has(cid)) errors.push(`duplicate svg id ${id}`);
    seen.add(cid);
    if (DROPPED_CHARTS[cid]) continue;
    if (!CHART_BUILDERS[cid] && !TEXT_FIGURES[cid])
      errors.push(`svg ${id} has no builder or text figure`);
  }
  for (const id of [
    ...Object.keys(CHART_BUILDERS),
    ...Object.keys(TEXT_FIGURES),
    ...Object.keys(ICONS),
  ])
    if (!seen.has(id)) errors.push(`${id} is not in the mockup`);
  for (const id of Object.keys(CHART_BUILDERS))
    if (TEXT_FIGURES[id]) errors.push(`${id} is both a chart and a text figure`);
  for (const id of Object.keys(SVG_LEGENDS))
    if (!CHART_BUILDERS[id]) errors.push(`legend for unknown chart ${id}`);
  return errors;
}
