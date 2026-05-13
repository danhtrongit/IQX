"""Tests for AI analysis: prompt_loader, proxy_client, payloads, endpoints."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.ai.prompt_loader import (
    _DOCS_AI_DIR,
    PROMPT_FILES,
    clear_cache,
    load_prompt,
)

# ═══════════════════════════════════════════════════════
# 1. Prompt Loader Tests
# ═══════════════════════════════════════════════════════


class TestPromptLoader:
    def setup_method(self) -> None:
        clear_cache()

    def test_load_dashboard_prompt(self) -> None:
        content = load_prompt("dashboard")
        assert len(content) > 100
        assert "AI Market Analyst" in content or "dashboard" in content.lower()

    def test_load_industry_prompt(self) -> None:
        content = load_prompt("industry")
        assert len(content) > 100
        assert "ngành" in content.lower() or "industry" in content.lower()

    def test_load_insight_prompt(self) -> None:
        content = load_prompt("insight")
        assert len(content) > 100
        assert "Lớp 1" in content or "insight" in content.lower()

    def test_invalid_prompt_type_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="không hợp lệ"):
            load_prompt("nonexistent")

    def test_missing_file_raises_file_not_found(self, tmp_path: Path) -> None:
        clear_cache()
        with (
            patch("app.services.ai.prompt_loader._DOCS_AI_DIR", tmp_path),
            pytest.raises(FileNotFoundError, match="Không tìm thấy"),
        ):
            load_prompt("dashboard")

    def test_prompt_is_cached(self) -> None:
        c1 = load_prompt("dashboard")
        c2 = load_prompt("dashboard")
        assert c1 is c2  # same object from cache

    def test_all_prompt_files_exist(self) -> None:
        for _ptype, fname in PROMPT_FILES.items():
            fp = _DOCS_AI_DIR / fname
            assert fp.is_file(), f"Missing prompt file: {fp}"


# ═══════════════════════════════════════════════════════
# 2. Proxy Client Tests
# ═══════════════════════════════════════════════════════


class TestProxyClient:
    @pytest.fixture(autouse=True)
    def _clear_settings_cache(self) -> None:
        from app.core.config import get_settings
        get_settings.cache_clear()

    async def test_chat_completion_success(self) -> None:
        from app.services.ai.proxy_client import chat_completion

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": "Test analysis"}}],
            "model": "cx/gpt-5.5",
        }
        mock_resp.raise_for_status = MagicMock()

        with patch("app.services.ai.proxy_client.httpx.AsyncClient") as mock_client:
            instance = AsyncMock()
            instance.post.return_value = mock_resp
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            mock_client.return_value = instance

            text, model = await chat_completion(
                system_prompt="test prompt", user_content='{"data": 1}',
            )

        assert text == "Test analysis"
        assert model == "cx/gpt-5.5"
        call_args = instance.post.call_args
        assert "/chat/completions" in call_args[0][0]
        headers = call_args[1]["headers"]
        assert headers["Authorization"].startswith("Bearer ")
        body = call_args[1]["json"]
        assert body["model"] == "test-model"
        assert len(body["messages"]) == 2

    async def test_chat_completion_http_error(self) -> None:
        from app.services.ai.proxy_client import AIProxyError, chat_completion

        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "err", request=MagicMock(), response=mock_resp,
        )

        with patch("app.services.ai.proxy_client.httpx.AsyncClient") as mc:
            instance = AsyncMock()
            instance.post.return_value = mock_resp
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            mc.return_value = instance

            with pytest.raises(AIProxyError, match="HTTP 500"):
                await chat_completion(system_prompt="p", user_content="c")

    async def test_chat_completion_timeout(self) -> None:
        from app.services.ai.proxy_client import AIProxyError, chat_completion

        with patch("app.services.ai.proxy_client.httpx.AsyncClient") as mc:
            instance = AsyncMock()
            instance.post.side_effect = httpx.ReadTimeout("timeout")
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            mc.return_value = instance

            with pytest.raises(AIProxyError, match="timeout"):
                await chat_completion(system_prompt="p", user_content="c")

    async def test_chat_completion_bad_response_shape(self) -> None:
        from app.services.ai.proxy_client import AIProxyError, chat_completion

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"no_choices": True}
        mock_resp.raise_for_status = MagicMock()

        with patch("app.services.ai.proxy_client.httpx.AsyncClient") as mc:
            instance = AsyncMock()
            instance.post.return_value = mock_resp
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            mc.return_value = instance

            with pytest.raises(AIProxyError, match="choices"):
                await chat_completion(system_prompt="p", user_content="c")

    async def test_missing_base_url_raises(self) -> None:
        import os

        from app.core.config import get_settings
        from app.services.ai.proxy_client import chat_completion

        old = os.environ.get("AI_PROXY_BASE_URL", "")
        os.environ["AI_PROXY_BASE_URL"] = ""
        get_settings.cache_clear()
        try:
            with pytest.raises(ValueError, match="AI_PROXY_BASE_URL"):
                await chat_completion(system_prompt="p", user_content="c")
        finally:
            os.environ["AI_PROXY_BASE_URL"] = old
            get_settings.cache_clear()

    async def test_missing_api_key_raises(self) -> None:
        import os

        from app.core.config import get_settings
        from app.services.ai.proxy_client import chat_completion

        old = os.environ.get("AI_PROXY_API_KEY", "")
        os.environ["AI_PROXY_API_KEY"] = ""
        get_settings.cache_clear()
        try:
            with pytest.raises(ValueError, match="AI_PROXY_API_KEY"):
                await chat_completion(system_prompt="p", user_content="c")
        finally:
            os.environ["AI_PROXY_API_KEY"] = old
            get_settings.cache_clear()

    async def test_api_key_not_in_exception_message(self) -> None:
        from app.services.ai.proxy_client import AIProxyError, chat_completion

        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "err", request=MagicMock(), response=mock_resp,
        )

        with patch("app.services.ai.proxy_client.httpx.AsyncClient") as mc:
            instance = AsyncMock()
            instance.post.return_value = mock_resp
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            mc.return_value = instance

            with pytest.raises(AIProxyError) as exc_info:
                await chat_completion(system_prompt="p", user_content="c")

            assert "test-api-key" not in str(exc_info.value)


# ═══════════════════════════════════════════════════════
# 3. Payload Builder Tests
# ═══════════════════════════════════════════════════════


class TestPayloadBuilders:
    async def test_dashboard_payload_structure(self) -> None:

        async def _mock_fetch(*a, **kw):  # noqa: ANN002
            return [], "http://mock"

        async def _mock_news(*a, **kw):  # noqa: ANN002
            return [], 0, "http://mock"

        _ov = "app.services.market_data.sources.vietcap_market_overview"
        _ai = "app.services.market_data.sources.vietcap_ai_news"
        patches = [
            patch(f"{_ov}.fetch_market_index", _mock_fetch),
            patch(f"{_ov}.fetch_liquidity", _mock_fetch),
            patch(f"{_ov}.fetch_breadth", _mock_fetch),
            patch(f"{_ov}.fetch_sectors_allocation", _mock_fetch),
            patch(f"{_ov}.fetch_index_impact", _mock_fetch),
            patch(f"{_ov}.fetch_foreign", _mock_fetch),
            patch(f"{_ov}.fetch_foreign_top", _mock_fetch),
            patch(f"{_ov}.fetch_proprietary", _mock_fetch),
            patch(f"{_ov}.fetch_proprietary_top", _mock_fetch),
            patch(f"{_ai}.fetch_news_list", _mock_news),
        ]
        for p in patches:
            p.start()
        try:
            from app.services.ai.payloads import build_dashboard_payload
            payload = await build_dashboard_payload(language="vi")
        finally:
            for p in patches:
                p.stop()

        assert "as_of" in payload
        assert payload["language"] == "vi"
        for key in [
            "market_index", "liquidity", "breadth", "sectors_allocation",
            "index_impact", "foreign", "foreign_top", "proprietary",
            "proprietary_top", "news",
        ]:
            assert key in payload

    async def test_industry_payload_structure(self) -> None:
        async def _mock_fetch(*a, **kw):  # noqa: ANN002
            return [], "http://mock"

        _ov = "app.services.market_data.sources.vietcap_market_overview"
        _sec = "app.services.market_data.sources.vietcap_sector"
        patches = [
            patch(f"{_ov}.fetch_sector_detail", _mock_fetch),
            patch(f"{_ov}.fetch_sectors_allocation", _mock_fetch),
            patch(f"{_sec}.fetch_sector_information", _mock_fetch),
            patch(f"{_sec}.fetch_sector_ranking", _mock_fetch),
            patch(f"{_ov}.fetch_stock_strength", _mock_fetch),
            patch(f"{_ov}.fetch_market_index", _mock_fetch),
            patch(f"{_ov}.fetch_foreign_top", _mock_fetch),
        ]
        for p in patches:
            p.start()
        try:
            from app.services.ai.payloads import build_industry_payload
            payload = await build_industry_payload(icb_code=8300, language="vi")
        finally:
            for p in patches:
                p.stop()

        assert payload["icb_code"] == 8300
        for key in [
            "sector_detail_1d", "sector_detail_1w", "sector_detail_1m",
            "sectors_allocation", "sector_information", "sector_ranking",
            "stock_strength", "market_index", "foreign_top",
        ]:
            assert key in payload

    async def test_insight_payload_structure(self) -> None:
        async def _mock_fetch(*a, **kw):  # noqa: ANN002
            return [], "http://mock"

        async def _mock_fetch_single(*a, **kw):  # noqa: ANN002
            return {}, "http://mock"

        async def _mock_news(*a, **kw):  # noqa: ANN002
            return [], 0, "http://mock"

        async def _mock_profile(*a, **kw):  # noqa: ANN002
            return {}, "http://mock"

        _v = "app.services.market_data.sources.vietcap"
        _k = "app.services.market_data.sources.kbs"
        _ai = "app.services.market_data.sources.vietcap_ai_news"
        patches = [
            patch(f"{_v}.fetch_ohlcv", _mock_fetch),
            patch(f"{_v}.fetch_price_board", _mock_fetch),
            patch(f"{_v}.fetch_intraday", _mock_fetch),
            patch(f"{_v}.fetch_price_depth", _mock_fetch),
            patch(f"{_v}.fetch_trading_history", _mock_fetch),
            patch(f"{_v}.fetch_trading_summary", _mock_fetch_single),
            patch(f"{_v}.fetch_foreign_trade", _mock_fetch),
            patch(f"{_v}.fetch_proprietary_history", _mock_fetch),
            patch(f"{_v}.fetch_proprietary_summary", _mock_fetch_single),
            patch(f"{_v}.fetch_insider_deals", _mock_fetch),
            patch(f"{_v}.fetch_company_details", _mock_fetch_single),
            patch(f"{_ai}.fetch_news_list", _mock_news),
            patch(f"{_k}.fetch_company_profile", _mock_profile),
            patch(f"{_k}.normalize_overview", lambda x: x),
        ]
        for p in patches:
            p.start()
        try:
            from app.services.ai.payloads import build_insight_payload
            payload = await build_insight_payload(symbol="VCB", language="vi")
        finally:
            for p in patches:
                p.stop()

        assert payload["symbol"] == "VCB"
        for key in [
            "ohlcv_30", "price_board", "intraday", "price_depth",
            "trading_history", "trading_summary", "foreign_trade",
            "proprietary", "proprietary_summary", "insider_deals",
            "company_overview", "company_details",
        ]:
            assert key in payload

    def test_derived_technical_indicators(self) -> None:
        from app.services.ai.payloads import _enrich_insight_derived

        ohlcv = [
            {"open": 80, "high": 82 + i, "low": 78 - (i % 3), "close": 80 + i * 0.5, "volume": 1000 + i * 100}
            for i in range(30)
        ]
        payload: dict = {"ohlcv_30": ohlcv, "supply_demand": None}
        _enrich_insight_derived(payload)

        derived = payload["derived"]
        assert "P0" in derived
        assert "V0" in derived
        assert "MA10" in derived
        assert "MA20" in derived
        assert "VolMA10" in derived
        assert "VolMA20" in derived

    def test_supply_demand_labels(self) -> None:
        from app.services.ai.payloads import _enrich_insight_derived

        ohlcv = [
            {"open": 80, "high": 85, "low": 75, "close": 82, "volume": 1000}
            for _ in range(30)
        ]
        sd = [{"total_buy_trade_volume": 500, "total_sell_trade_volume": 400} for _ in range(30)]
        payload: dict = {"ohlcv_30": ohlcv, "supply_demand": sd}
        _enrich_insight_derived(payload)

        labels = payload["derived"].get("supply_demand_labels")
        assert labels is not None
        assert labels["buy_level"] in ("cao", "bình thường", "thấp")

    def test_payload_to_json(self) -> None:
        from app.services.ai.payloads import payload_to_json

        payload = {"symbol": "VCB", "data": [1, 2, 3], "unicode": "Việt Nam"}
        result = payload_to_json(payload)
        parsed = json.loads(result)
        assert parsed["symbol"] == "VCB"
        assert "Việt Nam" in result  # ensure_ascii=False

    def test_raw_input_accepts_snake_case_company_statistics_fields(self) -> None:
        from app.services.ai.analysis_service import _build_raw_input

        payload = {
            "foreign_trade": [
                {
                    "trading_date": "2026-05-11",
                    "foreign_net_volume_matched": 123_000,
                    "foreign_net_volume_deal": -1_000,
                    "foreign_net_volume_total": 122_000,
                },
            ],
            "proprietary": [
                {
                    "trading_date": "2026-05-11",
                    "total_match_trade_net_volume": -40_000,
                    "total_deal_trade_net_volume": 5_000,
                    "total_trade_net_volume": -35_000,
                },
            ],
            "insider_deals": [
                {
                    "action_type_vi": "Đăng ký mua",
                    "share_register": 250_000,
                    "share_acquire": 100_000,
                    "display_date1": "2026-05-10",
                },
            ],
        }

        raw_input = _build_raw_input(payload)

        assert raw_input["moneyFlow"]["foreign"][0]["matchNetVolume"] == 123_000
        assert raw_input["moneyFlow"]["foreign"][0]["dealNetVolume"] == -1_000
        assert raw_input["moneyFlow"]["foreign"][0]["totalNetVolume"] == 122_000
        assert raw_input["moneyFlow"]["proprietary"][0]["matchNetVolume"] == -40_000
        assert raw_input["moneyFlow"]["proprietary"][0]["dealNetVolume"] == 5_000
        assert raw_input["moneyFlow"]["proprietary"][0]["totalNetVolume"] == -35_000
        assert raw_input["insider"]["transactions"][0]["shareRegistered"] == 250_000
        assert raw_input["insider"]["transactions"][0]["shareExecuted"] == 100_000


# ═══════════════════════════════════════════════════════
# 4. API Endpoint Tests
# ═══════════════════════════════════════════════════════


class TestAIEndpoints:
    _MOCK_RESULT = {
        "type": "dashboard",
        "input": {},
        "analysis": "Test analysis text",
        "model": "test-model",
        "as_of": "2026-04-26T10:00:00+00:00",
    }

    async def test_dashboard_analyze_success(self, client) -> None:  # noqa: ANN001
        with patch(
            "app.api.v1.endpoints.ai_analysis.analyze_dashboard",
            new_callable=AsyncMock,
            return_value=self._MOCK_RESULT,
        ):
            resp = await client.post(
                "/api/v1/ai/dashboard/analyze",
                json={"language": "vi", "include_payload": False},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "dashboard"
        assert data["analysis"] == "Test analysis text"
        assert "payload" not in data

    async def test_dashboard_analyze_with_payload(self, client) -> None:  # noqa: ANN001
        result = {**self._MOCK_RESULT, "payload": {"market_index": []}}
        with patch(
            "app.api.v1.endpoints.ai_analysis.analyze_dashboard",
            new_callable=AsyncMock,
            return_value=result,
        ):
            resp = await client.post(
                "/api/v1/ai/dashboard/analyze",
                json={"language": "vi", "include_payload": True},
            )

        assert resp.status_code == 200
        assert "payload" in resp.json()

    async def test_industry_analyze_success(self, client) -> None:  # noqa: ANN001
        result = {**self._MOCK_RESULT, "type": "industry", "input": {"icb_code": 8300}}
        with patch(
            "app.api.v1.endpoints.ai_analysis.analyze_industry",
            new_callable=AsyncMock,
            return_value=result,
        ):
            resp = await client.post(
                "/api/v1/ai/industry/analyze",
                json={"icb_code": 8300, "language": "vi"},
            )

        assert resp.status_code == 200
        assert resp.json()["type"] == "industry"

    async def test_industry_missing_icb_code(self, client) -> None:  # noqa: ANN001
        resp = await client.post(
            "/api/v1/ai/industry/analyze",
            json={"language": "vi"},
        )
        assert resp.status_code == 422

    async def test_insight_analyze_success(self, client) -> None:  # noqa: ANN001
        result = {**self._MOCK_RESULT, "type": "insight", "input": {"symbol": "VCB"}}
        with patch(
            "app.api.v1.endpoints.ai_analysis.analyze_insight",
            new_callable=AsyncMock,
            return_value=result,
        ):
            resp = await client.post(
                "/api/v1/ai/insight/analyze",
                json={"symbol": "VCB", "language": "vi"},
            )

        assert resp.status_code == 200
        assert resp.json()["type"] == "insight"

    async def test_insight_missing_symbol(self, client) -> None:  # noqa: ANN001
        resp = await client.post(
            "/api/v1/ai/insight/analyze",
            json={"language": "vi"},
        )
        assert resp.status_code == 422

    async def test_insight_invalid_symbol(self, client) -> None:  # noqa: ANN001
        resp = await client.post(
            "/api/v1/ai/insight/analyze",
            json={"symbol": "invalid symbol!", "language": "vi"},
        )
        assert resp.status_code == 422

    async def test_proxy_error_returns_502(self, client) -> None:  # noqa: ANN001
        from app.services.ai.proxy_client import AIProxyError

        with patch(
            "app.api.v1.endpoints.ai_analysis.analyze_dashboard",
            new_callable=AsyncMock,
            side_effect=AIProxyError("AI proxy timeout"),
        ):
            resp = await client.post(
                "/api/v1/ai/dashboard/analyze",
                json={"language": "vi"},
            )

        assert resp.status_code == 502
        assert "timeout" in resp.json()["detail"].lower()

    async def test_value_error_returns_422(self, client) -> None:  # noqa: ANN001
        with patch(
            "app.api.v1.endpoints.ai_analysis.analyze_dashboard",
            new_callable=AsyncMock,
            side_effect=ValueError("Config error"),
        ):
            resp = await client.post(
                "/api/v1/ai/dashboard/analyze",
                json={"language": "vi"},
            )

        assert resp.status_code == 422

    async def test_include_payload_false_no_payload(self, client) -> None:  # noqa: ANN001
        with patch(
            "app.api.v1.endpoints.ai_analysis.analyze_insight",
            new_callable=AsyncMock,
            return_value={**self._MOCK_RESULT, "type": "insight"},
        ):
            resp = await client.post(
                "/api/v1/ai/insight/analyze",
                json={"symbol": "FPT", "include_payload": False},
            )
        assert resp.status_code == 200
        assert "payload" not in resp.json()

    async def test_include_payload_true_has_payload(self, client) -> None:  # noqa: ANN001
        result_with = {**self._MOCK_RESULT, "type": "insight", "payload": {"key": "val"}}
        with patch(
            "app.api.v1.endpoints.ai_analysis.analyze_insight",
            new_callable=AsyncMock,
            return_value=result_with,
        ):
            resp = await client.post(
                "/api/v1/ai/insight/analyze",
                json={"symbol": "FPT", "include_payload": True},
            )
        assert resp.status_code == 200
        assert "payload" in resp.json()

    async def test_response_schema(self, client) -> None:  # noqa: ANN001
        with patch(
            "app.api.v1.endpoints.ai_analysis.analyze_dashboard",
            new_callable=AsyncMock,
            return_value=self._MOCK_RESULT,
        ):
            resp = await client.post(
                "/api/v1/ai/dashboard/analyze", json={},
            )
        data = resp.json()
        assert "type" in data
        assert "analysis" in data
        assert "model" in data
        assert "as_of" in data
