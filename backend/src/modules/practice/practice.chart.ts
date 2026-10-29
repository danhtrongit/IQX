import type {
  Bar,
  ConditionRow,
  ParamsSideConfig,
  SeriesCache,
  Side,
  SideConfig,
} from '../quant/v2/index.js';
import { isParamsSide } from '../quant/v2/index.js';
import type { PracticeCalendar } from './practice.data.js';
import { sessionOf } from './practice.data.js';

/**
 * Chart description of one side (SPEC §9.2). `threshold_levels` are the levels the engine really
 * executes on (taken from the enabled rows of the side); `reference_levels` are fixed guides that
 * are NOT thresholds (e.g. the Stochastic 20/80 marks or the RSI midline) and must be labelled
 * as such.
 *
 * Every condition row of a row-based indicator has its own periods, so a side can draw several
 * lines of the same indicator (RSI 14 for one row, RSI 9 for another). Each line is keyed by the
 * row that introduced it, `<row id>.<line>` (e.g. `rsi.level.value`, `ma.ma_cross.fast`); a line
 * that two rows would draw identically is drawn once.
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

/** Where the values of one plotted key come from: `cache.series(calc, params)[series]`. */
type PlotColumn = { key: string; calc: string; params: Record<string, number>; series: string };

export type SidePlot = { plot: PlotSpec; columns: PlotColumn[] };

type RowLine = {
  /** Identity of the plotted data; two rows with the same id draw one line. */
  id: string;
  /** Name of the line inside its row (`value`, `fast`, `upper`…). */
  name: string;
  label: string;
  calc: string;
  params: Record<string, number>;
  series: string;
};

type RowPlot = { lines: RowLine[]; histogram?: RowLine; thresholds?: number[] };

const fmt = (value: number | undefined): string =>
  value === undefined || !Number.isFinite(value) ? '?' : String(Math.round(value * 100) / 100);

const line = (
  id: string,
  name: string,
  label: string,
  calc: string,
  params: Record<string, number>,
  series: string,
): RowLine => ({ id, name, label, calc, params, series });

/** MACD row 2 has no Signal input; the MACD line does not depend on it (same placeholder as the evaluator). */
const MACD_ZERO_SIGNAL = 9;
/** Stochastic row 1 has no %D input; %K does not depend on it (same placeholder as the evaluator). */
const STOCHASTIC_LEVEL_D = 3;

