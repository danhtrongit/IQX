"""The 38 technical indicators (spec §2), computed from adjusted daily OHLCV.

Each indicator is returned as a float ``np.ndarray`` aligned to the input bars.
Warmup bars (insufficient lookback) are ``np.nan``. Binary indicators are
``0.0``/``1.0`` (``np.nan`` during warmup). All math follows the formulas in
``docs/superpowers/specs/2026-06-17-strategy-lab-alerts-design.md``:

* ``SMA`` = simple mean; ``EMA`` seeded with ``SMA`` of the first N values,
  ``alpha = 2/(N+1)``.
* ``StdDev`` = sample standard deviation (``ddof=1``).
* ``Percentile`` = linear (numpy default).
* Order: MAs -> MA-dependent -> OBV -> candlestick patterns.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]

# ── Field catalogs ───────────────────────────────────────────────────────────

#: Binary indicators emit only 0/1 (plus nan during warmup).
BINARY_INDICATORS: frozenset[str] = frozenset(
    {
        "ma_stack_bull",
        "uptrend",
        "death_cross",
        "macd_bull_cross",
        "macd_bear_cross",
        "bb_squeeze",
        "bb_breakout_down",
        "breakout_20d",
        "breakout_52w",
        "breakdown_20d",
        "breakdown_52w",
        "hammer",
        "bull_engulfing",
        "bear_engulfing",
        "shooting_star",
    }
)

#: All 38 indicator field names, in computation order.
INDICATORS: tuple[str, ...] = (
    "ma_5",
    "ma_20",
    "ma_50",
    "ma_200",
    "ma_stack_bull",
    "uptrend",
    "death_cross",
    "ma_20_slope",
    "dist_ma_20",
    "dist_ma_200",
    "rsi_14",
    "macd_hist",
    "macd_bull_cross",
    "macd_bear_cross",
    "roc_20d",
    "atr_14",
    "atr_pct",
    "bb_width",
    "bb_squeeze",
    "bb_breakout_down",
    "vol_ma_20",
    "vol_zscore",
    "obv",
    "obv_ma_20",
    "high_20",
    "high_52w",
    "dist_52w_high",
    "breakout_20d",
    "breakout_52w",
    "low_20",
    "low_52w",
    "dist_52w_low",
    "breakdown_20d",
    "breakdown_52w",
    "hammer",
    "bull_engulfing",
    "bear_engulfing",
    "shooting_star",
)

NUMERIC_INDICATORS: frozenset[str] = frozenset(INDICATORS) - BINARY_INDICATORS


@dataclass(slots=True)
class OHLCV:
    """Adjusted OHLCV series for a single symbol (oldest -> newest)."""

    time: list[str]
    open: FloatArray
    high: FloatArray
    low: FloatArray
    close: FloatArray
    volume: FloatArray

    def __len__(self) -> int:
        return len(self.close)

    @classmethod
    def from_records(cls, records: list[dict]) -> OHLCV:
        """Build from a list of ``{time, open, high, low, close, volume}`` dicts."""
        n = len(records)
        o = np.empty(n, dtype=np.float64)
        h = np.empty(n, dtype=np.float64)
        low = np.empty(n, dtype=np.float64)
        c = np.empty(n, dtype=np.float64)
        v = np.empty(n, dtype=np.float64)
        times: list[str] = []
        for i, r in enumerate(records):
            times.append(str(r["time"]))
            o[i] = float(r["open"])
            h[i] = float(r["high"])
            low[i] = float(r["low"])
            c[i] = float(r["close"])
            v[i] = float(r["volume"])
        return cls(time=times, open=o, high=h, low=low, close=c, volume=v)


# ── Rolling / smoothing helpers (nan-aware) ──────────────────────────────────


def _nan(n: int) -> FloatArray:
    return np.full(n, np.nan, dtype=np.float64)


def _shift(x: FloatArray, k: int) -> FloatArray:
    """Shift forward by ``k`` (value at ``t`` becomes ``x[t-k]``), nan-filled."""
    out = _nan(len(x))
    if 0 <= k < len(x):
        out[k:] = x[: len(x) - k]
    return out


def _roll_mean(x: FloatArray, n: int) -> FloatArray:
    """Rolling mean over ``n``; window containing any nan -> nan."""
    length = len(x)
    out = _nan(length)
    if length < n:
        return out
    nan_mask = np.isnan(x)
    xz = np.where(nan_mask, 0.0, x)
    csum = np.cumsum(np.insert(xz, 0, 0.0))
    window_sum = csum[n:] - csum[:-n]
    cnt = np.cumsum(np.insert(nan_mask.astype(np.int64), 0, 0))
    nan_in_window = cnt[n:] - cnt[:-n]
    valid = nan_in_window == 0
    res = out[n - 1 :]
    res[valid] = window_sum[valid] / n
    return out


def _roll_std(x: FloatArray, n: int) -> FloatArray:
    """Rolling sample standard deviation (ddof=1) over ``n``."""
    if len(x) < n:
        return _nan(len(x))
    mean = _roll_mean(x, n)
    mean_sq = _roll_mean(x * x, n)
    var_pop = mean_sq - mean * mean
    var_pop = np.where(var_pop < 0, 0.0, var_pop)  # guard fp noise
    var_sample = var_pop * (n / (n - 1))
    return np.sqrt(var_sample)


def _roll_max(x: FloatArray, n: int) -> FloatArray:
    out = _nan(len(x))
    if len(x) >= n:
        windows = np.lib.stride_tricks.sliding_window_view(x, n)
        out[n - 1 :] = windows.max(axis=1)
    return out


def _roll_min(x: FloatArray, n: int) -> FloatArray:
    out = _nan(len(x))
    if len(x) >= n:
        windows = np.lib.stride_tricks.sliding_window_view(x, n)
        out[n - 1 :] = windows.min(axis=1)
    return out


def _roll_percentile(x: FloatArray, n: int, q: float) -> FloatArray:
    """Rolling ``q``-percentile over ``n``; window with any nan -> nan."""
    out = _nan(len(x))
    if len(x) < n:
        return out
    windows = np.lib.stride_tricks.sliding_window_view(x, n)
    valid = ~np.isnan(windows).any(axis=1)
    res = np.full(windows.shape[0], np.nan, dtype=np.float64)
    if valid.any():
        res[valid] = np.percentile(windows[valid], q, axis=1)
    out[n - 1 :] = res
    return out


def _ema(x: FloatArray, n: int) -> FloatArray:
    """EMA seeded with the SMA of the first ``n`` valid values (alpha=2/(N+1)).

    Handles a leading run of nan (e.g. an already-derived series like the MACD
    line): seeds at the first index where ``n`` consecutive valid values exist.
    """
    length = len(x)
    out = _nan(length)
    valid = ~np.isnan(x)
    if int(valid.sum()) < n:
        return out
    first = int(np.argmax(valid))  # first valid index (inputs are contiguous)
    seed_idx = first + n - 1
    if seed_idx >= length:
        return out
    out[seed_idx] = float(np.mean(x[first : first + n]))
    alpha = 2.0 / (n + 1.0)
    for t in range(seed_idx + 1, length):
        if np.isnan(x[t]):
            out[t] = out[t - 1]
        else:
            out[t] = alpha * x[t] + (1.0 - alpha) * out[t - 1]
    return out


def _binary(cond: NDArray[np.bool_], valid: NDArray[np.bool_]) -> FloatArray:
    """Materialize a boolean condition into 0/1 with nan where invalid."""
    out = _nan(len(cond))
    out[valid] = cond[valid].astype(np.float64)
    return out


# ── The engine ───────────────────────────────────────────────────────────────


def compute_indicators(data: OHLCV) -> dict[str, FloatArray]:
    """Compute all 38 indicators for ``data`` (oldest -> newest)."""
    close = data.close
    high = data.high
    low = data.low
    open_ = data.open
    volume = data.volume
    n = len(close)
    out: dict[str, FloatArray] = {}

    # ── Moving averages ──
    ma_5 = _roll_mean(close, 5)
    ma_20 = _roll_mean(close, 20)
    ma_50 = _roll_mean(close, 50)
    ma_200 = _roll_mean(close, 200)
    out["ma_5"] = ma_5
    out["ma_20"] = ma_20
    out["ma_50"] = ma_50
    out["ma_200"] = ma_200

    # ── Trend ──
    valid_stack = ~(np.isnan(ma_5) | np.isnan(ma_20) | np.isnan(ma_50) | np.isnan(ma_200))
    out["ma_stack_bull"] = _binary((ma_5 > ma_20) & (ma_20 > ma_50) & (ma_50 > ma_200), valid_stack)

    valid_ut = ~(np.isnan(ma_50) | np.isnan(ma_200))
    out["uptrend"] = _binary(ma_50 > ma_200, valid_ut)

    ma20_prev = _shift(ma_20, 1)
    ma50_prev = _shift(ma_50, 1)
    valid_dc = ~(np.isnan(ma_20) | np.isnan(ma_50) | np.isnan(ma20_prev) | np.isnan(ma50_prev))
    out["death_cross"] = _binary((ma_20 < ma_50) & (ma20_prev >= ma50_prev), valid_dc)

    ma20_lag10 = _shift(ma_20, 10)
    with np.errstate(divide="ignore", invalid="ignore"):
        out["ma_20_slope"] = (ma_20 - ma20_lag10) / ma20_lag10
        out["dist_ma_20"] = (close - ma_20) / ma_20
        out["dist_ma_200"] = (close - ma_200) / ma_200

    # ── Momentum ──
    out["rsi_14"] = _rsi(close, 14)
    macd_line, _signal, macd_hist = _macd(close, 12, 26, 9)
    out["macd_hist"] = macd_hist
    signal = _signal
    line_prev = _shift(macd_line, 1)
    sig_prev = _shift(signal, 1)
    valid_macd = ~(np.isnan(macd_line) | np.isnan(signal) | np.isnan(line_prev) | np.isnan(sig_prev))
    out["macd_bull_cross"] = _binary((macd_line > signal) & (line_prev <= sig_prev), valid_macd)
    out["macd_bear_cross"] = _binary((macd_line < signal) & (line_prev >= sig_prev), valid_macd)

    close_lag20 = _shift(close, 20)
    with np.errstate(divide="ignore", invalid="ignore"):
        out["roc_20d"] = (close - close_lag20) / close_lag20

    # ── Volatility ──
    atr_14 = _atr(high, low, close, 14)
    out["atr_14"] = atr_14
    with np.errstate(divide="ignore", invalid="ignore"):
        out["atr_pct"] = atr_14 / close

    std_20 = _roll_std(close, 20)
    bb_upper = ma_20 + 2.0 * std_20
    bb_lower = ma_20 - 2.0 * std_20
    with np.errstate(divide="ignore", invalid="ignore"):
        bb_width = (bb_upper - bb_lower) / ma_20
    out["bb_width"] = bb_width

    pct15 = _roll_percentile(bb_width, 120, 15.0)
    valid_sq = ~(np.isnan(bb_width) | np.isnan(pct15))
    out["bb_squeeze"] = _binary(bb_width <= pct15, valid_sq)

    lower_prev = _shift(bb_lower, 1)
    close_prev = _shift(close, 1)
    valid_bd = ~(np.isnan(bb_lower) | np.isnan(lower_prev) | np.isnan(close_prev))
    out["bb_breakout_down"] = _binary((close < bb_lower) & (close_prev >= lower_prev), valid_bd)

    # ── Volume ──
    vol_ma_20 = _roll_mean(volume, 20)
    out["vol_ma_20"] = vol_ma_20
    vol_std = _roll_std(volume, 20)
    with np.errstate(divide="ignore", invalid="ignore"):
        out["vol_zscore"] = (volume - vol_ma_20) / vol_std

    obv = _obv(close, volume)
    out["obv"] = obv
    out["obv_ma_20"] = _roll_mean(obv, 20)

    # ── Position (buy) ──
    high_20 = _roll_max(high, 20)
    high_52w = _roll_max(high, 252)
    out["high_20"] = high_20
    out["high_52w"] = high_52w
    with np.errstate(divide="ignore", invalid="ignore"):
        out["dist_52w_high"] = (close - high_52w) / high_52w

    out["breakout_20d"] = _breakout(close, high_20)
    out["breakout_52w"] = _breakout(close, high_52w)

    # ── Position (sell) ──
    low_20 = _roll_min(low, 20)
    low_52w = _roll_min(low, 252)
    out["low_20"] = low_20
    out["low_52w"] = low_52w
    with np.errstate(divide="ignore", invalid="ignore"):
        out["dist_52w_low"] = (close - low_52w) / low_52w

    out["breakdown_20d"] = _breakdown(close, low_20)
    out["breakdown_52w"] = _breakdown(close, low_52w)

    # ── Candlestick patterns ──
    body = np.abs(close - open_)
    upper_wick = high - np.maximum(close, open_)
    lower_wick = np.minimum(close, open_) - low
    close_lag5 = _shift(close, 5)
    with np.errstate(divide="ignore", invalid="ignore"):
        ret_5d = (close - close_lag5) / close_lag5
    valid_5 = ~np.isnan(close_lag5)
    out["hammer"] = _binary((lower_wick > 2.0 * body) & (upper_wick < body) & (ret_5d < -0.03), valid_5)
    out["shooting_star"] = _binary((upper_wick > 2.0 * body) & (lower_wick < body) & (ret_5d > 0.03), valid_5)

    open_prev = _shift(open_, 1)
    close_prev1 = _shift(close, 1)
    valid_1 = ~(np.isnan(open_prev) | np.isnan(close_prev1))
    out["bull_engulfing"] = _binary(
        (close_prev1 < open_prev) & (close > open_) & (close > open_prev) & (open_ < close_prev1),
        valid_1,
    )
    out["bear_engulfing"] = _binary(
        (close_prev1 > open_prev) & (close < open_) & (close < open_prev) & (open_ > close_prev1),
        valid_1,
    )

    # Ensure every declared indicator exists, length-consistent.
    for name in INDICATORS:
        if name not in out:  # pragma: no cover - guard against omissions
            out[name] = _nan(n)
    return out


# ── Indicator subroutines ────────────────────────────────────────────────────


def _rsi(close: FloatArray, period: int) -> FloatArray:
    """SMA-based RSI (per spec): gain/loss are simple means of clipped deltas."""
    n = len(close)
    out = _nan(n)
    if n < period + 1:
        return out
    deltas = np.diff(close)  # length n-1, aligned to bars 1..n-1
    gain = np.clip(deltas, 0.0, None)
    loss = np.clip(-deltas, 0.0, None)
    avg_gain = _roll_mean(gain, period)
    avg_loss = _roll_mean(loss, period)
    with np.errstate(divide="ignore", invalid="ignore"):
        rs = avg_gain / avg_loss
        rsi = 100.0 - 100.0 / (1.0 + rs)
    # loss == 0 (and gain defined) -> RSI 100
    zero_loss = (avg_loss == 0.0) & ~np.isnan(avg_gain)
    rsi = np.where(zero_loss, 100.0, rsi)
    out[1:] = rsi
    return out


def _macd(close: FloatArray, fast: int, slow: int, signal_period: int) -> tuple[FloatArray, FloatArray, FloatArray]:
    ema_fast = _ema(close, fast)
    ema_slow = _ema(close, slow)
    macd_line = ema_fast - ema_slow
    signal = _ema(macd_line, signal_period)
    hist = macd_line - signal
    return macd_line, signal, hist


def _atr(high: FloatArray, low: FloatArray, close: FloatArray, period: int) -> FloatArray:
    prev_close = _shift(close, 1)
    tr = np.maximum.reduce(
        [
            high - low,
            np.abs(high - prev_close),
            np.abs(low - prev_close),
        ]
    )
    # bar 0 has no previous close -> undefined TR
    tr[0] = np.nan
    return _roll_mean(tr, period)


def _obv(close: FloatArray, volume: FloatArray) -> FloatArray:
    n = len(close)
    obv = np.zeros(n, dtype=np.float64)
    for t in range(1, n):
        if close[t] > close[t - 1]:
            obv[t] = obv[t - 1] + volume[t]
        elif close[t] < close[t - 1]:
            obv[t] = obv[t - 1] - volume[t]
        else:
            obv[t] = obv[t - 1]
    return obv


def _breakout(close: FloatArray, rolling_high: FloatArray) -> FloatArray:
    """First-day breakout above the prior rolling high."""
    high_prev = _shift(rolling_high, 1)
    high_prev2 = _shift(rolling_high, 2)
    close_prev = _shift(close, 1)
    valid = ~(np.isnan(high_prev) | np.isnan(high_prev2) | np.isnan(close_prev))
    cond = (close >= high_prev) & (close_prev < high_prev2)
    return _binary(cond, valid)


def _breakdown(close: FloatArray, rolling_low: FloatArray) -> FloatArray:
    """First-day breakdown below the prior rolling low."""
    low_prev = _shift(rolling_low, 1)
    low_prev2 = _shift(rolling_low, 2)
    close_prev = _shift(close, 1)
    valid = ~(np.isnan(low_prev) | np.isnan(low_prev2) | np.isnan(close_prev))
    cond = (close <= low_prev) & (close_prev > low_prev2)
    return _binary(cond, valid)


# ── Latest-bar convenience (for alerts / message context) ────────────────────


def latest_indicator_values(frame: dict[str, FloatArray]) -> dict[str, float | None]:
    """Return the most-recent bar's value per indicator (``None`` if nan/empty)."""
    result: dict[str, float | None] = {}
    for name in INDICATORS:
        arr = frame.get(name)
        if arr is None or len(arr) == 0:
            result[name] = None
            continue
        val = arr[-1]
        result[name] = None if np.isnan(val) else float(val)
    return result
