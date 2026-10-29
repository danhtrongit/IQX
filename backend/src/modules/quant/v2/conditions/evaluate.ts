import { isFiniteNumber } from '../indicators.js';
import { and3, evaluateRuleWithEvidence } from '../rules.js';
import type {
  CompareOp,
  ConditionRow,
  IndicatorSideStatus,
  NoSignalReason,
  ParamsSideConfig,
  ResolvedValue,
  RowValues,
  RuleEvaluationEvidence,
  SideConfig,
  Tri,
} from '../types.js';
import { createSeriesCache, type SeriesCache } from './series-cache.js';
import type { Bar } from '../types.js';

/**
 * The single evaluator of the indicator conditions (SPEC V3 §1.3, §2, §3). Bot, Backtest,
 * Strategy alerts and Luyện tập all call `evaluateIndicatorSide`; no product has its own branch.
 *
 * Operators (§2), on closed bars only, `t` = the evaluated bar:
 * - cross up:   `X[t-1] <= Y[t-1]` and `X[t] > Y[t]`; cross down mirrors it. A dynamic line is read
 *   at each bar, a threshold is the same on both bars; equality at `t` is not a cross.
 * - `>` / `<`:  `X[t]` vs `Y[t]`.
 * - trend N:    `X[t]` vs `X[t-N]`, N = the row's own period.
 * - vs previous bar: `X[t]` vs `X[t-1]`.
 * Any value the row needs that is missing (warm-up, gaps, zero divisors) makes the row `null`
 * (NO_SIGNAL), never false or 0.
 */

type Series = ReadonlyArray<number | null | undefined>;

export type RowEvaluation = RuleEvaluationEvidence & {
  /** Row id (`rsi.level`…) or, for Volume, the registry rule id (`r1`, `r2`). */
  id: string;
  /** Comparison applied: the row `op`, its `action`, or `>`/`<` for a direction. */
  op: CompareOp;
  /** The row's own stored values (Volume: the side params). */
  values: RowValues;
};

export type IndicatorSideEvaluation = {
  indicator: string;
  /** `no_signal` when the indicator or the side is off, or no row is enabled. */
  status: IndicatorSideStatus;
  reason: NoSignalReason | null;
  /** Kleene AND of the enabled rows; always `null` when `status` is `no_signal`. */
  result: Tri;
  /** Enabled rows only, in registry order. */
  rows: RowEvaluation[];
};

/** MACD row 2 has no Signal input; the MACD line does not depend on it. */
const MACD_ZERO_SIGNAL = 9;
/** Stochastic row 1 has no %D input; %K does not depend on it. */
const STOCHASTIC_LEVEL_D = 3;

const at = (series: Series | undefined, j: number): ResolvedValue => {
  if (series === undefined || j < 0 || j >= series.length) return null;
  const value = series[j];
  return isFiniteNumber(value) ? value : null;
};

const num = (row: ConditionRow, key: string): number => {
  const value = row[key];
  return typeof value === 'number' ? value : Number.NaN;
};

const str = (row: ConditionRow, key: string): string => {
  const value = row[key];
  return typeof value === 'string' ? value : '';
};

function rowValues(row: ConditionRow): RowValues {
  const values: RowValues = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id' || key === 'enabled') continue;
    if (typeof value === 'number' || typeof value === 'string') values[key] = value;
  }
  return values;
}

type Evidence = RuleEvaluationEvidence & { op: CompareOp };

const missingEvidence = (op: CompareOp): Evidence => ({
  lhs: null,
  rhs: null,
  result: null,
  missing: true,
  op,
});

