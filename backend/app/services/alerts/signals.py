"""The 10 fixed signal presets (spec §5.1).

Each is a flat AND/OR combination over the 38 indicators. Seeded idempotently;
admins refine the combinations + message templates via the admin UI.
"""

from __future__ import annotations

from typing import Any


def _c(indicator: str, op: str, value: float | str | None = None) -> dict[str, Any]:
    return {"indicator": indicator, "op": op, "value": value}


SIGNAL_DEFS: tuple[dict[str, Any], ...] = (
    {
        "key": "pullback",
        "side": "buy",
        "ta_name": "Pullback",
        "message_title": "Mua khi giá điều chỉnh nhẹ",
        "combination": {
            "logic": "AND",
            "conditions": [_c("uptrend", "is_true"), _c("dist_ma_20", "<", -0.03), _c("rsi_14", "<", 45)],
        },
    },
    {
        "key": "breakout",
        "side": "buy",
        "ta_name": "Breakout",
        "message_title": "Mua khi giá vượt đỉnh",
        "combination": {
            "logic": "AND",
            "conditions": [_c("breakout_20d", "is_true"), _c("vol_zscore", ">", 1.5)],
        },
    },
    {
        "key": "reversal",
        "side": "buy",
        "ta_name": "Reversal",
        "message_title": "Mua khi quay đầu tăng",
        "combination": {
            "logic": "OR",
            "conditions": [_c("bull_engulfing", "is_true"), _c("hammer", "is_true")],
        },
    },
    {
        "key": "squeeze",
        "side": "buy",
        "ta_name": "Squeeze",
        "message_title": "Mua trước khi bung khỏi vùng nén",
        "combination": {
            "logic": "AND",
            "conditions": [_c("bb_squeeze", "is_true"), _c("ma_20_slope", ">", 0)],
        },
    },
    {
        "key": "continuation",
        "side": "buy",
        "ta_name": "Continuation",
        "message_title": "Mua khi đà tăng mạnh",
        "combination": {
            "logic": "AND",
            "conditions": [_c("ma_stack_bull", "is_true"), _c("macd_hist", ">", 0), _c("roc_20d", ">", 0.05)],
        },
    },
    {
        "key": "overbought",
        "side": "sell",
        "ta_name": "Overbought",
        "message_title": "Bán khi giá đã tăng nóng",
        "combination": {
            "logic": "AND",
            "conditions": [_c("rsi_14", ">", 70), _c("dist_ma_20", ">", 0.10)],
        },
    },
    {
        "key": "breakdown",
        "side": "sell",
        "ta_name": "Breakdown",
        "message_title": "Bán khi giá vỡ hỗ trợ",
        "combination": {
            "logic": "OR",
            "conditions": [_c("breakdown_20d", "is_true"), _c("bb_breakout_down", "is_true")],
        },
    },
    {
        "key": "top_reversal",
        "side": "sell",
        "ta_name": "Top Reversal",
        "message_title": "Bán khi nến đảo chiều giảm",
        "combination": {
            "logic": "OR",
            "conditions": [_c("bear_engulfing", "is_true"), _c("shooting_star", "is_true")],
        },
    },
    {
        "key": "squeeze_down",
        "side": "sell",
        "ta_name": "Squeeze Down",
        "message_title": "Bán khi bung nén xuống",
        "combination": {
            "logic": "AND",
            "conditions": [_c("bb_breakout_down", "is_true"), _c("vol_zscore", ">", 1.0)],
        },
    },
    {
        "key": "trend_break",
        "side": "sell",
        "ta_name": "Trend Break",
        "message_title": "Bán khi gãy xu hướng",
        "combination": {
            "logic": "OR",
            "conditions": [_c("death_cross", "is_true"), _c("macd_bear_cross", "is_true")],
        },
    },
)
