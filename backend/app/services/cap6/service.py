"""Cấp 6 «Đối chiếu» service — kiểu cổ phiếu map từ ngành + bảng trọng số gợi ý
(kèm "vì sao"), bước Đối chiếu trên ``order_kehoach``, Thách thức Đối chiếu.

Cấp 6 is FREE and Thực chiến-only, built on a graduated Cấp 5. It owns
``cap6_progress`` and EXTENDS Cấp 1's ``order_kehoach`` rows in place (new
columns ``kieu_co_phieu``/``lop_mau_thuan``/``trong_so_goi_y``/
``lop_quyet_dinh``/``khop_goi_y``/``ly_do_doi_chieu`` on the same physical table
— see ``app.models.cap1``). It reuses ``VirtualTradingRepository`` (read-only
here) for order lookups and ``SymbolRepository`` for the ngành.

**★ CRITICAL PRINCIPLE (spec §5/§10) — the trọng số is a SUGGESTION, never a
law.** The server suggests which lớp to prioritise for the stock's kiểu *and
always returns the "vì sao"* (§C12c hybrid + provenance); the user picks the
``lop_quyet_dinh`` and may pick OUTSIDE the suggestion. That is
``khop_goi_y = False``: a **NEUTRAL FACT**. Nothing here penalises it — no
counter excludes it, no threshold punishes it, no label calls it wrong. Its only
effect is choosing which group the order joins in the khớp-vs-lệch win-rate
comparison, whose arbiter is real market outcomes. ``khop_goi_y`` is even left
**NULL** (not ``False``) when the kiểu is unknown, so a user can never be marked
"lệch" against a suggestion that was never made.
``test_lech_goi_y_is_neutral_never_penalised`` pins this invariant down.

**Everything derived is recomputed server-side on every read/write** —
``trong_so_goi_y``, ``khop_goi_y``, ``lop_mau_thuan``, ``so_lenh_doi_chieu``,
``so_kieu_da_gap``, ``ty_le_thang_khop``/``ty_le_thang_lech`` and the 3 nhiệm
vụ. The client can only ever supply its OWN judgement (``lop_quyet_dinh`` +
``ly_do_doi_chieu``) and — only in the documented fallback below — the kiểu.

═══════════════════════════════════════════════════════════════════════════
★★ SECTOR → KIỂU DECISION (read this before touching ``_NGANH_KIEU``) ★★
═══════════════════════════════════════════════════════════════════════════
The task allowed either "map ngành → kiểu server-side" or "accept
``kieu_co_phieu`` from the client (re-validated)". **A reliable server-side
ngành DOES exist, so we map server-side.** Provenance:

  · ``app.models.symbol.Symbol`` carries ``icb_lv1``/``icb_lv2`` (ICB industry
    names in Vietnamese), seeded from Vietcap by ``app.services.symbols`` and
    already trusted server-side by the BCTC dashboard's peer-median engine
    (``app.services.bctc_dashboard.peer_median`` keys its whole sector cache on
    ``icb_lv2``). On the live database ``icb_lv2`` resolves to 19 distinct
    values covering ~96% of non-index symbols.
  · ``_NGANH_KIEU`` below maps those ICB names → 1 of the 6 kiểu, preferring
    ``icb_lv2`` (fine-grained) and falling back to ``icb_lv1``.

**Consequences, all deliberate:**

  1. ``POST /cap6/kehoach`` **re-derives the kiểu from the order's symbol** and
     the server's value WINS — a client cannot claim another kiểu to flip
     ``khop_goi_y`` (spec §10: "Kiểu cổ phiếu do user tự gán tay — KHÔNG").
  2. Only when the server **cannot** classify the symbol (no ``symbols`` row, no
     ICB value, or a deliberately-unmapped ngành) is the client's
     ``kieu_co_phieu`` accepted — and it is **re-validated against
     ``KieuCoPhieu``** first (anything else → 400). This is the graceful
     degradation path, and the only route to ``dau_co_nho``.
  3. ``dau_co_nho`` is **not derivable from ngành at all** — it is a market-cap /
     liquidity property and ``symbols`` carries no market cap. It is therefore
     reachable only via (2). Documented rather than faked.
  4. ``icb_lv1 == "Tài chính"`` is **deliberately NOT mapped**: at level 1 it
     mixes bất động sản, dịch vụ tài chính (chứng khoán) and bảo hiểm, which
     take different trọng số. Guessing there would be worse than "chưa phân
     loại", which the spec explicitly designs for (§4/§10: skip the per-kiểu
     suggestion, still let the user pick a lớp quyết định).

Other design notes (documented here since the spec leaves them implicit):

  - **``lop_mau_thuan`` is re-derived from ``doc_5_lop``**, the Cấp 4 ratings
    already persisted on the same row, and normalised into
    ``{ung_ho, nguoc_chieu, trung_tinh, co_mau_thuan, nguon}``. The client's own
    copy is accepted only as a fallback when ``doc_5_lop`` is absent (e.g. an
    order whose Cấp 4 block was never filled). Same reasoning as Cấp 4's
    ``so_lop_dong_thuan``: a second copy of data we already hold is an
    unverifiable input for no benefit.
  - **The conflict trigger is NOT enforced as a gate.** ``co_mau_thuan`` is
    computed and stored (so ⑭/⑮ and the FE can read it), but recording a đối
    chiếu on a non-conflicting order is not an error: the trigger is a UI rule
    (spec §4 "không hiện bước Đối chiếu"), and a server-side 4xx there would
    only turn a harmless extra reflection into a broken flow.
  - **Counters.** ``so_lenh_doi_chieu`` = the user's Thực chiến ``order_kehoach``
    rows with ``lop_quyet_dinh`` set; ``so_kieu_da_gap`` = DISTINCT non-NULL
    ``kieu_co_phieu`` among them. Deliberately NOT filtered by ``entered_at``,
    for Cấp 4/5's reason: ``lop_quyet_dinh`` can only ever be written by
    ``record_kehoach`` below, which requires a ``Cap6Progress`` row, so any row
    carrying it is inherently Cấp-6-era.
  - **Win rates need ≥3 CLOSED lệnh per group** (spec §7 khối ⑮'s <3 threshold)
    before they may be compared. Below that the group is reported
    ``du_du_lieu = False`` and nhiệm vụ ③'s third leg simply does not pass —
    we never declare a winner off 1-2 trades in either direction.
  - **Pairing a kế hoạch (BUY) with its outcome (``order_ketso``, keyed on the
    SELL)** reuses Cấp 1's own rule verbatim (``Cap1Service._find_matching_buy``:
    the most recent FILLED buy for the same account+symbol at/before the sell),
    mirrored in Python exactly as Cấp 4 mirrors it — same single-lot
    approximation, same 3 queries.
  - **Nhiệm vụ** ① first order that went through the Đối chiếu step ·
    ② first CLOSED round trip whose buy carries a đối chiếu (spec §2②'s "Kết sổ
    Cấp 6" is by definition a kết sổ *with* the đối-chiếu review) · ③ all three
    legs at once. Once a ``task_N_done_at`` is stamped it is NEVER un-stamped —
    Cấp 1/2/3/4/5's pattern.
"""

