"""Tests for the BCTC dashboard AI narrative layer (Task B4).

Covers:
- ``validate_narrative`` schema + forbidden-token rules (Template A & B).
- ``build_user_content`` produces valid JSON from a dashboard dict.
- ``generate_narrative`` retry loop: parses/validates a mocked ``chat_completion``.
"""

from __future__ import annotations

import copy
import json
from unittest.mock import AsyncMock, patch

from app.services.bctc_dashboard.narrative import generate_narrative
from app.services.bctc_dashboard.narrative_prompt import (
    SYSTEM_PROMPT,
    build_user_content,
)
from app.services.bctc_dashboard.narrative_validator import validate_narrative


# ── sample valid narratives ──────────────────────────────────────────────────


def _valid_a() -> dict:
    return {
        "verdict_oneliner": "Công ty phần mềm tăng trưởng đều, kiếm ra tiền thật, tài chính vững.",
        "story": {
            "lead": "Đây là doanh nghiệp lớn lên bằng lợi nhuận tự giữ lại.",
            "paragraphs": [
                "Doanh thu tăng đều nhiều năm, biên lợi nhuận giữ ở mức cao.",
                "Mỗi đồng lợi nhuận tạo ra hơn một đồng tiền mặt, ít nợ vay.",
                "Giá đang gần vùng hợp lý, cần theo dõi khoản phải thu.",
            ],
            "strengths": [
                "Tăng trưởng doanh thu đều",
                "Biên lợi nhuận cao",
                "Dòng tiền thật",
                "Có nhiều tiền hơn nợ vay",
            ],
            "watchlist": ["Khách hàng trả tiền chậm dần"],
        },
        "blocks": {
            "valuation": {"answer": "Giá đang ở vùng hợp lý, hơi thiên rẻ so với ngành."},
            "financial": {"answer": "Công ty phình to nhờ lợi nhuận tự giữ lại là chính."},
            "business": {"answer": "Có — kinh doanh ổn định, biên lợi nhuận cao hơn trung vị ngành."},
            "cashflow": {"answer": "Tiền là thật: mỗi đồng lợi nhuận tạo ra hơn một đồng tiền mặt."},
            "health": {
                "answer": "Rất vững, nguy cơ mất khả năng trả nợ rất thấp.",
                "sub": {
                    "a": "Nợ vay thấp, có nhiều tiền hơn nợ.",
                    "b": "Khả năng trả lãi vay rất cao.",
                    "c": "Sổ sách sạch, lợi nhuận khớp với tiền mặt.",
                },
            },
            "dividend": {"answer": "Cổ đông nhận cổ tức tiền mặt đều đặn mỗi năm."},
        },
    }


def _valid_b() -> dict:
    return {
        "verdict_oneliner": "Ngân hàng biên lãi ổn, sinh lời tốt, nợ xấu trong tầm kiểm soát.",
        "story": {
            "lead": "Đây là ngân hàng có bộ đệm dự phòng khá dày.",
            "paragraphs": [
                "Thu nhập chủ yếu đến từ lãi thuần, biên lãi ròng ổn định.",
                "Chi phí vận hành thấp so với thu nhập, bộ đệm dự phòng dày.",
                "Định giá P/B ở mức hợp lý, cần theo dõi nợ xấu.",
            ],
            "strengths": [
                "Biên lãi ròng ổn",
                "Sinh lời tốt",
                "Chi phí vận hành thấp",
                "Bộ đệm dự phòng dày",
            ],
            "watchlist": ["Tỷ lệ nợ xấu nhích lên"],
        },
        "blocks": {
            "valuation": {"answer": "P/B đang ở mức hợp lý theo khả năng sinh lời."},
            "financial": {"answer": "Tài sản mở rộng chủ yếu nhờ tiền gửi huy động."},
            "earning": {"answer": "Biên lãi ròng ổn định, thu nhập chủ yếu từ lãi thuần."},
            "efficiency": {"answer": "Tỷ lệ chi phí trên thu nhập thấp, vận hành hiệu quả."},
            "asset_quality": {
                "answer": "Chất lượng tài sản ổn, nợ xấu trong tầm kiểm soát.",
                "sub": {
                    "a": "Tỷ lệ nợ xấu thấp so với ngưỡng cảnh báo.",
                    "b": "Bộ đệm dự phòng đủ dày.",
                },
            },
            "dividend": {"answer": "Cổ tức chủ yếu bằng cổ phiếu."},
        },
    }


