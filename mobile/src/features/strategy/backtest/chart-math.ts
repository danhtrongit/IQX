import type { BacktestResult, CurvePoint } from './types';

export const MAX_CHART_POINTS = 600;

/** Web thinPoints: keep every `step`-th point and always the last one. */
export function thinPoints<T>(points: T[], max = MAX_CHART_POINTS): T[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % step === 0);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** `[initial, ...curve]` — the points the chart draws. */
export function chartPoints(result: Pick<BacktestResult, 'initial' | 'curve'>): CurvePoint[] {
  return [result.initial, ...(result.curve ?? [])].filter(Boolean);
}

export type SeriesKey = 'return_pct' | 'buy_hold_pct' | 'market_pct';

export type ChartModel = {
  points: CurvePoint[];
  min: number;
  max: number;
  hasMarket: boolean;
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function buildChartModel(result: BacktestResult): ChartModel {
  const points = thinPoints(chartPoints(result));
  const marketMeta = result.chart?.series?.find((s) => s.id === 'market');
  const marketOk = marketMeta ? marketMeta.available : true;
  const hasMarket = marketOk && points.some((p) => num(p.market_pct) !== null);
  let min = 0;
  let max = 0;
  for (const p of points) {
    const vals = [num(p.return_pct), num(p.buy_hold_pct), hasMarket ? num(p.market_pct) : null];
    for (const v of vals) {
      if (v === null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (max === min) { max += 1; min -= 1; }
  const pad = (max - min) * 0.08;
  return { points, min: min - pad, max: max + pad, hasMarket };
}

export type Scale = { x: (i: number) => number; y: (v: number) => number };

export function makeScale(model: Pick<ChartModel, 'points' | 'min' | 'max'>, width: number, height: number, padding = { l: 44, r: 8, t: 8, b: 20 }): Scale {
  const n = Math.max(model.points.length - 1, 1);
  const w = Math.max(width - padding.l - padding.r, 1);
  const h = Math.max(height - padding.t - padding.b, 1);
  const span = model.max - model.min || 1;
  return {
    x: (i) => padding.l + (i / n) * w,
    y: (v) => padding.t + (1 - (v - model.min) / span) * h,
  };
}

/** SVG path for a series; gaps (null values) start a new subpath. */
export function linePath(points: CurvePoint[], key: SeriesKey, scale: Scale): string {
  let d = '';
  let pen = false;
  points.forEach((p, i) => {
    const v = num(p[key]);
    if (v === null) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${scale.x(i).toFixed(1)} ${scale.y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

/** Nearest point index for a touch x. */
export function indexAtX(x: number, count: number, width: number, padL = 44, padR = 8): number {
  if (count <= 1) return 0;
  const w = Math.max(width - padL - padR, 1);
  const i = Math.round(((x - padL) / w) * (count - 1));
  return Math.min(count - 1, Math.max(0, i));
}
