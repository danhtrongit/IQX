import { CURRENT_INDICATOR_IDS, type Bar, type SeriesMap } from './types.js';

/**
 * Exact port of the spec reference engine `calc` (bot-v2 assets/engine.js,
 * calculation_version iqx-ta-2.0). Arithmetic order is preserved on purpose so
 * the golden tests can compare series bit-for-bit; do not "optimise" rolling
 * windows into running sums.
 *
 * `calc` serves only the 16 indicators of the current registry (`iqx-rules-3.0`).
 * `calcLegacy` additionally computes the 19 retired indicators so historical receipts can
 * still be read and re-verified; nothing may offer them as current.
 */

type Value = number | null;
type Series = Value[];

export const isFiniteNumber = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x);

const nil = (n: number): Series => new Array<Value>(n).fill(null);
const sum = (a: readonly number[]): number => a.reduce((s, x) => s + x, 0);
const mean = (a: readonly number[]): number => sum(a) / a.length;
const maxOf = (w: number[]): number => Math.max(...w);
const minOf = (w: number[]): number => Math.min(...w);

/** Window ending `offset` bars before `i`; any non-finite value in the window → null. */
function rolling(a: readonly Value[], n: number, fn: (w: number[]) => Value, offset = 0): Series {
  const o = nil(a.length);
  for (let i = 0; i < a.length; i++) {
    const e = i - offset;
    const s = e - n + 1;
    if (s < 0) continue;
    const w = a.slice(s, e + 1);
    if (w.length === n && w.every(isFiniteNumber)) o[i] = fn(w);
  }
  return o;
}

const sma = (a: readonly Value[], n: number, offset = 0): Series => rolling(a, n, mean, offset);

/** SMA seed of the first `n` consecutive finite values, then exponential recurrence; a gap restarts the seed. */
function ew(a: readonly Value[], n: number, alpha: number): Series {
  const out = nil(a.length);
  let seed: number[] = [];
  let v: number | null = null;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (!isFiniteNumber(x)) {
      seed = [];
      v = null;
      continue;
    }
    if (v === null) {
      seed.push(x);
      if (seed.length === n) {
        v = mean(seed);
        out[i] = v;
      }
    } else {
      v = alpha * x + (1 - alpha) * v;
      out[i] = v;
    }
  }
  return out;
}

const ema = (a: readonly Value[], n: number): Series => ew(a, n, 2 / (n + 1));
const wilder = (a: readonly Value[], n: number): Series => ew(a, n, 1 / n);

/** `shift(a, -k)[i] = a[i-k]` (out of range → null). */
const shift = (a: readonly Value[], k: number): Series =>
  a.map((_, i) => (i + k >= 0 && i + k < a.length ? (a[i + k] ?? null) : null));

function zip(
  a: readonly Value[],
  b: readonly Value[],
  fn: (x: number, y: number) => Value,
): Series {
  return a.map((x, i) => {
    const y = b[i];
    return isFiniteNumber(x) && isFiniteNumber(y) ? fn(x, y) : null;
  });
}

const div = (a: readonly Value[], b: readonly Value[], k = 1): Series =>
  zip(a, b, (x, y) => (y === 0 ? null : (x / y) * k));

/** A bar is usable when OHLCV are finite, low > 0, high/low bracket open/close and volume ≥ 0. */
export function validBar(b: Bar | undefined): b is Bar {
  return (
    b !== undefined &&
    b !== null &&
    isFiniteNumber(b.open) &&
    isFiniteNumber(b.high) &&
    isFiniteNumber(b.low) &&
    isFiniteNumber(b.close) &&
    isFiniteNumber(b.volume) &&
    b.low > 0 &&
    b.high >= Math.max(b.open, b.close, b.low) &&
    b.low <= Math.min(b.open, b.close) &&
    b.volume >= 0
  );
}

function trueRange(b: readonly Bar[]): Series {
  return b.map((x, i) => {
    const prev = b[i - 1];
    return i && validBar(x) && prev !== undefined && isFiniteNumber(prev.close)
      ? Math.max(x.high - x.low, Math.abs(x.high - prev.close), Math.abs(x.low - prev.close))
      : null;
  });
}

