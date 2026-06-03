from __future__ import annotations

import math

from app.services.bctc.statements import Period
from app.services.bctc import kpi_bank_modules as bm


def _p(year: int, **v: float) -> Period:
    return Period(year=year, length=5, values=v)


def test_toi_mix() -> None:
    p = _p(2025, total_operating_income=100.0, net_interest_income=75.0, net_fee_income=15.0)
    mix = bm.toi_mix(p)
    assert math.isclose(mix["nii_pct"], 0.75)
    assert math.isclose(mix["fee_pct"], 0.15)


def test_nim_decomposition() -> None:
    cur = _p(2025, interest_income_gross=80.0, interest_expense=45.0,
             earning_assets=1100.0, interest_bearing_liabilities=1050.0)
    prev = _p(2024, earning_assets=900.0, interest_bearing_liabilities=950.0)
    d = bm.nim_decomposition(cur, prev)
    assert math.isclose(d["yield_ea"], 0.08)
    assert math.isclose(d["cost_of_funds"], 0.045)
    assert math.isclose(d["spread"], 0.035)


def test_ppop_cor() -> None:
    cur = _p(2025, total_operating_income=100.0, operating_expense=35.0,
             provision_expense=10.0, customer_loans=1100.0)
    prev = _p(2024, customer_loans=900.0)
    r = bm.ppop_cor(cur, prev)
    assert math.isclose(r["ppop"], 65.0)
    assert math.isclose(r["cir"], 0.35)
    assert math.isclose(r["provision_ppop"], 10.0 / 65.0)
    assert math.isclose(r["cost_of_risk"], 10.0 / 1000.0)
