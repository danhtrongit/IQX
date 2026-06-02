"""SePay IPN log service — records every IPN callback for audit/debug."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ipn_log import SePayIPNLog

_REDACTED = "***"
_SENSITIVE_HEADERS = {"x-secret-key", "authorization", "cookie", "set-cookie"}


def _redact_headers(headers: dict[str, str]) -> dict[str, str]:
    return {
        k: (_REDACTED if k.lower() in _SENSITIVE_HEADERS else v)
        for k, v in headers.items()
    }


class IPNLogService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def record(
        self,
        *,
        raw_body: dict[str, Any] | None,
        raw_headers: dict[str, str],
        secret_key_valid: bool,
        result_status: str | None,
        matched_order_id: uuid.UUID | None = None,
        sepay_transaction_id: str | None = None,
        error_message: str | None = None,
    ) -> SePayIPNLog:
        row = SePayIPNLog(
            raw_body=raw_body,
            raw_headers=_redact_headers(raw_headers),
            secret_key_valid=secret_key_valid,
            result_status=result_status,
            matched_order_id=matched_order_id,
            sepay_transaction_id=sepay_transaction_id,
            error_message=error_message,
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return row
