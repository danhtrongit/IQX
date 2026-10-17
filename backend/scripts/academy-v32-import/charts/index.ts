import type { ChartModel, ChartTone } from '../../../src/modules/academy/content/v3/schema.js';
import { CH1_BUILDERS } from './ch1.js';
import { CH2_BUILDERS } from './ch2.js';
import { CH4_BUILDERS } from './ch4.js';
import { CH5_BUILDERS } from './ch5.js';
import type { Builder, LegendItem } from './kit.js';
import { TEXT_FIGURES } from './text-figures.js';

export { TEXT_FIGURES };

/** Every chart model, keyed by chart id. */
export const CHART_BUILDERS: Readonly<Record<string, Builder>> = {
  ...CH1_BUILDERS,
  ...CH2_BUILDERS,
  ...CH4_BUILDERS,
  ...CH5_BUILDERS,
};

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
};

/** svg id -> chart id: lowercase; chapter 2 ids (`L1-g1`) get the `c2` prefix. */
export function chartIdOf(svgId: string, chapter: number): string {
  const id = svgId.toLowerCase();
  if (/^c\d+l/.test(id)) return id;
  if (chapter === 2 && /^l\d+-/.test(id)) return `c2${id}`;
  throw new Error(`svg id ${svgId} has no chapter prefix (chapter ${chapter})`);
}

export function buildChart(id: string): ChartModel {
  const b = CHART_BUILDERS[id];
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
