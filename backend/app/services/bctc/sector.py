from __future__ import annotations

_BANK_SIGNATURE = ("isb38", "isb27", "isb43")


def detect_template(income_rows: list[dict]) -> str:
    """'B' nếu xuất hiện FieldCode đặc trưng ngân hàng (TOI/NII/NPAT bank), ngược lại 'A'."""
    for row in income_rows or []:
        if any(row.get(code) is not None for code in _BANK_SIGNATURE):
            return "B"
    return "A"
