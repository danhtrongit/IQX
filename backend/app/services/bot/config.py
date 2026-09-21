"""Frozen, product-owned IQX standard strategy v1 configuration."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class BotRules:
    strategy_id: str = "iqx_standard"
    strategy_version: int = 1
    execution_model: str = "same_session_close"
    initial_cash_vnd: int = 100_000_000
    min_supporting_layers: int = 3
    max_results_per_filter: int = 10
    max_unique_candidates: int = 50
    max_new_buys_per_session: int = 2
    buy_budget_nav_pct: int = 12
    buy_budget_includes_fee: bool = True
    max_symbol_nav_pct: int = 30
    stop_loss_l1_multiplier: int = 2
    take_profit_l1_multiplier: int = 4
    allow_add_to_open_symbol: bool = False
    allow_rebuy_same_session: bool = False

    def snapshot(self) -> dict[str, object]:
        return asdict(self)

    def digest(self) -> str:
        raw = json.dumps(self.snapshot(), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(raw.encode()).hexdigest()


STANDARD_RULES = BotRules()


def assert_standard_rules(rules: BotRules = STANDARD_RULES) -> None:
    """Fail loudly if a caller tries to silently turn v1 into a custom Bot."""
    if rules != BotRules():
        raise ValueError("Bot v1 chỉ chấp nhận cấu hình iqx_standard phiên bản 1")


assert_standard_rules()
