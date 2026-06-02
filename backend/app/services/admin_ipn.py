"""Admin IPN log service — list, get, retry."""

from __future__ import annotations

import math
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps_audit import AuditContext
from app.core.exceptions import BadRequestError, NotFoundError
from app.models.ipn_log import SePayIPNLog
from app.schemas.admin_ipn import IPNRetryResponse, SePayIPNLogResponse
from app.schemas.common import PaginatedResponse
from app.services.admin_audit import AdminAuditService


class AdminIPNService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── list ─────────────────────────────────────────────────────────────────

    async def list(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        secret_key_valid: bool | None = None,
        result_status: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        search: str | None = None,
    ) -> PaginatedResponse[SePayIPNLogResponse]:
        conditions: list[Any] = []

        if secret_key_valid is not None:
            conditions.append(SePayIPNLog.secret_key_valid.is_(secret_key_valid))
        if result_status:
            conditions.append(SePayIPNLog.result_status == result_status)
        if date_from:
            conditions.append(SePayIPNLog.received_at >= date_from)
        if date_to:
            conditions.append(SePayIPNLog.received_at < date_to)
        if search:
            conditions.append(
                or_(
                    SePayIPNLog.sepay_transaction_id.ilike(f"%{search}%"),
                    SePayIPNLog.result_status.ilike(f"%{search}%"),
                )
            )

        where = and_(*conditions) if conditions else None

        base = select(SePayIPNLog)
        if where is not None:
            base = base.where(where)

        count_stmt = select(func.count()).select_from(base.subquery())
        total: int = (await self._session.execute(count_stmt)).scalar_one()

        items_stmt = (
            base.order_by(SePayIPNLog.received_at.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        rows = list((await self._session.execute(items_stmt)).scalars())

        items = [
            SePayIPNLogResponse(
                id=r.id,
                received_at=r.received_at,
                secret_key_valid=r.secret_key_valid,
                result_status=r.result_status,
                matched_order_id=r.matched_order_id,
                sepay_transaction_id=r.sepay_transaction_id,
                error_message=r.error_message,
                # raw_body and raw_headers NOT included in list — only in detail
            )
            for r in rows
        ]

        total_pages = math.ceil(total / page_size) if total > 0 else 0
        return PaginatedResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    # ── get ───────────────────────────────────────────────────────────────────

    async def get(self, log_id: uuid.UUID) -> SePayIPNLogResponse:
        log = await self._get_or_404(log_id)
        return SePayIPNLogResponse(
            id=log.id,
            received_at=log.received_at,
            secret_key_valid=log.secret_key_valid,
            result_status=log.result_status,
            matched_order_id=log.matched_order_id,
            sepay_transaction_id=log.sepay_transaction_id,
            error_message=log.error_message,
            raw_body=log.raw_body,
            raw_headers=log.raw_headers,
        )

    # ── retry ─────────────────────────────────────────────────────────────────

    async def retry(
        self, log_id: uuid.UUID, ctx: AuditContext
    ) -> IPNRetryResponse:
        log = await self._get_or_404(log_id)

        if not log.secret_key_valid:
            raise BadRequestError("Không thể retry: secret key không hợp lệ")

        if log.result_status == "processed":
            raise BadRequestError("IPN log này đã được xử lý thành công")

        if not log.raw_body:
            raise BadRequestError("Không có raw_body để retry")

        # Rebuild IPN payload and re-process
        from app.schemas.premium import IPNPayload

        try:
            payload = IPNPayload.model_validate(log.raw_body)
        except Exception as exc:
            raise BadRequestError(f"Không thể parse raw_body: {exc}") from exc

        from app.services.premium import PremiumService

        result = await PremiumService(self._session).process_ipn(payload)

        # Create a new log row for the retry (preserve history)
        new_log = SePayIPNLog(
            secret_key_valid=True,
            raw_body=log.raw_body,
            raw_headers=log.raw_headers,
            result_status=result.get("message", "retried"),
            matched_order_id=log.matched_order_id,
            sepay_transaction_id=log.sepay_transaction_id,
        )
        self._session.add(new_log)
        await self._session.flush()

        await AdminAuditService(self._session).record(
            ctx,
            action="premium.ipn.retry",
            target_entity="sepay_ipn_log",
            target_id=str(log_id),
            after={
                "retry_log_id": str(new_log.id),
                "result": result,
            },
        )

        return IPNRetryResponse(
            status=result.get("message", "retried"),
            log_id=new_log.id,
            message=f"IPN retry completed: {result}",
        )

    # ── helpers ───────────────────────────────────────────────────────────────

    async def _get_or_404(self, log_id: uuid.UUID) -> SePayIPNLog:
        log = (
            await self._session.execute(
                select(SePayIPNLog).where(SePayIPNLog.id == log_id)
            )
        ).scalar_one_or_none()
        if log is None:
            raise NotFoundError("IPN log")
        return log
