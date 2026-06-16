from __future__ import annotations

import math
from typing import Any, cast

from app.services.bctc.statements import Period, val

# (key, nhãn tiếng Việt, nhãn viết tắt như mockup, đơn vị hiển thị)
_DRIVERS: list[tuple[str, str, str, str]] = [
    ("tax_burden", "Gánh nặng thuế", "TAX BURDEN", "x"),
    ("interest_burden", "Gánh nặng lãi vay", "INTEREST BRD", "x"),
    ("op_margin", "Biên hoạt động", "OP MARGIN", "%"),
    ("asset_turnover", "Vòng quay tài sản", "ASSET T/O", "x"),
    ("equity_multiplier", "Hệ số nhân VCSH", "EQUITY MULT", "x"),
]


def _avg(cur: Period, prev: Period | None, c: str) -> float | None:
    a = val(cur, c)
    if a is None:
        return None
    b = val(prev, c)
    return (a + b) / 2 if b is not None else a


def _ratio(num: float | None, den: float | None) -> float | None:
    if num is None or not den:
        return None
    return num / den


def dupont(cur: Period, prev: Period | None) -> dict[str, Any]:
    tax_burden = _ratio(val(cur, "npat"), val(cur, "profit_before_tax"))
    interest_burden = _ratio(val(cur, "profit_before_tax"), val(cur, "operating_profit"))
    op_margin = _ratio(val(cur, "operating_profit"), val(cur, "net_revenue"))
    asset_turnover = _ratio(val(cur, "net_revenue"), _avg(cur, prev, "total_assets"))
    equity_multiplier = _ratio(_avg(cur, prev, "total_assets"), _avg(cur, prev, "equity"))
    drivers = [tax_burden, interest_burden, op_margin, asset_turnover, equity_multiplier]
    roe: float | None
    if any(x is None for x in drivers):
        roe = None
    else:
        roe = 1.0
        for x in drivers:
            roe *= x  # type: ignore[operator]
    return {
        "tax_burden": tax_burden,
        "interest_burden": interest_burden,
        "op_margin": op_margin,
        "asset_turnover": asset_turnover,
        "equity_multiplier": equity_multiplier,
        "roe": roe,
    }


def dupont_decomposition(periods: list[Period]) -> dict[str, Any]:
    """DuPont 5 bước có delta kỳ trước + đóng góp vào thay đổi ROE.

    Phân rã thay đổi ROE theo từng driver bằng LMDI (logarithmic mean
    decomposition): vì ROE = ∏ driver_i, ta có Σ ln(d_i_cur/d_i_prev) =
    ln(ROE_cur/ROE_prev), nên contribution_i = roe_delta · ln(d_i_cur/d_i_prev)
    / Σ_j ln(d_j_cur/d_j_prev) cộng lại đúng bằng roe_delta. Chỉ tính khi mọi
    driver (cả kỳ này lẫn kỳ trước) đều > 0; nếu không, contribution = None.
    """
    cur = periods[0] if periods else None
    prev = periods[1] if len(periods) > 1 else None
    prev2 = periods[2] if len(periods) > 2 else None
    d_cur = dupont(cur, prev) if cur is not None else {}
    d_prev = dupont(prev, prev2) if prev is not None else {}

    keys = [k for k, *_ in _DRIVERS]
    roe_cur = d_cur.get("roe")
    roe_prev = d_prev.get("roe")
    roe_delta = (
        roe_cur - roe_prev if roe_cur is not None and roe_prev is not None else None
    )

    contribs: dict[str, float | None] = {k: None for k in keys}
    cur_vals = [d_cur.get(k) for k in keys]
    prev_vals = [d_prev.get(k) for k in keys]
    if (
        roe_delta is not None
        and all(v is not None and v > 0 for v in cur_vals)
        and all(v is not None and v > 0 for v in prev_vals)
    ):
        logs = [
            math.log(cast(float, c) / cast(float, p))
            for c, p in zip(cur_vals, prev_vals, strict=True)
        ]
        total = sum(logs)
        if abs(total) > 1e-12:
            for k, lg in zip(keys, logs, strict=True):
                contribs[k] = roe_delta * lg / total
        else:  # ROE không đổi -> không driver nào đóng góp
            for k in keys:
                contribs[k] = 0.0

    drivers: list[dict[str, Any]] = []
    for key, label, abbr, unit in _DRIVERS:
        v = d_cur.get(key)
        pv = d_prev.get(key)
        drivers.append(
            {
                "key": key,
                "label": label,
                "abbr": abbr,
                "unit": unit,
                "value": v,
                "prev": pv,
                "delta": (v - pv if v is not None and pv is not None else None),
                "contribution": contribs[key],
            }
        )

    return {"roe": roe_cur, "roe_prev": roe_prev, "roe_delta": roe_delta, "drivers": drivers}
