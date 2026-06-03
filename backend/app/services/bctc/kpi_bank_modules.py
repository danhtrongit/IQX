from __future__ import annotations

from app.services.bctc.kpi_bank import _avg_derived, earning_assets, interest_bearing_liabilities
from app.services.bctc.statements import Period, val


def _pct(num: float | None, den: float | None) -> float | None:
    if num is None or not den:
        return None
    return num / den


def _avg(cur: Period, prev: Period | None, concept: str) -> float | None:
    a = val(cur, concept)
    if a is None:
        return None
    b = val(prev, concept)
    return (a + b) / 2 if b is not None else a


def toi_mix(p: Period) -> dict[str, float | None]:
    toi = val(p, "total_operating_income")
    return {
        "nii_pct": _pct(val(p, "net_interest_income"), toi),
        "fee_pct": _pct(val(p, "net_fee_income"), toi),
    }


def nim_decomposition(cur: Period, prev: Period | None) -> dict[str, float | None]:
    ea = _avg_derived(cur, prev, earning_assets)
    ibl = _avg_derived(cur, prev, interest_bearing_liabilities)
    ie = val(cur, "interest_expense")
    y = _pct(val(cur, "interest_income_gross"), ea)
    cof = _pct(abs(ie) if ie is not None else None, ibl)
    spread = (y - cof) if y is not None and cof is not None else None
    return {"yield_ea": y, "cost_of_funds": cof, "spread": spread}


def ppop_cor(cur: Period, prev: Period | None) -> dict[str, float | None]:
    toi, opex = val(cur, "total_operating_income"), val(cur, "operating_expense")
    prov = val(cur, "provision_expense")
    avg_loans = _avg(cur, prev, "customer_loans")
    ppop = (toi - abs(opex)) if toi is not None and opex is not None else None
    return {
        "ppop": ppop,
        "cir": _pct(abs(opex) if opex is not None else None, toi),
        "provision_ppop": _pct(prov, ppop),
        "cost_of_risk": _pct(prov, avg_loans),
    }
