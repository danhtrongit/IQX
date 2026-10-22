/**
 * Chương 7 · Chỉ báo động lượng và dòng tiền (Stochastic, CCI, ROC, Williams %R, OBV, MFI, CMF).
 *
 * Số liệu port nguyên văn từ page script của bản mẫu v3.3: cùng seed `gen()`, cùng chu kỳ
 * SMA, cùng cửa sổ hiển thị. Bản mẫu vẽ SVG (nến giá + khung chỉ báo); ở đây cùng dữ liệu đó
 * dựng thành mô hình `series_panels`: khung trên là giá, khung dưới là chỉ báo.
 */
import type { ChartTone } from '../../../src/modules/academy/content/v3/schema.js';
import type { Builder, Model, Point } from './kit.js';
import { gen, pricePanels } from './tech.js';
import type { Num, PriceSeries } from './tech.js';
import { rng, sma } from './math.js';
import { tone } from './tones.js';

const UP = tone('#2bb886');
const DN = tone('#e66767');
const BL = tone('#249bec');
const GD = tone('#dfb969');
const OR = tone('#ff9f6e');
const PK = tone('#e879f9');

/** `mx`/`mn` của bản mẫu: max/min trong đoạn [s, e] (bao gồm hai đầu). */
const mx = (a: readonly number[], s: number, e: number): number => {
  let m = -1e18;
  for (let j = s; j <= e; j++) m = Math.max(m, a[j] as number);
  return m;
};
const mn = (a: readonly number[], s: number, e: number): number => {
  let m = 1e18;
  for (let j = s; j <= e; j++) m = Math.min(m, a[j] as number);
  return m;
};

/** Đọc giá trị chỉ báo: `undefined` (ngoài mảng) và `null` (chưa có) đều là "không có giá trị". */
const nv = (a: readonly Num[], i: number): number | null => {
  const v = a[i];
  return v === undefined ? null : v;
};

/** `smaN` của bản mẫu: trung bình n phần tử, null nếu cửa sổ chứa null. */
const smaN = (a: readonly Num[], n: number): Num[] =>
  a.map((_, i) => {
    if (i < n - 1) return null;
    let t = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const v = a[j];
      if (v === null || v === undefined) return null;
      t += v;
    }
    return t / n;
  });

/* ------------------------------------------------------------------ dữ liệu */

/** Bài 1 · Stochastic. */
const D1 = gen(17, [
  [30, 0.006, 0.015],
  [20, -0.01, 0.017],
  [25, 0.008, 0.015],
  [20, -0.004, 0.016],
  [25, 0.01, 0.014],
  [20, -0.008, 0.016],
  [25, 0.005, 0.015],
], 24000);

/** Bài 2 · CCI. */
const D2 = gen(29, [
  [30, 0.004, 0.014],
  [25, -0.009, 0.016],
  [25, 0.009, 0.015],
  [20, 0, 0.012],
  [25, -0.008, 0.016],
  [25, 0.01, 0.015],
  [20, -0.003, 0.014],
], 26000);

/** Bài 3 · ROC. */
const D3 = gen(9, [
  [35, 0.002, 0.009],
  [30, 0.004, 0.009],
  [25, -0.001, 0.009],
  [30, -0.004, 0.009],
  [25, 0.001, 0.009],
  [25, 0.004, 0.009],
], 22000);

/** Bài 4 · Williams %R. */
const D4 = gen(71, [
  [30, 0.005, 0.014],
  [25, -0.009, 0.016],
  [25, 0.008, 0.015],
  [20, -0.002, 0.014],
  [25, 0.009, 0.014],
  [25, -0.009, 0.016],
  [20, 0.006, 0.015],
], 27000);

/** Bài 5 · OBV. */
const D5 = gen(93, [
  [40, 0.001, 0.012],
  [35, 0.008, 0.013],
  [25, -0.001, 0.012],
  [30, -0.008, 0.014],
  [35, 0.008, 0.013],
], 23000);

/** Bài 6 · MFI. */
const D6 = gen(37, [
  [30, 0.005, 0.014],
  [25, -0.009, 0.016],
  [25, 0.009, 0.015],
  [20, -0.001, 0.013],
  [25, -0.009, 0.016],
  [25, 0.01, 0.014],
  [20, -0.004, 0.015],
], 25000);

/** Bài 7 · Chaikin Money Flow. */
const D7 = gen(64, [
  [30, 0.003, 0.013],
  [30, 0.009, 0.014],
  [25, -0.002, 0.013],
  [30, -0.009, 0.015],
  [25, 0.001, 0.012],
  [30, 0.009, 0.014],
], 21000);

/* ------------------------------------------------------------------ chỉ báo */

/** %K thô: vị trí giá đóng cửa trong khoảng 14 phiên (0-100). */
function stochasticRaw(d: PriceSeries): Num[] {
  return d.c.map((c, i) => {
    if (i < 13) return null;
    const hh = mx(d.h, i - 13, i);
    const ll = mn(d.l, i - 13, i);
    return (100 * (c - ll)) / (hh - ll);
  });
}

/** CCI 20: (TP − SMA20(TP)) / (0,015 × độ lệch tuyệt đối trung bình). */
function cciOf(d: PriceSeries): Num[] {
  const tp = d.c.map((c, i) => (d.h[i] as number + (d.l[i] as number) + c) / 3);
  const m = sma(tp, 20);
  return tp.map((t, i) => {
    const avg = m[i];
    if (avg === null || avg === undefined) return null;
    let md = 0;
    for (let j = i - 19; j <= i; j++) md += Math.abs((tp[j] as number) - avg);
    md /= 20;
    return (t - avg) / (0.015 * md);
  });
}

/** ROC 20: % thay đổi giá đóng cửa so với 20 phiên trước. */
function rocOf(d: PriceSeries, n = 20): Num[] {
  return d.c.map((c, i) => (i < n ? null : (c / (d.c[i - n] as number) - 1) * 100));
}

