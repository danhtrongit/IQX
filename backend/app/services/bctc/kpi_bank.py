from __future__ import annotations

from collections.abc import Callable

from app.services.bctc.statements import Period, val

_EARNING_ASSET_CONCEPTS = (
    "deposits_at_sbv", "deposits_at_other_ci", "trading_securities",
    "customer_loans", "investment_securities",
)
_IBL_CONCEPTS = (
    "govt_sbv_borrowings", "ci_deposits_borrowings", "customer_deposits", "valuable_papers",
)


def _avg(cur: Period, prev: Period | None, concept: str) -> float | None:
    a = val(cur, concept)
    if a is None:
        return None
    b = val(prev, concept)
    return (a + b) / 2 if b is not None else a


def _sum_concepts(p: Period, concepts: tuple[str, ...]) -> float | None:
    vals = [v for v in (val(p, c) for c in concepts) if v is not None]
    return sum(vals) if vals else None


def earning_assets(p: Period) -> float | None:
    return _sum_concepts(p, _EARNING_ASSET_CONCEPTS)


def interest_bearing_liabilities(p: Period) -> float | None:
    return _sum_concepts(p, _IBL_CONCEPTS)


def _avg_derived(cur: Period, prev: Period | None, fn: Callable[[Period], float | None]) -> float | None:
    a = fn(cur)
    if a is None:
        return None
    b = fn(prev) if prev is not None else None
    return (a + b) / 2 if b is not None else a


def nim(cur: Period, prev: Period | None) -> float | None:
    nii = val(cur, "net_interest_income")
    ea = _avg_derived(cur, prev, earning_assets)
    if nii is None or not ea:
        return None
    return nii / ea


def roe(cur: Period, prev: Period | None) -> float | None:
    ni = val(cur, "npat")
    eq = _avg(cur, prev, "equity")
    if ni is None or not eq:
        return None
    return ni / eq


def ldr(p: Period) -> float | None:
    loans, dep = val(p, "customer_loans"), val(p, "customer_deposits")
    if loans is None or not dep:
        return None
    return loans / dep


def equity_ratio(p: Period) -> float | None:
    eq, ta = val(p, "equity"), val(p, "total_assets")
    if eq is None or not ta:
        return None
    return eq / ta


def llr_loans(p: Period) -> float | None:
    res, loans = val(p, "loan_loss_reserve"), val(p, "customer_loans")
    if res is None or not loans:
        return None
    return abs(res) / loans


def cir(p: Period) -> float | None:
    opex, toi = val(p, "operating_expense"), val(p, "total_operating_income")
    if opex is None or not toi:
        return None
    return abs(opex) / toi
