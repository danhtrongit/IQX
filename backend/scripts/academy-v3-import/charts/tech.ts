/**
 * Thư viện vẽ của Chương 6-13 (port từ page script của bản mẫu v3.3).
 *
 * Bản mẫu vẽ bằng SVG trực tiếp; ở đây cùng bộ số liệu được đổi sang mô hình chart của backend
 * (`series_panels`, `category`, `compare`...). Công thức RNG, MA/EMA/DMI/Donchian được port
 * nguyên văn: không "sửa" chúng, các giá trị vàng trong `verify.ts` phụ thuộc vào đúng công thức này.
 */
import type {
  ChartModel,
  ChartTone,
  LeafChartModel,
} from '../../../src/modules/academy/content/v3/schema.js';
import type { Builder, LegendItem, Model, Panel, Point, SeriesPanels } from './kit.js';
import { candles } from './kit.js';
import type { Num } from './math.js';
import { at, rng, round4 } from './math.js';

export type { Num };

/* ============================================================== dữ liệu giá */

/** Kết quả `gen(seed, segs, base)` của bản mẫu: OHLC + khối lượng giả định. */
export interface PriceSeries {
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
  n: number;
}

/**
 * `gen(seed, segs, base)`: giá ngẫu nhiên theo từng đoạn drift, nhiễu Gauss (Box-Muller) từ
 * `rng(seed)` của bản mẫu.
 */
export function gen(
  seed: number,
  segs: readonly (readonly [number, number, number])[],
  base = 25000,
): PriceSeries {
  const r = rng(seed);
  const g = () => {
    let u = 0;
    let w = 0;
    while (!u) u = r();
    while (!w) w = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
  };
  let p = base;
  const o: number[] = [];
  const h: number[] = [];
  const l: number[] = [];
  const c: number[] = [];
  const v: number[] = [];
  for (const [n, mu, sd] of segs)
    for (let k = 0; k < n; k++) {
      const ret = Math.max(-0.065, Math.min(0.065, mu + sd * g()));
      const op = p * (1 + sd * 0.3 * g());
      const cl = p * (1 + ret);
      const hi = Math.max(op, cl) * (1 + Math.abs(sd * 0.45 * g()));
      const lo = Math.min(op, cl) * (1 - Math.abs(sd * 0.45 * g()));
      o.push(op);
      h.push(hi);
      l.push(lo);
      c.push(cl);
      v.push((0.8 + 0.6 * r()) * (1 + Math.abs(ret) * 25));
      p = cl;
    }
  return { o, h, l, c, v, n: c.length };
}

/** `ema(a,n)` của Chương 6-13: seed bằng SMA của n giá trị đầu, null trước đó. */
export function emaSeeded(a: readonly number[], n: number): Num[] {
  const k = 2 / (n + 1);
  const out: Num[] = [];
  let e: number | null = null;
  a.forEach((x, i) => {
    if (i < n - 1) {
      out.push(null);
      return;
    }
    if (e === null) e = a.slice(0, n).reduce((s, y) => s + y, 0) / n;
    else e = x * k + e * (1 - k);
    out.push(e);
  });
  return out;
}

/** `dmi(d,n)` của bản mẫu: +DI và −DI theo Wilder. */
export function dmiOf(d: PriceSeries, n: number): { p: Num[]; m: Num[] } {
  const P: Num[] = Array.from({ length: d.n }, () => null);
  const M: Num[] = Array.from({ length: d.n }, () => null);
  let sp = 0;
  let sm = 0;
  let st = 0;
  for (let i = 1; i < d.n; i++) {
    const h = at(d.h, i);
    const h0 = at(d.h, i - 1);
    const l = at(d.l, i);
    const l0 = at(d.l, i - 1);
    const c0 = at(d.c, i - 1);
    const up = h - h0;
    const dn = l0 - l;
    const pd = up > dn && up > 0 ? up : 0;
    const md = dn > up && dn > 0 ? dn : 0;
    const tr = Math.max(h - l, Math.abs(h - c0), Math.abs(l - c0));
    if (i <= n) {
      sp += pd;
      sm += md;
      st += tr;
    } else {
      sp = sp - sp / n + pd;
      sm = sm - sm / n + md;
      st = st - st / n + tr;
    }
    if (i >= n) {
      P[i] = (100 * sp) / st;
      M[i] = (100 * sm) / st;
    }
  }
  return { p: P, m: M };
}

/** `don(d,n)` của bản mẫu: biên trên/dưới của n phiên TRƯỚC (không gồm phiên đang xét). */
export function donchian(d: PriceSeries, n: number): { u: Num[]; l: Num[] } {
  const u: Num[] = [];
  const l: Num[] = [];
  for (let i = 0; i < d.n; i++) {
    if (i < n) {
      u.push(null);
      l.push(null);
      continue;
    }
    u.push(Math.max(...d.h.slice(i - n, i)));
    l.push(Math.min(...d.l.slice(i - n, i)));
  }
  return { u, l };
}

