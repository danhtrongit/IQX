from __future__ import annotations

from typing import Any

from app.services.bctc.statements import Period, val


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
