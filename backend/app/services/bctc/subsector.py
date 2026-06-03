from __future__ import annotations

from typing import Any

from app.services.bctc.statements import Period, val

_LABELS = {
    "san_xuat": "Sản xuất / Công nghiệp",
    "cntt_dichvu": "CNTT / Dịch vụ",
    "ban_le": "Bán lẻ",
    "bat_dong_san": "Bất động sản",
    "tien_ich": "Tiện ích / Điện",
}


def _ratio(n: float | None, d: float | None) -> float | None:
    if n is None or not d:
        return None
    return n / d


def subsector_spotlight(p: Period, subsector: str) -> dict[str, Any]:
    ta = val(p, "total_assets")
    metrics: dict[str, float | None] = {
        "asset_intensity": _ratio(val(p, "net_fixed_assets"), ta),
        "inventory_ratio": _ratio(val(p, "inventory_gross"), ta),
    }
    return {"subsector": subsector, "label": _LABELS.get(subsector, "Hỗn hợp"), "metrics": metrics}
