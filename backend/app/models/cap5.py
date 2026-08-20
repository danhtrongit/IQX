"""Cấp 5 «Lão luyện — Săn mã» models — chủ động đi săn mã bằng bộ lọc dữ liệu
thô, đưa vào Watchlist quan sát, chờ mã "chín" rồi mới vào lệnh.

Bài học một câu (spec §1): *"Không chờ mã đến — chủ động đi săn. Săn nhiều,
chọn kỹ, không mua vội."*

**Cấp 5 CŨ (phân loại 4 ô + đứng ngoài có chủ đích) ĐÃ NGHỈ HƯU.** Bảng
``standby_decision``, các enum ``Verdict``/``O4``/``LyDoDungNgoai``/
``KetQuaDungNgoai`` và 5 cột ``verdict_he``/``verdict_user``/
``verdict_provenance``/``o_4``/``ly_do_sua`` trên ``order_ketso`` bị bỏ hẳn ở
revision ``b2e6f4a17c93``. Lý do: bộ spec bàn giao đợt 6 định nghĩa lại toàn bộ
Cấp 5 thành «Săn mã»; "biết khi nào KHÔNG mua (kỷ luật đứng ngoài)" được đẩy
sang Cấp 6+ (spec §11).

★ **Bảng ``cap5_progress`` GIỮ NGUYÊN TÊN và cột ``graduated_at``** — chỉ các
cột nhiệm vụ bị thay. ``app.services.cap6.service`` gác cổng vào Cấp 6 trên
đúng ``cap5_progress.graduated_at``; đổi tên bảng sẽ khoá vĩnh viễn Cấp 6.

Cấp 5 thêm vào mô hình dữ liệu đúng ba thứ:

1. **``cap5_hunt_log`` (MỚI, dưới đây)** — sổ săn mã: mỗi (user, mã) đã từng
   được đưa vào Watchlist qua một bộ lọc. Là nguồn sự thật DUY NHẤT cho
   "số mã đã săn" (nhiệm vụ ①) và cho phễu kỷ luật săn (khối ⑬) — ★ nó tồn tại
   riêng khỏi ``watchlist_items`` vì user xoá mã khỏi Watchlist bất cứ lúc nào,
   mà một nhiệm vụ đã đạt thì KHÔNG được tụt lại.
2. **``watchlist_items`` += 7 cột Cấp 5** (nguồn săn + điểm đồng thuận 5 lớp +
   trạng thái) — xem ``app.models.watchlist``.
3. **``order_kehoach`` += ``from_watchlist``/``hunt_filter``** — phân biệt mã
   đến từ săn với mã user tự nhập (spec §10), nuôi nhiệm vụ ② và khối ⑫.

**Storage decision — dùng ``String`` chứ không dùng PG enum** cho
``hunt_filter``/``status``: y hệt lựa chọn của Cấp 4/Cấp 5 cũ — service validate
theo ``StrEnum`` dưới đây trước khi ghi, không có truy vấn nào lọc trên chúng
ngoài ``GROUP BY``, và PG enum thì mỗi lần thêm bộ lọc lại phải ALTER TYPE
(spec §5.5 hứa hẹn "Bộ lọc nâng cao" ở Cấp 6+).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class HuntFilter(enum.StrEnum):
    """5 bộ lọc săn mã (spec §5.3 + §10 — mã lưu xuống DB verbatim theo §10)."""

    NGOAI = "ngoai"
    TU_DOANH = "tudoanh"
    KL = "kl"
    DINH = "dinh"
    TANG = "tang"


#: Nhãn hiển thị — lấy verbatim từ mockup ``iqx-cap5-sanma.html``.
HUNT_FILTER_LABELS: dict[str, str] = {
    HuntFilter.NGOAI.value: "Khối ngoại gom",
    HuntFilter.TU_DOANH.value: "Tự doanh gom",
    HuntFilter.KL.value: "Khối lượng đột biến",
    HuntFilter.DINH.value: "Vượt đỉnh 20 phiên",
    HuntFilter.TANG.value: "Tăng mạnh + KL cao",
}


class WatchlistStatus(enum.StrEnum):
    """Trạng thái một mã trong Watchlist (spec §6.1).

    ★ KHÔNG có giá trị "chưa biết" ở đây: khi hệ chưa chấm được 5 lớp cho mã đó
    thì cột ``status`` để **NULL**, không rơi về ``WATCHING``. "Đang quan sát"
    là một kết luận ("<4 lớp ủng hộ"), không phải chỗ chứa dữ liệu thiếu.
    """

    WATCHING = "watching"
    NOTABLE = "notable"


class Cap5Progress(UUIDMixin, TimestampMixin, Base):
    """Per-user Cấp 5 «Săn mã» progress. One row per user.

    **2 nhiệm vụ SONG SONG, độc lập nhau** (mockup ``iqx-cap5-hanhtrinh.html``:
    "Hai nhiệm vụ làm song song", header ``0/2``):

      ① «Săn 10 mã vào Watchlist»  → ``so_ma_da_san >= 10``
      ② «Mua 5 mã từ Watchlist»    → ``so_ma_mua_tu_watchlist >= 5``

    ② KHÔNG phụ thuộc ①: mua đủ 5 mã săn trước khi săn đủ 10 mã thì ② đóng dấu
    trước — ``task_2_done_at`` không đợi ``task_1_done_at``.

    Hai con số đều được **tính lại server-side ở mọi lần đọc** từ
    ``cap5_hunt_log`` và ``order_kehoach``; client không bao giờ gửi lên. Chúng
    là ``NOT NULL DEFAULT 0`` vì 0 ở đây là số **thật** (đếm hàng trong bảng ta
    sở hữu), không phải "chưa biết".

    ``best_filter`` thì ngược lại — **nullable**, và NULL nghĩa là "chưa đủ dữ
    liệu để kết luận" (khối ⑫ cần ≥3 lệnh đã đóng cho một bộ lọc mới dám xếp
    hạng). Không bao giờ được hiển thị thành một bộ lọc bất kỳ.
    """

    __tablename__ = "cap5_progress"
    __table_args__ = (UniqueConstraint("user_id", name="uq_cap5_progress_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # 2 nhiệm vụ completion timestamps (nullable until done, never un-set)
    task_1_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_2_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Recomputed metrics — nguồn sự thật = cap5_hunt_log / order_kehoach.
    so_ma_da_san: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    so_ma_mua_tu_watchlist: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    # Cờ tour Săn mã (§7). KHÔNG phải nhiệm vụ — hình dạng LIVE của Hành trình
    # chỉ có 2 nhiệm vụ đếm được ở trên; cờ này chỉ để tour tự bật đúng một lần.
    # "Bỏ qua" giữa chừng KHÔNG được set cờ (xem service).
    da_xem_tour_sanma: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # Bộ lọc "hợp với bạn nhất" (khối ⑫). NULL = chưa đủ lệnh để kết luận.
    best_filter: Mapped[str | None] = mapped_column(String(16), nullable=True)

    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_to_graduate_hours: Mapped[float | None] = mapped_column(Float, nullable=True)


class Cap5HuntLog(UUIDMixin, TimestampMixin, Base):
    """Sổ săn mã — một hàng cho mỗi (user, mã) đã từng săn được vào Watchlist.

    ★ **Vì sao không đếm thẳng trên ``watchlist_items``:** user xoá mã khỏi
    Watchlist bất cứ lúc nào (và Watchlist có trần 50 mã). Nếu "số mã đã săn"
    đếm hàng còn sống thì một nhiệm vụ đã đạt sẽ tụt lại sau một cú xoá — và
    ``task_1_done_at`` (không bao giờ un-set) sẽ mâu thuẫn với con số hiển thị.
    Sổ này chỉ ghi thêm, không xoá theo Watchlist.

    Unique theo (user_id, symbol): săn lại cùng một mã từ bộ lọc khác KHÔNG làm
    "số mã đã săn" tăng thêm — nhiệm vụ ① đo **độ rộng** ("quét đủ rộng"), nên
    nó phải đếm mã phân biệt. Lần săn sau cập nhật ``hunt_filter``/
    ``hunt_signal``/``last_hunted_at``, giữ nguyên ``first_hunted_at``.

    ``hunt_signal`` là tín hiệu thô **do server tính lúc săn** (VD "+45,2 tỷ
    ròng · 4/5 phiên"), không nhận từ client — client chỉ gửi mã + bộ lọc.
    Nullable vì có bộ lọc chưa đủ dữ liệu để mô tả tín hiệu (xem
    ``app.services.cap5.hunt``): thà để trống còn hơn bịa một dòng số.
    """

    __tablename__ = "cap5_hunt_log"
    __table_args__ = (
        UniqueConstraint("user_id", "symbol", name="uq_cap5_hunt_log_user_symbol"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    # One of ``HuntFilter`` — validated in the service (see module docstring).
    hunt_filter: Mapped[str] = mapped_column(String(16), nullable=False)
    hunt_signal: Mapped[str | None] = mapped_column(String(200), nullable=True)
    first_hunted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_hunted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
