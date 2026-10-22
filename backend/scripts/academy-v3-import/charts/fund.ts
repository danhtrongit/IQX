/**
 * Helper dùng chung cho Chương 8-13 (chỉ tiêu cơ bản).
 *
 * Bản mẫu v3.3 vẽ các biểu đồ này bằng mấy hàm dùng chung nằm trong page script:
 * `bars()`, `lines()`, `chart()`, `gauge()`, `zones()`, `hb()`, `wf()`. Mỗi hàm ở đây dựng
 * đúng mô hình chart của backend tương ứng, giữ nguyên số liệu và ngữ nghĩa của bản mẫu:
 *
 * - `bars()`   -> `category` (grouped / stacked)
 * - `lines()`  -> `category` mode 'line' (có `refs` -> `threshold`, `band` -> `series_panels`)
 * - `chart()`  -> `series_panels` (đường + dải trung bình ± độ lệch chuẩn + đường bình quân)
 * - `gauge()`  -> `scale` (các vùng tham chiếu + vạch chỉ báo)
 * - `zones()`  -> `scale` (các vùng tham chiếu + vạch chỉ báo)
 * - `hb()`     -> `category` orientation 'h' (cột ngang)
 * - `wf()`     -> `schematic` (cột bậc thang: cột chồng theo mốc lũy kế)
 *
 * Không thêm loại chart mới: mọi mô hình trên đã có sẵn trong `schema.ts`.
 */
import type { ChartTone } from '../../../src/modules/academy/content/v3/schema.js';
import type { Builder, Category, Flow, Layer, Model, Scale, Schematic } from './kit.js';
import { tone } from './tones.js';

/** Màu chuẩn của bản mẫu cho chỉ tiêu cơ bản. */
export const UP = tone('#2bb886');
export const DN = tone('#e66767');
export const S1 = tone('#3987e5');
export const S2 = tone('#d95926');
export const S3 = tone('#199e70');
export const GD = tone('#dfb969');
export const OR = tone('#ff9f6e');
export const PK = tone('#e879f9');
export const GR = tone('#2bb886');
export const NEG = tone('#e66767');
export const P3 = tone('#6d8399');
export const PRICE = 'price' as const;

/** Làm tròn 4 chữ số như `round4` của bản mẫu. */
export const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;

/** Bỏ ký tự `−` (U+2212) để tránh vi phạm quy tắc copy hiển thị. */
export const minus = (v: number): string => (v < 0 ? '-' : '');

/* ------------------------------------------------------------------ bars() */

/** Một chuỗi số liệu của `bars()`. */
export interface BarsSeries {
  name: string;
  values: readonly (number | null)[];
  tone: ChartTone;
  /** Tô màu theo dấu của từng giá trị thay vì theo series. */
  toneBySign?: { pos: ChartTone; neg: ChartTone };
  perBarTones?: readonly (ChartTone | null)[];
}

export interface BarsOptions {
  labels: readonly string[];
  series: readonly BarsSeries[];
  stacked?: boolean;
  unit?: string;
  /** Hiện số trên đầu cột. */
  values?: boolean;
  title?: string;
  refs?: readonly { value: number; label?: string; tone?: ChartTone }[];
}

/**
 * `bars()` của bản mẫu -> `category`.
 *
 * Bản mẫu vẽ cột chồng bằng cách cộng dồn từ 0 theo thứ tự series; mô hình `category` mode
 * 'stacked' cũng cộng dồn như vậy (series dương chồng lên trên, series âm chồng xuống dưới),
 * nên số liệu hiển thị trùng bản mẫu.
 */
export function bars(o: BarsOptions): Category {
  const ref = o.refs?.[0];
  const series = o.series.map((se) => ({
    name: se.name,
    values: se.values.map((v) => (v === null ? null : r4(v))),
    ...(se.toneBySign ? { tone_by_sign: se.toneBySign } : { tone: se.tone }),
    ...(se.perBarTones ? { per_bar_tones: [...se.perBarTones] } : {}),
  }));
  return {
    kind: 'category',
    mode: o.stacked ? 'stacked' : 'grouped',
    ...(o.title ? { title: o.title } : {}),
    labels: [...o.labels],
    unit: o.unit ?? '',
    series,
    value_labels: o.values ? 'all' : 'none',
    ...(ref
      ? {
          threshold: {
            value: ref.value,
            label: ref.label ?? fmtNum(ref.value),
            ...(ref.tone === 'pos' ? { tone_at_or_above: 'pos' as const } : {}),
            ...(ref.tone === 'neg' ? { tone_below: 'neg' as const } : {}),
          },
        }
      : {}),
  } as Category;
}

