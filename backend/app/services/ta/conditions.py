"""Condition / combination model shared by backtester strategies and alert signals.

A ``Condition`` compares one field (an indicator or a raw price field) against a
numeric threshold or another field. A ``Combination`` joins conditions with a
single ``AND``/``OR`` logic (flat model, v1 — see spec §5.1). Evaluation works on
a *feature frame* (``build_frame``) either across the whole series (backtest) or
at the latest bar (alerts).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, cast

import numpy as np
from numpy.typing import NDArray

from app.services.ta.indicators import (
    BINARY_INDICATORS,
    INDICATORS,
    OHLCV,
    compute_indicators,
)

FloatArray = NDArray[np.float64]
BoolArray = NDArray[np.bool_]

#: Raw OHLCV fields that conditions may reference in addition to the 38 indicators.
RAW_FIELDS: tuple[str, ...] = ("close", "open", "high", "low", "volume")

#: Every field a condition may name (left side or, for field-vs-field, right side).
REFERENCEABLE: frozenset[str] = frozenset(INDICATORS) | frozenset(RAW_FIELDS)

COMPARATORS: frozenset[str] = frozenset({">", "<", ">=", "<=", "=="})
CROSS_OPS: frozenset[str] = frozenset({"cross_above", "cross_below"})
ALL_OPS: frozenset[str] = COMPARATORS | CROSS_OPS | frozenset({"is_true"})

LOGIC_AND = "AND"
LOGIC_OR = "OR"


# ── Model ────────────────────────────────────────────────────────────────────


@dataclass(slots=True)
class Condition:
    """One comparison: ``indicator <op> value``.

    ``value`` is a number, ``None`` (for ``is_true``), or a field name (str) for
    a field-vs-field comparison (e.g. ``close > ma_50``). ``join`` is the boolean
    connector to the PREVIOUS condition (``AND``/``OR``); ignored on the first
    condition. When absent it falls back to the combination's ``logic``.
    """

    indicator: str
    op: str
    value: float | str | None = None
    join: str | None = None

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> Condition:
        join = raw.get("join")
        return cls(
            indicator=str(raw["indicator"]),
            op=str(raw["op"]),
            value=raw.get("value"),
            join=str(join).upper() if join else None,
        )

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"indicator": self.indicator, "op": self.op, "value": self.value}
        if self.join:
            out["join"] = self.join
        return out


@dataclass(slots=True)
class Combination:
    """An AND/OR set of conditions.

    ``logic`` is the DEFAULT connector; individual conditions may override it via
    their ``join`` field, giving mixed logic. Evaluation uses standard precedence
    (AND binds tighter than OR): consecutive AND-joined conditions form a group,
    and the groups are OR-ed together (sum-of-products).
    """

    logic: str = LOGIC_AND
    conditions: list[Condition] = field(default_factory=list)

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> Combination:
        logic = str(raw.get("logic", LOGIC_AND)).upper()
        conds = [Condition.from_dict(c) for c in raw.get("conditions", [])]
        return cls(logic=logic, conditions=conds)

    def to_dict(self) -> dict[str, Any]:
        return {"logic": self.logic, "conditions": [c.to_dict() for c in self.conditions]}


# ── Frame ────────────────────────────────────────────────────────────────────


def build_frame(data: OHLCV) -> dict[str, FloatArray]:
    """Feature frame = the 38 indicators plus raw OHLCV fields."""
    frame = compute_indicators(data)
    frame["close"] = data.close
    frame["open"] = data.open
    frame["high"] = data.high
    frame["low"] = data.low
    frame["volume"] = data.volume
    return frame


# ── Validation ───────────────────────────────────────────────────────────────


class CombinationError(ValueError):
    """Raised when a combination references unknown fields or invalid ops."""


def validate_condition(cond: Condition) -> None:
    if cond.indicator not in REFERENCEABLE:
        raise CombinationError(f"Chỉ số không hợp lệ: {cond.indicator!r}")
    if cond.op not in ALL_OPS:
        raise CombinationError(f"Toán tử không hợp lệ: {cond.op!r}")
    if cond.join is not None and cond.join not in (LOGIC_AND, LOGIC_OR):
        raise CombinationError(f"Liên kết phải là AND/OR, nhận {cond.join!r}")
    if cond.op == "is_true":
        if cond.indicator not in BINARY_INDICATORS:
            raise CombinationError(f"'is_true' chỉ dùng cho chỉ số nhị phân, không phải {cond.indicator!r}")
        return
    # comparator / cross need a value (number or field name)
    if cond.value is None:
        raise CombinationError(f"Điều kiện {cond.indicator} {cond.op} thiếu ngưỡng")
    if isinstance(cond.value, str) and cond.value not in REFERENCEABLE:
        raise CombinationError(f"Trường so sánh không hợp lệ: {cond.value!r}")
    if cond.op in CROSS_OPS and cond.indicator in BINARY_INDICATORS:
        raise CombinationError(f"Không thể dùng cross trên chỉ số nhị phân {cond.indicator!r}")


def validate_combination(comb: Combination) -> None:
    if comb.logic not in (LOGIC_AND, LOGIC_OR):
        raise CombinationError(f"Logic phải là AND/OR, nhận {comb.logic!r}")
    if not comb.conditions:
        raise CombinationError("Tổ hợp phải có ít nhất 1 điều kiện")
    for cond in comb.conditions:
        validate_condition(cond)


# ── Evaluation ───────────────────────────────────────────────────────────────


def _rhs(frame: dict[str, FloatArray], value: float | str | None, n: int) -> FloatArray:
    if isinstance(value, str):
        return frame[value]
    if value is None:  # defensive — validation forbids this for comparator/cross ops
        return np.full(n, np.nan, dtype=np.float64)
    return np.full(n, float(value), dtype=np.float64)


def eval_condition_series(frame: dict[str, FloatArray], cond: Condition) -> BoolArray:
    """Boolean array (per bar). nan operands -> False (bar not eligible)."""
    lhs = frame[cond.indicator]
    n = len(lhs)
    out = np.zeros(n, dtype=bool)

    if cond.op == "is_true":
        valid = ~np.isnan(lhs)
        out[valid] = lhs[valid] == 1.0
        return out

    rhs = _rhs(frame, cond.value, n)

    if cond.op in CROSS_OPS:
        lhs_prev = np.full(n, np.nan)
        lhs_prev[1:] = lhs[:-1]
        rhs_prev = np.full(n, np.nan)
        rhs_prev[1:] = rhs[:-1]
        valid = ~(np.isnan(lhs) | np.isnan(rhs) | np.isnan(lhs_prev) | np.isnan(rhs_prev))
        with np.errstate(invalid="ignore"):
            if cond.op == "cross_above":
                cond_arr = (lhs > rhs) & (lhs_prev <= rhs_prev)
            else:  # cross_below
                cond_arr = (lhs < rhs) & (lhs_prev >= rhs_prev)
        out[valid] = cond_arr[valid]
        return out

    valid = ~(np.isnan(lhs) | np.isnan(rhs))
    with np.errstate(invalid="ignore"):
        if cond.op == ">":
            cond_arr = lhs > rhs
        elif cond.op == "<":
            cond_arr = lhs < rhs
        elif cond.op == ">=":
            cond_arr = lhs >= rhs
        elif cond.op == "<=":
            cond_arr = lhs <= rhs
        else:  # "=="
            cond_arr = lhs == rhs
    out[valid] = cond_arr[valid]
    return out


def evaluate_series(frame: dict[str, FloatArray], comb: Combination) -> BoolArray:
    """Evaluate a combination across every bar -> boolean array.

    Mixed logic with standard precedence: consecutive AND-joined conditions form a
    group; groups are OR-ed (sum-of-products). Each condition's connector is its
    ``join`` (falling back to ``comb.logic``); the first condition's join is the
    group seed. With a single uniform logic this reduces to flat AND / flat OR.
    """
    if not comb.conditions:
        n = len(next(iter(frame.values()))) if frame else 0
        return np.zeros(n, dtype=bool)

    default = LOGIC_OR if comb.logic == LOGIC_OR else LOGIC_AND
    groups: list[list[BoolArray]] = [[eval_condition_series(frame, comb.conditions[0])]]
    for cond in comb.conditions[1:]:
        join = (cond.join or default).upper()
        series = eval_condition_series(frame, cond)
        if join == LOGIC_OR:
            groups.append([series])
        else:  # AND → extend the current group
            groups[-1].append(series)

    group_results = [np.vstack(g).all(axis=0) for g in groups]
    combined = np.vstack(group_results).any(axis=0)
    return cast(BoolArray, combined)


def evaluate_latest(frame: dict[str, FloatArray], comb: Combination) -> bool:
    """Evaluate a combination on the most-recent bar only."""
    series = evaluate_series(frame, comb)
    if len(series) == 0:
        return False
    return bool(series[-1])