/** Lines (and level) a condition row needs on the chart, from the row's own values. */
function rowPlot(row: ConditionRow): RowPlot {
  const n = (key: string): number => {
    const value = row[key];
    return typeof value === 'number' ? value : Number.NaN;
  };
  const period = n('period');
  const level = [n('threshold')];
  switch (row.id) {
    case 'ma.price_cross':
    case 'ma.trend':
      return {
        lines: [line(`ma.${period}`, 'value', `SMA ${fmt(period)}`, 'ma', { period }, 'value')],
      };
    case 'ma.ma_cross':
      return {
        lines: [
          line(
            `ma.${n('fast')}`,
            'fast',
            `SMA ${fmt(n('fast'))}`,
            'ma',
            { period: n('fast') },
            'value',
          ),
          line(
            `ma.${n('slow')}`,
            'slow',
            `SMA ${fmt(n('slow'))}`,
            'ma',
            { period: n('slow') },
            'value',
          ),
        ],
      };
    case 'ema.price_cross':
    case 'ema.trend':
      return {
        lines: [line(`ema.${period}`, 'value', `EMA ${fmt(period)}`, 'ema', { period }, 'value')],
      };
    case 'ema.ma_cross':
      return {
        lines: [
          line(
            `ema.${n('fast')}`,
            'fast',
            `EMA ${fmt(n('fast'))}`,
            'ema',
            { period: n('fast') },
            'value',
          ),
          line(
            `ema.${n('slow')}`,
            'slow',
            `EMA ${fmt(n('slow'))}`,
            'ema',
            { period: n('slow') },
            'value',
          ),
        ],
      };
    case 'ma_cross.cross': {
      const params = { fast: n('fast'), slow: n('slow') };
      return {
        lines: [
          line(`ma.${n('fast')}`, 'fast', `SMA ${fmt(n('fast'))}`, 'ma_cross', params, 'fast'),
          line(`ma.${n('slow')}`, 'slow', `SMA ${fmt(n('slow'))}`, 'ma_cross', params, 'slow'),
        ],
      };
    }
    case 'rsi.level':
      return {
        lines: [line(`rsi.${period}`, 'value', `RSI ${fmt(period)}`, 'rsi', { period }, 'value')],
        thresholds: level,
      };
    case 'rsi.trend':
      return {
        lines: [line(`rsi.${period}`, 'value', `RSI ${fmt(period)}`, 'rsi', { period }, 'value')],
      };
    case 'macd.signal': {
      const params = { fast: n('fast'), slow: n('slow'), signal: n('signal') };
      return {
        lines: [
          line(
            `macd.${params.fast}.${params.slow}`,
            'value',
            `MACD ${fmt(params.fast)}/${fmt(params.slow)}`,
            'macd',
            params,
            'value',
          ),
          line(
            `macd.signal.${params.fast}.${params.slow}.${params.signal}`,
            'signal',
            `Signal ${fmt(params.signal)}`,
            'macd',
            params,
            'signal',
          ),
        ],
      };
    }
    case 'macd.zero': {
      const params = { fast: n('fast'), slow: n('slow'), signal: MACD_ZERO_SIGNAL };
      return {
        lines: [
          line(
            `macd.${params.fast}.${params.slow}`,
            'value',
            `MACD ${fmt(params.fast)}/${fmt(params.slow)}`,
            'macd',
            params,
            'value',
          ),
        ],
      };
    }
    case 'macd.hist': {
      const params = { fast: n('fast'), slow: n('slow'), signal: n('signal') };
      return {
        lines: [],
        histogram: line(
          `macd.hist.${params.fast}.${params.slow}.${params.signal}`,
          'histogram',
          `Histogram ${fmt(params.fast)}/${fmt(params.slow)}/${fmt(params.signal)}`,
          'macd',
          params,
          'histogram',
        ),
      };
    }
    case 'stochastic.level': {
      const params = { k: n('k'), smooth: n('smooth'), d: STOCHASTIC_LEVEL_D };
      return {
        lines: [
          line(
            `stochastic.k.${params.k}.${params.smooth}`,
            'value',
            `%K ${fmt(params.k)}/${fmt(params.smooth)}`,
            'stochastic',
            params,
            'value',
          ),
        ],
        thresholds: level,
      };
    }
    case 'stochastic.kd_cross': {
      const params = { k: n('k'), smooth: n('smooth'), d: n('d') };
      return {
        lines: [
          line(
            `stochastic.k.${params.k}.${params.smooth}`,
            'value',
            `%K ${fmt(params.k)}/${fmt(params.smooth)}`,
            'stochastic',
            params,
            'value',
          ),
          line(
            `stochastic.d.${params.k}.${params.smooth}.${params.d}`,
            'signal',
            `%D ${fmt(params.d)}`,
            'stochastic',
            params,
            'signal',
          ),
        ],
      };
    }
    case 'cci.cross':
      return {
        lines: [line(`cci.${period}`, 'value', `CCI ${fmt(period)}`, 'cci', { period }, 'value')],
        thresholds: level,
      };
    case 'mfi.cross':
      return {
        lines: [line(`mfi.${period}`, 'value', `MFI ${fmt(period)}`, 'mfi', { period }, 'value')],
        thresholds: level,
      };
    case 'roc.cross':
      return {
        lines: [
          line(`roc.${period}`, 'value', `ROC ${fmt(period)} (%)`, 'roc', { period }, 'value'),
        ],
        thresholds: level,
      };
    case 'williams_r.cross':
      return {
        lines: [
          line(
            `williams_r.${period}`,
            'value',
            `Williams %R ${fmt(period)}`,
            'williams_r',
            { period },
            'value',
          ),
        ],
        thresholds: level,
      };
    case 'cmf.cross':
      return {
        lines: [line(`cmf.${period}`, 'value', `CMF ${fmt(period)}`, 'cmf', { period }, 'value')],
        thresholds: level,
      };
    case 'bollinger.price_action': {
      const params = { period, k: n('mult') };
      const id = `bollinger.${period}.${params.k}`;
      return {
        lines: [
          line(`${id}.upper`, 'upper', 'Dải trên', 'bollinger', params, 'upper'),
          line(`${id}.middle`, 'middle', `SMA ${fmt(period)}`, 'bollinger', params, 'middle'),
          line(`${id}.lower`, 'lower', 'Dải dưới', 'bollinger', params, 'lower'),
        ],
      };
    }
    case 'donchian.break': {
      const band = row.band === 'lower' ? 'lower' : 'upper';
      return {
        lines: [
          line(
            `donchian.${band}.${period}`,
            band,
            `${band === 'lower' ? 'Dải dưới' : 'Dải trên'} ${fmt(period)}`,
            'donchian',
            { period },
            band,
          ),
        ],
      };
    }
    case 'dmi.di':
      return {
        lines: [
          line(`dmi.plus.${period}`, 'plus', `+DI ${fmt(period)}`, 'dmi', { period }, 'plus'),
          line(`dmi.minus.${period}`, 'minus', `−DI ${fmt(period)}`, 'dmi', { period }, 'minus'),
        ],
      };
    case 'dmi.adx':
      return {
        lines: [line(`dmi.adx.${period}`, 'adx', `ADX ${fmt(period)}`, 'dmi', { period }, 'adx')],
        thresholds: level,
      };
    case 'obv.sma':
      return {
        lines: [
          line('obv.value', 'value', 'OBV', 'obv', { baseline: period }, 'value'),
          line(
            `obv.sma.${period}`,
            'baseline',
            `SMA ${fmt(period)} của OBV`,
            'obv',
            { baseline: period },
            'baseline',
          ),
        ],
      };
    case 'obv.breakout': {
      const low = row.action === 'break_low';
      return {
        lines: [
          line('obv.value', 'value', 'OBV', 'obv', { baseline: period }, 'value'),
          line(
            `obv.${low ? 'lower' : 'upper'}.${period}`,
            low ? 'lower' : 'upper',
            `${low ? 'Đáy' : 'Đỉnh'} ${fmt(period)} phiên`,
            'obv',
            { baseline: period, breakout_period: period },
            low ? 'lower' : 'upper',
          ),
        ],
      };
    }
    // bollinger.price_dir (price only) and bollinger.width (a % ratio, not a price) have no line.
    default:
      return { lines: [] };
  }
}

