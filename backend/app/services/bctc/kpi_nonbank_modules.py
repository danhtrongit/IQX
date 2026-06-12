from __future__ import annotations

from typing import Any

from app.services.bctc.statements import Period, period_label, val


def _pct(num: float | None, den: float | None) -> float | None:
    if num is None or not den:
        return None
    return num / den


def _abs_pct(num: float | None, den: float | None) -> float | None:
    # Chi phí (giá vốn, bán hàng, QLDN) lưu dạng âm trong VCI -> hiển thị độ lớn
    # dương như % doanh thu (theo quy ước common-size của guide).
    if num is None or not den:
        return None
    return abs(num) / den


def common_size(p: Period) -> dict[str, float | None]:
    rev = val(p, "net_revenue")
    return {
        "cogs_pct": _abs_pct(val(p, "cogs"), rev),
        "gross_margin": _pct(val(p, "gross_profit"), rev),
        "selling_pct": _abs_pct(val(p, "selling_expense"), rev),
        "admin_pct": _abs_pct(val(p, "admin_expense"), rev),
        "ebit_margin": _pct(val(p, "operating_profit"), rev),
        "net_margin": _pct(val(p, "npat"), rev),
    }


# Thứ tự + nhãn hiển thị của bảng Common-Size KQKD (theo cấu trúc KQKD: giá
# vốn -> biên gộp -> chi phí BH/QLDN -> biên EBIT -> biên LNST). `emphasis` =
# dòng biên (subtotal) được in đậm.
_COMMON_SIZE_ROWS = [
    ("cogs_pct", "Giá vốn hàng bán", False),
    ("gross_margin", "Biên lợi nhuận gộp", True),
    ("selling_pct", "Chi phí bán hàng", False),
    ("admin_pct", "Chi phí quản lý DN", False),
    ("ebit_margin", "Biên EBIT (LN thuần HĐKD)", True),
    ("net_margin", "Biên LNST", False),
]


def common_size_table(periods: list[Period], max_cols: int = 5) -> dict[str, Any]:
    """Bảng Common-Size KQKD nhiều kỳ (self-describing: columns + rows).

    `periods` mới-nhất-trước; cột hiển thị tăng dần (cũ -> mới) như bảng KQKD.
    Mỗi dòng: {key, label, emphasis, unit, values[]} khớp số cột.
    """
    cols = list(reversed(periods[:max_cols]))  # cũ -> mới
    per_period = [common_size(p) for p in cols]
    rows = [
        {
            "key": key,
            "label": label,
            "emphasis": emphasis,
            "unit": "%",
            "values": [cs.get(key) for cs in per_period],
        }
        for key, label, emphasis in _COMMON_SIZE_ROWS
    ]
    return {"columns": [period_label(p) for p in cols], "rows": rows}


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
    ccc = (dso + dio - dpo) if (dso is not None and dio is not None and dpo is not None) else None
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
