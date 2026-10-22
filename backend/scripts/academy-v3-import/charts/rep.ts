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
import type { ChartModel, ChartTone } from '../../../src/modules/academy/content/v3/schema.js';
import type { Builder, Category, Model } from './kit.js';
import { REPRESENTATIVE_DATA } from './rep-data.js';
import type { RepBarTone, RepresentativeData } from './rep-data.js';
import { fmtNum, meanBandChart, meanSd, r4, S1, S2, S3, GD, UP, DN, P3 } from './fund.js';

/** Số điểm vượt quá mức mà nhãn trục ngang rút gọn được thì dùng `series_panels`. */
const MAX_LABELS = 32;

const BAR_TONE_MAP: Record<RepBarTone, ChartTone> = {
  S1,
  S2,
  S3,
};

/** Trung vị của dãy số. */
function medianOf(a: readonly number[]): number {
  const b = [...a].sort((p, q) => p - q);
  const k = b.length >> 1;
  return b.length % 2 ? (b[k] as number) : ((b[k - 1] as number) + (b[k] as number)) / 2;
}

/** Đường chỉ tiêu: `category` mode 'line' (nhãn trục ngang là các kỳ). */
function lineModel(d: RepresentativeData, opts: { showCaption?: boolean } = {}): Category {
  const values = d.line ?? [];
  const hasNegative = values.some((v) => v < 0);
  return {
    kind: 'category',
    mode: 'line',
    labels: d.labels.length === values.length ? [...d.labels] : d.labels.map((_, i) => String(i + 1)),
    unit: d.unit ?? '',
    series: [{ name: d.lineName ?? d.metric, values: [...values], tone: S1 }],
    value_labels: 'none',
    ...(d.threshold
      ? { threshold: { value: d.threshold.value, label: d.threshold.label } }
      : hasNegative
        ? { threshold: { value: 0, label: '0' } }
        : {}),
    ...(opts.showCaption !== false
      ? { caption_value: d.headline, caption_tone: 'price' as const }
      : {}),
  } as Category;
}

/** Khung cột thành phần phía dưới của 19 biểu đồ Chương 8, 10, 11, 12. */
function subBarModel(d: RepresentativeData): Category {
  const sub = d.sub!;
  return {
    kind: 'category',
    mode: sub.mode,
    labels: [...d.labels],
    unit: sub.unit,
    series: sub.series.map((s) => ({
      name: s.name,
      values: [...s.values],
      tone: BAR_TONE_MAP[s.tone],
    })),
    value_labels: 'none',
    caption_value: d.headline,
    caption_tone: 'price',
  } as Category;
}

/** Biểu đồ CAGR (c8l4-rep..c8l6-rep): cột thường niên màu xanh S1 + đường đứt nét Theo CAGR trên cùng biểu đồ. */
function cagrModel(d: RepresentativeData): Category {
  const bars = d.bar ?? [];
  const line = d.line ?? [];
  return {
    kind: 'category',
    mode: 'grouped',
    labels: [...d.labels],
    unit: d.unit ?? '',
    series: [
      {
        name: d.barName ?? d.metric,
        values: [...bars],
        tone: S1,
      },
      {
        name: d.lineName ?? 'Theo CAGR',
        values: [...line],
        tone: GD,
        dash: true,
      },
    ],
    value_labels: 'none',
    caption_value: d.headline,
    caption_tone: 'price',
  } as Category;
}

