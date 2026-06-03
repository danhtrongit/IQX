from __future__ import annotations

from statistics import median
from typing import Any

_KE_NONBANK = 0.125
_KE_BANK = 0.14
_G_NONBANK = 0.05
_G_BANK = 0.07


def justified_pb(roe: float | None, ke: float, g: float) -> float | None:
    if roe is None or ke <= g:
        return None
    return (roe - g) / (ke - g)


def _vals(rows: list[dict], key: str, *, positive: bool = False) -> list[float]:
    out: list[float] = []
    for r in rows:
        v = r.get(key)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            if positive and v <= 0:
                continue
            out.append(float(v))
    return out


def _latest(rows: list[dict], key: str) -> float | None:
    for r in rows:
        v = r.get(key)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return float(v)
    return None


def valuation_nonbank(ratio_rows: list[dict]) -> dict[str, Any]:
    rows = ratio_rows or []
    pe = _vals(rows, "pe", positive=True)[:5]
    eps = _latest(rows, "eps")
    bvps = _latest(rows, "bvps")
    roe_vals = _vals(rows, "roe")
    pe_band: dict[str, float] | None = None
    if pe and eps is not None:
        pe_band = {"bear": min(pe) * eps, "base": median(pe) * eps, "bull": max(pe) * eps}
    roe_med = median(roe_vals) if roe_vals else None
    jpb = justified_pb(roe_med, _KE_NONBANK, _G_NONBANK)
    rim = (jpb * bvps) if jpb is not None and bvps is not None else None
    book_floor = bvps
    cands = [x for x in [pe_band["base"] if pe_band else None, rim, book_floor] if x is not None]
    summary = {
        "bear": (min([pe_band["bear"], *cands]) if pe_band else (min(cands) if cands else None)),
        "base": (median(cands) if cands else None),
        "bull": (max([pe_band["bull"], *cands]) if pe_band else (max(cands) if cands else None)),
    }
    return {"pe_band": pe_band, "rim": rim, "book_floor": book_floor,
            "justified_pb": jpb, "roe_sustainable": roe_med, "summary": summary}


def _nim_cor_matrix(
    nim: float | None, cor: float | None, roa: float | None, em: float | None,
    ea_ratio: float | None, loans_ratio: float | None,
) -> dict[str, Any]:
    base_ok = None not in (nim, cor, roa, em, ea_ratio, loans_ratio)
    nim_steps = [(nim + d) if nim is not None else None for d in (0.002, 0.0, -0.002)]
    cor_steps = [(cor + d) if cor is not None else None for d in (-0.002, 0.0, 0.002)]
    out_rows: list[dict[str, Any]] = []
    for nv in nim_steps:
        cells: list[dict[str, Any]] = []
        for cv in cor_steps:
            pb: float | None = None
            if base_ok and nv is not None and cv is not None:
                d_roa = (nv - nim) * ea_ratio - (cv - cor) * loans_ratio  # type: ignore[operator]
                roe_s = (roa + d_roa) * em  # type: ignore[operator]
                pb = justified_pb(roe_s, _KE_BANK, _G_BANK)
            cells.append({"cor": cv, "justified_pb": pb})
        out_rows.append({"nim": nv, "cells": cells})
    return {"rows": out_rows}


def valuation_bank(
    ratio_rows: list[dict], *, nim: float | None = None, cost_of_risk: float | None = None,
    roa: float | None = None, equity_multiplier: float | None = None,
    earning_assets_ratio: float | None = None, loans_ratio: float | None = None,
) -> dict[str, Any]:
    rows = ratio_rows or []
    bvps = _latest(rows, "bvps")
    roe_vals = _vals(rows, "roe")
    roe_med = median(roe_vals) if roe_vals else None
    jpb = justified_pb(roe_med, _KE_BANK, _G_BANK)
    fair_value = (jpb * bvps) if jpb is not None and bvps is not None else None
    matrix = _nim_cor_matrix(nim, cost_of_risk, roa, equity_multiplier, earning_assets_ratio, loans_ratio)
    return {"justified_pb": jpb, "fair_value": fair_value, "roe_sustainable": roe_med,
            "bvps": bvps, "nim_cor_matrix": matrix}
