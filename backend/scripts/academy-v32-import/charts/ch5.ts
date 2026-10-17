import type { ChartTone } from '../../../src/modules/academy/content/v3/schema.js';
import type { Builder, Category, Panel, Point, SeriesPanels } from './kit.js';
import type { Num } from './math.js';
import { at, fmtVi, path, rng, round4, series, sma, win } from './math.js';

/** Chapter 5 chart models (investment methods). */

/* ------------------------------------------------------------------ L1 DCA */

export const C5L1_G1_PRICES = [20, 18, 16, 15, 13, 12, 14, 15, 17, 19, 21, 22];
export const C5L1_G2_PRICES = [20000, 15000, 12000, 15000, 20000, 25000];

/** C5L1-g2 numbers quoted in the prose (18 triệu, 1.070 CCQ, giá vốn 16.822, 26,75 triệu, +48,6%). */
export function c5l1Example(): {
  units: number[];
  total: number;
  avg: number;
  value: number;
  gain: number;
} {
  const units = C5L1_G2_PRICES.map((p) => 3000000 / p);
  const total = units.reduce((s, v) => s + v, 0);
  const invested = 3000000 * units.length;
  const avg = invested / total;
  const value = total * (C5L1_G2_PRICES[C5L1_G2_PRICES.length - 1] as number);
  return { units, total, avg, value, gain: (value / invested - 1) * 100 };
}

/** C5L1-g3: lump sum 72 at month 0 vs 3 a month for 24 months. */
export function c5l1Lump(): {
  P: number[];
  dca: number[];
  lump: number[];
  inv: number[];
  lr: number;
  dr: number;
} {
  const N = 24;
  const P: number[] = [];
  for (let m = 0; m < N; m++)
    P.push(m < 9 ? 100 - m * 4.2 : m < 14 ? 62 + (m - 9) * 0.6 : 65 + (m - 14) * 4.5);
  let units = 0;
  let invested = 0;
  const dca: number[] = [];
  const lump: number[] = [];
  const inv: number[] = [];
  const L = (3 * N) / (P[0] as number);
  for (const p of P) {
    units += 3 / p;
    invested += 3;
    dca.push(units * p);
    inv.push(invested);
    lump.push(L * p);
  }
  return {
    P,
    dca,
    lump,
    inv,
    lr: ((lump[N - 1] as number) / 72 - 1) * 100,
    dr: ((dca[N - 1] as number) / 72 - 1) * 100,
  };
}

const pct0 = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`;

/* ------------------------------------------------------------------ L2 metrics */

/** C5L2-m2 (P/E) and m3 (P/B) 84-month lines. */
export function c5l2Metric(which: 'pe' | 'pb'): { v: number[]; mean: number } {
  const r = rng(which === 'pe' ? 4 : 7);
  const v: number[] = [];
  let e = 0;
  for (let i = 0; i < 84; i++) {
    if (which === 'pe') {
      e = e * 0.8 + (r() - 0.5) * 1.1;
      v.push(14 + 2.2 * Math.sin(i / 9) + e - (i > 66 ? (i - 66) * 0.2 : 0));
    } else {
      e = e * 0.8 + (r() - 0.5) * 0.14;
      v.push(1.8 + 0.35 * Math.sin(i / 10 + 1) + e - (i > 64 ? (i - 64) * 0.022 : 0));
    }
  }
  return { v, mean: v.reduce((s, x) => s + x, 0) / v.length };
}

const YEAR_TICKS = (() => {
  const t: Record<number, string> = {};
  for (let k = 0; k <= 6; k++) t[Math.round((k * 83) / 6)] = `'${19 + k}`;
  const out: string[] = [];
  for (let i = 0; i < 84; i++) out.push(t[i] ?? '');
  return out;
})();

