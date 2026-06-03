from __future__ import annotations

from app.services.bctc.ai_guard import sanitize_ai_output, extract_allowed_numbers


def test_extract_allowed_numbers_from_payload() -> None:
    payload = {"snapshot": [{"value": 0.241}, {"value": None}],
               "modules": [{"data": {"dso": 89.0, "x": None}}], "trinity": {"altman_z": 4.21}}
    nums = extract_allowed_numbers(payload)
    assert 0.241 in nums and 89.0 in nums and 4.21 in nums


def test_guard_blocks_recommendation_words() -> None:
    out = sanitize_ai_output("Khuyến nghị MUA mạnh cổ phiếu này.", allowed_numbers=set())
    assert out["ok"] is False
    assert any("khuyến nghị" in v.lower() or "mua" in v.lower() for v in out["violations"])


def test_guard_flags_fabricated_number() -> None:
    out = sanitize_ai_output("ROE đạt 99.9% theo ước tính.", allowed_numbers={0.241})
    assert out["ok"] is False
    assert any("99.9" in v for v in out["violations"])


def test_guard_passes_clean_text() -> None:
    out = sanitize_ai_output("Biên gộp 24.1% cải thiện so với năm trước.", allowed_numbers={24.1})
    assert out["ok"] is True
    assert out["violations"] == []


def test_guard_accepts_vietnamese_decimal_comma() -> None:
    # AI viết "24,1%" (thập phân kiểu VN) -> phải khớp allowed 24.1, KHÔNG bị loại.
    out = sanitize_ai_output("Biên gộp đạt 24,1% trong năm.", allowed_numbers={24.1})
    assert out["ok"] is True


def test_guard_accepts_ty_vnd_scale() -> None:
    # AI viết "10.590 tỷ"; payload lưu raw VND. /1e9 phải khớp.
    out = sanitize_ai_output("CFO đạt 10.590 tỷ đồng.", allowed_numbers={10_590_000_000_000.0})
    assert out["ok"] is True


def test_guard_whitelists_years() -> None:
    out = sanitize_ai_output("Doanh thu tăng đều giai đoạn 2021–2025.", allowed_numbers=set())
    assert out["ok"] is True


def test_guard_still_catches_fabrication_vi_comma() -> None:
    # "99,9%" không có trong allowed -> vẫn bị loại (kể cả khi viết dấu phẩy VN).
    out = sanitize_ai_output("ROE đạt 99,9% theo ước tính.", allowed_numbers={24.1})
    assert out["ok"] is False
    assert any("99,9" in v for v in out["violations"])