/* ------------------------------------------------------------------ lines() */

export interface LinesSeries {
  name: string;
  values: readonly (number | null)[];
  tone: ChartTone;
  dash?: boolean;
}

export interface LinesOptions {
  labels: readonly string[];
  series: readonly LinesSeries[];
  unit?: string;
  /** Đường tham chiếu ngang của bản mẫu (`refs`). */
  refs?: readonly { value: number; label?: string; tone?: ChartTone }[];
  values?: boolean;
  title?: string;
}

/** `lines()` của bản mẫu -> `category` mode 'line'. */
export function lines(o: LinesOptions): Category {
  const ref = o.refs?.[0];
  return {
    kind: 'category',
    mode: 'line',
    ...(o.title ? { title: o.title } : {}),
    labels: [...o.labels],
    unit: o.unit ?? '',
    series: o.series.map((se) => ({
      name: se.name,
      values: se.values.map((v) => (v === null ? null : r4(v))),
      tone: se.tone,
      ...(se.dash ? { dash: true as const } : {}),
    })),
    value_labels: o.values ? 'all' : 'none',
    ...(ref
      ? {
          threshold: {
            value: ref.value,
            label: ref.label ?? fmtNum(ref.value),
            ...(ref.tone === 'pos' ? { tone_at_or_above: 'pos' as const } : {}),
            ...(ref.tone === 'neg' ? { tone_below: 'neg' as const } : {}),
          },
        }
      : {}),
  } as Category;
}

/* ------------------------------------------------------------------ chart() */

/** `chart()` của bản mẫu (Chương 9): đường + dải bình quân ± độ lệch chuẩn + đường bình quân. */
export interface ChartOptions {
  labels: readonly string[];
  values: readonly number[];
  tone?: ChartTone;
  /** Khoảng thẳng của thang giá trị. */
  lo: number;
  hi: number;
  step: number;
  /** Vẽ vạch từ giá trị xuống bình quân (bản mẫu dùng cho `gaps`). */
  gaps?: boolean;
  alt?: string;
}

/** Bình quân và độ lệch chuẩn (công thức của bản mẫu). */
export function meanSd(a: readonly number[]): { m: number; d: number } {
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  const d = Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length);
  return { m, d };
}

/**
 * `chart()` của bản mẫu -> `series_panels` một khung: đường dữ liệu, dải trung vị và
 * đường bình quân (đường nét đứt).
 */
export function meanBandChart(o: ChartOptions): Model<'series_panels'> {
  const { m, d } = meanSd(o.values);
  const n = o.values.length;
  const upper = Array.from({ length: n }, () => r4(m + d));
  const lower = Array.from({ length: n }, () => r4(m - d));
  return {
    kind: 'series_panels',
    x: { start: 0, end: n - 1, ticks: [...o.labels] },
    marks: [],
    panels: [
      {
        title: '',
        bounds: [o.lo, o.hi],
        series: [
          { name: 'Giá trị', role: o.tone ?? S1, width: 2, values: o.values.map(r4) },
        ],
        band: { upper, lower, tone: o.tone ?? S1 },
        levels: [{ value: r4(m), role: 'avg', label: `Bình quân ${r4(m)}` }],
        ...(o.gaps
          ? {
              segments: o.values.map((v, i) => ({
                from: [i, r4(m)] as [number, number],
                to: [i, r4(v)] as [number, number],
                tone: OR,
              })),
            }
          : {}),
      },
    ],
    ...(o.alt ? { alt: o.alt } : {}),
  } as Model<'series_panels'>;
}

/* ------------------------------------------------------------------ gauge() */

/** `gauge()` của bản mẫu (Chương 9): thang có 3 vùng tham chiếu và vạch chỉ báo doanh nghiệp mẫu. */
export interface GaugeOptions {
  max: number;
  cuts: readonly [number, number];
  names: readonly [string, string, string];
  value: number;
  label: string;
  unit: string;
  decimals?: number;
  alt?: string;
}

