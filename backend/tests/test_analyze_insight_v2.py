"""TDD tests for analyze_insight v2 (BT8).

Monkeypatches:
- chat_completion  → returns a fixture v2 JSON string
- build_insight_payload → minimal payload
- load_prev_insight → None (first analysis)
- save_insight     → AsyncMock (records call)
- cache get/set    → no-ops
- get_session_factory → dummy async context manager yielding a sentinel db
"""

from __future__ import annotations

import json
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ── Fixture v2 AI JSON (matches prompt schema: L1..L6) ──────────────────────

_AI_JSON = {
    "L1": {
        "xu_huong": "Tăng",
        "statusLabel": "Mạnh",
        "ho_tro": "85,000",
        "khang_cu": "88,000",
        "da_gia": "Đang mạnh dần",
        "diff": "lần đầu",
    },
    "L2": {
        "thanh_khoan": "Cao",
        "statusLabel": "Tốt",
        "cung_cau": "Cầu vượt cung",
        "tac_dong": "Thuận lợi cho khớp lệnh",
        "diff": "lần đầu",
    },
    "L3": {
        "khoi_ngoai": "Mua ròng nhẹ",
        "tu_doanh": "Trung tính",
        "statusLabel": "Hỗ trợ nhẹ",
        "diff": "lần đầu",
    },
    "L4": {
        "noi_bo": "Không có giao dịch mới",
        "khoi_luong_tong": "—",
        "statusLabel": "Trung tính",
        "diff": "lần đầu",
    },
    "L5": {
        "tong_quan": "Tích cực",
        "statusLabel": "Tích cực",
        "tin_material": [],
        "tin_filler": [],
        "tac_dong": "Hỗ trợ xu hướng tăng",
        "diff": "lần đầu",
    },
    "L6": {
        "trend": "Tăng",
        "status": "Mạnh",
        "timeframe": "ngắn hạn 1 tuần",
        "narrative": "VCB đang trong xu hướng tăng tốt.",
        "diff": "lần đầu",
        "observations": {
            "liquidity": "Thanh khoản cao.",
            "moneyFlow": "Khối ngoại mua ròng.",
            "insider": "Không có giao dịch nội bộ mới.",
            "news": "Tích cực.",
            "supportResistance": "Hỗ trợ 85,000 – kháng cự 88,000.",
        },
        "watchLevels": [
            {"tag": "Hỗ trợ 85,000", "description": "Mốc cần giữ."}
        ],
        "recommendation": "Có thể mua thử",
    },
}

_AI_JSON_STR = json.dumps(_AI_JSON, ensure_ascii=False)

# ── Minimal payload fixture ──────────────────────────────────────────────────

_PAYLOAD = {
    "symbol": "VCB",
    "price_board": [
        {
            "symbol": "VCB",
            "exchange": "HOSE",
            "close_price": 86000,
            "reference_price": 85500,
            "high_price": 86500,
            "low_price": 85000,
            "total_volume": 15_000_000,
        }
    ],
    "company_overview": {"exchange": "HOSE"},
    "company_details": {"icb_name_2": "Ngân hàng", "stock_type": "VN30"},
    "ohlcv_30": [],
    "derived": {},
    "supply_demand": [],
    "foreign_trade": [],
    "proprietary": [],
    "insider_deals": [],
    "news": [],
}


# ── Helpers ──────────────────────────────────────────────────────────────────


def _make_session_factory(sentinel_db):
    """Return a callable that produces an async context manager yielding sentinel_db."""

    class _FakeCtx:
        async def __aenter__(self):
            return sentinel_db

        async def __aexit__(self, *args):
            pass

    def _factory():
        return _FakeCtx()

    return _factory


