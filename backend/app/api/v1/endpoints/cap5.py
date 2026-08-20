"""API Cấp 5 «Lão luyện — Săn mã» — progress/enter/task/tour, màn Săn mã
(5 bộ lọc + lọc sàn), Watchlist có điểm đồng thuận 5 lớp, nguồn săn cho Kết sổ,
Phân tích danh mục (khối ⑫/⑬), graduate.

Cấp 5 là FREE: mọi endpoint dùng ``CurrentUser`` (đã đăng nhập), KHÔNG dùng
``PremiumUser``.

★★ **ĐÃ GỠ cùng Cấp 5 cũ:** ``GET /cap5/verdict/{order_id}`` ·
``POST /cap5/ketso`` · ``POST|GET /cap5/dung-ngoai`` ·
``POST /cap5/dung-ngoai/cham`` · ``GET /cap5/thach-thuc``. Cấp 5 mới không có
bước phân loại 4 ô và không có nhật ký đứng ngoài (spec §11 đẩy sang Cấp 6+).
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DBSession
from app.schemas.cap5 import (
    AddWatchlistRequest,
    Cap5PhanTichOut,
    Cap5ProgressOut,
    Cap5WatchlistItemOut,
    Cap5WatchlistOut,
    HuntResultOut,
    NguonSanOut,
    SanMaIndexOut,
    TaskRequest,
)
from app.services.cap5.service import Cap5Service

router = APIRouter(prefix="/cap5", tags=["Cấp 5"])


@router.get("/progress", response_model=Cap5ProgressOut | None)
async def get_progress(user: CurrentUser, db: DBSession) -> Cap5ProgressOut | None:
    """Tiến trình Cấp 5 của user hiện tại (hoặc null nếu chưa vào cấp).

    Mọi con số được tính lại server-side ở đây; lần đọc đầu tiên trong ngày cũng
    chạy mẻ chấm điểm đồng thuận 5 lớp cho Watchlist (1 lần/ngày, spec §6.1).
    """
    svc = Cap5Service(db)
    result = await svc.get_progress(user.id)
    return Cap5ProgressOut(**result) if result is not None else None


@router.post("/enter", response_model=Cap5ProgressOut)
async def enter(user: CurrentUser, db: DBSession) -> Cap5ProgressOut:
    """Vào Cấp 5 (idempotent) — yêu cầu đã tốt nghiệp Cấp 4."""
    svc = Cap5Service(db)
    return Cap5ProgressOut(**await svc.enter(user.id))


@router.patch("/task", response_model=Cap5ProgressOut)
async def mark_task(body: TaskRequest, user: CurrentUser, db: DBSession) -> Cap5ProgressOut:
    """Cả 2 nhiệm vụ đều suy ra từ sổ săn mã + lệnh mua — endpoint này chỉ kích
    hoạt tính lại (idempotent, không tự đóng dấu nhiệm vụ nào)."""
    svc = Cap5Service(db)
    return Cap5ProgressOut(**await svc.mark_task(user.id, body.task_no))


@router.post("/tour-sanma", response_model=Cap5ProgressOut)
async def mark_tour_sanma(user: CurrentUser, db: DBSession) -> Cap5ProgressOut:
    """Đánh dấu ĐÃ ĐI HẾT 7 bước tour Săn mã (spec §7).

    Chỉ gọi ở bước cuối / nút "Xong" — "Bỏ qua" giữa chừng KHÔNG gọi. Cờ này
    quyết định tour có tự bật lại hay không; nó KHÔNG phải cổng tốt nghiệp.
    """
    svc = Cap5Service(db)
    return Cap5ProgressOut(**await svc.mark_tour_sanma(user.id))


# ── Màn Săn mã (§5) ───────────────────────────────────


@router.get("/san-ma", response_model=SanMaIndexOut)
async def san_ma_index(user: CurrentUser, db: DBSession) -> SanMaIndexOut:
    """Điều kiện lọc sàn + tình trạng khả dụng của 5 bộ lọc (§5.1/§5.2).

    Bộ lọc thiếu nguồn dữ liệu trả ``kha_dung=false`` kèm lý do nguyên văn — user
    thấy ngay trên màn thay vì bấm vào rồi nhận một popup rỗng.
    """
    svc = Cap5Service(db)
    return SanMaIndexOut(**await svc.san_ma_index(user.id))


@router.get("/san-ma/{bo_loc}", response_model=HuntResultOut)
async def san_ma_result(bo_loc: str, user: CurrentUser, db: DBSession) -> HuntResultOut:
    """Top 10 mã của một bộ lọc + dòng minh bạch (§5.3/§5.4).

    ★ ``kha_dung=false`` ⇒ ``tong_so_ma=null`` và ``items=[]``: chưa lọc được,
    KHÔNG phải "không có mã nào thoả".
    """
    svc = Cap5Service(db)
    return HuntResultOut(**await svc.san_ma_result(user.id, bo_loc))


# ── Watchlist (§6) ────────────────────────────────────


@router.get("/watchlist", response_model=Cap5WatchlistOut)
async def get_watchlist(user: CurrentUser, db: DBSession) -> Cap5WatchlistOut:
    """Watchlist + điểm đồng thuận 5 lớp + nguồn săn từng mã (§6.2).

    Mẻ chấm 5 lớp chạy tối đa 1 lần/ngày cho mỗi mã (spec §6.1 — không tức thời,
    không gọi AI: chỉ đọc lại bản AI Insight đã lưu).
    """
    svc = Cap5Service(db)
    return Cap5WatchlistOut(**await svc.watchlist(user.id))


@router.post("/watchlist", response_model=Cap5WatchlistItemOut, status_code=201)
async def add_to_watchlist(
    body: AddWatchlistRequest, user: CurrentUser, db: DBSession
) -> Cap5WatchlistItemOut:
    """Thêm mã vào Watchlist KÈM nguồn săn (§5.4 nút "+ Watchlist").

    ``hunt_signal`` client gửi lên bị BỎ QUA — server tự tính tín hiệu lúc săn.
    Mã đã có trong Watchlist thì được cập nhật nguồn săn (không 409).
    """
    svc = Cap5Service(db)
    result = await svc.add_watchlist(
        user.id, body.symbol, body.hunt_filter, hunt_signal=body.hunt_signal
    )
    return Cap5WatchlistItemOut(**result)


@router.delete("/watchlist/{symbol}", status_code=204)
async def remove_from_watchlist(symbol: str, user: CurrentUser, db: DBSession) -> None:
    """Bỏ một mã khỏi Watchlist. Sổ săn mã KHÔNG bị xoá theo — "số mã đã săn" là
    việc user đã làm, và nhiệm vụ đã đạt không được tụt lại."""
    svc = Cap5Service(db)
    await svc.remove_watchlist(user.id, symbol)


# ── Kết sổ + Phân tích danh mục (§8/§9) ───────────────


@router.get("/nguon-san/{symbol}", response_model=NguonSanOut)
async def get_nguon_san(symbol: str, user: CurrentUser, db: DBSession) -> NguonSanOut:
    """Dòng nguồn săn của một mã cho Kết sổ Cấp 5 (§8)."""
    svc = Cap5Service(db)
    return NguonSanOut(**await svc.nguon_san(user.id, symbol))


@router.get("/phan-tich", response_model=Cap5PhanTichOut)
async def get_phan_tich(user: CurrentUser, db: DBSession) -> Cap5PhanTichOut:
    """Khối ⑫ (bộ lọc nào ra mã thắng nhiều nhất) + khối ⑬ (phễu kỷ luật săn mã),
    đo bằng KẾT QUẢ THẬT của lệnh đã đóng (§9)."""
    svc = Cap5Service(db)
    return Cap5PhanTichOut(**await svc.phan_tich(user.id))


@router.post("/graduate", response_model=Cap5ProgressOut)
async def graduate(user: CurrentUser, db: DBSession) -> Cap5ProgressOut:
    """Tốt nghiệp Cấp 5 — chỉ khi đủ 2/2 nhiệm vụ."""
    svc = Cap5Service(db)
    return Cap5ProgressOut(**await svc.graduate(user.id))
