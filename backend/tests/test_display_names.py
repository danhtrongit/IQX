from app.services.ta.display_names import INDICATOR_DISPLAY, INDICATOR_KIND, display_name


def test_all_38_indicators_present():
    assert len(INDICATOR_DISPLAY) == 38
    assert INDICATOR_DISPLAY["rsi_14"] == "RSI 14"
    assert INDICATOR_DISPLAY["breakout_20d"] == "Phá đỉnh 20 phiên"
    assert INDICATOR_DISPLAY["ma_stack_bull"] == "MA5 > MA20 > MA50 > MA200"


def test_display_name_falls_back_to_id():
    assert display_name("rsi_14") == "RSI 14"
    assert display_name("not_an_indicator") == "not_an_indicator"


def test_indicator_kind_mapping():
    assert len(INDICATOR_KIND) == 38
    assert INDICATOR_KIND["rsi_14"] == "num"
    assert INDICATOR_KIND["ma_stack_bull"] == "signal"
    assert INDICATOR_KIND["uptrend"] == "signal"
