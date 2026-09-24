export const BINARY_INDICATORS = new Set([
  'ma_stack_bull',
  'uptrend',
  'death_cross',
  'macd_bull_cross',
  'macd_bear_cross',
  'bb_squeeze',
  'bb_breakout_down',
  'breakout_20d',
  'breakout_52w',
  'breakdown_20d',
  'breakdown_52w',
  'hammer',
  'bull_engulfing',
  'bear_engulfing',
  'shooting_star',
] as const);

export const INDICATORS = [
  'ma_5',
  'ma_20',
  'ma_50',
  'ma_200',
  'ma_stack_bull',
  'uptrend',
  'death_cross',
  'ma_20_slope',
  'dist_ma_20',
  'dist_ma_200',
  'rsi_14',
  'macd_hist',
  'macd_bull_cross',
  'macd_bear_cross',
  'roc_20d',
  'atr_14',
  'atr_pct',
  'bb_width',
  'bb_squeeze',
  'bb_breakout_down',
  'vol_ma_20',
  'vol_zscore',
  'obv',
  'obv_ma_20',
  'high_20',
  'high_52w',
  'dist_52w_high',
  'breakout_20d',
  'breakout_52w',
  'low_20',
  'low_52w',
  'dist_52w_low',
  'breakdown_20d',
  'breakdown_52w',
  'hammer',
  'bull_engulfing',
  'bear_engulfing',
  'shooting_star',
] as const;

export type IndicatorName = (typeof INDICATORS)[number];
export type NumericFrame = Record<string, Float64Array>;
export type OhlcvRecord = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type Ohlcv = {
  time: string[];
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array;
};

export function ohlcvFromRecords(records: readonly OhlcvRecord[]): Ohlcv {
  return {
    time: records.map((row) => row.time),
    open: Float64Array.from(records, (row) => Number(row.open)),
    high: Float64Array.from(records, (row) => Number(row.high)),
    low: Float64Array.from(records, (row) => Number(row.low)),
    close: Float64Array.from(records, (row) => Number(row.close)),
    volume: Float64Array.from(records, (row) => Number(row.volume)),
  };
}

function nans(length: number): Float64Array {
  const out = new Float64Array(length);
  out.fill(Number.NaN);
  return out;
}

function shift(input: Float64Array, periods: number): Float64Array {
  const out = nans(input.length);
  if (periods >= 0 && periods < input.length)
    out.set(input.subarray(0, input.length - periods), periods);
  return out;
}

function rollingMean(input: Float64Array, period: number): Float64Array {
  const out = nans(input.length);
  if (input.length < period) return out;
  let sum = 0;
  let invalid = 0;
  for (let index = 0; index < input.length; index += 1) {
    const value = input[index]!;
    if (Number.isNaN(value)) invalid += 1;
    else sum += value;
    if (index >= period) {
      const leaving = input[index - period]!;
      if (Number.isNaN(leaving)) invalid -= 1;
      else sum -= leaving;
    }
    if (index >= period - 1 && invalid === 0) out[index] = sum / period;
  }
  return out;
}

function rollingStd(input: Float64Array, period: number): Float64Array {
  const out = nans(input.length);
  if (input.length < period || period < 2) return out;
  for (let end = period - 1; end < input.length; end += 1) {
    let sum = 0;
    let sumSquares = 0;
    let valid = true;
    for (let index = end - period + 1; index <= end; index += 1) {
      const value = input[index]!;
      if (Number.isNaN(value)) {
        valid = false;
        break;
      }
      sum += value;
      sumSquares += value * value;
    }
    if (valid) {
      const variance = Math.max(0, (sumSquares - (sum * sum) / period) / (period - 1));
      out[end] = Math.sqrt(variance);
    }
  }
  return out;
}

