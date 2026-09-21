"""Recover missing identity profiles from frozen evidence; dry-run by default.

Run: python -m app.services.journey_identity.repair [--apply]
Does not rewrite assigned species, create trades, or issue demo capital.
"""

import argparse
import asyncio
import logging

from sqlalchemy import select

from app.core.database import get_session_factory
from app.models.cap6 import Cap6Progress
from app.models.journey_identity import BotMascotProfile
from app.services.journey_identity.service import JourneyIdentityService

logger = logging.getLogger(__name__)


async def repair(apply: bool) -> dict[str, int]:
    totals = {"examined": 0, "assigned": 0, "pending_data_repair": 0, "failed": 0}
    factory = get_session_factory()
    async with factory() as db:
        ids = (
            (
                await db.execute(
                    select(Cap6Progress.user_id)
                    .outerjoin(
                        BotMascotProfile,
                        (BotMascotProfile.user_id == Cap6Progress.user_id)
                        & (BotMascotProfile.mascot_rules_version == 1),
                    )
                    .where(
                        Cap6Progress.graduated_at.is_not(None),
                        (BotMascotProfile.id.is_(None)) | (BotMascotProfile.assignment_status == "pending_data_repair"),
                    )
                )
            )
            .scalars()
            .all()
        )
    for user_id in ids:
        totals["examined"] += 1
        async with factory() as db:
            try:
                profile = await JourneyIdentityService(db).initialize(user_id)
                if profile:
                    totals[profile.assignment_status] += 1
                if apply:
                    await db.commit()
                else:
                    await db.rollback()
            except Exception:
                await db.rollback()
                totals["failed"] += 1
                logger.exception("mascot_recovery_failed")
    return totals


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    print(asyncio.run(repair(parser.parse_args().apply)))
