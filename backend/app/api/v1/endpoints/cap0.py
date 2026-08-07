"""Cấp 0 onboarding API — progress, enter (+seed), placement, tasks, kế hoạch, graduate.

Cap 0 is FREE: all endpoints use ``CurrentUser`` (authenticated), NOT ``PremiumUser``.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DBSession
from app.core.exceptions import NotFoundError
from app.schemas.cap0 import (
    Cap0KehoachOut,
    Cap0KehoachRequest,
    Cap0ProgressOut,
    PlacementRequest,
    PlacementResponse,
    TaskRequest,
)
from app.services.cap0.service import Cap0Service

router = APIRouter(prefix="/cap0", tags=["Cấp 0"])


@router.get("/progress", response_model=Cap0ProgressOut | None)
async def get_progress(user: CurrentUser, db: DBSession) -> Cap0ProgressOut | None:
    """Trả về tiến trình Cấp 0 của người dùng hiện tại (hoặc null nếu chưa vào)."""
    svc = Cap0Service(db)
    return await svc.get_progress(user.id)


@router.post("/enter", response_model=Cap0ProgressOut)
async def enter(user: CurrentUser, db: DBSession) -> Cap0ProgressOut:
    """Vào Cấp 0 (idempotent) + seed tài khoản ảo 250tr nếu user chưa có."""
    svc = Cap0Service(db)
    return await svc.enter(user.id)


@router.post("/placement", response_model=PlacementResponse)
async def placement(
    body: PlacementRequest, user: CurrentUser, db: DBSession
) -> PlacementResponse:
    """Ghi nhận câu trả lời phân loại → trả placed_level (chưa từng giao dịch → 0, đã từng → 2)."""
    svc = Cap0Service(db)
    result = await svc.set_placement(user.id, body.has_traded_before)
    return PlacementResponse(placed_level=result.placed_level)


@router.patch("/task", response_model=Cap0ProgressOut)
async def complete_task(
    body: TaskRequest, user: CurrentUser, db: DBSession
) -> Cap0ProgressOut:
    """Đánh dấu nhiệm vụ 1-5 hoàn thành (idempotent) + set cổng (star/debrief) nếu có.

    Nhiệm vụ ⑤ bắt buộc kèm ``gate="debrief"`` — chỉ đóng màn Kết sổ mới tính đạt.
    """
    svc = Cap0Service(db)
    return await svc.complete_task(user.id, body.task_no, body.gate)


@router.post("/kehoach", response_model=Cap0KehoachOut)
async def record_kehoach(
    body: Cap0KehoachRequest, user: CurrentUser, db: DBSession
) -> Cap0KehoachOut:
    """Ghi chip lý do đời thường của khối "Kế hoạch" cho 1 lệnh MUA Sân tập.

    Gọi lại cho cùng một lệnh sẽ ghi đè chip (không 409).
    """
    svc = Cap0Service(db)
    kehoach = await svc.record_kehoach(
        user.id, body.order_id, ly_do_doi_thuong=body.ly_do_doi_thuong
    )
    view = await svc.get_kehoach_view(user.id, kehoach.order_id)
    if view is None:  # pragma: no cover — just written above
        raise NotFoundError("kế hoạch Cấp 0")
    return Cap0KehoachOut.model_validate(view)


@router.get("/kehoach/latest", response_model=Cap0KehoachOut | None)
async def latest_kehoach(
    user: CurrentUser,
    db: DBSession,
    symbol: str = Query(min_length=1, max_length=10),
) -> Cap0KehoachOut | None:
    """Chip lý do + dữ liệu suy ra từ lệnh mua gần nhất của mã (cho màn Kết sổ §5).

    Trả ``null`` nếu chưa có — màn Kết sổ để trống chứ không bịa số.
    """
    svc = Cap0Service(db)
    view = await svc.get_latest_kehoach_view(user.id, symbol)
    return Cap0KehoachOut.model_validate(view) if view is not None else None


@router.post("/graduate", response_model=Cap0ProgressOut)
async def graduate(user: CurrentUser, db: DBSession) -> Cap0ProgressOut:
    """Tốt nghiệp Cấp 0 — chỉ khi đủ 5 nhiệm vụ + cổng hành vi duy nhất (debrief)."""
    svc = Cap0Service(db)
    return await svc.graduate(user.id)
