import math
from app.services.ai.portfolio_manager import layers as L
from app.services.ai.portfolio_manager.inputs import Holding, PortfolioInputs
import datetime as dt


def _inp():
    # NAV 534M, cash 49.1M (≈9.2%); HPG mv 85.44M (16.0%), TCB 99.86M (18.7%)
    holdings = [
        Holding("HPG", 4000, 19500, 21360, "Thép", 85_440_000, 38_000_000, 47_440_000),
        Holding("TCB", 0, 0, 0, "Ngân hàng", 99_858_000, 9_000_000, 90_858_000),
    ]
    return PortfolioInputs(nav=534_000_000, cash=49_100_000, holdings=holdings,
                           benchmark_closes=[], sector_weights={}, inception_date=dt.date(2025, 11, 1),
                           trades=[], as_of=dt.date(2026, 6, 23))


def test_overview_weights_and_cash():
    out = L.layer_overview(_inp(), low_conf={"HPG": False, "TCB": False}, holding_months=7)
    assert math.isclose(out["cash_pct"], 49_100_000 / 534_000_000, abs_tol=1e-4)
    assert out["n_positions"] == 2
    assert out["holding_months"] == 7
    hpg = next(p for p in out["positions"] if p["ticker"] == "HPG")
    assert math.isclose(hpg["weight"], 85_440_000 / 534_000_000, abs_tol=1e-4)
    assert hpg["low_confidence"] is False


def test_concentration_hhi_and_effective_n():
    out = L.layer_concentration(_inp())
    # top1 = TCB weight ≈ 99.858M / 534M ≈ 0.187
    assert math.isclose(out["top1"], 99_858_000 / 534_000_000, abs_tol=1e-3)
    # hhi = (85.44M/534M)^2 + (99.858M/534M)^2 ; effective_n = 1/hhi
    expected_hhi = (85_440_000 / 534_000_000) ** 2 + (99_858_000 / 534_000_000) ** 2
    assert math.isclose(out["effective_n"], 1.0 / expected_hhi, abs_tol=1e-2)
    assert out["effective_n"] > 1.0
