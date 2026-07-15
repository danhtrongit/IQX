"""AI narrative layer for the BCTC storytelling dashboard (Task B4).

Pipeline: compute dashboard numbers (B1-B3) → build compact JSON user-content →
call the AI proxy → parse JSON → validate against the template schema + guards →
retry with error feedback (max ~4 attempts) → return the best output.

The AI writes ONLY prose (verdict / story / per-block answers) from numbers the
compute layer already produced — it never computes or invents a number. Mirrors
the proven retry loop in ``app.services.ai.market_analysis.generator``.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.ai.proxy_client import AIProxyError, chat_completion
from app.services.bctc_dashboard.compute import compute_dashboard
from app.services.bctc_dashboard.narrative_prompt import (
    SYSTEM_PROMPT,
    build_user_content,
)
from app.services.bctc_dashboard.narrative_validator import validate_narrative

logger = logging.getLogger(__name__)

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _parse_json(text: str) -> dict[str, Any]:
    """Parse JSON from a model response, tolerating fences / surrounding prose."""
    cleaned = _FENCE.sub("", text or "").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        i, j = cleaned.find("{"), cleaned.rfind("}")
        if i != -1 and j != -1 and j > i:
            return json.loads(cleaned[i : j + 1])
        raise


async def generate_narrative(
    symbol: str,
    *,
    term_type: int = 1,
    language: str = "vi",
    data: dict[str, Any] | None = None,
    db: AsyncSession | None = None,
    max_retries: int = 3,
    temperature: float = 0.2,
) -> dict[str, Any]:
    """Generate the validated storytelling narrative for ``symbol``.

    Returns the narrative dict ``{verdict_oneliner, story{...}, blocks{...}}``
    (keys per Template A/B). When ``data`` is provided it is used verbatim (no
    network); otherwise the dashboard is computed via ``compute_dashboard`` —
    passing ``db`` enables the peer-benchmark colour layer used for tone.

    Retries up to ``max_retries`` extra times, feeding validation errors back to
    the model. After exhausting retries the best (last-parsed) output is returned
    even if minor issues remain; a residual-warning log records them. Raises
    :class:`AIProxyError` only when no valid JSON could be parsed at all.
    """
    sym = symbol.upper()
    if data is None:
        data = await compute_dashboard(sym, term_type=term_type, db=db)

    template = data.get("template") or "A"
    user_content = build_user_content(data)

    last_errors: list[str] = []
    output: dict[str, Any] | None = None
    attempt = 0

    for attempt in range(max_retries + 1):
        content = user_content
        if attempt > 0 and last_errors:
            content += (
                "\n\n=== SỬA LỖI ===\nBản trước có các lỗi sau, hãy sửa và sinh lại "
                "JSON đúng schema:\n" + "\n".join(f"- {er}" for er in last_errors)
            )

        text, _model = await chat_completion(
            system_prompt=SYSTEM_PROMPT,
            user_content=content,
            temperature=temperature,
        )

        try:
            parsed = _parse_json(text)
        except json.JSONDecodeError:
            last_errors = ["Output không phải JSON hợp lệ"]
            logger.warning("narrative %s attempt %d: invalid JSON", sym, attempt)
            continue

        output = parsed
        last_errors = validate_narrative(parsed, template)
        if not last_errors:
            break
        logger.warning(
            "narrative %s attempt %d validation errors: %s", sym, attempt, last_errors
        )

    if output is None:
        raise AIProxyError(
            f"AI không trả về JSON hợp lệ cho narrative BCTC sau {attempt + 1} lần thử"
        )
    if last_errors:
        logger.warning(
            "narrative %s: trả về best-effort với %d lỗi còn lại: %s",
            sym,
            len(last_errors),
            last_errors,
        )

    return output
