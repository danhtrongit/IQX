"""Cấp 0 onboarding service — progress, placement, tasks, kế hoạch, graduation.

Cap 0 is FREE. This service owns the ``cap0_progress``, ``cap0_order_kehoach``
and ``user_placement`` rows and reuses the virtual-trading repo to seed a 250tr
practice account on entry. It does NOT touch the virtual-trading engine
(matching/settlement).

Spec v3.0: **5 nhiệm vụ**, **1 cổng hành vi** (đóng màn Kết sổ ở ⑤). No cắt
lỗ/chốt lời anywhere.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap0 import (
    LY_DO_DOI_THUONG_LABELS,
    Cap0OrderKehoach,
    Cap0Progress,
    LyDoDoiThuong,
    UserPlacement,
)
from app.models.virtual_trading import OrderSide, OrderStatus, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.virtual_trading.settlement import is_trading_day

_VN_TZ = timezone(timedelta(hours=7))

_CAP0_INITIAL_CASH_VND = 250_000_000
_CAP0_ORDER_MODE = "san_tap"
_TASK_NOS = (1, 2, 3, 4, 5)
_GATE_ATTR = {
    "star": "task1_star_clicked",
    "debrief": "task5_debrief_done",
}
#: ⑤ «Bán một lệnh — Kết sổ đầu tiên» is earned ONLY by closing the Kết sổ
#: (spec §4 Chặng 3: "cổng hành vi (duy nhất của Cấp 0)"), so the task number and
#: its gate are written together or not at all.
_TASK_REQUIRED_GATE = {5: "debrief"}

#: Reverse lookup so the FE may post either the slug or the verbatim §4 chip
#: label. Keyed on the exact spec strings — anything else is rejected.
_LY_DO_BY_LABEL = {label: member for member, label in LY_DO_DOI_THUONG_LABELS.items()}


@dataclass(frozen=True)
class Cap0KehoachView:
    """Read model for the Cấp 0 Kết sổ (§5) — the persisted chip plus everything
    else derived live from ``virtual_orders``, never stored twice."""

    id: uuid.UUID
    order_id: uuid.UUID
    symbol: str
    mode: str
    ly_do_doi_thuong: LyDoDoiThuong
    ly_do_label: str
    mua_luc: datetime
    ngay_mua: date
    gia_vao: int | None
    so_phien_giu: int


class Cap0Service:
    """Business logic for the free Cấp 0 onboarding flow."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._vt_repo = VirtualTradingRepository(session)

    async def _get_progress_row(self, user_id: uuid.UUID) -> Cap0Progress | None:
        result = await self._session.execute(
            select(Cap0Progress).where(Cap0Progress.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_progress(self, user_id: uuid.UUID) -> Cap0Progress | None:
        return await self._get_progress_row(user_id)

    async def enter(self, user_id: uuid.UUID) -> Cap0Progress:
        """Enter Cấp 0 (idempotent) and seed a 250tr account if the user has none."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            progress = Cap0Progress(
                user_id=user_id,
                entered_at=datetime.now(UTC),
                virtual_balance_init=_CAP0_INITIAL_CASH_VND,
            )
            self._session.add(progress)
            await self._session.flush()
            await self._session.refresh(progress)

        # Seed a practice account only if the user does not already have one.
        account = await self._vt_repo.get_account_by_user_id(user_id)
        if account is None:
            await self._vt_repo.create_account(user_id, _CAP0_INITIAL_CASH_VND)

        return progress

    async def set_placement(self, user_id: uuid.UUID, has_traded: bool) -> UserPlacement:
        """Record the placement answer (idempotent — re-answering overwrites)."""
        result = await self._session.execute(
            select(UserPlacement).where(UserPlacement.user_id == user_id)
        )
        placement = result.scalar_one_or_none()
        placed_level = 2 if has_traded else 0
        if placement is None:
            placement = UserPlacement(
                user_id=user_id,
                has_traded_before=has_traded,
                placed_level=placed_level,
            )
            self._session.add(placement)
        else:
            placement.has_traded_before = has_traded
            placement.placed_level = placed_level
        await self._session.flush()
        await self._session.refresh(placement)
        return placement

    async def complete_task(
        self, user_id: uuid.UUID, task_no: int, gate: str | None = None
    ) -> Cap0Progress:
        """Mark task ``task_no`` (1-5) done (idempotent) and optionally set a gate.

        Nhiệm vụ ⑤ requires ``gate="debrief"``: it is the one task whose
        completion IS a behaviour gate, so a bare ``{task_no: 5}`` must not be
        able to mark it done behind the gate's back.
        """
        if task_no not in _TASK_NOS:
            raise BadRequestError("task_no không hợp lệ (Cấp 0 có 5 nhiệm vụ)")
        if gate is not None and gate not in _GATE_ATTR:
            raise BadRequestError("gate không hợp lệ")

        required_gate = _TASK_REQUIRED_GATE.get(task_no)
        if required_gate is not None and gate != required_gate:
            raise BadRequestError(
                f"Nhiệm vụ {task_no} chỉ hoàn thành khi đóng màn Kết sổ "
                f'(cần gate="{required_gate}")'
            )

        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 0")

        done_attr = f"task_{task_no}_done_at"
        if getattr(progress, done_attr) is None:
            setattr(progress, done_attr, datetime.now(UTC))

        if gate is not None:
            setattr(progress, _GATE_ATTR[gate], True)

        await self._session.flush()
        await self._session.refresh(progress)
        return progress

    async def graduate(self, user_id: uuid.UUID) -> Cap0Progress:
        """Graduate Cấp 0 — 5/5 nhiệm vụ + the single behaviour gate (§9)."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 0")

        all_tasks_done = all(
            getattr(progress, f"task_{n}_done_at") is not None for n in _TASK_NOS
        )
        gates_ok = progress.task5_debrief_done
        if not (all_tasks_done and gates_ok):
            raise ConflictError("Chưa hoàn thành đủ nhiệm vụ và cổng Cấp 0")

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

    # ── Kế hoạch Cấp 0 — chip lý do đời thường (spec §4/§10) ─────

    @staticmethod
    def _parse_ly_do(raw: str) -> LyDoDoiThuong:
        """Accept either the slug (``thu_cho_biet``) or the verbatim §4 chip label
        (``Thử cho biết``). The FE holds the label; storing the slug keeps the
        column stable across copy edits, and accepting both means a tweak on
        either side cannot silently drop the chip."""
        if isinstance(raw, str):
            candidate = raw.strip()
            if candidate in _LY_DO_BY_LABEL:
                return _LY_DO_BY_LABEL[candidate]
            try:
                return LyDoDoiThuong(candidate)
            except ValueError:
                pass
        raise BadRequestError("ly_do_doi_thuong không hợp lệ")

    @staticmethod
    def _count_trading_sessions(start: date, end: date) -> int:
        """Trading sessions strictly after ``start`` through ``end`` (Mon-Fri, no
        holiday calendar) — mirrors ``Cap1Service._count_trading_sessions``.
        Copied rather than imported: Cấp 1 depends on Cấp 0, not the reverse.

        A same-session round trip is **0 phiên**, not a fabricated 1.
        """
        if end <= start:
            return 0
        count = 0
        d = start
        while d < end:
            d += timedelta(days=1)
            if is_trading_day(d, set()):
                count += 1
        return count

    async def _get_kehoach_by_order(self, order_id: uuid.UUID) -> Cap0OrderKehoach | None:
        result = await self._session.execute(
            select(Cap0OrderKehoach).where(Cap0OrderKehoach.order_id == order_id)
        )
        return result.scalar_one_or_none()

    async def record_kehoach(
        self, user_id: uuid.UUID, order_id: uuid.UUID, *, ly_do_doi_thuong: str
    ) -> Cap0OrderKehoach:
        """Persist the khối "Kế hoạch" chip for a Sân tập BUY order.

        **Why a separate ``cap0_order_kehoach`` table instead of reusing Cấp 1's
        ``order_kehoach`` row** (spec §10 sketches the same table name; four
        concrete facts about the existing table make sharing it unsafe):

        1. ``order_kehoach.lyDo`` is a NOT NULL enum over Cấp 1's five
           *analytical* lý do. Cấp 0's five chips are a disjoint, everyday
           vocabulary; widening that enum would let a Cấp 1 order be filed under
           "Thấy trên mạng".
        2. ``trangThai_luc_dat`` and ``vung_mua`` are NOT NULL, so a Cấp 0 row
           could only exist by fabricating an AI Thanh tra verdict — a value the
           user never saw and Cấp 1 later reads as real.
        3. ``order_kehoach.order_id`` is UNIQUE and
           ``Cap1Service.record_kehoach`` raises ``ConflictError`` when a row
           already exists. A Cấp 0 row on that order would permanently block the
           Cấp 1 Form Kế hoạch for the same order — it cannot collide here
           because the two rows live in different tables.
        4. ``Cap1Service._recompute_counters`` counts DISTINCT
           ``order_kehoach.lyDo`` per user for nhiệm vụ ③ ("đủ 5 lý do"). A Cấp 0
           row would inflate that counter with a reason the user never
           analytically chose.

        Neither direction can clobber the other: Cấp 1 writes ``order_kehoach``
        and never reads or updates ``cap0_order_kehoach``, and this method writes
        only its own table. ``tests/test_cap0.py::
        test_cap0_chip_cannot_collide_with_or_clobber_cap1_kehoach`` pins that.

        ``mode`` and the buy timestamp are not stored — they are read back off
        ``virtual_orders`` by :meth:`get_latest_kehoach_view` (spec §10 tags the
        row ``mode='san_tap'``; that fact already lives on the order, and this
        method refuses any order that is not ``san_tap``).

        Repeat calls for the same order UPSERT the chip rather than 409-ing: the
        FE records at fill time and a retry must never dead-end the user.
        """
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 0")

        ly_do_enum = self._parse_ly_do(ly_do_doi_thuong)

        order = await self._vt_repo.get_order_by_id(order_id)
        if order is None or order.user_id != user_id:
            raise NotFoundError("lệnh")
        if order.side != OrderSide.BUY:
            raise BadRequestError("Kế hoạch Cấp 0 chỉ ghi cho lệnh MUA")
        if order.mode != _CAP0_ORDER_MODE:
            raise BadRequestError("Kế hoạch Cấp 0 chỉ ghi cho lệnh Sân tập")

        kehoach = await self._get_kehoach_by_order(order_id)
        if kehoach is None:
            kehoach = Cap0OrderKehoach(order_id=order_id, ly_do_doi_thuong=ly_do_enum)
            self._session.add(kehoach)
        else:
            kehoach.ly_do_doi_thuong = ly_do_enum
        await self._session.flush()
        await self._session.refresh(kehoach)
        return kehoach

    def _build_view(
        self, kehoach: Cap0OrderKehoach, order: VirtualOrder, den_ngay: date
    ) -> Cap0KehoachView:
        return Cap0KehoachView(
            id=kehoach.id,
            order_id=kehoach.order_id,
            symbol=order.symbol,
            mode=order.mode,
            ly_do_doi_thuong=kehoach.ly_do_doi_thuong,
            ly_do_label=LY_DO_DOI_THUONG_LABELS[kehoach.ly_do_doi_thuong],
            mua_luc=order.created_at,
            ngay_mua=order.trading_date,
            gia_vao=order.filled_price_vnd,
            so_phien_giu=self._count_trading_sessions(order.trading_date, den_ngay),
        )

    async def get_kehoach_view(
        self, user_id: uuid.UUID, order_id: uuid.UUID, *, den_ngay: date | None = None
    ) -> Cap0KehoachView | None:
        """Read model for ONE order's recorded chip. ``None`` when the order has
        no chip, is not the caller's, or is not a Sân tập buy."""
        den_ngay = den_ngay or datetime.now(_VN_TZ).date()
        result = await self._session.execute(
            select(Cap0OrderKehoach, VirtualOrder)
            .join(VirtualOrder, VirtualOrder.id == Cap0OrderKehoach.order_id)
            .where(
                Cap0OrderKehoach.order_id == order_id,
                VirtualOrder.user_id == user_id,
            )
        )
        row = result.first()
        if row is None:
            return None
        kehoach, order = row
        return self._build_view(kehoach, order, den_ngay)

    async def get_latest_kehoach_view(
        self, user_id: uuid.UUID, symbol: str, *, den_ngay: date | None = None
    ) -> Cap0KehoachView | None:
        """Most recent recorded Cấp 0 chip for a FILLED Sân tập BUY of ``symbol``.

        Returns ``None`` when there is none — the Kết sổ shows nothing rather
        than a fabricated row.

        ``so_phien_giu`` ("Thời gian giữ") is DERIVED from the buy order's
        ``trading_date`` through ``den_ngay`` (default: today in VN time). The
        Kết sổ opens the instant the sell fills, so "today" is the sell session
        in every real flow; ``den_ngay`` exists so tests — and any future
        back-dated read — can be exact.
        """
        den_ngay = den_ngay or datetime.now(_VN_TZ).date()
        result = await self._session.execute(
            select(Cap0OrderKehoach, VirtualOrder)
            .join(VirtualOrder, VirtualOrder.id == Cap0OrderKehoach.order_id)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.symbol == symbol.strip().upper(),
                VirtualOrder.side == OrderSide.BUY,
                VirtualOrder.status == OrderStatus.FILLED,
                VirtualOrder.mode == _CAP0_ORDER_MODE,
            )
            .order_by(VirtualOrder.trading_date.desc(), VirtualOrder.created_at.desc())
            .limit(1)
        )
        row = result.first()
        if row is None:
            return None
        kehoach, order = row
        return self._build_view(kehoach, order, den_ngay)
