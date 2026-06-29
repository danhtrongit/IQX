"""Quant layers 01–08 (spec §2). Each function is pure: inputs in, one Analysis-JSON section out."""

from __future__ import annotations

from itertools import combinations

from .data_confidence import evaluate_confidence
from .inputs import Holding, PortfolioInputs, normalize_sector_name
from . import returns as R


def _r3(x: float | None) -> float | None:
    return None if x is None else round(float(x), 3)


def _weight(h: Holding, nav: int) -> float:
    return h.market_value / nav if nav else 0.0


def layer_overview(inp: PortfolioInputs, low_conf: dict[str, bool], holding_months: int) -> dict:
    positions = [
        {
            "ticker": h.ticker,
            "sector": h.sector,
            "weight": _r3(_weight(h, inp.nav)),
            "pnl": h.unrealized_pnl,
            "low_confidence": bool(low_conf.get(h.ticker, False)),
        }
        for h in inp.holdings
    ]
    total_pnl = sum(h.unrealized_pnl for h in inp.holdings)
    total_cost = sum(h.cost_basis for h in inp.holdings)
    return {
        "nav": inp.nav,
        "cash_pct": _r3(inp.cash / inp.nav if inp.nav else 0.0),
        "n_positions": len(inp.holdings),
        "total_return": _r3(total_pnl / total_cost if total_cost else 0.0),
        "total_pnl": total_pnl,
        "holding_months": holding_months,
        "positions": positions,
    }


def layer_concentration(inp: PortfolioInputs) -> dict:
    weights = [_weight(h, inp.nav) for h in inp.holdings]
    weights_sorted = sorted(weights, reverse=True)
    hhi = sum(w * w for w in weights)
    sector_w: dict[str, float] = {}
    for h in inp.holdings:
        sector_w[h.sector] = sector_w.get(h.sector, 0.0) + _weight(h, inp.nav)
    return {
        "top1": _r3(weights_sorted[0]) if weights_sorted else 0.0,
        "top3": _r3(sum(weights_sorted[:3])),
        "effective_n": _r3(1.0 / hhi) if hhi > 0 else 0.0,
        "largest_sector": _r3(max(sector_w.values())) if sector_w else 0.0,
    }


def layer_performance(inp: PortfolioInputs, *, nav_series: list[float] | None = None) -> dict:
    total_pnl = sum(h.unrealized_pnl for h in inp.holdings)
    total_cost = sum(h.cost_basis for h in inp.holdings)
    portfolio_return = total_pnl / total_cost if total_cost else 0.0

    bench = inp.benchmark_closes
    benchmark_return = (bench[-1] / bench[0] - 1.0) if len(bench) >= 2 and bench[0] else 0.0

    dd_source = nav_series if nav_series else bench
    mdd = R.max_drawdown(dd_source) if dd_source else 0.0

    return {
        "portfolio_return": _r3(portfolio_return),
        "benchmark_return": _r3(benchmark_return),
        "excess_return": _r3(portfolio_return - benchmark_return),
        "max_drawdown": _r3(mdd),
        "method": "simple_inception",
    }


def layer_allocation(inp: PortfolioInputs) -> list[dict]:
    by_sector: dict[str, float] = {}
    for h in inp.holdings:
        by_sector[h.sector] = by_sector.get(h.sector, 0.0) + _weight(h, inp.nav)

    bench_by_norm = {normalize_sector_name(k): v for k, v in inp.sector_weights.items()}

    rows = []
    for sector, weight in by_sector.items():
        bench = bench_by_norm.get(normalize_sector_name(sector))
        rows.append({
            "sector": sector,
            "weight": _r3(weight),
            "benchmark": _r3(bench) if bench is not None else None,
            "active": _r3(weight - bench) if bench is not None else None,
        })
    rows.sort(key=lambda r: r["weight"], reverse=True)
    return rows


def layer_risk(inp: PortfolioInputs) -> tuple[dict, dict[str, bool]]:
    low_conf: dict[str, bool] = {}
    confident: list[Holding] = []
    excluded: list[dict] = []
    for h in inp.holdings:
        ok, reason = evaluate_confidence(
            [{"close": c, "volume": v} for c, v in zip(h.closes, h.volumes, strict=False)]
        )
        low_conf[h.ticker] = not ok
        if ok:
            confident.append(h)
        else:
            excluded.append({"ticker": h.ticker, "reason": reason})

    bench_returns = R.daily_returns(inp.benchmark_closes)
    per_returns = {h.ticker: R.daily_returns(h.closes) for h in confident}

    series_lengths = [len(bench_returns)] + [len(r) for r in per_returns.values()]
    n = min(series_lengths) if series_lengths else 0
    if n < 2 or len(confident) < 1:
        return ({"beta": 0.0, "volatility": 0.0, "tracking_error": 0.0,
                 "correlation": [], "excluded": excluded}, low_conf)

    bench_returns = bench_returns[-n:]
    for t in per_returns:
        per_returns[t] = per_returns[t][-n:]

    total_mv = sum(h.market_value for h in confident) or 1
    weights = {h.ticker: h.market_value / total_mv for h in confident}
    port_returns = [
        sum(weights[t] * per_returns[t][i] for t in per_returns) for i in range(n)
    ]

    beta = R.beta(port_returns, bench_returns)
    vol = R.annualized_vol(port_returns)
    te_series = [port_returns[i] - bench_returns[i] for i in range(n)]
    tracking_error = R.annualized_vol(te_series)

    corr = []
    for a, b in combinations(sorted(per_returns), 2):
        corr.append({"a": a, "b": b, "value": _r3(R.correlation(per_returns[a], per_returns[b]))})

    return ({"beta": _r3(beta), "volatility": _r3(vol), "tracking_error": _r3(tracking_error),
             "correlation": corr, "excluded": excluded}, low_conf)
