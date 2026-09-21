"""Pure deterministic rules for IQX Bot v1.

No function in this module performs I/O, mutates an account, or guesses a
missing market value.  It is shared by the live batch service and fixtures.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from app.models.cap4 import LOP_KEYS
from app.services.bot.config import STANDARD_RULES, BotRules

Verdict = Literal["ok", "neu", "bad"]
FILTER_IDS = (
    "khoi_ngoai_gom",
    "tu_doanh_gom",
    "kl_dot_bien",
    "vuot_dinh_20",
    "tang_manh_kl",
)
SOURCE_FILTER_IDS = {
    "ngoai": "khoi_ngoai_gom",
    "tudoanh": "tu_doanh_gom",
    "kl": "kl_dot_bien",
    "dinh": "vuot_dinh_20",
    "tang": "tang_manh_kl",
}


def decimal_value(value: object) -> Decimal | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return result if result.is_finite() else None


@dataclass(frozen=True)
class LayerEvidence:
    verdict: Verdict
    raw_level: str
    is_very_negative: bool | None
    source_ref: str


@dataclass(frozen=True)
class Candidate:
    symbol: str
    close_vnd: int
    trading_value_avg20_vnd: int
    filter_ids: tuple[str, ...]
    layers: Mapping[str, LayerEvidence]
    l1_amplitude_vnd: Decimal | None
    l1_amplitude_source_ref: str | None
    source_refs: Mapping[str, Any] = field(default_factory=dict)

    @property
    def supporting_count(self) -> int:
        return sum(layer.verdict == "ok" for layer in self.layers.values())

    @property
    def rank_tuple(self) -> tuple[int, int, int, str]:
        return (
            -self.supporting_count,
            -len(self.filter_ids),
            -self.trading_value_avg20_vnd,
            self.symbol,
        )


@dataclass(frozen=True)
class GateResult:
    allowed: bool
    reason_code: str
    missing_layers: tuple[str, ...] = ()


@dataclass(frozen=True)
class FeeRules:
    buy_fee_rate_bps: int
    sell_fee_rate_bps: int
    sell_tax_rate_bps: int
    board_lot_size: int
    source_ref: str

    def validate(self) -> None:
        if self.board_lot_size <= 0:
            raise ValueError("board_lot_size phải lớn hơn 0")
        if min(self.buy_fee_rate_bps, self.sell_fee_rate_bps, self.sell_tax_rate_bps) < 0:
            raise ValueError("phí/thuế không được âm")


@dataclass(frozen=True)
class SizingResult:
    quantity: int
    gross_vnd: int
    fee_vnd: int
    total_vnd: int
    reason_code: str | None = None


def round_bps(amount_vnd: int, rate_bps: int) -> int:
    """Mirror the project's integer-VND, round-half-up fee convention."""
    if amount_vnd < 0 or rate_bps < 0:
        raise ValueError("Số tiền và basis points không được âm")
    return (amount_vnd * rate_bps + 5000) // 10000


def candidate_gate(candidate: Candidate, rules: BotRules = STANDARD_RULES) -> GateResult:
    missing = tuple(layer for layer in LOP_KEYS if layer not in candidate.layers)
    if missing:
        return GateResult(False, "missing_layers", missing)
    if any(candidate.layers[layer].verdict not in ("ok", "neu", "bad") for layer in LOP_KEYS):
        return GateResult(False, "missing_layers")
    for layer in ("tin_tuc", "noi_bo"):
        if candidate.layers[layer].is_very_negative is None:
            return GateResult(False, "missing_veto_severity")
        if candidate.layers[layer].is_very_negative:
            return GateResult(False, "veto_very_negative")
    if candidate.supporting_count < rules.min_supporting_layers:
        return GateResult(False, "below_support_gate")
    return GateResult(True, "eligible")


def rank_candidates(
    candidates: Sequence[Candidate], rules: BotRules = STANDARD_RULES
) -> list[Candidate]:
    """Deduplicate by normalized symbol, gate, cap at 50, then stable-sort."""
    unique: dict[str, Candidate] = {}
    for candidate in candidates:
        symbol = candidate.symbol.strip().upper()
        if not symbol:
            continue
        previous = unique.get(symbol)
        normalized = Candidate(
            symbol=symbol,
            close_vnd=candidate.close_vnd,
            trading_value_avg20_vnd=candidate.trading_value_avg20_vnd,
            filter_ids=tuple(sorted(set(candidate.filter_ids))),
            layers=candidate.layers,
            l1_amplitude_vnd=candidate.l1_amplitude_vnd,
            l1_amplitude_source_ref=candidate.l1_amplitude_source_ref,
            source_refs=candidate.source_refs,
        )
        if previous is None or normalized.rank_tuple < previous.rank_tuple:
            unique[symbol] = normalized
    # The union itself is capped before the gate; this protects malformed adapters.
    union = sorted(unique.values(), key=lambda row: row.symbol)[: rules.max_unique_candidates]
    return sorted((row for row in union if candidate_gate(row, rules).allowed), key=lambda row: row.rank_tuple)


