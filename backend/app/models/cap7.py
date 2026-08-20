"""Cấp 7 «Đọc sổ lệnh» models — progression (đọc lực mua/bán ngay lúc đặt từ sổ
dư 3 mức, và cảnh giác với lệnh treo lớn chưa khớp).

Cấp 7 builds on a graduated Cấp 6: FREE, Thực chiến-only mode, the second
"theo chủ đề" level. Like Cấp 2/3/4/5/6 it replaces nothing — the buy panel keeps
Cấp 6's Đối chiếu, Cấp 4's Đọc-5-lớp, Cấp 3's quản lý vốn, Cấp 2's SL/TP and
Cấp 1's vùng mua intact and adds a **reading overlay** on the bid/ask book that
has been visible since Cấp 2 (spec §4: "thêm lớp phủ đọc… KHÔNG dựng lại sổ").
It adds exactly two things to the data model:

1. **``order_kehoach`` += 6 columns** (``luc_chi_so`` / ``luc_doc_user`` /
   ``doc_luc_dung`` / ``dien_bien_pct`` / ``co_canh_giac_lenh_gia`` /
   ``hanh_vi_co``) — the đọc-lực block. They live on Cấp 1's physical
   ``order_kehoach`` table (see the "Cấp 7 additions" column block on
   ``app.models.cap1.OrderKehoach``), all nullable so every Cấp 1-6 row — and
   every Cấp 7 order placed outside trading hours, when there is no live book to
   read — stays valid.
2. **``cap7_progress`` (below)** — 3 nhiệm vụ + the recomputed "Thách thức Đọc
   sổ lệnh" metrics.

See ``~/Downloads/DEMO TRADING/LEVEL 7/IQX-Cap7-Spec.md`` §2/§4/§5/§8/§9 for the
verbatim data model this mirrors.

**★ CRITICAL PRINCIPLE 1 (spec §4/§9) — hệ KHÔNG quyết thay.** The system
computes the chỉ số Lực and always shows the raw totals + a "vì sao"; the USER
picks ``manh`` / ``can`` / ``yeu`` themselves. Reading the book is **soft**: it
is never required to place an order (nhiệm vụ ① only needs it recorded once), so
``luc_doc_user`` is nullable and a NULL is not a failure — it is an order the
user simply did not read the book for.

**★ CRITICAL PRINCIPLE 2 (spec §5/§9) — the cờ is EDUCATIONAL, never a
detection claim.** ``co_canh_giac_lenh_gia`` records that a **heuristic** flag
was shown (one level's volume abnormally large vs the others), NOT that IQX
detected a fake order. Accurate detection needs continuous tick data and is
explicitly out of scope (§9). ``hanh_vi_co`` records what the user then did —
``mua_duoi_theo`` is a gentle reminder at Kết sổ, **never a penalty** (§5:
"không phạt cứng"): it is only excluded from the "không đuổi theo cờ" count.

**★ CRITICAL PRINCIPLE 3 — the time-lock is what makes ``doc_luc_dung``
trustworthy.** ``luc_chi_so`` is computed on the CLIENT from realtime order-book
data the server does not hold at request time, so it can never be re-derived
server-side. What keeps the graduation metric sound is that the guess is
committed **before the outcome exists**, and that ``doc_luc_dung`` itself is
scored **server-side from real price history** ``SO_PHIEN_CHAM_LUC`` trading
sessions after the buy. ``app.services.cap7.service`` implements both halves
(including the write-lock once the chấm deadline has passed) and
``test_luc_doc_is_locked_once_the_window_has_elapsed`` pins the lock down.

**Storage decision — ``luc_doc_user``/``hanh_vi_co`` are plain ``String``**,
mirroring Cấp 4's, Cấp 5's and Cấp 6's explicit choice: the values are validated
in the service layer against the StrEnums here before they are persisted,
nothing filters on them in SQL beyond a NULL check and one equality test, and a
PG enum type would add ALTER TYPE migration churn for no query benefit.

**Storage decision — ``luc_chi_so`` is ``Numeric(18, 6)`` with
``asdecimal=False``**: an
explicit, platform-independent precision on the column, while plain ``float``
keeps flowing through the service and pydantic layers instead of leaking
``Decimal`` into JSON. 6 decimal places is far more than a dư-mua/dư-bán ratio
needs and costs nothing.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class LucDocUser(enum.StrEnum):
    """The user's OWN reading of the book at buy time (spec §4) — the picker is
    ``[ Cầu mạnh ] [ Cân bằng ] [ Cầu yếu ]`` and the system never fills it in."""

    MANH = "manh"
    CAN = "can"
    YEU = "yeu"


LUC_DOC_LABELS: dict[str, str] = {
    LucDocUser.MANH.value: "Cầu mạnh",
    LucDocUser.CAN.value: "Cân bằng",
    LucDocUser.YEU.value: "Cầu yếu",
}


class HanhViCo(enum.StrEnum):
    """What the user did after the cờ cảnh giác appeared (spec §5).

    ``MUA_DUOI_THEO`` is **not a violation** — it is recorded so the Kết sổ can
    remind gently and so the two groups' entry outcomes can be compared (khối
    ⑰). Nothing penalises it.
    """

    CHO_XAC_NHAN = "cho_xac_nhan"
    MUA_DUOI_THEO = "mua_duoi_theo"


HANH_VI_CO_LABELS: dict[str, str] = {
    HanhViCo.CHO_XAC_NHAN.value: "Chờ xác nhận (chờ khớp thật)",
    HanhViCo.MUA_DUOI_THEO.value: "Mua đuổi vào lệnh treo lớn",
}


class BandLuc(enum.StrEnum):
    """The 3 gauge bands of the chỉ số Lực (spec §4).

    DERIVED, never stored: the band is a pure function of ``luc_chi_so`` and its
    cut-offs are documented constants in ``app.services.cap7.service`` (a single
    source of truth the FE renders rather than inventing its own).
    """

    CAU_AP_DAO = "cau_ap_dao"
    CAN_BANG = "can_bang"
    CUNG_AP_DAO = "cung_ap_dao"


BAND_LUC_LABELS: dict[str, str] = {
    BandLuc.CAU_AP_DAO.value: "Cầu áp đảo",
    BandLuc.CAN_BANG.value: "Cân bằng",
    BandLuc.CUNG_AP_DAO.value: "Cung áp đảo",
}


class Cap7Progress(UUIDMixin, TimestampMixin, Base):
    """Per-user Cấp 7 order-book-reading progress. One row per user."""

    __tablename__ = "cap7_progress"
    __table_args__ = (UniqueConstraint("user_id", name="uq_cap7_progress_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # 3 nhiệm vụ completion timestamps (nullable until done, never un-set)
    task_1_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_2_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_3_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Recomputed metrics (spec §2③ "Thách thức Đọc sổ lệnh") — source of truth =
    # order_kehoach.luc_doc_user / co_canh_giac_lenh_gia / hanh_vi_co /
    # doc_luc_dung. NEVER client-supplied.
    so_lenh_doc_luc: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    so_lan_khong_duoi_theo_co: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    # % of SCORED đọc-lực orders whose guess matched the diễn biến ngay sau.
    # ★ Orders whose price history is unavailable are NOT in the denominator —
    # an unscoreable order must never count as wrong (see the service's
    # ``_score_due_orders``). Stays 0.0 until something has actually been scored;
    # the ≥3-scored minimum before the rate may be SHOWN lives in the service
    # (spec §7's "<3 lệnh đọc lực đã đóng → chỉ đếm, ẩn thống kê").
    ty_le_doc_luc_dung: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0, server_default="0"
    )

    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_to_graduate_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
