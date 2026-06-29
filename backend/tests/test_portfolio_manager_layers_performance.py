import math
import datetime as dt
from app.services.ai.portfolio_manager import layers as L
from app.services.ai.portfolio_manager.inputs import Holding, PortfolioInputs


def _inp(bench):
    h = Holding("HPG", 4000, 19500, 21360, "Thép", 110_000_000, 10_000_000, 100_000_000)
    return PortfolioInputs(nav=534_000_000, cash=0, holdings=[h], benchmark_closes=bench,
                           sector_weights={}, inception_date=dt.date(2025, 11, 1), trades=[],
                           as_of=dt.date(2026, 6, 23))


def test_performance_excess_return():
    inp = _inp(bench=[1000.0, 1072.0])  # +7.2%
    out = L.layer_performance(inp, nav_series=[100.0, 120.0, 90.0, 110.0])
    assert math.isclose(out["portfolio_return"], 0.10, abs_tol=1e-3)   # 10M/100M
    assert math.isclose(out["benchmark_return"], 0.072, abs_tol=1e-3)
    assert math.isclose(out["excess_return"], 0.028, abs_tol=1e-3)
    assert math.isclose(out["max_drawdown"], -0.25, abs_tol=1e-3)
    assert out["method"] == "simple_inception"
