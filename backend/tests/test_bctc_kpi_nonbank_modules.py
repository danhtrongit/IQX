from __future__ import annotations

import math

from app.services.bctc import kpi_nonbank_modules as m
from app.services.bctc.statements import Period


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


def test_cash_flow_bridge_waterfall_reconciles() -> None:
    p = _p(2025, npat=8990.0, depreciation=2180.0, provisions_cf=0.0,
           cfo=10590.0, capex=-2720.0, net_revenue=30000.0, total_assets=100000.0)
    br = m.cash_flow_bridge(p)
    # Thay đổi VLĐ là phần chốt: NI + Khấu hao + Dự phòng + ΔVLĐ == CFO.
    assert math.isclose(br["wc_change"], -580.0)
    assert math.isclose(
        br["ni"] + br["depreciation"] + br["provisions"] + br["wc_change"], br["cfo"]
    )
    keys = [line["key"] for line in br["lines"]]
    assert keys == ["ni", "depreciation", "provisions", "wc_change", "cfo", "capex", "fcf"]
    kinds = {line["key"]: line["kind"] for line in br["lines"]}
    assert kinds["ni"] == "base"
    assert kinds["cfo"] == "subtotal"
    assert kinds["capex"] == "sub"
    assert kinds["fcf"] == "total"


def test_working_capital_cycle_series() -> None:
    # newest-first; số dư cân bằng nhau qua các kỳ để DSO/DIO/DPO ổn định.
    bs = dict(trade_receivables=89.0, inventory_gross=42.0, inventory_provision=0.0,
              trade_payables=78.0)
    periods = [
        _p(2025, net_revenue=365.0, cogs=365.0, **bs),
        _p(2024, net_revenue=365.0, cogs=365.0, **bs),
        _p(2023, net_revenue=365.0, cogs=365.0, **bs),
    ]
    series = m.working_capital_cycle_series(periods)
    # cột cũ -> mới
    assert series["columns"] == ["2023", "2024", "2025"]
    # hàng đổi tên theo mockup
    labels = [r["label"] for r in series["rows"]]
    assert labels == [
        "DSO — Phải thu", "DIO — Tồn kho", "DPO — Phải trả", "CCC — Chu kỳ tiền mặt",
    ]
    # cột mới nhất khớp hàm 1 kỳ
    one = m.working_capital_cycle(periods[0], periods[1])
    dso_row = next(r for r in series["rows"] if r["key"] == "dso")
    assert math.isclose(dso_row["values"][-1], one["dso"])
    assert math.isclose(series["latest"]["ccc"], one["ccc"])