export function gauge(o: GaugeOptions): Scale {
  const dec = o.decimals ?? 0;
  const fmt = (v: number): string =>
    v.toLocaleString('vi-VN', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    });
  return {
    kind: 'scale',
    orientation: 'h',
    domain: [0, o.max],
    ticks: [
      { v: 0, label: `0 ${o.unit}` },
      { v: o.cuts[0], label: fmt(o.cuts[0]) },
      { v: o.cuts[1], label: fmt(o.cuts[1]) },
      { v: o.max, label: `${fmt(o.max)}+` },
    ],
    zones: [
      { from: 0, to: o.cuts[0], tone: UP, label: o.names[0] },
      { from: o.cuts[0], to: o.cuts[1], tone: GD, label: o.names[1] },
      { from: o.cuts[1], to: o.max, tone: DN, label: o.names[2] },
    ],
    markers: [{ v: o.value, label: o.label, tone: S1, side: 'a' }],
    ...(o.alt ? { alt: o.alt } : {}),
  } as Scale;
}

/* ------------------------------------------------------------------ zones() */

/** `zones()` của bản mẫu (Chương 11): thang phân vùng theo mức độ an toàn của chỉ tiêu. */
export interface ZonesOptions {
  min: number;
  max: number;
  segs: readonly (readonly [number, number, string, ChartTone])[];
  ticks: readonly number[];
  mark?: readonly [number, string];
  unit?: string;
  alt?: string;
}

export function zones(o: ZonesOptions): Scale {
  return {
    kind: 'scale',
    orientation: 'h',
    domain: [o.min, o.max],
    ticks: o.ticks.map((v) => ({ v, label: fmtNum(v, v % 1 ? 1 : 0) })),
    zones: o.segs.map(([from, to, label, tone]) => ({ from, to, tone, label })),
    ...(o.mark ? { markers: [{ v: o.mark[0], label: o.mark[1], tone: S1, side: 'a' }] } : {}),
    ...(o.unit ? { ends: [`${o.min}`, `${o.max} ${o.unit}`] } : {}),
    ...(o.alt ? { alt: o.alt } : {}),
  } as Scale;
}