/** Cột chuỗi năm dương liên tiếp (c9l1-rep, c12l5-rep): dương S1, âm DN, cột dương trước năm lỗ tô mờ (neutral). */
function barModel(d: RepresentativeData): Category {
  const values = d.bar ?? [];
  const fadedBefore = d.fadedBefore ?? 0;
  const perBarTones =
    fadedBefore > 0
      ? values.map((v, i) => (v < 0 ? DN : i < fadedBefore ? ('neutral' as const) : S1))
      : undefined;
  return {
    kind: 'category',
    mode: 'grouped',
    labels: d.labels.length === values.length ? [...d.labels] : d.labels.map((_, i) => String(i + 1)),
    unit: d.unit ?? '',
    series: [
      {
        name: d.metric,
        values: [...values],
        tone_by_sign: { pos: S1, neg: DN },
        ...(perBarTones ? { per_bar_tones: perBarTones } : {}),
      },
    ],
    value_labels: 'none',
    caption_value: d.headline,
    caption_tone: 'price',
  } as Category;
}

/** Biểu đồ độ ổn định 5 năm (c9l2-rep..c9l5-rep): đường chỉ tiêu + đường đứt nét Bình quân + dải Bình quân ± độ lệch chuẩn. */
function stabilityModel(d: RepresentativeData): Model<'series_panels'> {
  const values = d.line ?? [];
  const { m, d: sd } = meanSd(values);
  const lo = Math.min(0, ...values, m - sd);
  const hi = Math.max(...values, m + sd);
  const pad = (hi - lo) * 0.12 || 1;
  return meanBandChart({
    labels: d.labels,
    values,
    lo: r4(lo >= 0 && lo - pad < 0 ? 0 : lo - pad),
    hi: r4(hi + pad),
    step: r4((hi - lo) / 4),
    alt: `${d.metric}: ${d.headline}`,
  });
}

/**
 * Chuỗi dài (hàng trăm điểm, c13l1..c13l3, c13l5, c13l6): `series_panels` với nhãn trục ngang rút gọn,
 * kèm đường đứt nét Trung vị 3 năm và dải Trung vị ± độ lệch chuẩn.
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
  const median = medianOf(values);
  const { d: sd } = meanSd(values);
  const dec = d.unit === 'lần' ? 2 : 1;
  return {
    kind: 'series_panels',
    x: { start: 0, end: n - 1, ticks },
    marks: [],
    panels: [
      {
        title: d.unit ? `${d.metric} (${d.unit})` : d.metric,
        series: [{ name: d.metric, role: S1, width: 2, values: [...values] }],
        levels: [
          {
            value: r4(median),
            role: 'avg',
            label: `Trung vị 3 năm ${fmtNum(median, dec)}`,
          },
        ],
        zones: [
          {
            from: r4(median - sd),
            to: r4(median + sd),
            tone: 'neutral',
            label: 'Trung vị ± độ lệch chuẩn',
          },
        ],
      },
    ],
    alt: `${d.metric}: ${d.headline}`,
  } as Model<'series_panels'>;
}

/** Một biểu đồ đại diện: dựng đúng khuôn của từng nhóm chỉ tiêu trong Chương 8-13. */
function buildRepresentative(d: RepresentativeData): ChartModel {
  if (d.sub && d.line) {
    return {
      kind: 'compare',
      layout: 'stack',
      items: [
        {
          title: d.unit ? `${d.lineName ?? d.metric} (${d.unit})` : (d.lineName ?? d.metric),
          model: lineModel(d, { showCaption: false }),
        },
        {
          title: d.sub.unit ? `Thành phần (${d.sub.unit})` : 'Thành phần',
          model: subBarModel(d),
        },
      ],
    } as Model<'compare'>;
  }
  if (d.line && d.bar) return cagrModel(d);
  if (d.bar) return barModel(d);
  if (!d.line) throw new Error('representative chart has no data');
  if (d.meanBand) return stabilityModel(d);
  if (d.line.length > MAX_LABELS) return denseModel(d);
  return lineModel(d);
}

/** Registry riêng cho biểu đồ đại diện (id `c{chapter}l{lesson}-rep`). */
export const REPRESENTATIVE_BUILDERS: Readonly<Record<string, Builder>> = Object.fromEntries(
  Object.entries(REPRESENTATIVE_DATA).map(([id, d]) => [id, () => buildRepresentative(d)]),
);

export { GD, UP, P3 };