/** Williams %R 14: −100 (đáy) đến 0 (đỉnh). */
function williamsOf(d: PriceSeries): Num[] {
  return d.c.map((c, i) => {
    if (i < 13) return null;
    const hh = mx(d.h, i - 13, i);
    const ll = mn(d.l, i - 13, i);
    return (-100 * (hh - c)) / (hh - ll);
  });
}

/** OBV: cộng dồn khối lượng theo hướng giá. */
function obvOf(d: PriceSeries): number[] {
  const obv = [0];
  for (let i = 1; i < d.n; i++)
    obv.push(
      obv[i - 1] as number +
        (d.c[i] as number > (d.c[i - 1] as number)
          ? (d.v[i] as number)
          : d.c[i] as number < (d.c[i - 1] as number)
            ? -(d.v[i] as number)
            : 0),
    );
  return obv;
}

/** MFI 14: tỷ trọng dòng tiền dương trong tổng dòng tiền 14 phiên. */
function mfiOf(d: PriceSeries, n = 14): Num[] {
  const tp = d.c.map((c, i) => (d.h[i] as number + (d.l[i] as number) + c) / 3);
  const mf = tp.map((t, i) => t * (d.v[i] as number));
  const flow = (i: number): [number, number] => {
    let p = 0;
    let q = 0;
    for (let j = i - n + 1; j <= i; j++) {
      if ((tp[j] as number) > (tp[j - 1] as number)) p += mf[j] as number;
      else if ((tp[j] as number) < (tp[j - 1] as number)) q += mf[j] as number;
    }
    return [p, q];
  };
  return d.c.map((_, i) => {
    if (i < n) return null;
    const [p, q] = flow(i);
    return (100 * p) / (p + q);
  });
}

/** RSI 14 kiểu Wilder (giống C4L6 nhưng seed bằng trung bình 14 thay đổi đầu). */
function rsiOf(d: PriceSeries, n = 14): Num[] {
  const out: Num[] = Array.from({ length: d.n }, () => null);
  let g = 0;
  let l = 0;
  for (let i = 1; i < d.n; i++) {
    const ch = (d.c[i] as number) - (d.c[i - 1] as number);
    const up = Math.max(ch, 0);
    const dn = Math.max(-ch, 0);
    if (i <= n) {
      g += up;
      l += dn;
      if (i === n) {
        g /= n;
        l /= n;
        out[i] = 100 - 100 / (1 + g / l);
      }
    } else {
      g = (g * (n - 1) + up) / n;
      l = (l * (n - 1) + dn) / n;
      out[i] = 100 - 100 / (1 + g / l);
    }
  }
  return out;
}

/** CMF 20: tổng dòng tiền Chaikin chia tổng khối lượng 20 phiên. */
function cmfOf(d: PriceSeries, n = 20): Num[] {
  const mv = d.c.map((c, i) => {
    const r = (d.h[i] as number) - (d.l[i] as number);
    return r > 0 ? (((2 * c - (d.h[i] as number) - (d.l[i] as number)) / r) * (d.v[i] as number)) : 0;
  });
  return d.c.map((_, i) => {
    if (i < n - 1) return null;
    let a = 0;
    let b = 0;
    for (let j = i - n + 1; j <= i; j++) {
      a += mv[j] as number;
      b += d.v[j] as number;
    }
    return a / b;
  });
}

/** Thang hiển thị của bản mẫu: giá trị trong cửa sổ, nới rộng theo quy tắc của từng chỉ báo. */
function windowBounds(
  values: readonly Num[],
  from: number,
  to: number,
  rule: { min?: number; max?: number; pad?: number; sym?: boolean; floor?: number },
): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = from; i < to; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  if (rule.min !== undefined) lo = Math.min(lo, rule.min);
  if (rule.max !== undefined) hi = Math.max(hi, rule.max);
  if (rule.floor !== undefined) {
    const m = Math.max(Math.abs(lo), Math.abs(hi), rule.floor) * 1.1;
    return [-m, m];
  }
  if (rule.sym) {
    const m = Math.max(Math.abs(lo), Math.abs(hi)) * (rule.pad ?? 1);
    return [-m, m];
  }
  const pad = (hi - lo) * (rule.pad ?? 0.08);
  return [lo - pad, hi + pad];
}

/** Thang hiển thị của CCI trong bản mẫu: min(giá trị, −110) × 1,08 .. max(giá trị, +110) × 1,08. */
function cciBounds(values: readonly Num[], from: number, to: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = from; i < to; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return [Math.min(lo, -110) * 1.08, Math.max(hi, 110) * 1.08];
}

/** Thang hiển thị của CMF trong bản mẫu: đối xứng, m = max(|CMF|) × 1,1, tối thiểu 0,15. */
function cmfBounds(values: readonly Num[], from: number, to: number): [number, number] {
  let m = 0;
  for (let i = from; i < to; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    m = Math.max(m, Math.abs(v));
  }
  const s = Math.max(m, 0.15) * 1.1;
  return [-s, s];
}

/** Màu thanh phân kỳ của bản mẫu: xanh khi tăng, đỏ khi giảm (cùng chỉ số với mảng giá trị). */
const signColors = (values: readonly Num[]): ('pos' | 'neg')[] =>
  values.map((v) => (v !== null && v !== undefined && v < 0 ? 'neg' : 'pos'));

/* ------------------------------------------------------------------ tiện ích */

