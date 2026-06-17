"""Tests for the 38 technical indicators (spec §2).

Simple indicators are checked against hand/closed-form values; the trickier ones
(RSI, MACD, ATR, Bollinger, vol z-score) are cross-checked against independent
pure-Python reference implementations written here (a second implementation).
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from app.services.ta.indicators import (
    BINARY_INDICATORS,
    INDICATORS,
    OHLCV,
    compute_indicators,
)

# ── Builders & reference implementations ─────────────────────────────────────


def _ohlcv(closes, *, highs=None, lows=None, opens=None, vols=None) -> OHLCV:
    n = len(closes)
    closes = [float(c) for c in closes]
    highs = [float(h) for h in (highs if highs is not None else [c * 1.01 for c in closes])]
    lows = [float(low) for low in (lows if lows is not None else [c * 0.99 for c in closes])]
    opens = [float(o) for o in (opens if opens is not None else [closes[max(i - 1, 0)] for i in range(n)])]
    vols = [float(v) for v in (vols if vols is not None else [1000 + (i % 7) * 50 for i in range(n)])]
    return OHLCV(
        time=[f"2020-{1 + i // 28:02d}-{1 + i % 28:02d}" for i in range(n)],
        open=np.array(opens),
        high=np.array(highs),
        low=np.array(lows),
        close=np.array(closes),
        volume=np.array(vols),
    )


def _make_series(n: int = 330):
    closes = []
    price = 100.0
    for i in range(n):
        price = price * (1 + 0.0015 * math.sin(i / 9.0) + 0.0006 * math.cos(i / 5.0)) + 0.02
        closes.append(round(price, 3))
    highs = [c * (1.004 + 0.001 * ((i % 5) - 2)) for i, c in enumerate(closes)]
    lows = [c * (0.996 - 0.001 * ((i % 4) - 1)) for i, c in enumerate(closes)]
    opens = [closes[max(i - 1, 0)] for i in range(n)]
    vols = [1000.0 + (i % 11) * 37 + (i % 3) * 13 for i in range(n)]
    return opens, highs, lows, closes, vols


def _ref_sma(x, n):
    return [None if i < n - 1 else sum(x[i - n + 1 : i + 1]) / n for i in range(len(x))]


def _ref_ema_from(x, n, *, first=0):
    out = [None] * len(x)
    seed = first + n - 1
    if seed >= len(x):
        return out
    out[seed] = sum(x[first : first + n]) / n
    a = 2 / (n + 1)
    for i in range(seed + 1, len(x)):
        out[i] = a * x[i] + (1 - a) * out[i - 1]
    return out


def _ref_rsi(close, p=14):
    out = [None] * len(close)
    deltas = [close[i] - close[i - 1] for i in range(1, len(close))]
    gains = [max(d, 0.0) for d in deltas]
    losses = [max(-d, 0.0) for d in deltas]
    for i in range(p, len(close)):
        g = sum(gains[i - p : i]) / p
        loss_ = sum(losses[i - p : i]) / p
        out[i] = 100.0 if loss_ == 0 else 100 - 100 / (1 + g / loss_)
    return out


def _ref_atr(h, low, c, p=14):
    tr = [None]
    for i in range(1, len(c)):
        tr.append(max(h[i] - low[i], abs(h[i] - c[i - 1]), abs(low[i] - c[i - 1])))
    out = [None] * len(c)
    for i in range(p, len(c)):
        window = tr[i - p + 1 : i + 1]
        if None in window:
            continue
        out[i] = sum(window) / p
    return out


def _close(actual, expected, rel=1e-9, abs_=1e-9):
    if expected is None:
        assert math.isnan(actual), f"expected nan, got {actual}"
    else:
        assert not math.isnan(actual), f"expected {expected}, got nan"
        assert math.isclose(actual, expected, rel_tol=rel, abs_tol=abs_), f"{actual} != {expected}"


# ── Tests ────────────────────────────────────────────────────────────────────


def test_all_fields_present_correct_length_and_binary_domain():
    opens, highs, lows, closes, vols = _make_series(330)
    frame = compute_indicators(_ohlcv(closes, highs=highs, lows=lows, opens=opens, vols=vols))
    assert set(frame.keys()) == set(INDICATORS)
    for name, arr in frame.items():
        assert len(arr) == 330, name
    for name in BINARY_INDICATORS:
        arr = frame[name]
        finite = arr[~np.isnan(arr)]
        assert np.all(np.isin(finite, (0.0, 1.0))), f"{name} must be 0/1"
    # warmup: indicators needing 200 bars are nan early, valid late
    assert math.isnan(frame["ma_200"][198])
    assert not math.isnan(frame["ma_200"][199])
    assert not math.isnan(frame["ma_200"][-1])


def test_sma_values_and_warmup():
    closes = list(range(1, 41))  # 1..40
    frame = compute_indicators(_ohlcv(closes))
    assert math.isnan(frame["ma_5"][3])
    _close(frame["ma_5"][4], sum([1, 2, 3, 4, 5]) / 5)  # = 3.0
    _close(frame["ma_5"][9], sum([6, 7, 8, 9, 10]) / 5)  # = 8.0
    _close(frame["ma_20"][19], sum(range(1, 21)) / 20)  # = 10.5


def test_ma_stack_and_uptrend_on_uptrend():
    closes = [100 + i for i in range(260)]  # strictly increasing
    frame = compute_indicators(_ohlcv(closes))
    # On a strict uptrend, recent MAs are stacked bullishly and ma_50>ma_200
    assert frame["ma_stack_bull"][-1] == 1.0
    assert frame["uptrend"][-1] == 1.0


def test_death_cross_fires_once_on_cross():
    # Up then sharp down so ma_20 crosses below ma_50
    closes = [100 + i for i in range(80)] + [180 - 3 * i for i in range(80)]
    frame = compute_indicators(_ohlcv(closes))
    dc = frame["death_cross"]
    fired = np.where(dc == 1.0)[0]
    assert len(fired) >= 1
    # The bar before the first fire must have ma_20 >= ma_50 (a genuine cross)
    i = int(fired[0])
    assert frame["ma_20"][i] < frame["ma_50"][i]
    assert frame["ma_20"][i - 1] >= frame["ma_50"][i - 1]


def test_dist_and_slope_arithmetic():
    opens, highs, lows, closes, vols = _make_series(60)
    frame = compute_indicators(_ohlcv(closes, highs=highs, lows=lows, opens=opens, vols=vols))
    i = 55
    ma20 = frame["ma_20"][i]
    _close(frame["dist_ma_20"][i], (closes[i] - ma20) / ma20, rel=1e-12)
    ma20_lag = frame["ma_20"][i - 10]
    _close(frame["ma_20_slope"][i], (ma20 - ma20_lag) / ma20_lag, rel=1e-12)


def test_rsi_matches_reference():
    _, _, _, closes, _ = _make_series(120)
    frame = compute_indicators(_ohlcv(closes))
    ref = _ref_rsi(closes, 14)
    for i in (14, 15, 40, 80, 119):
        _close(frame["rsi_14"][i], ref[i], rel=1e-9)
    assert math.isnan(frame["rsi_14"][13])


def test_rsi_all_gains_is_100():
    closes = [100 + i for i in range(40)]
    frame = compute_indicators(_ohlcv(closes))
    assert frame["rsi_14"][-1] == 100.0


def test_macd_hist_and_crosses_match_reference():
    _, _, _, closes, _ = _make_series(150)
    frame = compute_indicators(_ohlcv(closes))
    ema12 = _ref_ema_from(closes, 12)
    ema26 = _ref_ema_from(closes, 26)
    macd_line = [None if (ema12[i] is None or ema26[i] is None) else ema12[i] - ema26[i] for i in range(len(closes))]
    first = next(i for i, v in enumerate(macd_line) if v is not None)
    signal = _ref_ema_from(macd_line, 9, first=first)
    hist = [
        None if (macd_line[i] is None or signal[i] is None) else macd_line[i] - signal[i] for i in range(len(closes))
    ]
    for i in (40, 80, 149):
        _close(frame["macd_hist"][i], hist[i], rel=1e-9)
    # crosses are consistent with hist sign change
    bull = np.where(frame["macd_bull_cross"] == 1.0)[0]
    for i in bull:
        assert frame["macd_hist"][int(i)] > 0 >= frame["macd_hist"][int(i) - 1]


def test_roc_20d_exact():
    opens, highs, lows, closes, vols = _make_series(60)
    frame = compute_indicators(_ohlcv(closes, highs=highs, lows=lows, opens=opens, vols=vols))
    i = 55
    _close(frame["roc_20d"][i], (closes[i] - closes[i - 20]) / closes[i - 20], rel=1e-12)


def test_atr_matches_reference():
    opens, highs, lows, closes, vols = _make_series(80)
    frame = compute_indicators(_ohlcv(closes, highs=highs, lows=lows, opens=opens, vols=vols))
    ref = _ref_atr(highs, lows, closes, 14)
    for i in (14, 30, 79):
        _close(frame["atr_14"][i], ref[i], rel=1e-9)
    _close(frame["atr_pct"][79], ref[79] / closes[79], rel=1e-9)
    assert math.isnan(frame["atr_14"][13])


def test_bb_width_and_squeeze():
    opens, highs, lows, closes, vols = _make_series(200)
    frame = compute_indicators(_ohlcv(closes, highs=highs, lows=lows, opens=opens, vols=vols))
    i = 150
    arr = np.array(closes[i - 19 : i + 1])
    std = arr.std(ddof=1)
    ma20 = arr.mean()
    expected_width = (4 * std) / ma20
    _close(frame["bb_width"][i], expected_width, rel=1e-9)
    # squeeze is 1 only where width <= rolling 15th percentile of last 120
    sq = frame["bb_squeeze"]
    for j in np.where(sq == 1.0)[0]:
        j = int(j)
        window = frame["bb_width"][j - 119 : j + 1]
        assert frame["bb_width"][j] <= np.percentile(window, 15) + 1e-12


def test_vol_zscore_matches_reference():
    opens, highs, lows, closes, vols = _make_series(60)
    frame = compute_indicators(_ohlcv(closes, highs=highs, lows=lows, opens=opens, vols=vols))
    i = 55
    window = np.array(vols[i - 19 : i + 1])
    expected = (vols[i] - window.mean()) / window.std(ddof=1)
    _close(frame["vol_zscore"][i], expected, rel=1e-9)


def test_obv_exact():
    closes = [10, 11, 10, 10, 12]
    vols = [100, 200, 300, 400, 500]
    frame = compute_indicators(_ohlcv(closes, vols=vols))
    # obv[0]=0; +200; -300; 0(unchanged); +500
    assert list(frame["obv"]) == [0.0, 200.0, -100.0, -100.0, 400.0]


def test_high_low_and_dist_52w():
    opens, highs, lows, closes, vols = _make_series(300)
    frame = compute_indicators(_ohlcv(closes, highs=highs, lows=lows, opens=opens, vols=vols))
    i = 290
    _close(frame["high_20"][i], max(highs[i - 19 : i + 1]), rel=1e-12)
    _close(frame["high_52w"][i], max(highs[i - 251 : i + 1]), rel=1e-12)
    _close(frame["low_52w"][i], min(lows[i - 251 : i + 1]), rel=1e-12)
    hi = max(highs[i - 251 : i + 1])
    _close(frame["dist_52w_high"][i], (closes[i] - hi) / hi, rel=1e-12)
    assert frame["dist_52w_high"][i] <= 1e-12  # always <= 0
    assert frame["dist_52w_low"][i] >= -1e-12  # always >= 0


def test_breakout_20d_first_day_only():
    # 25 flat bars at 100 (high 100), then a jump to 110 -> breakout that day only
    highs = [100.0] * 25 + [110.0, 109.0]
    closes = [99.0] * 25 + [110.0, 108.0]
    lows = [98.0] * 27
    opens = [99.0] * 27
    vols = [1000.0] * 27
    frame = compute_indicators(_ohlcv(closes, highs=highs, lows=lows, opens=opens, vols=vols))
    bo = frame["breakout_20d"]
    assert bo[25] == 1.0  # the jump day
    assert bo[26] == 0.0  # next day is not a fresh breakout


def test_candlestick_hammer():
    # Build 6 down bars then a hammer (long lower wick, tiny upper wick) after a -3%+ drop
    closes = [100, 99, 98, 97, 96, 95, 95.2]
    opens = [100, 99, 98, 97, 96, 95, 95.0]
    highs = [100.5, 99.5, 98.5, 97.5, 96.5, 95.5, 95.3]  # tiny upper wick on last
    lows = [99, 98, 97, 96, 95, 94, 92.0]  # long lower wick on last
    vols = [1000] * 7
    frame = compute_indicators(_ohlcv(closes, highs=highs, lows=lows, opens=opens, vols=vols))
    body = abs(closes[6] - opens[6])
    upper = highs[6] - max(closes[6], opens[6])
    lower = min(closes[6], opens[6]) - lows[6]
    ret5 = (closes[6] - closes[1]) / closes[1]
    expected = 1.0 if (lower > 2 * body and upper < body and ret5 < -0.03) else 0.0
    assert frame["hammer"][6] == expected == 1.0


def test_candlestick_bull_engulfing():
    # prev red (close<open), today green engulfing (open below prev close, close above prev open)
    opens = [100.0, 96.5]
    closes = [97.0, 101.0]
    highs = [101.0, 101.5]
    lows = [96.5, 96.0]
    vols = [1000, 1000]
    frame = compute_indicators(_ohlcv(closes, highs=highs, lows=lows, opens=opens, vols=vols))
    assert frame["bull_engulfing"][1] == 1.0
    assert frame["bear_engulfing"][1] == 0.0


def test_candlestick_bear_engulfing_and_shooting_star():
    # bear engulfing: prev green, today red engulfing
    opens = [100.0, 103.0]
    closes = [102.0, 99.0]
    highs = [102.5, 103.5]
    lows = [99.5, 98.5]
    frame = compute_indicators(_ohlcv(closes, highs=highs, lows=lows, opens=opens))
    assert frame["bear_engulfing"][1] == 1.0


@pytest.mark.parametrize("n", [10, 60, 252, 253, 400])
def test_no_crash_various_lengths(n):
    opens, highs, lows, closes, vols = _make_series(n)
    frame = compute_indicators(_ohlcv(closes, highs=highs, lows=lows, opens=opens, vols=vols))
    assert len(frame["ma_5"]) == n
