/**
 * Chapter 1 maths and chart-model builders, ported from the approved handoff module
 * (`CH1.math`, `makeChart`, `drawLessonCharts`, `drawQuestion`).
 *
 * Nothing here runs in the browser: the importer evaluates every chart once and commits the
 * resulting windowed models, so the learner client needs no indicator engine. The formulas are
 * the variants documented in the chapter 1 spec section 6 (Wilder RSI, SMA-seeded EMA, MACD with
 * seeded signal, population-sigma Bollinger, volume average that excludes the current session).
 */

export type Num = number | null;

export const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);

/** SMA over a sliding window that includes the current value; null until a full finite window. */
export function sma(a: Num[], n: number): Num[] {
  return a.map((_, i) => {
    if (i < n - 1) return null;
    const w = a.slice(i - n + 1, i + 1);
    return w.every(finite) ? sum(w as number[]) / n : null;
  });
}

/** EMA seeded with the mean of the first n finite inputs; restarts after a non-finite input. */
export function ema(a: Num[], n: number): Num[] {
  let prev: number | null = null;
  let seed: number[] = [];
  return a.map((v) => {
    if (!finite(v)) {
      prev = null;
      seed = [];
      return null;
    }
    if (prev === null) {
      seed.push(v);
      if (seed.length < n) return null;
      prev = sum(seed) / n;
    } else {
      prev = (2 / (n + 1)) * v + (1 - 2 / (n + 1)) * prev;
    }
    return prev;
  });
}

export interface RsiResult {
  value: Num[];
  g: Num[];
  loss: Num[];
}

/** Wilder RSI. Needs n + 1 prices; both averages zero gives null (never an invented 50). */
export function rsi(a: number[], n: number): RsiResult {
  const out: Num[] = Array<Num>(a.length).fill(null);
  const g: Num[] = Array<Num>(a.length).fill(null);
  const loss: Num[] = Array<Num>(a.length).fill(null);
  if (a.length <= n) return { value: out, g, loss };
  let u = 0;
  let d = 0;
  for (let i = 1; i <= n; i++) {
    const z = (a[i] as number) - (a[i - 1] as number);
    u += Math.max(z, 0);
    d += Math.max(-z, 0);
  }
  u /= n;
  d /= n;
  for (let i = n; i < a.length; i++) {
    if (i > n) {
      const z = (a[i] as number) - (a[i - 1] as number);
      u = ((n - 1) * u + Math.max(z, 0)) / n;
      d = ((n - 1) * d + Math.max(-z, 0)) / n;
    }
    g[i] = u;
    loss[i] = d;
    out[i] = u + d === 0 ? null : (100 * u) / (u + d);
  }
  return { value: out, g, loss };
}

export interface MacdResult {
  fast: Num[];
  slow: Num[];
  value: Num[];
  signal: Num[];
  hist: Num[];
}

export function macd(a: Num[], fast = 12, slow = 26, signal = 9): MacdResult {
  const efast = ema(a, fast);
  const eslow = ema(a, slow);
  const m: Num[] = a.map((_, i) => {
    const f = efast[i];
    const s = eslow[i];
    return finite(f) && finite(s) ? f - s : null;
  });
  const sig = ema(m, signal);
  const hist: Num[] = m.map((x, i) => {
    const s = sig[i];
    return finite(x) && finite(s) ? x - s : null;
  });
  return { fast: efast, slow: eslow, value: m, signal: sig, hist };
}

export interface BollingerResult {
  mid: Num[];
  sd: Num[];
  upper: Num[];
  lower: Num[];
}

/** Bollinger bands with the population standard deviation (divide by N, not N - 1). */
export function bb(a: number[], n = 20, k = 2): BollingerResult {
  const mid = sma(a, n);
  const sd: Num[] = mid.map((m, i) =>
    m === null ? null : Math.sqrt(sum(a.slice(i - n + 1, i + 1).map((p) => (p - m) ** 2)) / n),
  );
  const upper = mid.map((m, i) => (m === null ? null : m + k * (sd[i] as number)));
  const lower = mid.map((m, i) => (m === null ? null : m - k * (sd[i] as number)));
  return { mid, sd, upper, lower };
}

