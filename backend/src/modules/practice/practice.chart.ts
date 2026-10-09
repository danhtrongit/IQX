import type { Bar, SeriesMap, Side } from '../quant/v2/index.js';
import type { PracticeCalendar } from './practice.data.js';
import { sessionOf } from './practice.data.js';

/**
 * Chart description of one side (SPEC §9.2). `threshold_levels` are the levels the engine really
 * executes on (taken from the side's params); `reference_levels` are fixed guides that are NOT
 * thresholds (e.g. the Stochastic 20/80 marks or the RSI midline) and must be labelled as such.
 */
export type PlotSpec = {
  /** Drawn on top of the candles (price scale) instead of an indicator pane. */
  overlay: boolean;
  lines: Array<{ key: string; label: string }>;
  histogram_key: string | null;
  volume_key: string | null;
  zero_line: boolean;
  nonnegative: boolean;
  bounds: [number, number] | null;
  threshold_levels: number[];
  reference_levels: number[];
};

const num = (value: number | undefined): string =>
  value === undefined ? '?' : String(Math.round(value * 100) / 100);

export function plotSpec(indicatorId: string, params: Record<string, number>): PlotSpec {
  const base: PlotSpec = {
    overlay: false,
    lines: [],
    histogram_key: null,
    volume_key: null,
    zero_line: false,
    nonnegative: false,
    bounds: null,
    threshold_levels: [],
    reference_levels: [],
  };
  const level = params.level !== undefined ? [params.level] : [];
  switch (indicatorId) {
    case 'ma':
      return {
        ...base,
        overlay: true,
        lines: [{ key: 'value', label: `SMA ${num(params.period)}` }],
      };
    case 'ema':
      return {
        ...base,
        overlay: true,
        lines: [{ key: 'value', label: `EMA ${num(params.period)}` }],
      };
    case 'ma_cross':
      return {
        ...base,
        overlay: true,
        lines: [
          { key: 'fast', label: `SMA ${num(params.fast)}` },
          { key: 'slow', label: `SMA ${num(params.slow)}` },
        ],
      };
    case 'bollinger':
      return {
        ...base,
        overlay: true,
        lines: [
          { key: 'upper', label: 'Dải trên' },
          { key: 'middle', label: `SMA ${num(params.period)}` },
          { key: 'lower', label: 'Dải dưới' },
        ],
      };
    case 'donchian':
      return {
        ...base,
        overlay: true,
        lines: [
          { key: 'upper', label: 'Dải trên' },
          { key: 'lower', label: 'Dải dưới' },
        ],
      };
    case 'macd':
      return {
        ...base,
        lines: [
          { key: 'value', label: 'MACD' },
          { key: 'signal', label: 'Đường tín hiệu' },
        ],
        histogram_key: 'histogram',
        zero_line: true,
      };
    case 'volume':
      return {
        ...base,
        lines: [{ key: 'threshold', label: `${num(params.mult)} × TB ${num(params.lookback)}` }],
        volume_key: 'volume',
        nonnegative: true,
      };
    case 'dmi':
      return {
        ...base,
        lines: [
          { key: 'plus', label: '+DI' },
          { key: 'minus', label: '−DI' },
        ],
        nonnegative: true,
      };
    case 'stochastic':
      return {
        ...base,
        lines: [
          { key: 'value', label: '%K' },
          { key: 'signal', label: '%D' },
        ],
        bounds: [0, 100],
        threshold_levels: level,
        reference_levels: [20, 80],
      };
    case 'obv':
      return {
        ...base,
        lines: [
          { key: 'value', label: 'OBV' },
          { key: 'baseline', label: `SMA ${num(params.baseline)}` },
        ],
      };
    case 'rsi':
      return {
        ...base,
        lines: [{ key: 'value', label: `RSI ${num(params.period)}` }],
        bounds: [0, 100],
        threshold_levels: level,
        reference_levels: [50],
      };
    case 'mfi':
      return {
        ...base,
        lines: [{ key: 'value', label: `MFI ${num(params.period)}` }],
        bounds: [0, 100],
        threshold_levels: level,
        reference_levels: [50],
      };
    case 'williams_r':
      return {
        ...base,
        lines: [{ key: 'value', label: 'Williams %R' }],
        bounds: [-100, 0],
        threshold_levels: level,
      };
    case 'cmf':
      return {
        ...base,
        lines: [{ key: 'value', label: 'CMF' }],
        zero_line: true,
        threshold_levels: level,
      };
    case 'cci':
      return {
        ...base,
        lines: [{ key: 'value', label: 'CCI' }],
        zero_line: true,
        threshold_levels: level,
      };
    case 'roc':
      return {
        ...base,
        lines: [{ key: 'value', label: 'ROC (%)' }],
        zero_line: true,
        threshold_levels: level,
      };
    default:
      return { ...base, lines: [{ key: 'value', label: indicatorId }] };
  }
}

const seriesKeys = (spec: PlotSpec): string[] => [
  ...spec.lines.map((line) => line.key),
  ...(spec.histogram_key ? [spec.histogram_key] : []),
  ...(spec.volume_key ? [spec.volume_key] : []),
];

const round6 = (value: number | null | undefined): number | null =>
  value === null || value === undefined || !Number.isFinite(value)
    ? null
    : Math.round(value * 1e6) / 1e6;

export type ChartPayload = {
  /** Session label of the first element of every array (Phiên 1 = first test session). */
  first_session: number;
  /** Last session label included (0 = last observation session before the run is locked). */
  last_session: number;
  /** Index of the last observation session (always 0). */
  last_observed_session: 0;
  bars: {
    open: number[];
    high: number[];
    low: number[];
    close: number[];
    volume: number[];
  };
  series: Record<Side, Record<string, Array<number | null>>>;
  plot: Record<Side, PlotSpec>;
};

/**
 * Candles and per-side indicator series for global indices `[from, to]` only. Everything is
 * addressed by session label; no date or symbol is part of the payload.
 */
export function buildChart(input: {
  indicatorId: string;
  calendar: PracticeCalendar;
  from: number;
  to: number;
  series: Record<Side, SeriesMap>;
  params: Record<Side, Record<string, number>>;
}): ChartPayload {
  const { calendar, from, to } = input;
  const slice: Bar[] = calendar.bars.slice(from, to + 1);
  const plot = {
    buy: plotSpec(input.indicatorId, input.params.buy),
    sell: plotSpec(input.indicatorId, input.params.sell),
  };
  const pick = (side: Side): Record<string, Array<number | null>> => {
    const out: Record<string, Array<number | null>> = {};
    for (const key of seriesKeys(plot[side])) {
      const values = input.series[side][key] ?? [];
      out[key] = slice.map((_, offset) => round6(values[from + offset]));
    }
    return out;
  };
  return {
    first_session: sessionOf(calendar, from),
    last_session: sessionOf(calendar, to),
    last_observed_session: 0,
    bars: {
      open: slice.map((bar) => bar.open),
      high: slice.map((bar) => bar.high),
      low: slice.map((bar) => bar.low),
      close: slice.map((bar) => bar.close),
      volume: slice.map((bar) => bar.volume),
    },
    series: { buy: pick('buy'), sell: pick('sell') },
    plot,
  };
}
