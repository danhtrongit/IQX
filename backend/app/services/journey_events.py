"""Record diagnostics without granting trading or graduation privileges."""

import uuid
from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.models.journey_event import JourneyEvent


async def record_journey_event(
    db: AsyncSession,
    user_id: uuid.UUID,
    name: str,
    fields: dict | None = None,
    *,
    event_id: uuid.UUID | None = None,
    dedup_key: str | None = None,
    source: str = "server",
) -> JourneyEvent:
    """Participate in the caller's transaction; retries retain their event id."""
    key = event_id or (
        uuid.uuid5(uuid.NAMESPACE_URL, f"iqx:{user_id}:{name}:{dedup_key}") if dedup_key else uuid.uuid4()
    )
    prior = await db.get(JourneyEvent, key)
    if prior is not None:
        if (
            prior.user_id != user_id
            or prior.name != name
            or prior.source != source
            or (source == "client" and prior.fields != (fields or {}))
        ):
            raise ConflictError("Mã sự kiện đã được sử dụng")
        return prior
    event = JourneyEvent(
        id=key, user_id=user_id, name=name, source=source, occurred_at=datetime.now(UTC), fields=fields or {}
    )
    try:
        async with db.begin_nested():
            db.add(event)
            await db.flush()
    except IntegrityError:
        prior = await db.get(JourneyEvent, key)
        if (
            prior is None
            or prior.user_id != user_id
            or prior.name != name
            or prior.source != source
            or (source == "client" and prior.fields != (fields or {}))
        ):
            raise ConflictError("Mã sự kiện đã được sử dụng") from None
        return prior
    return event