/** `X op Y` where op is `>`, `<`, `cross_up` or `cross_down`; Y is a line or a fixed threshold. */
function relation(op: string, x: Series | undefined, y: Series | number | undefined, i: number): Evidence {
  const yAt = (j: number): ResolvedValue =>
    typeof y === 'number' ? (isFiniteNumber(y) ? y : null) : at(y, j);
  if (op === '>' || op === '<') {
    const lhs = at(x, i);
    const rhs = yAt(i);
    const missing = lhs === null || rhs === null;
    const result = missing ? null : op === '>' ? lhs > rhs : lhs < rhs;
    return { lhs, rhs, result, missing, op };
  }
  if (op === 'cross_up' || op === 'cross_down') {
    const lhs = at(x, i);
    const rhs = yAt(i);
    const previousLhs = at(x, i - 1);
    const previousRhs = yAt(i - 1);
    const missing = lhs === null || rhs === null || previousLhs === null || previousRhs === null;
    const result = missing
      ? null
      : op === 'cross_up'
        ? previousLhs <= previousRhs && lhs > rhs
        : previousLhs >= previousRhs && lhs < rhs;
    return { lhs, rhs, result, missing, op, previous_lhs: previousLhs, previous_rhs: previousRhs };
  }
  return missingEvidence('>');
}

/** `X[t]` vs `X[t-lag]`: rising (`>`) or falling (`<`). Trend rows pass lag = N, others 1. */
function versusLag(rising: boolean | null, x: Series | undefined, lag: number, i: number): Evidence {
  const op: CompareOp = rising === false ? '<' : '>';
  if (rising === null || !Number.isInteger(lag) || lag < 1) return missingEvidence(op);
  const lhs = at(x, i);
  const rhs = at(x, i - lag);
  const missing = lhs === null || rhs === null;
  const result = missing ? null : rising ? lhs > rhs : lhs < rhs;
  return { lhs, rhs, result, missing, op };
}

const DIRECTION: Record<string, boolean> = { up: true, down: false, widen: true, narrow: false };
const rising = (row: ConditionRow): boolean | null => DIRECTION[str(row, 'dir')] ?? null;

type Bands = { lower?: Series; middle?: Series; upper?: Series };

/** The six Bollinger price actions of SPEC V3 §3.11 (bands of bar t and t-1, Close incl. T). */
function bollingerAction(action: string, close: Series, bands: Bands, i: number): Evidence {
  if (action === 'cross_up_middle' || action === 'cross_down_middle') {
    const evidence = relation(
      action === 'cross_up_middle' ? 'cross_up' : 'cross_down',
      close,
      bands.middle,
      i,
    );
    return { ...evidence, op: action };
  }
  if (action === 'reenter_lower' || action === 'reenter_upper') {
    const lhs = at(close, i);
    const lower = at(bands.lower, i);
    const upper = at(bands.upper, i);
    const previousLhs = at(close, i - 1);
    const previousRhs = at(action === 'reenter_lower' ? bands.lower : bands.upper, i - 1);
    const missing =
      lhs === null ||
      lower === null ||
      upper === null ||
      previousLhs === null ||
      previousRhs === null ||
      lower > upper;
    const result = missing
      ? null
      : (action === 'reenter_lower' ? previousLhs < previousRhs : previousLhs > previousRhs) &&
        lhs >= lower &&
        lhs <= upper;
    return {
      lhs,
      rhs: action === 'reenter_lower' ? lower : upper,
      rhs_lower: lower,
      rhs_upper: upper,
      result,
      missing,
      op: action,
      previous_lhs: previousLhs,
      previous_rhs: previousRhs,
    };
  }
  if (action === 'break_upper' || action === 'break_lower') {
    const evidence = relation(
      action === 'break_upper' ? 'cross_up' : 'cross_down',
      close,
      action === 'break_upper' ? bands.upper : bands.lower,
      i,
    );
    return { ...evidence, op: action };
  }
  return missingEvidence('reenter_lower');
}

/** Bollinger width `BW = (Upper − Lower) / Middle`; Middle = 0 (or missing) → missing. */
function bandWidth(bands: Bands, j: number): ResolvedValue {
  const upper = at(bands.upper, j);
  const lower = at(bands.lower, j);
  const middle = at(bands.middle, j);
  if (upper === null || lower === null || middle === null || middle === 0) return null;
  return (upper - lower) / middle;
}

