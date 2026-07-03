"""IQX daily VN-Index AI market-analysis generator (spec V1 final).

Public entry: `generate_analysis()` — build payload → classify → prompt
DeepSeek → validate. No DB persistence in this trial build.
"""

from .generator import generate_analysis, run_daily_analysis, run_midday_analysis, run_premarket_analysis
from .payload import build_analysis_payload

__all__ = [
    "generate_analysis",
    "run_daily_analysis",
    "run_midday_analysis",
    "run_premarket_analysis",
    "build_analysis_payload",
]
