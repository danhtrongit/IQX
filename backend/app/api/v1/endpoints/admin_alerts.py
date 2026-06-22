"""Admin alert API — curate the 10 global signal presets (audited)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.api.deps import AdminUser, DBSession
from app.models.admin_audit import AdminAuditLog
from app.models.alert import AlertSide
from app.repositories.alert import AlertSignalRepository
from app.schemas.alert import (
    AlertSignalAdminCreate,
    AlertSignalAdminUpsert,
    AlertSignalResponse,
)
from app.services.alerts.seeder import seed_alert_signals
from app.services.ta.conditions import Combination, CombinationError, validate_combination
from app.services.ta.display_names import INDICATOR_DISPLAY, INDICATOR_KIND

router = APIRouter(prefix="/admin/alerts", tags=["Admin · Cảnh báo"])


def _validate(combination: dict) -> None:
    try:
        validate_combination(Combination.from_dict(combination))
    except CombinationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


async def _audit(db: DBSession, admin_id, action: str, key: str, payload: dict) -> None:  # noqa: ANN001
    db.add(
        AdminAuditLog(
            admin_user_id=admin_id,
            action=action,
            target_entity="alert_signal",
            target_id=None,
            payload_after={"key": key, **payload},
            note=f"{action} {key}",
        )
    )


def _indicator_options() -> list[dict]:
    return [{"id": id_, "label": INDICATOR_DISPLAY[id_], "kind": INDICATOR_KIND[id_]} for id_ in INDICATOR_DISPLAY]


@router.get("/indicators")
async def list_indicator_options(admin: AdminUser) -> list[dict]:
    return _indicator_options()


@router.get("/signals", response_model=list[AlertSignalResponse])
async def list_signals(admin: AdminUser, db: DBSession) -> list[AlertSignalResponse]:
    signals = await AlertSignalRepository(db).list_all()
    return [AlertSignalResponse.model_validate(s) for s in signals]


@router.post("/signals", response_model=AlertSignalResponse, status_code=201)
async def create_signal(body: AlertSignalAdminCreate, admin: AdminUser, db: DBSession) -> AlertSignalResponse:
    repo = AlertSignalRepository(db)
    if await repo.get(body.key):
        raise HTTPException(status_code=409, detail="Tín hiệu đã tồn tại")
    combo = body.combination.to_dict()
    _validate(combo)
    item = await repo.create(
        key=body.key,
        side=AlertSide(body.side),
        ta_name=body.ta_name,
        message_title=body.message_title,
        combination=combo,
        is_enabled=body.is_enabled,
        sort_order=body.sort_order,
    )
    await _audit(db, admin.id, "alert.signal_create", body.key, {"combination": combo})
    await db.commit()
    return AlertSignalResponse.model_validate(item)


@router.put("/signals/{key}", response_model=AlertSignalResponse)
async def update_signal(key: str, body: AlertSignalAdminUpsert, admin: AdminUser, db: DBSession) -> AlertSignalResponse:
    repo = AlertSignalRepository(db)
    item = await repo.get(key)
    if item is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tín hiệu")
    combo = body.combination.to_dict()
    _validate(combo)
    item.side = AlertSide(body.side)
    item.ta_name = body.ta_name
    item.message_title = body.message_title
    item.combination = combo
    item.is_enabled = body.is_enabled
    item.sort_order = body.sort_order
    await _audit(db, admin.id, "alert.signal_update", key, {"combination": combo, "is_enabled": body.is_enabled})
    await db.commit()
    await db.refresh(item)
    return AlertSignalResponse.model_validate(item)


@router.delete("/signals/{key}", status_code=204)
async def delete_signal(key: str, admin: AdminUser, db: DBSession) -> None:
    repo = AlertSignalRepository(db)
    deleted = await repo.delete(key)
    if deleted:
        await _audit(db, admin.id, "alert.signal_delete", key, {})
        await db.commit()


@router.post("/seed")
async def reseed(admin: AdminUser, db: DBSession, overwrite: bool = False) -> dict:
    """Ensure the 10 default presets exist (idempotent). ``overwrite`` resets them."""
    created = await seed_alert_signals(db, overwrite=overwrite)
    return {"created": created, "overwrite": overwrite}
