from __future__ import annotations

from app.services.bctc.sector import detect_template


def test_detect_bank_by_isb_codes() -> None:
    is_rows = [{"year_report": 2025, "length_report": 5, "isb38": 1000.0}]
    assert detect_template(is_rows) == "B"


def test_detect_nonbank_default() -> None:
    is_rows = [{"year_report": 2025, "length_report": 5, "isa1": 200.0}]
    assert detect_template(is_rows) == "A"


def test_detect_empty_defaults_to_a() -> None:
    assert detect_template([]) == "A"
