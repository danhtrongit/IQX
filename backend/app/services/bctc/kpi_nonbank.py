from __future__ import annotations

from app.services.bctc.statements import Period, val


def _avg(cur: Period, prev: Period | None, concept: str) -> float | None:
    a = val(cur, concept)
    if a is None:
        return None
    b = val(prev, concept)
    return (a + b) / 2 if b is not None else a


def revenue_growth(cur: Period, prev: Period | None) -> float | None:
    a, b = val(cur, "net_revenue"), val(prev, "net_revenue")
    if a is None or b is None or b == 0:
        return None
    return a / b - 1


def gross_margin(p: Period) -> float | None:
    gp, rev = val(p, "gross_profit"), val(p, "net_revenue")
    if gp is None or not rev:
        return None
    return gp / rev


def roe(cur: Period, prev: Period | None) -> float | None:
    ni = val(cur, "npat_parent") or val(cur, "npat")
    eq = _avg(cur, prev, "equity_parent") or _avg(cur, prev, "equity")
    if ni is None or not eq:
        return None
    return ni / eq


def net_debt_ebitda(p: Period) -> float | None:
    st_debt = val(p, "st_debt")
    lt_debt = val(p, "lt_debt")
    cash = val(p, "cash")
    sti = val(p, "st_investments")
    ebit = val(p, "operating_profit")
    dep = val(p, "depreciation")
    if (st_debt is None or lt_debt is None or cash is None or sti is None
            or ebit is None or dep is None):
        return None
    ebitda = ebit + dep
    if ebitda == 0:
        return None
    net_debt = (st_debt + lt_debt) - (cash + sti)
    return net_debt / ebitda


def fcf_margin(p: Period) -> float | None:
    cfo, capex, rev = val(p, "cfo"), val(p, "capex"), val(p, "net_revenue")
    if cfo is None or capex is None or not rev:
        return None
    # capex lưu dạng âm trong LCTT -> FCF = CFO + capex (cộng số âm)
    return (cfo + capex) / rev


def altman_z(p: Period) -> float | None:
    ca, cl, ta = val(p, "current_assets"), val(p, "current_liabilities"), val(p, "total_assets")
    re, ebit, eq, tl, rev = (
        val(p, "retained_earnings"),
        val(p, "operating_profit"),
        val(p, "equity"),
        val(p, "total_liabilities"),
        val(p, "net_revenue"),
    )
    if None in (ca, cl, ta, re, ebit, eq, tl, rev) or not ta or not tl:
        return None
    a = (ca - cl) / ta  # type: ignore[operator]
    b = re / ta  # type: ignore[operator]
    c = ebit / ta  # type: ignore[operator]
    d = eq / tl  # type: ignore[operator]
    e = rev / ta  # type: ignore[operator]
    return 1.2 * a + 1.4 * b + 3.3 * c + 0.6 * d + 1.0 * e
