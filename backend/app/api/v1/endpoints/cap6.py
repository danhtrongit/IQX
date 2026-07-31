"""Cấp 6 «Đối chiếu» API — progress, enter, task, gợi ý trọng số theo kiểu cổ
phiếu (+ vì sao), bước Đối chiếu, thách thức đối chiếu, graduate.

Cấp 6 is FREE: all endpoints use ``CurrentUser`` (authenticated), NOT
``PremiumUser``.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DBSession
from app.schemas.cap6 import (
    Cap6ProgressOut,
    GoiYOut,
    KehoachCap6Out,
    KehoachRequest,
    TaskRequest,
    ThachThucOut,
)
from app.services.cap6.service import Cap6Service

router = APIRouter(prefix="/cap6", tags=["Cấp 6"])


@router.get("/progress", response_model=Cap6ProgressOut | None)
async def get_progress(user: CurrentUser, db: DBSession) -> Cap6ProgressOut | None:
    """Trả về tiến trình Cấp 6 của người dùng hiện tại (hoặc null nếu chưa vào)."""
    svc = Cap6Service(db)
    return await svc.get_progress(user.id)


@router.post("/enter", response_model=Cap6ProgressOut)
async def enter(user: CurrentUser, db: DBSession) -> Cap6ProgressOut:
    """Vào Cấp 6 (idempotent) — yêu cầu đã tốt nghiệp Cấp 5."""
    svc = Cap6Service(db)
    return await svc.enter(user.id)


@router.patch("/task", response_model=Cap6ProgressOut)
async def mark_task(body: TaskRequest, user: CurrentUser, db: DBSession) -> Cap6ProgressOut:
    """Cả 3 nhiệm vụ đều được suy ra từ order_kehoach / order_ketso — gọi
    endpoint này chỉ kích hoạt tính lại (idempotent, không tự đặt)."""
    svc = Cap6Service(db)
    return await svc.mark_task(user.id, body.task_no)


@router.get("/goi-y", response_model=GoiYOut)
async def get_goi_y(
    user: CurrentUser,
    db: DBSession,
    symbol: str = Query(description="Mã cổ phiếu"),
) -> GoiYOut:
    """Kiểu cổ phiếu của mã (hệ suy ra từ NGÀNH) + bảng trọng số GỢI Ý cho kiểu
    đó + câu "vì sao" (§C12c: FE hiện nguyên văn, không bao giờ gợi ý trơ).

    Ngành thiếu hoặc chưa map → ``kieu = null`` kèm ghi chú "chưa phân loại":
    bỏ qua gợi ý theo kiểu nhưng user VẪN chọn được lớp quyết định (spec §4/§10).

    ★ Đây là GỢI Ý để cân nhắc, KHÔNG phải luật — user được chọn lệch có lý do.
    """
    svc = Cap6Service(db)
    result = await svc.goi_y(user.id, symbol)
    return GoiYOut(**result)


@router.post("/kehoach", response_model=KehoachCap6Out)
async def record_kehoach(
    body: KehoachRequest, user: CurrentUser, db: DBSession
) -> KehoachCap6Out:
    """Ghi bước Đối chiếu vào kế hoạch của 1 lệnh MUA đã có (cộng dồn lên Cấp
    1-5, 404 nếu chưa có kế hoạch Cấp 1).

    ``ly_do_doi_chieu`` bắt buộc (422 nếu trống). ``trong_so_goi_y`` và
    ``khop_goi_y`` do SERVER tự suy ra từ bảng trọng số — client không gửi lên.
    ``kieu_co_phieu`` cũng do server suy từ ngành; giá trị client chỉ dùng khi
    server không xác định được ngành, và luôn được kiểm lại theo enum 6 kiểu.
    """
    svc = Cap6Service(db)
    kehoach = await svc.record_kehoach(
        user.id,
        body.order_id,
        lop_quyet_dinh=body.lop_quyet_dinh,
        ly_do_doi_chieu=body.ly_do_doi_chieu,
        kieu_co_phieu=body.kieu_co_phieu,
        lop_mau_thuan=body.lop_mau_thuan,
    )
    return KehoachCap6Out(**svc.kehoach_out(kehoach))


@router.get("/thach-thuc", response_model=ThachThucOut)
async def get_thach_thuc(user: CurrentUser, db: DBSession) -> ThachThucOut:
    """3 điều kiện của Thách thức Đối chiếu (nhiệm vụ ③) kèm giá trị hiện tại +
    đạt/chưa đạt + giải thích, và 2 nhóm khớp/lệch (spec §2③/§7/§C12c).

    Mỗi nhóm cần ≥3 lệnh đã đóng mới được so — dưới ngưỡng đó hệ báo "chưa đủ
    dữ liệu" chứ không kết luận trên 1-2 lệnh.
    """
    svc = Cap6Service(db)
    result = await svc.thach_thuc(user.id)
    return ThachThucOut(**result)


@router.post("/graduate", response_model=Cap6ProgressOut)
async def graduate(user: CurrentUser, db: DBSession) -> Cap6ProgressOut:
    """Tốt nghiệp Cấp 6 — chỉ khi đủ 3/3 nhiệm vụ."""
    svc = Cap6Service(db)
    return await svc.graduate(user.id)
