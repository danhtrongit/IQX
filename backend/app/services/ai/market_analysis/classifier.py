"""Session classifier — maps EOD data to one of 5 session types.

Mirrors spec section 3. Reads the assembled payload (billions for money flow).
"""

from __future__ import annotations

from datetime import date

from . import market_calendar as cal


def classify_session(payload: dict) -> str:
    vnindex = payload.get("vnindex") or {}
    breadth = payload.get("breadth") or {}
    contrib = (payload.get("point_contribution") or {}).get("concentration") or {}
    foreign = payload.get("foreign_flow") or {}
    volume = payload.get("volume") or {}

    idx_change = vnindex.get("change_pct") or 0.0
    advances = breadth.get("advances") or 0
    declines = breadth.get("declines") or 1
    breadth_ratio = advances / max(declines, 1)
    top3_pct = contrib.get("top3_pct") or 0.0
    # money flow stored in billions; spec threshold -500 tỷ
    foreign_net_billion = foreign.get("net_value_vnd_billion")
    if foreign_net_billion is None:
        foreign_net_billion = 0.0
    volume_ratio = volume.get("ratio_vs_ma20")
    intraday_range_pct = vnindex.get("intraday_range_pct") or 0.0
    last_30min = abs(vnindex.get("last_30min_change_pct") or 0.0)

    session_date = payload.get("meta", {}).get("generated_for_date")
    try:
        is_expiry = cal.is_futures_expiry_date(session_date) if session_date else False
    except Exception:
        is_expiry = False

    # Priority 1: đáo hạn phái sinh
    if is_expiry or (intraday_range_pct > 1.5 and last_30min > 0.7):
        return "derivatives_anomaly"

    # Priority 2: giảm sốc
    if idx_change < -2.0 and breadth_ratio < 0.3 and foreign_net_billion < -500:
        return "broad_selloff"

    # Priority 3: tăng lan tỏa
    if idx_change > 1.0 and breadth_ratio > 3.0 and top3_pct < 50:
        return "broad_rally"

    # Priority 4: tăng phân hóa
    if idx_change > 0.5 and top3_pct > 50 and breadth_ratio < 1.5:
        return "narrow_rally"

    # Priority 5: đi ngang
    if abs(idx_change) < 0.3 and (volume_ratio is not None and volume_ratio < 0.7):
        return "low_volatility"

    # Fallback
    return "narrow_rally" if idx_change > 0 else "low_volatility"
