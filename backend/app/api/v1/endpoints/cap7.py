"""Cấp 7 «Đọc sổ lệnh» API — progress, enter, task, giờ giao dịch + hằng số của
chỉ số Lực, bước đọc lực, đọc lại đọc lực của 1 lệnh (Kết sổ), chấm đọc lực,
thách thức đọc sổ lệnh, graduate.

Cấp 7 is FREE: all endpoints use ``CurrentUser`` (authenticated), NOT
``PremiumUser``.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, DBSession
from app.schemas.cap7 import (
    Cap7ProgressOut,
    ChamOut,
    KehoachCap7DetailOut,
    KehoachCap7Out,
    KehoachRequest,
    PhienOut,
    TaskRequest,
    ThachThucOut,
)
from app.services.cap7.service import Cap7Service

router = APIRouter(prefix="/cap7", tags=["Cấp 7"])


@router.get("/progress", response_model=Cap7ProgressOut | None)
async def get_progress(user: CurrentUser, db: DBSession) -> Cap7ProgressOut | None:
    """Trả về tiến trình Cấp 7 của người dùng hiện tại (hoặc null nếu chưa vào).

    Kèm ``trong_phien`` lấy từ ĐỒNG HỒ SERVER và ``so_lenh_da_cham`` /
    ``so_lenh_chua_cham`` — tỷ lệ đọc lực đúng chỉ tính trên các lệnh ĐÃ CHẤM,
    nên số lệnh chưa chấm phải hiện ra cùng nó.
    """
    svc = Cap7Service(db)
    result = await svc.get_progress(user.id)
    return Cap7ProgressOut(**result) if result is not None else None


@router.post("/enter", response_model=Cap7ProgressOut)
async def enter(user: CurrentUser, db: DBSession) -> Cap7ProgressOut:
    """Vào Cấp 7 (idempotent) — yêu cầu đã tốt nghiệp Cấp 6."""
    svc = Cap7Service(db)
    return Cap7ProgressOut(**await svc.enter(user.id))


@router.patch("/task", response_model=Cap7ProgressOut)
async def mark_task(
    body: TaskRequest, user: CurrentUser, db: DBSession
) -> Cap7ProgressOut:
    """Cả 3 nhiệm vụ đều được suy ra từ order_kehoach / order_ketso — gọi
    endpoint này chỉ kích hoạt tính lại (idempotent, không tự đặt)."""
    svc = Cap7Service(db)
    return Cap7ProgressOut(**await svc.mark_task(user.id, body.task_no))


@router.get("/phien", response_model=PhienOut)
async def get_phien(user: CurrentUser, db: DBSession) -> PhienOut:
    """Đang trong giờ giao dịch hay không (theo ĐỒNG HỒ SERVER) + toàn bộ hằng
    số của khối đọc sổ lệnh.

    Rẻ và gọi lại được: panel có thể mở xuyên qua mốc 11:30, nên ``trong_phien``
    phải làm mới được độc lập với ``/cap7/progress``. FE KHÔNG được tự tính giờ
    mở cửa từ đồng hồ trình duyệt (user ở múi giờ khác sẽ ra sai).

    ``quy_tac`` là nguồn duy nhất cho ngưỡng band Lực, hệ số cờ cảnh giác, số
    phiên chấm và dead band — FE hiện đúng các con số này, không tự đặt ngưỡng.
    """
    svc = Cap7Service(db)
    return PhienOut(**await svc.phien(user.id))


@router.post("/kehoach", response_model=KehoachCap7Out)
async def record_kehoach(
    body: KehoachRequest, user: CurrentUser, db: DBSession
) -> KehoachCap7Out:
    """Ghi bước đọc lực vào kế hoạch của 1 lệnh MUA đã có (cộng dồn lên Cấp 1-6,
    404 nếu chưa có kế hoạch Cấp 1).

    ``luc_chi_so`` phải hữu hạn và > 0; ``hanh_vi_co`` bắt buộc KHI VÀ CHỈ KHI
    ``co_canh_giac_lenh_gia`` là true (tổ hợp lệch bị từ chối 400, hệ không tự
    sửa). Sau khi qua hạn chấm, sửa lại phần đã đọc sẽ bị 409 — chỉ số Lực và
    phần user đọc phải được chốt TRƯỚC khi biết giá đi đâu.
    """
    svc = Cap7Service(db)
    kehoach = await svc.record_kehoach(
        user.id,
        body.order_id,
        luc_chi_so=body.luc_chi_so,
        luc_doc_user=body.luc_doc_user,
        co_canh_giac_lenh_gia=body.co_canh_giac_lenh_gia,
        hanh_vi_co=body.hanh_vi_co,
    )
    return KehoachCap7Out(**svc.kehoach_out(kehoach))


@router.get("/kehoach/{order_id}", response_model=KehoachCap7DetailOut)
async def get_kehoach(
    order_id: uuid.UUID, user: CurrentUser, db: DBSession
) -> KehoachCap7DetailOut:
    """Bước đọc lực ĐÃ GHI trên 1 lệnh — cho màn Kết sổ đọc lại, kèm số phiên
    chấm, dead band, ngày tới hạn chấm và diễn biến giá nếu đã chấm.

    ★ Lượt đọc này CHẠY LUÔN vòng chấm lười (đúng vòng mà ``/cap7/progress`` và
    ``/cap7/cham`` chạy), nên mở Kết sổ sau khi qua hạn sẽ thấy kết quả ĐÃ CHẤM.
    Không có endpoint này thì khối Cấp 7 trong Kết sổ mãi mãi báo "chưa tới hạn
    chấm".

    ★ ``doc_luc_dung`` giữ nguyên 3 trạng thái: true (đọc đúng) · false (đọc
    sai) · null (chưa chấm — chưa tới hạn hoặc chưa lấy được giá phiên đó).
    ``null`` KHÔNG bao giờ được hiểu thành "sai"; ``da_toi_han_cham`` để phân
    biệt hai kiểu null.

    404 nếu lệnh không tồn tại HOẶC là lệnh của người khác (không phải 403).
    Lệnh chưa có dữ liệu Cấp 7 vẫn trả 200 kèm ``co_du_lieu = false``.
    """
    svc = Cap7Service(db)
    return KehoachCap7DetailOut(**await svc.get_kehoach(user.id, order_id))


@router.post("/cham", response_model=ChamOut)
async def cham(user: CurrentUser, db: DBSession) -> ChamOut:
    """Chấm "đọc lực đúng" cho các lệnh đã tới hạn (idempotent).

    Mọi lần đọc progress cũng chạy đúng vòng chấm này — endpoint chỉ để gọi
    tường minh. Lệnh chưa lấy được giá phiên chấm được để TRỐNG (không đoán,
    không tính là đọc sai) và sẽ chấm lại ở lần sau.
    """
    svc = Cap7Service(db)
    return ChamOut(**await svc.cham(user.id))


@router.get("/thach-thuc", response_model=ThachThucOut)
async def get_thach_thuc(user: CurrentUser, db: DBSession) -> ThachThucOut:
    """3 điều kiện của Thách thức Đọc sổ lệnh (nhiệm vụ ③) kèm giá trị hiện tại
    + đạt/chưa đạt + giải thích (spec §2③/§7/§C12c).

    Dưới 3 lệnh đọc lực ĐÃ CHẤM thì vế tỷ lệ báo "chưa đủ dữ liệu": không tính
    là đạt, cũng không tính ngược lại cho user.
    """
    svc = Cap7Service(db)
    return ThachThucOut(**await svc.thach_thuc(user.id))


@router.post("/graduate", response_model=Cap7ProgressOut)
async def graduate(user: CurrentUser, db: DBSession) -> Cap7ProgressOut:
    """Tốt nghiệp Cấp 7 — chỉ khi đủ 3/3 nhiệm vụ."""
    svc = Cap7Service(db)
    return Cap7ProgressOut(**await svc.graduate(user.id))
