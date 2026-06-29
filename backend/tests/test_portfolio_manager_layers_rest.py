import math
import datetime as dt
from app.services.ai.portfolio_manager import layers as L
from app.services.ai.portfolio_manager.inputs import Holding, PortfolioInputs


def _inp():
    h = [
        Holding("HPG", 1, 1, 1, "Thép", 100, 38_000_000, 100, pe=9.8, pb=1.4, roe=0.16, dividend=0.02),
        Holding("VND", 1, 1, 1, "CK", 100, -7_000_000, 47_000_000, pe=15.0, pb=1.1, roe=0.08, dividend=0.0),
    ]
    return PortfolioInputs(nav=200, cash=0, holdings=h, benchmark_closes=[], sector_weights={},
                           inception_date=None, trades=[], as_of=dt.date(2026, 6, 23))


def test_attribution_pct_sums_to_one_ish():
    out = L.layer_attribution(_inp())
    total = sum(r["pnl"] for r in out)
    assert total == 31_000_000
    hpg = next(r for r in out if r["ticker"] == "HPG")
    assert math.isclose(hpg["pct"], 38_000_000 / 31_000_000, abs_tol=1e-3)


def test_quality_weighted_pe():
    out = L.layer_quality(_inp())
    assert out["pe"] is not None and out["roe"] is not None
    assert out["sector_benchmark"] is None


def test_behavior_losing_count_and_worst_loser():
    out = L.layer_behavior(_inp())
    assert out["losing_count"] == 1
    assert out["worst_loser"]["ticker"] == "VND"
