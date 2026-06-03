from __future__ import annotations

import pytest

from app.services.bctc.mapping_loader import load_mapping


def test_load_nonbank_mapping_real_codes() -> None:
    m = load_mapping("nonbank")
    # FieldCode thật từ discovery VCI (KHÔNG phải isa1 — isa1 là doanh thu gộp).
    assert m["net_revenue"] == "isa3"
    assert m["gross_profit"] == "isa5"
    assert m["cogs"] == "isa4"
    assert m["total_assets"] == "bsa53"
    assert m["equity"] == "bsa78"
    assert m["cfo"] == "cfa18"
    assert m["capex"] == "cfa19"


def test_load_bank_mapping_real_codes() -> None:
    m = load_mapping("bank")
    assert m["total_operating_income"] == "isb38"
    assert m["net_interest_income"] == "isb27"
    assert m["customer_loans"] == "bsb104"
    assert m["customer_deposits"] == "bsb113"
    # Concept chưa ánh xạ -> None (Phase 3 sẽ tính derivation).
    assert m["earning_assets"] is None


def test_unknown_template_raises() -> None:
    with pytest.raises(ValueError):
        load_mapping("xxx")
