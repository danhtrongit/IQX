"""End-to-end daily VN-Index analysis generator.

Pipeline: build payload → classify session → build prompt → call DeepSeek
(via existing proxy_client) → parse JSON → validate (12 rules) → retry.
v1 trial: no DB persistence, no memory load (first run).
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

from app.services.ai.proxy_client import chat_completion

from .classifier import classify_session
from .payload import build_analysis_payload
from .prompts import SYSTEM_PROMPT, build_user_prompt
from .validator import validate_output

logger = logging.getLogger(__name__)

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _parse_json(text: str) -> dict[str, Any]:
    cleaned = _FENCE.sub("", text).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # fallback: grab the outermost {...}
        i, j = cleaned.find("{"), cleaned.rfind("}")
        if i != -1 and j != -1 and j > i:
            return json.loads(cleaned[i : j + 1])
        raise


async def generate_analysis(
    *, max_retries: int = 3, temperature: float = 0.3,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Generate one validated analysis article.

    Returns: {"output", "payload", "session_type", "model", "attempts",
              "errors", "valid", "generation_time_ms"}.
    """
    t0 = time.monotonic()
    if payload is None:
        payload = await build_analysis_payload()

    session_type = classify_session(payload)
    payload["meta"]["session_type"] = session_type

    system_prompt = SYSTEM_PROMPT
    last_errors: list[str] = []
    output: dict[str, Any] | None = None
    model_used = ""

    for attempt in range(max_retries + 1):
        user_prompt = build_user_prompt(payload, session_type)
        if attempt > 0:
            user_prompt += (
                f"\n\n=== SỬA LỖI ===\nBài trước có lỗi sau, hãy sửa và sinh lại:\n"
                + "\n".join(f"- {e}" for e in last_errors)
            )
        text, model_used = await chat_completion(
            system_prompt=system_prompt, user_content=user_prompt,
            temperature=temperature,
        )
        try:
            output = _parse_json(text)
        except json.JSONDecodeError:
            last_errors = ["Output không phải JSON hợp lệ"]
            logger.warning("attempt %d: invalid JSON", attempt)
            continue

        # normalise required meta keys
        output.setdefault("session_type", session_type)
        output.setdefault("session_date", payload["meta"]["generated_for_date"])
        output.setdefault("id", f"vnindex-{payload['meta']['generated_for_date']}")

        last_errors = validate_output(output, payload)
        if not last_errors:
            break
        logger.warning("attempt %d validation errors: %s", attempt, last_errors)

    elapsed_ms = int((time.monotonic() - t0) * 1000)
    return {
        "output": output,
        "payload": payload,
        "session_type": session_type,
        "model": model_used,
        "attempts": attempt + 1,
        "errors": last_errors,
        "valid": not last_errors,
        "generation_time_ms": elapsed_ms,
    }
