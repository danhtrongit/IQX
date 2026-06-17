"""Built-in starter strategies ("Tải mẫu") — full buy/sell/risk configs."""

from __future__ import annotations

from typing import Any


def _risk(**kw: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "stop_loss": "atr",
        "stop_atr_mult": 2.0,
        "stop_fixed_pct": 0.05,
        "take_profit_pct": None,
        "max_holding": 60,
        "position_size": "all",
        "position_fixed_amount": 10_000_000,
        "fee": "standard",
    }
    base.update(kw)
    return base


TEMPLATES: tuple[dict[str, Any], ...] = (
    {
        "key": "momentum_cross",
        "name": "Giao cắt động lượng",
        "description": "Mua khi RSI quá bán + MACD cắt lên; bán khi RSI quá mua hoặc death cross.",
        "config": {
            "buy": {
                "logic": "AND",
                "factors": [{"id": "rsi_14_oversold", "value": 30}, {"id": "macd_bull_cross"}],
            },
            "sell": {
                "logic": "OR",
                "factors": [{"id": "rsi_14_overbought", "value": 70}, {"id": "death_cross"}],
            },
            "risk": _risk(stop_loss="atr", stop_atr_mult=2.0, max_holding=60),
        },
    },
    {
        "key": "volume_breakout",
        "name": "Bứt phá khối lượng",
        "description": "Mua khi phá đỉnh 20 phiên với khối lượng bùng nổ; chốt lời 15%.",
        "config": {
            "buy": {
                "logic": "AND",
                "factors": [{"id": "breakout_20d"}, {"id": "vol_zscore_buy", "value": 1.5}],
            },
            "sell": {
                "logic": "OR",
                "factors": [{"id": "breakdown_20d"}, {"id": "macd_bear_cross"}],
            },
            "risk": _risk(stop_loss="atr", stop_atr_mult=1.5, take_profit_pct=0.15, max_holding=40),
        },
    },
    {
        "key": "trend_follow",
        "name": "Thuận xu hướng",
        "description": "Mua khi 4 MA xếp chồng tăng + MACD dương; bán khi giá thủng MA50.",
        "config": {
            "buy": {
                "logic": "AND",
                "factors": [{"id": "ma_stack_bull"}, {"id": "macd_hist_buy", "value": 0}],
            },
            "sell": {
                "logic": "OR",
                "factors": [{"id": "close_below_ma50"}, {"id": "death_cross"}],
            },
            "risk": _risk(stop_loss="atr", stop_atr_mult=3.0, max_holding=90),
        },
    },
    {
        "key": "mean_reversion",
        "name": "Bắt đáy hồi phục",
        "description": "Mua khi RSI quá bán + giá dưới MA20; chốt lời 10%, cắt lỗ 5%.",
        "config": {
            "buy": {
                "logic": "AND",
                "factors": [{"id": "rsi_14_oversold", "value": 28}, {"id": "dist_ma_20_buy", "value": -0.05}],
            },
            "sell": {
                "logic": "OR",
                "factors": [{"id": "rsi_14_overbought", "value": 68}],
            },
            "risk": _risk(
                stop_loss="fixed", stop_fixed_pct=0.05, take_profit_pct=0.10, max_holding=30, position_size="half"
            ),
        },
    },
)
