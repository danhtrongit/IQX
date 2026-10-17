import type { ChartTone } from '../../../src/modules/academy/content/v3/schema.js';
import type { Builder, Layer, Leaf, Panel, Point, SeriesPanels } from './kit.js';
import { candles, upDown } from './kit.js';
import type { Num } from './math.js';
import {
  at,
  bands,
  crossList,
  crosses,
  genVar,
  lcg,
  macdOf,
  path,
  rng,
  round4,
  rsiDotStates,
  rsiWilder,
  series,
  sma,
  win,
} from './math.js';

/** Chapter 4 chart models (technical analysis). Windows are `[from, to)` in the mockup, `[start, end]` here. */

type OHLC = readonly [number, number, number, number];
type Pt = [number, number];

/** Pixel polyline -> data space with y growing upward. */
const up = (pts: readonly (readonly [number, number])[], h: number): Pt[] =>
  pts.map(([x, y]) => [x, h - y]);
const pxDomain = (h: number) => ({
  x: [0, 760] as [number, number],
  y: [0, h] as [number, number],
});

/* ------------------------------------------------------------------ L1 candles */

const PATTERNS: Record<string, { name: string; c: OHLC[] }> = {
  'c4l1-p1': { name: 'Doji', c: [[50, 95, 5, 51]] },
  'c4l1-p2': { name: 'Búa', c: [[78, 92, 10, 88]] },
  'c4l1-p3': { name: 'Sao băng', c: [[22, 90, 8, 12]] },
  'c4l1-p4': {
    name: 'Nhấn chìm tăng',
    c: [
      [60, 64, 30, 34],
      [30, 90, 26, 86],
    ],
  },
  'c4l1-p5': {
    name: 'Nhấn chìm giảm',
    c: [
      [34, 64, 30, 60],
      [86, 90, 26, 30],
    ],
  },
};

const glyph = ([o, h, l, c]: OHLC, extra: { label?: string; size?: 's' | 'm' | 'l' } = {}) => ({
  o,
  h,
  l,
  c,
  ...extra,
});

/** C4L1-g4: 42 LCG candles. */
export function c4l1Candles(): OHLC[] {
  const r = lcg(11);
  let p = 50;
  const arr: OHLC[] = [];
  for (let i = 0; i < 42; i++) {
    const drift = i < 14 ? -0.6 : i < 30 ? 1.1 : -0.2;
    const o = p;
    const c = o + drift + (r() - 0.5) * 5;
    const h = Math.max(o, c) + r() * 2.5;
    const l = Math.min(o, c) - r() * 2.5;
    arr.push([o, h, l, c]);
    p = c;
  }
  return arr;
}

/** Window of `n` candles [0, n-1] with one candle panel. */
function candlePanels(
  rows: readonly OHLC[],
  o: {
    axes?: false;
    zones?: Panel['zones'];
    segments?: Panel['segments'];
    volume?: number[];
    volSegments?: Panel['segments'];
    levels?: Panel['levels'];
    notes?: Panel['notes'];
    points?: Point[];
    titles?: [string, string];
    alt?: string;
  } = {},
): SeriesPanels {
  const panels: Panel[] = [
    {
      title: o.titles?.[0] ?? '',
      candles: candles(rows),
      series: [],
      ...(o.zones ? { zones: o.zones } : {}),
      ...(o.segments ? { segments: o.segments } : {}),
    },
  ];
  if (o.volume)
    panels.push({
      title: o.titles?.[1] ?? '',
      nonnegative: true,
      series: [],
      bars: { name: 'Khối lượng', values: o.volume, colors: upDown(rows) },
      ...(o.volSegments ? { segments: o.volSegments } : {}),
      ...(o.levels ? { levels: o.levels } : {}),
      ...(o.notes ? { notes: o.notes } : {}),
    });
  return {
    kind: 'series_panels',
    x: { start: 0, end: rows.length - 1 },
    ...(o.axes === false ? { axes: false } : {}),
    marks: [],
    ...(o.points ? { points: o.points } : {}),
    panels,
    ...(o.alt ? { alt: o.alt } : {}),
  };
}

/* ------------------------------------------------------------------ L2-L4 inline data */

const C4L2_UP: OHLC[] = [
  [50, 52, 46, 47],
  [47, 49, 44, 45],
  [45, 50, 44, 49],
  [49, 53, 48, 52],
  [52, 54, 49, 50],
  [50, 51, 47, 48],
  [48, 53, 47, 52],
  [52, 57, 51, 56],
  [56, 58, 52, 53],
  [53, 54, 51, 52],
  [52, 57, 51, 56],
  [56, 61, 55, 60],
  [60, 62, 57, 58],
  [58, 59, 55, 56],
  [56, 61, 55, 60],
  [60, 65, 59, 64],
];
const C4L2_DN: OHLC[] = C4L2_UP.map(([o, h, l, c]) => [110 - o, 110 - l, 110 - h, 110 - c]);

function trendPanel(rows: OHLC[], lows: boolean, tone: ChartTone): SeriesPanels {
  const idx = [1, 5, 9, 13];
  const v = (i: number) => (rows[i] as OHLC)[lows ? 2 : 1];
  return candlePanels(rows, {
    segments: [{ from: [1, v(1)], to: [13, v(13)], tone, extend: 2 }],
    points: idx.map((i) => ({ i, panel: 0, value: v(i), tone, shape: 'ring' as const })),
  });
}

const C4L3_G2: OHLC[] = [
  [70, 72, 55, 58],
  [58, 60, 40, 44],
  [44, 46, 26, 40],
  [40, 52, 38, 50],
  [50, 62, 48, 60],
  [60, 64, 46, 48],
  [48, 50, 30, 34],
  [34, 48, 22, 46],
  [46, 58, 44, 56],
  [56, 70, 54, 68],
  [68, 72, 52, 55],
  [55, 57, 33, 36],
  [36, 50, 25, 48],
  [48, 64, 46, 62],
  [62, 78, 60, 76],
];

const C4L3_TRUE: OHLC[] = [
  [40, 46, 38, 44],
  [44, 50, 42, 48],
  [48, 54, 44, 46],
  [46, 52, 44, 51],
  [51, 70, 50, 68],
  [68, 76, 64, 74],
  [74, 80, 70, 78],
];
const C4L3_FALSE: OHLC[] = [
  [40, 46, 38, 44],
  [44, 50, 42, 48],
  [48, 54, 44, 46],
  [46, 52, 44, 51],
  [51, 64, 47, 49],
  [49, 50, 40, 42],
  [42, 44, 34, 36],
];

type OHLCV = readonly [number, number, number, number, number];
const ohlc = (d: readonly OHLCV[]): OHLC[] => d.map(([o, h, l, c]) => [o, h, l, c]);
const vol = (d: readonly OHLCV[]): number[] => d.map((r) => r[4]);