function rollingExtreme(input: Float64Array, period: number, maximum: boolean): Float64Array {
  const out = nans(input.length);
  for (let end = period - 1; end < input.length; end += 1) {
    let result = maximum ? -Infinity : Infinity;
    let valid = true;
    for (let index = end - period + 1; index <= end; index += 1) {
      const value = input[index]!;
      if (Number.isNaN(value)) {
        valid = false;
        break;
      }
      result = maximum ? Math.max(result, value) : Math.min(result, value);
    }
    if (valid) out[end] = result;
  }
  return out;
}

/** NumPy's default linear percentile interpolation. */
function rollingPercentile(input: Float64Array, period: number, percentile: number): Float64Array {
  const out = nans(input.length);
  for (let end = period - 1; end < input.length; end += 1) {
    const values = Array.from(input.subarray(end - period + 1, end + 1));
    if (values.some(Number.isNaN)) continue;
    values.sort((a, b) => a - b);
    const position = (percentile / 100) * (period - 1);
    const lower = Math.floor(position);
    const fraction = position - lower;
    const low = values[lower]!;
    out[end] = low + (values[Math.min(lower + 1, period - 1)]! - low) * fraction;
  }
  return out;
}

function ema(input: Float64Array, period: number): Float64Array {
  const out = nans(input.length);
  let first = -1;
  for (let index = 0; index < input.length; index += 1) {
    if (!Number.isNaN(input[index]!)) {
      first = index;
      break;
    }
  }
  if (first < 0 || first + period > input.length) return out;
  let seed = 0;
  for (let index = first; index < first + period; index += 1) {
    const value = input[index]!;
    if (Number.isNaN(value)) return out;
    seed += value;
  }
  const seedIndex = first + period - 1;
  out[seedIndex] = seed / period;
  const alpha = 2 / (period + 1);
  for (let index = seedIndex + 1; index < input.length; index += 1) {
    const value = input[index]!;
    out[index] = Number.isNaN(value)
      ? out[index - 1]!
      : alpha * value + (1 - alpha) * out[index - 1]!;
  }
  return out;
}

function binary(
  length: number,
  predicate: (index: number) => boolean,
  valid: (index: number) => boolean,
): Float64Array {
  const out = nans(length);
  for (let index = 0; index < length; index += 1)
    if (valid(index)) out[index] = predicate(index) ? 1 : 0;
  return out;
}

function ratio(left: Float64Array, right: Float64Array, difference = false): Float64Array {
  return Float64Array.from(left, (value, index) =>
    difference ? (value - right[index]!) / right[index]! : value / right[index]!,
  );
}

