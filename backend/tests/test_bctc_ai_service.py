from __future__ import annotations

from unittest.mock import AsyncMock, patch

from app.services.ai.analysis_service import analyze_bctc


async def test_analyze_bctc_parses_and_guards() -> None:
    payload = {"symbol": "FPT", "term_type": 1, "language": "vi",
               "bctc": {"snapshot": [{"value": 0.241}], "modules": [], "trinity": {}}}
    ai_json = '```json\n{"memo":"Biên gộp 24.1% ổn định.","modules":{"dupont":"ROE 24.1% bền vững."}}\n```'
    with patch("app.services.ai.analysis_service.build_bctc_ai_payload", new_callable=AsyncMock, return_value=payload), \
         patch("app.services.ai.analysis_service.load_prompt", return_value="SYS"), \
         patch("app.services.ai.analysis_service.chat_completion", new_callable=AsyncMock, return_value=(ai_json, "test-model")):
        result = await analyze_bctc(symbol="FPT", term_type=1)
    assert result["type"] == "bctc"
    assert result["analysis"]["memo"].startswith("Biên gộp")
    assert "dupont" in result["analysis"]["modules"]
    assert result["model"] == "test-model"


async def test_analyze_bctc_guard_drops_fabricated() -> None:
    payload = {"symbol": "FPT", "term_type": 1, "language": "vi",
               "bctc": {"snapshot": [{"value": 0.241}], "modules": [], "trinity": {}}}
    # memo cites 99.9% (not in payload) -> guard drops it to "".
    ai_json = '{"memo":"ROE đạt 99.9% và khuyến nghị MUA.","modules":{}}'
    with patch("app.services.ai.analysis_service.build_bctc_ai_payload", new_callable=AsyncMock, return_value=payload), \
         patch("app.services.ai.analysis_service.load_prompt", return_value="SYS"), \
         patch("app.services.ai.analysis_service.chat_completion", new_callable=AsyncMock, return_value=(ai_json, "m")):
        result = await analyze_bctc(symbol="FPT", term_type=1)
    assert result["analysis"]["memo"] == ""  # dropped by guard


async def test_analyze_bctc_extracts_json_wrapped_in_prose() -> None:
    # LLM thêm prose quanh JSON -> vẫn trích đúng object, không để prose lọt vào memo.
    payload = {"symbol": "FPT", "term_type": 1, "language": "vi",
               "bctc": {"snapshot": [{"value": 0.241}], "modules": [], "trinity": {}}}
    ai_text = 'Đây là phân tích:\n```json\n{"memo":"Biên gộp 24.1% tốt.","modules":{}}\n```\nHết.'
    with patch("app.services.ai.analysis_service.build_bctc_ai_payload", new_callable=AsyncMock, return_value=payload), \
         patch("app.services.ai.analysis_service.load_prompt", return_value="SYS"), \
         patch("app.services.ai.analysis_service.chat_completion", new_callable=AsyncMock, return_value=(ai_text, "m")):
        result = await analyze_bctc(symbol="FPT", term_type=1)
    assert result["analysis"]["memo"] == "Biên gộp 24.1% tốt."  # prose stripped, only JSON memo


async def test_analyze_bctc_malformed_output_empty_memo() -> None:
    # Output không có JSON hợp lệ -> memo rỗng (không leak prose qua guard).
    payload = {"symbol": "FPT", "term_type": 1, "language": "vi",
               "bctc": {"snapshot": [], "modules": [], "trinity": {}}}
    with patch("app.services.ai.analysis_service.build_bctc_ai_payload", new_callable=AsyncMock, return_value=payload), \
         patch("app.services.ai.analysis_service.load_prompt", return_value="SYS"), \
         patch("app.services.ai.analysis_service.chat_completion", new_callable=AsyncMock, return_value=("Xin lỗi, tôi không thể phân tích.", "m")):
        result = await analyze_bctc(symbol="FPT", term_type=1)
    assert result["analysis"]["memo"] == ""
    assert result["analysis"]["modules"] == {}
