"""Cấp 4 «Thuần thục» models — progression (đọc + tự chấm cả 5 lớp, vũ khí /
điểm mù đo bằng KẾT QUẢ THẬT).

Cấp 4 builds on a graduated Cấp 3: FREE, Thực chiến-only mode. Like Cấp 2/3 it
adds no new order-level tables of its own — the "đọc 5 lớp" block is recorded
as new columns on Cấp 1's ``order_kehoach`` (``doc_5_lop`` / ``ai_5_lop`` /
``so_lop_dong_thuan`` / ``so_lop_khac_ai``, see the "Cấp 4 additions" column
block on ``app.models.cap1.OrderKehoach``). This module only owns the new
``cap4_progress`` table: 3 nhiệm vụ timestamps + the recomputed "Thách thức
Thuần thục" metrics. See ``~/Downloads/DEMO TRADING/LEVEL 4/IQX-Cap4-Spec.md``
§2/§7/§8 for the verbatim data model this mirrors.

**The 5 lớp reuse Cấp 1's keys.** Spec §5.1's five layers (L1 Kỹ thuật ·
L3 Dòng tiền · L4 Nội bộ · L5 Tin tức · Định giá) are exactly Cấp 1's five
``LyDo`` values (``ky_thuat``/``dong_tien``/``noi_bo``/``tin_tuc``/
``dinh_gia``) — Cấp 4 replaces "pick 1 of 5 lý do" with "rate all 5 lớp", so
the vocabulary is deliberately identical (``LOP_KEYS`` below is derived from
``LyDo`` rather than re-declared, so the two can never drift).

**Storage decision — the two ratings blobs are JSON, not new enum columns.**
``doc_5_lop``/``ai_5_lop`` are per-lớp maps (5 keys × 3 levels) that the FE
reads and writes as a whole; modelling them as 10 separate enum columns would
add 10 columns + 1 PG enum type for zero query benefit (nothing filters on a
single lớp in SQL — the per-lớp win rates are computed in Python over the
user's own, small, order history). Ratings are validated in the service layer
against ``NhanDinhLop`` before they are persisted, so the JSON is never free-form.

**Storage decision — ``vu_khi_lop``/``diem_mu_lop`` are plain strings.** They
hold a lớp key (or NULL when there isn't enough data yet — spec §8: cần ≥3
lệnh/lớp). A PG enum would buy nothing here: the value is derived, rewritten on
every recompute, and already constrained to ``LOP_KEYS`` by the service.

**CRITICAL PRINCIPLE (spec §4/§9):** ``so_lop_khac_ai`` is a NEUTRAL count of
"góc nhìn khác AI" — it is stored and displayed, but NOTHING in Cấp 4 scores
the user đúng/sai against AI. Reading quality is measured only by real market
outcomes (``order_ketso.pnl_pct``).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin
from app.models.cap1 import LyDo

# The 5 lớp of Cấp 4 == Cấp 1's 5 lý do keys (see module docstring).
LOP_KEYS: tuple[str, ...] = tuple(m.value for m in LyDo)

LOP_LABELS: dict[str, str] = {
    LyDo.KY_THUAT.value: "Kỹ thuật",
    LyDo.DONG_TIEN.value: "Dòng tiền",
    LyDo.NOI_BO.value: "Nội bộ",
    LyDo.TIN_TUC.value: "Tin tức",
    LyDo.DINH_GIA.value: "Định giá",
}


class NhanDinhLop(enum.StrEnum):
    """3 mức tự chấm mỗi lớp (spec §5.1/§8) — also the 3 levels AI's real
    5-bậc verdict is reduced to for the đối chiếu (spec §5.3).

    Stored as JSON values inside ``OrderKehoach.doc_5_lop``/``ai_5_lop``, not
    as a DB enum — see ``app.models.cap4``'s module docstring.
    """

    OK = "ok"  # Ủng hộ
    NEU = "neu"  # Trung tính
    BAD = "bad"  # Ngược chiều


class Cap4Progress(UUIDMixin, TimestampMixin, Base):
    """Per-user Cấp 4 reading-mastery progress. One row per user."""

    __tablename__ = "cap4_progress"
    __table_args__ = (UniqueConstraint("user_id", name="uq_cap4_progress_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # 3 nhiệm vụ completion timestamps (nullable until done, never un-set)
    task_1_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_2_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_3_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Recomputed metrics (spec §2③ "Thách thức Thuần thục") — source of truth =
    # order_kehoach.doc_5_lop/so_lop_dong_thuan JOIN order_ketso outcomes.
    so_lenh_doc_du_5lop: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    # Lớp đọc chuẩn nhất / kém nhất — NULL until ≥3 closed lệnh for that lớp.
    vu_khi_lop: Mapped[str | None] = mapped_column(String(32), nullable=True)
    diem_mu_lop: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # % thắng thật của lệnh đồng thuận cao (≥3 lớp AI Ủng hộ) — nhiệm vụ ③ đk 3.
    ty_le_thang_dong_thuan_cao: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0, server_default="0"
    )

    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_to_graduate_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
