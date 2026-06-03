from __future__ import annotations

import math

from app.services.bctc.statements import Period
from app.services.bctc import kpi_bank as kb
from app.services.bctc import kpi_bank_modules as bm


def _p(year, **v):
    return Period(year=year, length=5, values=v)


def test_earning_assets_sum() -> None:
    p = _p(2025, deposits_at_sbv=10.0, deposits_at_other_ci=20.0, trading_securities=5.0,
           customer_loans=100.0, investment_securities=15.0)
    assert math.isclose(kb.earning_assets(p), 150.0)


def test_ibl_sum() -> None:
    p = _p(2025, govt_sbv_borrowings=5.0, ci_deposits_borrowings=15.0,
           customer_deposits=100.0, valuable_papers=10.0)
    assert math.isclose(kb.interest_bearing_liabilities(p), 130.0)


def test_nim_uses_derived_earning_assets() -> None:
    cur = _p(2025, net_interest_income=35.0, customer_loans=900.0, investment_securities=100.0,
             deposits_at_sbv=0.0, deposits_at_other_ci=0.0, trading_securities=0.0)
    prev = _p(2024, customer_loans=800.0, investment_securities=100.0)
    assert math.isclose(kb.nim(cur, prev), 35.0 / 950.0)


def test_nim_decomposition_uses_derived() -> None:
    cur = _p(2025, interest_income_gross=80.0, interest_expense=45.0,
             customer_loans=1000.0, customer_deposits=950.0)
    prev = _p(2024, customer_loans=1000.0, customer_deposits=950.0)
    d = bm.nim_decomposition(cur, prev)
    assert math.isclose(d["yield_ea"], 80.0 / 1000.0)
    assert math.isclose(d["cost_of_funds"], 45.0 / 950.0)
