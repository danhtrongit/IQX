from __future__ import annotations

import math

from app.services.bctc.statements import Period
from app.services.bctc import kpi_nonbank_modules as m


def _p(year: int, **v: float) -> Period:
    return Period(year=year, length=5, values=v)


def test_common_size_ratios() -> None:
    p = _p(2025, net_revenue=200.0, cogs=118.0, gross_profit=82.0,
           selling_expense=17.4, admin_expense=26.0, operating_profit=36.4, npat=28.8)
    cs = m.common_size(p)
    assert math.isclose(cs["cogs_pct"], 0.59)
    assert math.isclose(cs["gross_margin"], 0.41)
    assert math.isclose(cs["selling_pct"], 17.4 / 200.0)
    assert math.isclose(cs["admin_pct"], 26.0 / 200.0)
    assert math.isclose(cs["ebit_margin"], 36.4 / 200.0)
    assert math.isclose(cs["net_margin"], 0.144)


def test_common_size_negative_expenses_shown_positive() -> None:
    # VCI lưu chi phí âm -> common-size phải hiện độ lớn dương.
    p = _p(2025, net_revenue=200.0, cogs=-118.0, selling_expense=-17.4, admin_expense=-26.0)
    cs = m.common_size(p)
    assert math.isclose(cs["cogs_pct"], 0.59)
    assert math.isclose(cs["selling_pct"], 0.087)
    assert math.isclose(cs["admin_pct"], 0.13)


def test_wcc_missing_provision_treated_as_zero() -> None:
    # Thiếu inventory_provision -> HTK ròng = HTK gộp (không vỡ, không None).
    cur = _p(2025, trade_receivables=50.0, inventory_gross=30.0,
             trade_payables=40.0, net_revenue=365.0, cogs=365.0)
    wcc = m.working_capital_cycle(cur, None)
    assert math.isclose(wcc["dio"], 30.0)


def test_working_capital_cycle() -> None:
    cur = _p(2025, trade_receivables=89.0, inventory_gross=42.0, inventory_provision=0.0,
             trade_payables=78.0, net_revenue=365.0, cogs=365.0)
    prev = _p(2024, trade_receivables=89.0, inventory_gross=42.0, inventory_provision=0.0,
              trade_payables=78.0)
    wcc = m.working_capital_cycle(cur, prev)
    assert math.isclose(wcc["dso"], 89.0)
    assert math.isclose(wcc["dio"], 42.0)
    assert math.isclose(wcc["dpo"], 78.0)
    assert math.isclose(wcc["ccc"], 89.0 + 42.0 - 78.0)


def test_cash_flow_bridge() -> None:
    p = _p(2025, npat=89.0, depreciation=21.8, provisions_cf=0.0,
           cfo=105.9, capex=-27.2, net_revenue=300.0, total_assets=1000.0)
    br = m.cash_flow_bridge(p)
    assert math.isclose(br["fcf"], 105.9 - 27.2)
    assert math.isclose(br["cfo_ni"], 105.9 / 89.0)
    assert math.isclose(br["fcf_margin"], (105.9 - 27.2) / 300.0)
    assert math.isclose(br["sloan_accrual"], (89.0 - 105.9) / 1000.0)
