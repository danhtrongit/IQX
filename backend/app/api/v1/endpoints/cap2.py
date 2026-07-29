"""Cấp 2 «Kỷ luật» API — progress, enter, task, kế hoạch, kết sổ, điểm kỷ
luật, graduate.

Cap 2 is FREE: all endpoints use ``CurrentUser`` (authenticated), NOT ``PremiumUser``.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DBSession
from app.schemas.cap2 import (
    Cap2ProgressOut,
    DiemKyLuatOut,
    KehoachRequest,
    KetsoRequest,
    OrderKehoachOut,
    OrderKetsoOut,
    TaskRequest,
)
from app.services.cap2.service import Cap2Service

router = APIRouter(prefix="/cap2", tags=["Cấp 2"])


@router.get("/progress", response_model=Cap2ProgressOut | None)
async def get_progress(user: CurrentUser, db: DBSession) -> Cap2ProgressOut | None:
    """Trả về tiến trình Cấp 2 của người dùng hiện tại (hoặc null nếu chưa vào)."""
    svc = Cap2Service(db)
    return await svc.get_progress(user.id)


@router.post("/enter", response_model=Cap2ProgressOut)
async def enter(user: CurrentUser, db: DBSession) -> Cap2ProgressOut:
    """Vào Cấp 2 (idempotent) — yêu cầu đã tốt nghiệp Cấp 1."""
    svc = Cap2Service(db)
    return await svc.enter(user.id)


@router.patch("/task", response_model=Cap2ProgressOut)
async def mark_task(body: TaskRequest, user: CurrentUser, db: DBSession) -> Cap2ProgressOut:
    """Cả 5 nhiệm vụ đều được suy ra từ order_ketso — gọi endpoint này chỉ
    kích hoạt tính lại (idempotent, không tự đặt)."""
    svc = Cap2Service(db)
    return await svc.mark_task(user.id, body.task_no)


@router.post("/kehoach", response_model=OrderKehoachOut)
async def record_kehoach(
    body: KehoachRequest, user: CurrentUser, db: DBSession
) -> OrderKehoachOut:
    """Ghi cắt lỗ/chốt lời (2 cách chọn 1) vào kế hoạch đã có của Cấp 1."""
    svc = Cap2Service(db)
    return await svc.record_kehoach(
        user.id,
        body.order_id,
        phuong_phap_sl_tp=body.phuong_phap_sl_tp,
        cat_lo=body.cat_lo,
        chot_loi=body.chot_loi,
    )


@router.post("/ketso", response_model=OrderKetsoOut)
async def record_ketso(body: KetsoRequest, user: CurrentUser, db: DBSession) -> OrderKetsoOut:
    """Ghi 4 hành vi vi phạm kỷ luật (+ 3 đo lường) cho 1 lệnh đã kết sổ Cấp 1,
    rồi tính lại chuỗi lệnh kỷ luật + 5 nhiệm vụ."""
    svc = Cap2Service(db)
    return await svc.record_ketso(
        user.id,
        body.order_id,
        cham_sl_cuoi_phien=body.cham_SL_cuoi_phien,
        cham_sl_cat_dung_phien_ke=body.cham_SL_cat_dung_phien_ke,
        cham_sl_khong_cat=body.cham_SL_khong_cat,
        giu_cham_sl_bao_nhieu_phien=body.giu_cham_SL_bao_nhieu_phien,
        cham_tp_giu_lam_hut=body.cham_TP_giu_lam_hut,
        ban_som_khi_lo_nhe=body.ban_som_khi_lo_nhe,
        nhoi_lenh_khi_lo=body.nhoi_lenh_khi_lo,
    )


@router.get("/diem-ky-luat", response_model=DiemKyLuatOut)
async def get_diem_ky_luat(
    user: CurrentUser,
    db: DBSession,
    ngay: date | None = Query(default=None, description="Ngày cần chấm (mặc định hôm nay)"),
) -> DiemKyLuatOut:
    """Điểm kỷ luật 0-100 của 1 ngày + breakdown "số đến từ đâu" (spec §C12c)."""
    svc = Cap2Service(db)
    result = await svc.diem_ky_luat(user.id, ngay)
    return DiemKyLuatOut(**result)


@router.post("/graduate", response_model=Cap2ProgressOut)
async def graduate(user: CurrentUser, db: DBSession) -> Cap2ProgressOut:
    """Tốt nghiệp Cấp 2 — chỉ khi đủ 5/5 nhiệm vụ."""
    svc = Cap2Service(db)
    return await svc.graduate(user.id)