function metricLine(which: 'pe' | 'pb'): SeriesPanels {
  const { v, mean } = c5l2Metric(which);
  const cur = v[83] as number;
  const pe = which === 'pe';
  const levels: Panel['levels'] = [
    { value: round4(mean), role: 'avg', label: `Trung bình ${fmtVi(mean, 1)}` },
  ];
  if (!pe) levels.unshift({ value: 1, role: 'sell', label: 'Mốc 1' });
  return {
    kind: 'series_panels',
    x: { start: 0, end: 83, ticks: YEAR_TICKS },
    marks: [],
    points: [
      {
        i: 83,
        panel: 0,
        value: round4(cur),
        tone: 'pos',
        label: `Hiện tại ${fmtVi(cur, 1)}`,
        pos: 'below',
      },
    ],
    panels: [
      {
        title: '',
        bounds: pe ? [6, 20] : [0.5, 2.6],
        ticks: pe ? [8, 12, 16, 20] : [1, 1.5, 2, 2.5],
        digits: 1,
        ...(pe
          ? { zones: [{ from: round4(mean - 2), to: round4(mean + 2), tone: 'warn' as const }] }
          : {}),
        levels,
        series: [{ name: pe ? 'P/E' : 'P/B', role: 'price', width: 2, values: v.map(round4) }],
      },
    ],
    alt: pe
      ? `P/E 7 năm: trung bình ${fmtVi(mean, 1)}, hiện tại ${fmtVi(cur, 1)}`
      : `P/B 7 năm: trung bình ${fmtVi(mean, 1)}, hiện tại ${fmtVi(cur, 1)}`,
  };
}

/* ------------------------------------------------------------------ L3 big five */

export function c5l3BigFive(): { title: string; v: number[]; cagr: number | null }[] {
  const r = rng(5);
  const grow = (b: number, g: number) =>
    Array.from({ length: 10 }, (_, i) => b * Math.pow(1 + g, i) * (1 + (r() - 0.5) * 0.08));
  const D: [string, number[], boolean][] = [
    ['ROIC', [15, 16, 14, 17, 16, 18, 17, 16, 18, 19], true],
    ['Vốn chủ sở hữu', grow(100, 0.12), false],
    ['EPS', grow(100, 0.13), false],
    ['Doanh thu', grow(100, 0.11), false],
    ['Dòng tiền tự do', grow(100, 0.12), false],
  ];
  return D.map(([title, v, isR]) => ({
    title,
    v,
    cagr: isR ? null : (Math.pow((v[9] as number) / (v[0] as number), 1 / 9) - 1) * 100,
  }));
}

/* ------------------------------------------------------------------ L4 CANSLIM */

/** C5L4-g3 cup with handle: price path and volume share one generator. */
export function c5l4Cup(): {
  p: number[];
  vol: number[];
  bi: number;
  hand: number;
  botV: number;
  hLow: number;
} {
  const r = rng(8);
  const p = path(
    [
      [16, 14],
      [26, -14],
      [10, -1],
      [26, 13.5],
      [10, -4.4],
      [4, 1],
      [18, 12],
    ],
    40,
    r,
    0.9,
  );
  const N = p.length;
  const hand = Math.max(...p.slice(76, 90));
  let bi = 90;
  while (bi < N - 1 && at(p, bi) <= hand + 0.2) bi++;
  const botV = Math.min(...p.slice(30, 60));
  const hLow = Math.min(...p.slice(78, 92));
  const vol: number[] = [];
  for (let i = 0; i < N; i++) {
    let v = 30 + r() * 14;
    if (i >= 78 && i < bi) v = 16 + r() * 6;
    if (i >= bi && i < bi + 3) v = [78, 62, 50][i - bi] as number;
    if (i >= 30 && i < 52) v = 24 + r() * 10;
    vol.push(v);
  }
  return { p, vol, bi, hand, botV, hLow };
}

/** C5L4-g5 worked example. */
export function c5l4Worked(): { p: number[]; vol: number[]; bi: number } {
  const r = rng(21);
  const p = path(
    [
      [20, 6],
      [12, -3.5],
      [14, 5.4],
      [8, -3.4],
      [4, 0.9],
      [6, 3.6],
      [22, 12],
    ],
    42,
    r,
    0.55,
  );
  const N = p.length;
  let bi = 55;
  while (bi < N - 1 && at(p, bi) < 50.1) bi++;
  const vol: number[] = [];
  for (let i = 0; i < N; i++) {
    let v = 26 + r() * 12;
    if (i >= 46 && i < bi) v = 15 + r() * 6;
    if (i === bi) v = 60;
    if (i === bi + 1) v = 48;
    vol.push(v);
  }
  return { p, vol, bi };
}

const volColors = (p: readonly number[]): ('pos' | 'neg')[] =>
  p.map((v, i) => (i && v >= (p[i - 1] as number) ? 'pos' : 'neg'));

