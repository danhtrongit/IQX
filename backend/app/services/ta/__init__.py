"""Technical-analysis engine shared by the backtester and the alert system.

Pure, dependency-light (numpy only). Computes the 38 indicators defined in
``docs/superpowers/specs/2026-06-17-strategy-lab-alerts-design.md`` (§2) from
adjusted daily OHLCV, and evaluates condition combinations over them.
"""

from __future__ import annotations

from app.services.ta.conditions import (
    Combination,
    Condition,
    evaluate_latest,
    evaluate_series,
    validate_combination,
)
from app.services.ta.indicators import (
    BINARY_INDICATORS,
    INDICATORS,
    NUMERIC_INDICATORS,
    OHLCV,
    compute_indicators,
    latest_indicator_values,
)

__all__ = [
    "BINARY_INDICATORS",
    "INDICATORS",
    "NUMERIC_INDICATORS",
    "OHLCV",
    "Combination",
    "Condition",
    "compute_indicators",
    "evaluate_latest",
    "evaluate_series",
    "latest_indicator_values",
    "validate_combination",
]