from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    UnprocessableEntityError,
)
from app.models.cap1 import OrderKehoach, OrderKetso
from app.models.cap4 import LOP_KEYS, LOP_LABELS, NhanDinhLop
from app.models.cap5 import Cap5Progress
from app.models.cap6 import KIEU_CO_PHIEU, Cap6Progress, KieuCoPhieu, lop_ten
from app.models.virtual_trading import OrderSide, OrderStatus, VirtualOrder
from app.repositories.symbol import SymbolRepository
from app.repositories.virtual_trading import VirtualTradingRepository

_TASK_NOS = (1, 2, 3)

# Thách thức Đối chiếu (spec §2③) — triple condition, ALL must hold at once.
_TASK3_SO_LENH_MIN = 15
_TASK3_SO_KIEU_MIN = 3
# Minimum CLOSED lệnh in EACH group before the khớp-vs-lệch comparison counts
# (spec §7 khối ⑮: "<3 lệnh đối chiếu đã đóng → chỉ đếm, ẩn thống kê").
MIN_LENH_MOI_NHOM = 3

_KIEU_VALUES = frozenset(m.value for m in KieuCoPhieu)
_LOP_VALUES = frozenset(LOP_KEYS)
_NHAN_DINH_VALUES = frozenset(m.value for m in NhanDinhLop)

_CHUA_PHAN_LOAI_GIAI_THICH = (
    "Chưa phân loại được kiểu cổ phiếu cho {symbol} (hệ chưa có dữ liệu ngành "
    "cho mã này), nên lần này IQX không gợi ý trọng số lớp. Bước Đối chiếu vẫn "
    "hoạt động bình thường: bạn tự chọn lớp quyết định và ghi vì sao."
)


# ══════════════════════════════════════════════════════
# Ngành → kiểu cổ phiếu (see the module docstring's DECISION block)
# ══════════════════════════════════════════════════════


def _norm_nganh(value: str) -> str:
    """Accent-insensitive, case-insensitive, whitespace-collapsed key so the
    upstream ICB label can drift in casing/diacritics without breaking the map
    (mirrors ``app.services.bctc_dashboard.peer_median._norm``'s intent)."""
    folded = unicodedata.normalize("NFKD", value)
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    folded = folded.replace("đ", "d").replace("Đ", "D")
    return re.sub(r"\s+", " ", folded).strip().lower()


def _m(*nganh: str) -> tuple[str, ...]:
    return tuple(_norm_nganh(n) for n in nganh)


