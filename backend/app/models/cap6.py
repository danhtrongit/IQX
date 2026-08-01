"""Cấp 6 «Đối chiếu» models — progression (khi 5 lớp mâu thuẫn thì tin lớp nào,
và điều đó tùy loại cổ phiếu).

Cấp 6 builds on a graduated Cấp 5: FREE, Thực chiến-only mode, the FIRST
"theo chủ đề" level. Like Cấp 2/3/4/5 it replaces nothing — the buy panel keeps
Cấp 4's Đọc-5-lớp, Cấp 3's quản lý vốn, Cấp 2's SL/TP and Cấp 1's vùng mua
intact and INSERTS a "bước Đối chiếu" that appears only when the user's own 5
lớp ratings CONFLICT (≥1 ``ok`` Ủng hộ AND ≥1 ``bad`` Ngược chiều — spec §4).
It adds exactly two things to the data model:

1. **``order_kehoach`` += 6 columns** (``kieu_co_phieu`` / ``lop_mau_thuan`` /
   ``trong_so_goi_y`` / ``lop_quyet_dinh`` / ``khop_goi_y`` /
   ``ly_do_doi_chieu``) — the Đối chiếu block. They live on Cấp 1's physical
   ``order_kehoach`` table (see the "Cấp 6 additions" column block on
   ``app.models.cap1.OrderKehoach``), all nullable so every Cấp 1-5 row — and
   every Cấp 6 order that had NO conflict — stays valid.
2. **``cap6_progress`` (below)** — 3 nhiệm vụ + the recomputed "Thách thức Đối
   chiếu" metrics.

See ``~/Downloads/DEMO TRADING/LEVEL 6/IQX-Cap6-Spec.md`` §2/§4/§5/§9 for the
verbatim data model this mirrors.

**★ CRITICAL PRINCIPLE (spec §5/§10) — the trọng-số table is a SUGGESTION, not
a law.** ``KIEU_CO_PHIEU`` below says which lớp are worth prioritising for a
given kiểu cổ phiếu *and why*; the user still picks the ``lop_quyet_dinh``
themselves and may pick outside the suggestion. That is ``khop_goi_y = False``:
a **NEUTRAL FACT**, never "sai". Nothing in Cấp 6 penalises it — it only decides
which group the order joins in the khớp-vs-lệch win-rate comparison, whose
arbiter is real market outcomes. ``app.services.cap6.service`` implements this
and ``test_lech_goi_y_is_neutral_never_penalised`` pins it down.

**The 5 lớp reuse Cấp 4's keys.** ``lop_uu_tien``/``lop_it_tin``/
``lop_quyet_dinh`` all speak ``app.models.cap4.LOP_KEYS`` (itself derived from
Cấp 1's ``LyDo``), so Cấp 6's vocabulary can never drift from the lớp the user
actually rated. ``_assert_lop_keys`` below fails at import time if it ever does.

**Storage decision — the new string columns are plain ``String``, and
``lop_mau_thuan``/``trong_so_goi_y`` are JSON**, mirroring Cấp 4's and Cấp 5's
explicit choice: the values are validated in the service layer against the
enums here before they are persisted, nothing filters on them in SQL beyond a
NULL check and a DISTINCT count, and a PG enum type would add ALTER TYPE
migration churn for no query benefit. The two JSON blobs are read by the FE as
whole provenance objects (§C12c) and never queried into.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin
from app.models.cap1 import LyDo
from app.models.cap4 import LOP_KEYS, LOP_LABELS


class KieuCoPhieu(enum.StrEnum):
    """6 kiểu cổ phiếu (spec §5) — the archetype whose trọng số decides which
    lớp is worth prioritising when the 5 lớp disagree.

    Derived SERVER-side from the symbol's ngành (``Symbol.icb_lv2``/``icb_lv1``)
    — see ``app.services.cap6.service.kieu_from_nganh``. ``DAU_CO_NHO`` is the
    one kiểu that is NOT an ngành (it is a market-cap / volatility property with
    no server-side source in this repo yet); it is reachable only through the
    documented client fallback for symbols whose ngành is unknown.
    """

    NGAN_HANG = "ngan_hang"
    TANG_TRUONG = "tang_truong"
    CHU_KY = "chu_ky"
    PHONG_THU = "phong_thu"
    BAT_DONG_SAN = "bat_dong_san"
    DAU_CO_NHO = "dau_co_nho"


#: **Bảng trọng số theo 6 kiểu cổ phiếu — spec §5, verbatim.**
#:
#: ``lop_uu_tien`` = the lớp to prioritise when the layers conflict ·
#: ``lop_it_tin`` = the lớp that is less reliable for this kiểu ·
#: ``giai_thich`` = the "vì sao" sentence the FE shows **verbatim** next to the
#: suggestion (§C12c: never a bare suggestion).
#:
#: This is DATA, not logic: it is the single source of truth for both
#: ``GET /cap6/goi-y`` and the ``trong_so_goi_y``/``khop_goi_y`` the server
#: derives at write time, so the two can never disagree. It is a *starting
#: point* the spec explicitly allows to be revised — see §5's closing note.
KIEU_CO_PHIEU: dict[str, dict[str, object]] = {
    KieuCoPhieu.NGAN_HANG.value: {
        "ten": "Ngân hàng",
        "lop_uu_tien": [LyDo.DINH_GIA.value, LyDo.NOI_BO.value],
        "lop_it_tin": [LyDo.KY_THUAT.value],
        "giai_thich": (
            "Ngân hàng định giá theo P/B và chất lượng tài sản — tín hiệu kỹ "
            "thuật ngắn hạn ít tin cậy hơn cho nhóm này."
        ),
    },
    KieuCoPhieu.TANG_TRUONG.value: {
        "ten": "Tăng trưởng / công nghệ",
        "lop_uu_tien": [LyDo.KY_THUAT.value, LyDo.TIN_TUC.value, LyDo.DONG_TIEN.value],
        "lop_it_tin": [LyDo.DINH_GIA.value],
        "giai_thich": (
            "Với nhóm tăng trưởng, P/E cao là bình thường; đà giá và câu chuyện "
            "dẫn dắt — định giá đơn thuần ít tin cậy hơn."
        ),
    },
    KieuCoPhieu.CHU_KY.value: {
        "ten": "Chu kỳ / công nghiệp",
        "lop_uu_tien": [LyDo.DONG_TIEN.value, LyDo.DINH_GIA.value],
        "lop_it_tin": [LyDo.KY_THUAT.value],
        "giai_thich": (
            "Nhóm chu kỳ vào/ra theo chu kỳ ngành và dòng tiền lớn; định giá "
            "phải đọc theo chu kỳ — một tín hiệu kỹ thuật đơn lẻ ít tin cậy hơn."
        ),
    },
    KieuCoPhieu.PHONG_THU.value: {
        "ten": "Phòng thủ / tiêu dùng",
        "lop_uu_tien": [LyDo.DINH_GIA.value, LyDo.NOI_BO.value],
        "lop_it_tin": [LyDo.KY_THUAT.value],
        "giai_thich": (
            "Nhóm phòng thủ ít biến động: giá trị và dữ liệu nội bộ ổn định chi "
            "phối — tín hiệu kỹ thuật ít tin cậy hơn."
        ),
    },
    KieuCoPhieu.BAT_DONG_SAN.value: {
        "ten": "Bất động sản",
        "lop_uu_tien": [LyDo.NOI_BO.value, LyDo.TIN_TUC.value, LyDo.DONG_TIEN.value],
        "lop_it_tin": [LyDo.DINH_GIA.value],
        "giai_thich": (
            "Bất động sản do pháp lý/dự án và dòng tiền lớn chi phối — định giá "
            "đơn thuần ít tin cậy hơn cho nhóm này."
        ),
    },
    KieuCoPhieu.DAU_CO_NHO.value: {
        "ten": "Đầu cơ / vốn hóa nhỏ",
        "lop_uu_tien": [LyDo.DONG_TIEN.value, LyDo.KY_THUAT.value],
        "lop_it_tin": [LyDo.DINH_GIA.value, LyDo.NOI_BO.value],
        "giai_thich": (
            "Nhóm đầu cơ biến động mạnh: dòng tiền và đà giá dẫn dắt, còn định "
            "giá và dữ liệu nội bộ thường thiếu — rủi ro cao, cân nhắc kỹ."
        ),
    },
}


def _assert_lop_keys() -> None:
    """Fail loudly at import time if the trọng-số table ever names a lớp Cấp 4
    does not know (see the module docstring's "reuse Cấp 4's keys" note)."""
    for kieu, row in KIEU_CO_PHIEU.items():
        uu_tien = tuple(row["lop_uu_tien"])  # type: ignore[arg-type]
        it_tin = tuple(row["lop_it_tin"])  # type: ignore[arg-type]
        unknown = {lop for lop in (*uu_tien, *it_tin) if lop not in LOP_KEYS}
        if unknown:
            raise RuntimeError(f"cap6: kiểu {kieu!r} nhắc lớp không tồn tại: {unknown}")
        overlap = set(uu_tien) & set(it_tin)
        if overlap:
            raise RuntimeError(f"cap6: kiểu {kieu!r} vừa ưu tiên vừa ít tin: {overlap}")
    missing = {m.value for m in KieuCoPhieu} - set(KIEU_CO_PHIEU)
    if missing:
        raise RuntimeError(f"cap6: thiếu bảng trọng số cho kiểu: {missing}")


_assert_lop_keys()


def lop_ten(lop_keys: list[str]) -> list[str]:
    """Human labels for a list of lớp keys (reuses Cấp 4's ``LOP_LABELS``)."""
    return [LOP_LABELS.get(lop, lop) for lop in lop_keys]


class Cap6Progress(UUIDMixin, TimestampMixin, Base):
    """Per-user Cấp 6 conflict-resolution progress. One row per user."""

    __tablename__ = "cap6_progress"
    __table_args__ = (UniqueConstraint("user_id", name="uq_cap6_progress_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # 3 nhiệm vụ completion timestamps (nullable until done, never un-set)
    task_1_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_2_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_3_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Recomputed metrics (spec §2③ "Thách thức Đối chiếu") — source of truth =
    # order_kehoach.lop_quyet_dinh/kieu_co_phieu/khop_goi_y JOIN order_ketso
    # outcomes. NEVER client-supplied.
    so_lenh_doi_chieu: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    so_kieu_da_gap: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    # Win rate (%) of closed đối-chiếu lệnh whose lớp quyết định KHỚP the
    # suggestion, vs those that did not. ★ A low ty_le_thang_lech is NOT a
    # judgement on the user — see the module's CRITICAL PRINCIPLE. The
    # ≥3-per-group minimum before they may be COMPARED lives in the service
    # (spec §7 khối ⑮).
    #
    # ★★ NULL = "nhóm này chưa có lệnh đã đóng nào", and it is NOT 0.0. ``0.0``
    # is a real statement — closed lệnh, none of them winners — and rendering
    # "chưa có dữ liệu" as "thắng 0%" tells the user a result they never earned.
    # Cấp 8's ``don_nganh_max_pct``/``tong_rui_ro_pct`` are nullable for exactly
    # this reason.
    ty_le_thang_khop: Mapped[float | None] = mapped_column(Float, nullable=True)
    ty_le_thang_lech: Mapped[float | None] = mapped_column(Float, nullable=True)

    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_to_graduate_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
