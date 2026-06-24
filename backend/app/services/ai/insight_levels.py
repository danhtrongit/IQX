"""
Insight status level mapping and briefing variant classification.

Per SPEC §2.2 (5-bậc tables), maps layer-specific status labels to 1–5 levels,
and determines briefing sentiment (bull/warn/bear/neutral) from trend + status.
"""


# L1 & L2: Trend/Liquidity 5-bậc (symmetric scale)
_L1_L2_LEVELS = {
    "Rất yếu": 1,
    "Yếu": 2,
    "Trung bình": 3,  # L1 also uses this
    "Bình thường": 3,  # L2 also uses this
    "Mạnh": 4,
    "Rất mạnh": 5,
}

# L3 & L4: Money Flow / Insider 5-bậc (warning/neutral/support scale)
_L3_L4_LEVELS = {
    "Cảnh báo mạnh": 1,
    "Cảnh báo nhẹ": 2,
    "Trung tính": 3,
    "Hỗ trợ nhẹ": 4,
    "Hỗ trợ mạnh": 5,
}

# L5: News 5-bậc (sentiment scale)
_L5_LEVELS = {
    "Rất tiêu cực": 1,
    "Tiêu cực": 2,
    "Trung tính": 3,
    "Tích cực": 4,
    "Rất tích cực": 5,
}

_LAYERS_MAP = {
    "L1": _L1_L2_LEVELS,
    "L2": _L1_L2_LEVELS,
    "L3": _L3_L4_LEVELS,
    "L4": _L3_L4_LEVELS,
    "L5": _L5_LEVELS,
}


def status_level(layer: str, status_label: str) -> int:
    """
    Map a layer-specific status label to a 1–5 level.

    Args:
        layer: One of "L1", "L2", "L3", "L4", "L5"
        status_label: The status label string (e.g., "Rất mạnh", "Trung tính")

    Returns:
        int: 1–5 representing the status level. Unknown label defaults to 3 (neutral).

    Spec reference: SPEC §2.2 (5-bậc tables).
    """
    if layer not in _LAYERS_MAP:
        return 3

    mapping = _LAYERS_MAP[layer]
    return mapping.get(status_label, 3)


def briefing_variant(trend: str, status_label: str) -> str:
    """
    Determine the briefing sentiment variant from trend + status.

    Logic per SPEC §3.6 (L6 logic):
    - bear: if trend contains "Giảm" (primary signal) OR status level ≤ 2 (when trend is not "Đi ngang")
    - bull: if trend contains "Tăng" AND status level ≥ 4
    - warn: for "Đi ngang" with weak status (level ≤ 2)
    - neutral: default

    Args:
        trend: Trend string (e.g., "Tăng", "Giảm", "Đi ngang")
        status_label: Status label (mapped via L1 scale for briefing sentiment)

    Returns:
        str: One of "bull", "warn", "bear", or "neutral".

    Spec reference: SPEC §3.6 (L6 briefing logic).
    """
    # Map status to level using L1 scale (as briefing uses L1 status)
    level = status_level("L1", status_label)

    # bear: trend is "Giảm"
    if "Giảm" in trend:
        return "bear"

    # bull: trend is "Tăng" AND status is strong (≥4)
    if "Tăng" in trend and level >= 4:
        return "bull"

    # warn: "Đi ngang" with weak status (≤2)
    if "Đi ngang" in trend and level <= 2:
        return "warn"

    # bear: status is weak (≤2) for non-"Đi ngang" trends
    if level <= 2:
        return "bear"

    # neutral: default
    return "neutral"