/** OBV breakout: `OBV[t]` vs the MAX/MIN of `OBV[t-N] … OBV[t-1]` (bar t excluded). */
function breakout(action: string, value: Series | undefined, extremes: Bands, i: number): Evidence {
  if (action !== 'break_high' && action !== 'break_low') return missingEvidence('break_high');
  const lhs = at(value, i);
  const rhs = at(action === 'break_high' ? extremes.upper : extremes.lower, i);
  const missing = lhs === null || rhs === null;
  const result = missing ? null : action === 'break_high' ? lhs > rhs : lhs < rhs;
  return { lhs, rhs, result, missing, op: action };
}

function evaluateRowEvidence(row: ConditionRow, cache: SeriesCache, i: number): Evidence {
  const op = str(row, 'op');
  const period = num(row, 'period');
  const threshold = num(row, 'threshold');
  const close = cache.close();
  switch (row.id) {
    case 'ma.price_cross':
      return relation(op, close, cache.series('ma', { period }).value, i);
    case 'ma.ma_cross':
      return relation(
        op,
        cache.series('ma', { period: num(row, 'fast') }).value,
        cache.series('ma', { period: num(row, 'slow') }).value,
        i,
      );
    case 'ma.trend':
      return versusLag(rising(row), cache.series('ma', { period }).value, period, i);
    case 'ema.price_cross':
      return relation(op, close, cache.series('ema', { period }).value, i);
    case 'ema.ma_cross':
      return relation(
        op,
        cache.series('ema', { period: num(row, 'fast') }).value,
        cache.series('ema', { period: num(row, 'slow') }).value,
        i,
      );
    case 'ema.trend':
      return versusLag(rising(row), cache.series('ema', { period }).value, period, i);
    case 'ma_cross.cross': {
      const s = cache.series('ma_cross', { fast: num(row, 'fast'), slow: num(row, 'slow') });
      return relation(op, s.fast, s.slow, i);
    }
    case 'rsi.level':
      return relation(op, cache.series('rsi', { period }).value, threshold, i);
    case 'rsi.trend':
      return versusLag(rising(row), cache.series('rsi', { period }).value, period, i);
    case 'macd.signal': {
      const s = cache.series('macd', {
        fast: num(row, 'fast'),
        slow: num(row, 'slow'),
        signal: num(row, 'signal'),
      });
      return relation(op, s.value, s.signal, i);
    }
    case 'macd.zero': {
      const s = cache.series('macd', {
        fast: num(row, 'fast'),
        slow: num(row, 'slow'),
        signal: MACD_ZERO_SIGNAL,
      });
      return relation(op, s.value, 0, i);
    }
    case 'macd.hist': {
      const s = cache.series('macd', {
        fast: num(row, 'fast'),
        slow: num(row, 'slow'),
        signal: num(row, 'signal'),
      });
      return versusLag(rising(row), s.histogram, 1, i);
    }
    case 'stochastic.level': {
      const s = cache.series('stochastic', {
        k: num(row, 'k'),
        smooth: num(row, 'smooth'),
        d: STOCHASTIC_LEVEL_D,
      });
      return relation(op, s.value, threshold, i);
    }
    case 'stochastic.kd_cross': {
      const s = cache.series('stochastic', {
        k: num(row, 'k'),
        smooth: num(row, 'smooth'),
        d: num(row, 'd'),
      });
      return relation(op, s.value, s.signal, i);
    }
    case 'cci.cross':
      return relation(op, cache.series('cci', { period }).value, threshold, i);
    case 'mfi.cross':
      return relation(op, cache.series('mfi', { period }).value, threshold, i);
    case 'roc.cross':
      return relation(op, cache.series('roc', { period }).value, threshold, i);
    case 'williams_r.cross':
      return relation(op, cache.series('williams_r', { period }).value, threshold, i);
    case 'cmf.cross':
      return relation(op, cache.series('cmf', { period }).value, threshold, i);
    case 'bollinger.price_action':
      return bollingerAction(
        str(row, 'action'),
        close,
        cache.series('bollinger', { period, k: num(row, 'mult') }),
        i,
      );
    case 'bollinger.price_dir':
      return versusLag(rising(row), close, 1, i);
    case 'bollinger.width': {
      const bands = cache.series('bollinger', { period, k: num(row, 'mult') });
      const up = rising(row);
      const evidenceOp: CompareOp = up === false ? '<' : '>';
      if (up === null) return missingEvidence(evidenceOp);
      const lhs = bandWidth(bands, i);
      const rhs = bandWidth(bands, i - 1);
      const missing = lhs === null || rhs === null;
      const result = missing ? null : up ? lhs > rhs : lhs < rhs;
      return { lhs, rhs, result, missing, op: evidenceOp };
    }
    case 'donchian.break': {
      const s = cache.series('donchian', { period });
      const band = str(row, 'band');
      const line = band === 'upper' ? s.upper : band === 'lower' ? s.lower : undefined;
      return relation(op, close, line, i);
    }
    case 'dmi.di': {
      const s = cache.series('dmi', { period });
      return relation(op, s.plus, s.minus, i);
    }
    case 'dmi.adx':
      return relation(op, cache.series('dmi', { period }).adx, threshold, i);
    case 'obv.sma': {
      const s = cache.series('obv', { baseline: period });
      return relation(op, s.value, s.baseline, i);
    }
    case 'obv.breakout': {
      const s = cache.series('obv', { baseline: period, breakout_period: period });
      return breakout(str(row, 'action'), s.value, s, i);
    }
    default:
      return missingEvidence('>');
  }
}