#: ICB ngành (``Symbol.icb_lv2`` preferred, else ``icb_lv1``) → kiểu cổ phiếu.
#: Keys are ``_norm_nganh``-folded. The live ``symbols`` table's 19 distinct
#: ``icb_lv2`` values are all covered; ``icb_lv1`` entries are the coarse
#: fallback. "Tài chính" (lv1) is intentionally absent — see the module
#: docstring's DECISION note (4).
_NGANH_KIEU: dict[str, str] = {
    # ── icb_lv2 (fine-grained, preferred) ────────────
    **dict.fromkeys(_m("Ngân hàng"), KieuCoPhieu.NGAN_HANG.value),
    **dict.fromkeys(
        _m("Công nghệ Thông tin", "Viễn thông"), KieuCoPhieu.TANG_TRUONG.value
    ),
    **dict.fromkeys(
        _m(
            "Xây dựng và Vật liệu",
            "Hàng & Dịch vụ Công nghiệp",
            "Dầu khí",
            "Tài nguyên Cơ bản",
            "Hóa chất",
            "Ô tô và phụ tùng",
            "Dịch vụ tài chính",  # chứng khoán — bám sát chu kỳ thị trường
            "Du lịch và Giải trí",
            "Truyền thông",
        ),
        KieuCoPhieu.CHU_KY.value,
    ),
    **dict.fromkeys(
        _m(
            "Thực phẩm và đồ uống",
            "Hàng cá nhân & Gia dụng",
            "Y tế",
            "Điện, nước & xăng dầu khí đốt",
            "Bán lẻ",
            "Bảo hiểm",
        ),
        KieuCoPhieu.PHONG_THU.value,
    ),
    **dict.fromkeys(_m("Bất động sản"), KieuCoPhieu.BAT_DONG_SAN.value),
    # ── icb_lv1 fallback (coarse) ────────────────────
    **dict.fromkeys(
        _m("Công nghiệp", "Nguyên vật liệu", "Dịch vụ Tiêu dùng"),
        KieuCoPhieu.CHU_KY.value,
    ),
    **dict.fromkeys(
        _m("Hàng Tiêu dùng", "Dược phẩm và Y tế", "Tiện ích Cộng đồng"),
        KieuCoPhieu.PHONG_THU.value,
    ),
}


def kieu_from_nganh(nganh: str | None) -> str | None:
    """The kiểu cổ phiếu an ICB ngành maps to, or ``None`` when unmapped.

    Public so tests (and any future admin tooling) read the SAME map the service
    writes with — the two can never drift.
    """
    if not nganh:
        return None
    return _NGANH_KIEU.get(_norm_nganh(nganh))


def kieu_payload(kieu: str | None, *, symbol: str, nganh: str | None = None) -> dict:
    """The §C12c-shaped suggestion block for a kiểu: which lớp to prioritise,
    which are less reliable, and the "vì sao" — or an honest "chưa phân loại"
    when the kiểu is unknown (``kieu = None``), which the FE renders while STILL
    letting the user pick a lớp quyết định (spec §4/§10)."""
    row = KIEU_CO_PHIEU.get(kieu or "")
    if row is None:
        return {
            "symbol": symbol,
            "nganh": nganh,
            "kieu": None,
            "kieu_ten": None,
            "lop_uu_tien": [],
            "lop_uu_tien_ten": [],
            "lop_it_tin": [],
            "lop_it_tin_ten": [],
            "giai_thich": _CHUA_PHAN_LOAI_GIAI_THICH.format(symbol=symbol),
        }
    uu_tien = list(row["lop_uu_tien"])  # type: ignore[arg-type]
    it_tin = list(row["lop_it_tin"])  # type: ignore[arg-type]
    return {
        "symbol": symbol,
        "nganh": nganh,
        "kieu": kieu,
        "kieu_ten": row["ten"],
        "lop_uu_tien": uu_tien,
        "lop_uu_tien_ten": lop_ten(uu_tien),
        "lop_it_tin": it_tin,
        "lop_it_tin_ten": lop_ten(it_tin),
        "giai_thich": row["giai_thich"],
    }


