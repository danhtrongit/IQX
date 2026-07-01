"""End-to-end daily VN-Index analysis generator.

Pipeline: build payload → load memory (if db) → classify → build prompt → call
DeepSeek (via existing proxy_client) → parse JSON → validate (12 rules) → retry
→ persist (if db). Reuses the existing DeepSeek proxy (no Anthropic swap).
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from datetime import date
from typing import Any, Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.ai.proxy_client import chat_completion

from .classifier import classify_session
from .memory import build_memory_context, persist_analysis, verify_pending_claims
from .payload import build_analysis_payload
from .prompts import SYSTEM_PROMPT, build_user_prompt
from .validator import hard_errors, validate_output

logger = logging.getLogger(__name__)

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

SESSION_DISPLAY: dict[str, str] = {
    "narrow_rally": "Tăng phân hóa",
    "broad_rally": "Tăng lan tỏa",
    "broad_selloff": "Giảm sâu",
    "low_volatility": "Đi ngang",
    "derivatives_anomaly": "Đáo hạn phái sinh",
    "hidden_distribution": "Rút tiền ngầm",
}


@dataclass
class SessionConfig:
    """Configuration for a session analysis pipeline variant."""

    report_type: str
    payload_builder: Callable[[], Awaitable[dict]]
    prompt_builder: Callable[[dict, str], str]
    system_prompt: str
    validator: Callable[[dict, dict], list[str]]
    session_display: dict[str, str]
    use_memory: bool
    persist_claims: bool


def _parse_json(text: str) -> dict[str, Any]:
    cleaned = _FENCE.sub("", text).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        i, j = cleaned.find("{"), cleaned.rfind("}")
        if i != -1 and j != -1 and j > i:
            return json.loads(cleaned[i : j + 1])
        raise


async def run_session_analysis(
    config: SessionConfig,
    *,
    max_retries: int = 3,
    temperature: float = 0.3,
    payload: dict[str, Any] | None = None,
    db: AsyncSession | None = None,
) -> dict[str, Any]:
    """Generalized session analysis pipeline parameterized by ``config``.

    If ``db`` is provided: optionally load memory continuity into the payload
    (gated on ``config.use_memory``) and persist the article after a valid
    generation (passing ``config.report_type`` and ``config.persist_claims``).
    """
    t0 = time.monotonic()
    if payload is None:
        payload = await config.payload_builder()

    session_date = date.fromisoformat(payload["meta"]["generated_for_date"])
    memory_loaded = False

    # ── Memory continuity (spec §6) ──────────────────
    if config.use_memory and db is not None:
        try:
            mem = await build_memory_context(db, session_date)
            mem["verifiable_claims_from_recent_analyses"] = await verify_pending_claims(
                db, session_date, payload,
            )
            await db.commit()  # persist verified-claim status updates
            payload["memory_context"] = mem
            memory_loaded = bool(mem.get("last_analysis") or mem.get("verifiable_claims_from_recent_analyses"))
        except Exception as exc:  # noqa: BLE001
            logger.warning("memory load failed, continuing without: %s", exc)
            await db.rollback()

    session_type = classify_session(payload)
    payload["meta"]["session_type"] = session_type

    last_errors: list[str] = []
    output: dict[str, Any] | None = None
    model_used = ""
    attempt = 0

    for attempt in range(max_retries + 1):
        user_prompt = config.prompt_builder(payload, session_type)
        if attempt > 0:
            user_prompt += (
                "\n\n=== SỬA LỖI ===\nBài trước có lỗi sau, hãy sửa và sinh lại:\n"
                + "\n".join(f"- {e}" for e in last_errors)
            )
        text, model_used = await chat_completion(
            system_prompt=config.system_prompt, user_content=user_prompt, temperature=temperature,
        )
        try:
            output = _parse_json(text)
        except json.JSONDecodeError:
            last_errors = ["Output không phải JSON hợp lệ"]
            logger.warning("attempt %d: invalid JSON", attempt)
            continue

        output.setdefault("session_type", session_type)
        output.setdefault("session_date", payload["meta"]["generated_for_date"])
        output.setdefault("id", f"vnindex-{payload['meta']['generated_for_date']}")
        output.setdefault("session_type_display", config.session_display.get(session_type))
        output.setdefault("meta", {})
        if isinstance(output["meta"], dict):
            output["meta"].update({
                "model_used": model_used,
                "data_completeness": payload["meta"].get("data_completeness"),
                "memory_loaded": memory_loaded,
            })

        last_errors = config.validator(output, payload)
        if not last_errors:
            break
        logger.warning("attempt %d validation errors: %s", attempt, last_errors)

    valid = not last_errors and output is not None  # fully clean (no errors at all)
    # Publish when no BLOCKING errors remain — cosmetic rules (BUG15/16/17/18) must not
    # take the daily article offline. After exhausting retries we still ship the best
    # attempt if its only residual issues are cosmetic, logging them for observability.
    blocking = hard_errors(last_errors) if output is not None else list(last_errors)
    publishable = output is not None and not blocking

    # Attach charts block from payload so persist_analysis can store it in meta
    if output is not None:
        output["charts"] = payload.get("charts")
        if last_errors:
            meta = output.setdefault("meta", {})
            if isinstance(meta, dict):
                meta["validation_warnings"] = last_errors
            if publishable:
                logger.info(
                    "publishing best-effort with %d cosmetic warning(s): %s",
                    len(last_errors), last_errors,
                )

    persisted = False
    if db is not None and publishable:
        try:
            await persist_analysis(
                db, output, session_date, session_type,
                report_type=config.report_type,
                persist_claims=config.persist_claims,
            )
            persisted = True
        except Exception as exc:  # noqa: BLE001
            logger.error("persist_analysis failed: %s", exc)
            await db.rollback()

    return {
        "output": output,
        "payload": payload,
        "session_type": session_type,
        "session_date": session_date.isoformat(),
        "model": model_used,
        "attempts": attempt + 1,
        "errors": last_errors,
        "valid": valid,
        "memory_loaded": memory_loaded,
        "persisted": persisted,
        "generation_time_ms": int((time.monotonic() - t0) * 1000),
    }


DAILY_CONFIG = SessionConfig(
    report_type="daily",
    payload_builder=build_analysis_payload,
    prompt_builder=build_user_prompt,
    system_prompt=SYSTEM_PROMPT,
    validator=validate_output,
    session_display=SESSION_DISPLAY,
    use_memory=True,
    persist_claims=True,
)


async def generate_analysis(
    *, max_retries: int = 3, temperature: float = 0.3,
    payload: dict[str, Any] | None = None, db: AsyncSession | None = None,
) -> dict[str, Any]:
    """Generate one validated analysis article.

    If ``db`` is provided: load memory continuity into the payload before
    generation and persist the article + claims after a valid generation.

    Delegates to ``run_session_analysis(DAILY_CONFIG, ...)`` — behavior is
    byte-equivalent to the previous implementation.
    """
    return await run_session_analysis(
        DAILY_CONFIG,
        max_retries=max_retries,
        temperature=temperature,
        payload=payload,
        db=db,
    )


async def run_daily_analysis(session: AsyncSession | None = None) -> dict[str, Any]:
    """Scheduler/CLI entrypoint. Opens its own DB session when not provided.

    Returns a compact summary dict for logging / manual-trigger responses.
    """
    async def _run(db: AsyncSession) -> dict[str, Any]:
        res = await generate_analysis(db=db)
        return {
            "session_date": res["session_date"],
            "session_type": res["session_type"],
            "valid": res["valid"],
            "persisted": res["persisted"],
            "memory_loaded": res["memory_loaded"],
            "attempts": res["attempts"],
            "errors": res["errors"],
            "model": res["model"],
            "generation_time_ms": res["generation_time_ms"],
        }

    if session is None:
        from app.core.database import get_session_factory
        factory = get_session_factory()
        async with factory() as db:
            return await _run(db)
    return await _run(session)