/** Static look of the pane per indicator (not a threshold, not part of the user's rows). */
const INDICATOR_LOOK: Record<
  string,
  Partial<Pick<PlotSpec, 'overlay' | 'zero_line' | 'nonnegative' | 'bounds' | 'reference_levels'>>
> = {
  ma: { overlay: true },
  ema: { overlay: true },
  ma_cross: { overlay: true },
  bollinger: { overlay: true },
  donchian: { overlay: true },
  macd: { zero_line: true },
  dmi: { nonnegative: true },
  stochastic: { bounds: [0, 100], reference_levels: [20, 80] },
  rsi: { bounds: [0, 100], reference_levels: [50] },
  mfi: { bounds: [0, 100], reference_levels: [50] },
  williams_r: { bounds: [-100, 0] },
  cmf: { zero_line: true },
  cci: { zero_line: true },
  roc: { zero_line: true },
  volume: { nonnegative: true },
};

const emptyPlot = (indicatorId: string): PlotSpec => ({
  overlay: false,
  lines: [],
  histogram_key: null,
  volume_key: null,
  zero_line: false,
  nonnegative: false,
  bounds: null,
  threshold_levels: [],
  reference_levels: [],
  ...INDICATOR_LOOK[indicatorId],
});

/** Volume (params-based): the threshold line and the volume histogram, keyed as before SPEC V3. */
function paramsSidePlot(indicatorId: string, side: ParamsSideConfig): SidePlot {
  const plot = emptyPlot(indicatorId);
  const columns: PlotColumn[] = [];
  if (indicatorId === 'volume') {
    plot.lines = [
      {
        key: 'threshold',
        label: `${fmt(side.params.mult)} × TB ${fmt(side.params.lookback)}`,
      },
    ];
    plot.volume_key = 'volume';
    columns.push(
      { key: 'threshold', calc: indicatorId, params: side.params, series: 'threshold' },
      { key: 'volume', calc: indicatorId, params: side.params, series: 'volume' },
    );
  } else {
    plot.lines = [{ key: 'value', label: indicatorId }];
    columns.push({ key: 'value', calc: indicatorId, params: side.params, series: 'value' });
  }
  return { plot, columns };
}

