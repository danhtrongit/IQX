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
    # Degrade only when there is no usable data at all (0 confident holdings or <2 return points).
    # A SINGLE confident holding intentionally still yields a real single-asset beta/volatility —
    # zeroing it here would feed beta=0 into the risk-pillar score and mislabel the book as max-risk.
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


def layer_attribution(inp: PortfolioInputs) -> list[dict]:
    total = sum(h.unrealized_pnl for h in inp.holdings)
    rows = [
        {"ticker": h.ticker, "pnl": h.unrealized_pnl,
         "pct": _r3(h.unrealized_pnl / total) if total else None}
        for h in inp.holdings
    ]
    rows.sort(key=lambda r: abs(r["pnl"]), reverse=True)
    return rows


def _weighted(inp: PortfolioInputs, attr: str) -> float | None:
    pairs = [(h, getattr(h, attr)) for h in inp.holdings if getattr(h, attr) is not None]
    total_mv = sum(h.market_value for h, _ in pairs)
    if total_mv <= 0:
        return None
    return sum((h.market_value / total_mv) * v for h, v in pairs)


def layer_quality(inp: PortfolioInputs) -> dict:
    return {
        "pe": _r3(_weighted(inp, "pe")),
        "pb": _r3(_weighted(inp, "pb")),
        "roe": _r3(_weighted(inp, "roe")),
        "dividend": _r3(_weighted(inp, "dividend")),
        "sector_benchmark": None,  # merged by orchestrator (needs per-stock returns)
    }


def layer_behavior(inp: PortfolioInputs) -> dict:
    avg_holding_days = _avg_holding_days(inp.trades)
    losers = [h for h in inp.holdings if h.unrealized_pnl < 0]
    worst = None
    if losers:
        w = min(losers, key=lambda h: (h.unrealized_pnl / h.cost_basis) if h.cost_basis else 0.0)
        worst = {
            "ticker": w.ticker,
            "pnl_pct": _r3(w.unrealized_pnl / w.cost_basis) if w.cost_basis else None,
            "periods_held": 1,  # overwritten by orchestrator from snapshot history
        }
    return {
        "avg_holding_days": avg_holding_days,
        "losing_count": len(losers),
        "disposition_flag": _disposition_flag(inp.trades),
        "worst_loser": worst,
    }


def _avg_holding_days(trades) -> int:
    # FIFO match BUY->SELL per symbol; average (sell_date - buy_date) in days over closed legs.
    from collections import defaultdict, deque
    buys: dict[str, deque] = defaultdict(deque)
    spans: list[float] = []
    for t in sorted(trades, key=lambda x: x.traded_at):
        side = str(t.side)
        if side.endswith("buy"):
            buys[t.symbol].extend([t.traded_at] * t.quantity)
        elif side.endswith("sell"):
            for _ in range(t.quantity):
                if buys[t.symbol]:
                    bt = buys[t.symbol].popleft()
                    spans.append((t.traded_at - bt).days)
    return int(round(sum(spans) / len(spans))) if spans else 0


def _disposition_flag(trades) -> bool:
    # avg holding days of SOLD winners vs (proxy) sold losers; flag if losers held >=1.5x longer.
    from collections import defaultdict, deque
    buys: dict[str, deque] = defaultdict(deque)
    winner_days: list[float] = []
    loser_days: list[float] = []
    for t in sorted(trades, key=lambda x: x.traded_at):
        side = str(t.side)
        if side.endswith("buy"):
            buys[t.symbol].extend([(t.traded_at, t.price_vnd)] * t.quantity)
        elif side.endswith("sell"):
            for _ in range(t.quantity):
                if buys[t.symbol]:
                    bt, bp = buys[t.symbol].popleft()
                    days = (t.traded_at - bt).days
                    (winner_days if t.price_vnd >= bp else loser_days).append(days)
    if not winner_days or not loser_days:
        return False
    avg_w = sum(winner_days) / len(winner_days)
    avg_l = sum(loser_days) / len(loser_days)
    return avg_l > avg_w * 1.5
