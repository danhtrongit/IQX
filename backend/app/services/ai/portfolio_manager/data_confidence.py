"""Per-ticker data-confidence gate (spec §4). Protects risk metrics from thin data."""

from __future__ import annotations

from .config import DATA_CONF_MIN_AVG_VALUE_VND, DATA_CONF_MIN_HISTORY

LOW_DATA_REASON = "low_liquidity_short_history"


def evaluate_confidence(bars: list[dict]) -> tuple[bool, str | None]:
    if len(bars) < DATA_CONF_MIN_HISTORY:
        return False, LOW_DATA_REASON
    last20 = bars[-20:]
    if not last20:
        return False, LOW_DATA_REASON
    avg_value = sum(float(b["close"]) * float(b["volume"]) for b in last20) / len(last20)
    if avg_value < DATA_CONF_MIN_AVG_VALUE_VND:
        return False, LOW_DATA_REASON
    return True, None
