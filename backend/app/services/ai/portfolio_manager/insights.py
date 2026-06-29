"""Insight template library + selection (spec §5). 6 starter templates."""

from __future__ import annotations

from .config import (
    CASH_DRY_MAX,
    HIDDEN_CORR_MIN,
    PROFIT_CONCENTRATION_MIN,
    SECTOR_TILT_RATIO_MIN,
)


def _hidden_corr(a: dict) -> dict | None:
    weights = {p["ticker"]: p.get("weight") or 0.0 for p in a["overview"]["positions"]}
    best = None
    for pair in a["risk"].get("correlation", []):
        combined = (weights.get(pair["a"], 0.0) + weights.get(pair["b"], 0.0))
        if pair["value"] > HIDDEN_CORR_MIN and combined > 0.2:
            severity = pair["value"] * combined
            if best is None or severity > best["severity"]:
                best = {"id": "hidden_corr", "severity": severity,
                        "data": {"pair": [pair["a"], pair["b"]], "corr": pair["value"],
                                 "combined_weight": round(combined, 3)}}
    return best


def _profit_concentration(a: dict) -> dict | None:
    rows = a.get("attribution", [])
    top = max((r.get("pct") or 0.0 for r in rows), default=0.0)
    if top > PROFIT_CONCENTRATION_MIN:
        return {"id": "profit_concentration", "severity": top, "data": {"max_contribution_pct": round(top, 3)}}
    return None


def _sector_tilt(a: dict) -> dict | None:
    best = None
    for row in a.get("allocation", []):
        bench = row.get("benchmark")
        if bench and bench > 0:
            ratio = row["weight"] / bench
            if ratio > SECTOR_TILT_RATIO_MIN and (best is None or ratio > best["severity"]):
                best = {"id": "sector_tilt", "severity": ratio,
                        "data": {"sector": row["sector"], "ratio": round(ratio, 2), "weight": row["weight"]}}
    return best


def _holding_losers(a: dict) -> dict | None:
    if a["behavior"].get("disposition_flag"):
        worst = a["behavior"].get("worst_loser") or {}
        periods = worst.get("periods_held", 1)
        return {"id": "holding_losers", "severity": float(periods), "data": worst}
    return None


def _cash_dry(a: dict) -> dict | None:
    cash_pct = a["overview"].get("cash_pct") or 0.0
    if cash_pct < CASH_DRY_MAX:
        return {"id": "cash_dry", "severity": CASH_DRY_MAX - cash_pct, "data": {"cash_pct": cash_pct}}
    return None


def _healthy_focus(a: dict) -> dict | None:
    # positive: concentrated but in quality names (high roe, reasonable pe)
    q = a.get("quality", {})
    roe, pe = q.get("roe") or 0.0, q.get("pe") or 99.0
    top1 = max((p.get("weight") or 0.0 for p in a["overview"]["positions"]), default=0.0)
    if roe >= 0.15 and pe < 13 and top1 < 0.25:
        return {"id": "healthy_focus", "severity": roe, "data": {"roe": roe, "pe": pe}}
    return None


_TEMPLATES = [_hidden_corr, _profit_concentration, _sector_tilt, _holding_losers, _cash_dry, _healthy_focus]
_POSITIVE = {"healthy_focus"}


def select_insights(analysis: dict) -> list[dict]:
    hits = [t(analysis) for t in _TEMPLATES]
    hits = [h for h in hits if h is not None]
    hits.sort(key=lambda h: h["severity"], reverse=True)

    negatives = [h for h in hits if h["id"] not in _POSITIVE]
    positive = next((h for h in hits if h["id"] in _POSITIVE), None)

    # Spec §5: guarantee a positive note when one is eligible — but WITHOUT evicting the
    # single strongest warning. So: strongest negative + the positive (≤2). When no positive
    # is eligible, take the top-2 negatives by severity.
    if positive is not None:
        chosen = ([negatives[0]] if negatives else []) + [positive]
    else:
        chosen = negatives[:2]

    return [{"id": h["id"], "data": h["data"]} for h in chosen]
