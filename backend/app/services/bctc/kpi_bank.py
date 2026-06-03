from __future__ import annotations

from app.services.bctc.statements import Period, val


def _avg(cur: Period, prev: Period | None, concept: str) -> float | None:
    a = val(cur, concept)
    if a is None:
        return None
    b = val(prev, concept)
    return (a + b) / 2 if b is not None else a


def nim(cur: Period, prev: Period | None) -> float | None:
    nii = val(cur, "net_interest_income")
    ea = _avg(cur, prev, "earning_assets")
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
