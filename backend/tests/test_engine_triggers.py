"""Tests for Task 3: entry_trigger field and Vietnamese trigger formatting."""

from app.services.backtest.engine import _vn_exit_label, _format_conditions
from app.services.ta.conditions import Condition


def test_vn_exit_labels():
    assert _vn_exit_label("stop_loss") == "Cắt lỗ"
    assert _vn_exit_label("take_profit") == "Chốt lời"
    assert _vn_exit_label("time_exit") == "Hết thời gian giữ"


def test_format_conditions_uses_display_names_and_joins():
    conds = [Condition("breakout_20d", "is_true", None), Condition("rsi_14", ">", 30)]
    assert _format_conditions(conds) == "Phá đỉnh 20 phiên + RSI 14 > 30"