const C4L4_G1: OHLCV[] = [
  [44, 47, 43, 46, 30],
  [46, 49, 45, 48, 36],
  [48, 49, 45, 46, 20],
  [46, 50, 45, 49, 34],
  [49, 54, 48, 53, 52],
  [53, 55, 51, 52, 26],
  [52, 53, 49, 50, 22],
  [50, 55, 49, 54, 44],
  [54, 59, 53, 58, 60],
  [58, 60, 56, 57, 28],
  [57, 58, 54, 55, 24],
  [55, 60, 54, 59, 46],
  [59, 64, 58, 63, 62],
  [63, 65, 60, 61, 30],
  [61, 66, 60, 65, 48],
  [65, 70, 64, 69, 66],
];
const C4L4_A: OHLCV[] = [
  [40, 44, 39, 43, 40],
  [43, 48, 42, 47, 52],
  [47, 48, 44, 45, 18],
  [45, 50, 44, 49, 46],
  [49, 54, 48, 53, 58],
  [53, 54, 50, 51, 20],
  [51, 56, 50, 55, 50],
  [55, 60, 54, 59, 62],
];
const C4L4_B: OHLCV[] = [
  [40, 44, 39, 43, 60],
  [43, 48, 42, 47, 54],
  [47, 48, 44, 45, 30],
  [45, 50, 44, 49, 44],
  [49, 54, 48, 53, 36],
  [53, 54, 50, 51, 24],
  [51, 56, 50, 55, 26],
  [55, 58, 54, 57, 16],
];
const C4L4_G3: OHLCV[] = [
  [50, 53, 48, 52, 24],
  [52, 56, 51, 54, 28],
  [54, 55, 49, 50, 22],
  [50, 52, 47, 48, 20],
  [48, 51, 46, 50, 18],
  [50, 55, 49, 54, 24],
  [54, 57, 52, 53, 26],
  [53, 54, 49, 50, 20],
  [50, 53, 48, 52, 18],
  [52, 55, 50, 54, 22],
  [54, 56, 52, 55, 24],
  [55, 66, 54, 65, 80],
  [65, 69, 63, 68, 46],
  [68, 72, 66, 71, 40],
];
const C4L4_S_UP: OHLC[] = [
  [30, 34, 29, 33],
  [33, 38, 32, 37],
  [37, 42, 36, 41],
  [41, 46, 40, 45],
  [45, 50, 44, 49],
  [49, 54, 48, 53],
];
const C4L4_S_DN: OHLC[] = C4L4_S_UP.map(([o, h, l, c]) => [83 - o, 83 - l, 83 - h, 83 - c]);
const VU = [14, 20, 26, 32, 38, 44];
const VD = [44, 38, 32, 26, 20, 14];

function thumb(d: OHLC[], v: number[], alt: string): SeriesPanels {
  const isUp = (d[0] as OHLC)[3] < (d[5] as OHLC)[3];
  const k = isUp ? 2 : 1;
  const pt: ChartTone = isUp ? 'pos' : 'neg';
  const vt: ChartTone = (v[0] as number) < (v[5] as number) ? 'pos' : 'neg';
  return candlePanels(d, {
    axes: false,
    segments: [{ from: [0, (d[0] as OHLC)[k]], to: [5, (d[5] as OHLC)[k]], tone: pt, dash: true }],
    volume: v,
    volSegments: [{ from: [0, v[0] as number], to: [5, v[5] as number], tone: vt, dash: true }],
    alt,
  });
}

/* ------------------------------------------------------------------ indicator charts */

interface Line {
  name: string;
  role: ChartTone;
  v: readonly Num[];
  width?: 1 | 2 | 3;
  dash?: true;
}

const priceLine = (p: readonly number[], width: 1 | 2 | 3 = 2): Line => ({
  name: 'Giá',
  role: 'price',
  v: p,
  width,
});

function linesPanel(
  title: string,
  lines: Line[],
  from: number,
  to: number,
  extra: Partial<Panel> = {},
): Panel {
  return {
    title,
    series: lines.map((l) => ({
      name: l.name,
      role: l.role,
      ...(l.dash ? { dash: true as const } : {}),
      ...(l.width ? { width: l.width } : {}),
      values: win(l.v, from, to - 1),
    })),
    ...extra,
  };
}

function panels(
  from: number,
  to: number,
  ps: Panel[],
  o: { points?: Point[]; marks?: SeriesPanels['marks']; alt?: string } = {},
): SeriesPanels {
  return {
    kind: 'series_panels',
    x: { start: from, end: to - 1 },
    marks: o.marks ?? [],
    ...(o.points && o.points.length ? { points: o.points } : {}),
    panels: ps,
    ...(o.alt ? { alt: o.alt } : {}),
  };
}

const RSI_LEVELS: Panel['levels'] = [
  { value: 70, role: 'sell', label: '70' },
  { value: 50, role: 'neutral', label: '50' },
  { value: 30, role: 'buy', label: '30' },
];

function rsiPanel(
  r: readonly Num[],
  from: number,
  to: number,
  zones: 'none' | 'plain' | 'labelled',
): Panel {
  return linesPanel('RSI (14)', [{ name: 'RSI', role: 'p4', v: r, width: 2 }], from, to, {
    bounds: [0, 100],
    ticks: [30, 50, 70],
    digits: 0,
    levels: RSI_LEVELS,
    ...(zones === 'none'
      ? {}
      : {
          zones: [
            {
              from: 70,
              to: 100,
              tone: 'neg',
              ...(zones === 'labelled' ? { label: 'Quá mua' } : {}),
            },
            { from: 0, to: 30, tone: 'pos', ...(zones === 'labelled' ? { label: 'Quá bán' } : {}) },
          ],
        }),
  });
}

function macdPanel(
  p: readonly number[],
  from: number,
  to: number,
  o: { hist?: boolean; signal?: boolean } = {},
): Panel {
  const M = macdOf(p);
  const lines: Line[] = [{ name: 'MACD', role: 'p1', v: M.m, width: 2 }];
  if (o.signal !== false) lines.push({ name: 'Đường tín hiệu', role: 'warn', v: M.sg, width: 2 });
  const h = win(M.h, from, to - 1);
  return linesPanel('MACD (12, 26, 9)', lines, from, to, {
    zero: true,
    ...(o.hist !== false
      ? {
          bars: {
            name: 'Histogram',
            values: h,
            colors: h.map((v) => ((v ?? 0) >= 0 ? ('pos' as const) : ('neg' as const))),
          },
        }
      : {}),
  });
}

/** Stop-loss line from the entry bar to the window end, with its label at the end. */
function stop(e: number, end: number, sl: number): Pick<Panel, 'segments' | 'notes'> {
  const v = round4(sl);
  return {
    segments: [{ from: [e, v], to: [end, v], tone: 'neg', dash: true }],
    notes: [{ i: end, value: v, text: 'Cắt lỗ', tone: 'neg' }],
  };
}

/** Shared `pullback150` path of C4L6-g5 and C4L7-g6. */
export function pullback150(): number[] {
  const U = [0.9, -0.5, 0.8, -0.4, 0.7, 0.3, -0.6];
  const D = [-0.8, -0.5, 0.3, -0.7, -0.5, 0.2, -0.6, -0.4, 0.2, -0.5];
  const R = [1, 0.8, -0.3, 0.9, 0.6, -0.4, 0.7];
  const rn = rng(3);
  const p = [40];
  for (let i = 1; i < 150; i++) {
    const d =
      i < 110
        ? (U[i % 7] as number)
        : i < 120
          ? (D[i - 110] as number)
          : (R[(i - 120) % 7] as number);
    p.push(at(p, i - 1) + d + (rn() - 0.5) * 0.25);
  }
  return p;
}