/** Ratio with the reference RSI/MFI edge rules: G=D=0 → missing, D=0<G → 100, G=0<D → 0. */
function ratioIndex(up: readonly Value[], down: readonly Value[]): Series {
  return up.map((x, i) => {
    const y = down[i];
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
    if (x === 0 && y === 0) return null;
    if (y === 0) return 100;
    if (x === 0) return 0;
    return 100 - 100 / (1 + x / y);
  });
}

/** Mirrors the reference `coverage < .95` coercion: null counts as 0, undefined never trips. */
function coverageBelowThreshold(coverage: number | null | undefined): boolean {
  if (coverage === null) return true;
  if (coverage === undefined) return false;
  return coverage < 0.95;
}

const coverageAtLeastThreshold = (coverage: number | null | undefined): boolean =>
  typeof coverage === 'number' && coverage >= 0.95;

const CURRENT_IDS: ReadonlySet<string> = new Set(CURRENT_INDICATOR_IDS);

export const isCurrentIndicatorId = (id: string): boolean => CURRENT_IDS.has(id);

/**
 * Compute the named series of one indicator instance of the current registry (16 ids).
 * Anything else throws: removed indicators are legacy-only (`calcLegacy`).
 */
export function calc(id: string, params: Record<string, number>, bars: readonly Bar[]): SeriesMap {
  if (!CURRENT_IDS.has(id)) throw new Error(`Chỉ báo không được hỗ trợ: ${id}`);
  return calcAny(id, params, bars);
}

/**
 * Legacy engine surface (iqx-rules-2.0): the 16 current indicators plus the 19 retired ones.
 * Only for reading/verifying historical configs and receipts; context indicators (rs_market,
 * rs_sector, ad_line, breadth_ma50, new_high_low, index_ma) return null where their context
 * fields are missing — never zero.
 */
export function calcLegacy(
  id: string,
  params: Record<string, number>,
  bars: readonly Bar[],
): SeriesMap {
  return calcAny(id, params, bars);
}

