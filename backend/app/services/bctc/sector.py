from __future__ import annotations

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