/** C4L6-g5 derived marks: k = RSI low in 112..123, e = first rise of 5 RSI points with price up. */
export function c4l6Worked(): { p: number[]; r: Num[]; k: number; e: number; sl: number } {
  const p = pullback150();
  const r = rsiWilder(p, 14);
  let k = 112;
  for (let i = 112; i < 124; i++) if (at(r, i) < at(r, k)) k = i;
  let e = k + 1;
  while (e < 140 && !(at(r, e) >= at(r, k) + 5 && at(p, e) > at(p, e - 1))) e++;
  let lo = 1e9;
  for (let i = 110; i <= e; i++) lo = Math.min(lo, at(p, i));
  return { p, r, k, e, sl: lo - 1.2 };
}

/** C4L7-g6: e = first histogram cross up in 112..139. */
export function c4l7Worked(): { p: number[]; e: number; m: number; sl: number } {
  const p = pullback150();
  const M = macdOf(p);
  let e = -1;
  for (let i = 112; i < 140; i++)
    if (at(M.h, i - 1) < 0 && at(M.h, i) >= 0) {
      e = i;
      break;
    }
  let lo = 1e9;
  for (let i = 108; i <= e; i++) lo = Math.min(lo, at(p, i));
  return { p, e, m: at(M.m, e), sl: lo - 1.2 };
}

/** C4L8-g4: buy one bar after the first local low touching the middle band in 74..89. */
export function c4l8Worked(): { p: number[]; k: number; e: number; sl: number } {
  const p = series(110, 12, (i) => 40 + i * 0.3 + 2.2 * Math.sin((i - 14) / 6), 2.2);
  const b = bands(p, 20, 2);
  let k = 78;
  for (let i = 74; i < 90; i++) {
    const m = at(b.mid, i);
    if (
      at(p, i) <= at(p, i - 1) &&
      at(p, i) <= at(p, i + 1) &&
      at(p, i) > m - 0.4 &&
      at(p, i) < m + 0.3
    ) {
      k = i;
      break;
    }
  }
  const e = k + 1;
  let lo = 1e9;
  for (let i = k - 4; i <= k; i++) lo = Math.min(lo, at(p, i));
  return { p, k, e, sl: lo - 1.2 };
}

/** C4L9-g4: swing low a, high b, pullback low k, entry e, retracement (b-k)/(b-a). */
export function c4l9Worked(): {
  p: number[];
  a: number;
  b: number;
  k: number;
  e: number;
  ret: number;
  sl: number;
} {
  const p = path(
    [
      [10, -3],
      [34, 28],
      [15, -15.6],
      [4, 1.2],
      [30, 22],
    ],
    44,
    21,
    1.1,
  );
  let a = 0;
  let b = 0;
  for (let i = 5; i < 48; i++) {
    if (at(p, i) < at(p, a) || a === 0) a = i;
    if (at(p, i) > at(p, b)) b = i;
  }
  let k = b;
  for (let i = b; i < b + 22; i++) if (at(p, i) < at(p, k)) k = i;
  let e = k + 1;
  while (e < k + 6 && !(at(p, e) > at(p, e - 1) + 0.3)) e++;
  return { p, a, b, k, e, ret: (at(p, b) - at(p, k)) / (at(p, b) - at(p, a)), sl: at(p, k) - 3 };
}

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 1];

function swing(p: readonly number[], n: number): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    if (at(p, i) < at(p, a)) a = i;
    if (at(p, i) > at(p, b)) b = i;
  }
  return { a, b };
}

function fibChart(
  p: number[],
  n: number,
  dir: 'up' | 'down',
  title: string,
  labels: boolean,
): SeriesPanels {
  const { a, b } = swing(p, n);
  return panels(
    0,
    p.length,
    [
      linesPanel(title, [priceLine(p)], 0, p.length, {
        fib: {
          lo: { i: a, v: round4(at(p, a)) },
          hi: { i: b, v: round4(at(p, b)) },
          dir,
          levels: FIB_LEVELS,
          zone: [0.5, 0.618],
        },
      }),
    ],
    {
      ...(labels
        ? {
            points: [
              {
                i: a,
                panel: 0,
                value: round4(at(p, a)),
                tone: 'price',
                label: 'Đáy',
                pos: 'below',
              },
              {
                i: b,
                panel: 0,
                value: round4(at(p, b)),
                tone: 'price',
                label: 'Đỉnh',
                pos: 'above',
              },
            ],
          }
        : {}),
    },
  );
}

/* ------------------------------------------------------------------ divergence + Elliott schematics */

const DIV_P: Pt[] = [
  [0, 130],
  [40, 100],
  [80, 70],
  [110, 95],
  [150, 110],
  [190, 80],
  [230, 50],
  [260, 80],
  [300, 110],
];
const DIV_R: Pt[] = [
  [0, 250],
  [40, 215],
  [80, 185],
  [110, 230],
  [150, 245],
  [190, 220],
  [230, 205],
  [260, 240],
  [300, 260],
];

function divergence(ind: 'RSI' | 'MACD'): Leaf<'schematic'>[] {
  const make = (pp: Pt[], rr: Pt[], tone: 'neg' | 'pos', alt: string): Leaf<'schematic'> => {
    const P = pp.map(([x, y]): Pt => [x, 160 - y]);
    const R = rr.map(([x, y]): Pt => [x, 280 - y]);
    const layers: Layer[] = [
      { t: 'line', pts: P, tone: 'price', width: 2, panel: 0 },
      { t: 'line', pts: R, tone: ind === 'RSI' ? 'p4' : 'p1', width: 2, panel: 1 },
    ];
    for (const [k, L] of [P, R].entries()) {
      layers.push({ t: 'segment', from: L[2] as Pt, to: L[6] as Pt, tone, dash: true, panel: k });
      layers.push({ t: 'point', at: L[2] as Pt, tone, panel: k });
      layers.push({ t: 'point', at: L[6] as Pt, tone, panel: k });
    }
    return {
      kind: 'schematic',
      domain: { x: [0, 300], y: [0, 160] },
      panels: [
        { title: 'Giá', y: [0, 160] },
        { title: ind, y: [0, 110] },
      ],
      layers,
      alt,
    };
  };
  return [
    make(DIV_P, DIV_R, 'neg', `Phân kỳ giảm: giá tạo đỉnh cao hơn, ${ind} tạo đỉnh thấp hơn`),
    make(
      DIV_P.map(([x, y]) => [x, 194 - y]),
      DIV_R.map(([x, y]) => [x, 450 - y]),
      'pos',
      `Phân kỳ tăng: giá tạo đáy thấp hơn, ${ind} tạo đáy cao hơn`,
    ),
  ];
}

const W1: Pt[] = [
  [40, 250],
  [130, 170],
  [180, 215],
  [330, 70],
  [390, 125],
  [480, 40],
  [560, 140],
  [610, 100],
  [710, 200],
];
const W2: Pt[] = [
  [40, 280],
  [180, 190],
  [250, 245],
  [450, 70],
  [530, 137],
  [680, 40],
];
const LB: [number, string, boolean][] = [
  [1, '1', true],
  [2, '2', false],
  [3, '3', true],
  [4, '4', false],
  [5, '5', true],
  [6, 'A', false],
  [7, 'B', true],
  [8, 'C', false],
];