/** `crosses(f,sl,from,to)` của bản mẫu: chỉ tính khi cả hai đường có giá trị. */
export function crossUps(
  f: readonly Num[],
  s: readonly Num[],
  from: number,
  to: number,
): { i: number; up: boolean }[] {
  const out: { i: number; up: boolean }[] = [];
  for (let i = Math.max(from, 1); i < to; i++) {
    const f0 = f[i - 1];
    const s0 = s[i - 1];
    const f1 = f[i];
    const s1 = s[i];
    if (f0 === null || s0 === null || f1 === null || s1 === null) continue;
    if (f0 === undefined || s0 === undefined || f1 === undefined || s1 === undefined) continue;
    if (f0 <= s0 && f1 > s1) out.push({ i, up: true });
    else if (f0 >= s0 && f1 < s1) out.push({ i, up: false });
  }
  return out;
}

/* ============================================================== dựng mô hình */

/** Khoảng giá của bản mẫu: min/max trong cửa sổ, nới 6% (như `price()` của bản mẫu). */
export function priceBounds(
  d: PriceSeries,
  from: number,
  to: number,
  extra: readonly (readonly Num[])[] = [],
): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = from; i < to; i++) {
    lo = Math.min(lo, at(d.l, i));
    hi = Math.max(hi, at(d.h, i));
    for (const a of extra) {
      const v = a[i];
      if (v !== null && v !== undefined) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
  }
  const pad = (hi - lo) * 0.06;
  return [lo - pad, hi + pad];
}

export interface Overlay {
  name: string;
  values: readonly Num[];
  role: ChartTone;
  width?: 1 | 2 | 3;
  dash?: true;
}

export interface PricePanelOptions {
  /** false: vẽ đường giá đóng cửa thay cho nến. */
  candles?: boolean;
  overlays?: readonly Overlay[];
  /** Vùng tô màu giữa hai đường (kênh Donchian). */
  band?: { upper: readonly Num[]; lower: readonly Num[]; tone: ChartTone };
  /** Bảng chỉ báo dưới (oscillator): +DI/-DI, RSI... */
  osc?: readonly Overlay[];
  /** Đường tham chiếu của bảng chỉ báo. */
  oscLevels?: { value: number; role: 'buy' | 'sell' | 'neutral' | 'avg'; label?: string }[];
  /** Thang cố định của bảng chỉ báo (bản mẫu truyền `fix` cho `osc`). */
  oscBounds?: [number, number];
  /** Vùng giá trị tô màu trong bảng chỉ báo (quá mua / quá bán của Chương 7). */
  oscZones?: { from: number; to: number; tone: ChartTone; label?: string }[];
  /** Vùng tô nền theo trạng thái (ví dụ +DI > -DI). */
  oscShade?: { from: number; to: number; tone: ChartTone; label?: string }[];
  /** Cột phân kỳ tô màu theo dấu (bản mẫu vẽ cột từ mốc 0 tới giá trị chỉ báo). */
  oscBars?: { name: string; values: readonly Num[]; colors: readonly ('pos' | 'neg')[] };
  marks?: { i: number; label: string }[];
  points?: Point[];
  alt: string;
  titles?: [string, string];
}

/**
 * Biểu đồ giá của Chương 6-7: nến (hoặc đường giá) + các đường chồng, kèm bảng chỉ báo dưới.
 * Mọi chỉ số là chỉ số tuyệt đối trong cửa sổ `[from, to)`.
 */
