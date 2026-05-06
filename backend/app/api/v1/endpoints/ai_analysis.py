"""AI analysis API endpoints.

Provides POST endpoints for AI-powered market analysis:
- POST /api/v1/ai/dashboard/analyze
- POST /api/v1/ai/industry/analyze
- POST /api/v1/ai/industry/analyze-batch  (NEW: batch multiple sectors)
- POST /api/v1/ai/insight/analyze
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.ai.analysis_service import analyze_dashboard, analyze_industry, analyze_insight
from app.services.ai.proxy_client import AIProxyError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI Phân tích"])


# ── Request schemas ──────────────────────────────────


class DashboardAnalyzeRequest(BaseModel):
    """Request body for dashboard AI analysis."""

    language: str = Field("vi", description="Ngôn ngữ đầu ra: vi hoặc en")
    include_payload: bool = Field(
        False,
        description="Bao gồm dữ liệu payload thô trong response (mặc định: false)",
    )


class IndustryAnalyzeRequest(BaseModel):
    """Request body for industry AI analysis."""

    icb_code: int = Field(..., ge=1, description="Mã ngành ICB (ví dụ: 8300, 9500)")
    language: str = Field("vi", description="Ngôn ngữ đầu ra: vi hoặc en")
    include_payload: bool = Field(
        False,
        description="Bao gồm dữ liệu payload thô trong response (mặc định: false)",
    )


class IndustryBatchAnalyzeRequest(BaseModel):
    """Request body for batch industry AI analysis."""

    icb_codes: list[int] = Field(
        ...,
        min_length=1,
        max_length=20,
        description="Danh sách mã ngành ICB (tối đa 20, ví dụ: [8300, 9500])",
    )
    language: str = Field("vi", description="Ngôn ngữ đầu ra: vi hoặc en")
    include_payload: bool = Field(
        False,
        description="Bao gồm dữ liệu payload thô trong response (mặc định: false)",
    )


class InsightAnalyzeRequest(BaseModel):
    """Request body for stock insight AI analysis."""

    symbol: str = Field(
        ...,
        min_length=1,
        max_length=10,
        pattern=r"^[A-Za-z0-9]+$",
        description="Mã cổ phiếu (ví dụ: VCB, FPT)",
    )
    language: str = Field("vi", description="Ngôn ngữ đầu ra: vi hoặc en")
    include_payload: bool = Field(
        False,
        description="Bao gồm dữ liệu payload thô trong response (mặc định: false)",
    )


# ── Endpoints ────────────────────────────────────────


@router.post("/dashboard/analyze")
async def post_dashboard_analyze(body: DashboardAnalyzeRequest) -> dict[str, Any]:
    """Phân tích AI tổng quan thị trường.

    Trả về đoạn phân tích ngắn gọn về trạng thái thị trường,
    dòng tiền, và nhóm ngành nổi bật.
    """
    try:
        return await analyze_dashboard(
            language=body.language,
            include_payload=body.include_payload,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AIProxyError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/industry/analyze")
async def post_industry_analyze(body: IndustryAnalyzeRequest) -> dict[str, Any]:
    """Phân tích AI cho một ngành ICB cụ thể.

    Trả về 8 dòng phân tích: trạng thái, hiệu suất, dòng tiền,
    độ rộng, dẫn dắt, điểm yếu, cơ hội, rủi ro.
    """
    try:
        return await analyze_industry(
            icb_code=body.icb_code,
            language=body.language,
            include_payload=body.include_payload,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AIProxyError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/industry/analyze-batch")
async def post_industry_analyze_batch(body: IndustryBatchAnalyzeRequest) -> dict[str, Any]:
    """Phân tích AI cho nhiều ngành ICB trong một request.

    Trả về kết quả phân tích cho từng ngành. Nếu một ngành lỗi,
    các ngành còn lại vẫn được trả về bình thường.

    Body: ``{"icb_codes": [8300, 9500], "language": "vi", "include_payload": false}``

    Response::

        {
            "results": [
                {"icb_code": 8300, "analysis": "...", "model": "...", "as_of": "..."},
                {"icb_code": 9500, "error": "AI proxy timeout"}
            ]
        }
    """
    import asyncio

    from app.services.ai.analysis_service import (
        _analysis_cache_key,
        _cache_get_analysis,
        _cache_set_analysis,
    )
    from app.services.ai.payloads import build_industry_payload_batch, payload_to_json
    from app.services.ai.prompt_loader import load_prompt
    from app.services.ai.proxy_client import chat_completion

    try:
        # Deduplicate codes while preserving order
        seen: set[int] = set()
        unique_codes: list[int] = []
        for code in body.icb_codes:
            if code not in seen:
                seen.add(code)
                unique_codes.append(code)

        # ── Check cache for each code ────────────────
        cached_results: dict[int, dict[str, Any]] = {}
        uncached_codes: list[int] = []
        for code in unique_codes:
            cache_key = _analysis_cache_key("industry", str(code), body.language)
            cached = await _cache_get_analysis(cache_key)
            if cached and "analysis" in cached:
                cached["icb_code"] = code  # ensure icb_code is present
                cached_results[code] = cached
                logger.debug("Batch cache HIT for icb=%s", code)
            else:
                uncached_codes.append(code)

        # ── Run AI only for uncached codes ───────────
        if uncached_codes:
            payloads = await build_industry_payload_batch(
                icb_codes=uncached_codes,
                language=body.language,
            )
            prompt = load_prompt("industry")

            async def _analyze_one(icb_code: int) -> dict[str, Any]:
                payload = payloads.get(icb_code, {})
                pjson = payload_to_json(payload)
                try:
                    analysis_text, model_used = await chat_completion(
                        system_prompt=prompt,
                        user_content=pjson,
                    )
                    from datetime import UTC, datetime
                    result: dict[str, Any] = {
                        "icb_code": icb_code,
                        "type": "industry",
                        "input": {"icb_code": icb_code, "language": body.language},
                        "analysis": analysis_text,
                        "model": model_used,
                        "as_of": datetime.now(UTC).isoformat(),
                    }
                    # Cache the result for future single/batch requests
                    cache_key = _analysis_cache_key("industry", str(icb_code), body.language)
                    await _cache_set_analysis(cache_key, result, analysis_type="industry")
                    if body.include_payload:
                        result["payload"] = payload
                    return result
                except Exception as exc:
                    logger.warning("Batch industry analyze failed for icb=%s: %s", icb_code, exc)
                    return {
                        "icb_code": icb_code,
                        "error": str(exc),
                    }

            tasks = [_analyze_one(code) for code in uncached_codes]
            ai_results = await asyncio.gather(*tasks, return_exceptions=True)
            for i, result in enumerate(ai_results):
                code = uncached_codes[i]
                if isinstance(result, BaseException):
                    cached_results[code] = {"icb_code": code, "error": str(result)}
                else:
                    cached_results[code] = result

        # ── Assemble output in original order ────────
        output: list[dict[str, Any]] = []
        for code in unique_codes:
            output.append(cached_results.get(code, {"icb_code": code, "error": "unknown"}))

        return {"results": output}

    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/insight/analyze")
async def post_insight_analyze(body: InsightAnalyzeRequest) -> dict[str, Any]:
    """Phân tích AI chuyên sâu cho một mã cổ phiếu (POST).

    Trả về phân tích 6 lớp: xu hướng, cung-cầu, dòng tiền lớn,
    nội bộ, tin tức, và tổng hợp hành động.
    """
    try:
        return await analyze_insight(
            symbol=body.symbol.upper(),
            language=body.language,
            include_payload=body.include_payload,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AIProxyError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/insight/{symbol}")
async def get_insight_analyze(
    symbol: str,
    language: str = "vi",
) -> dict[str, Any]:
    """Phân tích AI chuyên sâu cho một mã cổ phiếu (GET).

    Trả về ``{data: InsightResponse}`` cho frontend.
    """
    try:
        result = await analyze_insight(
            symbol=symbol.upper(),
            language=language,
        )
        return {"data": result}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AIProxyError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

