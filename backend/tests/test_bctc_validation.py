from __future__ import annotations

from app.services.bctc.statements import Period
from app.services.bctc.validation import balance_identity_flag, sanity_flags


def test_balance_identity_ok_within_tolerance() -> None:
    p = Period(2025, 5, {"total_assets": 1000.0, "total_liabilities": 600.0, "equity": 400.0})
    assert balance_identity_flag(p) is None


def test_balance_identity_flags_mismatch() -> None:
    p = Period(2025, 5, {"total_assets": 1000.0, "total_liabilities": 600.0, "equity": 300.0})
    flag = balance_identity_flag(p)
    assert flag is not None and flag["level"] == "warn"


def test_sanity_flags_out_of_range_roe() -> None:
    flags = sanity_flags({"roe": 0.9, "gross_margin": 0.4})
    codes = {f["code"] for f in flags}
    assert "roe_out_of_range" in codes
