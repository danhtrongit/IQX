"""Tests for the condition/combination evaluator (spec §3)."""

from __future__ import annotations

import numpy as np
import pytest

from app.services.ta.conditions import (
    Combination,
    CombinationError,
    Condition,
    build_frame,
    eval_condition_series,
    evaluate_latest,
    evaluate_series,
    validate_combination,
)
from app.services.ta.indicators import OHLCV


def _frame(**arrays) -> dict[str, np.ndarray]:
    return {k: np.array(v, dtype=float) for k, v in arrays.items()}


# ── Operators ────────────────────────────────────────────────────────────────


def test_comparator_ops_and_nan_is_false():
    frame = _frame(rsi_14=[np.nan, 25.0, 50.0, 80.0])
    gt = eval_condition_series(frame, Condition("rsi_14", ">", 49))
    assert list(gt) == [False, False, True, True]
    lt = eval_condition_series(frame, Condition("rsi_14", "<", 30))
    assert list(lt) == [False, True, False, False]  # nan -> False
    le = eval_condition_series(frame, Condition("rsi_14", "<=", 50))
    assert list(le) == [False, True, True, False]


def test_is_true_on_binary():
    frame = _frame(uptrend=[np.nan, 0.0, 1.0, 1.0])
    res = eval_condition_series(frame, Condition("uptrend", "is_true"))
    assert list(res) == [False, False, True, True]


def test_cross_above_and_below_against_value():
    frame = _frame(rsi_14=[40.0, 48.0, 52.0, 49.0, 55.0])
    up = eval_condition_series(frame, Condition("rsi_14", "cross_above", 50))
    # cross_above 50: prev<=50 and now>50 -> bar 2 (48->52); bar4 (49->55)
    assert list(up) == [False, False, True, False, True]
    down = eval_condition_series(frame, Condition("rsi_14", "cross_below", 50))
    # bar3: 52->49 crosses below
    assert list(down) == [False, False, False, True, False]


def test_field_vs_field_comparison():
    frame = _frame(close=[10.0, 11.0, 9.0], ma_50=[10.5, 10.5, 10.5])
    res = eval_condition_series(frame, Condition("close", ">", "ma_50"))
    assert list(res) == [False, True, False]


# ── Combinations ─────────────────────────────────────────────────────────────


def test_and_or_logic():
    frame = _frame(
        rsi_14=[20.0, 35.0, 28.0],
        uptrend=[1.0, 1.0, 0.0],
    )
    comb_and = Combination("AND", [Condition("rsi_14", "<", 30), Condition("uptrend", "is_true")])
    assert list(evaluate_series(frame, comb_and)) == [True, False, False]
    comb_or = Combination("OR", [Condition("rsi_14", "<", 30), Condition("uptrend", "is_true")])
    assert list(evaluate_series(frame, comb_or)) == [True, True, True]


def test_evaluate_latest():
    frame = _frame(rsi_14=[20.0, 35.0, 25.0])
    comb = Combination("AND", [Condition("rsi_14", "<", 30)])
    assert evaluate_latest(frame, comb) is True
    comb2 = Combination("AND", [Condition("rsi_14", ">", 30)])
    assert evaluate_latest(frame, comb2) is False


def test_empty_combination_evaluates_false():
    frame = _frame(rsi_14=[20.0, 35.0])
    assert list(evaluate_series(frame, Combination("AND", []))) == [False, False]


# ── Validation ───────────────────────────────────────────────────────────────


def test_validate_rejects_unknown_indicator():
    with pytest.raises(CombinationError):
        validate_combination(Combination("AND", [Condition("not_a_thing", ">", 1)]))


def test_validate_rejects_is_true_on_numeric():
    with pytest.raises(CombinationError):
        validate_combination(Combination("AND", [Condition("rsi_14", "is_true")]))


def test_validate_rejects_cross_on_binary():
    with pytest.raises(CombinationError):
        validate_combination(Combination("AND", [Condition("uptrend", "cross_above", 1)]))


def test_validate_rejects_missing_value():
    with pytest.raises(CombinationError):
        validate_combination(Combination("AND", [Condition("rsi_14", ">", None)]))


def test_validate_rejects_unknown_rhs_field():
    with pytest.raises(CombinationError):
        validate_combination(Combination("AND", [Condition("close", ">", "bogus_field")]))


def test_validate_rejects_bad_logic():
    with pytest.raises(CombinationError):
        validate_combination(Combination("XOR", [Condition("rsi_14", ">", 1)]))


def test_validate_accepts_valid_combination():
    comb = Combination(
        "AND",
        [
            Condition("uptrend", "is_true"),
            Condition("rsi_14", "<", 45),
            Condition("close", ">", "ma_50"),
            Condition("rsi_14", "cross_above", 50),
        ],
    )
    validate_combination(comb)  # no raise


# ── Roundtrip + frame ────────────────────────────────────────────────────────


def test_combination_dict_roundtrip():
    raw = {
        "logic": "OR",
        "conditions": [
            {"indicator": "breakout_20d", "op": "is_true", "value": None},
            {"indicator": "vol_zscore", "op": ">", "value": 1.5},
        ],
    }
    comb = Combination.from_dict(raw)
    assert comb.logic == "OR"
    assert comb.conditions[1].value == 1.5
    assert comb.to_dict() == raw


def test_build_frame_includes_raw_fields_and_indicators():
    closes = [100 + i for i in range(60)]
    frame = build_frame(
        OHLCV(
            time=[str(i) for i in range(60)],
            open=np.array([float(c) for c in closes]),
            high=np.array([c * 1.01 for c in closes]),
            low=np.array([c * 0.99 for c in closes]),
            close=np.array([float(c) for c in closes]),
            volume=np.array([1000.0] * 60),
        )
    )
    assert "close" in frame and "ma_20" in frame and "rsi_14" in frame
    assert len(frame["close"]) == 60
