"""Tests that catalog.py NUM-factor ranges match Range.pdf table."""

from app.services.ta.catalog import FACTORS_BY_ID


def _f(indicator, side=None):
    return [f for f in FACTORS_BY_ID.values() if f.indicator == indicator and (side is None or f.side == side)]


def test_ma_20_slope_range():
    f = _f("ma_20_slope", "buy")[0]
    assert (f.value, f.minimum, f.maximum, f.step) == (0.02, 0, 0.05, 0.005)


def test_dist_ma_20_buy_range():
    f = _f("dist_ma_20", "buy")[0]
    assert (f.value, f.minimum, f.maximum, f.step) == (-0.05, -0.15, 0, 0.01)


def test_dist_ma_200_range():
    factors = _f("dist_ma_200")
    assert factors, "No factor found for dist_ma_200"
    f = factors[0]
    assert (f.minimum, f.maximum) == (-0.20, 0.20)
    assert f.value == 0
    assert f.step == 0.01


def test_rsi_buy_sell_ranges():
    buy = _f("rsi_14", "buy")
    buy_editable = [x for x in buy if x.editable]
    assert buy_editable, "No editable rsi_14 buy factor found"
    b = buy_editable[0]
    assert (b.minimum, b.maximum) == (20, 40)

    sell = _f("rsi_14", "sell")
    sell_editable = [x for x in sell if x.editable]
    assert sell_editable, "No editable rsi_14 sell factor found"
    s = sell_editable[0]
    assert (s.minimum, s.maximum) == (60, 80)


def test_macd_hist_range():
    f = _f("macd_hist", "buy")[0]
    assert (f.minimum, f.maximum) == (-0.5, 0.5)
    assert f.step == 0.05


def test_roc_20d_buy_range():
    f = _f("roc_20d", "buy")[0]
    assert (f.minimum, f.maximum) == (0, 0.20)
    assert f.value == 0.05
    assert f.step == 0.01


def test_atr_pct_range():
    factors = _f("atr_pct")
    assert factors, "No factor found for atr_pct"
    for f in factors:
        assert f.minimum == 0.01 or f.minimum >= 0.01, f"atr_pct factor {f.id} min={f.minimum} too low"
    # The buy (calm) factor should have min=0.01, max=0.15
    buy_f = _f("atr_pct", "buy")
    assert buy_f, "No buy atr_pct factor"
    b = buy_f[0]
    assert (b.minimum, b.maximum) == (0.01, 0.15)


def test_bb_width_range():
    factors = _f("bb_width")
    assert factors, "No factor found for bb_width"
    f = factors[0]
    assert (f.minimum, f.maximum) == (0.01, 0.20)
    assert f.value == 0.05
    assert f.step == 0.01


def test_vol_zscore_range():
    buy = _f("vol_zscore", "buy")[0]
    assert (buy.minimum, buy.maximum, buy.step) == (1.0, 3.0, 0.1)
    assert buy.value == 1.5


def test_dist_52w_high_range():
    f = _f("dist_52w_high", "buy")[0]
    assert (f.minimum, f.maximum) == (-0.30, 0)
    assert f.value == -0.05
    assert f.step == 0.01


def test_dist_52w_low_range():
    f = _f("dist_52w_low")[0]
    assert f.maximum == 1.00
    assert f.step == 0.05
    assert f.minimum == 0
