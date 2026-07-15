"""B3 benchmark layer for the BCTC storytelling dashboard.

:func:`apply_benchmark` is a **pure** function over the assembled
``BctcDashboardData`` dict + a sector-median dict (from B2's
``get_sector_medians``). It does three things, all in place:

1. Fills ``peer_median`` on every block metric whose ``key`` has a (non-None)
   sector median.
2. Assigns a ``color`` (``green`` / ``amber`` / ``red``) to every block metric
   with a configured threshold — **direction-aware** (ROE/margins/growth: higher
   = better; net-debt/CIR/DSO/P·E: lower = better) and peer-adjusted (clearing
   the absolute bar but underperforming peers downgrades green → amber).
3. Maps every radar dim's underlying value to a 0–100 ``score`` + ``band``
   (``good`` / ``ok`` / ``warn``) using the same sub-sector thresholds.

Thresholds are configured per **sub-sector** (:data:`THRESHOLDS` for metrics,
:data:`DIM_THRESHOLDS` for radar dims) merged over a ``default`` fallback. Metrics
with no threshold and no median are left untouched (``peer_median`` / ``color``
stay ``None``). No network / db access — unit-testable directly.
"""

from __future__ import annotations

from typing import Any

# Direction tokens: "up" → higher is better; "down" → lower is better.
_UP = "up"
_DOWN = "down"

# Radar-band / score anchor scores (a value at ``red`` → 30, at ``green`` → 75).
_RED_ANCHOR = 30.0
_GREEN_ANCHOR = 75.0


# ══════════════════════════════════════════════════════
# Threshold config — metric-level (block metrics[])
# ══════════════════════════════════════════════════════
# Each entry: metric_key -> (green, red, direction).
# ``green`` = value that is comfortably good; ``red`` = value at/beyond which it
# is a concern. Scales match the deterministic compute layer: percentage-style
# metrics are fractions (0.18 = 18%), coverage metrics are multiples (×).

_DEFAULT_METRIC_TH: dict[str, tuple[float, float, str]] = {
    # ── Template A — business (KHỐI 4) ──
    "revenue_growth": (0.15, 0.05, _UP),
    "gross_margin": (0.25, 0.15, _UP),
    "roe": (0.18, 0.12, _UP),
    # ── Template A — cashflow (KHỐI 5) ──
    "cfo_ni": (1.0, 0.5, _UP),        # tiền từ KD / lợi nhuận (×)
    "fcf_margin": (0.08, 0.0, _UP),
    "accrual": (0.05, 0.15, _DOWN),   # phần lãi chưa thành tiền — thấp = tốt
    # ── Template A — valuation (KHỐI 2) ──
    "pe": (12.0, 22.0, _DOWN),
    "pb": (1.5, 3.0, _DOWN),
    # ── Template B — business (KHỐI 4) ──
    "nim": (0.035, 0.025, _UP),
    "roa": (0.015, 0.008, _UP),
    # ── Template B — cashflow / vận hành (KHỐI 5) ──
    "cir": (0.35, 0.45, _DOWN),
    "cost_of_risk": (0.01, 0.02, _DOWN),
    "provision_ppop": (0.25, 0.45, _DOWN),
}

# Sub-sector overrides — merged over the default set. Keys are canonical
# sub-sector codes (see :func:`_subsector_key`). Only the metrics that genuinely
# need a different bar are listed; everything else falls back to default.
_SUBSECTOR_METRIC_TH: dict[str, dict[str, tuple[float, float, str]]] = {
    # Bất động sản — dòng tiền âm nhiều năm là BÌNH THƯỜNG (đang xây dự án).
    # Nới ngưỡng dòng tiền để không cắm cờ đỏ giả.
    "bat_dong_san": {
        "cfo_ni": (0.3, -1.0, _UP),
        "fcf_margin": (-0.05, -0.30, _UP),
    },
    # Bán lẻ — biên gộp mỏng là bản chất ngành; hạ ngưỡng biên gộp.
    "ban_le": {
        "gross_margin": (0.12, 0.05, _UP),
    },
}


# ══════════════════════════════════════════════════════
# Threshold config — radar dims
# ══════════════════════════════════════════════════════
# dim_key -> (green, red, direction). Underlying value scale documented inline.

_DEFAULT_DIM_TH: dict[str, tuple[float, float, str]] = {
    # Template A dims
    "business": (0.15, 0.05, _UP),        # revenue_growth
    "profitability": (0.18, 0.12, _UP),   # roe (shared A/B)
    "cashflow": (1.0, 0.5, _UP),          # cfo_ni (×)
    "safety": (1.5, 3.0, _DOWN),          # net_debt_ebitda (×)
    "valuation": (0.15, -0.10, _UP),      # upside_pct
    # Template B dims
    "growth": (0.15, 0.0, _UP),           # TOI growth
    "asset_quality": (0.012, 0.03, _DOWN),  # llr/loans NPL proxy — thấp = tốt
    "capital": (0.10, 0.06, _UP),         # equity_ratio
}

_SUBSECTOR_DIM_TH: dict[str, dict[str, tuple[float, float, str]]] = {
    # Mirror the metric-level real-estate relaxation on the cash-flow radar axis.
    "bat_dong_san": {
        "cashflow": (0.3, -1.0, _UP),
    },
}

