from __future__ import annotations

import math

from app.services.bctc.dupont import dupont, dupont_decomposition
from app.services.bctc.statements import Period


def _p(year: int, **v: float) -> Period:
    return Period(year=year, length=5, values=v)


def _driver_period(year: int, *, npat: float, pbt: float, op: float, rev: float,
                   ta: float, eq: float) -> Period:
    return _p(year, npat=npat, profit_before_tax=pbt, operating_profit=op,
              net_revenue=rev, total_assets=ta, equity=eq)


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


def test_dupont_decomposition_shape_and_deltas() -> None:
    # 3 kỳ để tính được driver kỳ này (cur vs prev) và kỳ trước (prev vs prev2).
    periods = [
        _driver_period(2025, npat=87.0, pbt=100.0, op=120.0, rev=600.0, ta=720.0, eq=400.0),
        _driver_period(2024, npat=80.0, pbt=95.0, op=110.0, rev=560.0, ta=680.0, eq=360.0),
        _driver_period(2023, npat=72.0, pbt=88.0, op=100.0, rev=520.0, ta=640.0, eq=330.0),
    ]
    dec = dupont_decomposition(periods)
    assert [d["key"] for d in dec["drivers"]] == [
        "tax_burden", "interest_burden", "op_margin", "asset_turnover", "equity_multiplier",
    ]
    assert dec["roe"] is not None and dec["roe_prev"] is not None
    assert math.isclose(dec["roe_delta"], dec["roe"] - dec["roe_prev"])
    # mỗi driver có value/prev/delta khớp
    for d in dec["drivers"]:
        assert math.isclose(d["delta"], d["value"] - d["prev"])
    # đóng góp cộng lại đúng bằng thay đổi ROE (LMDI khép kín)
    total_contrib = sum(d["contribution"] for d in dec["drivers"])
    assert math.isclose(total_contrib, dec["roe_delta"], rel_tol=1e-9, abs_tol=1e-12)


def test_dupont_decomposition_contrib_none_when_insufficient_periods() -> None:
    periods = [
        _driver_period(2025, npat=87.0, pbt=100.0, op=120.0, rev=600.0, ta=720.0, eq=400.0),
    ]
    dec = dupont_decomposition(periods)
    assert dec["roe_prev"] is None
    assert dec["roe_delta"] is None
    assert all(d["contribution"] is None for d in dec["drivers"])