/**
 * Lines and levels of one side: those of its ENABLED rows (the rows the engine evaluates),
 * whatever the tab switch says, so the pane shows what the form would execute.
 */
export function sidePlot(indicatorId: string, side: SideConfig): SidePlot {
  if (isParamsSide(side)) return paramsSidePlot(indicatorId, side);
  const plot = emptyPlot(indicatorId);
  const columns: PlotColumn[] = [];
  const drawn = new Set<string>();
  const thresholds: number[] = [];
  const add = (row: ConditionRow, item: RowLine): string | null => {
    const key = `${row.id}.${item.name}`;
    if (drawn.has(item.id)) return null;
    drawn.add(item.id);
    columns.push({ key, calc: item.calc, params: item.params, series: item.series });
    return key;
  };
  for (const row of side.rules) {
    if (row.enabled === false) continue;
    const drawing = rowPlot(row);
    // A row whose values cannot be computed (validation refuses it before Start) draws nothing.
    const needed = drawing.histogram ? [...drawing.lines, drawing.histogram] : drawing.lines;
    if (!needed.every((item) => Object.values(item.params).every((v) => Number.isFinite(v)))) {
      continue;
    }
    for (const item of drawing.lines) {
      const key = add(row, item);
      if (key !== null) plot.lines.push({ key, label: item.label });
    }
    if (drawing.histogram && plot.histogram_key === null) {
      plot.histogram_key = add(row, drawing.histogram);
    }
    for (const value of drawing.thresholds ?? []) {
      if (Number.isFinite(value) && !thresholds.includes(value)) thresholds.push(value);
    }
  }
  plot.threshold_levels = thresholds;
  return { plot, columns };
}

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
 * addressed by session label; no date or symbol is part of the payload. `cache` must be built on
 * bars that start at global index 0; the preview passes one over the observation bars only, so
 * no future bar can seed a plotted value.
 */
export function buildChart(input: {
  indicatorId: string;
  calendar: PracticeCalendar;
  from: number;
  to: number;
  cache: SeriesCache;
  sides: Record<Side, SideConfig>;
}): ChartPayload {
  const { calendar, from, to, cache } = input;
  const slice: Bar[] = calendar.bars.slice(from, to + 1);
  const plots = {
    buy: sidePlot(input.indicatorId, input.sides.buy),
    sell: sidePlot(input.indicatorId, input.sides.sell),
  };
  const pick = (side: Side): Record<string, Array<number | null>> => {
    const out: Record<string, Array<number | null>> = {};
    for (const column of plots[side].columns) {
      const values = cache.series(column.calc, column.params)[column.series] ?? [];
      out[column.key] = slice.map((_, offset) => round6(values[from + offset]));
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
    plot: { buy: plots.buy.plot, sell: plots.sell.plot },
  };
}
