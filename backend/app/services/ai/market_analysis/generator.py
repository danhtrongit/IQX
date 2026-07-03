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
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.ai.proxy_client import chat_completion

from .classifier import classify_session
from .memory import build_memory_context, persist_analysis, verify_pending_claims
from .midday_payload import build_midday_payload
from .midday_prompts import MIDDAY_SYSTEM_PROMPT, build_midday_user_prompt
from .midday_validator import validate_midday
from .payload import build_analysis_payload
from .premarket_payload import build_premarket_payload
from .premarket_prompts import PREMARKET_SYSTEM_PROMPT, build_premarket_user_prompt
from .premarket_validator import validate_premarket
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
    # Optional post-validate hook applied to output right before persist_analysis.
    # Signature: (output: dict, payload: dict) -> dict
    # daily and midday leave this None — their behaviour is byte-identical.
    postprocess: Callable[[dict, dict], dict] | None = field(default=None)


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
        # public_id fallback must be report-type-aware: analysis_history.public_id is
        # UNIQUE, so a non-daily run falling back to the daily "vnindex-{date}" id would
        # squat on it and make the daily INSERT for the same date fail (IntegrityError).
        # daily keeps "vnindex-{date}" — the LIVE public contract — unchanged.
        _id_prefix = "vnindex" if config.report_type == "daily" else config.report_type
        output.setdefault("id", f"{_id_prefix}-{payload['meta']['generated_for_date']}")
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

    # Attach charts + pulse blocks from payload so persist_analysis can store
    # them in meta. pulse is deterministic AM payload data (not LLM output);
    # only the midday payload carries it — daily payloads have no "pulse" key,
    # so this resolves to None and daily rows stay pulse-free.
    if output is not None:
        output["charts"] = payload.get("charts")
        output["pulse"] = payload.get("pulse")
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
            # Apply optional post-validate hook (e.g. premarket id→object resolver).
            # daily/midday have postprocess=None — no change to their behaviour.
            if config.postprocess is not None and output is not None:
                output = config.postprocess(output, payload)
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


def _midday_payload_stub() -> None:
    """Stub payload_builder for MIDDAY_CONFIG.

    MIDDAY_CONFIG should never be called via its payload_builder because
    ``run_midday_analysis`` builds the payload itself (``build_midday_payload``
    requires a ``db`` session) and passes it via the ``payload=`` kwarg to
    ``run_session_analysis``.  This stub exists only to satisfy the dataclass
    field; calling it directly is a programming error.
    """
    raise RuntimeError(
        "MIDDAY_CONFIG.payload_builder must not be called directly — "
        "pass payload= to run_session_analysis instead."
    )


