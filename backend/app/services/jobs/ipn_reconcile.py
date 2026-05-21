"""Every 6h: find PENDING orders > 30min old, try to match against IPN logs."""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session_factory
from app.models.admin_audit import AdminAuditLog
from app.models.ipn_log import SePayIPNLog
from app.models.premium import (
    PaymentOrderStatus, PremiumPaymentOrder,
)
from app.schemas.premium import IPNPayload
from app.services.premium import PremiumService

logger = logging.getLogger(__name__)


async def run_ipn_reconcile_scan(session: AsyncSession | None = None) -> dict:
    """Returns a summary dict for logging / manual-trigger response.

    Accepts an optional ``session`` for testability — when omitted, opens its
    own session via the app session factory (production path).
    """
    if session is None:
        factory = get_session_factory()
        async with factory() as db:
            return await _do_ipn_reconcile_scan(db)
    return await _do_ipn_reconcile_scan(session)


async def _do_ipn_reconcile_scan(db: AsyncSession) -> dict:
    now = datetime.now(UTC)
    # Use naive datetimes for SQL comparisons (SQLite compat).
    cutoff_naive = (now - timedelta(minutes=30)).replace(tzinfo=None)
    very_old_cutoff_naive = (now - timedelta(hours=24)).replace(tzinfo=None)

    # Find stuck PENDING orders.
    stuck = (await db.execute(
        select(PremiumPaymentOrder).where(
            and_(
                PremiumPaymentOrder.status == PaymentOrderStatus.PENDING,
                PremiumPaymentOrder.created_at < cutoff_naive,
            )
        ).limit(100)
    )).scalars().all()

    attempted, reconciled, failed_old = 0, 0, 0

    svc = PremiumService(db)

    for order in stuck:
        attempted += 1
        # Look up valid IPN logs.
        logs = (await db.execute(
            select(SePayIPNLog).where(
                and_(
                    SePayIPNLog.secret_key_valid.is_(True),
                    SePayIPNLog.raw_body.is_not(None),
                )
            ).order_by(SePayIPNLog.received_at.desc())
        )).scalars().all()

        # Filter Python-side because raw_body is JSON.
        matching: SePayIPNLog | None = None
        for lg in logs:
            rb = lg.raw_body or {}
            ord_section = (rb.get("order") or {}) if isinstance(rb, dict) else {}
            if ord_section.get("order_invoice_number") == order.invoice_number:
                matching = lg
                break

        if matching is None:
            # If order is very old (>24h) and still no IPN, mark FAILED.
            # Compare naive-to-naive (SQLite stores naive, Postgres with tz).
            created_naive = order.created_at.replace(tzinfo=None) if order.created_at.tzinfo else order.created_at
            if created_naive < very_old_cutoff_naive:
                order.status = PaymentOrderStatus.FAILED
                failed_old += 1
            continue

        # Replay through process_ipn.
        try:
            payload = IPNPayload.model_validate(matching.raw_body)
            result = await svc.process_ipn(payload)
            if result.get("message") == "processed":
                reconciled += 1
        except Exception as exc:  # noqa: BLE001
            logger.warning("Reconcile failed for invoice %s: %s", order.invoice_number, exc)

    db.add(AdminAuditLog(
        admin_user_id=None,
        action="system.ipn_reconcile_scan",
        payload_after={
            "attempted": attempted, "reconciled": reconciled,
            "failed_old": failed_old, "ran_at": datetime.now(UTC).isoformat(),
        },
        note=f"Reconcile scan: attempted={attempted} reconciled={reconciled} failed_old={failed_old}",
    ))
    await db.commit()

    return {
        "attempted": attempted, "reconciled": reconciled, "failed_old": failed_old,
    }