function calcAny(id: string, params: Record<string, number>, bars: readonly Bar[]): SeriesMap {
  const p = (key: string): number => params[key] ?? Number.NaN;
  const b = bars;
  const n = b.length;
  const close: Series = b.map((x) => (isFiniteNumber(x.close) ? x.close : null));
  const high: number[] = b.map((x) => x.high);
  const low: number[] = b.map((x) => x.low);
  const volume: number[] = b.map((x) => x.volume);
  const index: Series = b.map((x) => (isFiniteNumber(x.market) ? x.market : null));
  const sector: Series = b.map((x) => (isFiniteNumber(x.sector) ? x.sector : null));
  const o: SeriesMap = { close, high, low, volume, index };

  switch (id) {
    case 'rsi': {
      const change = zip(close, shift(close, -1), (x, y) => x - y);
      const gain = wilder(
        change.map((x) => (isFiniteNumber(x) ? Math.max(0, x) : null)),
        p('period'),
      );
      const loss = wilder(
        change.map((x) => (isFiniteNumber(x) ? Math.max(0, -x) : null)),
        p('period'),
      );
      o.value = ratioIndex(gain, loss);
      break;
    }
    case 'ma':
      o.value = sma(close, p('period'));
      break;
    case 'ema':
      o.value = ema(close, p('period'));
      break;
    case 'macd': {
      const value = zip(ema(close, p('fast')), ema(close, p('slow')), (x, y) => x - y);
      const signal = ema(value, p('signal'));
      o.value = value;
      o.signal = signal;
      o.histogram = zip(value, signal, (x, y) => x - y);
      break;
    }
    case 'ma_cross': {
      const fast = sma(close, p('fast'));
      const slow = sma(close, p('slow'));
      o.fast = fast;
      o.slow = slow;
      o.value = zip(fast, slow, (x, y) => x - y);
      break;
    }
    case 'bollinger':
    case 'bb_width': {
      const k = p('k');
      const middle = sma(close, p('period'));
      const std = rolling(close, p('period'), (w) => {
        const m = mean(w);
        return Math.sqrt(mean(w.map((x) => (x - m) ** 2)));
      });
      const upper = zip(middle, std, (x, y) => x + k * y);
      const lower = zip(middle, std, (x, y) => x - k * y);
      o.middle = middle;
      o.std = std;
      o.upper = upper;
      o.lower = lower;
      o.value = div(
        zip(upper, lower, (x, y) => x - y),
        middle,
        100,
      );
      break;
    }
    case 'volume':
    case 'relative_volume': {
      const mult = p('mult') || 1;
      const baseline = sma(volume, p('lookback'), 1);
      o.baseline = baseline;
      o.threshold = baseline.map((x) => (isFiniteNumber(x) && x > 0 ? x * mult : null));
      o.value = div(volume, baseline);
      break;
    }
    case 'atr':
    case 'atr_percent': {
      const atr = wilder(trueRange(b), p('period'));
      o.atr = atr;
      o.value = id === 'atr' ? atr : div(atr, close, 100);
      o.baseline = sma(atr, p('baseline') || 20, 1);
      break;
    }
    case 'dmi':
    case 'adx': {
      const period = p('period');
      const plusDm = nil(n);
      const minusDm = nil(n);
      for (let i = 1; i < n; i++) {
        const current = b[i];
        const previous = b[i - 1];
        if (!validBar(current) || !validBar(previous)) continue;
        const up = current.high - previous.high;
        const down = previous.low - current.low;
        plusDm[i] = up > down && up > 0 ? up : 0;
        minusDm[i] = down > up && down > 0 ? down : 0;
      }
      const atr = wilder(trueRange(b), period);
      const plus = div(wilder(plusDm, period), atr, 100);
      const minus = div(wilder(minusDm, period), atr, 100);
      o.plus = plus;
      o.minus = minus;
      if (id === 'adx') {
        // ADX is a retired indicator: the current DMI exposes only +DI/−DI (Bot spec §9.1).
        const dx = zip(plus, minus, (x, y) =>
          x + y === 0 ? 0 : (100 * Math.abs(x - y)) / (x + y),
        );
        o.dx = dx;
        o.value = wilder(dx, period);
      } else {
        o.value = plus;
      }
      break;
    }
    case 'stochastic': {
      const highest = rolling(high, p('k'), maxOf);
      const lowest = rolling(low, p('k'), minOf);
      const raw = close.map((x, i) => {
        const hh = highest[i];
        const ll = lowest[i];
        return isFiniteNumber(x) && isFiniteNumber(hh) && isFiniteNumber(ll) && hh > ll
          ? (100 * (x - ll)) / (hh - ll)
          : null;
      });
      const value = sma(raw, p('smooth'));
      o.raw = raw;
      o.value = value;
      o.signal = sma(value, p('d'));
      break;
    }
    case 'cci': {
      const typical = b.map((x) => (validBar(x) ? (x.high + x.low + x.close) / 3 : null));
      o.value = rolling(typical, p('period'), (w) => {
        const m = mean(w);
        const md = mean(w.map((x) => Math.abs(x - m)));
        const last = w[w.length - 1];
        return md > 0 && last !== undefined ? (last - m) / (0.015 * md) : null;
      });
      break;
    }
    case 'obv': {
      const value = nil(n);
      let v = 0;
      let started = false;
      for (let i = 0; i < n; i++) {
        const current = b[i];
        if (!validBar(current)) {
          started = false;
          continue;
        }
        const prevClose = close[i - 1];
        if (!started) {
          v = 0;
          started = true;
        } else if (isFiniteNumber(prevClose)) {
          v +=
            (current.close > prevClose ? 1 : current.close < prevClose ? -1 : 0) * current.volume;
        }
        value[i] = v;
      }
      o.value = value;
      o.baseline = sma(value, p('baseline'));
      break;
    }
    case 'mfi': {
      const typical = b.map((x) => (validBar(x) ? (x.high + x.low + x.close) / 3 : null));
      const positive = nil(n);
      const negative = nil(n);
      for (let i = 1; i < n; i++) {
        const tp = typical[i];
        const prevTp = typical[i - 1];
        const vol = volume[i];
        if (isFiniteNumber(tp) && isFiniteNumber(prevTp) && isFiniteNumber(vol)) {
          positive[i] = tp > prevTp ? tp * vol : 0;
          negative[i] = tp < prevTp ? tp * vol : 0;
        }
      }
      o.value = ratioIndex(
        rolling(positive, p('period'), sum),
        rolling(negative, p('period'), sum),
      );
      break;
    }
    case 'cmf': {
      const flow = b.map((x) =>
        validBar(x)
          ? (x.high === x.low ? 0 : (x.close - x.low - (x.high - x.close)) / (x.high - x.low)) *
            x.volume
          : null,
      );
      o.value = div(rolling(flow, p('period'), sum), rolling(volume, p('period'), sum));
      break;
    }
    case 'n_day_high':
    case 'n_day_low':
    case 'donchian': {
      const upper = rolling(high, p('period'), maxOf, 1);
      const lower = rolling(low, p('period'), minOf, 1);
      o.upper = upper;
      o.lower = lower;
      o.middle = zip(upper, lower, (x, y) => (x + y) / 2);
      o.value = id === 'n_day_low' ? lower : upper;
      break;
    }
    case 'distance_52w_high': {
      const high252 = rolling(high, 252, maxOf);
      o.value = zip(close, high252, (x, y) => 100 * (x / y - 1));
      break;
    }
    case 'gap':
      o.value = b.map((x, i) => {
        const prevClose = close[i - 1];
        return i && isFiniteNumber(x.open) && isFiniteNumber(prevClose) && prevClose > 0
          ? 100 * (x.open / prevClose - 1)
          : null;
      });
      break;
    case 'distance_support':
    case 'distance_resistance': {
      // A pivot at j is confirmed only at t = j + w (the confirmation bar), never earlier.
      const w = p('pivot');
      const support = nil(n);
      const resistance = nil(n);
      let sup: number | null = null;
      let res: number | null = null;
      for (let t = 0; t < n; t++) {
        const j = t - w;
        if (j >= w && b.slice(j - w, t + 1).every((x) => validBar(x))) {
          const lowJ = low[j] ?? Number.NaN;
          const highJ = high[j] ?? Number.NaN;
          const lows = low.slice(j - w, j).concat(low.slice(j + 1, t + 1));
          const highs = high.slice(j - w, j).concat(high.slice(j + 1, t + 1));
          if (lows.every((x) => lowJ < x)) sup = lowJ;
          if (highs.every((x) => highJ > x)) res = highJ;
        }
        support[t] = sup;
        resistance[t] = res;
      }
      o.support = support;
      o.resistance = resistance;
      o.value =
        id === 'distance_support'
          ? zip(close, support, (x, y) => (100 * (x - y)) / y)
          : zip(resistance, close, (x, y) => (100 * (x - y)) / y);
      break;
    }
    case 'keltner': {
      const k = p('k');
      const middle = ema(close, p('ema'));
      const atr = wilder(trueRange(b), p('atr'));
      o.middle = middle;
      o.upper = zip(middle, atr, (x, y) => x + k * y);
      o.lower = zip(middle, atr, (x, y) => x - k * y);
      o.value = middle;
      break;
    }
    case 'roc':
      o.value = zip(close, shift(close, -p('period')), (x, y) =>
        y > 0 ? 100 * (x / y - 1) : null,
      );
      break;
    case 'williams_r': {
      const highest = rolling(high, p('period'), maxOf);
      const lowest = rolling(low, p('period'), minOf);
      o.value = close.map((x, i) => {
        const hh = highest[i];
        const ll = lowest[i];
        return isFiniteNumber(x) && isFiniteNumber(hh) && isFiniteNumber(ll) && hh > ll
          ? (-100 * (hh - x)) / (hh - ll)
          : null;
      });
      break;
    }
    case 'psar':
      o.value = parabolicSar(b, p('step'), p('max'));
      break;
    case 'rs_market':
    case 'rs_sector': {
      const lookback = p('lookback');
      const context = id === 'rs_market' ? index : sector;
      const pctChange = (x: number, y: number): Value => (y > 0 ? 100 * (x / y - 1) : null);
      const stockReturn = zip(close, shift(close, -lookback), pctChange);
      const contextReturn = zip(context, shift(context, -lookback), pctChange);
      o.value = zip(stockReturn, contextReturn, (x, y) => x - y);
      break;
    }
    case 'ad_line': {
      let cumulative = 0;
      let reset = true;
      const value: Series = b.map((x) => {
        const advances = x.advances;
        const declines = x.declines;
        if (
          !isFiniteNumber(advances) ||
          !isFiniteNumber(declines) ||
          coverageBelowThreshold(x.coverage)
        ) {
          reset = true;
          return null;
        }
        if (reset) {
          cumulative = 0;
          reset = false;
        }
        cumulative += advances - declines;
        return cumulative;
      });
      o.value = value;
      o.baseline = sma(value, p('baseline'));
      break;
    }
    case 'breadth_ma50':
      o.value = b.map((x) =>
        isFiniteNumber(x.above50) &&
        typeof x.eligible === 'number' &&
        x.eligible > 0 &&
        coverageAtLeastThreshold(x.coverage)
          ? (100 * x.above50) / x.eligible
          : null,
      );
      break;
    case 'new_high_low':
      o.value = b.map((x) =>
        isFiniteNumber(x.newHigh) &&
        isFiniteNumber(x.newLow) &&
        coverageAtLeastThreshold(x.coverage)
          ? x.newHigh - x.newLow
          : null,
      );
      break;
    case 'index_ma':
      o.value = sma(index, p('period'));
      break;
    default:
      throw new Error(`Chỉ báo không được hỗ trợ: ${id}`);
  }
  return o;
}