/** Evaluate one condition row at bar `i` (rows read only bars `<= i`). */
export function evaluateRow(row: ConditionRow, cache: SeriesCache, i: number): RowEvaluation {
  const { op, ...evidence } = evaluateRowEvidence(row, cache, i);
  return { id: row.id, op, ...evidence, values: rowValues(row) };
}

export const isParamsSide = (side: SideConfig): side is ParamsSideConfig =>
  'params' in side && side.params !== null && typeof side.params === 'object';

function evaluateParamsSide(
  indicatorId: string,
  side: ParamsSideConfig,
  cache: SeriesCache,
  i: number,
): RowEvaluation[] {
  const series = cache.series(indicatorId, side.params);
  return side.rules
    .filter((rule) => rule.enabled !== false)
    .map((rule) => ({
      id: rule.id,
      ...evaluateRuleWithEvidence(rule, series, side.params, i),
      op: rule.op as CompareOp,
      values: { ...side.params },
    }));
}

const noSignal = (indicator: string, reason: NoSignalReason): IndicatorSideEvaluation => ({
  indicator,
  status: 'no_signal',
  reason,
  result: null,
  rows: [],
});

/**
 * One indicator side at bar `i` (SPEC V3 §1.3): the enabled rows are AND-combined with Kleene
 * logic (any false → false, else any unknown → unknown). `no_signal` (result `null`) when the
 * indicator is off, the side is off or no row is enabled. How the products combine several
 * indicators is theirs and unchanged.
 */
export function evaluateIndicatorSide(
  indicatorId: string,
  side: SideConfig | undefined,
  cache: SeriesCache,
  i: number,
  masterEnabled = true,
): IndicatorSideEvaluation {
  if (!masterEnabled) return noSignal(indicatorId, 'indicator_off');
  if (side?.enabled !== true) return noSignal(indicatorId, 'side_off');
  const rows = isParamsSide(side)
    ? evaluateParamsSide(indicatorId, side, cache, i)
    : side.rules.filter((row) => row.enabled !== false).map((row) => evaluateRow(row, cache, i));
  if (!rows.length) return noSignal(indicatorId, 'no_rows');
  return {
    indicator: indicatorId,
    status: 'ok',
    reason: null,
    result: and3(rows.map((row) => row.result)),
    rows,
  };
}

/** `evaluateIndicatorSide` for every bar (one shared series cache). */
export function evaluateIndicatorSideSeries(
  indicatorId: string,
  side: SideConfig | undefined,
  barsOrCache: readonly Bar[] | SeriesCache,
  masterEnabled = true,
): IndicatorSideEvaluation[] {
  const cache = Array.isArray(barsOrCache)
    ? createSeriesCache(barsOrCache as readonly Bar[])
    : (barsOrCache as SeriesCache);
  return cache.bars.map((_, i) => evaluateIndicatorSide(indicatorId, side, cache, i, masterEnabled));
}
