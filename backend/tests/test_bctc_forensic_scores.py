from __future__ import annotations

from app.services.bctc.statements import Period
from app.services.bctc.forensic_scores import piotroski_f, beneish_m


def _p(year: int, **v: float) -> Period:
    return Period(year=year, length=5, values=v)


def test_piotroski_full_score() -> None:
    cur = _p(2025, npat=100.0, total_assets=1000.0, cfo=150.0, lt_debt=80.0,
             current_assets=500.0, current_liabilities=200.0, proceeds_from_shares=0.0,
             gross_profit=400.0, net_revenue=900.0)
    prev = _p(2024, npat=80.0, total_assets=1000.0, cfo=90.0, lt_debt=100.0,
              current_assets=400.0, current_liabilities=220.0,
              gross_profit=320.0, net_revenue=800.0)
    r = piotroski_f(cur, prev)
    assert r["score"] == 9
    assert r["criteria"]["roa_positive"] is True
    assert r["criteria"]["no_dilution"] is True


def test_piotroski_none_without_prev() -> None:
    r = piotroski_f(_p(2025, npat=1.0, total_assets=10.0), None)
    assert r["score"] is None


def test_beneish_m_computes() -> None:
    cur = _p(2025, trade_receivables=120.0, net_revenue=1100.0, gross_profit=400.0,
             current_assets=500.0, net_fixed_assets=200.0, total_assets=1000.0,
             depreciation=50.0, selling_expense=60.0, admin_expense=40.0,
             total_liabilities=600.0, npat=100.0, cfo=130.0)
    prev = _p(2024, trade_receivables=90.0, net_revenue=1000.0, gross_profit=380.0,
              current_assets=460.0, net_fixed_assets=190.0, total_assets=950.0,
              depreciation=48.0, selling_expense=55.0, admin_expense=38.0,
              total_liabilities=560.0)
    m = beneish_m(cur, prev)
    assert m is not None and isinstance(m, float)


def test_beneish_none_on_missing() -> None:
    assert beneish_m(_p(2025, net_revenue=100.0), None) is None
