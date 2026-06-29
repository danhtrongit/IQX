"""Full report pipeline: analysis → DeepSeek narrative → validate → retry → persist."""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.portfolio_report import PortfolioReport
from app.repositories.portfolio_manager import PortfolioReportRepository
from app.services.ai.proxy_client import chat_completion

from .analysis import NO_ACCOUNT_REASON, _resolve_account_id, build_analysis
from .config import LLM_TEMPERATURE
from .prompts import SYSTEM_PROMPT, build_user_prompt
from .validator import validate_narrative

logger = logging.getLogger(__name__)

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)
ICT = timezone(timedelta(hours=7))  # Vietnam trading-day boundary

# NOTE (v1): the day-cache is keyed on the ICT calendar date. Folding weekend/holiday
# onto the most recent trading session (via app.services.ai.market_analysis.market_calendar)
# is a documented refinement — see design §5 / open risks.


def _parse_json(text: str) -> dict[str, Any]:
    cleaned = _FENCE.sub("", text).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        i, j = cleaned.find("{"), cleaned.rfind("}")
        if i != -1 and j != -1 and j > i:
            return json.loads(cleaned[i : j + 1])
        raise


def _snapshot_from_analysis(analysis: dict) -> dict:
    return {p["ticker"]: p["weight"] for p in analysis.get("overview", {}).get("positions", [])}


def _recommended_actions(narrative: dict) -> list[dict]:
    return [{"id": f"action_{i}", "text": a.get("title", ""), "status": "open"}
            for i, a in enumerate(narrative.get("actions", []))]


def _insufficient(reason: str, t0: float) -> dict:
    return {"analysis": {"insufficient_data": True, "reason": reason}, "narrative": None,
            "meta": {"valid": False, "cached": False, "insufficient": True, "attempts": 0,
                     "errors": [], "model": "", "persisted": False,
                     "generation_time_ms": int((time.monotonic() - t0) * 1000)}}


async def generate_report(db: AsyncSession, user_id, *, max_retries: int = 3) -> dict:
    t0 = time.monotonic()
    try:
        account_id = await _resolve_account_id(db, user_id)  # raises NotFoundError if no account
    except NotFoundError:
        return _insufficient(NO_ACCOUNT_REASON, t0)
    # Normalise to uuid.UUID — real resolver returns UUID; tests mock with str
    if not isinstance(account_id, uuid.UUID):
        account_id = uuid.UUID(str(account_id))
    repo = PortfolioReportRepository(db)
    today = datetime.now(ICT).date()

    cached = await repo.get_for_date(account_id, today)
    if cached is not None:
        return {"analysis": cached.analysis_json, "narrative": cached.narrative_json,
                "meta": {"valid": cached.valid, "cached": True, "model": cached.model_used,
                         "attempts": 0, "errors": [], "persisted": True,
                         "generation_time_ms": 0}}

    analysis = await build_analysis(db, user_id)
    if analysis.get("insufficient_data"):
        return {"analysis": analysis, "narrative": None,
                "meta": {"valid": False, "cached": False, "insufficient": True,
                         "attempts": 0, "errors": [], "model": "", "persisted": False,
                         "generation_time_ms": int((time.monotonic() - t0) * 1000)}}

    last_errors: list[str] = []
    narrative: dict | None = None
    model_used = ""
    attempt = 0
    for attempt in range(1, max_retries + 1):
        user_prompt = build_user_prompt(analysis)
        if last_errors:
            user_prompt += "\n\n=== SỬA LỖI ===\nBài trước có lỗi sau, hãy sửa và sinh lại:\n" + \
                "\n".join(f"- {e}" for e in last_errors)
        text, model_used = await chat_completion(
            system_prompt=SYSTEM_PROMPT, user_content=user_prompt, temperature=LLM_TEMPERATURE)
        try:
            narrative = _parse_json(text)
        except json.JSONDecodeError:
            last_errors = ["STRUCT: output không phải JSON hợp lệ"]
            continue
        last_errors = validate_narrative(narrative, analysis)
        if not last_errors:
            break

    valid = not last_errors and narrative is not None
    period_number = analysis["meta"]["period_number"]
    report = PortfolioReport(
        account_id=account_id, session_date=today, period_number=period_number,
        mode=analysis["meta"]["mode"], analysis_json=analysis, narrative_json=narrative,
        scores=analysis.get("scores"), recommended_actions=_recommended_actions(narrative or {}),
        watch_conditions=[], holdings_snapshot=_snapshot_from_analysis(analysis),
        model_used=model_used, generation_time_ms=int((time.monotonic() - t0) * 1000), valid=valid,
    )
    await repo.insert(report)

    return {"analysis": analysis, "narrative": narrative,
            "meta": {"valid": valid, "cached": False, "attempts": attempt,
                     "errors": last_errors, "model": model_used, "persisted": True,
                     "generation_time_ms": report.generation_time_ms}}
