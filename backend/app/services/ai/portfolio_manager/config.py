"""Configuration constants for the Portfolio Manager engine (spec §12)."""

from __future__ import annotations

RISK_LOOKBACK_DAYS = 120
DATA_CONF_MIN_HISTORY = 120
DATA_CONF_MIN_AVG_VALUE_VND = 2_000_000_000
SECTOR_BENCH_THRESHOLD = 0.25
CHANGED_WEIGHT_THRESHOLD = 0.03
HIDDEN_CORR_MIN = 0.75
PROFIT_CONCENTRATION_MIN = 0.60
SECTOR_TILT_RATIO_MIN = 3.0
CASH_DRY_MAX = 0.05
LLM_TEMPERATURE = 0.5
ANNUALIZE_FACTOR = 252

# IQX integration constant (NOT a spec §12 value): below this many positions we return
# `insufficient_data` instead of a report. SECTOR_BENCH_THRESHOLD above is a §12 constant
# reserved for the deferred conditional sector-benchmark (Layer 07) — see design deferred list.
MIN_POSITIONS_FOR_ANALYSIS = 2
