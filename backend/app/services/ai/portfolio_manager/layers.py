"""Quant layers 01–08 (spec §2). Each function is pure: inputs in, one Analysis-JSON section out."""

from __future__ import annotations

from .inputs import Holding, PortfolioInputs
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
