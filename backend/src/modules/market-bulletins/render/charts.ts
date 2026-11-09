import { AXIS_NEAR_RATIO } from '../bulletin.constants.js';
import { dm, nf } from '../bulletin.format.js';
import type { Levels, MiniChartData, VnIndexModel } from '../bulletin.types.js';
import { COL, type Canvas, type Point } from './canvas.js';
import { measure } from './fonts.js';
import { drawRuns, type Run } from './runs.js';

type Series = (number | null)[];

const scale = (lo: number, hi: number, y0: number, y1: number) => (v: number) =>
  y1 - ((v - lo) / (hi - lo || 1)) * (y1 - y0);

/** Khoảng giá trị của các chuỗi (bỏ null), nới `pad` mỗi phía; không có số thì [0,1]. */
function range(
  arrays: readonly (readonly (number | null | undefined)[])[],
  pad = 0.06,
): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const array of arrays)
    for (const value of array)
      if (value !== null && value !== undefined && Number.isFinite(value)) {
        lo = Math.min(lo, value);
        hi = Math.max(hi, value);
      }
  if (!Number.isFinite(lo)) return [0, 1];
  const margin = (hi - lo) * pad || 1;
  return [lo - margin, hi + margin];
}

function niceTicks(lo: number, hi: number, count = 4): number[] {
  const raw = (hi - lo) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * magnitude).find((k) => k >= raw) ?? magnitude;
  const out: number[] = [];
  for (let value = Math.ceil(lo / step) * step; value <= hi; value += step)
    out.push(Number(value.toFixed(6)));
  return out;
}

type OhlcBar = { o: number; h: number; l: number; c: number };

function drawCandles(
  c: Canvas,
  bars: readonly OhlcBar[],
  xs: (index: number) => number,
  y: (value: number) => number,
  bodyWidth: number,
): void {
  bars.forEach((bar, index) => {
    const x = xs(index);
    const color = bar.c >= bar.o ? COL.upf : COL.dn;
    c.line(x, y(bar.h), x, y(bar.l), color, 1.1);
    const top = y(Math.max(bar.o, bar.c));
    const bottom = y(Math.min(bar.o, bar.c));
    c.rect(x - bodyWidth / 2, top, bodyWidth, Math.max(1, bottom - top), { fill: color });
  });
}

const lineOf = (points: readonly (Point | null)[]): (Point | null)[] => [...points];

function legend(
  c: Canvas,
  items: readonly { text: string; color: string; bold?: boolean }[],
  y: number,
  size = 10.5,
): void {
  let x = 6;
  for (const item of items) {
    const weight = item.bold ? 800 : 600;
    c.text(x, y, item.text, { size, weight, color: item.color });
    x += measure(item.text, size, weight) + 14;
  }
}

export type VnChartOptions = { W: number; H: number; vis: number };

/**
 * Biểu đồ VN-Index (spec §1.2): nến + SMA20/50/200 + hỗ trợ/kháng cự + 2 mũi tên kịch bản, khối lượng + MA20,
 * RSI(14), MACD(12,26,9). Trục giá chỉ co theo nến, SMA20, SMA50 và các mức cách giá ≤ 8%; SMA200 hoặc mức
 * ngoài khung ghi chữ ở mép ô.
 */
