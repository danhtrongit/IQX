"""AI Insight Layer 6 — deterministic scoring from L1-L5 status text.

The AI proxy returns free-text-ish status fields per layer (see
``backend/docs/ai/ai-insight.md``). This module:

1. Extracts a canonical status string per layer from the AI's ``output`` dict.
2. Looks up the numeric score from per-layer tables agreed with the user
   (see ``docs/issues/ISSUE-012-ai-insight-layer6-scoring.md``).
3. Computes three aggregate KPIs displayed in Layer 6:
   - **totalPower**: sum(L1..L5) / 6.8 * 100 → range −100% … +100%
   - **reversalProbability**: (|L1|/1.0 + |L2+L3+L4+L5|/2.4) / 2 * 100 → 0 … 100%
   - **confidence**: 100 − reversalProbability → 0 … 100%

If a status cannot be extracted (AI output doesn't include the expected field
or value doesn't match any known option), we fall back to ``"Trung tính"`` /
score=0 and log a warning so the prompt can be tuned.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


# ── Score tables ──────────────────────────────────────────────────────────


L1_SCORES: dict[str, float] = {
    "Tăng + Mạnh": 1.0,
    "Tăng + Giằng co": 0.6,
    "Tăng + Yếu": 0.3,
    "Đi ngang": 0.0,
    "Giảm + Yếu": -0.3,
    "Giảm + Giằng co": -0.6,
    "Giảm + Mạnh": -1.0,
}

L2_SCORES: dict[str, float] = {
    "Cơ hội vào/ra thuận lợi": 0.8,
    "Quan tâm nhưng chưa thành GD": 0.5,
    "Trung tính": 0.0,
    "Thanh khoản yếu": -0.5,
    "Kẹt lệnh": -0.8,
}

L3_SCORES: dict[str, float] = {
    "Ủng hộ xu hướng": 0.7,
    "Trung tính": 0.0,
    "Cảnh báo nhiễu": -0.7,
}

L4_SCORES: dict[str, float] = {
    "Hỗ trợ nhẹ": 0.4,
    "Trung tính": 0.0,
    "Tăng thận trọng": -0.4,
}

L5_SCORES: dict[str, float] = {
    "Hỗ trợ tâm lý": 0.5,
    "Trung tính": 0.2,
    "Tăng biến động": -0.2,
    "Gây áp lực": -0.5,
}


# ── Per-layer extractors ──────────────────────────────────────────────────


def _norm(s: Any) -> str:
    """Lowercase + strip diacritics-light normalisation for matching."""
    if not isinstance(s, str):
        return ""
    return s.strip().lower()


def _extract_l1_status(output: dict[str, Any]) -> str:
    """Combine Xu hướng + Trạng thái → one of the L1 status options."""
    trend = _norm(output.get("Xu hướng") or output.get("trend"))
    state = _norm(output.get("Trạng thái") or output.get("state"))

    if "ngang" in trend:
        return "Đi ngang"

    if "tăng" in trend:
        direction = "Tăng"
    elif "giảm" in trend:
        direction = "Giảm"
    else:
        return "Đi ngang"

    if "mạnh" in state:
        return f"{direction} + Mạnh"
    if "yếu" in state:
        return f"{direction} + Yếu"
    if "giằng" in state or "rung" in state or "side" in state:
        return f"{direction} + Giằng co"
    # Default to medium strength when state is unclear
    return f"{direction} + Giằng co"


def _extract_l2_status(output: dict[str, Any]) -> str:
    """Combine Thanh khoản + Tác động → one of the L2 status options."""
    liq = _norm(output.get("Thanh khoản") or output.get("liquidity"))
    impact = _norm(output.get("Tác động") or output.get("impact"))
    blob = f"{liq} {impact}"

    if "kẹt" in blob:
        return "Kẹt lệnh"
    if "yếu" in liq or "suy yếu" in liq or "thanh khoản yếu" in blob:
        return "Thanh khoản yếu"
    if "thuận lợi" in blob or "cơ hội" in blob or "vào/ra" in blob:
        return "Cơ hội vào/ra thuận lợi"
    if "cải thiện" in liq or "quan tâm" in blob:
        return "Quan tâm nhưng chưa thành GD"
    return "Trung tính"


def _extract_l3_status(output: dict[str, Any]) -> str:
    """L3 — Money flow ``Tác động`` field."""
    impact = _norm(output.get("Tác động") or output.get("impact"))
    if "ủng hộ" in impact or "hỗ trợ xu hướng" in impact:
        return "Ủng hộ xu hướng"
    if "cảnh báo" in impact or "nhiễu" in impact:
        return "Cảnh báo nhiễu"
    return "Trung tính"


def _extract_l4_status(output: dict[str, Any]) -> str:
    """L4 — Insider ``Mức cảnh báo`` field."""
    level = _norm(output.get("Mức cảnh báo") or output.get("level"))
    if "thận trọng" in level or "tăng" in level:
        return "Tăng thận trọng"
    if "hỗ trợ" in level:
        return "Hỗ trợ nhẹ"
    return "Trung tính"


def _extract_l5_status(output: dict[str, Any]) -> str:
    """L5 — News ``Tác động`` field."""
    impact = _norm(output.get("Tác động") or output.get("impact"))
    if "hỗ trợ tâm lý" in impact or "tâm lý" in impact:
        return "Hỗ trợ tâm lý"
    if "gây áp lực" in impact or "áp lực" in impact:
        return "Gây áp lực"
    if "tăng biến động" in impact or "biến động" in impact:
        return "Tăng biến động"
    return "Trung tính"


# ── Score lookup ──────────────────────────────────────────────────────────


_LAYER_EXTRACTORS = {
    "trend":     (_extract_l1_status, L1_SCORES),
    "liquidity": (_extract_l2_status, L2_SCORES),
    "moneyFlow": (_extract_l3_status, L3_SCORES),
    "insider":   (_extract_l4_status, L4_SCORES),
    "news":      (_extract_l5_status, L5_SCORES),
}


def score_layer(layer_key: str, output: Any) -> tuple[str, float]:
    """Return ``(status, score)`` for one layer.

    Fallback: ``("Trung tính", 0.0)`` when ``output`` is missing or not a dict,
    or when the extracted status isn't in the table.
    """
    if layer_key not in _LAYER_EXTRACTORS:
        return ("Trung tính", 0.0)
    extractor, table = _LAYER_EXTRACTORS[layer_key]
    if not isinstance(output, dict):
        logger.debug("score_layer: %s output not a dict, falling back", layer_key)
        return ("Trung tính", table.get("Trung tính", 0.0))
    status = extractor(output)
    score = table.get(status)
    if score is None:
        logger.warning(
            "score_layer: %s extracted status %r not in table, falling back",
            layer_key, status,
        )
        return ("Trung tính", table.get("Trung tính", 0.0))
    return (status, score)


# ── Layer 6 aggregate ─────────────────────────────────────────────────────


def compute_layer6(scores: dict[str, float]) -> dict[str, float]:
    """Compute Layer 6 KPIs from per-layer scores.

    Args:
        scores: dict with keys trend, liquidity, moneyFlow, insider, news.

    Returns:
        dict with totalPower, reversalProbability, confidence — all rounded
        to 1 decimal.
    """
    s1 = float(scores.get("trend", 0.0))
    s2 = float(scores.get("liquidity", 0.0))
    s3 = float(scores.get("moneyFlow", 0.0))
    s4 = float(scores.get("insider", 0.0))
    s5 = float(scores.get("news", 0.0))

    total = s1 + s2 + s3 + s4 + s5
    total_power = total / 6.8 * 100

    reversal = (abs(s1) / 1.0 + abs(s2 + s3 + s4 + s5) / 2.4) / 2 * 100
    reversal = max(0.0, min(100.0, reversal))
    confidence = 100.0 - reversal

    return {
        "totalPower": round(total_power, 1),
        "reversalProbability": round(reversal, 1),
        "confidence": round(confidence, 1),
    }


def score_all_layers(layers: dict[str, Any]) -> tuple[dict[str, dict], dict[str, float]]:
    """Score every layer and compute Layer 6 aggregate in one call.

    Args:
        layers: ``layers`` dict from the AI response. Each entry has
            ``{label, output}``.

    Returns:
        ``(layer_scores, layer6_aggregate)`` where ``layer_scores`` maps
        ``layer_key`` → ``{status, score}``.
    """
    layer_scores: dict[str, dict] = {}
    raw_scores: dict[str, float] = {}
    for key in _LAYER_EXTRACTORS:
        layer = layers.get(key) if isinstance(layers, dict) else None
        output = layer.get("output") if isinstance(layer, dict) else None
        status, score = score_layer(key, output)
        layer_scores[key] = {"status": status, "score": score}
        raw_scores[key] = score
    aggregate = compute_layer6(raw_scores)
    return layer_scores, aggregate