/** Runs of a boolean per bar -> x.shade ranges. */
function shadeRuns(flags: { i: number; ok: boolean }[]): NonNullable<SeriesPanels['x']['shade']> {
  const out: NonNullable<SeriesPanels['x']['shade']> = [];
  for (const f of flags) {
    const last = out[out.length - 1];
    const tone: ChartTone = f.ok ? 'pos' : 'neg';
    if (last && last.tone === tone && last.to === f.i - 1) last.to = f.i;
    else out.push({ from: f.i, to: f.i, tone });
  }
  return out;
}

const bar = (
  labels: string[],
  name: string,
  values: Num[],
  extra: Partial<Category> = {},
): Category => ({
  kind: 'category',
  mode: 'grouped',
  labels,
  unit: '',
  series: [{ name, values }],
  value_labels: 'all',
  ...extra,
});

export const CH5_BUILDERS: Record<string, Builder> = {
  'c5l1-g1': () => {
    const P = C5L1_G1_PRICES;
    const units = P.map((v) => Math.round(3000 / v));
    return {
      kind: 'series_panels',
      x: { start: 0, end: 11, ticks: P.map((_, i) => `T${i + 1}`) },
      marks: [],
      points: P.map((v, i): Point => ({
        i,
        panel: 0,
        value: v,
        tone: 'price',
        label: String(v),
        pos: 'above',
      })),
      panels: [
        {
          title: 'Giá (nghìn đồng)',
          digits: 0,
          series: [{ name: 'Giá', role: 'price', width: 2, values: P }],
        },
        {
          title: 'Số chứng chỉ quỹ mua được với 3 triệu đồng',
          nonnegative: true,
          series: [],
          bars: {
            name: 'Số chứng chỉ quỹ',
            values: units,
            colors: units.map(() => 'pos' as const),
          },
          notes: units.map((u, i) => ({ i, value: u, text: String(u), tone: 'pos' as const })),
        },
      ],
      alt: 'Giá càng thấp, 3 triệu đồng mỗi tháng mua được càng nhiều chứng chỉ quỹ',
    };
  },
  'c5l1-g2': () => {
    const { units } = c5l1Example();
    return bar(
      C5L1_G2_PRICES.map((_, i) => `Tháng ${i + 1}`),
      'Số chứng chỉ quỹ',
      units.map(round4),
      {
        sublabels: C5L1_G2_PRICES.map((p) => `${fmtVi(p)} đ`),
        unit: 'chứng chỉ',
        series: [{ name: 'Số chứng chỉ quỹ', values: units.map(round4), tone: 'pos' }],
      },
    );
  },
  'c5l1-g3': () => {
    const { dca, lump, inv, lr, dr } = c5l1Lump();
    return {
      kind: 'category',
      mode: 'line',
      labels: dca.map((_, i) => `Tháng ${i + 1}`),
      unit: 'triệu đồng',
      series: [
        { name: 'Mua một lần 72 triệu', values: lump.map(round4), tone: 'warn' },
        { name: 'DCA 3 triệu mỗi tháng', values: dca.map(round4), tone: 'pos' },
        { name: 'Tiền DCA đã bỏ vào', values: inv, tone: 'p3', dash: true },
      ],
      value_labels: 'none',
      end_labels: [pct0(lr), pct0(dr), '72 triệu'],
      ticks: [0, 25, 50, 75],
    };
  },

  'c5l2-g1': () => {
    const r = rng(9);
    let e = 0;
    const V: number[] = [];
    const P: number[] = [];
    for (let i = 0; i < 160; i++) {
      const v = 50 + i * 0.16;
      e = e * 0.6 + (r() - 0.5) * 2.2;
      V.push(v);
      P.push(v * (1 + 0.2 * Math.sin(i / 11) + 0.06 * Math.sin(i / 4)) + e);
    }
    return {
      kind: 'series_panels',
      x: { start: 0, end: 159 },
      marks: [],
      panels: [
        {
          title: '',
          series: [
            { name: 'Giá trị thực', role: 'warn', dash: true, width: 3, values: V.map(round4) },
            { name: 'Giá thị trường', role: 'price', width: 2, values: P.map(round4) },
          ],
          fill_between: { a: 1, b: 0, above: 'neg', below: 'pos' },
        },
      ],
      alt: 'Giá thị trường dao động quanh giá trị thực: lúc thấp hơn, lúc cao hơn',
    };
  },
  'c5l2-g2': () => ({
    kind: 'segment_bar',
    max: 100000,
    unit: 'đ',
    rows: [
      {
        label: 'Giá trị ước tính',
        segments: [{ value: 100000, label: '100.000 đ', tone: 'warn' }],
      },
      {
        label: 'Giá mua',
        segments: [
          { value: 70000, label: '70.000 đ', tone: 'pos' },
          { value: 30000, tone: 'pos', ghost: true },
        ],
      },
    ],
    brackets: [{ row: 1, from: 70000, to: 100000, label: 'Biên an toàn 30%', tone: 'pos' }],
    alt: 'Giá trị ước tính 100.000 đồng, mua ở 70.000 đồng: biên an toàn 30%',
  }),
  'c5l2-m1': () =>
    bar(
      ['2019', '2020', '2021', '2022', '2023', '2024', '2025'],
      'EPS',
      [1500, 1650, 1400, 1800, 2000, 2150, 2400],
      {
        series: [{ name: 'EPS', values: [1500, 1650, 1400, 1800, 2000, 2150, 2400], tone: 'p1' }],
        unit: 'đ',
        value_labels: 'last',
        bounds: [0, 2600],
        ticks: [0, 1000, 2000],
      },
    ),
  'c5l2-m2': () => metricLine('pe'),
  'c5l2-m3': () => metricLine('pb'),
  'c5l2-m4': () =>
    bar(
      ['2019', '2020', '2021', '2022', '2023', '2024', '2025'],
      'ROE',
      [14, 16, 13, 17, 18, 19, 18],
      {
        unit: '%',
        threshold: { value: 15, label: '15%', tone_at_or_above: 'pos', tone_below: 'p3' },
        bounds: [0, 24],
        ticks: [0, 10, 20],
      },
    ),

  'c5l3-g2': () => {
    const years = Array.from({ length: 10 }, (_, i) => String(2016 + i));
    return {
      kind: 'compare',
      layout: 'row',
      items: c5l3BigFive().map(({ title, v, cagr }) => ({
        title,
        model:
          cagr === null
            ? bar(years, title, v, {
                unit: '%',
                value_labels: 'none',
                series: [{ name: title, values: v, tone: 'p1' }],
                threshold: { value: 10, label: '10%' },
                caption_value: 'Trên mốc 10%',
                caption_tone: 'info',
              })
            : bar(years, title, v.map(round4), {
                value_labels: 'none',
                series: [{ name: title, values: v.map(round4), tone: 'pos' }],
                caption_value: `+${cagr.toFixed(0)}%/năm`,
                caption_tone: 'pos',
              }),
      })),
    };
  },
  'c5l3-g4': () => ({
    kind: 'scale',
    orientation: 'h',
    domain: [0, 44000],
    ticks: [0, 10000, 20000, 30000, 40000].map((v) => ({ v, label: v ? `${v / 1000}k` : '0' })),
    zones: [
      { from: 0, to: 15350, tone: 'pos', label: 'Vùng mua' },
      { from: 15350, to: 30700, tone: 'warn', label: 'Chờ thêm' },
      { from: 30700, to: 44000, tone: 'neg', label: 'Đắt' },
    ],
    markers: [
      { v: 15350, label: 'Giá mua · 15.350 đ', tone: 'pos' },
      { v: 30700, label: 'Giá trị hợp lý · 30.700 đ', tone: 'warn' },
    ],
    alt: 'Giá dưới 15.350 đồng là vùng mua, từ 15.350 đến 30.700 đồng chờ thêm, trên 30.700 đồng là đắt',
  }),

  'c5l4-g2': () => {
    const a = [1000, 1300, 1650, 2100];
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        {
          title: 'C · EPS quý so với cùng kỳ',
          model: bar(['Q1', 'Q2', 'Q3', 'Q4'], 'Tăng trưởng EPS quý', [18, 26, 34, 45], {
            unit: '%',
            threshold: { value: 25, label: '25%', tone_at_or_above: 'pos', tone_below: 'p3' },
          }),
        },
        {
          title: 'A · EPS năm',
          model: bar(['2022', '2023', '2024', '2025'], 'EPS năm', a, {
            unit: 'đ',
            series: [{ name: 'EPS năm', values: a, tone: 'p1' }],
            sublabels: a.map((v, i) =>
              i ? `+${Math.round((v / (a[i - 1] as number) - 1) * 100)}%` : '',
            ),
            caption_value: 'ROE 21%',
            caption_tone: 'info',
          }),
        },
      ],
    };
  },
  'c5l4-g3': () => {
    const { p, vol, bi, hand, botV, hLow } = c5l4Cup();
    const end = p.length - 1;
    const h = round4(hand);
    return {
      kind: 'series_panels',
      x: { start: 0, end },
      marks: [],
      points: [
        { i: bi, panel: 0, value: round4(at(p, bi)), tone: 'pos', label: 'Điểm mua', pos: 'left' },
      ],
      panels: [
        {
          title: '',
          series: [{ name: 'Giá', role: 'price', width: 2, values: p.map(round4) }],
          segments: [{ from: [76, h], to: [end, h], tone: 'warn', dash: true }],
          notes: [
            { i: 42, value: round4(botV), text: 'Cốc' },
            { i: 84, value: round4(hLow), text: 'Tay cầm' },
          ],
        },
        {
          title: 'Khối lượng',
          nonnegative: true,
          series: [],
          bars: { name: 'Khối lượng', values: vol.map(round4), colors: volColors(p) },
          levels: [{ value: 32, role: 'avg', label: 'Trung bình 50 phiên' }],
          notes: [
            { i: bi, value: 78, text: 'Cao hơn trung bình 50 phiên từ 40-50%', tone: 'info' },
          ],
        },
      ],
      alt: 'Mô hình cốc tay cầm: giá vượt đỉnh tay cầm với khối lượng tăng mạnh là điểm mua',
    };
  },
  'c5l4-g4': () =>
    bar(
      ['Cổ phiếu A', 'Cổ phiếu B', 'Cổ phiếu C', 'Cổ phiếu D', 'Cổ phiếu E'],
      'Sức mạnh giá',
      [94, 86, 67, 45, 22],
      {
        orientation: 'h',
        threshold: { value: 80, label: 'Mốc 80', tone_at_or_above: 'pos', tone_below: 'p3' },
        bounds: [0, 100],
      },
    ),
  'c5l4-g5': () => {
    const { p, vol, bi } = c5l4Worked();
    return {
      kind: 'series_panels',
      x: { start: 0, end: p.length - 1 },
      marks: [],
      points: [{ i: bi, panel: 0, value: 51, tone: 'pos', label: 'Mua 51.000', pos: 'left' }],
      panels: [
        {
          title: '',
          zones: [
            { from: 50, to: 52.5, tone: 'pos', label: 'Vùng mua · từ điểm mua đến +5%' },
            { from: 61, to: 64, tone: 'p1', label: 'Chốt lời · +20-25%' },
          ],
          levels: [
            { value: 50, role: 'buy', label: 'Điểm mua · 50.000' },
            { value: 47.4, role: 'sell', label: 'Cắt lỗ −7% · 47.400' },
          ],
          series: [{ name: 'Giá', role: 'price', width: 2, values: p.map(round4) }],
        },
        {
          title: '',
          nonnegative: true,
          series: [],
          bars: { name: 'Khối lượng', values: vol.map(round4), colors: volColors(p) },
          notes: [{ i: bi, value: 60, text: 'Khối lượng +60%', tone: 'info' }],
        },
      ],
      alt: 'Ví dụ: mua 51.000 khi giá vượt điểm mua 50.000 với khối lượng tăng 60%, cắt lỗ 47.400, chốt lời 61.000 đến 64.000',
    };
  },
  'c5l4-g6': () => {
    const f = (i: number) =>
      i < 70 ? 1100 + i * 2.2 : i < 120 ? 1254 - (i - 70) * 3.4 : 1084 + (i - 120) * 2.6;
    const p = series(200, 6, f, 26);
    const m = sma(p, 50);
    const flags: { i: number; ok: boolean }[] = [];
    for (let i = 51; i < 200; i++)
      flags.push({ i, ok: at(p, i) > at(m, i) && at(m, i) > at(m, i - 1) });
    return {
      kind: 'series_panels',
      x: { start: 50, end: 199, shade: shadeRuns(flags) },
      marks: [],
      panels: [
        {
          title: '',
          digits: 0,
          series: [
            { name: 'MA50', role: 'p1', width: 3, values: win(m, 50, 199) },
            { name: 'VN-Index', role: 'price', width: 2, values: win(p, 50, 199) },
          ],
        },
      ],
      alt: 'VN-Index và MA50: chỉ ưu tiên mua khi chỉ số nằm trên MA50 đang đi lên',
    };
  },
};
