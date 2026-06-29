"""5-pillar health scoring (spec §3). Each pillar 1–5; overall = mean rounded 1dp."""

from __future__ import annotations


def _score_performance(excess_return: float) -> int:
    if excess_return > 0.05:
        return 5
    if excess_return > 0.02:
        return 4
    if excess_return >= -0.02:
        return 3
    if excess_return >= -0.08:
        return 2
    return 1


def _score_risk(beta: float) -> int:
    if 0.8 <= beta <= 1.1:
        return 5
    if 1.1 < beta <= 1.15 or 0.7 <= beta < 0.8:
        return 4
    if 1.15 < beta <= 1.3:
        return 3
    if 1.3 < beta <= 1.5:
        return 2
    return 1


def _score_diversification(effective_n: float, max_corr: float) -> int:
    # Base score from breadth (effective number of holdings)...
    if effective_n > 8 and max_corr < 0.5:
        base = 5
    elif effective_n > 6:
        base = 4
    elif effective_n >= 4:
        base = 3
    elif effective_n >= 3:
        base = 2
    else:
        base = 1
    # ...then a high-correlation penalty CAPS (never collapses) the score.
    if max_corr > 0.8:
        base = min(base, 3)
    return base
    # Verify: (effective_n=5.8, max_corr=0.82) → base 3, cap min(3,3) = 3 ✓ (matches the sample test)


def _score_quality(roe: float, pe: float) -> int:
    if roe > 0.18 and pe < 12:
        return 5
    if roe >= 0.15:
        return 4
    if roe >= 0.12:
        return 3
    if roe >= 0.08:
        return 2
    return 1


def _score_discipline(disposition_flag: bool, losing_count: int) -> int:
    if not disposition_flag and losing_count == 0:
        return 5
    if not disposition_flag and losing_count <= 1:
        return 4
    if not disposition_flag:
        return 3
    if losing_count <= 2:
        return 3
    return 2


def score_pillars(performance, risk, concentration, quality, behavior, *, max_corr: float) -> dict[str, int]:
    return {
        "performance": _score_performance(performance.get("excess_return") or 0.0),
        "risk": _score_risk(risk.get("beta") or 0.0),
        "diversification": _score_diversification(concentration.get("effective_n") or 0.0, max_corr),
        "quality": _score_quality(quality.get("roe") or 0.0, quality.get("pe") or 99.0),
        "discipline": _score_discipline(bool(behavior.get("disposition_flag")), behavior.get("losing_count") or 0),
    }


def overall_score(pillars: dict[str, int]) -> float:
    vals = list(pillars.values())
    return round(sum(vals) / len(vals), 1) if vals else 0.0