def compute_exit_thresholds(
    entry_price_vnd: int,
    amplitude_vnd: Decimal | int | float | str | None,
    rules: BotRules = STANDARD_RULES,
) -> tuple[Decimal, Decimal] | None:
    amplitude = decimal_value(amplitude_vnd)
    entry = Decimal(entry_price_vnd)
    if entry <= 0 or amplitude is None or amplitude <= 0:
        return None
    stop = entry - Decimal(rules.stop_loss_l1_multiplier) * amplitude
    take = entry + Decimal(rules.take_profit_l1_multiplier) * amplitude
    if not (Decimal(0) < stop < entry < take):
        return None
    return stop, take


def exit_signal(
    close_vnd: int | None,
    stop_loss_vnd: Decimal,
    take_profit_vnd: Decimal,
) -> Literal["stop_loss", "take_profit"] | None:
    if close_vnd is None or close_vnd <= 0:
        return None
    close = Decimal(close_vnd)
    if close <= stop_loss_vnd:
        return "stop_loss"
    if close >= take_profit_vnd:
        return "take_profit"
    return None


def compute_buy_quantity(
    *,
    nav_basis_vnd: int,
    cash_available_vnd: int,
    price_vnd: int,
    existing_symbol_value_vnd: int = 0,
    fees_paid_in_batch_vnd: int = 0,
    fee_rules: FeeRules,
    rules: BotRules = STANDARD_RULES,
) -> SizingResult:
    """Largest board lot satisfying budget, cash and 30%-of-NAV constraints."""
    fee_rules.validate()
    if nav_basis_vnd <= 0 or cash_available_vnd <= 0 or price_vnd <= 0:
        return SizingResult(0, 0, 0, 0, "insufficient_cash")
    budget = nav_basis_vnd * rules.buy_budget_nav_pct // 100
    max_total = min(budget, cash_available_vnd)
    lots = max_total // (price_vnd * fee_rules.board_lot_size)
    while lots > 0:
        quantity = lots * fee_rules.board_lot_size
        gross = quantity * price_vnd
        fee = round_bps(gross, fee_rules.buy_fee_rate_bps)
        total = gross + fee
        proposed_nav = nav_basis_vnd - fees_paid_in_batch_vnd - fee
        within_weight = (
            proposed_nav > 0
            and (existing_symbol_value_vnd + gross) * 100
            <= rules.max_symbol_nav_pct * proposed_nav
        )
        if total <= budget and total <= cash_available_vnd and within_weight:
            return SizingResult(quantity, gross, fee, total)
        lots -= 1
    reason = "below_board_lot"
    if price_vnd * fee_rules.board_lot_size <= max_total:
        reason = "symbol_weight_limit"
    elif max_total < price_vnd * fee_rules.board_lot_size:
        reason = "below_board_lot" if cash_available_vnd >= price_vnd else "insufficient_cash"
    return SizingResult(0, 0, 0, 0, reason)


def compute_l1_amplitude(
    ohlcv: Sequence[Mapping[str, object]], period: int = 14
) -> Decimal | None:
    """Reference implementation of Cấp 2's displayed volatility formula.

    The live Bot adapter does not use this helper as a substitute for the
    canonical L1 value required by Bot v1.
    """
    if period <= 0 or len(ohlcv) < period + 1:
        return None
    bars = ohlcv[-(period + 1) :]
    ranges: list[Decimal] = []
    for index in range(1, len(bars)):
        high = decimal_value(bars[index].get("high"))
        low = decimal_value(bars[index].get("low"))
        previous_close = decimal_value(bars[index - 1].get("close"))
        if high is None or low is None or previous_close is None:
            return None
        if high <= 0 or low <= 0 or previous_close <= 0 or high < low:
            return None
        ranges.append(max(high - low, abs(high - previous_close), abs(low - previous_close)))
    amplitude = sum(ranges, Decimal(0)) / Decimal(len(ranges)) if ranges else None
    return amplitude if amplitude is not None and amplitude > 0 else None


def canonical_hash(payload: Mapping[str, Any]) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def finite_positive_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or number <= 0:
        return None
    return int(round(number))