/** Wilder Parabolic SAR; an invalid bar resets the trend and the next valid pair re-seeds it. */
function parabolicSar(b: readonly Bar[], step: number, maxAf: number): Series {
  const n = b.length;
  const out = nil(n);
  let up = true;
  let state: { sar: number; ep: number } | null = null;
  let af = step;
  for (let i = 1; i < n; i++) {
    const current = b[i];
    const previous = b[i - 1];
    if (!validBar(current) || !validBar(previous)) {
      state = null;
      continue;
    }
    if (state === null) {
      up = current.close >= previous.close;
      const sar = up ? Math.min(current.low, previous.low) : Math.max(current.high, previous.high);
      const ep = up ? Math.max(current.high, previous.high) : Math.min(current.low, previous.low);
      state = { sar, ep };
      af = step;
      out[i] = sar;
      continue;
    }
    const beforePrevious = b[i - 2];
    let ep: number = state.ep;
    let next: number = state.sar + af * (ep - state.sar);
    if (up) {
      next = Math.min(
        next,
        previous.low,
        i > 1 && beforePrevious !== undefined && isFiniteNumber(beforePrevious.low)
          ? beforePrevious.low
          : previous.low,
      );
      if (current.low < next) {
        up = false;
        next = ep;
        ep = current.low;
        af = step;
      } else if (current.high > ep) {
        ep = current.high;
        af = Math.min(maxAf, af + step);
      }
    } else {
      next = Math.max(
        next,
        previous.high,
        i > 1 && beforePrevious !== undefined && isFiniteNumber(beforePrevious.high)
          ? beforePrevious.high
          : previous.high,
      );
      if (current.high > next) {
        up = true;
        next = ep;
        ep = current.high;
        af = step;
      } else if (current.low < ep) {
        ep = current.low;
        af = Math.min(maxAf, af + step);
      }
    }
    state = { sar: next, ep };
    out[i] = next;
  }
  return out;
}
