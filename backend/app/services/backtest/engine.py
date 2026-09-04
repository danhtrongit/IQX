"""Walk-forward backtest simulator (single symbol, long-only, daily bars).

Realism (spec §4.1): T+2 settlement, ATR/fixed stop-loss, take-profit,
max-holding time-exit, sell-signal exit, fee/tax presets, lot rounding (100),
no look-ahead (signals use only data up to bar ``t``; execution at that bar's
close). Emits KPIs, an equity curve (base=100, strategy vs buy-and-hold) and the
trade list.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from app.services.ta.conditions import (
    Combination,
    Condition,
    eval_condition_series,
    evaluate_series,
)
from app.services.ta.display_names import display_name
from app.services.ta.indicators import OHLCV

LOT = 100  # HOSE board-lot
TRADING_DAYS = 252


@dataclass(slots=True)
class RiskConfig:
    """Resolved risk parameters (the endpoint maps UI presets onto this)."""

    stop_loss: str = "atr"  # "none" | "atr" | "fixed"
    stop_atr_mult: float = 2.0
    stop_fixed_pct: float = 0.05
    take_profit_pct: float | None = None  # e.g. 0.10
    max_holding: int | None = 60  # sessions; None = unlimited
    position_size: str = "all"  # "all" | "half" | "quarter" | "tenth" | "fixed"
    position_fixed_amount: float = 10_000_000.0
    fee_buy: float = 0.0015
    fee_sell: float = 0.0025  # incl. 0.1% transfer tax on sell


@dataclass(slots=True)
class _Position:
    entry_idx: int
    entry_price: float
    shares: int
    stop: float | None
    take: float | None


@dataclass(slots=True)
class _Trade:
    entry_idx: int
    exit_idx: int
    entry_date: str
    exit_date: str
    entry_price: float
    exit_price: float
    hold: int
    pnl_pct: float
    trigger: str
    entry_trigger: str = ""


@dataclass(slots=True)
class BacktestRun:
    kpis: dict[str, Any]
    equity_curve: list[dict[str, Any]] = field(default_factory=list)
    trades: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"kpis": self.kpis, "equity_curve": self.equity_curve, "trades": self.trades}


_POSITION_FRACTIONS: dict[str, float] = {
    "all": 1.0,
    "half": 0.5,
    "quarter": 0.25,
    "tenth": 0.10,
}


def _position_fraction(size: str) -> float:
    """Return the fraction of capital to deploy for a given position-size label."""
    return _POSITION_FRACTIONS[size]


def _shares_for(cash: float, price: float, fee_buy: float, risk: RiskConfig) -> int:
    if price <= 0:
        return 0
    if risk.position_size == "fixed":
        budget = min(risk.position_fixed_amount, cash)
    else:
        budget = cash * _position_fraction(risk.position_size)
    per_share = price * (1.0 + fee_buy)
    lots = int(budget // (per_share * LOT))
    return lots * LOT


_VN_EXIT_LABELS: dict[str, str] = {
    "stop_loss": "Cắt lỗ",
    "take_profit": "Chốt lời",
    "time_exit": "Hết thời gian giữ",
}


def _vn_exit_label(kind: str) -> str:
    """Return Vietnamese label for a non-signal exit kind."""
    return _VN_EXIT_LABELS.get(kind, kind)


def _format_conditions(conds: list[Condition]) -> str:
    """Format a list of conditions into a human-readable Vietnamese string.

    For ``is_true``/signal conditions: emit just the display name.
    For comparator conditions: emit ``"{name} {op} {value}"``.
    Multiple conditions are joined with `` + ``.
    """
    parts: list[str] = []
    for c in conds:
        name = display_name(c.indicator)
        if c.op == "is_true":
            parts.append(name)
        else:
            parts.append(f"{name} {c.op} {c.value}")
    return " + ".join(parts)


def _format_trigger(frame: dict[str, np.ndarray], sell: Combination, idx: int) -> str:
    """Label a signal exit with all sell conditions true at ``idx``."""
    matched: list[Condition] = []
    for cond in sell.conditions:
        series = eval_condition_series(frame, cond)
        if idx < len(series) and series[idx]:
            matched.append(cond)
    if matched:
        return _format_conditions(matched)
    return "Tín hiệu bán"


def _sharpe_with_ci(daily_returns: np.ndarray) -> tuple[float | None, float | None, float | None]:
    r = daily_returns[~np.isnan(daily_returns)]
    if len(r) < 5 or r.std(ddof=1) == 0:
        return None, None, None
    sharpe = float(r.mean() / r.std(ddof=1) * np.sqrt(TRADING_DAYS))
    # Bootstrap CI (fixed seed → reproducible)
    rng = np.random.default_rng(42)
    boots = []
    n = len(r)
    for _ in range(500):
        sample = rng.choice(r, size=n, replace=True)
        sd = sample.std(ddof=1)
        if sd > 0:
            boots.append(sample.mean() / sd * np.sqrt(TRADING_DAYS))
    if not boots:
        return sharpe, None, None
    lo, hi = np.percentile(boots, [2.5, 97.5])
    return sharpe, float(lo), float(hi)


def _max_drawdown(equity: np.ndarray) -> tuple[float, int | None]:
    """Return (max_drawdown as negative fraction, recovery sessions of that DD).

    ``recovery`` is ``None`` when there is NO drawdown at all — empty, flat, or
    monotonically rising equity. There is no trough to recover from, so any session
    count is a fabricated number: the old code left ``trough_idx = 0`` and matched
    ``equity[1] >= equity[0]`` immediately, publishing "recovered in 1 session" for a
    drawdown that never happened. ``_empty_kpis`` already ships ``None`` for this field,
    so ``None`` is the established "not applicable" value of the KPI contract.
    """
    if len(equity) == 0:
        return 0.0, None
    running_max = np.maximum.accumulate(equity)
    drawdowns = equity / running_max - 1.0
    trough_idx = int(np.argmin(drawdowns))
    max_dd = float(drawdowns[trough_idx])
    if max_dd == 0.0:
        return 0.0, None
    # peak before the trough — ``max_dd < 0`` here guarantees ``trough_idx > 0``
    peak_idx = int(np.argmax(equity[: trough_idx + 1]))
    peak_value = equity[peak_idx]
    for j in range(trough_idx + 1, len(equity)):
        if equity[j] >= peak_value:
            recovery = j - trough_idx
            break
    else:
        recovery = len(equity) - 1 - trough_idx  # not recovered by end
    return max_dd, recovery


def run_backtest(
    data: OHLCV,
    frame: dict[str, np.ndarray],
    buy: Combination,
    sell: Combination,
    risk: RiskConfig,
    *,
    capital: float,
    start_index: int,
) -> BacktestRun:
    """Simulate the strategy from ``start_index`` to the end of ``data``."""
    n = len(data)
    close = data.close
    high = data.high
    low = data.low
    times = data.time

    start_index = max(start_index, 0)
    if start_index >= n:
        return BacktestRun(kpis=_empty_kpis())

    buy_sig = evaluate_series(frame, buy)
    sell_sig = evaluate_series(frame, sell) if sell.conditions else np.zeros(n, dtype=bool)

    cash = float(capital)
    position: _Position | None = None
    _pending_entry_trigger: str = ""
    trades: list[_Trade] = []
    equity_values: list[float] = []
    base_close = float(close[start_index])

    for i in range(start_index, n):
        price = float(close[i])

        if position is None:
            if buy_sig[i]:
                shares = _shares_for(cash, price, risk.fee_buy, risk)
                if shares > 0:
                    cash -= shares * price * (1.0 + risk.fee_buy)
                    stop = _stop_price(price, frame, i, risk)
                    take = price * (1.0 + risk.take_profit_pct) if risk.take_profit_pct else None
                    # Capture which buy conditions were true at this bar
                    matched_buy = [
                        c for c in buy.conditions
                        if i < len(eval_condition_series(frame, c)) and eval_condition_series(frame, c)[i]
                    ]
                    _entry_trigger = _format_conditions(matched_buy) if matched_buy else ""
                    position = _Position(entry_idx=i, entry_price=price, shares=shares, stop=stop, take=take)
                    _pending_entry_trigger = _entry_trigger
        else:
            held = i - position.entry_idx
            if held >= 2:  # T+2 settlement: not sellable before entry+2 sessions
                exit_reason, exit_price = _check_exit(
                    position, frame, sell, sell_sig, high[i], low[i], price, held, risk, i
                )
                if exit_reason is not None:
                    cash += position.shares * exit_price * (1.0 - risk.fee_sell)
                    trades.append(
                        _Trade(
                            entry_idx=position.entry_idx,
                            exit_idx=i,
                            entry_date=times[position.entry_idx],
                            exit_date=times[i],
                            entry_price=position.entry_price,
                            exit_price=exit_price,
                            hold=held,
                            pnl_pct=exit_price / position.entry_price - 1.0,
                            trigger=exit_reason,
                            entry_trigger=_pending_entry_trigger,
                        )
                    )
                    position = None

        port = cash + (position.shares * price if position else 0.0)
        equity_values.append(port)

    equity = np.array(equity_values, dtype=np.float64)
    kpis = _compute_kpis(
        equity=equity,
        capital=float(capital),
        trades=trades,
        close=close,
        start_index=start_index,
        base_close=base_close,
    )
    curve = [
        {
            "date": times[start_index + k],
            "strategy": round(equity[k] / capital * 100.0, 4),
            "buy_hold": round(float(close[start_index + k]) / base_close * 100.0, 4),
        }
        for k in range(len(equity))
    ]
    trade_dicts = [
        {
            "idx": j + 1,
            "entry_date": t.entry_date,
            "entry_price": round(t.entry_price, 2),
            "exit_date": t.exit_date,
            "exit_price": round(t.exit_price, 2),
            "hold": t.hold,
            "pnl_pct": round(t.pnl_pct, 4),
            "trigger": t.trigger,
            "entry_trigger": t.entry_trigger,
        }
        for j, t in enumerate(trades)
    ]
    return BacktestRun(kpis=kpis, equity_curve=curve, trades=trade_dicts)


def _stop_price(entry_price: float, frame: dict[str, np.ndarray], i: int, risk: RiskConfig) -> float | None:
    if risk.stop_loss == "none":
        return None
    if risk.stop_loss == "fixed":
        return entry_price * (1.0 - risk.stop_fixed_pct)
    # ATR-based
    atr = frame.get("atr_14")
    if atr is None or i >= len(atr) or np.isnan(atr[i]):
        return None
    return entry_price - risk.stop_atr_mult * float(atr[i])


def _check_exit(
    position: _Position,
    frame: dict[str, np.ndarray],
    sell: Combination,
    sell_sig: np.ndarray,
    bar_high: float,
    bar_low: float,
    price: float,
    held: int,
    risk: RiskConfig,
    i: int,
) -> tuple[str | None, float]:
    # Priority: stop-loss → take-profit → max-holding → sell signal
    if position.stop is not None and bar_low <= position.stop:
        return _vn_exit_label("stop_loss"), position.stop
    if position.take is not None and bar_high >= position.take:
        return _vn_exit_label("take_profit"), position.take
    if risk.max_holding is not None and held >= risk.max_holding:
        return _vn_exit_label("time_exit"), price
    if sell.conditions and sell_sig[i]:
        return _format_trigger(frame, sell, i), price
    return None, price


def _empty_kpis() -> dict[str, Any]:
    return {
        "cagr": None,
        "sharpe": None,
        "sharpe_ci": [None, None],
        "max_drawdown": None,
        "dd_recovery_sessions": None,
        "win_rate": None,
        "n_trades": 0,
        "n_wins": 0,
        "avg_hold": None,
        "net_return": None,
        "buy_hold_return": None,
        "n_sessions": 0,
    }


def _compute_kpis(
    *,
    equity: np.ndarray,
    capital: float,
    trades: list[_Trade],
    close: np.ndarray,
    start_index: int,
    base_close: float,
) -> dict[str, Any]:
    n_sessions = len(equity)
    if n_sessions == 0:
        return _empty_kpis()
    final = float(equity[-1])
    net_return = final / capital - 1.0
    years = max(n_sessions / TRADING_DAYS, 1e-9)
    cagr = (final / capital) ** (1.0 / years) - 1.0 if final > 0 else -1.0
    daily_returns = np.diff(equity) / equity[:-1] if n_sessions > 1 else np.array([])
    sharpe, lo, hi = _sharpe_with_ci(daily_returns)
    max_dd, recovery = _max_drawdown(equity)
    n_trades = len(trades)
    n_wins = sum(1 for t in trades if t.pnl_pct > 0)
    win_rate = n_wins / n_trades if n_trades else None
    avg_hold = float(np.mean([t.hold for t in trades])) if trades else None
    buy_hold_return = float(close[-1]) / base_close - 1.0
    return {
        "cagr": round(cagr, 4),
        "sharpe": round(sharpe, 3) if sharpe is not None else None,
        "sharpe_ci": [round(lo, 3) if lo is not None else None, round(hi, 3) if hi is not None else None],
        "max_drawdown": round(max_dd, 4),
        "dd_recovery_sessions": recovery,
        "win_rate": round(win_rate, 4) if win_rate is not None else None,
        "n_trades": n_trades,
        "n_wins": n_wins,
        "avg_hold": round(avg_hold, 1) if avg_hold is not None else None,
        "net_return": round(net_return, 4),
        "buy_hold_return": round(buy_hold_return, 4),
        "n_sessions": n_sessions,
    }
