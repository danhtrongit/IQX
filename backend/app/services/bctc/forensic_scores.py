from __future__ import annotations

from typing import Any

from app.services.bctc.statements import Period, val


def _r(num: float | None, den: float | None) -> float | None:
    if num is None or not den:
        return None
    return num / den


def piotroski_f(cur: Period, prev: Period | None) -> dict[str, Any]:
    """Piotroski F-Score 0..9. Cần kỳ trước; thiếu -> score None."""
    if prev is None:
        return {"score": None, "criteria": {}}
    roa = _r(val(cur, "npat"), val(cur, "total_assets"))
    roa_prev = _r(val(prev, "npat"), val(prev, "total_assets"))
    cfo = val(cur, "cfo")
    npat = val(cur, "npat")
    cr = _r(val(cur, "current_assets"), val(cur, "current_liabilities"))
    cr_prev = _r(val(prev, "current_assets"), val(prev, "current_liabilities"))
    gm = _r(val(cur, "gross_profit"), val(cur, "net_revenue"))
    gm_prev = _r(val(prev, "gross_profit"), val(prev, "net_revenue"))
    at = _r(val(cur, "net_revenue"), val(cur, "total_assets"))
    at_prev = _r(val(prev, "net_revenue"), val(prev, "total_assets"))
    ltd, ltd_prev = val(cur, "lt_debt"), val(prev, "lt_debt")
    shares = val(cur, "proceeds_from_shares")
    c: dict[str, bool | None] = {
        "roa_positive": (roa > 0) if roa is not None else None,
        "cfo_positive": (cfo > 0) if cfo is not None else None,
        "roa_increasing": (roa > roa_prev) if roa is not None and roa_prev is not None else None,
        "accrual_quality": (cfo > npat) if cfo is not None and npat is not None else None,
        "lower_leverage": (ltd < ltd_prev) if ltd is not None and ltd_prev is not None else None,
        "current_ratio_up": (cr > cr_prev) if cr is not None and cr_prev is not None else None,
        "no_dilution": (shares == 0) if shares is not None else None,
        "gross_margin_up": (gm > gm_prev) if gm is not None and gm_prev is not None else None,
        "asset_turnover_up": (at > at_prev) if at is not None and at_prev is not None else None,
    }
    score = sum(1 for v in c.values() if v is True)
    return {"score": score, "criteria": c}


def _asset_quality(p: Period) -> float | None:
    ca, nfa, ta = val(p, "current_assets"), val(p, "net_fixed_assets"), val(p, "total_assets")
    if ca is None or nfa is None or not ta:
        return None
    return 1 - (ca + nfa) / ta


def _sum2(a: float | None, b: float | None) -> float | None:
    vals = [abs(x) for x in (a, b) if x is not None]
    return sum(vals) if vals else None


def _dep_rate(p: Period) -> float | None:
    dep, nfa = val(p, "depreciation"), val(p, "net_fixed_assets")
    if dep is None or nfa is None:
        return None
    denom = abs(dep) + nfa
    return abs(dep) / denom if denom else None


def _ratio_index(num: float | None, den: float | None) -> float | None:
    if num is None or den in (None, 0):
        return None
    return num / den  # type: ignore[operator]


def beneish_m(cur: Period, prev: Period | None) -> float | None:
    """Beneish M-Score (8 cấu phần, 2 kỳ). Thiếu bất kỳ cấu phần -> None."""
    if prev is None:
        return None
    dsri = _ratio_index(_r(val(cur, "trade_receivables"), val(cur, "net_revenue")),
                        _r(val(prev, "trade_receivables"), val(prev, "net_revenue")))
    gm_c = _r(val(cur, "gross_profit"), val(cur, "net_revenue"))
    gm_p = _r(val(prev, "gross_profit"), val(prev, "net_revenue"))
    gmi = _ratio_index(gm_p, gm_c)
    aqi = _ratio_index(_asset_quality(cur), _asset_quality(prev))
    sgi = _ratio_index(val(cur, "net_revenue"), val(prev, "net_revenue"))
    depi = _ratio_index(_dep_rate(prev), _dep_rate(cur))
    sga_c = _r(_sum2(val(cur, "selling_expense"), val(cur, "admin_expense")), val(cur, "net_revenue"))
    sga_p = _r(_sum2(val(prev, "selling_expense"), val(prev, "admin_expense")), val(prev, "net_revenue"))
    sgai = _ratio_index(sga_c, sga_p)
    lvgi = _ratio_index(_r(val(cur, "total_liabilities"), val(cur, "total_assets")),
                        _r(val(prev, "total_liabilities"), val(prev, "total_assets")))
    npat, cfo, ta = val(cur, "npat"), val(cur, "cfo"), val(cur, "total_assets")
    tata = ((npat - cfo) / ta) if npat is not None and cfo is not None and ta else None
    parts = [dsri, gmi, aqi, sgi, depi, sgai, lvgi, tata]
    if any(x is None for x in parts):
        return None
    return (-4.84 + 0.92 * dsri + 0.528 * gmi + 0.404 * aqi + 0.892 * sgi  # type: ignore[operator]
            + 0.115 * depi - 0.172 * sgai - 0.327 * lvgi + 4.679 * tata)  # type: ignore[operator]
