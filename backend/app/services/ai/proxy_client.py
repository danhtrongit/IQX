"""OpenAI-compatible proxy client for AI analysis.

Sends chat completion requests to an OpenAI-compatible API proxy.
API key is read from settings (environment variable), never hardcoded or logged.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class AIProxyError(Exception):
    """Raised when the AI proxy returns an error or is unreachable."""


async def chat_completion(
    *,
    system_prompt: str,
    user_content: str,
    temperature: float = 0.2,
) -> tuple[str, str]:
    """Send a chat completion request to the AI proxy.

    Args:
        system_prompt: The system message (prompt markdown).
        user_content: The user message (JSON payload).
        temperature: Sampling temperature.

    Returns:
        A tuple of (response_text, model_used).

    Raises:
        AIProxyError: On any HTTP/network/parsing error.
        ValueError: If AI proxy is not configured.
    """
    settings = get_settings()

    base_url = settings.AI_PROXY_BASE_URL
    model = settings.AI_PROXY_MODEL
    api_key = settings.AI_PROXY_API_KEY

    if not base_url:
        raise ValueError(
            "AI proxy chưa được cấu hình. Hãy đặt AI_PROXY_BASE_URL trong biến môi trường."
        )
    if not api_key:
        raise ValueError(
            "AI proxy API key chưa được cấu hình. Hãy đặt AI_PROXY_API_KEY trong biến môi trường."
        )

    url = f"{base_url.rstrip('/')}/chat/completions"
    timeout = settings.AI_PROXY_TIMEOUT_SECONDS

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    body: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": temperature,
    }

    logger.info(
        "AI proxy request: model=%s, url=%s, system_len=%d, user_len=%d",
        model,
        url,
        len(system_prompt),
        len(user_content),
    )

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, headers=headers, json=body)
            resp.raise_for_status()
    except httpx.TimeoutException as exc:
        raise AIProxyError(
            f"AI proxy timeout sau {timeout}s: {type(exc).__name__}"
        ) from exc
    except httpx.ConnectError as exc:
        raise AIProxyError(
            f"Không thể kết nối đến AI proxy: {type(exc).__name__}"
        ) from exc
    except httpx.HTTPStatusError as exc:
        # Do NOT log response body — it might echo the key in error messages
        raise AIProxyError(
            f"AI proxy trả về HTTP {exc.response.status_code}"
        ) from exc
    except httpx.HTTPError as exc:
        raise AIProxyError(
            f"Lỗi HTTP khi gọi AI proxy: {type(exc).__name__}"
        ) from exc

    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        used_model = data.get("model", model)
    except (KeyError, IndexError, TypeError) as exc:
        raise AIProxyError(
            "AI proxy trả về response không đúng format (thiếu choices[0].message.content)"
        ) from exc

    logger.info("AI proxy response OK: model=%s, response_len=%d", used_model, len(content))
    return content, used_model
