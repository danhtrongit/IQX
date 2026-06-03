from __future__ import annotations

import math

from app.services.bctc.statements import Period
from app.services.bctc.dupont import dupont


def _p(year: int, **v: float) -> Period:
    return Period(year=year, length=5, values=v)


def test_dupont_five_drivers_and_roe() -> None:
    cur = _p(2025, npat=87.0, profit_before_tax=100.0, operating_profit=120.0,
             net_revenue=600.0, total_assets=720.0, equity=400.0)
    prev = _p(2024, total_assets=680.0, equity=360.0)
    d = dupont(cur, prev)
    assert math.isclose(d["tax_burden"], 0.87)
    assert math.isclose(d["interest_burden"], 100/120)
    assert math.isclose(d["op_margin"], 0.20)
    assert math.isclose(d["asset_turnover"], 600/700)
    assert math.isclose(d["equity_multiplier"], 700/380)
    prod = 0.87 * (100/120) * 0.20 * (600/700) * (700/380)
    assert math.isclose(d["roe"], prod, rel_tol=1e-9)


def test_dupont_none_on_missing() -> None:
    d = dupont(_p(2025, npat=87.0), None)
    assert d["roe"] is None
