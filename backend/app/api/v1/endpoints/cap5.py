"""Cấp 5 «Lão luyện» API — progress, enter, task, verdict hệ gợi ý (+
provenance), kết sổ 4 ô, đứng ngoài có chủ đích (+ chấm né đúng/hụt), thách
thức lão luyện, graduate.

Cấp 5 is FREE: all endpoints use ``CurrentUser`` (authenticated), NOT
``PremiumUser``.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, DBSession
from app.schemas.cap5 import (
    Cap5ProgressOut,
    ChamDungNgoaiOut,
    DungNgoaiListOut,
    DungNgoaiOut,
    DungNgoaiRequest,
    KetsoCap5Out,
    KetsoRequest,
    TaskRequest,
    ThachThucOut,
    VerdictOut,
)
from app.services.cap5.service import Cap5Service

router = APIRouter(prefix="/cap5", tags=["Cấp 5"])


@router.get("/progress", response_model=Cap5ProgressOut | None)
async def get_progress(user: CurrentUser, db: DBSession) -> Cap5ProgressOut | None:
    """Trả về tiến trình Cấp 5 của người dùng hiện tại (hoặc null nếu chưa vào).

    Đồng thời chấm các nước đứng ngoài đã tới hạn (lazy compute-on-read).
    """
    svc = Cap5Service(db)
    return await svc.get_progress(user.id)


@router.post("/enter", response_model=Cap5ProgressOut)
async def enter(user: CurrentUser, db: DBSession) -> Cap5ProgressOut:
    """Vào Cấp 5 (idempotent) — yêu cầu đã tốt nghiệp Cấp 4."""
    svc = Cap5Service(db)
    return await svc.enter(user.id)


@router.patch("/task", response_model=Cap5ProgressOut)
async def mark_task(body: TaskRequest, user: CurrentUser, db: DBSession) -> Cap5ProgressOut:
    """Cả 3 nhiệm vụ đều được suy ra từ order_ketso / standby_decision — gọi
    endpoint này chỉ kích hoạt tính lại (idempotent, không tự đặt)."""
    svc = Cap5Service(db)
    return await svc.mark_task(user.id, body.task_no)


@router.get("/verdict/{order_id}", response_model=VerdictOut)
async def get_verdict(order_id: uuid.UUID, user: CurrentUser, db: DBSession) -> VerdictOut:
    """Verdict hệ GỢI Ý cho một lệnh đã kết sổ + toàn bộ tín hiệu dẫn tới nó.

    Suy ra từ dữ liệu quy trình Cấp 1-4 đã ghi trên chính lệnh này (cơ sở lúc
    đặt · kỷ luật thoát · không nhồi lệnh · khối lượng khớp khẩu vị). §C12c:
    KHÔNG bao giờ trả verdict trơ — luôn kèm provenance. ★ Lãi/lỗ không tham gia
    vào verdict (spec §1).
    """
    svc = Cap5Service(db)
    result = await svc.suggested_verdict(user.id, order_id)
    return VerdictOut(**result)


@router.post("/ketso", response_model=KetsoCap5Out)
async def record_ketso(body: KetsoRequest, user: CurrentUser, db: DBSession) -> KetsoCap5Out:
    """Chốt phân loại 4 ô cho một lệnh (hybrid §4): user Đồng ý hoặc Sửa verdict
    hệ. Sửa khác verdict hệ thì BẮT BUỘC ghi ``ly_do_sua`` (422 nếu thiếu).

    ``verdict_he`` và ``o_4`` luôn được server tính lại — client không gửi lên.
    """
    svc = Cap5Service(db)
    return await svc.record_ketso(
        user.id,
        body.order_id,
        verdict_user=body.verdict_user,
        ly_do_sua=body.ly_do_sua,
    )


@router.post("/dung-ngoai", response_model=DungNgoaiOut)
async def log_dung_ngoai(
    body: DungNgoaiRequest, user: CurrentUser, db: DBSession
) -> DungNgoaiOut:
    """Ghi một quyết định "đứng ngoài có chủ đích" kèm giá hiện tại (giá do
    server tự lấy). Sau 5 phiên hệ sẽ chấm né đúng / né hụt / trung tính."""
    svc = Cap5Service(db)
    decision = await svc.log_dung_ngoai(user.id, body.symbol, body.reason)
    return DungNgoaiOut(**svc.decision_out(decision))


@router.get("/dung-ngoai", response_model=DungNgoaiListOut)
async def list_dung_ngoai(user: CurrentUser, db: DBSession) -> DungNgoaiListOut:
    """Nhật ký đứng ngoài + kết quả từng lần (chấm luôn các lần đã tới hạn)."""
    svc = Cap5Service(db)
    result = await svc.list_dung_ngoai(user.id)
    return DungNgoaiListOut(**result)


@router.post("/dung-ngoai/cham", response_model=ChamDungNgoaiOut)
async def cham_dung_ngoai(user: CurrentUser, db: DBSession) -> ChamDungNgoaiOut:
    """Chấm tất cả nước đứng ngoài đã đủ 5 phiên (idempotent — cùng routine mà
    các endpoint đọc tự chạy). Lần nào chưa có giá phiên đích thì để nguyên
    chưa chấm, không đoán."""
    svc = Cap5Service(db)
    result = await svc.cham_dung_ngoai(user.id)
    return ChamDungNgoaiOut(**result)


@router.get("/thach-thuc", response_model=ThachThucOut)
async def get_thach_thuc(user: CurrentUser, db: DBSession) -> ThachThucOut:
    """3 điều kiện của Thách thức Lão luyện (nhiệm vụ ③) kèm giá trị hiện tại
    + đạt/chưa đạt + giải thích (spec §2③/§C12c)."""
    svc = Cap5Service(db)
    result = await svc.thach_thuc(user.id)
    return ThachThucOut(**result)


@router.post("/graduate", response_model=Cap5ProgressOut)
async def graduate(user: CurrentUser, db: DBSession) -> Cap5ProgressOut:
    """Tốt nghiệp Cấp 5 — chỉ khi đủ 3/3 nhiệm vụ."""
    svc = Cap5Service(db)
    return await svc.graduate(user.id)
