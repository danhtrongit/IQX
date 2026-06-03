from __future__ import annotations

import math

from app.services.bctc.statements import Period
from app.services.bctc.bank_dupont import bank_dupont


def _p(year, **v):
    return Period(year=year, length=5, values=v)


def test_bank_dupont() -> None:
    cur = _p(2025, npat=20.0, total_assets=1000.0, equity=100.0,
             net_interest_income=35.0, total_operating_income=50.0,
             operating_expense=-20.0, provision_expense=-5.0, tax_expense=-4.0)
    prev = _p(2024, total_assets=900.0, equity=90.0)
    d = bank_dupont(cur, prev)
    assert math.isclose(d["roa"], 20.0 / 950.0)
    assert math.isclose(d["equity_multiplier"], 950.0 / 95.0)
    assert math.isclose(d["roe"], (20.0/950.0) * (950.0/95.0))
    assert math.isclose(d["nii_to_ta"], 35.0 / 950.0)
    assert math.isclose(d["non_nii_to_ta"], (50.0 - 35.0) / 950.0)
    assert math.isclose(d["opex_to_ta"], 20.0 / 950.0)
    assert math.isclose(d["provision_to_ta"], 5.0 / 950.0)
    assert math.isclose(d["tax_to_ta"], 4.0 / 950.0)


def test_bank_dupont_none_on_missing() -> None:
    d = bank_dupont(_p(2025, npat=20.0), None)
    assert d["roe"] is None
