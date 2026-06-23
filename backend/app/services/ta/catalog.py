"""The factor library — the backtester's user-facing catalog of pickable signals.

Each ``Factor`` is a labelled, optionally-tunable preset that resolves to a
``Condition`` over the 38 indicators (+ raw ``close``). Mirrors the mockup's
``catalog`` (``~/Downloads/iqx_backtester_mockup.html``) and is served to the UI
verbatim so the sidebar and threshold inputs are data-driven.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services.ta.conditions import Condition
from app.services.ta.display_names import display_name


@dataclass(slots=True, frozen=True)
class Factor:
    id: str
    label: str
    side: str  # "buy" | "sell"
    group: str  # "B1".."S7"
    group_label: str
    kind: str  # "bin" | "num"
    indicator: str
    op: str
    value: float | str | None  # default threshold / fixed value / rhs field name
    editable: bool = False  # numeric & tunable
    minimum: float | None = None
    maximum: float | None = None
    step: float | None = None
    unit: str = ""
    is_percent: bool = False
    desc: str = ""

    def resolve(self, value: float | None = None) -> Condition:
        """Resolve to a Condition, applying a user-supplied threshold if allowed."""
        v: float | str | None = self.value
        if self.editable and value is not None:
            v = float(value)
        return Condition(indicator=self.indicator, op=self.op, value=v)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "side": self.side,
            "group": self.group,
            "group_label": self.group_label,
            "kind": self.kind,
            "indicator": self.indicator,
            "op": self.op,
            "default": self.value,
            "editable": self.editable,
            "min": self.minimum,
            "max": self.maximum,
            "step": self.step,
            "unit": self.unit,
            "is_percent": self.is_percent,
            "desc": self.desc,
        }


def _num(
    fid: str,
    label: str,
    side: str,
    group: str,
    group_label: str,
    indicator: str,
    op: str,
    default: float,
    *,
    minimum: float | None = None,
    maximum: float | None = None,
    step: float | None = None,
    unit: str = "",
    is_percent: bool = False,
    editable: bool = True,
    desc: str = "",
) -> Factor:
    return Factor(
        id=fid,
        label=label,
        side=side,
        group=group,
        group_label=group_label,
        kind="num",
        indicator=indicator,
        op=op,
        value=default,
        editable=editable,
        minimum=minimum,
        maximum=maximum,
        step=step,
        unit=unit,
        is_percent=is_percent,
        desc=desc,
    )


def _bin(
    fid: str,
    label: str,
    side: str,
    group: str,
    group_label: str,
    indicator: str,
    op: str = "is_true",
    value: float | str | None = None,
    *,
    desc: str = "",
) -> Factor:
    return Factor(
        id=fid,
        label=label,
        side=side,
        group=group,
        group_label=group_label,
        kind="bin",
        indicator=indicator,
        op=op,
        value=value,
        editable=False,
        desc=desc,
    )


# ── The catalog (mirrors the mockup, extended with a candlestick group) ───────

CATALOG: tuple[Factor, ...] = (
    # ───────────────────────── BUY ─────────────────────────
    # B1 · Xu hướng tăng
    _bin("ma_stack_bull", "ma_stack_bull", "buy", "B1", "Xu hướng tăng", "ma_stack_bull", desc="4 MA xếp chồng tăng"),
    _bin("uptrend", "uptrend", "buy", "B1", "Xu hướng tăng", "uptrend", desc="MA50 > MA200"),
    _bin(
        "close_above_ma50",
        "Close > ma_50",
        "buy",
        "B1",
        "Xu hướng tăng",
        "close",
        op=">",
        value="ma_50",
        desc="Giá vượt MA50",
    ),
    _num(
        "ma_20_slope",
        "ma_20_slope",
        "buy",
        "B1",
        "Xu hướng tăng",
        "ma_20_slope",
        ">",
        0.02,
        minimum=0,
        maximum=0.05,
        step=0.005,
        desc="Độ dốc MA20 dương",
    ),
    # B2 · Động lượng tăng
    _num(
        "rsi_14_buy_mom",
        "rsi_14 (cross 50)",
        "buy",
        "B2",
        "Động lượng tăng",
        "rsi_14",
        "cross_above",
        50,
        editable=False,
        desc="RSI cắt lên 50",
    ),
    _num(
        "macd_hist_buy",
        "macd_hist > 0",
        "buy",
        "B2",
        "Động lượng tăng",
        "macd_hist",
        ">",
        0,
        minimum=-0.5,
        maximum=0.5,
        step=0.05,
        desc="MACD histogram dương",
    ),
    _bin(
        "macd_bull_cross",
        "macd_bull_cross",
        "buy",
        "B2",
        "Động lượng tăng",
        "macd_bull_cross",
        desc="MACD cắt lên signal",
    ),
    _num(
        "roc_20d_buy",
        "roc_20d",
        "buy",
        "B2",
        "Động lượng tăng",
        "roc_20d",
        ">",
        0.05,
        minimum=0,
        maximum=0.20,
        step=0.01,
        unit="%",
        is_percent=True,
        desc="Đà tăng 20 phiên",
    ),
    # B3 · Quá bán / Mua đáy
    _num(
        "rsi_14_oversold",
        "rsi_14 (oversold)",
        "buy",
        "B3",
        "Quá bán / Mua đáy",
        "rsi_14",
        "<",
        30,
        minimum=20,
        maximum=40,
        step=1,
        desc="RSI quá bán",
    ),
    _num(
        "dist_ma_20_buy",
        "dist_ma_20",
        "buy",
        "B3",
        "Quá bán / Mua đáy",
        "dist_ma_20",
        "<",
        -0.05,
        minimum=-0.15,
        maximum=0,
        step=0.01,
        unit="%",
        is_percent=True,
        desc="Giá dưới MA20",
    ),
    _num(
        "dist_52w_low_buy",
        "dist_52w_low",
        "buy",
        "B3",
        "Quá bán / Mua đáy",
        "dist_52w_low",
        "<",
        0.05,
        minimum=0,
        maximum=1.00,
        step=0.05,
        unit="%",
        is_percent=True,
        desc="Gần đáy năm",
    ),
    _num(
        "dist_ma_200_buy",
        "dist_ma_200",
        "buy",
        "B3",
        "Quá bán / Mua đáy",
        "dist_ma_200",
        ">",
        0,
        minimum=-0.20,
        maximum=0.20,
        step=0.01,
        unit="%",
        is_percent=True,
        desc="Khoảng cách giá tới MA200",
    ),
    # B4 · Phá đỉnh / Bứt phá
    _bin("breakout_20d", "breakout_20d", "buy", "B4", "Phá đỉnh / Bứt phá", "breakout_20d", desc="Phá đỉnh 20 phiên"),
    _bin("breakout_52w", "breakout_52w", "buy", "B4", "Phá đỉnh / Bứt phá", "breakout_52w", desc="Phá đỉnh 52 tuần"),
    _num(
        "dist_52w_high_buy",
        "dist_52w_high",
        "buy",
        "B4",
        "Phá đỉnh / Bứt phá",
        "dist_52w_high",
        ">",
        -0.05,
        minimum=-0.30,
        maximum=0,
        step=0.01,
        unit="%",
        is_percent=True,
        desc="Sát đỉnh năm",
    ),
    # B5 · Xác nhận khối lượng
    _num(
        "vol_zscore_buy",
        "vol_zscore",
        "buy",
        "B5",
        "Xác nhận khối lượng",
        "vol_zscore",
        ">",
        1.5,
        minimum=1.0,
        maximum=3.0,
        step=0.1,
        unit="σ",
        desc="Khối lượng bùng nổ",
    ),
    _bin(
        "obv_cross_buy",
        "obv cross above MA",
        "buy",
        "B5",
        "Xác nhận khối lượng",
        "obv",
        op="cross_above",
        value="obv_ma_20",
        desc="OBV vượt MA20",
    ),
    # B6 · Bối cảnh biến động
    _bin("bb_squeeze_buy", "bb_squeeze", "buy", "B6", "Bối cảnh biến động", "bb_squeeze", desc="BB co hẹp (sắp bung)"),
    _num(
        "bb_width_buy",
        "bb_width",
        "buy",
        "B6",
        "Bối cảnh biến động",
        "bb_width",
        "<",
        0.05,
        minimum=0.01,
        maximum=0.20,
        step=0.01,
        unit="%",
        is_percent=True,
        desc="Độ rộng dải Bollinger",
    ),
    _num(
        "atr_pct_low",
        "atr_pct (calm)",
        "buy",
        "B6",
        "Bối cảnh biến động",
        "atr_pct",
        "<",
        0.05,
        minimum=0.01,
        maximum=0.15,
        step=0.005,
        unit="%",
        is_percent=True,
        desc="Biến động thấp",
    ),
    # B7 · Mẫu hình nến
    _bin("hammer_buy", "hammer", "buy", "B7", "Mẫu hình nến", "hammer", desc="Nến hammer (đảo chiều tăng)"),
    _bin(
        "bull_engulfing_buy", "bull_engulfing", "buy", "B7", "Mẫu hình nến", "bull_engulfing", desc="Nến nhấn chìm tăng"
    ),
    # ───────────────────────── SELL ─────────────────────────
    # S1 · Xu hướng đảo
    _bin("death_cross", "death_cross", "sell", "S1", "Xu hướng đảo", "death_cross", desc="MA20 cắt xuống MA50"),
    _bin(
        "close_below_ma50",
        "Close < ma_50",
        "sell",
        "S1",
        "Xu hướng đảo",
        "close",
        op="<",
        value="ma_50",
        desc="Giá thủng MA50",
    ),
    _bin(
        "uptrend_off",
        "uptrend off",
        "sell",
        "S1",
        "Xu hướng đảo",
        "uptrend",
        op="==",
        value=0,
        desc="Không còn xu hướng tăng",
    ),
    # S2 · Mất động lượng
    _num(
        "rsi_14_sell_mom",
        "rsi_14 (cross 50 down)",
        "sell",
        "S2",
        "Mất động lượng",
        "rsi_14",
        "cross_below",
        50,
        editable=False,
        desc="RSI cắt xuống 50",
    ),
    _bin(
        "macd_bear_cross",
        "macd_bear_cross",
        "sell",
        "S2",
        "Mất động lượng",
        "macd_bear_cross",
        desc="MACD cắt xuống signal",
    ),
    _num(
        "roc_20d_sell",
        "roc_20d (neg)",
        "sell",
        "S2",
        "Mất động lượng",
        "roc_20d",
        "<",
        -0.05,
        minimum=-0.20,
        maximum=0,
        step=0.01,
        unit="%",
        is_percent=True,
        desc="Đà giảm 20 phiên",
    ),
    # S3 · Quá mua / Bán đỉnh
    _num(
        "rsi_14_overbought",
        "rsi_14 (overbought)",
        "sell",
        "S3",
        "Quá mua / Bán đỉnh",
        "rsi_14",
        ">",
        70,
        minimum=60,
        maximum=80,
        step=1,
        desc="RSI quá mua",
    ),
    _num(
        "dist_ma_20_sell",
        "dist_ma_20 (extended)",
        "sell",
        "S3",
        "Quá mua / Bán đỉnh",
        "dist_ma_20",
        ">",
        0.10,
        minimum=0,
        maximum=0.20,
        step=0.01,
        unit="%",
        is_percent=True,
        desc="Giá vượt xa MA20",
    ),
    # S4 · Phá đáy
    _bin("breakdown_20d", "breakdown_20d", "sell", "S4", "Phá đáy", "breakdown_20d", desc="Phá đáy 20 phiên"),
    _bin("breakdown_52w", "breakdown_52w", "sell", "S4", "Phá đáy", "breakdown_52w", desc="Phá đáy 52 tuần"),
    _bin("bb_breakout_down", "bb_breakout_down", "sell", "S4", "Phá đáy", "bb_breakout_down", desc="Giá phá BB dưới"),
    # S5 · Xác nhận khối lượng
    _num(
        "vol_zscore_sell",
        "vol_zscore",
        "sell",
        "S5",
        "Xác nhận khối lượng",
        "vol_zscore",
        ">",
        1.5,
        minimum=1.0,
        maximum=3.0,
        step=0.1,
        unit="σ",
        desc="Khối lượng bán tháo",
    ),
    _bin(
        "obv_cross_sell",
        "obv cross below MA",
        "sell",
        "S5",
        "Xác nhận khối lượng",
        "obv",
        op="cross_below",
        value="obv_ma_20",
        desc="OBV xuyên xuống MA",
    ),
    # S6 · Bối cảnh biến động
    _num(
        "atr_pct_high",
        "atr_pct (volatile)",
        "sell",
        "S6",
        "Bối cảnh biến động",
        "atr_pct",
        ">",
        0.08,
        minimum=0.05,
        maximum=0.15,
        step=0.005,
        unit="%",
        is_percent=True,
        desc="Biến động cao",
    ),
    # S7 · Mẫu hình nến
    _bin(
        "shooting_star_sell",
        "shooting_star",
        "sell",
        "S7",
        "Mẫu hình nến",
        "shooting_star",
        desc="Nến shooting star (đảo chiều giảm)",
    ),
    _bin(
        "bear_engulfing_sell",
        "bear_engulfing",
        "sell",
        "S7",
        "Mẫu hình nến",
        "bear_engulfing",
        desc="Nến nhấn chìm giảm",
    ),
)

# Normalise every factor's label to the Vietnamese display name of its indicator.
# Factor is frozen, so we use object.__setattr__ to set the label after construction.
for _f in CATALOG:
    object.__setattr__(_f, "label", display_name(_f.indicator))

FACTORS_BY_ID: dict[str, Factor] = {f.id: f for f in CATALOG}


def resolve_factor(factor_id: str, value: float | None = None) -> Condition:
    """Resolve a selected factor (+ optional tuned threshold) to a Condition."""
    factor = FACTORS_BY_ID.get(factor_id)
    if factor is None:
        raise KeyError(f"Không có factor: {factor_id!r}")
    return factor.resolve(value)


def factor_library_payload() -> dict[str, Any]:
    """Serializable factor library grouped by side -> group, for the UI."""
    sides: dict[str, dict[str, dict[str, Any]]] = {"buy": {}, "sell": {}}
    for f in CATALOG:
        group_map = sides[f.side].setdefault(f.group, {"group": f.group, "group_label": f.group_label, "factors": []})
        group_map["factors"].append(f.to_dict())
    return {
        "buy": list(sides["buy"].values()),
        "sell": list(sides["sell"].values()),
        "count": len(CATALOG),
    }
