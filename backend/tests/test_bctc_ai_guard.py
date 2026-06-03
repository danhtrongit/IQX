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