export function drawVnIndexChart(
  c: Canvas,
  model: VnIndexModel,
  levels: Levels,
  opt: VnChartOptions,
): void {
  const { W, H } = opt;
  const narrow = W < 500;
  const R = narrow ? 46 : 54;
  const L = 4;
  const bars = model.bars;
  const N = bars.length;
  const visible = Math.min(opt.vis, N);
  const s0 = N - visible;
  const T = N - 1;
  const c0 = bars[T]!.close;
  const hasPositive = levels.pa !== null && levels.pt !== null;
  const hasNegative = levels.na !== null && levels.nt !== null;
  const hasScenario = hasPositive || hasNegative;
  const scenarioSlots = hasScenario ? 7 : 0;
  const slots = visible + scenarioSlots + (hasScenario ? 1 : 0.6);
  const sw = (W - R - L) / slots;
  const xs = (i: number) => L + sw * (i - s0 + 0.5);
  const fy = (v: number) => Math.round((v * H) / 644);
  const P = { t: 22, b: fy(344) };
  const V = { t: fy(372), b: fy(432) };
  const RS = { t: fy(458), b: fy(524) };
  const M = { t: fy(550), b: fy(622) };
  const win = <T2>(values: readonly T2[]): T2[] => values.slice(s0);
  const high = win(bars.map((bar) => bar.high));
  const low = win(bars.map((bar) => bar.low));
  const { series } = model;

  const near = (value: number) => Math.abs(value - c0) / c0 <= AXIS_NEAR_RATIO;
  const levelLines = (
    [
      ['r1', 'Kháng cự', COL.dn],
      ['r2', 'Kháng cự', COL.dn],
      ['s1', 'Hỗ trợ', COL.up],
      ['s2', 'Hỗ trợ', COL.up],
    ] as const
  ).filter(([key]) => levels[key] !== null);
  const [plo, phi] = range(
    [
      high,
      low,
      win(series.sma20),
      win(series.sma50),
      levelLines.map(([key]) => levels[key]!).filter(near),
      [hasPositive ? levels.pt : null, hasNegative ? levels.nt : null].filter(
        (value): value is number => value !== null && near(value),
      ),
    ],
    0.05,
  );
  const inPrice = (value: number | null | undefined): value is number =>
    value !== null && value !== undefined && value >= plo && value <= phi;
  const yP = scale(plo, phi, P.t, P.b);
  const yClose = yP(c0);
  const tipY = (target: number) =>
    inPrice(target) ? yP(target) : target < plo ? P.b - 2 : P.t + 2;
  const tipLabelY = (target: number) => tipY(target) + (target >= c0 ? -7 : 14);

  // Lưới và nhãn trục giá.
  for (const value of niceTicks(plo, phi, narrow ? 4 : 6)) {
    const y = yP(value);
    if (y < P.t + 8) continue;
    c.line(L, y, W - R, y, COL.grid, 1);
    if (Math.abs(y - yClose) >= 13)
      c.text(W - R + 5, y + 3.5, nf(value, 0), { size: 10, weight: 500 });
  }
  // Vùng "Kịch bản tham khảo".
  if (hasScenario) {
    const xa = xs(T) + sw / 2;
    const xb = W - R;
    c.rect(xa, P.t, xb - xa, P.b - P.t, { fill: COL.scenarioBg });
    const size = narrow ? 9 : 10;
    // Tiêu đề vùng tránh nhãn giá đích của hai mũi tên: thử đầu vùng, rồi đáy vùng, rồi giữa vùng.
    const tipLabels = [
      ...(hasPositive ? [tipLabelY(levels.pt!)] : []),
      ...(hasNegative ? [tipLabelY(levels.nt!)] : []),
    ];
    const clear = (top: number) => tipLabels.every((y) => y < top - 12 || y > top + 14);
    const candidates = [P.t + 12, P.b - 28, (P.t + P.b) / 2];
    const top = candidates.find(clear) ?? candidates[0]!;
    c.text((xa + xb) / 2, top, 'Kịch bản', {
      anchor: 'middle',
      weight: 700,
      color: COL.navy,
      size,
    });
    c.text((xa + xb) / 2, top + 12, 'tham khảo', {
      anchor: 'middle',
      weight: 700,
      color: COL.navy,
      size,
    });
  }
  drawCandles(
    c,
    win(bars).map((bar) => ({ o: bar.open, h: bar.high, l: bar.low, c: bar.close })),
    (i) => xs(s0 + i),
    yP,
    Math.max(2, sw * 0.62),
  );
  const priceLine = (values: Series, color: string) =>
    c.polyline(
      lineOf(
        values.map((value, i) =>
          i >= s0 && inPrice(value) ? ([xs(i), yP(value)] as Point) : null,
        ),
      ),
      color,
      1.6,
    );
  priceLine(series.sma200, COL.s200);
  priceLine(series.sma50, COL.s50);
  priceLine(series.sma20, COL.s20);

  // Nhãn ở mép ô cho SMA200 hoặc mức nằm ngoài khung.
  let edgeTop = 0;
  let edgeBottom = 0;
  const edge = (runs: readonly Run[], color: string, below: boolean) => {
    const y = below ? P.b - 6 - 13 * edgeBottom++ : P.t + 30 + 13 * edgeTop++;
    drawRuns(c, L + 4, y, runs, { weight: 700, color, size: narrow ? 9.5 : 10.5 });
  };
  const sma200 = series.sma200[T];
  if (sma200 !== null && sma200 !== undefined && !inPrice(sma200)) {
    const below = sma200 < plo;
    edge(
      [
        `SMA200 ${nf(sma200, 1)} `,
        { icon: below ? 'down' : 'up' },
        below ? ' dưới khung' : ' trên khung',
      ],
      COL.s200,
      below,
    );
  }
  // Đường ngang hỗ trợ, kháng cự; nhãn ở mép phải vùng nến, viền trắng, nhãn sau đẩy lên khi gần nhau.
  const usedLabelY: number[] = [];
  for (const [key, name, color] of levelLines) {
    const value = levels[key]!;
    if (!inPrice(value)) {
      edge([`${name} ${nf(value, 0)} `, { icon: value < plo ? 'down' : 'up' }], color, value < plo);
      continue;
    }
    const y = yP(value);
    c.line(L, y, W - R, y, color, 1.3, '7 4');
    let labelY = y - 4;
    while (usedLabelY.some((used) => Math.abs(used - labelY) < 12)) labelY -= 12;
    usedLabelY.push(labelY);
    const labelX = hasScenario ? xs(T) - sw : W - R - 4;
    c.text(labelX, labelY, `${name} ${nf(value, 0)}`, {
      anchor: 'end',
      weight: 800,
      color,
      size: narrow ? 9.5 : 10.5,
      halo: { color: '#ffffff', width: 3.2 },
    });
  }
  // Hai mũi tên kịch bản từ giá đóng cửa.
  const arrow = (target: number, color: string) => {
    const xa = xs(T) + sw * 0.6;
    const xb = xs(T + scenarioSlots - 1);
    const yt = tipY(target);
    c.line(xa, yClose, xb, yt, color, 2, '5 3');
    const angle = Math.atan2(yt - yClose, xb - xa);
    const h = 7;
    c.polygon(
      [
        [xb, yt],
        [xb - h * Math.cos(angle - 0.45), yt - h * Math.sin(angle - 0.45)],
        [xb - h * Math.cos(angle + 0.45), yt - h * Math.sin(angle + 0.45)],
      ],
      { fill: color },
    );
    c.text(xb, tipLabelY(target), nf(target, 0), {
      anchor: 'middle',
      weight: 800,
      color,
      size: narrow ? 9 : 10,
    });
  };
  if (hasPositive) arrow(levels.pt!, COL.up);
  if (hasNegative) arrow(levels.nt!, COL.dn);
  // Nhãn giá đóng cửa ở trục phải.
  c.rect(W - R + 1, yClose - 8, R - 1, 16, { fill: COL.navy, rx: 3 });
  c.text(W - R + 4, yClose + 3.5, nf(c0, narrow ? 0 : 2), {
    color: '#ffffff',
    weight: 700,
    size: 9.5,
  });

  const at = (values: Series, i = T) => values[i];
  legend(
    c,
    narrow
      ? [
          { text: 'VN-Index', color: COL.navy, bold: true },
          { text: `SMA20 ${nf(at(series.sma20), 1)}`, color: COL.s20 },
          { text: `SMA50 ${nf(at(series.sma50), 1)}`, color: COL.s50 },
        ]
      : [
          { text: 'VN-Index (ngày)', color: COL.navy, bold: true },
          { text: `SMA20 ${nf(at(series.sma20), 1)}`, color: COL.s20 },
          { text: `SMA50 ${nf(at(series.sma50), 1)}`, color: COL.s50 },
          { text: `SMA200 ${nf(at(series.sma200), 1)}`, color: COL.s200 },
        ],
    13,
  );

  // Khối lượng + MA20 khối lượng.
  const volumes = win(bars.map((bar) => bar.volume));
  const vmax = Math.max(...volumes) * 1.08;
  const yV = scale(0, vmax, V.t, V.b);
  c.line(L, V.b, W - R, V.b, COL.line, 1);
  win(bars).forEach((bar, i) => {
    const x = xs(s0 + i);
    const previous = (bars[s0 + i - 1] ?? bar).close;
    c.rect(x - sw * 0.31, yV(bar.volume), sw * 0.62, V.b - yV(bar.volume), {
      fill: bar.close >= previous ? COL.upf : COL.dn,
      op: 0.55,
    });
  });
  c.polyline(
    series.volumeMa20.map((value, i) =>
      i >= s0 && value !== null ? ([xs(i), yV(value)] as Point) : null,
    ),
    COL.navy,
    1.5,
  );
  c.text(W - R + 5, V.t + 8, 'triệu cp', { size: 9.5 });
  legend(
    c,
    [
      { text: `Khối lượng ${nf(model.volume / 1e6, 0)} tr cp`, color: COL.ink, bold: true },
      { text: `MA20 ${nf((model.volumeMa20 ?? Number.NaN) / 1e6, 0)} tr cp`, color: COL.navy },
    ],
    V.t - 6,
  );

  // RSI(14) với các mức 30/50/70.
  const yR = scale(0, 100, RS.t, RS.b);
  for (const level of [30, 50, 70]) {
    c.line(
      L,
      yR(level),
      W - R,
      yR(level),
      level === 50 ? COL.grid : COL.line,
      1,
      level === 50 ? undefined : '3 3',
    );
    c.text(W - R + 5, yR(level) + 3.5, String(level), { size: 10 });
  }
  c.polyline(
    series.rsi.map((value, i) =>
      i >= s0 && value !== null ? ([xs(i), yR(value)] as Point) : null,
    ),
    COL.rsi,
    1.6,
  );
  legend(
    c,
    [
      { text: `RSI(14) ${nf(at(series.rsi), 1)}`, color: COL.rsi, bold: true },
      { text: `phiên trước ${nf(at(series.rsi, T - 1), 1)}`, color: COL.ink2 },
    ],
    RS.t - 6,
  );

  // MACD(12,26,9): đường MACD, Signal, histogram.
  const [mlo, mhi] = range([win(series.macd), win(series.signal), win(series.hist), [0]], 0.08);
  const yM = scale(mlo, mhi, M.t, M.b);
  c.line(L, yM(0), W - R, yM(0), COL.line, 1);
  c.text(W - R + 5, yM(0) + 3.5, '0', { size: 10 });
  series.hist.forEach((value, i) => {
    if (i < s0 || value === null) return;
    const x = xs(i);
    const y0 = yM(0);
    const y1 = yM(value);
    const grow = Math.abs(value) >= Math.abs(series.hist[i - 1] ?? 0);
    const fill = value >= 0 ? (grow ? COL.upf : '#86efac') : grow ? COL.dn : '#fca5a5';
    c.rect(x - sw * 0.3, Math.min(y0, y1), sw * 0.6, Math.max(0.6, Math.abs(y1 - y0)), { fill });
  });
  c.polyline(
    series.macd.map((value, i) =>
      i >= s0 && value !== null ? ([xs(i), yM(value)] as Point) : null,
    ),
    COL.s20,
    1.6,
  );
  c.polyline(
    series.signal.map((value, i) =>
      i >= s0 && value !== null ? ([xs(i), yM(value)] as Point) : null,
    ),
    COL.s50,
    1.6,
  );
  const histogram = at(series.hist);
  legend(
    c,
    [
      {
        text: `${narrow ? 'MACD' : 'MACD(12,26,9)'} ${nf(at(series.macd), 1)}`,
        color: COL.s20,
        bold: true,
      },
      { text: `Signal ${nf(at(series.signal), 1)}`, color: COL.s50 },
      { text: `Histogram ${nf(histogram, 1)}`, color: (histogram ?? 0) >= 0 ? COL.up : COL.dn },
    ],
    M.t - 6,
  );

  // Trục thời gian: ngày dd/mm mỗi 10 phiên (13 ở bản hẹp), tính từ phiên T.
  for (let i = T; i >= s0; i -= narrow ? 13 : 10) {
    const x = xs(i);
    c.line(x, P.t, x, M.b, COL.grid, 0.8);
    c.text(x, M.b + 15, dm(bars[i]!.date), { anchor: 'middle', size: 10 });
  }
  c.line(W - R, P.t, W - R, M.b, COL.line, 1);
}

