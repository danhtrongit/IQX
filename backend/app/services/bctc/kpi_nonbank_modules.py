from __future__ import annotations

from app.services.bctc.statements import Period, val


def _pct(num: float | None, den: float | None) -> float | None:
    if num is None or not den:
        return None
    return num / den


def common_size(p: Period) -> dict[str, float | None]:
    rev = val(p, "net_revenue")
    return {
        "cogs_pct": _pct(val(p, "cogs"), rev),
        "gross_margin": _pct(val(p, "gross_profit"), rev),
        "selling_pct": _pct(val(p, "selling_expense"), rev),
        "admin_pct": _pct(val(p, "admin_expense"), rev),
        "ebit_margin": _pct(val(p, "operating_profit"), rev),
        "net_margin": _pct(val(p, "npat"), rev),
    }


def _avg(cur: Period, prev: Period | None, concept: str) -> float | None:
    a = val(cur, concept)
    if a is None:
        return None
    b = val(prev, concept)
    return (a + b) / 2 if b is not None else a


def working_capital_cycle(cur: Period, prev: Period | None) -> dict[str, float | None]:
    rev, cogs = val(cur, "net_revenue"), val(cur, "cogs")
    ar = _avg(cur, prev, "trade_receivables")
    inv_g = _avg(cur, prev, "inventory_gross")
    # Dự phòng giảm giá HTK thiếu/None -> coi như 0 (HTK ròng = HTK gộp). Đây là
    # mặc định tài chính đúng: không có khoản trích lập = tồn kho ở giá gốc.
    inv_p = _avg(cur, prev, "inventory_provision") or 0.0
    inv_net = (inv_g - abs(inv_p)) if inv_g is not None else None
    ap = _avg(cur, prev, "trade_payables")
    dso = (ar / rev * 365) if ar is not None and rev else None
    dio = (inv_net / cogs * 365) if inv_net is not None and cogs else None
    dpo = (ap / cogs * 365) if ap is not None and cogs else None
    ccc = (dso + dio - dpo) if None not in (dso, dio, dpo) else None
    return {"dso": dso, "dio": dio, "dpo": dpo, "ccc": ccc}


def cash_flow_bridge(p: Period) -> dict[str, float | None]:
    ni, dep, prov = val(p, "npat"), val(p, "depreciation"), val(p, "provisions_cf")
    cfo, capex, rev, ta = (val(p, "cfo"), val(p, "capex"), val(p, "net_revenue"),
                           val(p, "total_assets"))
    fcf = (cfo + capex) if cfo is not None and capex is not None else None
    return {
        "ni": ni, "depreciation": dep, "provisions": prov, "cfo": cfo,
        "capex": capex, "fcf": fcf,
        "cfo_ni": _pct(cfo, ni),
        "fcf_margin": _pct(fcf, rev),
        "sloan_accrual": (_pct((ni - cfo), ta) if ni is not None and cfo is not None else None),
    }
