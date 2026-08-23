"""Watchlist model — single favorites list per user.

Cấp 5 «Săn mã» nâng "Theo dõi" (Cấp 0) thành **Watchlist** (spec §6): mỗi mã
mang thêm nguồn săn (bộ lọc nào săn ra) + điểm đồng thuận 5 lớp + trạng thái
"Đang quan sát" / "★ Đáng chú ý". Tất cả cột mới đều **nullable**: một mã user
tự thêm tay (không qua săn) không có nguồn săn, và một mã hệ chưa chấm được 5
lớp thì KHÔNG có điểm đồng thuận — "chưa biết" phải ở lại NULL, không được rơi
về 0 (0/5 là một kết luận: "không lớp nào ủng hộ").
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class WatchlistItem(UUIDMixin, TimestampMixin, Base):
    """A single symbol in a user's watchlist (favorites)."""

    __tablename__ = "watchlist_items"
    __table_args__ = (
        UniqueConstraint("user_id", "symbol", name="uq_watchlist_items_user_symbol"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)

    # ── Cấp 5 additions (spec §6/§10) ────────────────────────────────
    # Nguồn săn — bộ lọc đã săn ra mã (1 trong ``HuntFilter``) + tín hiệu thô
    # lúc săn, do server ghi. NULL = mã này KHÔNG đến từ săn mã (user tự thêm,
    # hoặc đã có từ trước Cấp 5) — FE phải hiện "—", không được đoán bộ lọc.
    hunt_filter: Mapped[str | None] = mapped_column(String(16), nullable=True)
    hunt_signal: Mapped[str | None] = mapped_column(String(200), nullable=True)
    hunt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Điểm đồng thuận 5 lớp — số lớp ỦNG HỘ (0-5), chạy 1 lần/ngày sau phiên
    # (spec §6.1/§10, KHÔNG tức thời). ★ NULL = hệ CHƯA chấm được mã này (không
    # có bản AI Insight cho phiên đó, hoặc payload thiếu lớp) — tuyệt đối không
    # phải 0. ``consensus_prev`` nuôi dòng "2/5 → 4/5" của §6.2 và mang nghĩa
    # CHÍNH XÁC là **điểm KHÁC gần nhất trước đó**, không phải "điểm của lần
    # chấm liền trước": mẻ chấm chỉ ghi đè nó khi điểm thật sự đổi. Vì mockup vẽ
    # "2/5 → 4/5 (3 phiên)" — tức một bước chuyển đã xảy ra N phiên trước — nên
    # giữ điểm khác gần nhất mới nói được có chuyển động; nếu ghi đè mỗi ngày
    # thì một mã đứng yên sẽ mãi hiện "4/5 → 4/5" và bước chuyển biến mất.
    # ★ Đánh đổi phải biết: FE KHÔNG suy ra được bước chuyển xảy ra bao lâu rồi
    # (số phiên không có trên wire), nên nó chỉ được in "cải thiện/yếu đi", tuyệt
    # đối không kèm "(N phiên)". NULL khi chưa từng đổi điểm ⇒ FE không vẽ mũi
    # tên thay đổi.
    consensus_today: Mapped[int | None] = mapped_column(Integer, nullable=True)
    consensus_prev: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Số lớp hệ THỰC SỰ chấm được (0-5). ★ Bắt buộc phải có bên cạnh
    # ``consensus_today``: nguồn hiện tại không chấm được lớp 💎 Định giá cho
    # bất kỳ mã nào, nên "3/5 lớp ủng hộ" luôn kèm một lớp chưa biết. Thiếu cột
    # này thì FE không cách nào phân biệt "2 lớp ủng hộ, 3 lớp phản đối" với
    # "2 lớp ủng hộ, 2 lớp phản đối, 1 lớp chưa chấm được".
    consensus_da_cham: Mapped[int | None] = mapped_column(Integer, nullable=True)
    consensus_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # 'watching' / 'notable' (``WatchlistStatus``). NULL khi ``consensus_today``
    # NULL — trạng thái là KẾT LUẬN rút từ điểm đồng thuận, không có điểm thì
    # không có kết luận.
    status: Mapped[str | None] = mapped_column(String(16), nullable=True)