def _fake_dashboard_a() -> dict:
    return {
        "template": "A",
        "sub_sector": "CNTT/Dịch vụ",
        "hero": {
            "ticker": "FPT",
            "name": "CTCP FPT",
            "exchange": "HOSE",
            "sector": "Công nghệ",
            "price": 135000,
            "fair_value": 141000,
            "upside_pct": 0.044,
        },
        "radar": {
            "dims": [
                {"key": "business", "label": "Kinh doanh", "value_label": "18.7%",
                 "value": 0.187, "score": 4, "band": "green"},
            ]
        },
        "blocks": {
            "valuation": {
                "current_price": 135000,
                "fair_median": 141000,
                "upside_pct": 0.044,
                "methods": [],
                "metrics": [
                    {"key": "pe", "label": "P/E", "value": 18.2, "peer_median": 20.0, "color": "green"},
                    {"key": "roe", "label": "ROE", "value": 24.1, "peer_median": 15.0, "color": "green"},
                ],
            },
            "business": {
                "revenue_series": [{"year": 2024, "revenue": 5.0e13, "gross_margin": 0.38, "net_margin": 0.16}],
                "metrics": [
                    {"key": "revenue_growth", "label": "Tăng trưởng doanh thu",
                     "value": 18.7, "unit": "%", "peer_median": 11.0, "color": "green"},
                ],
                "earnings_quality": {"core_pct": 0.92, "oneoff_pct": 0.08, "peer_median": None},
            },
            "cashflow": {
                "profit_vs_cash": [{"year": 2024, "profit": 8.0e12, "cfo": 9.4e12}],
                "metrics": [
                    {"key": "cfo_ni", "label": "Tiền từ KD / Lợi nhuận",
                     "value": 1.18, "unit": "x", "peer_median": 1.0, "color": "green"},
                ],
                "waterfall": [],
            },
            "health": {
                "sub_a": {"series": [{"year": 2024, "value": 0.2}], "peer": []},
                "sub_b": {"series": [{"year": 2024, "value": 12.0}], "peer": []},
                "sub_c": {"series": [{"year": 2024, "company": 45.0, "peer": None}], "checklist": []},
            },
            "dividend": {"series": [], "yield": 0.02, "payout": 0.3, "form": "tiền mặt"},
        },
        "meta": {
            "periods": ["2020", "2021", "2022", "2023", "2024"],
            "is_estimated_fields": ["blocks.business.earnings_quality"],
            "disclaimers": ["..."],
        },
    }


# ── validator: valid samples pass ─────────────────────────────────────────────


def test_validate_narrative_valid_a_passes() -> None:
    assert validate_narrative(_valid_a(), "A") == []


def test_validate_narrative_valid_b_passes() -> None:
    assert validate_narrative(_valid_b(), "B") == []


# ── validator: forbidden tokens ───────────────────────────────────────────────


def test_validate_narrative_forbidden_model_name_in_answer() -> None:
    out = _valid_a()
    out["blocks"]["cashflow"]["answer"] = "Phân tích DuPont cho thấy ROE bền vững."
    errors = validate_narrative(out, "A")
    assert any("dupont" in e.lower() for e in errors)


def test_validate_narrative_forbidden_model_name_in_verdict() -> None:
    out = _valid_a()
    out["verdict_oneliner"] = "Altman Z-score cho thấy tài chính an toàn."
    errors = validate_narrative(out, "A")
    assert errors  # any of altman / z-score triggers


def test_validate_narrative_forbidden_recommendation() -> None:
    out = _valid_a()
    out["story"]["paragraphs"][2] = "Với định giá này, nhà đầu tư nên mua vào."
    errors = validate_narrative(out, "A")
    assert any("nên mua" in e.lower() for e in errors)


def test_validate_narrative_forbidden_khuyennghi() -> None:
    out = _valid_b()
    out["blocks"]["valuation"]["answer"] = "Khuyến nghị nắm giữ dài hạn."
    errors = validate_narrative(out, "B")
    assert errors


# ── validator: schema/shape ───────────────────────────────────────────────────


def test_validate_narrative_wrong_template_keys() -> None:
    # A-shaped output validated as Template B → missing earning/efficiency/asset_quality.
    errors = validate_narrative(_valid_a(), "B")
    assert errors


def test_validate_narrative_paragraphs_not_three() -> None:
    out = _valid_a()
    out["story"]["paragraphs"] = ["chỉ có một đoạn", "và hai đoạn"]
    errors = validate_narrative(out, "A")
    assert any("paragraph" in e.lower() for e in errors)


def test_validate_narrative_missing_block_answer() -> None:
    out = _valid_a()
    del out["blocks"]["valuation"]["answer"]
    errors = validate_narrative(out, "A")
    assert any("valuation" in e.lower() for e in errors)


def test_validate_narrative_health_sub_missing_key_a() -> None:
    out = _valid_a()
    del out["blocks"]["health"]["sub"]["c"]
    errors = validate_narrative(out, "A")
    assert any("sub" in e.lower() and "c" in e.lower() for e in errors)


def test_validate_narrative_asset_quality_extra_sub_key_b() -> None:
    # Template B asset_quality.sub must be exactly {a, b} — a stray "c" is invalid.
    out = _valid_b()
    out["blocks"]["asset_quality"]["sub"]["c"] = "không được có c"
    errors = validate_narrative(out, "B")
    assert errors


