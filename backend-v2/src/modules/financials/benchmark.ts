import type { Numeric } from './financials.types.js';

type Direction = 'up' | 'down';
type Threshold = [number, number, Direction];
const METRIC: Record<string, Threshold> = {
  revenue_growth: [0.15, 0.05, 'up'],
  gross_margin: [0.25, 0.15, 'up'],
  roe: [0.18, 0.12, 'up'],
  cfo_ni: [1, 0.5, 'up'],
  fcf_margin: [0.08, 0, 'up'],
  accrual: [0.05, 0.15, 'down'],
  pe: [12, 22, 'down'],
  pb: [1.5, 3, 'down'],
  nim: [0.035, 0.025, 'up'],
  roa: [0.015, 0.008, 'up'],
  cir: [0.35, 0.45, 'down'],
  cost_of_risk: [0.01, 0.02, 'down'],
  provision_ppop: [0.25, 0.45, 'down'],
};
const DIM: Record<string, Threshold> = {
  business: [0.15, 0.05, 'up'],
  profitability: [0.18, 0.12, 'up'],
  cashflow: [1, 0.5, 'up'],
  safety: [1.5, 3, 'down'],
  valuation: [0.15, -0.1, 'up'],
  growth: [0.15, 0, 'up'],
  asset_quality: [0.012, 0.03, 'down'],
  capital: [0.1, 0.06, 'up'],
};
const fallback: Record<string, string> = {
  business: 'revenue_growth',
  profitability: 'roe',
  cashflow: 'cfo_ni',
};
function overrides(sub: unknown): {
  metric: Record<string, Threshold>;
  dim: Record<string, Threshold>;
} {
  const s = String(sub ?? '').toLocaleLowerCase('vi');
  if (s.includes('bất động') || s.includes('bat_dong_san'))
    return {
      metric: {
        cfo_ni: [0.3, -1, 'up'] as Threshold,
        fcf_margin: [-0.05, -0.3, 'up'] as Threshold,
      },
      dim: { cashflow: [0.3, -1, 'up'] as Threshold },
    };
  if (s.includes('bán lẻ') || s.includes('ban_le'))
    return { metric: { gross_margin: [0.12, 0.05, 'up'] as Threshold }, dim: {} };
  return { metric: {}, dim: {} };
}
function color(v: Numeric, p: Numeric, [green, red, d]: Threshold) {
  if (v === null) return null;
  if (d === 'up') {
    if (v <= red) return 'red';
    if (v >= green && (p === null || v >= p)) return 'green';
    return 'amber';
  }
  if (v >= red) return 'red';
  if (v <= green && (p === null || v <= p)) return 'green';
  return 'amber';
}
function score(v: number, [g, r, d]: Threshold) {
  const span = d === 'up' ? g - r : r - g,
    progress = d === 'up' ? v - r : r - v;
  return Math.round(Math.max(0, Math.min(100, span === 0 ? 30 : 30 + (progress / span) * 45)));
}
export function applyBenchmark(data: Record<string, unknown>, medians: Record<string, Numeric>) {
  const ov = overrides(data.sub_sector),
    mt = { ...METRIC, ...ov.metric },
    dt = { ...DIM, ...ov.dim },
    values: Record<string, Numeric> = {};
  const blocks =
    data.blocks && typeof data.blocks === 'object' ? (data.blocks as Record<string, unknown>) : {};
  for (const block of Object.values(blocks)) {
    const metrics =
      block && typeof block === 'object' && Array.isArray((block as { metrics?: unknown }).metrics)
        ? (block as { metrics: Array<Record<string, unknown>> }).metrics
        : [];
    for (const m of metrics) {
      if (!m || typeof m !== 'object') continue;
      const key = typeof m.key === 'string' ? m.key : '';
      values[key] ??= typeof m.value === 'number' ? m.value : null;
      const peer = medians[key] ?? null;
      if (peer !== null) m.peer_median = peer;
      const th = mt[key];
      if (th)
        m.color = color(
          typeof m.value === 'number' ? m.value : null,
          typeof m.peer_median === 'number' ? m.peer_median : null,
          th,
        );
    }
  }
  const radar =
    data.radar && typeof data.radar === 'object' ? (data.radar as { dims?: unknown }) : {};
  const dims = Array.isArray(radar.dims) ? (radar.dims as Array<Record<string, unknown>>) : [];
  for (const dim of dims) {
    const key = typeof dim.key === 'string' ? dim.key : '';
    const v = typeof dim.value === 'number' ? dim.value : (values[fallback[key] ?? ''] ?? null),
      th = dt[key];
    if (v === null || !th) continue;
    dim.score = score(v, th);
    const [g, r, d] = th;
    dim.band =
      d === 'up'
        ? v >= g
          ? 'good'
          : v <= r
            ? 'warn'
            : 'ok'
        : v <= g
          ? 'good'
          : v >= r
            ? 'warn'
            : 'ok';
  }
  return data;
}

export const PEER_METRIC_FIELDS: Readonly<Record<string, readonly string[]>> = {
  pe: ['pe'],
  pb: ['pb'],
  roe: ['roe'],
  gross_margin: ['gross_margin', 'gross_profit_margin'],
  revenue_growth: ['revenue_growth', 'revenue_yoy'],
  dividend_yield: ['dividend_yield'],
  net_debt_ebitda: ['net_debt_ebitda', 'net_debt_to_ebitda'],
  dso: ['dso', 'days_sales_outstanding'],
};
export function emptyMedians(): Record<string, Numeric> {
  return Object.fromEntries(Object.keys(PEER_METRIC_FIELDS).map((k) => [k, null]));
}