# ── Main test ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_analyze_insight_v2_happy_path() -> None:
    """analyze_insight returns v2 contract; save_insight called with raw ai_json."""
    sentinel_db = object()  # dummy db session
    mock_save = AsyncMock()

    with (
        patch(
            "app.services.ai.analysis_service.build_insight_payload",
            new_callable=AsyncMock,
            return_value=_PAYLOAD.copy(),
        ),
        patch(
            "app.services.ai.analysis_service.chat_completion",
            new_callable=AsyncMock,
            return_value=(_AI_JSON_STR, "test-model"),
        ),
        patch(
            "app.services.ai.analysis_service.load_prompt",
            return_value="system prompt",
        ),
        patch(
            "app.services.ai.analysis_service._cache_get_analysis",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "app.services.ai.analysis_service._cache_set_analysis",
            new_callable=AsyncMock,
        ),
        # Patch history helpers at the analysis_service module level (top-level imports)
        patch(
            "app.services.ai.analysis_service.load_prev_insight",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "app.services.ai.analysis_service.save_insight",
            mock_save,
        ),
        patch(
            "app.services.ai.analysis_service.get_session_factory",
            return_value=_make_session_factory(sentinel_db),
        ),
    ):
        from app.services.ai.analysis_service import analyze_insight

        result = await analyze_insight(symbol="VCB")

    # ── Shape assertions: v2 contract ─────────────────────────────────────────
    assert "briefing" in result, "result must have 'briefing'"
    assert "layers" in result, "result must have 'layers'"
    assert "header" in result, "result must have 'header'"

    layers = result["layers"]
    for layer_key in ("L1", "L2", "L3", "L4", "L5"):
        assert layer_key in layers, f"layers must contain {layer_key}"

    # ── NO old v1 fields ──────────────────────────────────────────────────────
    assert "summary" not in result, "'summary' must NOT be in v2 result"
    assert "totalPower" not in result, "'totalPower' must NOT be in v2 result"

    # ── dataSummary present ───────────────────────────────────────────────────
    assert "dataSummary" in result
    assert result["dataSummary"]["model"] == "test-model"

    # ── save_insight called once with today + raw ai_json ────────────────────
    mock_save.assert_awaited_once()
    call_args = mock_save.await_args
    _db_arg, sym_arg, date_arg, payload_arg = call_args.args

    assert sym_arg == "VCB"
    assert date_arg == date.today()
    # payload must be the RAW ai_json dict (contains L1 key), NOT the built response
    assert isinstance(payload_arg, dict)
    assert "L1" in payload_arg, "save_insight must receive raw ai_json (with L1 key)"
    assert "briefing" not in payload_arg, "save_insight must NOT receive the built response"


@pytest.mark.asyncio
async def test_analyze_insight_v2_cache_hit() -> None:
    """Cache hit returns immediately without calling chat_completion."""
    cached = {
        "symbol": "VCB",
        "layers": {"L1": {}, "L2": {}, "L3": {}, "L4": {}, "L5": {}},
        "briefing": {},
        "header": {},
        "updatedAt": "2026-06-24T00:00:00+00:00",
        "rawInput": {},
        "dataSummary": {"model": "cached-model", "as_of": "2026-06-24T00:00:00+00:00"},
    }
    mock_chat = AsyncMock()

    with (
        patch(
            "app.services.ai.analysis_service._cache_get_analysis",
            new_callable=AsyncMock,
            return_value=cached,
        ),
        patch(
            "app.services.ai.analysis_service.chat_completion",
            mock_chat,
        ),
    ):
        from app.services.ai.analysis_service import analyze_insight

        result = await analyze_insight(symbol="VCB")

    assert result is cached
    mock_chat.assert_not_called()


@pytest.mark.asyncio
async def test_analyze_insight_v2_non_json_fallback() -> None:
    """When AI returns prose (non-JSON), analyze_insight returns a valid v2 shape."""
    sentinel_db = object()
    mock_save = AsyncMock()

    with (
        patch(
            "app.services.ai.analysis_service.build_insight_payload",
            new_callable=AsyncMock,
            return_value=_PAYLOAD.copy(),
        ),
        patch(
            "app.services.ai.analysis_service.chat_completion",
            new_callable=AsyncMock,
            return_value=("không phải JSON, chỉ là văn xuôi", "fallback-model"),
        ),
        patch(
            "app.services.ai.analysis_service.load_prompt",
            return_value="system prompt",
        ),
        patch(
            "app.services.ai.analysis_service._cache_get_analysis",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "app.services.ai.analysis_service._cache_set_analysis",
            new_callable=AsyncMock,
        ),
        patch(
            "app.services.ai.analysis_service.load_prev_insight",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "app.services.ai.analysis_service.save_insight",
            mock_save,
        ),
        patch(
            "app.services.ai.analysis_service.get_session_factory",
            return_value=_make_session_factory(sentinel_db),
        ),
    ):
        from app.services.ai.analysis_service import analyze_insight

        result = await analyze_insight(symbol="VCB")

    # Must not crash and must return a valid v2 shape
    assert "layers" in result
    assert "briefing" in result
    assert "header" in result
    assert "summary" not in result
