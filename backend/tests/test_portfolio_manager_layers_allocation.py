import math
import datetime as dt
from app.services.ai.portfolio_manager import layers as L
from app.services.ai.portfolio_manager.inputs import Holding, PortfolioInputs


def _inp(weights):
    h = [Holding(t, 0, 0, 0, sec, mv, 0, mv) for (t, sec, mv) in
         [("TCB", "Ngân hàng", 100_000_000), ("MBB", "Ngân hàng", 84_000_000),
          ("HPG", "Thép", 85_000_000)]]
    return PortfolioInputs(nav=534_000_000, cash=0, holdings=h, benchmark_closes=[],
                           sector_weights=weights, inception_date=None, trades=[], as_of=dt.date(2026, 6, 23))


def test_allocation_matches_benchmark_by_normalized_name():
    inp = _inp({"Ngân hàng": 0.38, "Thép": 0.05})
    out = L.layer_allocation(inp)
    nh = next(r for r in out if r["sector"] == "Ngân hàng")
    assert math.isclose(nh["weight"], 184_000_000 / 534_000_000, abs_tol=1e-3)
    assert math.isclose(nh["benchmark"], 0.38, abs_tol=1e-9)
    assert nh["active"] is not None


def test_allocation_degrades_when_no_benchmark():
    inp = _inp({})  # no VN-Index sector weights available
    out = L.layer_allocation(inp)
    assert all(r["benchmark"] is None and r["active"] is None for r in out)
