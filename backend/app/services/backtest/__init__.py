"""Backtester: simulate a buy/sell strategy over adjusted daily history."""

from __future__ import annotations

from app.services.backtest.engine import RiskConfig, run_backtest

__all__ = ["RiskConfig", "run_backtest"]
