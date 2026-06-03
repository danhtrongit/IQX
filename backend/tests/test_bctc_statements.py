from __future__ import annotations

from app.services.bctc.statements import Period, build_periods, val


def test_build_periods_merges_three_statements_by_period() -> None:
    mapping = {"net_revenue": "isa1", "total_assets": "bsa1", "cfo": "cfa20"}
    is_rows = [
        {"year_report": 2025, "length_report": 5, "isa1": 200.0},
        {"year_report": 2024, "length_report": 5, "isa1": 160.0},
    ]
    bs_rows = [
        {"year_report": 2025, "length_report": 5, "bsa1": 1000.0},
        {"year_report": 2024, "length_report": 5, "bsa1": 900.0},
    ]
    cf_rows = [
        {"year_report": 2025, "length_report": 5, "cfa20": 50.0},
    ]
    periods = build_periods(bs_rows, is_rows, cf_rows, mapping)
    assert [p.year for p in periods] == [2025, 2024]
    assert periods[0].values["net_revenue"] == 200.0
    assert periods[0].values["total_assets"] == 1000.0
    assert periods[0].values["cfo"] == 50.0
    assert "cfo" not in periods[1].values


def test_val_returns_none_for_missing() -> None:
    p = Period(year=2025, length=5, values={"net_revenue": 200.0})
    assert val(p, "net_revenue") == 200.0
    assert val(p, "khong_co") is None
    assert val(None, "net_revenue") is None
