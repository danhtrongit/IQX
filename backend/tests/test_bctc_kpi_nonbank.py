from __future__ import annotations

import math

from app.services.bctc.statements import Period
from app.services.bctc import kpi_nonbank as k


def _p(year: int, **values: float) -> Period:
    return Period(year=year, length=5, values=values)


def test_revenue_growth() -> None:
    cur, prev = _p(2025, net_revenue=200.0), _p(2024, net_revenue=160.0)
    assert math.isclose(k.revenue_growth(cur, prev), 0.25)


def test_gross_margin() -> None:
    p = _p(2025, net_revenue=200.0, gross_profit=82.0)
    assert math.isclose(k.gross_margin(p), 0.41)


def test_roe_uses_average_equity() -> None:
    cur = _p(2025, npat_parent=24.0, equity_parent=110.0)
    prev = _p(2024, equity_parent=90.0)
    assert math.isclose(k.roe(cur, prev), 0.24)


def test_net_debt_ebitda_net_cash_is_negative() -> None:
    p = _p(2025, st_debt=10.0, lt_debt=20.0, cash=40.0, st_investments=10.0,
           operating_profit=80.0, depreciation=20.0)
    assert math.isclose(k.net_debt_ebitda(p), -0.2)


def test_fcf_margin() -> None:
    p = _p(2025, cfo=105.0, capex=-27.0, net_revenue=200.0)
    assert math.isclose(k.fcf_margin(p), 0.39)


def test_altman_z_components() -> None:
    p = _p(2025, current_assets=500.0, current_liabilities=300.0, total_assets=1000.0,
           retained_earnings=200.0, operating_profit=120.0, equity=400.0,
           total_liabilities=600.0, net_revenue=800.0)
    expected = 1.2*0.2 + 1.4*0.2 + 3.3*0.12 + 0.6*(400/600) + 1.0*0.8
    assert math.isclose(k.altman_z(p), expected, rel_tol=1e-9)


def test_returns_none_on_missing() -> None:
    assert k.gross_margin(_p(2025, net_revenue=0.0)) is None
    assert k.revenue_growth(_p(2025, net_revenue=200.0), None) is None