/** Các điểm Mua/Bán của bản mẫu: giao cắt K qua D kèm vùng quá bán/quá mua. */
function crossSignals(
  fast: readonly Num[],
  slow: readonly Num[],
  from: number,
  to: number,
  over: number,
  under: number,
): { i: number; up: boolean }[] {
  const out: { i: number; up: boolean }[] = [];
  let pos = 0;
  for (let i = from + 1; i < to; i++) {
    const f0 = nv(fast, i - 1);
    const s0 = nv(slow, i - 1);
    const f1 = nv(fast, i);
    const s1 = nv(slow, i);
    if (f0 === null || s0 === null || f1 === null || s1 === null) continue;
    if (pos !== 1 && f0 <= s0 && f1 > s1 && Math.min(f0, s0) < under) {
      out.push({ i, up: true });
      pos = 1;
    } else if (pos !== -1 && f0 >= s0 && f1 < s1 && Math.max(f0, s0) > over) {
      out.push({ i, up: false });
      pos = -1;
    }
  }
  return out;
}

/** Điểm Mua (dưới đáy) / Bán (trên đỉnh) trên khung giá, như C6L3-g3. */
const pricePoints = (
  d: PriceSeries,
  signals: readonly { i: number; up: boolean }[],
): Point[] =>
  signals.map((s) => ({
    i: s.i,
    panel: 0,
    value: Math.round((s.up ? (d.l[s.i] as number) : (d.h[s.i] as number)) * 1e4) / 1e4,
    tone: s.up ? UP : DN,
    shape: 'dot',
    label: s.up ? 'Mua' : 'Bán',
    pos: s.up ? ('below' as const) : ('above' as const),
  }));

/** Vùng tô nền của bản mẫu: các đoạn liên tiếp có điều kiện đúng ( xen kẽ đúng/sai). */
function runs(
  from: number,
  to: number,
  on: (i: number) => boolean,
): { from: number; to: number; up: boolean }[] {
  const out: { from: number; to: number; up: boolean }[] = [];
  let start = from;
  let state = on(from);
  for (let i = from + 1; i < to; i++) {
    const hit = on(i);
    if (hit !== state) {
      out.push({ from: start, to: i - 1, up: state });
      start = i;
      state = hit;
    }
  }
  out.push({ from: start, to: to - 1, up: state });
  return out;
}