function sma(values: readonly number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Biểu đồ mini của mã có GTGD lớn nhất trong một bộ lọc (spec §1.3): 60 phiên nến tới phiên T, SMA20, SMA50,
 * khối lượng, vòng tròn vàng ở phiên T; ghi mã và "GTGD lớn nhất · phiên dd/mm".
 */
export function drawMiniChart(
  c: Canvas,
  chart: MiniChartData,
  W: number,
  H: number,
  sessionLabel: string,
): void {
  const count = chart.d.length;
  const T = count - 1;
  const visible = Math.min(60, count);
  const a = T - visible + 1;
  const L = 4;
  const R = 40;
  const P = { t: 18, b: H - 46 };
  const V = { t: H - 38, b: H - 4 };
  const sw = (W - L - R) / visible;
  const xs = (i: number) => L + sw * (i - a + 0.5);
  const s20 = sma(chart.c, 20);
  const s50 = sma(chart.c, 50);
  const slice = <T2>(values: readonly T2[]): T2[] => values.slice(a, T + 1);
  const [lo, hi] = range([slice(chart.h), slice(chart.l), slice(s20), slice(s50)], 0.06);
  const y = scale(lo, hi, P.t, P.b);
  c.rect(0, 0, W, H, { fill: '#ffffff' });
  for (const value of niceTicks(lo, hi, 4)) {
    if (value <= lo || value >= hi) continue;
    c.line(L, y(value), W - R, y(value), COL.grid, 1);
    c.text(W - R + 4, y(value) + 3, nf(value, value < 100 ? 1 : 0), { size: 8.5, color: COL.ink2 });
  }
  drawCandles(
    c,
    slice(chart.c).map((close, i) => ({
      o: slice(chart.o)[i]!,
      h: slice(chart.h)[i]!,
      l: slice(chart.l)[i]!,
      c: close,
    })),
    (i) => xs(a + i),
    y,
    Math.max(2, sw * 0.62),
  );
  const line = (values: Series, color: string) =>
    c.polyline(
      values.map((value, i) => (i >= a && value !== null ? ([xs(i), y(value)] as Point) : null)),
      color,
      1.6,
    );
  line(s20, COL.s20);
  line(s50, COL.s50);
  const volumes = slice(chart.v);
  const vmax = Math.max(...volumes, 1);
  volumes.forEach((volume, i) => {
    const h = (volume / vmax) * (V.b - V.t);
    const index = a + i;
    c.rect(xs(index) - sw * 0.31, V.b - h, Math.max(1.5, sw * 0.62), h, {
      fill: chart.c[index]! >= chart.o[index]! ? COL.upf : COL.dn,
      op: 0.45,
    });
  });
  c.line(L, V.t - 3, W - R, V.t - 3, COL.grid, 1);
  c.text(L + 2, V.t + 7, 'Khối lượng', { size: 8.5, weight: 600, color: COL.ink2 });
  c.circle(xs(T), y(chart.c[T]!), 7, { stroke: COL.amber, sw: 2.2 });
  let x = L + 2;
  for (const [text, color, weight] of [
    [chart.symbol, COL.navy, 800],
    ['SMA20', COL.s20, 700],
    ['SMA50', COL.s50, 700],
  ] as const) {
    c.text(x, 11, text, { size: 9.5, weight, color });
    x += measure(text, 9.5, weight) + 8;
  }
  c.text(W - R, 11, `GTGD lớn nhất · phiên ${sessionLabel}`, {
    anchor: 'end',
    size: 8.8,
    weight: 700,
    color: COL.ink2,
  });
}
