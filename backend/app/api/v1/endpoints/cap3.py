"""Cấp 3 «Bản lĩnh» API — progress, enter, khẩu vị, task, kế hoạch (quản lý
vốn), thách thức bản lĩnh, graduate.

Cap 3 is FREE: all endpoints use ``CurrentUser`` (authenticated), NOT ``PremiumUser``.
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
    ThachThucOut,
)
from app.services.cap3.service import Cap3Service

router = APIRouter(prefix="/cap3", tags=["Cấp 3"])


@router.get("/progress", response_model=Cap3ProgressOut | None)
async def get_progress(user: CurrentUser, db: DBSession) -> Cap3ProgressOut | None:
    """Trả về tiến trình Cấp 3 của người dùng hiện tại (hoặc null nếu chưa vào)."""
    svc = Cap3Service(db)
    return await svc.get_progress(user.id)


@router.post("/enter", response_model=Cap3ProgressOut)
async def enter(user: CurrentUser, db: DBSession) -> Cap3ProgressOut:
    """Vào Cấp 3 (idempotent) — yêu cầu đã tốt nghiệp Cấp 2."""
    svc = Cap3Service(db)
    return await svc.enter(user.id)


@router.post("/khau-vi", response_model=Cap3ProgressOut)
async def set_khau_vi(body: KhauViRequest, user: CurrentUser, db: DBSession) -> Cap3ProgressOut:
    """Đặt/đổi khẩu vị rủi ro — hồ sơ, áp cho mọi lệnh sau (spec §5)."""
    svc = Cap3Service(db)
    return await svc.set_khau_vi(user.id, body.khau_vi)


@router.patch("/task", response_model=Cap3ProgressOut)
async def mark_task(body: TaskRequest, user: CurrentUser, db: DBSession) -> Cap3ProgressOut:
    """Cả 3 nhiệm vụ đều được suy ra từ order_kehoach/order_ketso — gọi
    endpoint này chỉ kích hoạt tính lại (idempotent, không tự đặt)."""
    svc = Cap3Service(db)
    return await svc.mark_task(user.id, body.task_no)


@router.post("/kehoach", response_model=OrderKehoachOut)
async def record_kehoach(
    body: KehoachRequest, user: CurrentUser, db: DBSession
) -> OrderKehoachOut:
    """Ghi khối Quản lý vốn (khẩu vị + mức tự tin + cách/khối lượng) vào kế
    hoạch đã có của Cấp 1."""
    svc = Cap3Service(db)
    return await svc.record_kehoach(
        user.id,
        body.order_id,
        khau_vi=body.khau_vi,
        muc_tu_tin=body.muc_tu_tin,
        cach_khoi_luong=body.cach_khoi_luong,
        khoi_luong=body.khoi_luong,
        pct_von=body.pct_von,
    )


@router.get("/thach-thuc", response_model=ThachThucOut)
async def get_thach_thuc(user: CurrentUser, db: DBSession) -> ThachThucOut:
    """3 điều kiện của Thách thức Bản lĩnh (nhiệm vụ ③) kèm giá trị hiện tại
    + đạt/chưa đạt + giải thích (spec §2③/§C12c)."""
    svc = Cap3Service(db)
    result = await svc.thach_thuc(user.id)
    return ThachThucOut(**result)


@router.post("/graduate", response_model=Cap3ProgressOut)
async def graduate(user: CurrentUser, db: DBSession) -> Cap3ProgressOut:
    """Tốt nghiệp Cấp 3 — chỉ khi đủ 3/3 nhiệm vụ."""
    svc = Cap3Service(db)
    return await svc.graduate(user.id)
