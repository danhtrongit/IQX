"""Idempotent seeding of the 10 fixed alert signals at startup."""

from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import AlertSide
from app.repositories.alert import AlertSignalRepository
from app.services.alerts.signals import SIGNAL_DEFS

logger = logging.getLogger(__name__)


async def seed_alert_signals(session: AsyncSession, *, overwrite: bool = False) -> int:
    """Ensure the 10 presets exist. Returns the number created.

    Existing rows are left untouched (admins may have tuned them) unless
    ``overwrite`` is set, which resets combinations/titles to defaults.
    """
    repo = AlertSignalRepository(session)
    created = 0
    for order, definition in enumerate(SIGNAL_DEFS):
        existing = await repo.get(definition["key"])
        if existing is None:
            await repo.create(
                key=definition["key"],
                side=AlertSide(definition["side"]),
                ta_name=definition["ta_name"],
                message_title=definition["message_title"],
                combination=definition["combination"],
                is_enabled=True,
                sort_order=order,
            )
            created += 1
        elif overwrite:
            existing.side = AlertSide(definition["side"])
            existing.ta_name = definition["ta_name"]
            existing.message_title = definition["message_title"]
            existing.combination = definition["combination"]
            existing.sort_order = order
    await session.commit()
    if created:
        logger.info("Seeded %d alert signals", created)
    return created
