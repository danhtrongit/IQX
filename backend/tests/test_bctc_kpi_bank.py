from __future__ import annotations

import math

from app.services.bctc.statements import Period
from app.services.bctc import kpi_bank as kb


def _p(year: int, **values: float) -> Period:
    return Period(year=year, length=5, values=values)


def test_nim_uses_average_earning_assets() -> None:
    # earning_assets is now derived from components; use customer_loans as the sole component.
    cur = _p(2025, net_interest_income=35.0, customer_loans=1100.0)
    prev = _p(2024, customer_loans=900.0)
    assert math.isclose(kb.nim(cur, prev), 0.035)


def test_ldr() -> None:
    p = _p(2025, customer_loans=800.0, customer_deposits=1000.0)
    assert math.isclose(kb.ldr(p), 0.8)


def test_equity_ratio() -> None:
    p = _p(2025, equity=90.0, total_assets=1000.0)
    assert math.isclose(kb.equity_ratio(p), 0.09)


def test_llr_loans_uses_absolute_reserve() -> None:
    p = _p(2025, loan_loss_reserve=-20.0, customer_loans=800.0)
    assert math.isclose(kb.llr_loans(p), 0.025)


def test_cir() -> None:
    p = _p(2025, operating_expense=35.0, total_operating_income=100.0)
    assert math.isclose(kb.cir(p), 0.35)


def test_roe_bank_average_equity() -> None:
    cur, prev = _p(2025, npat=24.0, equity=110.0), _p(2024, equity=90.0)
    assert math.isclose(kb.roe(cur, prev), 0.24)
