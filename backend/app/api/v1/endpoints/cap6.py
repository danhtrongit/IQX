"""Cấp 6 «Bậc thầy» API — bảng mâu thuẫn 5 lớp, ô nhận định 4 mức, nút «Không
mua lần này», khối ⑭/⑮ của Phân tích danh mục, tour Xử lý mâu thuẫn, graduate.

Cấp 6 là FREE: mọi endpoint dùng ``CurrentUser`` (đã đăng nhập), KHÔNG dùng
``PremiumUser``.

★★ **ĐÃ GỠ cùng Cấp 6 cũ («Đối chiếu»):** ``GET /cap6/goi-y`` ·
``PATCH /cap6/task`` · ``GET /cap6/thach-thuc``. Cấp 6 mới không có bảng trọng
số theo kiểu cổ phiếu, không có 3 nhiệm vụ, không có Thách thức Đối chiếu — chỉ
MỘT nhiệm vụ thuần hành vi (spec §2), và nó được suy ra từ ``order_kehoach`` +
``cap6_skip`` ở mọi lần đọc nên không có gì để "đánh dấu".

★ **Client chỉ gửi lên đúng MỘT thứ: ``conflict_level``** — nhận định của chính
user. ``had_conflict``/``had_veto``/``veto_layers`` do SERVER suy lại từ AI
Insight của mã; chúng nuôi thẳng cổng tốt nghiệp nên client khai được chúng là
client tự cấp cho mình điều kiện lên cấp (bài học ``hunt_signal`` của Cấp 5).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, DBSession
from app.schemas.cap6 import (
    Cap6ProgressOut,
    KehoachCap6Out,
    KehoachRequest,
    MauThuanOut,
    PhanTichOut,
    SkipOut,
    SkipRequest,
)
from app.services.cap6.service import Cap6Service

router = APIRouter(prefix="/cap6", tags=["Cấp 6"])


@router.get("/progress", response_model=Cap6ProgressOut | None)
async def get_progress(user: CurrentUser, db: DBSession) -> Cap6ProgressOut | None:
    """Tiến trình Cấp 6 của user hiện tại (hoặc null nếu chưa vào cấp).

    Bộ đếm hành vi được tính lại server-side từ ``order_kehoach`` +
    ``cap6_skip``. Chỉ ``so_lan_xu_ly_nhat_quan`` với mục tiêu 3 là cổng; thống
    kê veto chỉ để phân tích. ``tong_lai_lenh_cap6_pct = null`` nghĩa là CHƯA có
    lệnh Cấp-6 nào đóng — KHÔNG phải "hoà vốn 0%"; nó chỉ để hiển thị và không
    bao giờ là cổng lên cấp (spec §2).
    """
    svc = Cap6Service(db)
    result = await svc.get_progress(user.id)
    return Cap6ProgressOut(**result) if result is not None else None


@router.post("/enter", response_model=Cap6ProgressOut)
async def enter(user: CurrentUser, db: DBSession) -> Cap6ProgressOut:
    """Vào Cấp 6 (idempotent) — yêu cầu đã tốt nghiệp Cấp 5.

    Tính lại toàn bộ chỉ số trước khi trả về (giống ``/cap7/enter`` và
    ``/cap8/enter``): endpoint này idempotent và FE hiện đúng thứ nó trả, nên
    user quay lại không được thấy số cũ cho tới lần gọi ``/cap6/progress`` sau.
    """
    svc = Cap6Service(db)
    return Cap6ProgressOut(**await svc.enter(user.id))


@router.post("/tour-mauthuan", response_model=Cap6ProgressOut)
async def mark_tour_mauthuan(user: CurrentUser, db: DBSession) -> Cap6ProgressOut:
    """Đánh dấu ĐÃ ĐI HẾT 7 bước tour «Xử lý mâu thuẫn» (spec §10).

    Chỉ gọi ở bước cuối / nút "Xong" — "Bỏ qua" giữa chừng KHÔNG gọi. Cờ này
    quyết định tour có tự bật lại hay không; nó KHÔNG phải cổng tốt nghiệp
    (spec §11: "tour là công cụ học"), nên gian lận ở đây cũng không mở Cấp 7.
    """
    svc = Cap6Service(db)
    return Cap6ProgressOut(**await svc.mark_tour_mauthuan(user.id))


# ── Bảng mâu thuẫn (§5) ───────────────────────────────


@router.get("/mau-thuan/{symbol}", response_model=MauThuanOut)
async def get_mau_thuan(symbol: str, user: CurrentUser, db: DBSession) -> MauThuanOut:
    """Bảng mâu thuẫn 2 phe của một mã — đọc lại bản AI Insight đã lưu, KHÔNG
    gọi AI (spec §11: "KHÔNG chạy cho mã user chưa từng xem").

    ★ ``chua_du_du_lieu = true`` là một TRẠNG THÁI THẬT (mã chưa có bản phân
    tích còn hiệu lực) kèm ``ly_do_chua_du`` nguyên văn — KHÔNG phải "0 mâu
    thuẫn"; FE phải hiện lý do thay vì dựng một bảng trống.

    ★ ``canh_bao`` do SERVER dựng câu, FE in NGUYÊN VĂN. Nó MÔ TẢ mâu thuẫn và
    không bao giờ phán mua/không mua (spec §4.1/§13).
    """
    svc = Cap6Service(db)
    return MauThuanOut(**await svc.mau_thuan(user.id, symbol))


# ── Ô nhận định (§6) + nút «Không mua lần này» (§7) ────


@router.post("/kehoach", response_model=KehoachCap6Out)
async def record_kehoach(
    body: KehoachRequest, user: CurrentUser, db: DBSession
) -> KehoachCap6Out:
    """Ghi mức nhận định mâu thuẫn vào kế hoạch của 1 lệnh MUA đã có (cộng dồn
    lên Cấp 1-5; 404 nếu chưa có kế hoạch Cấp 1).

    ``had_conflict``/``had_veto``/``veto_layers`` do SERVER suy lại từ AI
    Insight của mã — client KHÔNG gửi lên.

    ★ Nhận định bị CHỐT tại thời điểm khớp lệnh: lệnh đã khớp quá cửa sổ cho
    phép thì mọi lần ghi bị từ chối 409, **kể cả lần ghi ĐẦU TIÊN**. Ghi sau
    khi đã nhìn giá chạy vừa bịa một lần "xử lý nhất quán" cho cổng lên cấp,
    vừa bơm khối ⑮. POST y hệt lần trước luôn là no-op idempotent.
    """
    svc = Cap6Service(db)
    kehoach = await svc.record_kehoach(
        user.id, body.order_id, conflict_level=body.conflict_level
    )
    return KehoachCap6Out(**svc.kehoach_out(kehoach))


@router.get("/kehoach/{order_id}", response_model=KehoachCap6Out)
async def get_kehoach(
    order_id: uuid.UUID, user: CurrentUser, db: DBSession
) -> KehoachCap6Out:
    """Khối Cấp 6 ĐÃ GHI trên 1 lệnh — cho màn Kết sổ (spec §8) đọc lại nhận
    định cạnh hành động thật (khối lượng + tự tin, KHÔNG nhắc cắt lỗ — §4.3).

    Mọi thứ đọc từ cột đã lưu: không tính lại, không ghi đè. 404 nếu lệnh không
    tồn tại, là lệnh của người khác, hoặc chưa có kế hoạch Cấp 1 nào.
    """
    svc = Cap6Service(db)
    return KehoachCap6Out(**await svc.get_kehoach(user.id, order_id))


@router.post("/skip", response_model=SkipOut, status_code=201)
async def skip(body: SkipRequest, user: CurrentUser, db: DBSession) -> SkipOut:
    """Nút «Không mua lần này» — ghi nhận quyết định đứng ngoài (spec §7).

    Lấy mức nhận định đã chọn LÀM LÝ DO (không hỏi thêm). ★ Cách nhẹ: chỉ ghi
    nhận, KHÔNG theo dõi giá mã sau đó (spec §7/§13 — tránh phức tạp và tránh
    dạy tiếc nuối). Mỗi lần bấm là một hàng: đứng ngoài cùng một mã ở hai phiên
    là HAI quyết định.
    """
    svc = Cap6Service(db)
    return SkipOut(**await svc.skip(user.id, body.symbol, conflict_level=body.conflict_level))


# ── Phân tích danh mục: khối ⑭ + ⑮ (§9) ───────────────


@router.get("/phan-tich", response_model=PhanTichOut)
async def phan_tich(user: CurrentUser, db: DBSession) -> PhanTichOut:
    """Khối ⑭ (nhận định vs khối lượng) + khối ⑮ (kết quả theo nhận định + số
    lần đứng ngoài) của Phân tích danh mục.

    ★ Khối ⑭ CHỈ soi khối lượng, KHÔNG soi cắt lỗ (spec §4.3: cắt lỗ chỉ là
    chọn cách tính, không phản ánh mức thận trọng).
    ★ Khối ⑮ cần ≥ ``so_lenh_toi_thieu`` lệnh đã đóng ở một mức mới dám nói tỷ
    lệ thắng; dưới ngưỡng trả ``null`` + ``du_mau=false``, KHÔNG phải 0%.
    """
    svc = Cap6Service(db)
    return PhanTichOut(**await svc.phan_tich(user.id))


@router.post("/graduate", response_model=Cap6ProgressOut)
async def graduate(user: CurrentUser, db: DBSession) -> Cap6ProgressOut:
    """Tốt nghiệp Cấp 6 — 1/1 nhiệm vụ, THUẦN HÀNH VI (spec §2/§3).

    ★ Cần đúng ba lần xử lý mâu thuẫn nhất quán; không có điều kiện lãi hay
    số lần gặp lớp phủ quyết.
    """
    svc = Cap6Service(db)
    return Cap6ProgressOut(**await svc.graduate(user.id))