def test_validate_narrative_extra_top_level_key() -> None:
    out = _valid_a()
    out["verdict"] = "nhãn ngắn bị cấm"
    errors = validate_narrative(out, "A")
    assert any("verdict" in e.lower() for e in errors)


def test_validate_narrative_not_a_dict() -> None:
    assert validate_narrative([], "A")  # non-empty error list


# ── build_user_content ────────────────────────────────────────────────────────


def test_build_user_content_is_valid_json() -> None:
    payload = build_user_content(_fake_dashboard_a())
    obj = json.loads(payload)
    assert obj["ticker"] == "FPT"
    assert obj["company_name"] == "CTCP FPT"
    assert obj["template"] == "A"
    assert obj["price"] == 135000
    assert obj["fair_value"] == 141000
    assert isinstance(obj["metrics"], dict)
    # a computed metric survives into the flattened map
    assert "revenue_growth" in obj["metrics"]


def test_system_prompt_embedded() -> None:
    assert isinstance(SYSTEM_PROMPT, str)
    assert "SYSTEM PROMPT" in SYSTEM_PROMPT
    assert "verdict_oneliner" in SYSTEM_PROMPT


# ── generate_narrative (mocked chat_completion) ───────────────────────────────


async def test_generate_narrative_parses_and_validates() -> None:
    ai_json = json.dumps(_valid_a(), ensure_ascii=False)
    with patch(
        "app.services.bctc_dashboard.narrative.chat_completion",
        new_callable=AsyncMock,
        return_value=(ai_json, "test-model"),
    ):
        result = await generate_narrative("FPT", data=_fake_dashboard_a())
    assert set(result["blocks"].keys()) == {
        "valuation", "financial", "business", "cashflow", "health", "dividend",
    }
    assert result["verdict_oneliner"]
    assert validate_narrative(result, "A") == []


async def test_generate_narrative_strips_json_fence() -> None:
    fenced = "```json\n" + json.dumps(_valid_a(), ensure_ascii=False) + "\n```"
    with patch(
        "app.services.bctc_dashboard.narrative.chat_completion",
        new_callable=AsyncMock,
        return_value=(fenced, "m"),
    ):
        result = await generate_narrative("FPT", data=_fake_dashboard_a())
    assert result["story"]["lead"]


async def test_generate_narrative_retries_on_bad_json_then_succeeds() -> None:
    good = json.dumps(_valid_a(), ensure_ascii=False)
    mock = AsyncMock(side_effect=[("this is not json", "m"), (good, "m")])
    with patch("app.services.bctc_dashboard.narrative.chat_completion", mock):
        result = await generate_narrative("FPT", data=_fake_dashboard_a(), max_retries=3)
    assert validate_narrative(result, "A") == []
    assert mock.await_count == 2


async def test_generate_narrative_retries_on_forbidden_then_succeeds() -> None:
    bad = copy.deepcopy(_valid_a())
    bad["verdict_oneliner"] = "Nhà đầu tư nên mua ngay."
    good = json.dumps(_valid_a(), ensure_ascii=False)
    mock = AsyncMock(
        side_effect=[(json.dumps(bad, ensure_ascii=False), "m"), (good, "m")]
    )
    with patch("app.services.bctc_dashboard.narrative.chat_completion", mock):
        result = await generate_narrative("FPT", data=_fake_dashboard_a(), max_retries=3)
    assert validate_narrative(result, "A") == []
    assert mock.await_count == 2


# ── endpoint: GET /api/v1/ai/bctc-dashboard/{symbol} (premium) ────────────────


async def test_endpoint_bctc_dashboard_narrative_success(client, premium_user) -> None:
    _user, headers = premium_user
    with patch(
        "app.api.v1.endpoints.ai_analysis.generate_narrative",
        new_callable=AsyncMock,
        return_value=_valid_a(),
    ):
        resp = await client.get("/api/v1/ai/bctc-dashboard/FPT", headers=headers)
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["verdict_oneliner"]
    assert set(body["blocks"].keys()) == {
        "valuation", "financial", "business", "cashflow", "health", "dividend",
    }


async def test_endpoint_bctc_dashboard_narrative_requires_auth(client) -> None:
    resp = await client.get("/api/v1/ai/bctc-dashboard/FPT")
    assert resp.status_code == 401


async def test_endpoint_bctc_dashboard_narrative_proxy_error_502(
    client, premium_user
) -> None:
    from app.services.ai.proxy_client import AIProxyError

    _user, headers = premium_user
    with patch(
        "app.api.v1.endpoints.ai_analysis.generate_narrative",
        new_callable=AsyncMock,
        side_effect=AIProxyError("timeout"),
    ):
        resp = await client.get("/api/v1/ai/bctc-dashboard/FPT", headers=headers)
    assert resp.status_code == 502
