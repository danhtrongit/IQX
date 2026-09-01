"""Cấp 3 «Bản lĩnh» API — progress, enter, risk appetite, two server-derived
sizing-confidence tasks, and graduation.

Cap 3 is FREE: all endpoints use ``CurrentUser`` (authenticated), NOT
``PremiumUser``.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DBSession
from app.schemas.cap3 import (
    Cap3ProgressOut,
    KehoachRequest,
    KhauViRequest,
    OrderKehoachOut,
    TaskRequest,
)
from app.services.cap3.service import Cap3Service

router = APIRouter(prefix="/cap3", tags=["Cấp 3"])


@router.get("/progress", response_model=Cap3ProgressOut | None)
async def get_progress(user: CurrentUser, db: DBSession) -> Cap3ProgressOut | None:
    """Trả về tiến trình Cấp 3 của người dùng hiện tại (hoặc null nếu chưa vào)."""
    progress = await Cap3Service(db).get_progress(user.id)
    return Cap3ProgressOut.model_validate(progress) if progress is not None else None


@router.post("/enter", response_model=Cap3ProgressOut)
async def enter(user: CurrentUser, db: DBSession) -> Cap3ProgressOut:
    progress = await Cap3Service(db).enter(user.id)
    return Cap3ProgressOut.model_validate(progress)


@router.post("/khau-vi", response_model=Cap3ProgressOut)
async def set_khau_vi(body: KhauViRequest, user: CurrentUser, db: DBSession) -> Cap3ProgressOut:
    progress = await Cap3Service(db).set_khau_vi(user.id, body.khau_vi)
    return Cap3ProgressOut.model_validate(progress)


@router.patch("/task", response_model=Cap3ProgressOut)
async def mark_task(body: TaskRequest, user: CurrentUser, db: DBSession) -> Cap3ProgressOut:
    """Both tasks are recomputed from qualifying placed plans; this endpoint
    only requests that idempotent server-side recomputation."""
    progress = await Cap3Service(db).mark_task(user.id, body.task_no)
    return Cap3ProgressOut.model_validate(progress)


@router.post("/kehoach", response_model=OrderKehoachOut)
async def record_kehoach(
    body: KehoachRequest, user: CurrentUser, db: DBSession
) -> OrderKehoachOut:
    """Ghi khối Quản lý vốn (khẩu vị + mức tự tin + cách/khối lượng) vào kế
    hoạch đã có của Cấp 1."""
    order = await Cap3Service(db).record_kehoach(
        user.id,
        body.order_id,
        khau_vi=body.khau_vi,
        muc_tu_tin=body.muc_tu_tin,
        cach_khoi_luong=body.cach_khoi_luong,
        khoi_luong=body.khoi_luong,
        pct_von=body.pct_von,
    )
    return OrderKehoachOut.model_validate(order)




@router.post("/graduate", response_model=Cap3ProgressOut)
async def graduate(user: CurrentUser, db: DBSession) -> Cap3ProgressOut:
    """Graduate Cấp 3 only after both sizing-confidence tasks are complete."""
    progress = await Cap3Service(db).graduate(user.id)
    return Cap3ProgressOut.model_validate(progress)
