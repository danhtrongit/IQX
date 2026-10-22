/**
 * Builder cho 33 "Biểu đồ đại diện" của Chương 8-13.
 *
 * Bản mẫu v3.3 vẽ thẻ đại diện bằng SVG viết tay tĩnh (không có `id`, không do page script
 * sinh ra), nên không thể dùng `gateSvgIds` để đối chiếu. Vì vậy các chart này dùng id riêng
 * `c{chapter}l{lesson}-rep` và một registry riêng (`REPRESENTATIVE_BUILDERS`), tách khỏi
 * `CHART_BUILDERS` vốn phải khớp với `id` của svg trong bản mẫu.
 *
 * Số liệu lấy từ `rep-data.ts`, đọc ra từ chính hình SVG của bản mẫu.
 */
import type { ChartModel } from '../../../src/modules/academy/content/v3/schema.js';
import type { Builder, Category, Model } from './kit.js';
import { REPRESENTATIVE_DATA } from './rep-data.js';
import type { RepresentativeData } from './rep-data.js';
import { S1, GD, UP, DN, P3 } from './fund.js';

/** Số điểm vượt quá mức mà nhãn trục ngang rút gọn được thì dùng `series_panels`. */
const MAX_LABELS = 32;

/** Đường chỉ tiêu: `category` mode 'line' (nhãn trục ngang là các kỳ). */
function lineModel(d: RepresentativeData): Category {
  const values = d.line ?? [];
  return {
    kind: 'category',
    mode: 'line',
    title: d.metric,
    labels: d.labels.length === values.length ? [...d.labels] : d.labels.map((_, i) => String(i + 1)),
    unit: '',
    series: [{ name: d.metric, values: [...values], tone: S1 }],
    value_labels: 'none',
    caption_value: d.headline,
    caption_tone: 'price',
  } as Category;
}

/** Cột thành phần: `category` mode 'grouped'. */
function barModel(d: RepresentativeData): Category {
  const values = d.bar ?? [];
  return {
    kind: 'category',
    mode: 'grouped',
    title: d.metric,
    labels: d.labels.length === values.length ? [...d.labels] : d.labels.map((_, i) => String(i + 1)),
    unit: '',
    series: [
      {
        name: d.metric,
        values: [...values],
        tone_by_sign: { pos: UP, neg: DN },
      },
    ],
    value_labels: 'none',
    caption_value: d.headline,
    caption_tone: 'price',
  } as Category;
}

/**
 * Chuỗi dài (hàng trăm điểm): `series_panels` với nhãn trục ngang rút gọn, vì `category`
 * bắt buộc mỗi nhãn phải có ít nhất một ký tự.
 */
function denseModel(d: RepresentativeData): Model<'series_panels'> {
  const values = d.line ?? [];
  const n = values.length;
  const ticks = new Array<string>(n).fill('');
  if (d.labelAt && d.labels.length === d.labelAt.length) {
    d.labelAt.forEach((index, k) => {
      const label = d.labels[k];
      if (label !== undefined && index >= 0 && index < n) ticks[index] = label;
    });
  } else {
    d.labels.forEach((label, k) => {
      const index = n === 1 ? 0 : Math.round((k * (n - 1)) / Math.max(1, d.labels.length - 1));
      if (label) ticks[index] = label;
    });
  }
  return {
    kind: 'series_panels',
    x: { start: 0, end: n - 1, ticks },
    marks: [],
    panels: [
      {
        title: d.metric,
        series: [{ name: d.metric, role: S1, width: 2, values: [...values] }],
      },
    ],
    alt: `${d.metric}: ${d.headline}`,
  } as Model<'series_panels'>;
}

/** Một biểu đồ đại diện: đường chỉ tiêu, kèm cột thành phần nếu bản mẫu có vẽ cột. */
function buildRepresentative(d: RepresentativeData): ChartModel {
  const line = d.line;
  const bar = d.bar;
  if (line && bar)
    return {
      kind: 'compare',
      layout: 'stack',
      title: d.metric,
      items: [
        { title: d.metric, model: lineModel(d) },
        { title: 'Thành phần', model: barModel(d) },
      ],
    } as Model<'compare'>;
  if (bar) return barModel(d);
  if (!line) throw new Error('representative chart has no data');
  if (line.length > MAX_LABELS) return denseModel(d);
  return lineModel(d);
}

/** Registry riêng cho biểu đồ đại diện (id `c{chapter}l{lesson}-rep`). */
export const REPRESENTATIVE_BUILDERS: Readonly<Record<string, Builder>> = Object.fromEntries(
  Object.entries(REPRESENTATIVE_DATA).map(([id, d]) => [id, () => buildRepresentative(d)]),
);

export { GD, P3 };
