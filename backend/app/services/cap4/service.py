"""Cấp 4 «Thuần thục» service — đọc + tự chấm cả 5 lớp, vũ khí / điểm mù.

★ **MỘT nhiệm vụ duy nhất** (mockup ``iqx-cap4-hanhtrinh.html``): «Đọc và chấm
đủ 5 lớp qua 20 lệnh» ⇒ ``so_lenh_doc_du_5lop >= 20``. Đó là CỔNG DUY NHẤT để
tốt nghiệp. Hai nhiệm vụ cũ ("Lệnh đầu tiên đọc đủ 5 lớp" · "Kết sổ lệnh đầu
Cấp 4") và khối "Thách thức Thuần thục" (3 điều kiện: 20 lệnh + có vũ khí VÀ
điểm mù + đồng thuận cao thắng ≥60%) đã bị GỠ. Spec ``IQX-Cap4-Spec.md`` §2/§3
mô tả bản 3 nhiệm vụ và KHÔNG còn là chuẩn nghiệm thu cho phần này.

★ **Vũ khí / điểm mù vẫn được tính** (spec §7 khối ⑨ + Khối 1 màn tốt nghiệp)
nhưng KHÔNG còn chặn tốt nghiệp: một người đọc đủ 20 lệnh mà chưa lệnh nào đóng
vẫn tốt nghiệp được, và hai nhãn kia trung thực nói "chưa đủ dữ liệu" (NULL).

Cấp 4 is FREE and Thực chiến-only, built on a graduated Cấp 3. It owns
``cap4_progress`` and EXTENDS Cấp 1's ``order_kehoach`` rows in place (new
columns ``doc_5_lop``/``ai_5_lop``/``so_lop_dong_thuan``/``so_lop_khac_ai`` on
the same physical table — see ``app.models.cap1``). It reuses
``VirtualTradingRepository`` (read-only here) for order lookups.

**Everything derived (so_lenh_doc_du_5lop, the per-lớp win rates behind
vũ khí/điểm mù, the nhiệm vụ) is recomputed
server-side from the persisted ``order_kehoach`` / ``order_ketso`` history on
every read/write — never trusted from client-supplied counters.** Even
``so_lop_dong_thuan``/``so_lop_khac_ai``, which the FE also computes for its own
display, are re-derived here from the two persisted JSON blobs before being
stored: they are pure functions of ``doc_5_lop``/``ai_5_lop``, so accepting the
client's numbers would add an unverifiable input for no benefit. The request
schema still carries them (the FE sends what it displayed) but they are
advisory only.

**★ CRITICAL PRINCIPLE (spec §4/§9) — Cấp 4 NEVER scores the user đúng/sai
against AI.** ``so_lop_khac_ai`` is a NEUTRAL count of "góc nhìn khác AI": it
is stored and echoed back for the FE's neutral purple label, and that is all.
Nothing in this module rewards agreeing with AI or penalises differing from it
— not the nhiệm vụ, not the thresholds, not the labels. Reading quality is
measured ONLY by real market outcomes (``order_ketso.pnl_pct``). The
``test_khac_ai_is_neutral`` test pins this invariant down.

Design notes (documented here since the spec leaves them implicit):
  - **"lệnh đọc đủ 5 lớp" = a BUY plan whose ``doc_5_lop`` rates all 5 lớp.**
    It is a reading-habit counter (the level's only nhiệm vụ), so it counts
    placed orders — open OR closed. Vũ khí/điểm mù instead need a result, so
    they only look at closed round trips.
  - **The nhiệm vụ is NOT gated behind anything** — it is the only one.
  - **Deliberately NOT filtered by ``entered_at``**, for the same two reasons
    Cấp 3 documents: (1) ``doc_5_lop`` can only ever be set by
    ``record_kehoach`` below, which requires a ``Cap4Progress`` row, so any row
    carrying it is inherently Cấp-4-era; (2) ``VirtualOrder.created_at`` comes
    from a low-precision ``server_default=func.now()`` while ``entered_at`` is
    a microsecond-precision Python timestamp, so same-second comparisons are
    unreliable. (The one place that DID need a real window — nhiệm vụ ② "Kết
    sổ lệnh đầu Cấp 4" — is gone, so ``_so_lenh_ketso_cap4`` went with it.)
  - **Pairing a kế hoạch (BUY) with its outcome (``order_ketso``, keyed on the
    SELL).** ``order_ketso`` has no FK back to the buy, so the pairing reuses
    Cấp 1's own rule verbatim (``Cap1Service._find_matching_buy``: the most
    recent FILLED buy for the same account+symbol at/before the sell) — the
    same approximation that produced that row's ``pnl_pct`` in the first place,
    applied in Python over the user's own (small) history so the whole walk
    costs 3 queries. Like Cấp 1 it is a single-lot approximation: an
    average-cost account that sells one symbol twice against one buy will
    attribute that buy's reading to both outcomes.
  - **vũ khí / điểm mù (spec §7 khối ⑨ + §8)**: for each lớp, among CLOSED
    orders where the user self-rated that lớp Ủng hộ (``'ok'``), the REAL win
    rate (``pnl_pct > 0``). ≥70% → vũ khí, <50% → điểm mù, and **≥3 closed
    lệnh for that lớp** are required before any label ("chưa đủ dữ liệu"
    below that). ``vu_khi_lop``/``diem_mu_lop`` on the progress row are the
    best / worst QUALIFYING lớp (ties broken by more evidence, then by the
    canonical lớp order) so the labels are deterministic.
  - **``ty_le_thang_dong_thuan_cao`` is GONE** — it was ``NOT NULL DEFAULT 0``
    and answered "0%" to "chưa có lệnh đồng thuận cao nào", i.e. printed a
    number it did not have (luật 1 của repo). It only ever fed điều kiện 3 of
    the removed Thách thức, so it left with it. ``order_kehoach
    .so_lop_dong_thuan`` itself STAYS — Kết sổ/Phân tích danh mục still read it.
  - Once ``task_1_done_at`` is stamped it is NEVER un-stamped, matching Cấp
    1/2/3's "stamp when first met" pattern.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap1 import OrderKehoach, OrderKetso
from app.models.cap3 import Cap3Progress
from app.models.cap4 import LOP_KEYS, LOP_LABELS, Cap4Progress, NhanDinhLop
from app.models.virtual_trading import OrderSide, OrderStatus, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository

#: Cấp 4 chỉ còn MỘT nhiệm vụ.
_TASK_NOS = (1,)

_NHAN_DINH_VALUES = frozenset(m.value for m in NhanDinhLop)

#: Nhiệm vụ DUY NHẤT — «Đọc và chấm đủ 5 lớp qua 20 lệnh».
_TASK1_SO_LENH_MIN = 20

# Vũ khí / điểm mù (spec §7 khối ⑨ + §8).
_VU_KHI_MIN_PCT = 70.0
_DIEM_MU_MAX_PCT = 50.0
_MIN_LENH_MOI_LOP = 3

_MUC_LABELS = {
    NhanDinhLop.OK.value: "Ủng hộ",
    NhanDinhLop.NEU.value: "Trung tính",
    NhanDinhLop.BAD.value: "Ngược chiều",
}

_VU_KHI_GIAI_THICH = (
    "Đo bằng KẾT QUẢ THẬT của thị trường, không phải độ khớp AI: với mỗi lớp, "
    f"lấy các lệnh đã đóng mà bạn tự đọc lớp đó là Ủng hộ rồi tính % lệnh thắng. "
    f"≥{_VU_KHI_MIN_PCT:.0f}% là vũ khí, <{_DIEM_MU_MAX_PCT:.0f}% là điểm mù, "
    f"cần ít nhất {_MIN_LENH_MOI_LOP} lệnh đã đóng mỗi lớp mới kết luận."
)


class Cap4Service:
    """Business logic for the free Cấp 4 «Thuần thục» flow."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._vt_repo = VirtualTradingRepository(session)

    # ── Progress row ─────────────────────────────────

    async def _get_progress_row(self, user_id: uuid.UUID) -> Cap4Progress | None:
        result = await self._session.execute(
            select(Cap4Progress).where(Cap4Progress.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_progress(self, user_id: uuid.UUID) -> Cap4Progress | None:
        progress = await self._get_progress_row(user_id)
        if progress is None:
            return None
        await self._recompute_progress(user_id, progress)
        return progress

    async def enter(self, user_id: uuid.UUID) -> Cap4Progress:
        """Enter Cấp 4 (idempotent). Requires the user to have graduated Cấp 3."""
        progress = await self._get_progress_row(user_id)
        if progress is not None:
            return progress

        cap3_result = await self._session.execute(
            select(Cap3Progress).where(Cap3Progress.user_id == user_id)
        )
        cap3_progress = cap3_result.scalar_one_or_none()
        if cap3_progress is None:
            raise NotFoundError("tiến trình Cấp 3")
        if cap3_progress.graduated_at is None:
            raise ConflictError("Chưa tốt nghiệp Cấp 3")

        progress = Cap4Progress(user_id=user_id, entered_at=datetime.now(UTC))
        self._session.add(progress)
        await self._session.flush()
        await self._session.refresh(progress)
        return progress

    # ── Kế hoạch — khối "Đọc 5 lớp" (spec §5) ─────────

    @staticmethod
    def _validate_lop_map(value: Any, field: str) -> dict[str, str]:
        """Validate a ``{lop: 'ok'|'neu'|'bad'}`` payload (spec §5.1/§8).

        Partial maps are allowed on purpose: the FE writes the plan when the
        order is placed and only a plan rating ALL 5 lớp counts toward the
        nhiệm vụ, so a half-read plan must still be storable (it simply never
        counts) rather than rejected.
        """
        if not isinstance(value, dict):
            raise BadRequestError(f"{field} phải là object dạng {{lớp: mức}}")
        if not value:
            raise BadRequestError(f"{field} không được để trống")
        cleaned: dict[str, str] = {}
        for lop, muc in value.items():
            if lop not in LOP_KEYS:
                raise BadRequestError(f"Lớp không hợp lệ: {lop}")
            muc_value = muc.value if isinstance(muc, NhanDinhLop) else muc
            if muc_value not in _NHAN_DINH_VALUES:
                raise BadRequestError(
                    f"Nhận định lớp {LOP_LABELS[lop]} không hợp lệ: {muc_value}"
                )
            cleaned[lop] = str(muc_value)
        return cleaned

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
        doc_5_lop: Any,
        ai_5_lop: Any = None,
        so_lop_dong_thuan: int | None = None,  # noqa: ARG002 — advisory, see below
        so_lop_khac_ai: int | None = None,  # noqa: ARG002 — advisory, see below
    ) -> OrderKehoach:
        """Adds the "Đọc 5 lớp" block to the EXISTING ``order_kehoach`` row
        created by Cấp 1's ``/cap1/kehoach`` (Cấp 1's vùng mua, Cấp 2's SL/TP
        and Cấp 3's quản lý vốn are filled first; Cấp 4 only inserts this block
        — spec §5's "panel Cấp 3 giữ nguyên, thay riêng phần lý do mua").

        ``so_lop_dong_thuan``/``so_lop_khac_ai`` are accepted for API symmetry
        with the FE but are ADVISORY: both are re-derived here from the two
        JSON blobs (never trust the client). ``so_lop_khac_ai`` stays a purely
        neutral count — see this module's CRITICAL PRINCIPLE note.
        """
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 4")

        order = await self._vt_repo.get_order_by_id(order_id)
        if order is None or order.user_id != user_id:
            raise NotFoundError("lệnh")
        if order.side != OrderSide.BUY:
            raise BadRequestError("Đọc 5 lớp chỉ ghi cho lệnh MUA")

        doc_clean = self._validate_lop_map(doc_5_lop, "doc_5_lop")
        ai_clean = (
            self._validate_lop_map(ai_5_lop, "ai_5_lop") if ai_5_lop is not None else None
        )

        kehoach = await self._get_kehoach_by_order(order_id)
        if kehoach is None:
            raise NotFoundError("kế hoạch Cấp 1 — cần ghi vùng mua trước")

        kehoach.doc_5_lop = doc_clean
        kehoach.ai_5_lop = ai_clean
        if ai_clean is None:
            # AI chưa lộ (user chưa chấm đủ 5 lớp) → chưa có gì để đối chiếu.
            kehoach.so_lop_dong_thuan = None
            kehoach.so_lop_khac_ai = None
        else:
            kehoach.so_lop_dong_thuan = sum(
                1 for muc in ai_clean.values() if muc == NhanDinhLop.OK.value
            )
            kehoach.so_lop_khac_ai = sum(
                1 for lop, muc in ai_clean.items() if lop in doc_clean and doc_clean[lop] != muc
            )
        await self._session.flush()
        await self._session.refresh(kehoach)

        await self._recompute_progress(user_id, progress)
        return kehoach

    # ── Source rows ───────────────────────────────────

    async def _cap4_kehoach_rows(
        self, user_id: uuid.UUID
    ) -> list[tuple[OrderKehoach, VirtualOrder]]:
        """``order_kehoach`` rows that carry a Cấp 4 reading, with their BUY
        order (see the module docstring for why there is no ``entered_at``
        filter)."""
        result = await self._session.execute(
            select(OrderKehoach, VirtualOrder)
            .join(VirtualOrder, VirtualOrder.id == OrderKehoach.order_id)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.mode == "thuc_chien",
                OrderKehoach.doc_5_lop.is_not(None),
            )
            .order_by(VirtualOrder.created_at.asc())
        )
        return [(kehoach, order) for kehoach, order in result.all()]

    async def _closed_pairs(
        self, user_id: uuid.UUID
    ) -> list[tuple[OrderKehoach, OrderKetso]]:
        """Every closed round trip whose BUY carries a Cấp 4 reading, paired
        with its ``order_ketso`` outcome (pairing rule = Cấp 1's, see the
        module docstring)."""
        kehoach_rows = await self._cap4_kehoach_rows(user_id)
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

    # ── Metrics (vũ khí / điểm mù) ────────────────────

    @staticmethod
    def _is_win(ketso: OrderKetso) -> bool:
        return ketso.pnl_pct > 0

    async def _compute_metrics(self, user_id: uuid.UUID) -> dict:
        """Everything derived from history: per-lớp REAL win rates, vũ khí /
        điểm mù, so_lenh_doc_du_5lop, ty_le_thang_dong_thuan_cao."""
        kehoach_rows = await self._cap4_kehoach_rows(user_id)
        so_lenh_doc_du_5lop = sum(
            1
            for kehoach, _order in kehoach_rows
            if isinstance(kehoach.doc_5_lop, dict)
            and all(kehoach.doc_5_lop.get(lop) in _NHAN_DINH_VALUES for lop in LOP_KEYS)
        )

        pairs = await self._closed_pairs(user_id)

        per_lop: list[dict] = []
        for lop in LOP_KEYS:
            outcomes = [
                ketso
                for kehoach, ketso in pairs
                if isinstance(kehoach.doc_5_lop, dict)
                and kehoach.doc_5_lop.get(lop) == NhanDinhLop.OK.value
            ]
            n_orders = len(outcomes)
            n_wins = sum(1 for ketso in outcomes if self._is_win(ketso))
            win_rate = (n_wins / n_orders * 100.0) if n_orders else None

            if n_orders < _MIN_LENH_MOI_LOP:
                nhan: str | None = "chua_du_du_lieu"
            elif win_rate is not None and win_rate >= _VU_KHI_MIN_PCT:
                nhan = "vu_khi"
            elif win_rate is not None and win_rate < _DIEM_MU_MAX_PCT:
                nhan = "diem_mu"
            else:
                nhan = None

            per_lop.append(
                {
                    "lop": lop,
                    "ten": LOP_LABELS[lop],
                    "n_orders": n_orders,
                    "n_wins": n_wins,
                    "win_rate": win_rate,
                    "nhan": nhan,
                    "giai_thich": self._lop_giai_thich(lop, n_orders, n_wins, win_rate, nhan),
                }
            )

        vu_khi_candidates = sorted(
            (row for row in per_lop if row["nhan"] == "vu_khi"),
            key=lambda row: (-row["win_rate"], -row["n_orders"], LOP_KEYS.index(row["lop"])),
        )
        diem_mu_candidates = sorted(
            (row for row in per_lop if row["nhan"] == "diem_mu"),
            key=lambda row: (row["win_rate"], -row["n_orders"], LOP_KEYS.index(row["lop"])),
        )

        # Sorted by REAL win rate desc (spec §7 khối ⑨); lớp with no closed
        # lệnh at all (win_rate None) go last.
        lop_sorted = sorted(
            per_lop,
            key=lambda row: (
                row["win_rate"] is None,
                -(row["win_rate"] or 0.0),
                LOP_KEYS.index(row["lop"]),
            ),
        )

        return {
            "so_lenh_doc_du_5lop": so_lenh_doc_du_5lop,
            "lop": lop_sorted,
            "vu_khi_lop": vu_khi_candidates[0]["lop"] if vu_khi_candidates else None,
            "diem_mu_lop": diem_mu_candidates[0]["lop"] if diem_mu_candidates else None,
        }

    @staticmethod
    def _lop_giai_thich(
        lop: str, n_orders: int, n_wins: int, win_rate: float | None, nhan: str | None
    ) -> str:
        """§C12c — every number carries its provenance + a plain-Vietnamese read."""
        ten = LOP_LABELS[lop]
        muc = _MUC_LABELS[NhanDinhLop.OK.value]
        if n_orders == 0:
            return (
                f"Chưa có lệnh nào đã đóng mà bạn tự đọc lớp {ten} là {muc} — "
                f"cần ít nhất {_MIN_LENH_MOI_LOP} lệnh mới kết luận được."
            )
        head = (
            f"Khi bạn tự đọc lớp {ten} là {muc}: {n_wins}/{n_orders} lệnh đã đóng "
            f"thắng ({win_rate:.1f}%)."
        )
        if nhan == "chua_du_du_lieu":
            return (
                f"{head} Chưa đủ dữ liệu để kết luận — cần ít nhất "
                f"{_MIN_LENH_MOI_LOP} lệnh đã đóng cho lớp này."
            )
        if nhan == "vu_khi":
            return f"{head} Từ {_VU_KHI_MIN_PCT:.0f}% trở lên — đây là vũ khí của bạn."
        if nhan == "diem_mu":
            return (
                f"{head} Dưới {_DIEM_MU_MAX_PCT:.0f}% — đây là điểm mù, xem lại cách "
                f"bạn đọc lớp này."
            )
        return (
            f"{head} Nằm giữa {_DIEM_MU_MAX_PCT:.0f}% và {_VU_KHI_MIN_PCT:.0f}% — "
            "chưa thành vũ khí, cũng chưa phải điểm mù."
        )

    # ── Recompute + nhiệm vụ DUY NHẤT ─────────────────

    async def _recompute_progress(self, user_id: uuid.UUID, progress: Cap4Progress) -> dict:
        metrics = await self._compute_metrics(user_id)

        progress.so_lenh_doc_du_5lop = metrics["so_lenh_doc_du_5lop"]
        # Có thể quay về None khi lịch sử chưa đủ 3 lệnh/lớp — "chưa biết" phải
        # đi ngược lại được, không được đóng băng một nhãn cũ.
        progress.vu_khi_lop = metrics["vu_khi_lop"]
        progress.diem_mu_lop = metrics["diem_mu_lop"]

        # ① «Đọc và chấm đủ 5 lớp qua 20 lệnh» — cổng DUY NHẤT, không gate gì.
        if progress.task_1_done_at is None and self._task1_dat(progress):
            progress.task_1_done_at = datetime.now(UTC)

        await self._session.flush()
        await self._session.refresh(progress)
        return metrics

    @staticmethod
    def _task1_dat(progress: Cap4Progress) -> bool:
        """Nhiệm vụ ① đạt chưa — đọc off the recomputed row."""
        return progress.so_lenh_doc_du_5lop >= _TASK1_SO_LENH_MIN

    async def mark_task(self, user_id: uuid.UUID, task_no: int) -> Cap4Progress:
        """PATCH /cap4/task — nhiệm vụ duy nhất được suy ra từ lịch sử lệnh, nên
        endpoint này chỉ kích hoạt tính lại (idempotent)."""
        if task_no not in _TASK_NOS:
            raise BadRequestError("task_no không hợp lệ")
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 4")
        await self._recompute_progress(user_id, progress)
        return progress

    # ── Vũ khí & điểm mù — GET /cap4/vu-khi-diem-mu ────

    async def vu_khi_diem_mu(self, user_id: uuid.UUID) -> dict:
        """Per-lớp REAL win rate when self-rated Ủng hộ + the identified vũ khí
        / điểm mù (spec §7 khối ⑨) — with counts + giải thích so the FE can show
        provenance (§C12c)."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 4")
        metrics = await self._recompute_progress(user_id, progress)

        return {
            "lop": metrics["lop"],
            "vu_khi_lop": metrics["vu_khi_lop"],
            "diem_mu_lop": metrics["diem_mu_lop"],
            "so_lenh_toi_thieu": _MIN_LENH_MOI_LOP,
            "nguong_vu_khi": _VU_KHI_MIN_PCT,
            "nguong_diem_mu": _DIEM_MU_MAX_PCT,
            "giai_thich": _VU_KHI_GIAI_THICH,
        }

    # ── Graduation ────────────────────────────────────

    async def graduate(self, user_id: uuid.UUID) -> Cap4Progress:
        """Graduate Cấp 4 — chỉ khi xong nhiệm vụ duy nhất (20 lệnh đọc đủ 5 lớp).

        ★ Vũ khí/điểm mù KHÔNG còn là điều kiện: chúng cần lệnh ĐÃ ĐÓNG, nên
        gắn chúng vào cổng tốt nghiệp sẽ nhốt một người đã đọc đủ 20 lệnh chỉ
        vì thị trường chưa cho họ đủ kết quả.
        """
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 4")
        await self._recompute_progress(user_id, progress)

        all_tasks_done = all(
            getattr(progress, f"task_{n}_done_at") is not None for n in _TASK_NOS
        )
        if not all_tasks_done:
            raise ConflictError("Chưa hoàn thành nhiệm vụ Cấp 4")

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
