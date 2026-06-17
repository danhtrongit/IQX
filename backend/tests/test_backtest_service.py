"""Tests for the backtester orchestration service (translation + wiring)."""

from __future__ import annotations

import numpy as np
import pytest

from app.schemas.backtest import (
    BacktestRunRequest,
    FactorSelection,
    RiskInput,
    StrategySide,
)
from app.services.backtest import service as svc
from app.services.backtest.templates import TEMPLATES
from app.services.ta.catalog import resolve_factor
from app.services.ta.indicators import OHLCV


def _series() -> OHLCV:
    # Rise for 260 bars then fall for 60 -> crosses MA50 both ways
    closes = [100 + i * 0.2 for i in range(260)] + [max(152 - i * 0.5, 80) for i in range(60)]
    n = len(closes)
    return OHLCV(
        time=[f"2020-{1 + i // 28:02d}-{1 + i % 28:02d}" for i in range(n)],
        open=np.array([float(c) for c in closes]),
        high=np.array([c * 1.01 for c in closes]),
        low=np.array([c * 0.99 for c in closes]),
        close=np.array([float(c) for c in closes]),
        volume=np.array([1_000_000.0 + (i % 5) * 1000 for i in range(n)]),
    )


async def _fake_data(symbol, start, end, **kw):  # noqa: ANN001
    return _series(), 252


def test_catalog_payload_shape():
    payload = svc.catalog_payload()
    assert "factors" in payload and "templates" in payload and "risk_presets" in payload
    assert payload["factors"]["count"] > 30
    assert len(payload["templates"]) >= 3
    assert {"stop_loss", "take_profit", "position_size", "fee"} <= set(payload["risk_presets"])


def test_every_template_resolves():
    for tpl in TEMPLATES:
        for side in ("buy", "sell"):
            for sel in tpl["config"][side]["factors"]:
                resolve_factor(sel["id"], sel.get("value"))  # raises if invalid


async def test_run_request_returns_payload(monkeypatch):
    monkeypatch.setattr(svc, "get_adjusted_ohlcv", _fake_data)
    req = BacktestRunRequest(
        symbol="fpt",
        start="2020-01-01",
        end="2025-12-31",
        capital=100_000_000,
        buy=StrategySide(logic="AND", factors=[FactorSelection(id="close_above_ma50")]),
        sell=StrategySide(logic="OR", factors=[FactorSelection(id="close_below_ma50")]),
        risk=RiskInput(),
    )
    out = await svc.run_backtest_request(req, use_cache=False)
    assert out["meta"]["symbol"] == "FPT"
    assert {"kpis", "equity_curve", "trades"} <= set(out)
    assert out["kpis"]["n_sessions"] > 0
    assert isinstance(out["trades"], list)
    # rise-then-fall + MA50 cross should produce at least one round-trip trade
    assert out["kpis"]["n_trades"] >= 1


async def test_run_request_rejects_unknown_factor(monkeypatch):
    monkeypatch.setattr(svc, "get_adjusted_ohlcv", _fake_data)
    req = BacktestRunRequest(
        symbol="FPT",
        start="2020-01-01",
        end="2025-12-31",
        buy=StrategySide(factors=[FactorSelection(id="does_not_exist")]),
        sell=StrategySide(),
    )
    with pytest.raises(KeyError):
        await svc.run_backtest_request(req, use_cache=False)


async def test_run_request_rejects_empty_buy(monkeypatch):
    from app.services.ta.conditions import CombinationError

    monkeypatch.setattr(svc, "get_adjusted_ohlcv", _fake_data)
    req = BacktestRunRequest(
        symbol="FPT",
        start="2020-01-01",
        end="2025-12-31",
        buy=StrategySide(factors=[]),
        sell=StrategySide(),
    )
    with pytest.raises(CombinationError):
        await svc.run_backtest_request(req, use_cache=False)
