"""Cấp 8 «Quản trị rủi ro danh mục» API — progress, enter, task, bước Kiểm tra
danh mục (dồn ngành · tương quan · tổng vốn ở rủi ro), ghi khối Cấp 8 lên
``order_kehoach``, thách thức quản trị rủi ro danh mục, graduate.

Cấp 8 is FREE: all endpoints use ``CurrentUser`` (authenticated), NOT
``PremiumUser``. It is the LAST level of the current program — its graduation
closes the 0-8 arc and there is no next level to enter.

★ NOTHING here can refuse a buy (spec §9, §C8). ``GET /cap8/kiem-tra`` is a pure
READ, and ``POST /cap8/kehoach`` runs AFTER the order already exists. The FE
degrades OPEN if the check fails: a failed check must never trap the user.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DBSession
from app.schemas.cap8 import (
    Cap8ProgressOut,
    KehoachCap8Out,
    KehoachRequest,
    KiemTraOut,
    TaskRequest,
    ThachThucOut,
)
from app.services.cap8.service import Cap8Service

router = APIRouter(prefix="/cap8", tags=["Cấp 8"])


@router.get("/progress", response_model=Cap8ProgressOut | None)
async def get_progress(user: CurrentUser, db: DBSession) -> Cap8ProgressOut | None:
    """Trả về tiến trình Cấp 8 của người dùng hiện tại (hoặc null nếu chưa vào).

    Kèm ``bat_chap_gan_day`` (cửa sổ trượt của điều kiện ②) BÊN CẠNH
    ``so_lan_mua_bat_chap_canh_bao`` (cả đời) — hai con số khác nghĩa nên phải
    cùng hiện ra, không được lẫn vào nhau.

    Cố ý KHÔNG định giá lại danh mục (mỗi vị thế là một lần lấy giá, và panel
    gọi endpoint này mỗi lần mount): ``don_nganh_max_pct`` / ``tong_rui_ro_pct``
    giữ ảnh chụp gần nhất của ``/kiem-tra`` hoặc ``/thach-thuc``, và là NULL
    cho tới lúc đó — NULL nghĩa là "chưa tính được", không phải 0.
    """
    svc = Cap8Service(db)
    result = await svc.get_progress(user.id)
    return Cap8ProgressOut(**result) if result is not None else None


@router.post("/enter", response_model=Cap8ProgressOut)
async def enter(user: CurrentUser, db: DBSession) -> Cap8ProgressOut:
    """Vào Cấp 8 (idempotent) — yêu cầu đã tốt nghiệp Cấp 7."""
    svc = Cap8Service(db)
    return Cap8ProgressOut(**await svc.enter(user.id))


@router.patch("/task", response_model=Cap8ProgressOut)
async def mark_task(
    body: TaskRequest, user: CurrentUser, db: DBSession
) -> Cap8ProgressOut:
    """Cả 3 nhiệm vụ đều được suy ra từ order_kehoach / order_ketso + danh mục
    thật — gọi endpoint này chỉ kích hoạt tính lại (idempotent, không bao giờ
    tự đặt một nhiệm vụ mà lịch sử không đỡ)."""
    svc = Cap8Service(db)
    return Cap8ProgressOut(**await svc.mark_task(user.id, body.task_no))


@router.get("/kiem-tra", response_model=KiemTraOut)
async def get_kiem_tra(
    user: CurrentUser,
    db: DBSession,
    symbol: str = Query(description="Mã cổ phiếu định mua"),
    khoi_luong: int = Query(gt=0, description="Khối lượng định mua"),
    gia: int = Query(gt=0, description="Giá định mua (đồng)"),
    cat_lo: int | None = Query(
        default=None,
        description=(
            "Cắt lỗ của chính lệnh này (Cấp 2). Thiếu ⇒ phần đóng góp của lệnh "
            "vào tổng vốn ở rủi ro là CHƯA BIẾT, không phải 0"
        ),
    ),
) -> KiemTraOut:
    """Bước "Kiểm tra danh mục" trước xác nhận MUA — cả 3 thước đo trong MỘT
    response (spec §4): dồn ngành sau lệnh · tương quan với vị thế đang giữ ·
    tổng vốn ở rủi ro nếu mọi cắt lỗ bị chạm, so với trần khẩu vị Cấp 3.

    Mỗi thước đo kèm ``giai_thich`` riêng bằng tiếng Việt (§C12c) — FE hiện
    NGUYÊN VĂN và không tự đặt câu chữ nào. Thước đo nào không tính được thì trả
    về trạng thái "chưa tính được" kèm lý do, KHÔNG BAO GIỜ trả về số 0 bịa ra:

    · không xác định được ngành → ``nganh = null``;
    · <2 mã, không có vị thế đáng kể, hoặc chưa đủ phiên lịch sử →
      ``tuong_quan_du_lieu = false`` (KHÔNG phải "hệ số 0");
    · lệnh chưa có cắt lỗ → ``tong_rui_ro_pct_sau = null``;
    · vị thế thiếu cắt lỗ / thiếu giá → bị LOẠI khỏi tổng và đếm riêng ở
      ``so_vi_the_thieu_cat_lo`` / ``so_vi_the_thieu_gia``.

    ★ Đây là một lệnh ĐỌC và là CẢNH BÁO MỀM: nó không bao giờ chặn nút MUA
    (spec §9, §C8). Cả ba lựa chọn Vẫn mua / Giảm khối lượng / Chọn mã khác đều
    hợp lệ như nhau, dù response trả về gì.
    """
    svc = Cap8Service(db)
    result = await svc.kiem_tra(user.id, symbol, khoi_luong, gia, cat_lo=cat_lo)
    return KiemTraOut(**result)


@router.post("/kehoach", response_model=KehoachCap8Out)
async def record_kehoach(
    body: KehoachRequest, user: CurrentUser, db: DBSession
) -> KehoachCap8Out:
    """Ghi khối Kiểm tra danh mục vào kế hoạch của 1 lệnh MUA đã có (cộng dồn
    lên Cấp 1-7, 404 nếu chưa có kế hoạch Cấp 1).

    ★ SERVER TỰ SUY LẠI. ``don_nganh_pct`` / ``tuong_quan_cao_voi`` /
    ``tong_rui_ro_pct`` / ``danh_muc_canh_bao`` trong body được nhận cho tương
    thích với payload FE vừa hiện, rồi BỊ BỎ: server tính lại cả bốn từ danh mục
    thật và lưu số của chính nó. Nếu không, client chỉ cần gửi
    ``danh_muc_canh_bao = []`` là giữ ô "mua bất chấp cảnh báo" sạch mãi mãi.

    ``hanh_vi_canh_bao`` thì LẤY TỪ CLIENT — chỉ user biết mình bấm nút nào —
    nhưng phải khớp với thứ thật sự bật: ``khong_canh_bao`` trong khi CÓ cảnh
    báo (hoặc ngược lại) là mâu thuẫn và bị từ chối 400, không tự sửa im lặng.
    """
    svc = Cap8Service(db)
    kehoach = await svc.record_kehoach(
        user.id,
        body.order_id,
        hanh_vi_canh_bao=body.hanh_vi_canh_bao,
        don_nganh_pct=body.don_nganh_pct,
        tuong_quan_cao_voi=body.tuong_quan_cao_voi,
        tong_rui_ro_pct=body.tong_rui_ro_pct,
        danh_muc_canh_bao=body.danh_muc_canh_bao,
    )
    return KehoachCap8Out(**svc.kehoach_out(kehoach))


@router.get("/thach-thuc", response_model=ThachThucOut)
async def get_thach_thuc(user: CurrentUser, db: DBSession) -> ThachThucOut:
    """3 điều kiện của Thách thức Quản trị rủi ro danh mục (nhiệm vụ ③) kèm giá
    trị hiện tại + đạt/chưa đạt + giải thích (spec §2③/§7/§C12c), cộng khối
    ``danh_muc`` mà khối ⑱ «Bản đồ rủi ro danh mục» hiện.

    ★ Điều kiện ② là CỬA SỔ TRƯỢT — "≤ 2 lần mua bất chấp cảnh báo trong 15 lệnh
    gần nhất", không phải tổng cả đời: một giai đoạn cũ không theo user mãi.
    Con số cả đời vẫn được báo bên cạnh, để cửa sổ không thành cái tẩy.

    ★ Điều kiện ③ nêu rõ "{N} vị thế chưa có cắt lỗ" khi có — user không bao giờ
    được báo là danh mục trong ngưỡng nhờ những vị thế mà rủi ro CHƯA BIẾT. Chưa
    định giá được danh mục, hoặc chưa đặt khẩu vị ở Cấp 3, thì
    ``du_du_lieu = false``: không tính là đạt, cũng không tính ngược lại.
    """
    svc = Cap8Service(db)
    return ThachThucOut(**await svc.thach_thuc(user.id))


@router.post("/graduate", response_model=Cap8ProgressOut)
async def graduate(user: CurrentUser, db: DBSession) -> Cap8ProgressOut:
    """Tốt nghiệp Cấp 8 — chỉ khi đủ 3/3 nhiệm vụ.

    ★ Đây là cấp CUỐI của chương trình hiện tại: không có cấp sau để vào, màn
    tốt nghiệp mở tab Hành trình (rail huy hiệu 0-8) thay cho nút "vào cấp sau".
    """
    svc = Cap8Service(db)
    return Cap8ProgressOut(**await svc.graduate(user.id))
