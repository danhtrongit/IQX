"""Pure risk/return math. numpy-backed; degenerate inputs return 0.0, never raise."""

from __future__ import annotations

import numpy as np

from .config import ANNUALIZE_FACTOR


def daily_returns(closes: list[float]) -> list[float]:
    if len(closes) < 2:
        return []
    arr = np.asarray(closes, dtype=float)
    prev = arr[:-1]
    with np.errstate(divide="ignore", invalid="ignore"):
        r = np.where(prev != 0, arr[1:] / prev - 1.0, 0.0)
    return [float(x) for x in r]


def stdev(xs: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    return float(np.std(np.asarray(xs, dtype=float), ddof=1))


def annualized_vol(returns: list[float], factor: int = ANNUALIZE_FACTOR) -> float:
    s = stdev(returns)
    return float(s * np.sqrt(factor))


def beta(asset_returns: list[float], market_returns: list[float]) -> float:
    n = min(len(asset_returns), len(market_returns))
    if n < 2:
        return 0.0
    a = np.asarray(asset_returns[-n:], dtype=float)
    m = np.asarray(market_returns[-n:], dtype=float)
    var_m = float(np.var(m, ddof=1))
    if var_m == 0.0:
        return 0.0
    cov = float(np.cov(a, m, ddof=1)[0, 1])
    return cov / var_m


def correlation(a: list[float], b: list[float]) -> float:
    n = min(len(a), len(b))
    if n < 2:
        return 0.0
    x = np.asarray(a[-n:], dtype=float)
    y = np.asarray(b[-n:], dtype=float)
    if np.std(x) == 0.0 or np.std(y) == 0.0:
        return 0.0
    return float(np.corrcoef(x, y)[0, 1])


def max_drawdown(closes: list[float]) -> float:
    if len(closes) < 2:
        return 0.0
    arr = np.asarray(closes, dtype=float)
    running_max = np.maximum.accumulate(arr)
    with np.errstate(divide="ignore", invalid="ignore"):
        dd = np.where(running_max != 0, arr / running_max - 1.0, 0.0)
    return float(dd.min())