/** Định dạng số kiểu Việt Nam (dấu chấm thập phân, dấu phân cách nghìn). */
export function fmtNum(v: number, digits = 0): string {
  return v.toLocaleString('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/* ------------------------------------------------------------------ hb() */

/** Một mục của `hb()` (cột ngang). */
export interface HbItem {
  label: string;
  value: number;
  tone?: ChartTone;
  /** Làm nổi bật mục đang xét. */
  bold?: boolean;
}

export interface HbOptions {
  items: readonly HbItem[];
  unit?: string;
  decimals?: number;
  /** Vạch tham chiếu ngang (`ref`). */
  ref?: readonly [number, string];
  title?: string;
}

/** `hb()` của bản mẫu -> `category` orientation 'h'. */
export function hb(o: HbOptions): Category {
  const baseTone = o.items[0]?.tone ?? S1;
  const hasVaryingTones = o.items.some((it) => (it.tone ?? baseTone) !== baseTone);
  const unitTrim = o.unit?.trim();
  return {
    kind: 'category',
    mode: 'grouped',
    ...(o.title ? { title: o.title } : {}),
    labels: o.items.map((it) => it.label),
    unit: unitTrim ?? '',
    series: [
      {
        name: o.title ?? 'Giá trị',
        values: o.items.map((it) => r4(it.value)),
        tone: baseTone,
        ...(hasVaryingTones ? { per_bar_tones: o.items.map((it) => it.tone ?? baseTone) } : {}),
      },
    ],
    orientation: 'h',
    value_labels: 'all',
    ...(o.unit
      ? {
          value_format: {
            suffix: o.unit.startsWith('%') ? '%' : ` ${o.unit.trim()}`,
            ...(o.decimals !== undefined ? { decimals: o.decimals } : {}),
          },
        }
      : o.decimals !== undefined
        ? { value_format: { decimals: o.decimals } }
        : {}),
    ...(o.ref
      ? { threshold: { value: o.ref[0], label: o.ref[1], tone_at_or_above: 'p5' as const } }
      : {}),
  } as Category;
}

/* ------------------------------------------------------------------ wf() */

/** Một bước của `wf()` (biểu đồ bậc thang). */
export interface WfStep {
  /** Nhãn bước (có thể nhiều dòng, ngăn bằng `|`). */
  label: string;
  value: number;
  /** `base` = cột gốc, `add` = cộng, `sub` = trừ, `total` = cột tổng. */
  kind: 'base' | 'add' | 'sub' | 'total';
  tone: ChartTone;
  decimals?: number;
}

export interface WfOptions {
  steps: readonly WfStep[];
  unit?: string;
  alt?: string;
}

/**
 * `wf()` của bản mẫu -> `schematic` với lớp cột chồng theo mốc lũy kế.
 *
 * Bản mẫu vẽ mỗi bước là một cột đứng từ mốc lũy kế trước đó tới mốc lũy kế sau đó (cột
 * treo), và nối bằng đường nét đứt. Mô hình `schematic` vẽ đúng hình học này: mỗi bước là
 * một lớp `bars` riêng với `base` là mốc lũy kế của bước đó.
 */
export function wf(o: WfOptions): Schematic {
  const layers: Layer[] = [];
  const n = o.steps.length;
  let acc = 0;
  let hi = 0;
  let lo = 0;
  o.steps.forEach((st) => {
    const from = st.kind === 'base' || st.kind === 'total' ? 0 : acc;
    const to =
      st.kind === 'base'
        ? st.value
        : st.kind === 'total'
          ? acc
          : st.kind === 'add'
            ? acc + st.value
            : acc - st.value;
    acc = st.kind === 'base' ? st.value : st.kind === 'total' ? acc : st.kind === 'add' ? acc + st.value : acc - st.value;
    hi = Math.max(hi, from, to);
    lo = Math.min(lo, from, to);
  });
  const xs = o.steps.map((_, i) => i);
  acc = 0;
  o.steps.forEach((st, i) => {
    const from = st.kind === 'base' || st.kind === 'total' ? 0 : acc;
    const to =
      st.kind === 'base'
        ? st.value
        : st.kind === 'total'
          ? acc
          : st.kind === 'add'
            ? acc + st.value
            : acc - st.value;
    acc = st.kind === 'base' ? st.value : st.kind === 'total' ? acc : st.kind === 'add' ? acc + st.value : acc - st.value;
    const x = xs[i] as number;
    layers.push({
      t: 'bars',
      x: [x],
      h: [r4(to - from)],
      tones: [st.tone],
      base: r4(from),
    });
    const dec = st.decimals ?? 0;
    const txt =
      st.kind === 'total'
        ? fmtNum(acc, dec)
        : st.kind === 'add'
          ? `+${fmtNum(st.value, dec)}`
          : st.kind === 'sub'
            ? `\u2212${fmtNum(st.value, dec)}`
            : fmtNum(st.value, dec);
    layers.push({
      t: 'text',
      at: [x, Math.max(from, to)],
      text: txt,
      tone: st.kind === 'total' ? 'warn' : 'price',
      anchor: 'middle',
    });
  });
  const span = Math.max(hi - lo, 10);
  return {
    kind: 'schematic',
    domain: { x: [-0.5, n - 0.5], y: [r4(lo - span * 0.08), r4(hi + span * 0.14)] },
    axes: {
      x: {
        ticks: o.steps.map((st, i) => ({ v: i, label: st.label.replace(/\|/g, ' ') })),
      },
      y: { ticks: [] },
    },
    layers,
    ...(o.alt ? { alt: o.alt } : {}),
  } as Schematic;
}

/* ------------------------------------------------------------------ flow() */

/** Một hộp công thức của bản mẫu (Chương 8-13 vẽ bằng `panel` + `big`). */
export interface FlowCard {
  id: string;
  title: string;
  value?: string;
  sub?: string;
  tone?: ChartTone;
  emph?: boolean;
  children?: { title: string; sub?: string; tone?: ChartTone }[];
}

/** Công thức nối các hộp -> `flow` (hộp + mũi tên, giá trị hiện trong hộp). */
export function formulaFlow(cards: readonly FlowCard[], alt: string): Flow {
  return {
    kind: 'flow',
    layout: 'row',
    nodes: cards.map((c) => ({
      id: c.id,
      title: c.title,
      ...(c.value ? { value: c.value } : {}),
      ...(c.sub ? { sub: c.sub } : {}),
      ...(c.tone ? { tone: c.tone } : {}),
      ...(c.emph ? { emph: true as const } : {}),
      ...(c.children ? { children: c.children } : {}),
    })),
    edges: 'sequential',
    alt,
  } as Flow;
}

/** Danh sách builder cho một chương. */
export type ChapterBuilders = Record<string, Builder>;
