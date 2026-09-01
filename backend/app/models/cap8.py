"""Cấp 8 «Quản trị rủi ro danh mục» models — progression (kiểm tra tác động của
lệnh MUA lên CẢ danh mục: dồn ngành, tương quan với vị thế đang giữ, tổng vốn ở
rủi ro nếu mọi cắt lỗ bị chạm).

Cấp 8 builds on a graduated Cấp 7: FREE, Thực chiến-only mode, and **the last
level of the current program**. Its temporary risk UI reuses Cấp 7's live
portfolio allocation rather than a Level 7 buy-panel overlay.
It adds these fields to the data model:

1. **``order_kehoach`` += 5 columns** (``don_nganh_pct`` /
   ``tuong_quan_cao_voi`` / ``tong_rui_ro_pct`` / ``danh_muc_canh_bao`` /
   ``hanh_vi_canh_bao``) — the Kiểm-tra-danh-mục block. They live on Cấp 1's
   physical ``order_kehoach`` table (see the "Cấp 8 additions" column block on
   ``app.models.cap1.OrderKehoach``), all nullable so every Cấp 1-7 row stays
   valid.
2. **``cap8_progress`` (below)** — 3 nhiệm vụ + the recomputed "Thách thức Quản
   trị rủi ro danh mục" metrics.

See ``~/Downloads/DEMO TRADING/LEVEL 8/IQX-Cap8-Spec.md`` §2/§4/§7/§8/§9 for the
verbatim data model this mirrors.

**★ CRITICAL PRINCIPLE 1 (spec §4/§9) — CẢNH BÁO MỀM, KHÔNG CỔNG CỨNG.** The
check never blocks MUA. ``hanh_vi_canh_bao = 'van_mua'`` is a first-class,
UNPENALISED choice: its only effect is that the order joins the "mua bất chấp
cảnh báo" count that nhiệm vụ ③ caps at 2 per 15 lệnh. Nothing else in the
system treats it as a violation, and the UI must not style it as the wrong
answer.

**★ CRITICAL PRINCIPLE 2 — a position with NO cắt lỗ has UNKNOWN risk, not zero
risk.** ``tong_rui_ro_pct`` is the sum over positions whose stop-loss is known.
Positions without one are EXCLUDED from the sum and reported separately by
count (``so_vi_the_thieu_cat_lo`` in the API). Silently summing 0 for them would
understate total risk — precisely the failure this level teaches against. Same
rule for a position whose price cannot be resolved: unknown weight ⇒ excluded
and counted, never assumed.

**★ CRITICAL PRINCIPLE 3 — correlation ``0.0`` is NOT "uncorrelated".** The
shared ``app.services.ai.portfolio_manager.returns.correlation`` returns ``0.0``
for degenerate inputs (<2 points, zero variance). ``tuong_quan_cao_voi`` is
therefore written ONLY from ``app.services.cap8.service.tuong_quan_an_toan``,
which returns ``None`` ("chưa đủ dữ liệu") unless both series have at least
``TUONG_QUAN_MIN_PHIEN`` aligned sessions. A NULL here means "not computed",
never "no relationship".

**★ CRITICAL PRINCIPLE 4 — the server re-derives, it does not take the client's
word.** ``don_nganh_pct`` / ``tuong_quan_cao_voi`` / ``tong_rui_ro_pct`` /
``danh_muc_canh_bao`` are recomputed server-side at write time from the real
portfolio; the request body's copies are ignored. Only ``hanh_vi_canh_bao``
comes from the client (only the user knows which button they pressed) — and
``khong_canh_bao`` is REJECTED when warnings actually fired, so a client cannot
keep its ``so_lan_mua_bat_chap_canh_bao`` clean by lying about what it saw.

**Storage decision — ``hanh_vi_canh_bao`` is a plain ``String``**, mirroring Cấp
4/5/6/7's explicit choice: the value is validated in the service layer against
the StrEnum here before it is persisted, nothing filters on it in SQL beyond a
NULL check and equality tests, and a PG enum type would add ALTER TYPE migration
churn for no query benefit.

**Storage decision — the two percentages are ``Numeric(9, 4)`` with
``asdecimal=False``** so plain ``float`` values flow through the service and
Pydantic layers without leaking ``Decimal`` into JSON. Four decimal places are
more than a percentage of NAV needs.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class LoaiCanhBao(enum.StrEnum):
    """The three things the Kiểm tra danh mục can warn about (spec §4).

    DERIVED, never a column of its own: the codes appear inside
    ``order_kehoach.danh_muc_canh_bao`` (a JSON list) so one order can carry any
    combination of them, including none.
    """

    DON_NGANH = "don_nganh"
    TUONG_QUAN = "tuong_quan"
    TONG_RUI_RO = "tong_rui_ro"


LOAI_CANH_BAO_LABELS: dict[str, str] = {
    LoaiCanhBao.DON_NGANH.value: "Dồn ngành",
    LoaiCanhBao.TUONG_QUAN.value: "Tương quan cao",
    LoaiCanhBao.TONG_RUI_RO.value: "Tổng vốn ở rủi ro vượt trần khẩu vị",
}


class HanhViCanhBao(enum.StrEnum):
    """What the user did at the Kiểm tra danh mục step (spec §4).

    ``VAN_MUA`` is **not a violation** — spec §9 rules out a hard gate, and §C8
    puts the decision with the user. It is recorded so nhiệm vụ ③ can measure
    "kỷ luật nghe cảnh báo" (≤ 2 lần trong 15 lệnh gần nhất) and so Kết sổ can
    show what was known at buy time. Nothing else penalises it.

    ``KHONG_CANH_BAO`` means the check ran and NOTHING fired — it is the healthy
    default, not an absence of data. An order that never went through the check
    at all leaves the column NULL instead.
    """

    VAN_MUA = "van_mua"
    GIAM_KL = "giam_kl"
    CHON_MA_KHAC = "chon_ma_khac"
    KHONG_CANH_BAO = "khong_canh_bao"


HANH_VI_CANH_BAO_LABELS: dict[str, str] = {
    HanhViCanhBao.VAN_MUA.value: "Vẫn mua",
    HanhViCanhBao.GIAM_KL.value: "Giảm khối lượng",
    HanhViCanhBao.CHON_MA_KHAC.value: "Chọn mã khác",
    HanhViCanhBao.KHONG_CANH_BAO.value: "Không có cảnh báo",
}


class Cap8Progress(UUIDMixin, TimestampMixin, Base):
    """Per-user Cấp 8 portfolio-risk progress. One row per user."""

    __tablename__ = "cap8_progress"
    __table_args__ = (UniqueConstraint("user_id", name="uq_cap8_progress_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # 3 nhiệm vụ completion timestamps (nullable until done, never un-set)
    task_1_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_2_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_3_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Recomputed metrics (spec §2③) — source of truth = order_kehoach's Cấp 8
    # block + the live portfolio. NEVER client-supplied.
    so_lenh_kiem_tra: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    #: ★ LIFETIME count of "có cảnh báo nhưng vẫn mua". Graduation condition ②
    #: uses a ROLLING window instead ("≤ 2 lần trong 15 lệnh gần nhất", spec
    #: §2③) computed in the service — do NOT read this column as that metric.
    #: It is stored because it is the honest all-time figure the Hành trình tab
    #: shows next to the windowed one.
    so_lan_mua_bat_chap_canh_bao: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    #: Closing-state snapshot, refreshed whenever the portfolio is priced.
    #: ★ NULLABLE on purpose: "chưa tính được" (no positions priced, price
    #: source down) must never be stored as 0.0 — 0% dồn ngành and 0% rủi ro are
    #: both *passing* values, so faking them would silently pass condition ③.
    don_nganh_max_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    tong_rui_ro_pct: Mapped[float | None] = mapped_column(Float, nullable=True)

    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_to_graduate_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
