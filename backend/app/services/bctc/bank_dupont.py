from __future__ import annotations

from typing import Any

from app.services.bctc.statements import Period, val


def _avg(cur: Period, prev: Period | None, c: str) -> float | None:
    a = val(cur, c)
    if a is None:
        return None
    b = val(prev, c) if prev is not None else None
    return (a + b) / 2 if b is not None else a


def _ratio(num: float | None, den: float | None) -> float | None:
    if num is None or not den:
        return None
    return num / den


def bank_dupont(cur: Period, prev: Period | None) -> dict[str, Any]:
    avg_ta = _avg(cur, prev, "total_assets")
    avg_eq = _avg(cur, prev, "equity")
    roa = _ratio(val(cur, "npat"), avg_ta)
    em = _ratio(avg_ta, avg_eq)
    roe = (roa * em) if roa is not None and em is not None else None
    nii = val(cur, "net_interest_income")
    toi = val(cur, "total_operating_income")
    non_nii = (toi - nii) if toi is not None and nii is not None else None
    opex = val(cur, "operating_expense")
    prov = val(cur, "provision_expense")
    tax = val(cur, "tax_expense")
    return {
        "roa": roa,
        "equity_multiplier": em,
        "roe": roe,
        "nii_to_ta": _ratio(nii, avg_ta),
        "non_nii_to_ta": _ratio(non_nii, avg_ta),
        "opex_to_ta": _ratio(abs(opex) if opex is not None else None, avg_ta),
        "provision_to_ta": _ratio(abs(prov) if prov is not None else None, avg_ta),
        "tax_to_ta": _ratio(abs(tax) if tax is not None else None, avg_ta),
    }
