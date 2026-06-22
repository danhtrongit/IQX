"""Deterministic tests for the backtest engine (spec §4.1)."""

from __future__ import annotations

import numpy as np

from app.services.backtest.engine import RiskConfig, run_backtest
from app.services.ta.conditions import Combination, Condition
from app.services.ta.indicators import OHLCV

BUY = Combination("AND", [Condition("buy_flag", "is_true")])
SELL = Combination("AND", [Condition("sell_flag", "is_true")])
NO_SELL = Combination("AND", [])


def _mk(close, *, high=None, low=None, buy_at=(), sell_at=(), atr=None):
    n = len(close)
    close = [float(c) for c in close]
    high = [float(h) for h in (high if high is not None else [c + 1 for c in close])]
    low = [float(low_) for low_ in (low if low is not None else [c - 1 for c in close])]
    data = OHLCV(
        time=[f"2021-{1 + i // 28:02d}-{1 + i % 28:02d}" for i in range(n)],
        open=np.array(close),
        high=np.array(high),
        low=np.array(low),
        close=np.array(close),
        volume=np.array([1000.0] * n),
    )
    frame = {
        "close": data.close,
        "high": data.high,
        "low": data.low,
        "buy_flag": np.array([1.0 if i in buy_at else 0.0 for i in range(n)]),
        "sell_flag": np.array([1.0 if i in sell_at else 0.0 for i in range(n)]),
    }
    if atr is not None:
        frame["atr_14"] = np.array([float(a) for a in atr])
    return data, frame


def _risk(**kw):
    base = dict(
        stop_loss="none", take_profit_pct=None, max_holding=None, position_size="all", fee_buy=0.0, fee_sell=0.0
    )
    base.update(kw)
    return RiskConfig(**base)


def test_simple_signal_round_trip():
    data, frame = _mk([100, 101, 102, 103, 104, 105], buy_at=[0], sell_at=[4])
    run = run_backtest(data, frame, BUY, SELL, _risk(), capital=100_000, start_index=0)
    assert run.kpis["n_trades"] == 1
    t = run.trades[0]
    assert t["entry_price"] == 100.0 and t["exit_price"] == 104.0
    assert t["hold"] == 4
    assert abs(t["pnl_pct"] - 0.04) < 1e-9
    assert t["trigger"] == "sell_flag"
    assert run.kpis["win_rate"] == 1.0
    # 1000 shares bought at 100 -> exit 104 -> equity 104_000
    assert abs(run.kpis["net_return"] - 0.04) < 1e-9


def test_t_plus_2_blocks_early_exit():
    # sell flag fires at i=1 (held=1, blocked) and i=3 (held=3, allowed)
    data, frame = _mk([100, 100, 100, 105, 105], buy_at=[0], sell_at=[1, 3])
    run = run_backtest(data, frame, BUY, SELL, _risk(), capital=100_000, start_index=0)
    assert run.kpis["n_trades"] == 1
    assert run.trades[0]["hold"] == 3  # not 1
    assert run.trades[0]["exit_price"] == 105.0


def test_fixed_stop_loss():
    data, frame = _mk([100, 99, 98, 94, 96], low=[100, 99, 98, 94, 96], buy_at=[0])
    run = run_backtest(
        data, frame, BUY, NO_SELL, _risk(stop_loss="fixed", stop_fixed_pct=0.05), capital=100_000, start_index=0
    )
    assert run.kpis["n_trades"] == 1
    t = run.trades[0]
    assert t["trigger"] == "Cắt lỗ"
    assert t["exit_price"] == 95.0  # entry 100 * (1-0.05)
    assert t["hold"] == 3  # first sellable bar where low<=95


def test_take_profit():
    data, frame = _mk([100, 101, 102, 111, 112], high=[100, 101, 102, 111, 112], buy_at=[0])
    run = run_backtest(data, frame, BUY, NO_SELL, _risk(take_profit_pct=0.10), capital=100_000, start_index=0)
    t = run.trades[0]
    assert t["trigger"] == "Chốt lời"
    assert t["exit_price"] == 110.0  # entry 100 * 1.10
    assert t["hold"] == 3


def test_atr_stop():
    atr = [2.0] * 6
    data, frame = _mk([100, 100, 100, 95, 90, 90], low=[100, 100, 100, 95, 90, 90], buy_at=[0], atr=atr)
    # stop = 100 - 2.0*ATR(=2) = 96; low hits 95 at i=3
    run = run_backtest(
        data, frame, BUY, NO_SELL, _risk(stop_loss="atr", stop_atr_mult=2.0), capital=100_000, start_index=0
    )
    t = run.trades[0]
    assert t["trigger"] == "Cắt lỗ"
    assert t["exit_price"] == 96.0


def test_max_holding_time_exit():
    data, frame = _mk([100, 100, 100, 100, 100, 100], buy_at=[0])
    run = run_backtest(data, frame, BUY, NO_SELL, _risk(max_holding=3), capital=100_000, start_index=0)
    t = run.trades[0]
    assert t["trigger"] == "Hết thời gian giữ"
    assert t["hold"] == 3


def test_exit_priority_stop_over_signal():
    # both stop and sell signal could fire; stop wins
    data, frame = _mk([100, 100, 94], low=[100, 100, 94], buy_at=[0], sell_at=[2])
    run = run_backtest(
        data, frame, BUY, SELL, _risk(stop_loss="fixed", stop_fixed_pct=0.05), capital=100_000, start_index=0
    )
    assert run.trades[0]["trigger"] == "Cắt lỗ"


def test_no_entry_when_cash_too_small():
    data, frame = _mk([100, 101, 102], buy_at=[0])
    # capital 5_000 < 100 shares * 100 = 10_000 -> 0 shares
    run = run_backtest(data, frame, BUY, SELL, _risk(), capital=5_000, start_index=0)
    assert run.kpis["n_trades"] == 0


def test_equity_curve_and_buy_hold_baseline():
    closes = [100, 102, 101, 105, 110, 108, 112, 115]
    data, frame = _mk(closes, buy_at=[0], sell_at=[6])
    run = run_backtest(data, frame, BUY, NO_SELL, _risk(), capital=100_000, start_index=0)
    assert len(run.equity_curve) == len(closes)
    assert run.equity_curve[0]["buy_hold"] == 100.0
    assert run.equity_curve[0]["strategy"] == 100.0
    # buy-hold tracks price ratio
    assert abs(run.equity_curve[-1]["buy_hold"] - closes[-1] / closes[0] * 100) < 1e-6
    assert run.kpis["n_sessions"] == len(closes)
    assert abs(run.kpis["buy_hold_return"] - (closes[-1] / closes[0] - 1)) < 1e-9


def test_position_held_open_at_end_is_marked_to_market():
    data, frame = _mk([100, 100, 100, 120], buy_at=[0])  # never sells
    run = run_backtest(data, frame, BUY, NO_SELL, _risk(), capital=100_000, start_index=0)
    assert run.kpis["n_trades"] == 0  # still open
    # 1000 shares * 120 = 120_000 -> +20%
    assert abs(run.kpis["net_return"] - 0.20) < 1e-9


def test_start_index_offsets_trading():
    closes = [50] * 10 + [100, 101, 102, 103, 104]
    data, frame = _mk(closes, buy_at=[10], sell_at=[14])
    run = run_backtest(data, frame, BUY, SELL, _risk(), capital=100_000, start_index=10)
    assert len(run.equity_curve) == 5
    assert run.kpis["n_trades"] == 1
    assert run.trades[0]["entry_price"] == 100.0