# Fallback map: radar dim → underlying block-metric key, used when the dim does
# not carry a numeric ``value`` of its own (e.g. hand-built test payloads).
_DIM_METRIC_FALLBACK: dict[str, str] = {
    "business": "revenue_growth",
    "profitability": "roe",
    "cashflow": "cfo_ni",
}

# Public config surface (per the task contract).
THRESHOLDS: dict[str, dict[str, tuple[float, float, str]]] = {
    "default": _DEFAULT_METRIC_TH,
    **_SUBSECTOR_METRIC_TH,
}
DIM_THRESHOLDS: dict[str, dict[str, tuple[float, float, str]]] = {
    "default": _DEFAULT_DIM_TH,
    **_SUBSECTOR_DIM_TH,
}


# ══════════════════════════════════════════════════════
# helpers
# ══════════════════════════════════════════════════════


def _subsector_key(sub_sector: str | None) -> str:
    """Normalise a sub-sector label (or code) to a canonical threshold key."""
    t = (sub_sector or "").strip().casefold()
    if not t:
        return "default"
    if "bất động sản" in t or "bat_dong_san" in t or "bất động" in t:
        return "bat_dong_san"
    if "bán lẻ" in t or "ban_le" in t:
        return "ban_le"
    if "tiện ích" in t or "tien_ich" in t:
        return "tien_ich"
    if "cntt" in t or "dịch vụ" in t or "cntt_dichvu" in t:
        return "cntt_dichvu"
    if "sản xuất" in t or "san_xuat" in t:
        return "san_xuat"
    return "default"


def _metric_thresholds(sub_key: str) -> dict[str, tuple[float, float, str]]:
    return {**_DEFAULT_METRIC_TH, **_SUBSECTOR_METRIC_TH.get(sub_key, {})}


def _dim_thresholds(sub_key: str) -> dict[str, tuple[float, float, str]]:
    return {**_DEFAULT_DIM_TH, **_SUBSECTOR_DIM_TH.get(sub_key, {})}


def _color(
    value: float | None,
    peer: float | None,
    green: float,
    red: float,
    direction: str,
) -> str | None:
    """Direction-aware color from absolute thresholds + peer comparison.

    Green requires clearing the absolute green bar AND being at least as good as
    the peer median (when known). Red is set purely on the absolute red bar.
    """
    if value is None:
        return None
    if direction == _UP:
        if value <= red:
            return "red"
        if value >= green and (peer is None or value >= peer):
            return "green"
        return "amber"
    # direction down — lower is better
    if value >= red:
        return "red"
    if value <= green and (peer is None or value <= peer):
        return "green"
    return "amber"


def _band(value: float, green: float, red: float, direction: str) -> str:
    if direction == _UP:
        if value >= green:
            return "good"
        if value <= red:
            return "warn"
        return "ok"
    if value <= green:
        return "good"
    if value >= red:
        return "warn"
    return "ok"


def _score(value: float, green: float, red: float, direction: str) -> int:
    """Map a value to a 0–100 score: ``red`` anchor → 30, ``green`` anchor → 75."""
    span = (green - red) if direction == _UP else (red - green)
    if span == 0:
        raw = _GREEN_ANCHOR if _band(value, green, red, direction) == "good" else _RED_ANCHOR
    else:
        progress = (value - red) if direction == _UP else (red - value)
        raw = _RED_ANCHOR + (progress / span) * (_GREEN_ANCHOR - _RED_ANCHOR)
    return int(round(max(0.0, min(100.0, raw))))


# ══════════════════════════════════════════════════════
# public API
# ══════════════════════════════════════════════════════


def apply_benchmark(data: dict[str, Any], medians: dict[str, float | None]) -> dict[str, Any]:
    """Fill ``peer_median`` + ``color`` on metrics and ``score``/``band`` on radar.

    Mutates ``data`` in place and returns it. Pure — no network / db access.
    """
    medians = medians or {}
    sub_key = _subsector_key(data.get("sub_sector"))
    metric_th = _metric_thresholds(sub_key)
    dim_th = _dim_thresholds(sub_key)

    # ── block metrics ──
    metric_values: dict[str, float | None] = {}
    for block in (data.get("blocks") or {}).values():
        if not isinstance(block, dict):
            continue
        metrics = block.get("metrics")
        if not isinstance(metrics, list):
            continue
        for m in metrics:
            if not isinstance(m, dict):
                continue
            key = m.get("key")
            value = m.get("value")
            if key is not None:
                metric_values.setdefault(key, value)
            # peer median (only when a real median exists for this key)
            median = medians.get(key)
            if median is not None:
                m["peer_median"] = median
            # color by threshold (direction-aware, peer-adjusted)
            th = metric_th.get(key)
            if th is not None:
                m["color"] = _color(value, m.get("peer_median"), *th)

    # ── radar dims ──
    for dim in (data.get("radar") or {}).get("dims") or []:
        if not isinstance(dim, dict):
            continue
        dim_key = dim.get("key")
        value = dim.get("value")
        if value is None:
            value = metric_values.get(_DIM_METRIC_FALLBACK.get(dim_key, ""))
        th = dim_th.get(dim_key)
        if th is None or value is None:
            continue
        dim["score"] = _score(value, *th)
        dim["band"] = _band(value, *th)

    return data
