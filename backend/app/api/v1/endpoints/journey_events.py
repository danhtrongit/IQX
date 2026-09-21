from fastapi import APIRouter

from app.api.deps import CurrentUser, DBSession
from app.schemas.journey_events import JourneyEventIn
from app.services.journey_events import record_journey_event

router = APIRouter(prefix="/journey", tags=["Hành trình"])


@router.post("/events", status_code=202)
async def record_event(body: JourneyEventIn, user: CurrentUser, db: DBSession) -> dict[str, bool]:
    await record_journey_event(db, user.id, body.name, body.fields, event_id=body.event_id, source="client")
    return {"accepted": True}
