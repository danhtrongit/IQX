"""Backtester orchestration: request -> fetch adjusted data -> run -> payload."""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from app.schemas.backtest import BacktestRunRequest, RiskInput, StrategySide
from app.services.backtest.engine import RiskConfig, run_backtest
from app.services.backtest.templates import TEMPLATES
from app.services.cache.redis_cache import cache_get_json, cache_set_json
from app.services.ta.catalog import factor_library_payload, resolve_factor
from app.services.ta.conditions import Combination, build_frame, validate_combination
from app.services.ta.data import get_adjusted_ohlcv

logger = logging.getLogger(__name__)

_RESULT_TTL = 600  # cache a run for 10 minutes by config-hash

_FEES = {
    "standard": (0.0015, 0.0025),  # buy 0.15%, sell 0.25% (incl. 0.1% tax)
    "low": (0.0010, 0.0010),
}


def _build_combination(side: StrategySide) -> Combination:
    conditions = [resolve_factor(f.id, f.value) for f in side.factors]
    return Combination(logic=side.logic, conditions=conditions)


def _build_risk(r: RiskInput) -> RiskConfig:
    fee_buy, fee_sell = _FEES.get(r.fee, _FEES["standard"])
    return RiskConfig(
        stop_loss=r.stop_loss,
        stop_atr_mult=r.stop_atr_mult,
        stop_fixed_pct=r.stop_fixed_pct,
        take_profit_pct=r.take_profit_pct,
        max_holding=r.max_holding,
        position_size=r.position_size,
        position_fixed_amount=r.position_fixed_amount,
        fee_buy=fee_buy,
        fee_sell=fee_sell,
    )


def _config_hash(req: BacktestRunRequest) -> str:
    payload = req.model_dump()
    blob = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.md5(blob.encode()).hexdigest()  # noqa: S324 - cache key only


def catalog_payload() -> dict[str, Any]:
    """Factor library + risk presets + templates for the UI."""
    return {
        "factors": factor_library_payload(),
        "templates": [
            {"key": t["key"], "name": t["name"], "description": t["description"], "config": t["config"]}
            for t in TEMPLATES
        ],
        "risk_presets": {
            "stop_loss": [
                {"value": "atr", "mult": 2.0, "label": "2.0× ATR"},
                {"value": "atr", "mult": 1.5, "label": "1.5× ATR"},
                {"value": "atr", "mult": 3.0, "label": "3.0× ATR"},
                {"value": "fixed", "pct": 0.05, "label": "Cố định 5%"},
                {"value": "none", "label": "Không có"},
            ],
            "take_profit": [
                {"value": None, "label": "Không (theo signal)"},
                {"value": 0.10, "label": "10%"},
                {"value": 0.15, "label": "15%"},
                {"value": 0.20, "label": "20%"},
            ],
            "position_size": [
                {"value": "all", "label": "100% vốn còn lại"},
                {"value": "half", "label": "50% vốn còn lại"},
                {"value": "fixed", "amount": 10_000_000, "label": "Cố định 10tr/lệnh"},
            ],
            "fee": [
                {"value": "standard", "label": "Chuẩn (0.15% + 0.1%)"},
                {"value": "low", "label": "Thấp (0.10%)"},
            ],
        },
    }


async def run_backtest_request(req: BacktestRunRequest, *, use_cache: bool = True) -> dict[str, Any]:
    """Validate, fetch data, run the engine, return a JSON-serializable payload."""
    buy = _build_combination(req.buy)
    validate_combination(buy)  # raises CombinationError on bad input
    sell = _build_combination(req.sell)
    if sell.conditions:
        validate_combination(sell)
    risk = _build_risk(req.risk)

    cache_key = f"bt:run:{_config_hash(req)}"
    if use_cache:
        cached = await cache_get_json(cache_key)
        if isinstance(cached, dict):
            return cached

    data, start_index = await get_adjusted_ohlcv(req.symbol, req.start, req.end)
    frame = build_frame(data)
    run = run_backtest(data, frame, buy, sell, risk, capital=req.capital, start_index=start_index)

    traded = data.time[start_index:] if start_index < len(data.time) else []
    payload: dict[str, Any] = {
        "meta": {
            "symbol": req.symbol,
            "start": traded[0] if len(traded) else req.start,
            "end": traded[-1] if len(traded) else req.end,
            "n_sessions": run.kpis.get("n_sessions", 0),
            "capital": req.capital,
        },
        **run.to_dict(),
    }
    if use_cache and run.kpis.get("n_sessions", 0) > 0:
        await cache_set_json(cache_key, payload, _RESULT_TTL)
    return payload