export function pricePanels(
  d: PriceSeries,
  from: number,
  to: number,
  opts: PricePanelOptions,
): SeriesPanels {
  const slice = (a: readonly Num[]): Num[] => a.slice(from, to).map((v) => (v === null ? null : round4(v)));
  const overlays = opts.overlays ?? [];
  const extra = overlays.map((o) => o.values);
  const bounds = priceBounds(d, from, to, extra);

  const pricePanel: Panel = {
    title: opts.titles?.[0] ?? '',
    bounds,
    series: [],
  };
  if (opts.candles === false) {
    pricePanel.series.push({
      name: 'Giá đóng cửa',
      role: 'price',
      width: 2,
      values: slice(d.c) as number[],
    });
  } else {
    const rows: number[][] = [];
    for (let i = from; i < to; i++)
      rows.push([at(d.o, i), at(d.h, i), at(d.l, i), at(d.c, i)]);
    pricePanel.candles = candles(rows);
  }
  for (const o of overlays)
    pricePanel.series.push({
      name: o.name,
      role: o.role,
      ...(o.width ? { width: o.width } : {}),
      ...(o.dash ? { dash: true as const } : {}),
      values: slice(o.values),
    });
  if (opts.band)
    pricePanel.band = {
      upper: slice(opts.band.upper),
      lower: slice(opts.band.lower),
      tone: opts.band.tone,
    };

  const panels: Panel[] = [pricePanel];
  if (opts.osc) {
    const oscPanel: Panel = {
      title: opts.titles?.[1] ?? '',
      series: opts.osc.map((o) => ({
        name: o.name,
        role: o.role,
        ...(o.width ? { width: o.width } : {}),
        values: slice(o.values),
      })),
    };
    const vals = opts.osc.flatMap((o) => slice(o.values).filter((v): v is number => v !== null));
    if (opts.oscBounds) oscPanel.bounds = opts.oscBounds;
    else if (vals.length) {
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      const pad = (hi - lo) * 0.08;
      oscPanel.bounds = [lo - pad, hi + pad];
    }
    if (opts.oscZones) oscPanel.zones = opts.oscZones;
    if (opts.oscBars)
      oscPanel.bars = {
        name: opts.oscBars.name,
        values: slice(opts.oscBars.values),
        colors: opts.oscBars.colors.slice(from, to) as ('pos' | 'neg' | 'neutral')[],
      };
    if (opts.oscLevels)
      oscPanel.levels = opts.oscLevels.map((l) => ({
        value: l.value,
        role: l.role,
        ...(l.label ? { label: l.label } : {}),
      }));
    panels.push(oscPanel);
  }

  const model: SeriesPanels = {
    kind: 'series_panels',
    x: { start: from, end: to - 1 },
    marks: opts.marks ?? [],
    panels,
    alt: opts.alt,
  };
  if (opts.points) model.points = opts.points;
  if (opts.oscShade) model.x.shade = opts.oscShade;
  return model;
}

/** Điểm đánh dấu trên biểu đồ giá (vòng tròn của bản mẫu). */
export const ring = (
  i: number,
  panel: number,
  value: number,
  tone: ChartTone,
  label?: string,
): Point => ({
  i,
  panel,
  value: round4(value),
  tone,
  shape: 'ring',
  ...(label ? { label } : {}),
});

/* ============================================================== biểu đồ cơ bản */

/** Một cột của biểu đồ cơ bản: nhãn + giá trị + tone. */
export interface CatSeries {
  name: string;
  values: number[];
  tone?: ChartTone;
}

export const cat = (
  labels: readonly string[],
  series: readonly CatSeries[],
  opts: {
    mode?: 'grouped' | 'stacked' | 'line';
    unit?: string;
    title?: string;
    sublabels?: string[];
    value_labels?: 'all' | 'last' | 'none';
    value_format?: { sign?: true; suffix?: string };
    threshold?: { value: number; label: string; tone_at_or_above?: ChartTone; tone_below?: ChartTone };
    end_labels?: string[];
    bounds?: [number, number];
    ticks?: number[];
    caption_value?: string;
    caption_tone?: 'price' | 'p1' | 'p2' | 'p4' | 'p5' | 'pos' | 'neg' | 'warn' | 'info';
    animate?: 'draw';
  } = {},
): Model<'category'> => ({
  kind: 'category',
  mode: opts.mode ?? 'grouped',
  ...(opts.title ? { title: opts.title } : {}),
  labels: [...labels],
  ...(opts.sublabels ? { sublabels: [...opts.sublabels] } : {}),
  unit: opts.unit ?? '',
  series: series.map((s) => ({
    name: s.name,
    values: s.values.map((v) => round4(v)),
    ...(s.tone ? { tone: s.tone } : {}),
  })),
  ...(opts.value_labels ? { value_labels: opts.value_labels } : {}),
  ...(opts.value_format ? { value_format: opts.value_format } : {}),
  ...(opts.threshold ? { threshold: opts.threshold } : {}),
  ...(opts.end_labels ? { end_labels: [...opts.end_labels] } : {}),
  ...(opts.bounds ? { bounds: opts.bounds } : {}),
  ...(opts.ticks ? { ticks: [...opts.ticks] } : {}),
  ...(opts.caption_value ? { caption_value: opts.caption_value } : {}),
  ...(opts.caption_tone ? { caption_tone: opts.caption_tone } : {}),
  ...(opts.animate ? { animate: opts.animate } : {}),
});

/** So sánh hai hoặc nhiều biểu đồ nhỏ (mô hình `compare`). */
export const compare = (
  items: readonly { title?: string; tone?: ChartTone; model: LeafChartModel }[],
  layout: 'row' | 'stack' = 'row',
  title?: string,
): Model<'compare'> => ({
  kind: 'compare',
  layout,
  ...(title ? { title } : {}),
  items: items.map((i) => ({
    ...(i.title ? { title: i.title } : {}),
    ...(i.tone ? { tone: i.tone } : {}),
    model: i.model,
  })),
});

/** Legend dùng chung: nhãn + tone. */
export const legend = (...items: readonly (readonly [string, ChartTone])[]): LegendItem[] =>
  items.map(([label, tone]) => ({ label, tone }));

export type { Builder, ChartModel };
