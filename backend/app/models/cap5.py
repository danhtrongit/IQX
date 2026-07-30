"""Cấp 5 «Lão luyện» models — progression (tách QUYẾT ĐỊNH khỏi KẾT QUẢ qua
4 ô, + đứng ngoài có chủ đích).

Cấp 5 builds on a graduated Cấp 4: FREE, Thực chiến-only mode, the cap of the
0-5 foundational arc. Like Cấp 2/3/4 it does not replace any earlier block —
the buy panel is untouched. It adds exactly two things to the data model:

1. **``order_ketso`` += 5 columns** (``verdict_he`` / ``verdict_user`` /
   ``verdict_provenance`` / ``o_4`` / ``ly_do_sua``) — the "phân loại 4 ô" step
   inserted into Kết sổ. They live on Cấp 1's physical ``order_ketso`` table
   (see the "Cấp 5 additions" column block on ``app.models.cap1.OrderKetso``),
   all nullable so every Cấp 1-4 row stays valid.
2. **``standby_decision`` (NEW, below)** — "đứng ngoài cũng là một quyết định":
   a non-trade decision with the price at that moment, scored né đúng / né hụt /
   trung tính once 5 trading sessions have elapsed.

Plus this module's own ``cap5_progress`` table (3 nhiệm vụ + the recomputed
"Thách thức Lão luyện" metrics). See
``~/Downloads/DEMO TRADING/LEVEL 5/IQX-Cap5-Spec.md`` §2/§4/§5/§8 for the
verbatim data model this mirrors.

**★ CRITICAL PRINCIPLE (spec §1/§4) — "quyết định đúng" measures the PROCESS,
never the P&L.** A losing order that followed its own plan is ``dung_thua``; a
winning order that broke it is ``sai_thang`` (the most dangerous cell — luck
mistaken for skill). Nothing in Cấp 5 lets ``pnl_pct`` influence the đúng/sai
verdict; ``pnl_pct`` only chooses which COLUMN of the 4-ô matrix the order lands
in. ``app.services.cap5.service`` implements this and
``test_losing_but_disciplined_order_is_dung`` pins it down.

**Storage decision — the new string columns are plain ``String``, not PG
enums.** This mirrors Cấp 4's explicit choice (see ``app.models.cap4``): the
values are validated in the service layer against the ``StrEnum``s below before
they are persisted, nothing filters on them in SQL beyond a ``LIKE 'dung%'``
prefix count, and a PG enum type would add migration churn (ALTER TYPE) for no
query benefit. Same reason ``verdict_provenance`` is JSON: the FE reads the
whole provenance blob verbatim (§C12c) and never queries inside it.

**Storage decision — prices are ``Numeric(18, 4)`` with ``asdecimal=False``.**
Demo trading stores order prices as integer VND (``BigInteger``), but a
standby snapshot is compared against an *adjusted* daily close, which can carry
fractions. ``asdecimal=False`` keeps plain ``float`` flowing through the service
and pydantic layers instead of leaking ``Decimal`` into JSON.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class Verdict(enum.StrEnum):
    """"Quyết định đúng / sai" (spec §1) — a judgement about the PROCESS."""

    DUNG = "dung"
    SAI = "sai"


class O4(enum.StrEnum):
    """The 4 ô = verdict cuối × kết quả (spec §4).

    ``DUNG_THUA`` and ``SAI_THANG`` are the two counter-intuitive cells the
    coach emphasises: a good decision can still lose, and a lucky win is not
    skill.
    """

    DUNG_THANG = "dung_thang"
    DUNG_THUA = "dung_thua"
    SAI_THANG = "sai_thang"
    SAI_THUA = "sai_thua"


class LyDoDungNgoai(enum.StrEnum):
    """The 5 lý do of the "🚫 Tôi đứng ngoài mã này" form (spec §5, chọn 1)."""

    CHUA_DU_CO_SO = "chua_du_co_so"
    DINH_GIA_DAT = "dinh_gia_dat"
    CHO_VUNG_MUA_TOT_HON = "cho_vung_mua_tot_hon"
    DU_LIEU_NGUOC_CHIEU = "du_lieu_nguoc_chieu"
    DU_VI_THE_NHOM = "du_vi_the_nhom"


LY_DO_DUNG_NGOAI_LABELS: dict[str, str] = {
    LyDoDungNgoai.CHUA_DU_CO_SO.value: "Chưa đủ cơ sở (lớp chưa ủng hộ)",
    LyDoDungNgoai.DINH_GIA_DAT.value: "Định giá đang đắt",
    LyDoDungNgoai.CHO_VUNG_MUA_TOT_HON.value: "Chờ vùng mua tốt hơn",
    LyDoDungNgoai.DU_LIEU_NGUOC_CHIEU.value: "Dữ liệu ngược chiều — rủi ro cao",
    LyDoDungNgoai.DU_VI_THE_NHOM.value: "Đã đủ vị thế nhóm này",
}


class KetQuaDungNgoai(enum.StrEnum):
    """Outcome of a đứng-ngoài decision after 5 phiên (spec §5).

    ``TRUNG_TINH`` is the deliberate "never punish the ambiguous middle" band —
    a 2-5% rise counts as neither a good dodge nor a missed one.
    """

    NE_DUNG = "ne_dung"
    NE_HUT = "ne_hut"
    TRUNG_TINH = "trung_tinh"


KET_QUA_LABELS: dict[str, str] = {
    KetQuaDungNgoai.NE_DUNG.value: "Né đúng",
    KetQuaDungNgoai.NE_HUT.value: "Né hụt",
    KetQuaDungNgoai.TRUNG_TINH.value: "Trung tính",
}


class Cap5Progress(UUIDMixin, TimestampMixin, Base):
    """Per-user Cấp 5 meta-cognition progress. One row per user."""

    __tablename__ = "cap5_progress"
    __table_args__ = (UniqueConstraint("user_id", name="uq_cap5_progress_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # 3 nhiệm vụ completion timestamps (nullable until done, never un-set)
    task_1_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_2_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_3_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Recomputed metrics (spec §2③ "Thách thức Lão luyện") — source of truth =
    # order_ketso.o_4 + standby_decision.ket_qua. NEVER client-supplied.
    so_lenh_phan_loai: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    so_lan_dung_ngoai_da_cham: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    # % lệnh ô Đúng-* trên tổng lệnh đã phân loại — đo QUY TRÌNH, không phải
    # tỷ lệ thắng (spec §2③).
    ty_le_quyet_dinh_dung: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0, server_default="0"
    )

    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_to_graduate_hours: Mapped[float | None] = mapped_column(Float, nullable=True)


class StandbyDecision(UUIDMixin, TimestampMixin, Base):
    """One "đứng ngoài có chủ đích" decision — a NON-trade, recorded as a
    first-class reviewable decision (spec §5).

    ``cham_at`` is the moment the decision was actually SCORED (NULL until
    then), not a pre-scheduled due date: the due session is derived on the fly
    from ``decided_at`` + 5 trading sessions, so nothing has to be backfilled if
    the window rule ever changes, and "đã chấm" is a single NULL check that can
    never disagree with ``ket_qua``.

    ``gia_sau_5_phien``/``ket_qua`` stay NULL when the target session's price
    history is unavailable — an unscorable decision is left unscored, never
    guessed (and never counts toward nhiệm vụ ③).

    **KHÔNG thưởng số lượng (spec §5/§9):** nothing rewards logging many
    đứng-ngoài decisions; nhiệm vụ ③ needs ≥5 scored ones and no more.
    """

    __tablename__ = "standby_decision"
    __table_args__ = (
        Index("ix_standby_decision_user_decided", "user_id", "decided_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # One of ``LyDoDungNgoai`` — validated in the service (see module docstring).
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    gia_luc_dung_ngoai: Mapped[float] = mapped_column(
        Numeric(18, 4, asdecimal=False), nullable=False
    )

    cham_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    gia_sau_5_phien: Mapped[float | None] = mapped_column(
        Numeric(18, 4, asdecimal=False), nullable=True
    )
    # One of ``KetQuaDungNgoai``; NULL = chưa tới hạn hoặc chưa chấm được.
    ket_qua: Mapped[str | None] = mapped_column(String(16), nullable=True)
