from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.bctc.statements import Period

_BANK_SIGNATURE = ("isb38", "isb27", "isb43")


def detect_template(income_rows: list[dict]) -> str:
    """'B' nếu có giá trị TOI/NII/NPAT ngân hàng KHÁC 0, ngược lại 'A'.

    Lưu ý: schema VCI hợp nhất điền 0.0 (không phải None) cho các dòng không áp dụng
    — phi-ngân hàng vẫn có key isb38/isb27 nhưng giá trị = 0. Vì vậy phải xét *truthy*
    (khác 0 và khác None), không chỉ kiểm tra key tồn tại.
    """
    for row in income_rows or []:
        if any(row.get(code) for code in _BANK_SIGNATURE):
            return "B"
    return "A"


def detect_subsector(p: Period, ccc: float | None = None) -> str:
    """Heuristic ngành phụ (Template A) trên tỷ trọng BCĐKT 1 kỳ. Mặc định 'san_xuat'."""
    from app.services.bctc.statements import val
    ta = val(p, "total_assets")
    if not ta:
        return "san_xuat"
    nfa = (val(p, "net_fixed_assets") or 0.0) / ta
    inv = (val(p, "inventory_gross") or 0.0) / ta
    bp = (val(p, "buyer_prepayments") or 0.0) / ta
    if bp > 0.15 and inv > 0.30:
        return "bat_dong_san"
    if nfa > 0.60:
        return "tien_ich"
    if ccc is not None and ccc < 0 and inv > 0.20:
        return "ban_le"
    if nfa < 0.20 and inv < 0.05:
        return "cntt_dichvu"
    return "san_xuat"
