"""Tests for the VCI financial report normalization helpers."""

from __future__ import annotations

import pytest

from app.services.market_data.sources.vci_finance_normalize import (
    enrich_ratio_records,
    filter_ratio_period,
    to_kbs_shape,
)


def test_to_kbs_shape_quarter_filter_and_sort() -> None:
    items = [
        {"year_report": 2024, "length_report": 1, "isa1": 100.0, "isa3": 90.0},
        {"year_report": 2024, "length_report": 5, "isa1": 380.0, "isa3": 360.0},
        {"year_report": 2025, "length_report": 1, "isa1": 110.0, "isa3": 100.0},
        {"year_report": 2025, "length_report": 2, "isa1": 120.0, "isa3": 105.0},
    ]
    metrics = [
        {"level": 1, "parent": None, "field": "isa1", "titleVi": "Doanh thu thuần"},
        {"level": 1, "parent": None, "field": "isa3", "titleVi": "Lợi nhuận"},
    ]

    shaped = to_kbs_shape(
        items=items,
        metrics_section=metrics,
        section_key="KQKD",
        term_type=2,
        page_size=2,
    )

    assert [h["TermName"] for h in shaped["Head"]] == ["Q2/2025", "Q1/2025"]
    rows = shaped["Content"]["KQKD"]
    assert len(rows) == 2
    assert rows[0]["Name"] == "Doanh thu thuần"
    assert rows[0]["FieldCode"] == "isa1"
    # Newest first column.
    assert rows[0]["Value1"] == 120.0
    assert rows[0]["Value2"] == 110.0


def test_to_kbs_shape_year_filter() -> None:
    items = [
        {"year_report": 2023, "length_report": 5, "bsa1": 1000.0},
        {"year_report": 2024, "length_report": 5, "bsa1": 1100.0},
        {"year_report": 2025, "length_report": 1, "bsa1": 280.0},
    ]
    metrics = [
        {"level": 1, "parent": None, "field": "bsa1", "titleVi": "Tổng tài sản"},
    ]

    shaped = to_kbs_shape(
        items=items,
        metrics_section=metrics,
        section_key="CDKT",
        term_type=1,
        page_size=4,
    )

    assert [h["TermName"] for h in shaped["Head"]] == ["2024", "2023"]
    assert shaped["Content"]["CDKT"][0]["Value1"] == 1100.0


def test_enrich_ratio_synthesizes_revenue_from_income_statement() -> None:
    ratio_rows = [
        {
            "year": "2025",
            "quarter": 4,
            "year_report": 2025,
            "pe": 10.0,
            "pb": 2.0,
            "market_cap": 1_000_000_000.0,
            "number_of_shares_mkt_cap": 100_000.0,
        },
        {
            "year": "2024",
            "quarter": 4,
            "year_report": 2024,
            "pe": 12.0,
            "pb": 2.5,
        },
    ]
    income_quarters = [
        {
            "year_report": 2025,
            "length_report": 4,
            "isa3": 200_000_000.0,
            "isa22": 30_000_000.0,
            "isa23": 1500.0,
        },
        {
            "year_report": 2024,
            "length_report": 4,
            "isa3": 160_000_000.0,
            "isa22": 24_000_000.0,
            "isa23": 1200.0,
        },
    ]

    enriched = enrich_ratio_records(
        ratio_rows, income_quarters=income_quarters
    )

    assert enriched[0]["year_report"] == 2025
    assert enriched[0]["revenue"] == 200_000_000.0
    assert enriched[0]["net_profit"] == 30_000_000.0
    assert enriched[0]["eps"] == 1500.0
    # 200M vs 160M = 25% growth
    assert enriched[0]["revenue_growth"] == pytest.approx(0.25)
    # 30M vs 24M = 25% growth
    assert enriched[0]["net_profit_growth"] == pytest.approx(0.25)
    # BVPS = 1B / 2.0 / 100k = 5000
    assert enriched[0]["bvps"] == pytest.approx(5000.0)


def test_enrich_ratio_handles_bank_fields() -> None:
    """Banks store revenue under isb38 and net profit under isb43/isa22."""
    ratio_rows = [
        {"year": "2026", "quarter": 1, "year_report": 2026, "pe": 11.0},
    ]
    income_quarters = [
        {
            "year_report": 2026,
            "length_report": 1,
            "isb38": 500_000_000.0,
            "isb27": 400_000_000.0,
            "isa22": 100_000_000.0,
            "isa23": 1100.0,
        },
    ]
    enriched = enrich_ratio_records(
        ratio_rows, income_quarters=income_quarters
    )
    assert enriched[0]["revenue"] == 500_000_000.0
    assert enriched[0]["net_profit"] == 100_000_000.0
    assert enriched[0]["eps"] == 1100.0


def test_filter_ratio_period_yearly_prefers_year_end() -> None:
    rows = [
        {"year_report": 2024, "length_report": 5},
        {"year_report": 2024, "length_report": 4},
        {"year_report": 2025, "length_report": 4},  # No year-end yet.
    ]
    result = filter_ratio_period(rows, period="Y")
    # Year 2024 has length=5 → drop length=4. Year 2025 falls back to length=4.
    pairs = {(r["year_report"], r["length_report"]) for r in result}
    assert pairs == {(2024, 5), (2025, 4)}


def test_filter_ratio_period_quarterly() -> None:
    rows = [
        {"year_report": 2024, "length_report": 5},
        {"year_report": 2024, "length_report": 4},
        {"year_report": 2025, "length_report": 1},
    ]
    result = filter_ratio_period(rows, period="Q")
    lengths = {int(r["length_report"]) for r in result}
    assert 5 not in lengths
    assert lengths == {4, 1}
