"""Reconcile pending payment orders with SePay.

Usage: python -m app.scripts.reconcile_orders

Fetches all pending orders and queries SePay REST API for their current status.
Safe to run repeatedly (idempotent). Designed to be called as a cron job.
"""

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.models.payment_order import PaymentOrder
from app.services.billing import refresh_order_status

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


async def reconcile():
    """Fetch all pending orders and sync with SePay."""
    settings = get_settings()
    engine = create_async_engine(settings.database_url)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as session:
        result = await session.execute(
            select(PaymentOrder)
            .where(PaymentOrder.status == "pending")
            .order_by(PaymentOrder.created_at.asc())
        )
        pending = list(result.scalars().all())

        if not pending:
            logger.info("No pending orders to reconcile.")
            await engine.dispose()
            return

        logger.info("Found %d pending orders to reconcile.", len(pending))

        for order in pending:
            logger.info(
                "  Checking order %s (invoice: %s, provider_order_id: %s)",
                order.id,
                order.invoice_number,
                order.provider_order_id,
            )
            try:
                updated = await refresh_order_status(session, order)
                if updated.status != "pending":
                    logger.info(
                        "    → Status changed: %s → %s", "pending", updated.status
                    )
                else:
                    logger.info("    → Still pending.")
            except Exception:
                logger.exception("    → Error refreshing order %s", order.id)

        await session.commit()

    await engine.dispose()
    logger.info("Reconciliation complete.")


if __name__ == "__main__":
    asyncio.run(reconcile())
