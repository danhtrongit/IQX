"""Recover Cấp-6 identity initialization after a transient fanout failure.

The graduation endpoint commits the learning outcome before it initializes
downstream features.  This sweep closes the resulting durability gap without
making a GET endpoint write or widening the frozen ADN evidence window.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session_factory
from app.models.cap4 import Cap4Progress
from app.models.cap6 import Cap6Progress
from app.models.journey_identity import (
    BotMascotProfile,
    JourneyAssessment,
    JourneyReadingDataset,
)
from app.services.journey_identity.classification import RULES_VERSION, classify
from app.services.journey_identity.service import JourneyIdentityService, evidence_records

logger = logging.getLogger(__name__)


async def _pending_has_repair(db: AsyncSession, profile: BotMascotProfile) -> bool:
    """Return true only when retrying can change a pending profile.

    A normal no-evidence result is permanent for its frozen window and should
    not be rewritten every 15 minutes.  A restored Cấp-4 boundary or repaired
    historical snapshot can make it eligible again.  Classification here is
    read-only; ``initialize`` remains the sole writer and validates everything
    again while holding the user lock.
    """
    cap4 = await db.scalar(
        select(Cap4Progress).where(Cap4Progress.user_id == profile.user_id)
    )
    if profile.window_start is None:
        return cap4 is not None
    pairs = (
        await db.execute(
            select(JourneyAssessment, JourneyReadingDataset)
            .join(
                JourneyReadingDataset,
                JourneyReadingDataset.id == JourneyAssessment.dataset_id,
            )
            .where(JourneyAssessment.user_id == profile.user_id)
        )
    ).all()
    preview = classify(
        evidence_records(pairs, profile.user_id),
        str(profile.user_id),
        profile.window_start,
        profile.window_end,
    )
    return preview["assignment_status"] == "assigned"


async def run_journey_identity_recovery(
    *, session_factory: Callable[[], Any] | None = None
) -> dict[str, int]:
    """Recover missing/repaired rules-v1 profiles in isolated transactions."""
    factory = session_factory or get_session_factory()
    async with factory() as discovery:
        user_ids = (
            (
                await discovery.execute(
                    select(Cap6Progress.user_id)
                    .outerjoin(
                        BotMascotProfile,
                        (BotMascotProfile.user_id == Cap6Progress.user_id)
                        & (
                            BotMascotProfile.mascot_rules_version
                            == RULES_VERSION
                        ),
                    )
                    .where(
                        Cap6Progress.graduated_at.is_not(None),
                        (BotMascotProfile.id.is_(None))
                        | (
                            BotMascotProfile.assignment_status
                            == "pending_data_repair"
                        ),
                    )
                    .order_by(Cap6Progress.user_id)
                )
            )
            .scalars()
            .all()
        )

    summary = {
        "examined": len(user_ids),
        "recovered": 0,
        "assigned": 0,
        "pending_data_repair": 0,
        "skipped_unchanged_pending": 0,
        "failed": 0,
    }
    for user_id in user_ids:
        async with factory() as db:
            service = JourneyIdentityService(db)
            try:
                # Serialize against assessment submission, graduation retries,
                # and another recovery process.
                await service.lock_user(user_id)
                progress = await db.scalar(
                    select(Cap6Progress).where(Cap6Progress.user_id == user_id)
                )
                if progress is None or progress.graduated_at is None:
                    await db.rollback()
                    continue
                profile = await service.profile(user_id)
                if profile is not None:
                    if profile.assignment_status == "assigned":
                        await db.rollback()
                        continue
                    if not await _pending_has_repair(db, profile):
                        summary["skipped_unchanged_pending"] += 1
                        await db.rollback()
                        continue
                recovered = await service.initialize(user_id)
                await db.commit()
                if recovered is not None:
                    summary["recovered"] += 1
                    summary[recovered.assignment_status] += 1
            except Exception:  # noqa: BLE001 - isolate one graduate from the sweep
                await db.rollback()
                summary["failed"] += 1
                logger.exception(
                    "journey_identity_recovery_failed",
                    extra={"user_id": str(user_id)},
                )
    logger.info("Journey identity recovery: %s", summary)
    return summary