export const CH7_BUILDERS: Record<string, Builder> = {
  /* ---------------------------------------------------------- Bài 1 · Stochastic */
  'c7l1-g1': () => {
    const raw = stochasticRaw(D1);
    const K = smaN(raw, 3);
    const D = smaN(K, 3);
    return pricePanels(D1, 40, D1.n, {
      osc: [
        { name: '%D', values: D, role: OR, width: 2 },
        { name: '%K', values: K, role: BL, width: 2 },
      ],
      oscBounds: [0, 100],
      oscLevels: [
        { value: 80, role: 'sell', label: 'Quá mua' },
        { value: 20, role: 'buy', label: 'Quá bán' },
      ],
      oscZones: [
        { from: 80, to: 100, tone: DN },
        { from: 0, to: 20, tone: UP },
      ],
      titles: ['Giá đóng cửa', 'Stochastic %K và %D'],
      alt: 'Giá đóng cửa kèm hai đường Stochastic %K và %D trong thang 0-100, vùng trên 80 là quá mua và dưới 20 là quá bán',
    });
  },
  'c7l1-g2': () => {
    // Vị trí giá đóng cửa trong khoảng 14 phiên: bản mẫu vẽ nến + hai đường cao nhất/thấp nhất
    // + thang 0-100 bên phải. Mô hình: khung giá (nến) + hai mốc ngang cao nhất/thấp nhất.
    const raw = stochasticRaw(D1);
    let i0 = 60;
    let best = 1e9;
    for (let i = 60; i < D1.n; i++) {
      const v = nv(raw, i);
      if (v === null) continue;
      const e = Math.abs(v - 76);
      if (e < best) {
        best = e;
        i0 = i;
      }
    }
    const F = i0 - 13;
    const T = i0 + 1;
    const hh = mx(D1.h, F, i0);
    const ll = mn(D1.l, F, i0);
    const model = pricePanels(D1, F, T, {
      marks: [{ i: i0, label: 'Phiên đang xét' }],
      alt: 'Giá đóng cửa 14 phiên với đường cao nhất và thấp nhất của khoảng, đánh dấu phiên đang xét',
    });
    model.panels[0]!.levels = [
      { value: hh, role: 'sell', label: 'Cao nhất 14 phiên' },
      { value: ll, role: 'buy', label: 'Thấp nhất 14 phiên' },
    ];
    return model;
  },
  'c7l1-g3': () => {
    const raw = stochasticRaw(D1);
    const K = smaN(raw, 3);
    const D = smaN(K, 3);
    const signals = crossSignals(K, D, 40, D1.n, 80, 20);
    return pricePanels(D1, 40, D1.n, {
      osc: [
        { name: '%D', values: D, role: OR, width: 2 },
        { name: '%K', values: K, role: BL, width: 2 },
      ],
      oscBounds: [0, 100],
      oscLevels: [
        { value: 80, role: 'sell', label: 'Quá mua' },
        { value: 20, role: 'buy', label: 'Quá bán' },
      ],
      oscZones: [
        { from: 80, to: 100, tone: DN },
        { from: 0, to: 20, tone: UP },
      ],
      points: pricePoints(D1, signals),
      titles: ['Giá đóng cửa', 'Stochastic %K và %D'],
      alt: 'Giá kèm %K và %D, điểm Mua khi %K cắt lên %D ở vùng dưới 20 và điểm Bán khi %K cắt xuống %D ở vùng trên 80',
    });
  },
  'c7l1-g4': () => {
    // Xu hướng tăng mạnh: %K trên 80 trong thời gian dài nhưng giá vẫn tăng.
    const e = gen(5, [
      [40, 0.001, 0.012],
      [50, 0.011, 0.011],
      [25, -0.006, 0.014],
    ], 20000);
    const raw = stochasticRaw(e);
    const K = smaN(raw, 3);
    const D = smaN(K, 3);
    const F = 25;
    const T = e.n;
    return pricePanels(e, F, T, {
      osc: [
        { name: '%D', values: D, role: OR, width: 2 },
        { name: '%K', values: K, role: BL, width: 2 },
      ],
      oscBounds: [0, 100],
      oscLevels: [
        { value: 80, role: 'sell', label: 'Quá mua' },
        { value: 20, role: 'buy', label: 'Quá bán' },
      ],
      oscZones: [
        { from: 80, to: 100, tone: DN },
        { from: 0, to: 20, tone: UP },
      ],
      oscShade: runs(F, T, (i) => {
        const k = nv(K, i);
        return k !== null && k > 80;
      })
        .filter((r) => r.up && r.to - r.from + 1 >= 3)
        .map((r) => ({ from: r.from, to: r.to, tone: GD })),
      titles: ['Giá đóng cửa', 'Stochastic %K và %D'],
      alt: 'Giá tăng mạnh trong khi %K liên tục trên 80, cho thấy chỉ báo quá mua không phải lúc nào cũng đảo chiều',
    });
  },

  /* ---------------------------------------------------------- Bài 2 · CCI */
  'c7l2-g1': () => {
    const cci = cciOf(D2);
    const bounds = cciBounds(cci, 40, D2.n);
    return pricePanels(D2, 40, D2.n, {
      osc: [{ name: 'CCI 20', values: cci, role: BL, width: 2 }],
      oscBounds: bounds,
      oscLevels: [
        { value: 100, role: 'sell', label: '+100' },
        { value: 0, role: 'neutral', label: '0' },
        { value: -100, role: 'buy', label: '−100' },
      ],
      oscZones: [
        { from: 100, to: bounds[1], tone: UP },
        { from: bounds[0], to: -100, tone: DN },
      ],
      titles: ['Giá đóng cửa', 'CCI 20'],
      alt: 'Giá kèm CCI 20, trên 100 là vùng quá mua và dưới −100 là vùng quá bán',
    });
  },
  'c7l2-g2': () => {
    // Cách tính CCI: giá điển hình TP và trung bình 20 phiên của nó.
    const tp = D2.c.map((c, i) => (D2.h[i] as number + (D2.l[i] as number) + c) / 3);
    const m = sma(tp, 20);
    const F = 45;
    const T = 115;
    const slice = (a: readonly Num[]): Num[] => a.slice(F, T);
    return {
      kind: 'series_panels',
      x: { start: F, end: T - 1 },
      marks: [],
      panels: [
        {
          title: 'Giá điển hình TP và trung bình 20 phiên',
          series: [
            { name: 'Giá điển hình TP', role: BL, width: 2, values: slice(tp) as number[] },
            { name: 'Trung bình 20 phiên', role: GD, width: 2, values: slice(m) as number[] },
          ],
        },
      ],
      alt: 'Giá điển hình TP so với trung bình 20 phiên của chính nó, khoảng cách giữa hai đường là biên độ dùng để tính CCI',
    };
  },
  'c7l2-g3': () => {
    const cci = cciOf(D2);
    const bounds = cciBounds(cci, 40, D2.n);
    const out: { i: number; up: boolean }[] = [];
    let pos = 0;
    for (let i = 41; i < D2.n; i++) {
      const c0 = nv(cci, i - 1);
      const c1 = nv(cci, i);
      if (c0 === null || c1 === null) continue;
      if (pos !== 1 && c0 < -100 && c1 >= -100) {
        out.push({ i, up: true });
        pos = 1;
      } else if (pos !== -1 && c0 > 100 && c1 <= 100) {
        out.push({ i, up: false });
        pos = -1;
      }
    }
    return pricePanels(D2, 40, D2.n, {
      osc: [{ name: 'CCI 20', values: cci, role: BL, width: 2 }],
      oscBounds: bounds,
      oscLevels: [
        { value: 100, role: 'sell', label: '+100' },
        { value: 0, role: 'neutral', label: '0' },
        { value: -100, role: 'buy', label: '−100' },
      ],
      oscZones: [
        { from: 100, to: bounds[1], tone: UP },
        { from: bounds[0], to: -100, tone: DN },
      ],
      points: pricePoints(D2, out),
      titles: ['Giá đóng cửa', 'CCI 20'],
      alt: 'Giá kèm CCI 20, điểm Mua khi CCI cắt lên −100 và điểm Bán khi CCI cắt xuống 100',
    });
  },

  /* ---------------------------------------------------------- Bài 3 · ROC */
  'c7l3-g1': () => {
    const roc = rocOf(D3, 20);
    // Bản mẫu: thang = min(giá trị, −6) .. max(giá trị, +6), nới rộng 8%.
    const bounds = windowBounds(roc, 40, D3.n, { min: -6, max: 6, pad: 0.08 });
    return pricePanels(D3, 40, D3.n, {
      osc: [{ name: 'ROC 20', values: roc, role: BL, width: 2 }],
      oscBounds: bounds,
      oscBars: { name: 'ROC 20', values: roc, colors: signColors(roc) },
      oscLevels: [
        { value: 5, role: 'sell', label: '+5%' },
        { value: 0, role: 'neutral', label: '0' },
        { value: -5, role: 'buy', label: '−5%' },
      ],
      titles: ['Giá đóng cửa', 'ROC 20'],
      alt: 'Giá kèm ROC 20, đường 0 là mốc tăng giá bằng 0 và vùng ±5% cho biết động lượng mạnh hay yếu',
    });
  },
  'c7l3-g2': () => {
    // Hai mốc giá cách nhau 20 phiên: giá hôm nay so với giá 20 phiên trước.
    const roc = rocOf(D3, 20);
    let t = 60;
    let best = 1e9;
    for (let i = 50; i < D3.n - 5; i++) {
      const v = nv(roc, i);
      if (v === null) continue;
      const e = Math.abs(v - 8);
      if (e < best) {
        best = e;
        t = i;
      }
    }
    const a = t - 20;
    const F = t - 34;
    const T = t + 4;
    return {
      kind: 'series_panels',
      x: { start: F, end: T - 1 },
      marks: [{ i: t, label: 'Hôm nay' }],
      panels: [
        {
          title: 'Giá đóng cửa',
          series: [
            {
              name: 'Giá đóng cửa',
              role: 'price',
              width: 2,
              values: D3.c.slice(F, T),
            },
          ],
        },
      ],
      points: [
        {
          i: a,
          panel: 0,
          value: Math.round((D3.c[a] as number) * 1e4) / 1e4,
          tone: GD,
          shape: 'dot',
          label: 'Giá T − 20',
          pos: 'below',
        },
        {
          i: t,
          panel: 0,
          value: Math.round((D3.c[t] as number) * 1e4) / 1e4,
          tone: UP,
          shape: 'dot',
          label: 'Giá T',
          pos: 'above',
        },
      ],
      alt: 'Đường giá đóng cửa với hai mốc cách nhau 20 phiên, đó là cách tính ROC',
    } as Model<'series_panels'>;
  },
  'c7l3-g3': () => {
    const roc = rocOf(D3, 20);
    const out: { i: number; up: boolean }[] = [];
    let hold = false;
    for (let i = 41; i < D3.n; i++) {
      const r0 = nv(roc, i - 1);
      const r1 = nv(roc, i);
      if (r0 === null || r1 === null) continue;
      if (!hold && r0 <= 0 && r1 > 0) {
        out.push({ i, up: true });
        hold = true;
      } else if (hold && r0 >= 0 && r1 < 0) {
        out.push({ i, up: false });
        hold = false;
      }
    }
    return pricePanels(D3, 40, D3.n, {
      osc: [{ name: 'ROC 20', values: roc, role: BL, width: 2 }],
      oscBounds: windowBounds(roc, 40, D3.n, { min: -6, max: 6, pad: 0.08 }),
      oscBars: { name: 'ROC 20', values: roc, colors: signColors(roc) },
      oscLevels: [
        { value: 5, role: 'sell', label: '+5%' },
        { value: 0, role: 'neutral', label: '0' },
        { value: -5, role: 'buy', label: '−5%' },
      ],
      points: pricePoints(D3, out),
      titles: ['Giá đóng cửa', 'ROC 20'],
      alt: 'Giá kèm ROC 20, điểm Mua khi ROC cắt lên 0 và điểm Bán khi ROC cắt xuống 0',
    });
  },

  /* ---------------------------------------------------------- Bài 4 · Williams %R */
  'c7l4-g1': () => {
    const wr = williamsOf(D4);
    return pricePanels(D4, 40, D4.n, {
      osc: [{ name: 'Williams %R 14', values: wr, role: PK, width: 2 }],
      oscBounds: [-100, 0],
      oscLevels: [
        { value: -20, role: 'sell', label: 'Trên −20' },
        { value: -80, role: 'buy', label: 'Dưới −80' },
      ],
      oscZones: [
        { from: -20, to: 0, tone: DN },
        { from: -100, to: -80, tone: UP },
      ],
      titles: ['Giá đóng cửa', 'Williams %R 14'],
      alt: 'Giá kèm Williams %R 14 trong thang từ −100 đến 0, trên −20 là quá mua và dưới −80 là quá bán',
    });
  },
  'c7l4-g2': () => {
    // Hai thang đo cùng một vị trí giá: Stochastic đo từ đáy lên, Williams %R đo từ đỉnh xuống.
    const wr = williamsOf(D4);
    let i0 = 60;
    let best = 1e9;
    for (let i = 60; i < D4.n; i++) {
      const v = nv(wr, i);
      if (v === null) continue;
      const e = Math.abs(v + 40);
      if (e < best) {
        best = e;
        i0 = i;
      }
    }
    const raw = stochasticRaw(D4);
    const k = nv(raw, i0) ?? 60;
    const w = nv(wr, i0) ?? -40;
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        {
          title: 'Stochastic · đo từ đáy lên',
          model: {
            kind: 'scale',
            orientation: 'h',
            domain: [0, 100],
            ticks: [
              { v: 0, label: '0' },
              { v: 20, label: '20' },
              { v: 80, label: '80' },
              { v: 100, label: '100' },
            ],
            zones: [
              { from: 80, to: 100, tone: DN, label: 'Quá mua' },
              { from: 0, to: 20, tone: UP, label: 'Quá bán' },
            ],
            markers: [
              { v: Math.round(k * 10) / 10, label: `%K thô ${Math.round(k)}`, tone: BL },
            ],
            alt: 'Thang Stochastic từ 0 đến 100, đo vị trí giá từ đáy khoảng 14 phiên lên',
          },
        },
        {
          title: 'Williams %R · đo từ đỉnh xuống',
          model: {
            kind: 'scale',
            orientation: 'h',
            domain: [-100, 0],
            ticks: [
              { v: -100, label: '−100' },
              { v: -80, label: '−80' },
              { v: -20, label: '−20' },
              { v: 0, label: '0' },
            ],
            zones: [
              { from: -20, to: 0, tone: DN, label: 'Quá mua' },
              { from: -100, to: -80, tone: UP, label: 'Quá bán' },
            ],
            markers: [
              { v: Math.round(w * 10) / 10, label: `%R ${Math.round(w)}`, tone: PK },
            ],
            alt: 'Thang Williams %R từ −100 đến 0, đo vị trí giá từ đỉnh khoảng 14 phiên xuống',
          },
        },
      ],
      title: 'Cùng một vị trí giá trong khoảng 14 phiên, Stochastic và Williams %R dùng hai thang đo ngược nhau',
    } as Model<'compare'>;
  },
  'c7l4-g3': () => {
    const wr = williamsOf(D4);
    const out: { i: number; up: boolean }[] = [];
    let pos = 0;
    for (let i = 41; i < D4.n; i++) {
      const w0 = nv(wr, i - 1);
      const w1 = nv(wr, i);
      if (w0 === null || w1 === null) continue;
      if (pos !== 1 && w0 < -80 && w1 >= -80) {
        out.push({ i, up: true });
        pos = 1;
      } else if (pos !== -1 && w0 > -20 && w1 <= -20) {
        out.push({ i, up: false });
        pos = -1;
      }
    }
    return pricePanels(D4, 40, D4.n, {
      osc: [{ name: 'Williams %R 14', values: wr, role: PK, width: 2 }],
      oscBounds: [-100, 0],
      oscLevels: [
        { value: -20, role: 'sell', label: 'Trên −20' },
        { value: -80, role: 'buy', label: 'Dưới −80' },
      ],
      oscZones: [
        { from: -20, to: 0, tone: DN },
        { from: -100, to: -80, tone: UP },
      ],
      points: pricePoints(D4, out),
      titles: ['Giá đóng cửa', 'Williams %R 14'],
      alt: 'Giá kèm Williams %R 14, điểm Mua khi %R cắt lên −80 và điểm Bán khi %R cắt xuống −20',
    });
  },

  /* ---------------------------------------------------------- Bài 5 · OBV */
  'c7l5-g1': () => {
    const obv = obvOf(D5);
    const om = sma(obv, 20);
    return pricePanels(D5, 40, D5.n, {
      osc: [
        { name: 'SMA 20 của OBV', values: om, role: GD, width: 2 },
        { name: 'OBV', values: obv, role: BL, width: 2 },
      ],
      titles: ['Giá đóng cửa', 'OBV và trung bình 20 phiên'],
      alt: 'Giá kèm OBV và đường trung bình 20 phiên của OBV, hướng của đường OBV quan trọng hơn giá trị tuyệt đối',
    });
  },
  'c7l5-g2': () => {
    // Sáu phiên mẫu: giá đóng cửa, khối lượng và giá trị OBV tích lũy.
    const C = [25000, 25300, 25100, 25100, 25600, 25900];
    const V = [1.2, 1.5, 0.8, 1, 2, 1.6];
    const O = [0, 1.5, 0.7, 0.7, 2.7, 4.3];
    const L = ['Phiên 1', 'Phiên 2', 'Phiên 3', 'Phiên 4', 'Phiên 5', 'Phiên 6'];
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        {
          title: 'Giá đóng cửa',
          model: {
            kind: 'category',
            mode: 'grouped',
            labels: L,
            unit: 'đ',
            series: [{ name: 'Giá đóng cửa', values: C, tone: 'price' }],
            value_labels: 'last',
          },
        },
        {
          title: 'Khối lượng',
          model: {
            kind: 'category',
            mode: 'grouped',
            labels: L,
            unit: 'triệu cp',
            series: [{ name: 'Khối lượng', values: V, tone: 'p3' }],
            value_labels: 'last',
          },
        },
        {
          title: 'OBV tích lũy',
          model: {
            kind: 'category',
            mode: 'grouped',
            labels: L,
            unit: 'triệu cp',
            series: [{ name: 'OBV', values: O, tone: BL }],
            value_labels: 'last',
          },
        },
      ],
      title: 'Sáu phiên mẫu: giá đóng cửa, khối lượng và OBV tích lũy, OBV cộng khối lượng khi giá tăng và trừ khi giá giảm',
    } as Model<'compare'>;
  },
  'c7l5-g3': () => {
    // Phân kỳ âm: giá tạo đỉnh cao hơn còn OBV tạo đỉnh thấp hơn.
    const n = 46;
    const pts = (nodes: readonly (readonly [number, number])[]): number[] => {
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        let k = 0;
        while (k < nodes.length - 2 && (nodes[k + 1] as readonly [number, number])[0] <= i) k++;
        const [x0, y0] = nodes[k] as readonly [number, number];
        const [x1, y1] = nodes[k + 1] as readonly [number, number];
        out.push(y0 + ((y1 - y0) * (i - x0)) / (x1 - x0) + 1.6 * Math.sin(i * 1.7));
      }
      return out;
    };
    const price = pts([
      [0, 40],
      [12, 72],
      [21, 56],
      [34, 82],
      [45, 62],
    ]);
    const obv = pts([
      [0, 38],
      [12, 78],
      [21, 52],
      [34, 66],
      [45, 45],
    ]);
    const peak = (a: readonly number[], lo: number, hi: number): number => {
      let b = lo;
      for (let i = lo; i <= hi; i++) if ((a[i] as number) > (a[b] as number)) b = i;
      return b;
    };
    const p1 = peak(price, 8, 16);
    const p2 = peak(price, 28, 40);
    const q1 = peak(obv, 8, 16);
    const q2 = peak(obv, 28, 40);
    const domain = { x: [0, 45] as [number, number], y: [30, 90] as [number, number] };
    return {
      kind: 'schematic',
      domain,
      panels: [
        { title: 'Giá', y: [30, 90] },
        { title: 'OBV', y: [30, 90] },
      ],
      layers: [
        { t: 'line', pts: price.map((v, i) => [i, v] as [number, number]), tone: 'price', width: 2, panel: 0 },
        { t: 'line', pts: obv.map((v, i) => [i, v] as [number, number]), tone: BL, width: 2, panel: 1 },
        {
          t: 'segment',
          from: [p1, (price[p1] as number) + 1],
          to: [p2, (price[p2] as number) + 1],
          tone: UP,
          dash: true,
          panel: 0,
        },
        {
          t: 'segment',
          from: [q1, (obv[q1] as number) + 1],
          to: [q2, (obv[q2] as number) + 1],
          tone: DN,
          dash: true,
          panel: 1,
        },
        { t: 'point', at: [p2, price[p2] as number], tone: 'price', shape: 'ring', label: 'Đỉnh giá cao hơn', panel: 0 },
        { t: 'point', at: [q2, obv[q2] as number], tone: BL, shape: 'ring', label: 'Đỉnh OBV thấp hơn', panel: 1 },
      ],
      alt: 'Phân kỳ âm: giá tạo đỉnh cao hơn trong khi OBV chỉ tạo đỉnh thấp hơn, dòng tiền đang rút khỏi cổ phiếu',
    } as Model<'schematic'>;
  },
  'c7l5-g4': () => {
    const obv = obvOf(D5);
    const om = sma(obv, 20);
    return pricePanels(D5, 40, D5.n, {
      osc: [
        { name: 'SMA 20 của OBV', values: om, role: GD, width: 2 },
        { name: 'OBV', values: obv, role: BL, width: 2 },
      ],
      oscShade: runs(40, D5.n, (i) => (obv[i] as number) > (om[i] as number)).map((r) => ({
        from: r.from,
        to: r.to,
        tone: r.up ? UP : DN,
      })),
      titles: ['Giá đóng cửa', 'OBV và trung bình 20 phiên'],
      alt: 'Giá kèm OBV, nền xanh khi OBV nằm trên đường trung bình và nền đỏ khi nằm dưới',
    });
  },

  /* ---------------------------------------------------------- Bài 6 · MFI */
  'c7l6-g1': () => {
    const mfi = mfiOf(D6, 14);
    return pricePanels(D6, 40, D6.n, {
      osc: [{ name: 'MFI 14', values: mfi, role: BL, width: 2 }],
      oscBounds: [0, 100],
      oscLevels: [
        { value: 80, role: 'sell', label: 'Quá mua' },
        { value: 20, role: 'buy', label: 'Quá bán' },
      ],
      oscZones: [
        { from: 80, to: 100, tone: DN },
        { from: 0, to: 20, tone: UP },
      ],
      titles: ['Giá đóng cửa', 'MFI 14'],
      alt: 'Giá kèm MFI 14, trên 80 là quá mua và dưới 20 là quá bán',
    });
  },
  'c7l6-g2': () => {
    // Dòng tiền 14 phiên và cách MFI 14 chia dòng tiền dương với âm.
    const N = 14;
    const tp = D6.c.map((c, i) => (D6.h[i] as number + (D6.l[i] as number) + c) / 3);
    const mf = tp.map((t, i) => t * (D6.v[i] as number));
    let i0 = 80;
    let best = 1e9;
    for (let i = 60; i < D6.n; i++) {
      const m = nv(mfiOf(D6, N), i);
      if (m === null) continue;
      const e = Math.abs(m - 68);
      if (e < best) {
        best = e;
        i0 = i;
      }
    }
    let p = 0;
    let q = 0;
    for (let j = i0 - N + 1; j <= i0; j++) {
      if ((tp[j] as number) > (tp[j - 1] as number)) p += mf[j] as number;
      else if ((tp[j] as number) < (tp[j - 1] as number)) q += mf[j] as number;
    }
    const flows: number[] = [];
    const ups: boolean[] = [];
    for (let j = i0 - N + 1; j <= i0; j++) {
      flows.push(mf[j] as number);
      ups.push((tp[j] as number) > (tp[j - 1] as number));
    }
    // Bản mẫu chỉ ghi nhãn ở hai đầu ("Phiên xa" và "Phiên gần nhất"); trục ngang ghi P1..P14.
    const labels = flows.map((_, k) => `P${k + 1}`);
    const sublabels = flows.map((_, k) =>
      k === 0 ? 'Phiên xa' : k === N - 1 ? 'Phiên gần nhất' : '',
    );
    const mfi = nv(mfiOf(D6, N), i0) ?? 0;
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        {
          title: 'Dòng tiền của 14 phiên',
          model: {
            kind: 'category',
            mode: 'grouped',
            labels,
            sublabels,
            unit: '',
            series: [
              {
                name: 'Dòng tiền',
                values: flows.map((v) => Math.round(v)),
                tone_by_sign: { pos: UP, neg: DN },
              },
            ],
            value_labels: 'none',
          },
        },
        {
          title: 'MFI 14',
          model: {
            kind: 'category',
            mode: 'grouped',
            labels: ['Dòng tiền dương', 'Dòng tiền âm'],
            unit: '%',
            series: [
              {
                name: 'Tỷ trọng',
                values: [
                  Math.round((100 * p) / (p + q) * 10) / 10,
                  Math.round((100 * q) / (p + q) * 10) / 10,
                ],
                tone: 'p1',
              },
            ],
            value_labels: 'all',
            caption_value: `MFI 14 = ${Math.round(mfi)}`,
            caption_tone: 'price',
          },
        },
      ],
      title: 'Dòng tiền của 14 phiên và tỷ trọng dòng tiền dương so với âm, MFI 14 là tỷ trọng dòng tiền dương',
    } as Model<'compare'>;
  },
  'c7l6-g3': () => {
    const mfi = mfiOf(D6, 14);
    const rsi = rsiOf(D6, 14);
    return pricePanels(D6, 40, D6.n, {
      osc: [
        { name: 'RSI 14', values: rsi, role: GD, width: 2 },
        { name: 'MFI 14', values: mfi, role: BL, width: 2 },
      ],
      oscBounds: [0, 100],
      oscLevels: [
        { value: 80, role: 'sell', label: 'Quá mua' },
        { value: 20, role: 'buy', label: 'Quá bán' },
      ],
      oscZones: [
        { from: 80, to: 100, tone: DN },
        { from: 0, to: 20, tone: UP },
      ],
      titles: ['Giá đóng cửa', 'MFI 14 và RSI 14'],
      alt: 'Giá kèm MFI 14 và RSI 14, hai đường thường cùng hướng nhưng lệch nhau ở những phiên khối lượng bất thường',
    });
  },
  'c7l6-g4': () => {
    const mfi = mfiOf(D6, 14);
    const out: { i: number; up: boolean }[] = [];
    for (let i = 41; i < D6.n; i++) {
      const m0 = nv(mfi, i - 1);
      const m1 = nv(mfi, i);
      if (m0 === null || m1 === null) continue;
      if (m0 < 20 && m1 >= 20) out.push({ i, up: true });
      else if (m0 > 80 && m1 <= 80) out.push({ i, up: false });
    }
    return pricePanels(D6, 40, D6.n, {
      osc: [{ name: 'MFI 14', values: mfi, role: BL, width: 2 }],
      oscBounds: [0, 100],
      oscLevels: [
        { value: 80, role: 'sell', label: 'Quá mua' },
        { value: 20, role: 'buy', label: 'Quá bán' },
      ],
      oscZones: [
        { from: 80, to: 100, tone: DN },
        { from: 0, to: 20, tone: UP },
      ],
      points: pricePoints(D6, out),
      titles: ['Giá đóng cửa', 'MFI 14'],
      alt: 'Giá kèm MFI 14, điểm Mua khi MFI cắt lên 20 và điểm Bán khi MFI cắt xuống 80',
    });
  },

  /* ---------------------------------------------------------- Bài 7 · Chaikin Money Flow */
  'c7l7-g1': () => {
    // Bản mẫu nới rộng biên độ nến bằng rng(7) trước khi tính CMF.
    const d: PriceSeries = {
      o: [...D7.o],
      h: [...D7.h],
      l: [...D7.l],
      c: [...D7.c],
      v: [...D7.v],
      n: D7.n,
    };
    const r = rng(7);
    for (let i = 0; i < d.n; i++) {
      const w = (d.h[i] as number) - (d.l[i] as number);
      d.h[i] = (d.h[i] as number) + w * (0.15 + 0.5 * r());
      d.l[i] = (d.l[i] as number) - w * (0.15 + 0.5 * r());
    }
    const cmf = cmfOf(d, 20);
    return pricePanels(d, 40, d.n, {
      osc: [{ name: 'CMF 20', values: cmf, role: BL, width: 2 }],
      oscBounds: cmfBounds(cmf, 40, d.n),
      oscBars: { name: 'CMF 20', values: cmf, colors: signColors(cmf) },
      oscLevels: [{ value: 0, role: 'neutral', label: '0' }],
      titles: ['Giá đóng cửa', 'Chaikin Money Flow 20'],
      alt: 'Giá kèm CMF 20 dao động quanh mốc 0, trên 0 là áp lực mua và dưới 0 là áp lực bán',
    });
  },
  'c7l7-g2': () => {
    // Hệ số dòng tiền: đóng cửa ở đỉnh (+1), giữa (0) và đáy (−1) của biên độ phiên.
    const cases: { title: string; o: number; c: number; k: string; tone: ChartTone }[] = [
      { title: 'Đóng cửa ở đỉnh phiên', o: 25150, c: 26000, k: '+1', tone: UP },
      { title: 'Đóng cửa ở giữa phiên', o: 25750, c: 25500, k: '0', tone: GD },
      { title: 'Đóng cửa ở đáy phiên', o: 25850, c: 25000, k: '−1', tone: DN },
    ];
    return {
      kind: 'compare',
      layout: 'row',
      items: cases.map((c) => ({
        title: c.title,
        model: {
          kind: 'candle_glyphs',
          domain: [25000, 26000],
          groups: [
            {
              title: `Hệ số dòng tiền ${c.k}`,
              candles: [{ o: c.o, h: 26000, l: 25000, c: c.c }],
            },
          ],
          alt: `Phiên đóng cửa ở ${c.title.toLowerCase()}, hệ số dòng tiền ${c.k}`,
        },
      })),
      title: 'Ba vị trí đóng cửa trong biên độ phiên cho ba hệ số dòng tiền: +1 khi đóng cửa ở đỉnh, 0 khi ở giữa và −1 khi ở đáy',
    } as Model<'compare'>;
  },
  'c7l7-g3': () => {
    const d: PriceSeries = {
      o: [...D7.o],
      h: [...D7.h],
      l: [...D7.l],
      c: [...D7.c],
      v: [...D7.v],
      n: D7.n,
    };
    const r = rng(7);
    for (let i = 0; i < d.n; i++) {
      const w = (d.h[i] as number) - (d.l[i] as number);
      d.h[i] = (d.h[i] as number) + w * (0.15 + 0.5 * r());
      d.l[i] = (d.l[i] as number) - w * (0.15 + 0.5 * r());
    }
    const cmf = cmfOf(d, 20);
    const out: { i: number; up: boolean }[] = [];
    let pos = 0;
    for (let i = 41; i < d.n; i++) {
      const c0 = nv(cmf, i - 1);
      const c1 = nv(cmf, i);
      if (c0 === null || c1 === null) continue;
      if (pos !== 1 && c0 <= 0.1 && c1 > 0.1) {
        out.push({ i, up: true });
        pos = 1;
      } else if (pos !== -1 && c0 >= -0.1 && c1 < -0.1) {
        out.push({ i, up: false });
        pos = -1;
      }
    }
    return pricePanels(d, 40, d.n, {
      osc: [{ name: 'CMF 20', values: cmf, role: BL, width: 2 }],
      oscBounds: cmfBounds(cmf, 40, d.n),
      oscBars: { name: 'CMF 20', values: cmf, colors: signColors(cmf) },
      oscLevels: [
        { value: 0.1, role: 'sell', label: '+0,1' },
        { value: 0, role: 'neutral', label: '0' },
        { value: -0.1, role: 'buy', label: '−0,1' },
      ],
      points: pricePoints(d, out),
      titles: ['Giá đóng cửa', 'Chaikin Money Flow 20'],
      alt: 'Giá kèm CMF 20, điểm Mua khi CMF cắt lên 0,1 và điểm Bán khi CMF cắt xuống −0,1',
    });
  },
};

export type { PriceSeries, Num };
