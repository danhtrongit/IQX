"""Portfolio Manager — deterministic quant tier + AI narrative tier."""

from .analysis import build_analysis
from .generator import generate_report

__all__ = ["build_analysis", "generate_report"]
