"""Cấp 1 «Học việc» API — progress, enter, task, kế hoạch, kết sổ, graduate.

Cap 1 is FREE: all endpoints use ``CurrentUser`` (authenticated), NOT ``PremiumUser``.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DBSession
from app.schemas.cap1 import (
    Cap1ProgressOut,
    KehoachRequest,
    KetsoRequest,
    OrderKehoachOut,
    OrderKetsoOut,
    TaskRequest,
)
from app.services.cap1.service import Cap1Service

router = APIRouter(prefix="/cap1", tags=["Cấp 1"])


@router.get("/progress", response_model=Cap1ProgressOut | None)
async def get_progress(user: CurrentUser, db: DBSession) -> Cap1ProgressOut | None:
    """Trả về tiến trình Cấp 1 của người dùng hiện tại (hoặc null nếu chưa vào)."""
    svc = Cap1Service(db)
    return await svc.get_progress(user.id)


@router.post("/enter", response_model=Cap1ProgressOut)
async def enter(user: CurrentUser, db: DBSession) -> Cap1ProgressOut:
    """Vào Cấp 1 (idempotent) — yêu cầu đã tốt nghiệp Cấp 0."""
    svc = Cap1Service(db)
    return await svc.enter(user.id)


@router.patch("/task", response_model=Cap1ProgressOut)
async def mark_task(body: TaskRequest, user: CurrentUser, db: DBSession) -> Cap1ProgressOut:
    """Nhiệm vụ ⑤: ghi nhận 1 lần mở Phân tích danh mục (khác ngày mới tính).

    Các nhiệm vụ khác được suy ra từ order_kehoach/order_ketso — gọi endpoint
    này với task_no khác chỉ kích hoạt tính lại (idempotent, không tự đặt).
    """
    svc = Cap1Service(db)
    return await svc.mark_task(user.id, body.task_no)


@router.post("/kehoach", response_model=OrderKehoachOut)
async def record_kehoach(
    body: KehoachRequest, user: CurrentUser, db: DBSession
) -> OrderKehoachOut:
    """Ghi Form Kế hoạch (lý do mua + vùng mua) cho 1 lệnh MUA Thực chiến."""
    svc = Cap1Service(db)
    return await svc.record_kehoach(
        user.id,
        body.order_id,
        ly_do=body.lyDo,
        trang_thai_luc_dat=body.trangThai_luc_dat,
        vung_mua=body.vung_mua,
        co_bam_doc_chi_tiet=body.co_bam_doc_chi_tiet,
        snapshot=body.snapshot,
    )


@router.post("/ketso", response_model=OrderKetsoOut)
async def record_ketso(body: KetsoRequest, user: CurrentUser, db: DBSession) -> OrderKetsoOut:
    """Kết sổ cho 1 lệnh BÁN đã khớp — tính pnl/số phiên giữ từ dữ liệu lệnh."""
    svc = Cap1Service(db)
    return await svc.record_ketso(user.id, body.order_id, cam_xuc=body.cam_xuc)


@router.post("/graduate", response_model=Cap1ProgressOut)
async def graduate(user: CurrentUser, db: DBSession) -> Cap1ProgressOut:
    """Tốt nghiệp Cấp 1 — chỉ khi đủ 6/6 nhiệm vụ."""
    svc = Cap1Service(db)
    return await svc.graduate(user.id)