class Cap6Service:
    """Business logic for the free Cấp 6 «Đối chiếu» flow."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._vt_repo = VirtualTradingRepository(session)
        self._symbol_repo = SymbolRepository(session)

    # ── Progress row ─────────────────────────────────

    async def _get_progress_row(self, user_id: uuid.UUID) -> Cap6Progress | None:
        result = await self._session.execute(
            select(Cap6Progress).where(Cap6Progress.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def _require_progress(self, user_id: uuid.UUID) -> Cap6Progress:
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 6")
        return progress

    async def get_progress(self, user_id: uuid.UUID) -> Cap6Progress | None:
        progress = await self._get_progress_row(user_id)
        if progress is None:
            return None
        await self._recompute_progress(user_id, progress)
        return progress

    async def enter(self, user_id: uuid.UUID) -> Cap6Progress:
        """Enter Cấp 6 (idempotent). Requires the user to have graduated Cấp 5."""
        progress = await self._get_progress_row(user_id)
        if progress is not None:
            return progress

        cap5_result = await self._session.execute(
            select(Cap5Progress).where(Cap5Progress.user_id == user_id)
        )
        cap5_progress = cap5_result.scalar_one_or_none()
        if cap5_progress is None:
            raise NotFoundError("tiến trình Cấp 5")
        if cap5_progress.graduated_at is None:
            raise ConflictError("Chưa tốt nghiệp Cấp 5")

        progress = Cap6Progress(user_id=user_id, entered_at=datetime.now(UTC))
        self._session.add(progress)
        await self._session.flush()
        await self._session.refresh(progress)
        return progress

    # ── Kiểu cổ phiếu (server-side, từ ngành) ─────────

    async def _nganh_of(self, symbol: str) -> str | None:
        """The symbol's ICB ngành — ``icb_lv2`` preferred, ``icb_lv1`` fallback.

        Fail-soft: any lookup failure is treated as "ngành unknown" (→ "chưa
        phân loại"), never as an error that would block the buy panel.
        """
        try:
            row = await self._symbol_repo.get_by_symbol(symbol)
        except Exception:  # noqa: BLE001 — unknown ngành, never a hard failure
            return None
        if row is None:
            return None
        return (row.icb_lv2 or None) or (row.icb_lv1 or None)

    async def _kieu_of_symbol(self, symbol: str) -> tuple[str | None, str | None]:
        """``(kieu, nganh)`` for a symbol, both ``None`` when unclassifiable."""
        nganh = await self._nganh_of(symbol)
        return kieu_from_nganh(nganh), nganh

    async def goi_y(self, user_id: uuid.UUID, symbol: str) -> dict:
        """``GET /cap6/goi-y?symbol=`` — the kiểu cổ phiếu + its trọng số gợi ý
        + the "vì sao" the FE shows VERBATIM (§C12c: never a bare suggestion).

        Returns ``kieu = None`` + an honest "chưa phân loại" note when the ngành
        is missing or unmapped — the FE still renders the picker (spec §4/§10).
        """
        await self._require_progress(user_id)
        symbol_clean = (symbol or "").strip().upper()
        if not symbol_clean:
            raise BadRequestError("Thiếu mã cổ phiếu")
        kieu, nganh = await self._kieu_of_symbol(symbol_clean)
        return kieu_payload(kieu, symbol=symbol_clean, nganh=nganh)

    # ── Bước Đối chiếu (spec §4) ──────────────────────

    @staticmethod
    def _validate_lop_map(value: Any) -> dict[str, str] | None:
        """A ``{lop: 'ok'|'neu'|'bad'}`` map, or ``None`` when absent/unusable.

        Lenient on purpose (this is only the FALLBACK source for
        ``lop_mau_thuan`` — see the module docstring): unknown keys/values are
        dropped rather than 400-ing, because the authoritative copy is
        ``doc_5_lop``.
        """
        if not isinstance(value, dict):
            return None
        clean = {
            lop: muc
            for lop, muc in value.items()
            if lop in _LOP_VALUES and muc in _NHAN_DINH_VALUES
        }
        return clean or None

    @staticmethod
    def _summarise_mau_thuan(lop_map: dict[str, str], nguon: str) -> dict:
        """Normalise a 5-lớp rating map into the Ủng hộ / Ngược chiều summary
        spec §9 asks ``lop_mau_thuan`` to hold, in canonical ``LOP_KEYS`` order.

        ``co_mau_thuan`` is the spec §4 conflict trigger itself: ≥1 Ủng hộ AND
        ≥1 Ngược chiều. It is recorded, not enforced (see the module docstring).
        """
        ung_ho = [lop for lop in LOP_KEYS if lop_map.get(lop) == NhanDinhLop.OK.value]
        nguoc = [lop for lop in LOP_KEYS if lop_map.get(lop) == NhanDinhLop.BAD.value]
        trung_tinh = [
            lop for lop in LOP_KEYS if lop_map.get(lop) == NhanDinhLop.NEU.value
        ]
        return {
            "ung_ho": ung_ho,
            "ung_ho_ten": lop_ten(ung_ho),
            "nguoc_chieu": nguoc,
            "nguoc_chieu_ten": lop_ten(nguoc),
            "trung_tinh": trung_tinh,
            "co_mau_thuan": bool(ung_ho) and bool(nguoc),
            "nguon": nguon,
        }

    async def _get_kehoach_by_order(self, order_id: uuid.UUID) -> OrderKehoach | None:
        result = await self._session.execute(
            select(OrderKehoach).where(OrderKehoach.order_id == order_id)
        )
        return result.scalar_one_or_none()

    async def record_kehoach(
        self,
        user_id: uuid.UUID,
        order_id: uuid.UUID,
        *,
        lop_quyet_dinh: str,
        ly_do_doi_chieu: str | None,
        kieu_co_phieu: str | None = None,
        lop_mau_thuan: Any = None,
        trong_so_goi_y: Any = None,  # noqa: ARG002 — advisory, see below
        khop_goi_y: Any = None,  # noqa: ARG002 — advisory, see below
    ) -> OrderKehoach:
        """Adds the "Đối chiếu" block to the EXISTING ``order_kehoach`` row
        created by Cấp 1's ``/cap1/kehoach`` (Cấp 2's SL/TP, Cấp 3's quản lý vốn
        and Cấp 4's đọc-5-lớp are filled first; Cấp 6 only inserts this block —
        spec §4's "panel Cấp 5 kế thừa nguyên vẹn"). 404 when that row is
        absent, the same convention as Cấp 2-5.

        **The server derives ``trong_so_goi_y`` and ``khop_goi_y`` ITSELF** from
        the kiểu table — they are accepted in the signature only for API
        symmetry with the FE (which displayed them) and are otherwise ignored.
        ``kieu_co_phieu`` is likewise re-derived from the symbol's ngành and the
        server's value wins; the client's is used ONLY when the server cannot
        classify the symbol, and is re-validated against ``KieuCoPhieu`` first.
        See the module docstring's SECTOR → KIỂU DECISION block.

        ``ly_do_doi_chieu`` is REQUIRED (422 when missing/blank — spec §4: never
        a bare pick). Re-submitting the same order overwrites its đối chiếu (the
        panel is a form the user can go back a step in); every derived field is
        re-derived, so a rewrite can never invent a suggestion or a match.
        """
        progress = await self._require_progress(user_id)

        order = await self._vt_repo.get_order_by_id(order_id)
        if order is None or order.user_id != user_id:
            raise NotFoundError("lệnh")
        if order.side != OrderSide.BUY:
            raise BadRequestError("Bước Đối chiếu chỉ ghi cho lệnh MUA")

        if lop_quyet_dinh not in _LOP_VALUES:
            raise BadRequestError("lop_quyet_dinh phải là 1 trong 5 lớp")
        ly_do_clean = (ly_do_doi_chieu or "").strip()
        if not ly_do_clean:
            raise UnprocessableEntityError(
                "Cần ghi 1 dòng vì sao bạn tin lớp này — đối chiếu không bao giờ "
                "là một lựa chọn trơ."
            )

        # Kiểu: server's ngành derivation wins; client value only as fallback.
        kieu, nganh = await self._kieu_of_symbol(order.symbol)
        nguon_kieu = "nganh" if kieu is not None else None
        if kieu is None and kieu_co_phieu is not None:
            if kieu_co_phieu not in _KIEU_VALUES:
                raise BadRequestError("kieu_co_phieu không hợp lệ")
            kieu = kieu_co_phieu
            nguon_kieu = "client"

        kehoach = await self._get_kehoach_by_order(order_id)
        if kehoach is None:
            raise NotFoundError("kế hoạch Cấp 1 — cần ghi vùng mua trước")

        # lop_mau_thuan: prefer the persisted Cấp 4 ratings over the client's copy.
        doc_map = self._validate_lop_map(kehoach.doc_5_lop)
        client_map = self._validate_lop_map(lop_mau_thuan)
        if doc_map is not None:
            mau_thuan = self._summarise_mau_thuan(doc_map, "doc_5_lop")
        elif client_map is not None:
            mau_thuan = self._summarise_mau_thuan(client_map, "client")
        else:
            mau_thuan = None

        goi_y = kieu_payload(kieu, symbol=order.symbol, nganh=nganh)
        if kieu is None:
            # "Chưa phân loại": no suggestion exists, so there is nothing to
            # match — khop_goi_y stays NULL rather than False (★ the user is
            # never marked "lệch" against a suggestion never made).
            trong_so: dict | None = None
            khop: bool | None = None
        else:
            trong_so = {
                "kieu": kieu,
                "kieu_ten": goi_y["kieu_ten"],
                "nganh": nganh,
                "nguon": nguon_kieu,
                "lop_uu_tien": goi_y["lop_uu_tien"],
                "lop_it_tin": goi_y["lop_it_tin"],
                "giai_thich": goi_y["giai_thich"],
            }
            khop = lop_quyet_dinh in goi_y["lop_uu_tien"]

        kehoach.kieu_co_phieu = kieu
        kehoach.lop_mau_thuan = mau_thuan
        kehoach.trong_so_goi_y = trong_so
        kehoach.lop_quyet_dinh = lop_quyet_dinh
        kehoach.khop_goi_y = khop
        kehoach.ly_do_doi_chieu = ly_do_clean
        await self._session.flush()
        await self._session.refresh(kehoach)

        await self._recompute_progress(user_id, progress)
        return kehoach

    @staticmethod
    def kehoach_out(kehoach: OrderKehoach) -> dict:
        """Serialize the Đối chiếu block for the API (adds the derived labels the
        FE renders — never stored twice)."""
        row = KIEU_CO_PHIEU.get(kehoach.kieu_co_phieu or "")
        lop = kehoach.lop_quyet_dinh
        return {
            "id": kehoach.id,
            "order_id": kehoach.order_id,
            "kieu_co_phieu": kehoach.kieu_co_phieu,
            "kieu_ten": row["ten"] if row is not None else None,
            "lop_mau_thuan": kehoach.lop_mau_thuan,
            "trong_so_goi_y": kehoach.trong_so_goi_y,
            "lop_quyet_dinh": lop,
            "lop_quyet_dinh_ten": LOP_LABELS.get(lop or "") or None,
            "khop_goi_y": kehoach.khop_goi_y,
            "ly_do_doi_chieu": kehoach.ly_do_doi_chieu,
        }

    # ── Source rows ───────────────────────────────────

    async def _doi_chieu_rows(
        self, user_id: uuid.UUID
    ) -> list[tuple[OrderKehoach, VirtualOrder]]:
        """``order_kehoach`` rows that went through the Đối chiếu step, with
        their BUY order (see the module docstring for why there is no
        ``entered_at`` filter)."""
        result = await self._session.execute(
            select(OrderKehoach, VirtualOrder)
            .join(VirtualOrder, VirtualOrder.id == OrderKehoach.order_id)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.mode == "thuc_chien",
                OrderKehoach.lop_quyet_dinh.is_not(None),
            )
            .order_by(VirtualOrder.created_at.asc())
        )
        return [(kehoach, order) for kehoach, order in result.all()]

    async def _closed_pairs(
        self, user_id: uuid.UUID
    ) -> list[tuple[OrderKehoach, OrderKetso]]:
        """Every closed round trip whose BUY carries a Cấp 6 đối chiếu, paired
        with its ``order_ketso`` outcome (pairing rule = Cấp 1's, mirrored
        exactly as Cấp 4's ``_closed_pairs`` does)."""
        kehoach_rows = await self._doi_chieu_rows(user_id)
        if not kehoach_rows:
            return []
        kehoach_by_buy_id = {order.id: kehoach for kehoach, order in kehoach_rows}

        buys_result = await self._session.execute(
            select(VirtualOrder)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.mode == "thuc_chien",
                VirtualOrder.side == OrderSide.BUY,
                VirtualOrder.status == OrderStatus.FILLED,
            )
            .order_by(VirtualOrder.created_at.asc())
        )
        buys = list(buys_result.scalars().all())

        ketso_result = await self._session.execute(
            select(OrderKetso, VirtualOrder)
            .join(VirtualOrder, VirtualOrder.id == OrderKetso.order_id)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.mode == "thuc_chien",
            )
            .order_by(OrderKetso.closed_at.asc())
        )

        pairs: list[tuple[OrderKehoach, OrderKetso]] = []
        for ketso, sell in ketso_result.all():
            matched_buy: VirtualOrder | None = None
            for buy in buys:  # ordered asc → the last match is the most recent
                if (
                    buy.account_id == sell.account_id
                    and buy.symbol == sell.symbol
                    and buy.created_at <= sell.created_at
                ):
                    matched_buy = buy
            if matched_buy is None:
                continue
            kehoach = kehoach_by_buy_id.get(matched_buy.id)
            if kehoach is not None:
                pairs.append((kehoach, ketso))
        return pairs

    # ── Metrics (khớp vs lệch) ────────────────────────

    @staticmethod
    def _is_win(ketso: OrderKetso) -> bool:
        return ketso.pnl_pct > 0

    def _nhom(self, pairs: list[tuple[OrderKehoach, OrderKetso]], khop: bool) -> dict:
        """One comparison group's stats + its §C12c explanation.

        ★ The lệch group's wording is deliberately non-judgemental: lệch gợi ý
        is a neutral fact, and the arbiter is the outcome, not the suggestion.
        """
        # ``khop_goi_y is None`` (kiểu chưa phân loại) joins NEITHER group —
        # there was no suggestion, so the order says nothing about the
        # comparison. ``bool(...) is khop`` (not ``==``) keeps a stray 0/1 from
        # a driver out of the wrong bucket.
        outcomes = [
            ketso
            for kehoach, ketso in pairs
            if kehoach.khop_goi_y is not None and bool(kehoach.khop_goi_y) is khop
        ]
        so_lenh = len(outcomes)
        so_thang = sum(1 for ketso in outcomes if self._is_win(ketso))
        du_du_lieu = so_lenh >= MIN_LENH_MOI_NHOM
        ty_le = (so_thang / so_lenh * 100.0) if so_lenh else None
        ten = "Nhóm khớp gợi ý" if khop else "Nhóm lệch gợi ý"

        if so_lenh == 0:
            giai_thich = (
                f"Chưa có lệnh đã đóng nào ở {ten.lower()} — cần ít nhất "
                f"{MIN_LENH_MOI_NHOM} lệnh mỗi nhóm mới so sánh được."
            )
        elif not du_du_lieu:
            giai_thich = (
                f"{ten}: {so_thang}/{so_lenh} lệnh đã đóng thắng. Chưa đủ dữ "
                f"liệu — cần ít nhất {MIN_LENH_MOI_NHOM} lệnh đã đóng mỗi nhóm "
                f"mới kết luận, {so_lenh} lệnh thì chưa nói được gì."
            )
        elif khop:
            giai_thich = (
                f"{ten}: {so_thang}/{so_lenh} lệnh đã đóng thắng "
                f"({ty_le:.0f}%) — đây là các lệnh bạn tin đúng lớp mà IQX gợi ý "
                "ưu tiên cho kiểu cổ phiếu đó."
            )
        else:
            giai_thich = (
                f"{ten}: {so_thang}/{so_lenh} lệnh đã đóng thắng "
                f"({ty_le:.0f}%) — đây là các lệnh bạn tin lớp khác gợi ý. Lệch "
                "gợi ý KHÔNG bị tính là kém; đó chỉ là nhóm thứ hai để so, và "
                "trọng tài là kết quả thật."
            )

        return {
            "khop": khop,
            "ten": ten,
            "so_lenh": so_lenh,
            "so_thang": so_thang,
            "ty_le_thang": ty_le,
            "du_du_lieu": du_du_lieu,
            "so_lenh_toi_thieu": MIN_LENH_MOI_NHOM,
            "giai_thich": giai_thich,
        }

    async def _compute_metrics(self, user_id: uuid.UUID) -> dict:
        """Everything derived from history: the two counters, the khớp/lệch
        groups, and whether their comparison may be made at all."""
        rows = await self._doi_chieu_rows(user_id)
        so_lenh_doi_chieu = len(rows)
        kieu_da_gap = {
            kehoach.kieu_co_phieu for kehoach, _order in rows if kehoach.kieu_co_phieu
        }

        pairs = await self._closed_pairs(user_id)
        nhom_khop = self._nhom(pairs, True)
        nhom_lech = self._nhom(pairs, False)

        du_ca_2_nhom = nhom_khop["du_du_lieu"] and nhom_lech["du_du_lieu"]
        giup_ich = du_ca_2_nhom and (
            nhom_khop["ty_le_thang"] >= nhom_lech["ty_le_thang"]
        )

        return {
            "so_lenh_doi_chieu": so_lenh_doi_chieu,
            "so_kieu_da_gap": len(kieu_da_gap),
            "kieu_da_gap": sorted(kieu_da_gap),
            "so_lenh_da_ket_so": len(pairs),
            "nhom_khop": nhom_khop,
            "nhom_lech": nhom_lech,
            "ty_le_thang_khop": nhom_khop["ty_le_thang"] or 0.0,
            "ty_le_thang_lech": nhom_lech["ty_le_thang"] or 0.0,
            "du_ca_2_nhom": du_ca_2_nhom,
            "doi_chieu_giup_ich": giup_ich,
        }

    # ── Recompute + 3 nhiệm vụ ────────────────────────

    async def _recompute_progress(self, user_id: uuid.UUID, progress: Cap6Progress) -> dict:
        metrics = await self._compute_metrics(user_id)

        progress.so_lenh_doi_chieu = metrics["so_lenh_doi_chieu"]
        progress.so_kieu_da_gap = metrics["so_kieu_da_gap"]
        progress.ty_le_thang_khop = metrics["ty_le_thang_khop"]
        progress.ty_le_thang_lech = metrics["ty_le_thang_lech"]

        now = datetime.now(UTC)

        # ① lệnh đầu có đối chiếu — not gated.
        if progress.task_1_done_at is None and metrics["so_lenh_doi_chieu"] >= 1:
            progress.task_1_done_at = now

        # ② Kết sổ đầu Cấp 6 = lệnh đầu tiên CÓ ĐỐI CHIẾU đã đóng.
        if progress.task_2_done_at is None and metrics["so_lenh_da_ket_so"] >= 1:
            progress.task_2_done_at = now

        # ③ Thách thức Đối chiếu — triple condition, NOT gated.
        if progress.task_3_done_at is None and self._task3_legs(metrics)["dat_ca_3"]:
            progress.task_3_done_at = now

        await self._session.flush()
        await self._session.refresh(progress)
        return metrics

    @staticmethod
    def _task3_legs(metrics: dict) -> dict:
        """The 3 legs of nhiệm vụ ③ (spec §2③) — ALL must hold at once.

        The third leg needs BOTH groups at ≥3 closed lệnh before it can pass:
        with less evidence it is simply "chưa đủ dữ liệu", never a default pass
        or a default fail against the user.
        """
        so_lenh_dat = metrics["so_lenh_doi_chieu"] >= _TASK3_SO_LENH_MIN
        so_kieu_dat = metrics["so_kieu_da_gap"] >= _TASK3_SO_KIEU_MIN
        giup_ich_dat = bool(metrics["doi_chieu_giup_ich"])
        return {
            "so_lenh_dat": so_lenh_dat,
            "so_kieu_dat": so_kieu_dat,
            "giup_ich_dat": giup_ich_dat,
            "dat_ca_3": so_lenh_dat and so_kieu_dat and giup_ich_dat,
        }

    async def mark_task(self, user_id: uuid.UUID, task_no: int) -> Cap6Progress:
        """``PATCH /cap6/task`` — all 3 nhiệm vụ are derived from order_kehoach /
        order_ketso, so this just triggers a recompute pass (idempotent)."""
        if task_no not in _TASK_NOS:
            raise BadRequestError("task_no không hợp lệ")
        progress = await self._require_progress(user_id)
        await self._recompute_progress(user_id, progress)
        return progress

    # ── Thách thức Đối chiếu — GET /cap6/thach-thuc ────

    async def thach_thuc(self, user_id: uuid.UUID) -> dict:
        """3 sub-conditions of nhiệm vụ ③ + current values + giải thích each
        (feeds the §C12c display — never a bare number)."""
        progress = await self._require_progress(user_id)
        metrics = await self._recompute_progress(user_id, progress)
        legs = self._task3_legs(metrics)
        nhom_khop = metrics["nhom_khop"]
        nhom_lech = metrics["nhom_lech"]

        if not metrics["du_ca_2_nhom"]:
            giup_ich_giai_thich = (
                f"Chưa so sánh được: nhóm khớp gợi ý có {nhom_khop['so_lenh']} "
                f"lệnh đã đóng, nhóm lệch có {nhom_lech['so_lenh']} — mỗi nhóm "
                f"cần ít nhất {MIN_LENH_MOI_NHOM} lệnh mới kết luận. Trên 1-2 "
                "lệnh thì con số không nói được gì, nên IQX không so."
            )
        elif legs["giup_ich_dat"]:
            giup_ich_giai_thich = (
                f"Nhóm khớp gợi ý thắng {nhom_khop['ty_le_thang']:.0f}% "
                f"({nhom_khop['so_thang']}/{nhom_khop['so_lenh']} lệnh) vs nhóm "
                f"lệch {nhom_lech['ty_le_thang']:.0f}% "
                f"({nhom_lech['so_thang']}/{nhom_lech['so_lenh']} lệnh) — đối "
                "chiếu theo kiểu đang giúp bạn chọn đúng lớp."
            )
        else:
            giup_ich_giai_thich = (
                f"Nhóm khớp gợi ý thắng {nhom_khop['ty_le_thang']:.0f}% "
                f"({nhom_khop['so_thang']}/{nhom_khop['so_lenh']} lệnh), thấp hơn "
                f"nhóm lệch {nhom_lech['ty_le_thang']:.0f}% "
                f"({nhom_lech['so_thang']}/{nhom_lech['so_lenh']} lệnh). Với bạn, "
                "gợi ý theo kiểu chưa đúng — cách bạn tự chọn lớp đang cho kết "
                "quả tốt hơn; xem khối ⑭ để tìm mẫu riêng của bạn."
            )

        kieu_ten = [
            KIEU_CO_PHIEU[k]["ten"] for k in metrics["kieu_da_gap"] if k in KIEU_CO_PHIEU
        ]

        return {
            "dat_ca_3": legs["dat_ca_3"],
            "so_lenh_doi_chieu": {
                "ten": f"Đối chiếu ≥ {_TASK3_SO_LENH_MIN} lệnh có mâu thuẫn",
                "gia_tri_hien_tai": float(metrics["so_lenh_doi_chieu"]),
                "muc_tieu": float(_TASK3_SO_LENH_MIN),
                "dat": legs["so_lenh_dat"],
                "du_du_lieu": True,
                "giai_thich": (
                    f"Đã có {metrics['so_lenh_doi_chieu']}/{_TASK3_SO_LENH_MIN} "
                    "lệnh bạn đi qua bước Đối chiếu — mỗi lệnh là một lần bạn "
                    "chọn có ý thức lớp nào đáng tin khi các lớp nói ngược nhau."
                ),
            },
            "so_kieu_da_gap": {
                "ten": f"Gặp ≥ {_TASK3_SO_KIEU_MIN} kiểu cổ phiếu khác nhau",
                "gia_tri_hien_tai": float(metrics["so_kieu_da_gap"]),
                "muc_tieu": float(_TASK3_SO_KIEU_MIN),
                "dat": legs["so_kieu_dat"],
                "du_du_lieu": True,
                "giai_thich": (
                    f"Đã đối chiếu trên {metrics['so_kieu_da_gap']}/"
                    f"{_TASK3_SO_KIEU_MIN} kiểu cổ phiếu"
                    + (f" ({', '.join(kieu_ten)})" if kieu_ten else "")
                    + " — trọng số lớp khác nhau theo từng kiểu, nên cần làm quen "
                    "nhiều kiểu mới thấy được sự khác biệt."
                ),
            },
            "doi_chieu_giup_ich": {
                "ten": "Nhóm khớp gợi ý thắng ≥ nhóm lệch (mỗi nhóm ≥ 3 lệnh)",
                "gia_tri_hien_tai": metrics["ty_le_thang_khop"],
                "muc_tieu": metrics["ty_le_thang_lech"],
                "dat": legs["giup_ich_dat"],
                "du_du_lieu": metrics["du_ca_2_nhom"],
                "giai_thich": giup_ich_giai_thich,
            },
            "nhom_khop": nhom_khop,
            "nhom_lech": nhom_lech,
        }

    # ── Graduation ────────────────────────────────────

    async def graduate(self, user_id: uuid.UUID) -> Cap6Progress:
        """Graduate Cấp 6 — only when all 3 nhiệm vụ are done (thực chất ③)."""
        progress = await self._require_progress(user_id)
        await self._recompute_progress(user_id, progress)

        all_tasks_done = all(
            getattr(progress, f"task_{n}_done_at") is not None for n in _TASK_NOS
        )
        if not all_tasks_done:
            raise ConflictError("Chưa hoàn thành đủ 3 nhiệm vụ Cấp 6")

        if progress.graduated_at is None:
            now = datetime.now(UTC)
            progress.graduated_at = now
            entered = progress.entered_at
            if entered.tzinfo is None:
                entered = entered.replace(tzinfo=UTC)
            progress.time_to_graduate_hours = (now - entered).total_seconds() / 3600.0
            await self._session.flush()
            await self._session.refresh(progress)

        return progress