function rsi(close: Float64Array, period: number): Float64Array {
  const out = nans(close.length);
  if (close.length < period + 1) return out;
  const gains = new Float64Array(close.length - 1);
  const losses = new Float64Array(close.length - 1);
  for (let index = 1; index < close.length; index += 1) {
    const delta = close[index]! - close[index - 1]!;
    gains[index - 1] = Math.max(delta, 0);
    losses[index - 1] = Math.max(-delta, 0);
  }
  const averageGain = rollingMean(gains, period);
  const averageLoss = rollingMean(losses, period);
  for (let index = 1; index < close.length; index += 1) {
    const gain = averageGain[index - 1]!;
    const loss = averageLoss[index - 1]!;
    if (Number.isNaN(gain) || Number.isNaN(loss)) continue;
    out[index] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

function atr(
  high: Float64Array,
  low: Float64Array,
  close: Float64Array,
  period: number,
): Float64Array {
  const trueRange = nans(close.length);
  for (let index = 1; index < close.length; index += 1) {
    trueRange[index] = Math.max(
      high[index]! - low[index]!,
      Math.abs(high[index]! - close[index - 1]!),
      Math.abs(low[index]! - close[index - 1]!),
    );
  }
  return rollingMean(trueRange, period);
}

function obv(close: Float64Array, volume: Float64Array): Float64Array {
  const out = new Float64Array(close.length);
  for (let index = 1; index < close.length; index += 1) {
    out[index] =
      out[index - 1]! +
      (close[index]! > close[index - 1]!
        ? volume[index]!
        : close[index]! < close[index - 1]!
          ? -volume[index]!
          : 0);
  }
  return out;
}

function breakout(close: Float64Array, rolling: Float64Array, above: boolean): Float64Array {
  const previous = shift(rolling, 1);
  const twoBack = shift(rolling, 2);
  const closePrevious = shift(close, 1);
  return binary(
    close.length,
    (i) =>
      above
        ? close[i]! >= previous[i]! && closePrevious[i]! < twoBack[i]!
        : close[i]! <= previous[i]! && closePrevious[i]! > twoBack[i]!,
    (i) =>
      !Number.isNaN(previous[i]!) && !Number.isNaN(twoBack[i]!) && !Number.isNaN(closePrevious[i]!),
  );
}

export function computeIndicators(data: Ohlcv): Record<IndicatorName, Float64Array> {
  const { close, high, low, open, volume } = data;
  const length = close.length;
  const out = {} as Record<IndicatorName, Float64Array>;
  const ma5 = rollingMean(close, 5),
    ma20 = rollingMean(close, 20),
    ma50 = rollingMean(close, 50),
    ma200 = rollingMean(close, 200);
  out.ma_5 = ma5;
  out.ma_20 = ma20;
  out.ma_50 = ma50;
  out.ma_200 = ma200;
  out.ma_stack_bull = binary(
    length,
    (i) => ma5[i]! > ma20[i]! && ma20[i]! > ma50[i]! && ma50[i]! > ma200[i]!,
    (i) => [ma5[i], ma20[i], ma50[i], ma200[i]].every((v) => !Number.isNaN(v!)),
  );
  out.uptrend = binary(
    length,
    (i) => ma50[i]! > ma200[i]!,
    (i) => !Number.isNaN(ma50[i]!) && !Number.isNaN(ma200[i]!),
  );
  const ma20Prev = shift(ma20, 1),
    ma50Prev = shift(ma50, 1);
  out.death_cross = binary(
    length,
    (i) => ma20[i]! < ma50[i]! && ma20Prev[i]! >= ma50Prev[i]!,
    (i) => [ma20[i], ma50[i], ma20Prev[i], ma50Prev[i]].every((v) => !Number.isNaN(v!)),
  );
  out.ma_20_slope = ratio(
    Float64Array.from(ma20, (v, i) => v - shift(ma20, 10)[i]!),
    shift(ma20, 10),
  );
  out.dist_ma_20 = ratio(close, ma20, true);
  out.dist_ma_200 = ratio(close, ma200, true);
  out.rsi_14 = rsi(close, 14);
  const fast = ema(close, 12),
    slow = ema(close, 26),
    macd = Float64Array.from(fast, (v, i) => v - slow[i]!);
  const signal = ema(macd, 9);
  out.macd_hist = Float64Array.from(macd, (v, i) => v - signal[i]!);
  const macdPrev = shift(macd, 1),
    signalPrev = shift(signal, 1);
  const macdValid = (i: number) =>
    [macd[i], signal[i], macdPrev[i], signalPrev[i]].every((v) => !Number.isNaN(v!));
  out.macd_bull_cross = binary(
    length,
    (i) => macd[i]! > signal[i]! && macdPrev[i]! <= signalPrev[i]!,
    macdValid,
  );
  out.macd_bear_cross = binary(
    length,
    (i) => macd[i]! < signal[i]! && macdPrev[i]! >= signalPrev[i]!,
    macdValid,
  );
  out.roc_20d = ratio(close, shift(close, 20), true);
  out.atr_14 = atr(high, low, close, 14);
  out.atr_pct = ratio(out.atr_14, close);
  const std20 = rollingStd(close, 20);
  const upper = Float64Array.from(ma20, (v, i) => v + 2 * std20[i]!);
  const lower = Float64Array.from(ma20, (v, i) => v - 2 * std20[i]!);
  out.bb_width = Float64Array.from(upper, (v, i) => (v - lower[i]!) / ma20[i]!);
  const p15 = rollingPercentile(out.bb_width, 120, 15);
  out.bb_squeeze = binary(
    length,
    (i) => out.bb_width[i]! <= p15[i]!,
    (i) => !Number.isNaN(out.bb_width[i]!) && !Number.isNaN(p15[i]!),
  );
  const lowerPrev = shift(lower, 1),
    closePrev = shift(close, 1);
  out.bb_breakout_down = binary(
    length,
    (i) => close[i]! < lower[i]! && closePrev[i]! >= lowerPrev[i]!,
    (i) => [lower[i], lowerPrev[i], closePrev[i]].every((v) => !Number.isNaN(v!)),
  );
  out.vol_ma_20 = rollingMean(volume, 20);
  const volStd = rollingStd(volume, 20);
  out.vol_zscore = Float64Array.from(volume, (v, i) => (v - out.vol_ma_20[i]!) / volStd[i]!);
  out.obv = obv(close, volume);
  out.obv_ma_20 = rollingMean(out.obv, 20);
  out.high_20 = rollingExtreme(high, 20, true);
  out.high_52w = rollingExtreme(high, 252, true);
  out.dist_52w_high = ratio(close, out.high_52w, true);
  out.breakout_20d = breakout(close, out.high_20, true);
  out.breakout_52w = breakout(close, out.high_52w, true);
  out.low_20 = rollingExtreme(low, 20, false);
  out.low_52w = rollingExtreme(low, 252, false);
  out.dist_52w_low = ratio(close, out.low_52w, true);
  out.breakdown_20d = breakout(close, out.low_20, false);
  out.breakdown_52w = breakout(close, out.low_52w, false);
  const close5 = shift(close, 5),
    openPrev = shift(open, 1),
    close1 = shift(close, 1);
  const body = Float64Array.from(close, (v, i) => Math.abs(v - open[i]!));
  const upperWick = Float64Array.from(high, (v, i) => v - Math.max(close[i]!, open[i]!));
  const lowerWick = Float64Array.from(low, (v, i) => Math.min(close[i]!, open[i]!) - v);
  const return5 = ratio(close, close5, true);
  out.hammer = binary(
    length,
    (i) => lowerWick[i]! > 2 * body[i]! && upperWick[i]! < body[i]! && return5[i]! < -0.03,
    (i) => !Number.isNaN(close5[i]!),
  );
  out.shooting_star = binary(
    length,
    (i) => upperWick[i]! > 2 * body[i]! && lowerWick[i]! < body[i]! && return5[i]! > 0.03,
    (i) => !Number.isNaN(close5[i]!),
  );
  const engulfValid = (i: number) => !Number.isNaN(openPrev[i]!) && !Number.isNaN(close1[i]!);
  out.bull_engulfing = binary(
    length,
    (i) =>
      close1[i]! < openPrev[i]! &&
      close[i]! > open[i]! &&
      close[i]! > openPrev[i]! &&
      open[i]! < close1[i]!,
    engulfValid,
  );
  out.bear_engulfing = binary(
    length,
    (i) =>
      close1[i]! > openPrev[i]! &&
      close[i]! < open[i]! &&
      close[i]! < openPrev[i]! &&
      open[i]! > close1[i]!,
    engulfValid,
  );
  return out;
}

/** Alias intentionally exported for alert/trading/AI consumers. */
export const calcIndicators = computeIndicators;

export function buildFrame(data: Ohlcv): NumericFrame {
  return {
    ...computeIndicators(data),
    close: data.close,
    open: data.open,
    high: data.high,
    low: data.low,
    volume: data.volume,
  };
}

export function latestIndicatorValues(frame: NumericFrame): Record<IndicatorName, number | null> {
  return Object.fromEntries(
    INDICATORS.map((name) => {
      const values = frame[name];
      const value = values?.[values.length - 1];
      return [name, value === undefined || Number.isNaN(value) ? null : value];
    }),
  ) as Record<IndicatorName, number | null>;
}
