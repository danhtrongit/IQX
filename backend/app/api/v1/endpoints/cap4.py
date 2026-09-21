"""Cấp 4 «Thuần thục» API — progress, enter, task, kế hoạch (đọc 5 lớp),
vũ khí & điểm mù, graduate.

★ ``GET /cap4/thach-thuc`` đã bị GỠ cùng khối "Thách thức Thuần thục" (3 điều
kiện): Cấp 4 chỉ còn MỘT nhiệm vụ — «Đọc và chấm đủ 5 lớp qua 10 lệnh».

Cấp 4 is FREE: all endpoints use ``CurrentUser`` (authenticated), NOT ``PremiumUser``.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, DBSession
from app.schemas.cap4 import (
    Cap4PlanOut,
    Cap4ProgressOut,
    KehoachRequest,
    OrderKehoachOut,
    PhanTichOut,
    TaskRequest,
    VuKhiDiemMuOut,
)
from app.services.cap4.analysis import Cap4AnalysisService
from app.services.cap4.service import Cap4Service

router = APIRouter(prefix="/cap4", tags=["Cấp 4"])


@router.get("/progress", response_model=Cap4ProgressOut | None)
async def get_progress(user: CurrentUser, db: DBSession) -> Cap4ProgressOut | None:
    """Trả về tiến trình Cấp 4 của người dùng hiện tại (hoặc null nếu chưa vào)."""
    svc = Cap4Service(db)
    return await svc.get_progress(user.id)


@router.post("/enter", response_model=Cap4ProgressOut)
async def enter(user: CurrentUser, db: DBSession) -> Cap4ProgressOut:
    """Vào Cấp 4 (idempotent) — yêu cầu đã tốt nghiệp Cấp 3."""
    svc = Cap4Service(db)
    return await svc.enter(user.id)


@router.patch("/task", response_model=Cap4ProgressOut)
async def mark_task(body: TaskRequest, user: CurrentUser, db: DBSession) -> Cap4ProgressOut:
    """Nhiệm vụ duy nhất được suy ra từ order_kehoach — gọi endpoint này chỉ
    kích hoạt tính lại (idempotent, không tự đặt). ``task_no`` hợp lệ = 1."""
    svc = Cap4Service(db)
    return await svc.mark_task(user.id, body.task_no)


@router.post("/kehoach", response_model=OrderKehoachOut)
async def record_kehoach(
    body: KehoachRequest, user: CurrentUser, db: DBSession
) -> OrderKehoachOut:
    """Ghi tự chấm 5 lớp; AI và các số đối chiếu do server lấy từ dataset đã
    commit trước reveal."""
    svc = Cap4Service(db)
    return await svc.record_kehoach(
        user.id,
        body.order_id,
        doc_5_lop=body.doc_5_lop,
    )


@router.get("/plans/{order_id}", response_model=Cap4PlanOut)
async def get_plan(order_id: uuid.UUID, user: CurrentUser, db: DBSession) -> Cap4PlanOut:
    """Khôi phục cam kết BUY Cấp 1–4 để SELL vẫn mở Kết sổ sau reload."""
    return Cap4PlanOut.model_validate(await Cap4Service(db).get_plan(user.id, order_id))


@router.get("/vu-khi-diem-mu", response_model=VuKhiDiemMuOut)
async def get_vu_khi_diem_mu(user: CurrentUser, db: DBSession) -> VuKhiDiemMuOut:
    """% thắng THẬT của từng lớp khi bạn tự đọc lớp đó là Ủng hộ — kèm số lệnh,
    số lệnh thắng và giải thích nguồn gốc (spec §7 khối ⑨/§C12c)."""
    svc = Cap4Service(db)
    result = await svc.vu_khi_diem_mu(user.id)
    return VuKhiDiemMuOut(**result)


@router.get("/phan-tich", response_model=PhanTichOut)
async def get_phan_tich(user: CurrentUser, db: DBSession) -> PhanTichOut:
    """Khối ⑩/⑪ tính từ kế hoạch và Kết sổ đã lưu trên server."""
    return PhanTichOut(**await Cap4AnalysisService(db).get(user.id))


@router.post("/graduate", response_model=Cap4ProgressOut)
async def graduate(user: CurrentUser, db: DBSession) -> Cap4ProgressOut:
    """Tốt nghiệp Cấp 4 — chỉ khi xong nhiệm vụ duy nhất (10 lệnh đọc đủ 5 lớp)."""
    svc = Cap4Service(db)
    return await svc.graduate(user.id)