function wave(P: Pt[], h: number, labels: [number, string, boolean][]): Layer[] {
  const pts = up(P, h);
  const colors: ChartTone[] = pts.slice(1).map((_, i) => (i < 5 ? 'pos' : 'neg'));
  return [
    { t: 'line', pts, tone: 'pos', colors, width: 3 },
    ...labels.map(([i, text, above]): Layer => ({
      t: 'tag',
      at: pts[i] as Pt,
      text,
      tone: i <= 5 ? 'pos' : 'neg',
      pos: above ? 'above' : 'below',
    })),
  ];
}

/* ------------------------------------------------------------------ builders */

export const CH4_BUILDERS: Record<string, Builder> = {
  'c4l1-g1': () => ({
    kind: 'candle_glyphs',
    domain: [0, 110],
    groups: [
      { title: 'Nến tăng', candles: [glyph([40, 100, 15, 80], { size: 'l' })], annotate: 'ohlc' },
      { title: 'Nến giảm', candles: [glyph([80, 100, 15, 40], { size: 'l' })], annotate: 'ohlc' },
    ],
    alt: 'Cấu tạo nến tăng và nến giảm: giá mở cửa, đóng cửa, cao nhất, thấp nhất',
  }),
  'c4l1-g2': () => ({
    kind: 'candle_glyphs',
    domain: [0, 110],
    groups: [
      {
        candles: (
          [
            ['Thân dài', [20, 100, 15, 95]],
            ['Thân ngắn', [55, 75, 40, 60]],
            ['Bóng trên dài', [30, 105, 25, 42]],
            ['Bóng dưới dài', [80, 88, 5, 92]],
          ] as const
        ).map(([label, c]) => glyph(c, { label })),
      },
    ],
    alt: 'Bốn dạng nến: thân dài, thân ngắn, bóng trên dài, bóng dưới dài',
  }),
  'c4l1-g3': () => {
    const d: OHLC[] = [
      [30, 48, 25, 45],
      [45, 60, 40, 55],
      [55, 58, 38, 42],
      [42, 70, 40, 66],
      [66, 85, 60, 80],
    ];
    const days = ['T2', 'T3', 'T4', 'T5', 'T6'];
    return {
      kind: 'candle_glyphs',
      domain: [20, 90],
      groups: [
        { title: '5 nến ngày', candles: d.map((c, i) => glyph(c, { label: days[i] as string })) },
        { title: '1 nến tuần', candles: [glyph([30, 85, 25, 80], { label: 'Tuần', size: 'l' })] },
      ],
      join: '=',
      alt: 'Năm nến ngày từ thứ Hai đến thứ Sáu gộp thành một nến tuần',
    };
  },
  ...Object.fromEntries(
    Object.entries(PATTERNS).map(([id, { name, c }]): [string, Builder] => [
      id,
      () => ({
        kind: 'candle_glyphs',
        domain: [0, 100],
        groups: [{ candles: c.map((x) => glyph(x)) }],
        alt: `Mô hình nến ${name}`,
      }),
    ]),
  ),
  'c4l1-g4': () =>
    candlePanels(c4l1Candles(), {
      axes: false,
      alt: 'Biểu đồ nến 42 phiên: giảm, tăng mạnh rồi đi ngang',
    }),

  'c4l2-g1': () => {
    const sets: [string, ChartTone | undefined, ChartTone, Pt[]][] = [
      [
        'Xu hướng tăng',
        'pos',
        'pos',
        [
          [0, 150],
          [40, 110],
          [70, 130],
          [110, 80],
          [140, 100],
          [180, 45],
          [200, 60],
        ],
      ],
      [
        'Xu hướng giảm',
        'neg',
        'neg',
        [
          [0, 45],
          [40, 85],
          [70, 65],
          [110, 115],
          [140, 95],
          [180, 150],
          [200, 138],
        ],
      ],
      [
        'Đi ngang',
        undefined,
        'price',
        [
          [0, 100],
          [35, 70],
          [70, 125],
          [105, 70],
          [140, 125],
          [175, 72],
          [200, 100],
        ],
      ],
    ];
    return {
      kind: 'compare',
      layout: 'row',
      items: sets.map(([title, tone, lt, pts]) => ({
        title,
        ...(tone ? { tone } : {}),
        model: {
          kind: 'schematic' as const,
          domain: { x: [0, 200] as [number, number], y: [0, 180] as [number, number] },
          layers: [{ t: 'line' as const, pts: up(pts, 180), tone: lt, width: 3 as const }],
          alt: title,
        },
      })),
    };
  },
  'c4l2-g2': () => {
    const H = 260;
    const P = up(
      [
        [40, 210],
        [150, 130],
        [230, 170],
        [350, 90],
        [430, 130],
        [560, 50],
        [640, 85],
        [720, 60],
      ],
      H,
    );
    const pt = (i: number, label: string, tone: ChartTone, pos: 'above' | 'below'): Layer => ({
      t: 'point',
      at: P[i] as Pt,
      tone,
      label,
      pos,
    });
    return {
      kind: 'schematic',
      domain: pxDomain(H),
      layers: [
        { t: 'line', pts: P, tone: 'price', width: 3 },
        { t: 'segment', from: P[1] as Pt, to: P[5] as Pt, tone: 'warn', dash: true },
        { t: 'segment', from: P[2] as Pt, to: P[4] as Pt, tone: 'p1', dash: true },
        pt(1, 'Đỉnh 1', 'warn', 'above'),
        pt(3, 'Đỉnh 2', 'warn', 'above'),
        pt(5, 'Đỉnh 3', 'warn', 'above'),
        pt(2, 'Đáy 1', 'p1', 'below'),
        pt(4, 'Đáy 2', 'p1', 'below'),
        {
          t: 'text',
          at: [740, H - 250],
          text: 'Đỉnh và đáy cao dần: xu hướng tăng',
          tone: 'pos',
          anchor: 'end',
        },
      ],
      alt: 'Xu hướng tăng: các đỉnh và đáy sau cao hơn đỉnh và đáy trước',
    };
  },
  'c4l2-g3': () => ({
    kind: 'compare',
    layout: 'row',
    items: [
      { title: 'Nối các đáy', tone: 'pos', model: trendPanel(C4L2_UP, true, 'pos') },
      { title: 'Nối các đỉnh', tone: 'neg', model: trendPanel(C4L2_DN, false, 'neg') },
    ],
  }),
  'c4l2-g4': () => {
    const H = 250;
    return {
      kind: 'schematic',
      domain: pxDomain(H),
      layers: [
        { t: 'zone', x: [290, 475], y: [H - 210, H - 110], tone: 'neg', label: 'Giảm ngắn hạn' },
        { t: 'segment', from: [20, H - 226], to: [740, H - 184], tone: 'pos', dash: true },
        {
          t: 'line',
          pts: up(
            [
              [30, 220],
              [110, 170],
              [160, 190],
              [250, 120],
              [300, 150],
              [340, 135],
              [380, 175],
              [420, 160],
              [460, 195],
              [520, 120],
              [600, 80],
              [650, 95],
              [730, 40],
            ],
            H,
          ),
          tone: 'price',
          width: 2,
        },
        {
          t: 'text',
          at: [600, H - 222],
          text: 'Đường xu hướng tăng dài hạn',
          tone: 'pos',
          anchor: 'middle',
        },
      ],
      alt: 'Một nhịp giảm ngắn hạn nằm trong xu hướng tăng dài hạn',
    };
  },
  'c4l2-g5': () => {
    const H = 250;
    return {
      kind: 'schematic',
      domain: pxDomain(H),
      layers: [
        { t: 'segment', from: [30, H - 225], to: [640, H - 93], tone: 'pos', dash: true },
        {
          t: 'line',
          pts: up(
            [
              [30, 220],
              [110, 160],
              [160, 185],
              [260, 100],
              [320, 140],
              [420, 60],
              [480, 110],
              [540, 75],
              [600, 150],
              [650, 125],
              [720, 200],
            ],
            H,
          ),
          tone: 'price',
          width: 2,
        },
        { t: 'point', at: [420, H - 60], tone: 'p3' },
        { t: 'point', at: [540, H - 75], tone: 'warn', label: 'Đỉnh thấp hơn', pos: 'above' },
        {
          t: 'point',
          at: [567, H - 109],
          tone: 'neg',
          shape: 'ring',
          label: 'Phá đường xu hướng',
          pos: 'below',
        },
      ],
      alt: 'Xu hướng tăng kết thúc: đỉnh thấp hơn rồi giá phá đường xu hướng',
    };
  },

  'c4l3-g1': () => {
    const H = 236;
    const P = up(
      [
        [30, 180],
        [100, 62],
        [180, 205],
        [260, 58],
        [340, 210],
        [420, 64],
        [500, 200],
        [580, 60],
        [660, 207],
        [730, 120],
      ],
      H,
    );
    return {
      kind: 'schematic',
      domain: pxDomain(H),
      layers: [
        { t: 'zone', y: [H - 72, H - 48], tone: 'neg', label: 'Kháng cự' },
        { t: 'zone', y: [H - 220, H - 196], tone: 'pos', label: 'Hỗ trợ' },
        { t: 'line', pts: P, tone: 'price', width: 3 },
        ...[1, 3, 5, 7].map((i): Layer => ({ t: 'point', at: P[i] as Pt, tone: 'neg' })),
        ...[2, 4, 6, 8].map((i): Layer => ({ t: 'point', at: P[i] as Pt, tone: 'pos' })),
      ],
      alt: 'Giá dao động giữa vùng kháng cự phía trên và vùng hỗ trợ phía dưới',
    };
  },
  'c4l3-g2': () =>
    candlePanels(C4L3_G2, {
      zones: [{ from: 24, to: 32, tone: 'pos', label: 'Vùng hỗ trợ' }],
      alt: 'Giá nhiều lần chạm vùng hỗ trợ rồi bật lên',
    }),
  'c4l3-g3': () => {
    const H = 250;
    return {
      kind: 'schematic',
      domain: pxDomain(H),
      layers: [
        { t: 'zone', y: [H - 140, H - 118], tone: 'warn' },
        { t: 'text', at: [150, H - 110], text: 'Kháng cự', tone: 'neg', anchor: 'middle' },
        { t: 'text', at: [560, H - 166], text: 'Trở thành hỗ trợ', tone: 'pos', anchor: 'middle' },
        {
          t: 'line',
          pts: up(
            [
              [30, 220],
              [90, 128],
              [150, 190],
              [220, 126],
              [280, 180],
              [360, 60],
              [430, 110],
              [480, 128],
              [540, 70],
              [620, 40],
              [680, 124],
              [740, 30],
            ],
            H,
          ),
          tone: 'price',
          width: 3,
        },
        {
          t: 'point',
          at: [315, H - 129],
          tone: 'p1',
          shape: 'ring',
          label: 'Phá vỡ',
          pos: 'above',
        },
        { t: 'point', at: [480, H - 128], tone: 'pos' },
        { t: 'point', at: [680, H - 124], tone: 'pos' },
      ],
      alt: 'Kháng cự bị phá vỡ trở thành hỗ trợ khi giá quay lại kiểm tra',
    };
  },
  'c4l3-g4': () => {
    const z: Panel['zones'] = [{ from: 48, to: 56, tone: 'neg' }];
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        {
          title: 'Phá vỡ thật',
          tone: 'pos',
          model: candlePanels(C4L3_TRUE, { zones: z, volume: [20, 22, 18, 24, 70, 55, 48] }),
        },
        {
          title: 'Phá vỡ giả',
          tone: 'neg',
          model: candlePanels(C4L3_FALSE, { zones: z, volume: [20, 22, 18, 24, 26, 30, 28] }),
        },
      ],
    };
  },

  'c4l4-g1': () =>
    candlePanels(ohlc(C4L4_G1), {
      volume: vol(C4L4_G1),
      titles: ['Giá', 'Khối lượng'],
      alt: 'Giá tăng kèm khối lượng lớn ở các phiên tăng',
    }),
  'c4l4-g2': () => {
    const ups = [0, 1, 3, 4, 6, 7];
    const vB = vol(C4L4_B);
    const segs: Panel['segments'] = ups.slice(1).map((j, n) => {
      const i = ups[n] as number;
      return { from: [i, vB[i] as number], to: [j, vB[j] as number], tone: 'neg', dash: true };
    });
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        {
          title: 'Xu hướng khỏe',
          tone: 'pos',
          model: candlePanels(ohlc(C4L4_A), { volume: vol(C4L4_A) }),
        },
        {
          title: 'Lực mua suy yếu',
          tone: 'neg',
          model: candlePanels(ohlc(C4L4_B), { volume: vB, volSegments: segs }),
        },
      ],
    };
  },
  'c4l4-g3': () =>
    candlePanels(ohlc(C4L4_G3), {
      zones: [{ from: 56, to: 58.5, tone: 'neg', label: 'Kháng cự' }],
      volume: vol(C4L4_G3),
      levels: [{ value: 23, role: 'avg', label: 'Trung bình 20 phiên' }],
      notes: [{ i: 11, value: 80, text: 'Đột biến', tone: 'info' }],
      alt: 'Giá vượt kháng cự với khối lượng đột biến, cao gấp nhiều lần trung bình 20 phiên',
    }),
  'c4l4-s1': () => thumb(C4L4_S_UP, VU, 'Giá tăng, khối lượng tăng'),
  'c4l4-s2': () => thumb(C4L4_S_UP, VD, 'Giá tăng, khối lượng giảm'),
  'c4l4-s3': () => thumb(C4L4_S_DN, VU, 'Giá giảm, khối lượng tăng'),
  'c4l4-s4': () => thumb(C4L4_S_DN, VD, 'Giá giảm, khối lượng giảm'),

  'c4l5-g1': () => {
    const p = series(110, 7, (i) => 50 + i * 0.22 + 6 * Math.sin(i / 9), 5.5);
    return panels(
      20,
      110,
      [
        linesPanel(
          '',
          [priceLine(p), { name: 'MA20', role: 'p1', v: sma(p, 20), width: 3 }],
          20,
          110,
        ),
      ],
      {
        alt: 'Giá dao động quanh đường MA20 mượt hơn',
      },
    );
  },
  'c4l5-g2': () => {
    const p = series(420, 11, (i) => 60 + i * 0.2 + 9 * Math.sin(i / 30) + 3 * Math.sin(i / 9), 4);
    return panels(
      220,
      420,
      [
        linesPanel(
          '',
          [
            priceLine(p, 1),
            { name: 'MA20', role: 'p1', v: sma(p, 20), width: 2 },
            { name: 'MA50', role: 'p2', v: sma(p, 50), width: 3 },
            { name: 'MA200', role: 'p5', v: sma(p, 200), width: 3 },
          ],
          220,
          420,
        ),
      ],
      { alt: 'Giá cùng ba đường MA20, MA50 và MA200' },
    );
  },
  'c4l5-g3': () => {
    const one = (f: (i: number) => number, seed: number): SeriesPanels => {
      const p = series(90, seed, f, 4);
      return panels(20, 90, [
        linesPanel(
          '',
          [priceLine(p), { name: 'MA20', role: 'p1', v: sma(p, 20), width: 3 }],
          20,
          90,
        ),
      ]);
    };
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        { title: 'Xu hướng tăng', tone: 'pos', model: one((i) => 40 + i * 0.32, 3) },
        { title: 'Xu hướng giảm', tone: 'neg', model: one((i) => 80 - i * 0.32, 5) },
      ],
    };
  },
  'c4l5-g4': () => {
    const p = series(
      132,
      23,
      (i) => 40 + i * 0.32 + 6.5 * Math.abs(Math.sin((i * Math.PI) / 22)),
      1.1,
    );
    const points: Point[] = [44, 66, 88, 110].map((c) => {
      let j = c - 3;
      for (let i = c - 3; i <= c + 3; i++) if (at(p, i) < at(p, j)) j = i;
      return { i: j, panel: 0, value: round4(at(p, j)), tone: 'pos' };
    });
    return panels(
      22,
      132,
      [
        linesPanel(
          '',
          [priceLine(p), { name: 'MA20', role: 'p1', v: sma(p, 20), width: 3 }],
          22,
          132,
        ),
      ],
      {
        points,
        alt: 'Giá nhiều lần chạm đường MA20 rồi bật lên',
      },
    );
  },
  'c4l5-g5': () => {
    const one = (f: (i: number) => number, seed: number, tone: ChartTone): SeriesPanels => {
      const p = series(110, seed, f, 3);
      const a = sma(p, 10);
      const b = sma(p, 30);
      const points: Point[] = crosses(a, b, 31, 110).map((k) => ({
        i: k.i,
        panel: 0,
        value: round4((at(a, k.i) + at(b, k.i)) / 2),
        tone,
        shape: 'ring',
      }));
      return panels(
        30,
        110,
        [
          linesPanel(
            '',
            [
              priceLine(p, 1),
              { name: 'MA10', role: 'p1', v: a, width: 3 },
              { name: 'MA30', role: 'p2', v: b, width: 3 },
            ],
            30,
            110,
          ),
        ],
        { points },
      );
    };
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        {
          title: 'Giao cắt vàng',
          tone: 'pos',
          model: one((i) => (i < 45 ? 70 - i * 0.55 : 45.25 + (i - 45) * 0.75), 31, 'pos'),
        },
        {
          title: 'Giao cắt tử thần',
          tone: 'neg',
          model: one((i) => (i < 45 ? 40 + i * 0.55 : 64.75 - (i - 45) * 0.75), 37, 'neg'),
        },
      ],
    };
  },
  'c4l5-g6': () => {
    const p = series(130, 41, (i) => 50 + 3.2 * Math.sin(i / 3.6) + 1.6 * Math.sin(i / 7.3), 2.2);
    const m = sma(p, 20);
    const points: Point[] = crosses(p, m, 21, 130).map((k) => ({
      i: k.i,
      panel: 0,
      value: round4(at(m, k.i)),
      tone: 'warn',
    }));
    return panels(
      20,
      130,
      [linesPanel('', [priceLine(p), { name: 'MA20', role: 'p1', v: m, width: 3 }], 20, 130)],
      {
        points,
        alt: 'Thị trường đi ngang: giá cắt MA20 liên tục, tạo nhiều tín hiệu nhiễu',
      },
    );
  },

  'c4l6-g0': () => {
    const A = [3, 2, -2, 3, 2, 3, -1, 2, 3, -2, 3, 2, -1, 2];
    const B = [2, -2, 1, -1, 3, -3, 2, -1, -2, 2, 1, -2, 2, -2];
    const C = A.map((v) => -v);
    const item = (title: string, d: number[]) => {
      const G = d.filter((v) => v > 0).reduce((s, v) => s + v, 0);
      const L = -d.filter((v) => v < 0).reduce((s, v) => s + v, 0);
      const val = Math.round((100 * G) / (G + L));
      return {
        title,
        model: {
          kind: 'category' as const,
          mode: 'grouped' as const,
          labels: d.map((_, i) => String(i + 1)),
          unit: '',
          series: [
            {
              name: 'Thay đổi giá',
              values: d,
              tone_by_sign: { pos: 'pos' as const, neg: 'neg' as const },
            },
          ],
          value_labels: 'none' as const,
          caption_value: `RSI ≈ ${val}`,
          caption_tone:
            val >= 70 ? ('neg' as const) : val <= 30 ? ('pos' as const) : ('price' as const),
        },
      };
    };
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        item('Phần lớn phiên tăng', A),
        item('Tăng giảm cân bằng', B),
        item('Phần lớn phiên giảm', C),
      ],
    };
  },
  'c4l6-g1': () => {
    const p = series(140, 5, (i) => 50 + 7 * Math.sin(i / 9) + i * 0.04, 2.4);
    const r = rsiWilder(p, 14);
    return panels(
      20,
      140,
      [linesPanel('Giá', [priceLine(p)], 20, 140), rsiPanel(r, 20, 140, 'none')],
      {
        alt: 'Giá và chỉ báo RSI 14 phiên với các mốc 70, 50, 30',
      },
    );
  },
  'c4l6-g2': () => {
    const p = series(140, 5, (i) => 50 + 7 * Math.sin(i / 9) + i * 0.04, 2.4);
    const r = rsiWilder(p, 14);
    const points: Point[] = rsiDotStates(r, 20, 140).flatMap(({ i, over }) => {
      const tone: ChartTone = over ? 'neg' : 'pos';
      return [
        { i, panel: 0, value: round4(at(p, i)), tone },
        { i, panel: 1, value: round4(at(r, i)), tone },
      ];
    });
    return panels(
      20,
      140,
      [linesPanel('Giá', [priceLine(p)], 20, 140), rsiPanel(r, 20, 140, 'labelled')],
      {
        points,
        alt: 'RSI vào vùng quá mua trùng các đỉnh giá, vào vùng quá bán trùng các đáy giá',
      },
    );
  },
  'c4l6-g3': () => {
    const p = series(
      140,
      9,
      (i) => (i < 30 ? 50 + Math.sin(i / 5) : 50 + (i - 30) * 0.5 + 1.6 * Math.sin(i / 5)),
      2.6,
    );
    const r = rsiWilder(p, 14);
    return panels(
      20,
      140,
      [linesPanel('Giá', [priceLine(p)], 20, 140), rsiPanel(r, 20, 140, 'plain')],
      {
        alt: 'Trong xu hướng tăng mạnh, RSI ở vùng cao trong thời gian dài',
      },
    );
  },
  'c4l6-g4': () => {
    const [a, b] = divergence('RSI');
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        { title: 'Phân kỳ giảm', tone: 'neg', model: a as Leaf<'schematic'> },
        { title: 'Phân kỳ tăng', tone: 'pos', model: b as Leaf<'schematic'> },
      ],
    };
  },
  'c4l6-g5': () => {
    const { p, r, k, e, sl } = c4l6Worked();
    return panels(
      75,
      150,
      [
        linesPanel(
          'Giá',
          [{ name: 'MA50', role: 'p1', v: sma(p, 50), width: 2 }, priceLine(p)],
          75,
          150,
          stop(e, 149, sl),
        ),
        rsiPanel(r, 75, 150, 'plain'),
      ],
      {
        points: [
          { i: e, panel: 0, value: round4(at(p, e)), tone: 'pos', label: 'Mua', pos: 'above' },
          { i: k, panel: 1, value: round4(at(r, k)), tone: 'warn' },
          { i: e, panel: 1, value: round4(at(r, e)), tone: 'pos' },
        ],
        alt: 'Ví dụ: giá điều chỉnh về MA50, RSI bật lên từ vùng thấp thì mua, cắt lỗ dưới đáy gần nhất',
      },
    );
  },

  'c4l7-g1': () => {
    const p = series(170, 5, (i) => 50 + 7 * Math.sin(i / 11) + i * 0.04, 2);
    return panels(50, 170, [linesPanel('Giá', [priceLine(p)], 50, 170), macdPanel(p, 50, 170)], {
      alt: 'Giá và chỉ báo MACD gồm đường MACD, đường tín hiệu và histogram',
    });
  },
  'c4l7-g2': () => {
    const p = series(170, 5, (i) => 50 + 7 * Math.sin(i / 11) + i * 0.04, 2);
    const E = macdOf(p);
    return panels(
      50,
      170,
      [
        linesPanel(
          'Giá',
          [
            { name: 'EMA12', role: 'pos', v: E.e12, width: 2 },
            { name: 'EMA26', role: 'p5', v: E.e26, width: 2 },
            priceLine(p),
          ],
          50,
          170,
        ),
        macdPanel(p, 50, 170, { hist: false, signal: false }),
      ],
      { alt: 'Đường MACD là khoảng cách giữa EMA12 và EMA26' },
    );
  },
  'c4l7-g3': () => {
    const p = series(170, 8, (i) => 50 + 6 * Math.sin(i / 9) + i * 0.03, 2);
    const M = macdOf(p);
    const points: Point[] = crossList(M, 50, 170).flatMap(({ i, up: u }) => {
      const tone: ChartTone = u ? 'pos' : 'neg';
      return [
        { i, panel: 0, value: round4(at(p, i)), tone },
        { i, panel: 1, value: round4(at(M.m, i)), tone, shape: 'ring' as const },
      ];
    });
    return panels(50, 170, [linesPanel('Giá', [priceLine(p)], 50, 170), macdPanel(p, 50, 170)], {
      points,
      alt: 'Điểm MACD cắt lên đường tín hiệu là tín hiệu mua, cắt xuống là tín hiệu bán',
    });
  },
  'c4l7-g4': () => {
    const item = (title: string, tone: ChartTone, d: number[]) => ({
      title,
      tone,
      model: {
        kind: 'category' as const,
        mode: 'grouped' as const,
        labels: d.map((_, i) => String(i + 1)),
        unit: '',
        series: [{ name: 'Histogram', values: d, tone: 'pos' as const }],
        value_labels: 'none' as const,
      },
    });
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        item('Động lượng mạnh lên', 'pos', [4, 8, 12, 17, 22, 27, 33, 38]),
        item('Động lượng yếu đi', 'neg', [38, 36, 31, 25, 19, 13, 8, 3]),
      ],
    };
  },
  'c4l7-g5': () => {
    const [a, b] = divergence('MACD');
    return {
      kind: 'compare',
      layout: 'row',
      items: [
        { title: 'Phân kỳ giảm', tone: 'neg', model: a as Leaf<'schematic'> },
        { title: 'Phân kỳ tăng', tone: 'pos', model: b as Leaf<'schematic'> },
      ],
    };
  },
  'c4l7-g6': () => {
    const { p, e, m, sl } = c4l7Worked();
    return panels(
      75,
      150,
      [
        linesPanel(
          'Giá',
          [{ name: 'MA50', role: 'p1', v: sma(p, 50), width: 2 }, priceLine(p)],
          75,
          150,
          stop(e, 149, sl),
        ),
        macdPanel(p, 75, 150),
      ],
      {
        points: [
          { i: e, panel: 0, value: round4(at(p, e)), tone: 'pos', label: 'Mua', pos: 'above' },
          { i: e, panel: 1, value: round4(m), tone: 'pos', shape: 'ring' },
        ],
        alt: 'Ví dụ: histogram MACD chuyển dương sau nhịp điều chỉnh thì mua, cắt lỗ dưới đáy gần nhất',
      },
    );
  },

  'c4l8-g1': () => {
    const p = series(170, 21, (i) => 50 + 6 * Math.sin(i / 14) + i * 0.05, 2.6);
    return bollinger(p, 40, 170, {
      alt: 'Giá cùng dải Bollinger: dải trên, dải giữa MA20 và dải dưới',
    });
  },
  'c4l8-g2': () => {
    const f = (i: number) =>
      i < 112 ? 55 + 3 * Math.sin(i / 8) * (i < 60 ? 1 : 0.2) : 55 + (i - 112) * 0.55;
    const p = genVar(160, 4, f, (i) => (i < 60 ? 3 : i < 112 ? 0.7 : 2.6));
    const b = bands(p, 20, 2);
    let top = -1e9;
    for (let i = 66; i < 108; i++) top = Math.max(top, at(b.up, i));
    return bollinger(p, 30, 160, {
      notes: [
        { i: 87, value: round4(top), text: 'Dải thắt chặt' },
        { i: 140, value: round4(at(b.lo, 140)), text: 'Dải mở rộng' },
      ],
      alt: 'Dải Bollinger thắt chặt khi giá đi ngang, sau đó mở rộng khi giá bứt phá',
    });
  },
  'c4l8-g3': () => ({
    kind: 'compare',
    layout: 'row',
    items: [
      {
        title: 'Thị trường đi ngang',
        model: bollinger(
          series(110, 31, (i) => 50 + 2.8 * Math.sin(i / 5), 1.5),
          25,
          110,
        ),
      },
      {
        title: 'Xu hướng tăng mạnh',
        tone: 'pos',
        model: bollinger(
          series(110, 32, (i) => 40 + i * 0.42 + 1.2 * Math.sin(i / 5), 1.6),
          25,
          110,
        ),
      },
    ],
  }),
  'c4l8-g4': () => {
    const { p, k, e, sl } = c4l8Worked();
    const s = stop(e, 109, sl);
    return bollinger(p, 30, 110, {
      segments: s.segments,
      notes: s.notes,
      points: [
        { i: k, panel: 0, value: round4(at(p, k)), tone: 'warn' },
        { i: e, panel: 0, value: round4(at(p, e)), tone: 'pos', label: 'Mua', pos: 'right' },
      ],
      alt: 'Ví dụ: trong xu hướng tăng, giá về dải giữa rồi bật lên thì mua, cắt lỗ dưới đáy gần nhất',
    });
  },

  'c4l9-g2': () =>
    fibChart(
      path(
        [
          [38, 30],
          [16, -16.6],
          [36, 24],
        ],
        40,
        7,
        0.9,
      ),
      45,
      'up',
      '',
      true,
    ),
  'c4l9-g3': () => ({
    kind: 'compare',
    layout: 'row',
    items: [
      {
        title: 'Xu hướng tăng',
        tone: 'pos',
        model: fibChart(
          path(
            [
              [30, 26],
              [14, -14.5],
              [22, 18],
            ],
            40,
            11,
            0.7,
          ),
          34,
          'up',
          'Kéo từ đáy lên đỉnh',
          false,
        ),
      },
      {
        title: 'Xu hướng giảm',
        tone: 'neg',
        model: fibChart(
          path(
            [
              [30, -26],
              [14, 14.5],
              [22, -18],
            ],
            70,
            12,
            0.7,
          ),
          34,
          'down',
          'Kéo từ đỉnh xuống đáy',
          false,
        ),
      },
    ],
  }),
  'c4l9-g4': () => {
    const { p, a, b, k, e, sl } = c4l9Worked();
    const end = p.length - 1;
    const s = stop(e, end, sl);
    return panels(
      0,
      p.length,
      [
        linesPanel('', [priceLine(p)], 0, p.length, {
          fib: {
            lo: { i: a, v: round4(at(p, a)) },
            hi: { i: b, v: round4(at(p, b)) },
            dir: 'up',
            levels: FIB_LEVELS,
            zone: [0.5, 0.618],
          },
          segments: s.segments,
          notes: [{ i: e, value: round4(sl), text: 'Cắt lỗ', tone: 'neg' }],
        }),
      ],
      {
        points: [
          { i: k, panel: 0, value: round4(at(p, k)), tone: 'warn' },
          { i: e, panel: 0, value: round4(at(p, e)), tone: 'pos', label: 'Mua', pos: 'left' },
        ],
        alt: 'Ví dụ: giá điều chỉnh về vùng 50% đến 61,8% rồi bật lên thì mua, cắt lỗ dưới đáy điều chỉnh',
      },
    );
  },

  'c4l10-g1': () => {
    const H = 314;
    return {
      kind: 'schematic',
      domain: pxDomain(H),
      layers: [
        ...wave(W1, H, LB),
        { t: 'bracket', x: [40, 476], y: H - 276, label: '5 sóng đẩy', tone: 'pos' },
        { t: 'bracket', x: [484, 710], y: H - 276, label: '3 sóng điều chỉnh', tone: 'neg' },
      ],
      alt: 'Chu kỳ sóng Elliott: 5 sóng đẩy 1 đến 5, sau đó 3 sóng điều chỉnh A, B, C',
    };
  },
  'c4l10-g2': () => {
    const H = 300;
    return {
      kind: 'schematic',
      domain: pxDomain(H),
      layers: [
        { t: 'segment', from: [40, H - 280], to: [330, H - 280], tone: 'warn', dash: true },
        {
          t: 'text',
          at: [270, H - 272],
          text: 'Sóng 2 không thủng điểm bắt đầu sóng 1',
          tone: 'warn',
          anchor: 'start',
        },
        { t: 'segment', from: [180, H - 190], to: [700, H - 190], tone: 'p1', dash: true },
        {
          t: 'text',
          at: [700, H - 210],
          text: 'Sóng 4 không đi vào vùng giá sóng 1',
          tone: 'info',
          anchor: 'end',
        },
        ...wave(W2, H, LB.slice(0, 5)),
        {
          t: 'text',
          at: [368, H - 128],
          text: 'Sóng 3 không phải sóng ngắn nhất',
          tone: 'pos',
          anchor: 'end',
        },
      ],
      alt: 'Ba quy tắc của sóng đẩy Elliott',
    };
  },
  'c4l10-g3': () => {
    const H = 300;
    return {
      kind: 'schematic',
      domain: pxDomain(H),
      layers: [
        {
          t: 'zone',
          x: [170, 310],
          y: [H - 246, H - 235],
          tone: 'warn',
          label: '50% đến 61,8% của sóng 1',
        },
        {
          t: 'zone',
          x: [440, 580],
          y: [H - 144, H - 130],
          tone: 'warn',
          label: 'Khoảng 38,2% của sóng 3',
        },
        ...wave(
          W2.map(([x, y], i): Pt => (i === 2 ? [250, 241] : [x, y])),
          H,
          LB.slice(0, 5),
        ),
      ],
      alt: 'Sóng 2 thường điều chỉnh 50% đến 61,8% sóng 1, sóng 4 khoảng 38,2% sóng 3',
    };
  },
  'c4l10-g4': () => {
    const H = 280;
    const P = up(W1, H);
    return {
      kind: 'schematic',
      domain: pxDomain(H),
      layers: [
        ...wave(W1, H, LB),
        { t: 'line', pts: [P[2] as Pt, P[3] as Pt], tone: 'pos', width: 4 },
        { t: 'point', at: P[2] as Pt, tone: 'pos', shape: 'ring', label: 'Vùng mua', pos: 'below' },
        { t: 'point', at: P[4] as Pt, tone: 'pos', shape: 'ring', label: 'Vùng mua', pos: 'below' },
        { t: 'text', at: [250, H - 120], text: 'Nắm giữ', tone: 'pos', anchor: 'end' },
        {
          t: 'point',
          at: P[5] as Pt,
          tone: 'warn',
          shape: 'ring',
          label: 'Thận trọng',
          pos: 'right',
        },
        { t: 'text', at: [720, H - 268], text: 'Hạn chế mua mới', tone: 'neg', anchor: 'end' },
      ],
      alt: 'Ứng dụng sóng Elliott: mua ở cuối sóng 2 và sóng 4, nắm giữ trong sóng 3, thận trọng ở sóng 5',
    };
  },
};

function bollinger(
  p: number[],
  from: number,
  to: number,
  o: { notes?: Panel['notes']; segments?: Panel['segments']; points?: Point[]; alt?: string } = {},
): SeriesPanels {
  const b = bands(p, 20, 2);
  return panels(
    from,
    to,
    [
      linesPanel(
        '',
        [{ name: 'Dải giữa (MA20)', role: 'warn', v: b.mid, width: 2, dash: true }, priceLine(p)],
        from,
        to,
        {
          band: { upper: win(b.up, from, to - 1), lower: win(b.lo, from, to - 1), tone: 'p1' },
          ...(o.segments ? { segments: o.segments } : {}),
          ...(o.notes ? { notes: o.notes } : {}),
        },
      ),
    ],
    { ...(o.points ? { points: o.points } : {}), ...(o.alt ? { alt: o.alt } : {}) },
  );
}
