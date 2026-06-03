from __future__ import annotations

from typing import Any

from app.services.bctc.statements import Period, val

Flag = dict[str, Any]


def balance_identity_flag(p: Period) -> Flag | None:
    ta, tl, eq = val(p, "total_assets"), val(p, "total_liabilities"), val(p, "equity")
    if ta is None or tl is None or eq is None or ta == 0:
        return None
    if abs((tl + eq) - ta) / abs(ta) > 0.005:
        return {"level": "warn", "code": "balance_identity",
                "message": f"BCĐKT lệch: Nợ+VCSH ≠ Tổng TS ({p.year})"}
    return None


def cashflow_identity_flag(p: Period, reported_cfo: float | None) -> Flag | None:
    cfo = val(p, "cfo")
    if cfo is None or reported_cfo is None or cfo == 0:
        return None
    if abs(reported_cfo - cfo) / abs(cfo) > 0.01:
        return {"level": "warn", "code": "cashflow_identity",
                "message": f"LCTT lệch CFO ({p.year})"}
    return None


_RANGES = {
    "gross_margin": (0.0, 1.0),
    "roe": (-0.5, 0.5),
    "nim": (0.01, 0.08),
}


def sanity_flags(snapshot: dict[str, float | None]) -> list[Flag]:
    flags: list[Flag] = []
    for key, (lo, hi) in _RANGES.items():
        v = snapshot.get(key)
        if v is None:
            continue
        if not (lo <= v <= hi):
            flags.append({"level": "warn", "code": f"{key}_out_of_range",
                          "message": f"{key}={v:.3f} ngoài khoảng hợp lý [{lo},{hi}]"})
    return flags


def yoy_outlier_flag(metric: str, cur: float | None, prev: float | None) -> Flag | None:
    if cur is None or prev is None or prev == 0:
        return None
    if abs((cur - prev) / prev) > 2.0:
        return {"level": "info", "code": f"{metric}_yoy_outlier",
                "message": f"{metric} biến động > 200% YoY — cần review"}
    return None