MIDDAY_CONFIG = SessionConfig(
    report_type="midday",
    payload_builder=_midday_payload_stub,
    prompt_builder=build_midday_user_prompt,
    system_prompt=MIDDAY_SYSTEM_PROMPT,
    validator=validate_midday,
    session_display=SESSION_DISPLAY,
    use_memory=False,
    persist_claims=False,
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


async def run_midday_analysis(session: AsyncSession | None = None) -> dict[str, Any]:
    """Scheduler/CLI entrypoint for the mid-day AM session brief.

    Opens its own DB session when not provided (mirrors ``run_daily_analysis``).
    Builds the payload here (because ``build_midday_payload`` needs a ``db``
    session) and passes it via ``payload=`` — never calls
    ``MIDDAY_CONFIG.payload_builder``.

    Returns a compact summary dict for logging / manual-trigger responses.
    """
    async def _run(db: AsyncSession) -> dict[str, Any]:
        payload = await build_midday_payload(db)
        res = await run_session_analysis(MIDDAY_CONFIG, payload=payload, db=db)
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


# ── Pre-market analysis ───────────────────────────────────────────────────────


def _resolve_premarket_output(output: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Post-validate resolver for the premarket pipeline.

    Transforms the raw LLM output before persist:

    1. hot_news[].id → full news_pool object merged with {insight, rank_order}
    2. events_filtered[].id → full events_pool object merged with {note, impact}
    3. plain-string tagline → {"text": <string>}
    4. attach output["world_overview"] = payload["global_markets"]
    5. set output["paragraphs"] = {"world_paragraph": <world_paragraph>}
    6. set output["watchlist"] = output["watch_today"]

    Unknown ids do NOT crash — a warning is logged and the item is skipped.
    The validator already guarantees id membership; this guard is defensive only.
    """
    # Build lookup maps
    news_by_id: dict[str, dict] = {item["id"]: item for item in (payload.get("news_pool") or []) if item.get("id")}
    events_by_id: dict[str, dict] = {item["id"]: item for item in (payload.get("events_pool") or []) if item.get("id")}

    # 1. Resolve hot_news
    resolved_hot_news: list[dict] = []
    for item in (output.get("hot_news") or []):
        nid = item.get("id")
        pool_obj = news_by_id.get(nid)
        if pool_obj is None:
            logger.warning("premarket resolver: hot_news id %r not found in news_pool — skipping", nid)
            continue
        resolved_hot_news.append({
            **pool_obj,
            "insight": item.get("insight"),
            "rank_order": item.get("rank_order"),
        })

    # 2. Resolve events_filtered
    resolved_events: list[dict] = []
    for item in (output.get("events_filtered") or []):
        eid = item.get("id")
        pool_obj = events_by_id.get(eid)
        if pool_obj is None:
            logger.warning("premarket resolver: events_filtered id %r not found in events_pool — skipping", eid)
            continue
        resolved_events.append({
            **pool_obj,
            "note": item.get("note"),
            "impact": item.get("impact"),
        })

    # 3. Normalize tagline: plain string → {"text": <string>}
    raw_tagline = output.get("tagline")
    if isinstance(raw_tagline, str):
        output["tagline"] = {"text": raw_tagline}

    # 4. Attach world_overview from payload
    output["world_overview"] = payload.get("global_markets")

    # 5. Map world_paragraph into paragraphs field
    output["paragraphs"] = {"world_paragraph": output.get("world_paragraph")}

    # 6. Map watch_today → watchlist
    output["watchlist"] = output.get("watch_today")

    # 7. Store resolved collections in meta (will be merged into meta by persist_analysis)
    meta = output.setdefault("meta", {})
    if isinstance(meta, dict):
        meta["hot_news"] = resolved_hot_news
        meta["events_filtered"] = resolved_events
        meta["world_overview"] = output["world_overview"]

    return output


def _premarket_payload_stub() -> None:
    """Stub payload_builder for PREMARKET_CONFIG.

    PREMARKET_CONFIG should never be called via its payload_builder because
    ``run_premarket_analysis`` builds the payload itself (``build_premarket_payload``
    requires a ``db`` session) and passes it via the ``payload=`` kwarg to
    ``run_session_analysis``.  This stub exists only to satisfy the dataclass
    field; calling it directly is a programming error.
    """
    raise RuntimeError(
        "PREMARKET_CONFIG.payload_builder must not be called directly — "
        "pass payload= to run_session_analysis instead."
    )


PREMARKET_CONFIG = SessionConfig(
    report_type="premarket",
    payload_builder=_premarket_payload_stub,
    prompt_builder=build_premarket_user_prompt,
    system_prompt=PREMARKET_SYSTEM_PROMPT,
    validator=validate_premarket,
    session_display=SESSION_DISPLAY,
    use_memory=False,
    persist_claims=False,
    postprocess=_resolve_premarket_output,
)


async def run_premarket_analysis(session: AsyncSession | None = None) -> dict[str, Any]:
    """Scheduler/CLI entrypoint for the pre-market brief.

    Opens its own DB session when not provided (mirrors ``run_midday_analysis``).
    Builds the payload here (because ``build_premarket_payload`` needs a ``db``
    session) and passes it via ``payload=`` — never calls
    ``PREMARKET_CONFIG.payload_builder``.

    Returns a compact summary dict for logging / manual-trigger responses.
    """
    async def _run(db: AsyncSession) -> dict[str, Any]:
        payload = await build_premarket_payload(db)
        res = await run_session_analysis(PREMARKET_CONFIG, payload=payload, db=db, temperature=0.5)
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