/** Mean of the n sessions before T (T excluded). */
export function avgPrevious(a: number[], n: number): Num[] {
  return a.map((_, i) => (i < n ? null : sum(a.slice(i - n, i)) / n));
}

/* ---------------------------------------------------------------- number formatting */

/**
 * vi-VN number text with exactly `digits` fraction digits, rounded half away from zero on the
 * shortest decimal representation of the double (what `Intl.NumberFormat` does), so the output
 * does not depend on the ICU build of the machine that runs the importer.
 */
export function formatVi(x: number, digits: number): string {
  const neg = x < 0 || Object.is(x, -0);
  const [mant = '0', expo = '0'] = Math.abs(x).toExponential().split('e');
  let ds = mant.replace('.', '');
  let pointPos = Number(expo) + 1; // number of integer digits (may be <= 0)
  if (ds === '0') pointPos = 1;
  if (pointPos <= 0) {
    ds = '0'.repeat(1 - pointPos) + ds;
    pointPos = 1;
  }
  if (ds.length < pointPos) ds = ds.padEnd(pointPos, '0');
  let intPart = ds.slice(0, pointPos);
  let frac = ds.slice(pointPos);
  if (frac.length > digits) {
    const roundUp = frac.charCodeAt(digits) >= 53;
    frac = frac.slice(0, digits);
    if (roundUp) {
      const all = (intPart + frac).split('');
      let idx = all.length - 1;
      while (idx >= 0) {
        if (all[idx] === '9') {
          all[idx] = '0';
          idx -= 1;
        } else {
          all[idx] = String(Number(all[idx]) + 1);
          break;
        }
      }
      let joined = all.join('');
      if (idx < 0) joined = `1${joined}`;
      intPart = joined.slice(0, joined.length - digits);
      frac = joined.slice(joined.length - digits);
    }
  } else {
    frac = frac.padEnd(digits, '0');
  }
  intPart = intPart.replace(/^0+(?=\d)/, '');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${grouped}${digits > 0 ? `,${frac}` : ''}`;
}

/** `f()` of the handoff module: vi-VN fixed digits, em dash for missing values. */
export function fmt(x: unknown, digits = 2): string {
  return finite(x) ? formatVi(x, digits) : '—';
}

/* ------------------------------------------------------------------ chart models */

export type SeriesRole = 'price' | 'p1' | 'p2' | 'p3' | 'pos' | 'neg';
export type BarTone = 'pos' | 'neg' | 'neutral';

export interface ModelSeries {
  name: string;
  role: SeriesRole;
  dash?: true;
  values: Num[];
}

export interface ModelPanel {
  title: string;
  bounds?: [number, number];
  ticks?: number[];
  digits?: number;
  zero?: true;
  nonnegative?: true;
  levels?: { value: number; role: 'buy' | 'sell' }[];
  band?: { upper: Num[]; lower: Num[] };
  series: ModelSeries[];
  bars?: { name: string; values: Num[]; colors: BarTone[] };
}

export interface SeriesPanelsModel {
  kind: 'series_panels';
  x: { start: number; end: number; ticks?: string[] };
  marks: { i: number; label: string }[];
  panels: ModelPanel[];
}

type ColorKey = 'price' | 'cyan' | 'purple' | 'green' | 'red';

interface RawSeries {
  name: string;
  values: Num[];
  color: ColorKey;
  dash: boolean;
}

interface RawPanel {
  title: string;
  bounds?: [number, number];
  ticks?: number[];
  digits?: number;
  levels?: { value: number; color: ColorKey }[];
  zero?: boolean;
  nonnegative?: boolean;
  fillBand?: BollingerResult;
  series: RawSeries[];
  bars?: { name: string; values: Num[]; colors?: ColorKey[] };
}

interface RawChart {
  panels: RawPanel[];
  start: number;
  end: number;
  marks: { i: number; label: string }[];
  tickLabels?: string[];
}

const S = (name: string, values: Num[], color: ColorKey = 'cyan', dash = false): RawSeries => ({
  name,
  values,
  color,
  dash,
});

export interface Ch1Data {
  prices: number[];
  volumes: number[];
  examPrices: number[];
  examVolumes: number[];
  datasets: Record<string, number[]>;
}

export interface ChartOptions {
  prices?: number[];
  dataset?: string;
  exam?: boolean;
  start?: number;
  end?: number;
  marks?: { i: number; label: string }[];
  mult?: number;
}

/** `makeChart(kind, c)` of the handoff module, returning the full-length model. */
function makeChart(d: Ch1Data, kind: string, c: ChartOptions = {}): RawChart {
  const prices =
    c.prices ??
    (c.dataset !== undefined
      ? (d.datasets[c.dataset] as number[])
      : c.exam
        ? d.examPrices
        : d.prices);
  if (!prices) throw new Error(`chart ${kind}: missing price series`);
  const vols = c.exam ? d.examVolumes : d.volumes;
  const end = c.end ?? prices.length - 1;
  const start = c.start ?? Math.max(50, end - 59);
  const marks = c.marks ?? [];
  const price: RawPanel = {
    title: 'Giá đóng cửa · đơn vị giả định',
    series: [S('Giá đóng cửa', prices, 'price')],
  };
  let panels: RawPanel[] = [];
  const rp = (period: number, compare: number | null): RawPanel => ({
    title: compare ? `RSI ${period} và RSI ${compare}` : `RSI ${period} · điểm`,
    bounds: [0, 100],
    ticks: [0, 30, 50, 70, 100],
    digits: 0,
    levels: [
      { value: 30, color: 'green' },
      { value: 70, color: 'red' },
    ],
    series: [
      S('RSI ' + period, rsi(prices, period).value),
      ...(compare ? [S('RSI ' + compare, rsi(prices, compare).value, 'purple', true)] : []),
    ],
  });
  if (kind === 'rsi' || kind === 'rsi-compare')
    panels = kind === 'rsi' ? [price, rp(14, null)] : [rp(14, 7)];
  if (kind === 'ma' || kind === 'ma-compare')
    panels = [
      {
        ...price,
        title: 'Giá và đường trung bình · cùng đơn vị',
        series: [
          S('Giá đóng cửa', prices, 'price'),
          S('SMA 20', sma(prices, 20)),
          ...(kind === 'ma-compare' ? [S('SMA 50', sma(prices, 50), 'purple', true)] : []),
        ],
      },
    ];
  if (kind === 'macd' || kind === 'macd-compare') {
    const m = macd(prices);
    panels =
      kind === 'macd'
        ? [
            price,
            {
              title: 'MACD 12 / 26 / 9 · cùng đơn vị với giá',
              zero: true,
              digits: 2,
              series: [S('MACD', m.value), S('Tín hiệu 9', m.signal, 'purple')],
              bars: { name: 'Cột chênh lệch', values: m.hist },
            },
          ]
        : [
            {
              title: 'MACD giữ nguyên; chỉ đổi chu kỳ tín hiệu',
              zero: true,
              digits: 2,
              series: [
                S('MACD', m.value),
                S('Tín hiệu 9', m.signal, 'purple'),
                S('Tín hiệu 5', ema(m.value, 5), 'green', true),
              ],
            },
          ];
  }
  if (kind === 'bollinger' || kind === 'bollinger-compare') {
    const b = bb(prices);
    const b3 = bb(prices, 20, 3);
    panels = [
      {
        title: 'Giá và dải Bollinger · cùng đơn vị',
        fillBand: b,
        series: [
          S('Giá đóng cửa', prices, 'price'),
          S('Đường giữa', b.mid, 'purple', true),
          S('Dải trên 2σ', b.upper),
          S('Dải dưới 2σ', b.lower),
          ...(kind === 'bollinger-compare'
            ? [S('Dải trên 3σ', b3.upper, 'green', true), S('Dải dưới 3σ', b3.lower, 'green', true)]
            : []),
        ],
      },
    ];
  }
  if (kind === 'volume' || kind === 'volume-compare') {
    const avg = avgPrevious(vols, 20);
    const k = c.mult ?? 1;
    panels = [
      price,
      {
        title: 'Khối lượng · triệu cổ phiếu',
        nonnegative: true,
        series: [
          S(
            k === 1 ? 'TB 20 phiên trước' : fmt(k, 1) + ' × TB 20 phiên trước',
            avg.map((x) => (x === null ? null : k * x)),
          ),
          ...(kind === 'volume-compare'
            ? [S('TB 10 phiên trước', avgPrevious(vols, 10), 'purple', true)]
            : []),
        ],
        bars: {
          name: 'Khối lượng',
          values: vols,
          colors: prices.map((v, i) => (i && v < (prices[i - 1] as number) ? 'red' : 'green')),
        },
      },
    ];
  }
  if (panels.length === 0) throw new Error(`unknown chart kind ${kind}`);
  return { panels, start, end, marks };
}

const ROLE: Record<ColorKey, SeriesRole> = {
  price: 'price',
  cyan: 'p1',
  purple: 'p2',
  green: 'p3',
  red: 'neg',
};
const TONE: Record<ColorKey, BarTone> = {
  price: 'neutral',
  cyan: 'neutral',
  purple: 'neutral',
  green: 'pos',
  red: 'neg',
};

/** Slice a full-length model to its visible window and map hex colours to theme roles. */
function windowed(chart: RawChart): SeriesPanelsModel {
  const { start, end } = chart;
  const cut = (v: Num[]): Num[] => {
    if (end >= v.length)
      throw new Error(`window ${start}..${end} exceeds series length ${v.length}`);
    return v.slice(start, end + 1);
  };
  const panels = chart.panels.map((p): ModelPanel => {
    const series: ModelSeries[] = p.series.map((s) =>
      s.dash
        ? { name: s.name, role: ROLE[s.color], dash: true, values: cut(s.values) }
        : { name: s.name, role: ROLE[s.color], values: cut(s.values) },
    );
    const out: ModelPanel = { title: p.title, series };
    if (p.bounds) out.bounds = p.bounds;
    if (p.ticks) out.ticks = p.ticks;
    if (p.digits !== undefined) out.digits = p.digits;
    if (p.zero) out.zero = true;
    if (p.nonnegative) out.nonnegative = true;
    if (p.levels)
      out.levels = p.levels.map((z) => ({
        value: z.value,
        role: z.color === 'green' ? ('buy' as const) : ('sell' as const),
      }));
    if (p.fillBand) out.band = { upper: cut(p.fillBand.upper), lower: cut(p.fillBand.lower) };
    if (p.bars) {
      const values = cut(p.bars.values);
      const fullColors = p.bars.colors;
      const colors: BarTone[] = values.map((v, k) => {
        if (!finite(v)) return 'neutral';
        const c = fullColors?.[start + k];
        return c ? TONE[c] : v >= 0 ? 'pos' : 'neg';
      });
      out.bars = { name: p.bars.name, values, colors };
    }
    // Stable key order for the committed JSON.
    return {
      title: out.title,
      ...(out.bounds ? { bounds: out.bounds } : {}),
      ...(out.ticks ? { ticks: out.ticks } : {}),
      ...(out.digits !== undefined ? { digits: out.digits } : {}),
      ...(out.zero ? { zero: out.zero } : {}),
      ...(out.nonnegative ? { nonnegative: out.nonnegative } : {}),
      ...(out.levels ? { levels: out.levels } : {}),
      ...(out.band ? { band: out.band } : {}),
      series: out.series,
      ...(out.bars ? { bars: out.bars } : {}),
    };
  });
  const x: SeriesPanelsModel['x'] = { start, end };
  if (chart.tickLabels) x.ticks = chart.tickLabels;
  return { kind: 'series_panels', x, marks: chart.marks, panels };
}

export function chartModel(d: Ch1Data, kind: string, c: ChartOptions = {}): SeriesPanelsModel {
  return windowed(makeChart(d, kind, c));
}

/** First index > 80 where RSI was < 30, rises and stays < 30; falls back like the handoff. */
export function rsiApplyIndex(d: Ch1Data): number {
  const v = rsi(d.examPrices, 14).value;
  const hit = v.findIndex((x, i) => {
    const p = v[i - 1];
    return i > 80 && finite(x) && finite(p) && p < 30 && x > p && x < 30;
  });
  if (hit > 0) return hit;
  return v.findIndex((x, i) => {
    const p = v[i - 1];
    return i > 30 && (p as number) < 30 && (x as number) > (p as number);
  });
}

/* ------------------------------------------------------------ lesson charts + hooks */

export type LessonSourceId = 'rsi' | 'macd' | 'ma' | 'bollinger' | 'volume' | 'hopluu';

export interface LessonChartEntry {
  lesson: LessonSourceId;
  id: string;
  model: SeriesPanelsModel;
}

/** The 16 lesson figures, in lesson order, with their windows and A/B marks. */
export function buildLessonCharts(d: Ch1Data): LessonChartEntry[] {
  const i = rsiApplyIndex(d);
  const boll = [...Array<number>(19).fill(50), 45, 48];
  const volWindow: SeriesPanelsModel = windowed({
    start: 0,
    end: 5,
    marks: [],
    tickLabels: [0, 1, 2, 3, 4, 5].map((k) => (k === 5 ? 'Hiện tại' : `Trước ${5 - k}`)),
    panels: [
      {
        title: 'Đơn vị: triệu cổ phiếu',
        nonnegative: true,
        series: [
          S('Trung bình 5 phiên trước', [4, 4, 4, 4, 4, 4]),
          S('Ngưỡng 1,5 × trung bình', [6, 6, 6, 6, 6, 6], 'purple', true),
        ],
        bars: {
          name: 'Khối lượng',
          values: [2, 3, 4, 5, 6, 7],
          colors: ['price', 'price', 'price', 'price', 'price', 'green'],
        },
      },
    ],
  });
  const out: LessonChartEntry[] = [
    { lesson: 'rsi', id: 'concept-chart', model: chartModel(d, 'rsi') },
    { lesson: 'rsi', id: 'period-chart', model: chartModel(d, 'rsi-compare') },
    {
      lesson: 'rsi',
      id: 'rsi-application',
      model: chartModel(d, 'rsi', {
        exam: true,
        start: Math.max(15, i - 10),
        end: Math.min(d.examPrices.length - 1, i + 6),
        marks: [
          { i: i - 1, label: 'A' },
          { i, label: 'B' },
        ],
      }),
    },
    { lesson: 'macd', id: 'macd-concept', model: chartModel(d, 'macd') },
    { lesson: 'macd', id: 'macd-compare', model: chartModel(d, 'macd-compare') },
    {
      lesson: 'macd',
      id: 'macd-application',
      model: chartModel(d, 'macd', {
        exam: true,
        start: 103,
        end: 118,
        marks: [{ i: 114, label: 'A' }],
      }),
    },
    { lesson: 'ma', id: 'ma-concept', model: chartModel(d, 'ma') },
    { lesson: 'ma', id: 'ma-compare', model: chartModel(d, 'ma-compare') },
    {
      lesson: 'ma',
      id: 'ma-application',
      model: chartModel(d, 'ma-compare', {
        exam: true,
        start: 101,
        end: 114,
        marks: [{ i: 110, label: 'A' }],
      }),
    },
    { lesson: 'bollinger', id: 'boll-concept', model: chartModel(d, 'bollinger') },
    { lesson: 'bollinger', id: 'boll-compare', model: chartModel(d, 'bollinger-compare') },
    {
      lesson: 'bollinger',
      id: 'boll-application',
      model: chartModel(d, 'bollinger', {
        prices: boll,
        start: 15,
        end: 20,
        marks: [
          { i: 19, label: 'A' },
          { i: 20, label: 'B' },
        ],
      }),
    },
    { lesson: 'volume', id: 'volume-concept', model: chartModel(d, 'volume') },
    { lesson: 'volume', id: 'volume-window', model: volWindow },
    { lesson: 'volume', id: 'volume-compare', model: chartModel(d, 'volume-compare') },
    {
      lesson: 'volume',
      id: 'volume-application',
      model: chartModel(d, 'volume', {
        exam: true,
        start: 97,
        end: 108,
        mult: 1.5,
        marks: [{ i: 103, label: 'A' }],
      }),
    },
  ];
  return out;
}

export interface ComputedTable {
  head: string[];
  rows: string[][];
}

const booleanCell = (x: boolean | null): string =>
  x === null ? 'Chưa đủ dữ liệu' : x ? '<b class="good">Đạt</b>' : 'Không đạt';

export type ApplicationHook = 'rsi' | 'macd' | 'ma' | 'bollinger' | 'volume';

export interface Ch1Hooks {
  /** MACD seed table (sessions 26-34) and the "Phiên 34" paragraph. */
  macdSeed: { table: ComputedTable; summaryHtml: string };
  /** Five "Vận dụng" comparison tables, keyed by the data-application value. */
  application: Record<ApplicationHook, { chartId: string; table: ComputedTable }>;
}

export function buildHooks(d: Ch1Data): Ch1Hooks {
  const rsiValues = rsi(d.examPrices, 14).value;
  const ri = rsiApplyIndex(d);
  const prev = rsiValues[ri - 1] as number;
  const cur = rsiValues[ri] as number;

  const m = macd(d.examPrices);
  const mi = 114;
  const mv = m.value[mi] as number;
  const ms = m.signal[mi] as number;

  const mi2 = 110;
  const maPrice = d.examPrices[mi2] as number;
  const s20 = sma(d.examPrices, 20)[mi2] as number;
  const s50 = sma(d.examPrices, 50)[mi2] as number;

  const bollPrices = [...Array<number>(19).fill(50), 45, 48];
  const b = bb(bollPrices);
  const lower19 = b.lower[19] as number;
  const lower20 = b.lower[20] as number;
  const upper20 = b.upper[20] as number;

  const vi = 103;
  const avg = avgPrevious(d.examVolumes, 20)[vi] as number;
  const v = d.examVolumes[vi] as number;
  const vprev = d.examPrices[vi - 1] as number;
  const vcur = d.examPrices[vi] as number;

  const seedPrices = [...Array<number>(26).fill(100), ...Array<number>(8).fill(110)];
  const calc = macd(seedPrices);
  const seedRows: string[][] = [];
  for (let j = 25; j < 34; j++)
    seedRows.push([
      String(j + 1),
      fmt(seedPrices[j], 0),
      fmt(calc.fast[j], 4),
      fmt(calc.slow[j], 4),
      fmt(calc.value[j], 4),
      fmt(calc.signal[j], 4),
      fmt(calc.hist[j], 4),
    ]);

  return {
    macdSeed: {
      table: {
        head: ['Phiên', 'Giá', 'EMA 12', 'EMA 26', 'MACD', 'Tín hiệu 9', 'Cột'],
        rows: seedRows,
      },
      summaryHtml: `<p>Phiên 34: MACD ≈ <strong>${fmt(calc.value[33], 4)}</strong>; tín hiệu đầu tiên ≈ <strong>${fmt(calc.signal[33], 4)}</strong>; cột ≈ <strong>${fmt(calc.hist[33], 4)}</strong>. Dấu — ở các phiên trước là chưa đủ dữ liệu, không phải số 0.</p>`,
    },
    application: {
      rsi: {
        chartId: 'rsi-application',
        table: {
          head: ['Yêu cầu Mua mẫu tại B', 'Đối chiếu số liệu', 'Kết quả'],
          rows: [
            ['RSI phiên trước &lt; 30', `${fmt(prev)} &lt; 30`, booleanCell(prev < 30)],
            [
              'RSI hiện tại &gt; RSI phiên trước',
              `${fmt(cur)} &gt; ${fmt(prev)}`,
              booleanCell(cur > prev),
            ],
          ],
        },
      },
      macd: {
        chartId: 'macd-application',
        table: {
          head: ['Đối chiếu tại A', 'Kết quả'],
          rows: [
            ['MACD so với 0', `${fmt(mv)} ${mv > 0 ? '&gt;' : '&lt;'} 0`],
            ['MACD &gt; tín hiệu — Mua mẫu', booleanCell(mv > ms)],
            ['MACD &lt; tín hiệu — Bán mẫu', booleanCell(mv < ms)],
          ],
        },
      },
      ma: {
        chartId: 'ma-application',
        table: {
          head: ['Cấu hình Mua tại A', 'Đối chiếu', 'Kết quả'],
          rows: [
            ['Giá &gt; SMA 20', `${fmt(maPrice)} &gt; ${fmt(s20)}`, booleanCell(maPrice > s20)],
            ['Giá &gt; SMA 50', `${fmt(maPrice)} &gt; ${fmt(s50)}`, booleanCell(maPrice > s50)],
          ],
        },
      },
      bollinger: {
        chartId: 'boll-application',
        table: {
          head: ['Yêu cầu Mua tại B', 'Giá trị', 'Kết quả'],
          rows: [
            ['Giá trước &lt; dải dưới trước', `45 &lt; ${fmt(lower19)}`, booleanCell(45 < lower19)],
            [
              'Giá hiện tại ∈ dải hiện tại',
              `${fmt(lower20)} &lt; 48 &lt; ${fmt(upper20)}`,
              booleanCell(lower20 < 48 && 48 < upper20),
            ],
            ['Giá hiện tại &gt; giá trước', '48 &gt; 45', booleanCell(true)],
          ],
        },
      },
      volume: {
        chartId: 'volume-application',
        table: {
          head: ['Yêu cầu Mua mẫu', 'Đối chiếu', 'Kết quả'],
          rows: [
            ['Giá đóng cửa tăng', `${fmt(vcur)} &gt; ${fmt(vprev)}`, booleanCell(vcur > vprev)],
            [
              'Khối lượng vượt ngưỡng',
              `${fmt(v)} &gt; 1,5 × ${fmt(avg)} = ${fmt(1.5 * avg)}`,
              booleanCell(v > 1.5 * avg),
            ],
          ],
        },
      },
    },
  };
}

/* --------------------------------------------------------------- question figures */

export interface QuestionChartSource {
  kind: string;
  start: number;
  end: number;
  marks?: (number | { i: number; label: string })[];
  dataset?: string;
  mult?: number;
}

/** `drawQuestion` for a non-matrix figure of the question bank (no data-table toggle). */
export function questionChartModel(
  d: Ch1Data,
  lesson: string,
  c: QuestionChartSource,
): SeriesPanelsModel {
  const marks = (c.marks ?? []).map((mark, idx) =>
    typeof mark === 'number'
      ? { i: mark, label: c.kind === 'compare' ? 'B' : String.fromCharCode(65 + idx) }
      : mark,
  );
  const kind = lesson === 'rsi' ? (c.kind === 'compare' ? 'rsi-compare' : 'rsi') : c.kind;
  const options: ChartOptions = { exam: true, start: c.start, end: c.end, marks };
  if (c.dataset !== undefined) options.dataset = c.dataset;
  if (c.mult !== undefined) options.mult = c.mult;
  return chartModel(d, kind, options);
}
