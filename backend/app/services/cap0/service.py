"""Cấp 0 onboarding service — progress, placement, tasks, kế hoạch, graduation.

Cap 0 is FREE. This service owns the ``cap0_progress``, ``cap0_order_kehoach``
and ``user_placement`` rows and reuses the virtual-trading repo to seed a 100tr
practice account on entry. It does NOT touch the virtual-trading engine
(matching/settlement).

**5 nhiệm vụ / 3 chặng**: BUY + ★, ba product tours, rồi SELL + Kết sổ.
Cấp 0 không có cắt lỗ/chốt lời.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap0 import (
    LY_DO_DOI_THUONG_LABELS,
    Cap0OrderKehoach,
    Cap0Progress,
    LyDoDoiThuong,
    PlacementExperience,
    UserPlacement,
)
from app.models.virtual_trading import OrderSide, OrderStatus, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.virtual_trading.settlement import is_trading_day

#: Số dư Sân tập — 100 triệu VND, MỘT con số cho mọi cấp (yêu cầu điều chỉnh).
#: Cùng giá trị với ``VirtualTradingRepository.create_default_config`` để tài
#: khoản mở qua Cấp 0 hay qua ``activate`` đều bắt đầu bằng cùng một số dư.
_CAP0_INITIAL_CASH_VND = 100_000_000
#: The order engine owns the level→mode decision. This service validates the
#: user's evidence without duplicating that resolver.
_TASK_NOS = (1, 2, 3, 4, 5)
_GATE_ATTR = {
    "star": "task1_star_clicked",
    "debrief": "task5_debrief_done",
}
#: ① needs the watchlist star; ⑤ needs the closeout debrief.
_TASK_REQUIRED_GATE = {1: "star", 5: "debrief"}

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
    #: ``None`` while the position is still open — a round trip that has not
    #: closed has no length yet, and "so far, counted to today" is a different
    #: number wearing the same label. The Kết sổ renders it as "—".
    so_phien_giu: int | None


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
        """Enter Cấp 0 (idempotent) and seed a 100tr account if the user has none."""
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

    async def get_placement(self, user_id: uuid.UUID) -> UserPlacement | None:
        result = await self._session.execute(
            select(UserPlacement).where(UserPlacement.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def set_placement(
        self,
        user_id: uuid.UUID,
        answer: str | None = None,
        *,
        has_traded: bool | None = None,
    ) -> UserPlacement:
        """Record one of the three placement answers (idempotent)."""
        result = await self._session.execute(
            select(UserPlacement).where(UserPlacement.user_id == user_id)
        )
        placement = result.scalar_one_or_none()
        if answer is None and has_traded is not None:
            answer = "unsure" if has_traded else "never"
        try:
            experience = PlacementExperience(answer)
        except ValueError as exc:
            raise BadRequestError("Câu trả lời xếp lớp không hợp lệ") from exc
        placed_level = {
            PlacementExperience.NEVER: 0,
            PlacementExperience.UNSURE: 1,
            PlacementExperience.REGULAR: 2,
        }[experience]
        has_traded = experience is not PlacementExperience.NEVER
        if placement is None:
            placement = UserPlacement(
                user_id=user_id,
                has_traded_before=has_traded,
                experience=experience,
                placed_level=placed_level,
            )
            self._session.add(placement)
        else:
            placement.has_traded_before = has_traded
            placement.experience = experience
            placement.placed_level = placed_level
        await self._session.flush()
        await self._session.refresh(placement)
        return placement

    async def complete_tours(self, user_id: uuid.UUID) -> UserPlacement:
        """Set the global product-tour flag for directly placed users."""
        placement = await self.get_placement(user_id)
        if placement is None:
            raise NotFoundError("kết quả xếp lớp")
        placement.da_xem_tour = True
        # Avoid an import cycle at module import time.
        from app.models.cap1 import Cap1Progress

        result = await self._session.execute(
            select(Cap1Progress).where(Cap1Progress.user_id == user_id)
        )
        cap1 = result.scalar_one_or_none()
        if cap1 is not None:
            cap1.da_xem_tour = True
        await self._session.flush()
        await self._session.refresh(placement)
        return placement

    async def complete_tour(
        self, user_id: uuid.UUID, tour: str, *, skipped: bool = False
    ) -> tuple[UserPlacement, list[str]]:
        """Persist one of the three reusable product tours.

        Skipping is a documented completion action: it records the same fact;
        analytics keeps ``skipped`` so product teams can distinguish it.
        """
        mapping = {
            "phantich": ("tour_phantich_done_at", 2),
            "bantin": ("tour_bantin_done_at", 3),
            "bctc": ("tour_bctc_done_at", 4),
        }
        if tour not in mapping:
            raise BadRequestError("Tour không hợp lệ")
        placement = await self.get_placement(user_id)
        if placement is None:
            raise NotFoundError("kết quả xếp lớp")
        attr, task_no = mapping[tour]
        now = datetime.now(UTC)
        if getattr(placement, attr) is None:
            setattr(placement, attr, now)

        progress = await self._get_progress_row(user_id)
        if progress is not None and progress.graduated_at is None:
            if progress.task_1_done_at is None:
                raise ConflictError("Cần hoàn thành lệnh MUA đầu tiên trước khi xem tour")
            done_attr = f"task_{task_no}_done_at"
            if getattr(progress, done_attr) is None:
                setattr(progress, done_attr, now)

        completed = [
            key for key, (field, _) in mapping.items() if getattr(placement, field) is not None
        ]
        placement.da_xem_tour = len(completed) == len(mapping)

        from app.models.cap1 import Cap1Progress
        result = await self._session.execute(
            select(Cap1Progress).where(Cap1Progress.user_id == user_id)
        )
        cap1 = result.scalar_one_or_none()
        if cap1 is not None:
            cap1.da_xem_tour = placement.da_xem_tour

        from app.services.journey_events import record_journey_event
        event = "cap1_tour_complete" if placement.placed_level > 0 else "cap0_task_complete"
        fields = {"tour": tour, "skipped": skipped}
        if event == "cap0_task_complete":
            fields["task_id"] = task_no
        await record_journey_event(
            self._session,
            user_id,
            event,
            fields,
            dedup_key=f"{tour}:{getattr(placement, attr).isoformat()}",
        )
        await self._session.flush()
        await self._session.refresh(placement)
        return placement, completed

    async def complete_task(
        self, user_id: uuid.UUID, task_no: int, gate: str | None = None
    ) -> Cap0Progress:
        """Mark one of five tasks done, enforcing evidence for ① and ⑤.

        ① requires the ★ event and a real filled BUY carrying a Cấp-0 plan.
        ⑤ requires the debrief-close event and a real filled SELL after a
        planned BUY. Tour tasks ②-④ are credited by their completion events.
        """
        if task_no not in _TASK_NOS:
            raise BadRequestError("task_no không hợp lệ (Cấp 0 có 5 nhiệm vụ)")
        if gate is not None and gate not in _GATE_ATTR:
            raise BadRequestError("gate không hợp lệ")

        required_gate = _TASK_REQUIRED_GATE.get(task_no)
        if required_gate is not None and gate != required_gate:
            raise BadRequestError(f'Nhiệm vụ {task_no} cần gate="{required_gate}"')

        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 0")

        if task_no == 1:
            evidence = await self._session.execute(
                select(Cap0OrderKehoach.id)
                .join(VirtualOrder, VirtualOrder.id == Cap0OrderKehoach.order_id)
                .where(
                    VirtualOrder.user_id == user_id,
                    VirtualOrder.side == OrderSide.BUY,
                    VirtualOrder.status == OrderStatus.FILLED,
                )
                .limit(1)
            )
            if evidence.scalar_one_or_none() is None:
                raise ConflictError("Chưa có lệnh MUA đã khớp kèm kế hoạch Cấp 0")
        if task_no in (2, 3, 4) and progress.task_1_done_at is None:
            raise ConflictError("Cần hoàn thành lệnh MUA đầu tiên trước khi xem tour")
        if task_no == 5:
            if progress.task_1_done_at is None:
                raise ConflictError("Cần hoàn thành lệnh MUA đầu tiên trước khi Kết sổ")
            buy = aliased(VirtualOrder)
            sell = aliased(VirtualOrder)
            evidence = await self._session.execute(
                select(sell.id)
                .join(
                    buy,
                    (buy.account_id == sell.account_id)
                    & (buy.symbol == sell.symbol)
                    & (buy.created_at <= sell.created_at),
                )
                .join(Cap0OrderKehoach, Cap0OrderKehoach.order_id == buy.id)
                .where(
                    sell.user_id == user_id,
                    sell.side == OrderSide.SELL,
                    sell.status == OrderStatus.FILLED,
                    buy.side == OrderSide.BUY,
                    buy.status == OrderStatus.FILLED,
                )
                .limit(1)
            )
            if evidence.scalar_one_or_none() is None:
                raise ConflictError("Chưa có lệnh BÁN đã khớp để Kết sổ")

        done_attr = f"task_{task_no}_done_at"
        newly_done = getattr(progress, done_attr) is None
        if getattr(progress, done_attr) is None:
            setattr(progress, done_attr, datetime.now(UTC))

        if gate is not None:
            setattr(progress, _GATE_ATTR[gate], True)

        if newly_done:
            from app.services.journey_events import record_journey_event

            await record_journey_event(
                self._session,
                user_id,
                "cap0_task_complete",
                {"task_id": task_no},
                dedup_key=f"{task_no}:{getattr(progress, done_attr).isoformat()}",
            )

        await self._session.flush()
        await self._session.refresh(progress)
        return progress

    async def graduate(self, user_id: uuid.UUID) -> Cap0Progress:
        """Graduate after both trading tasks and their evidence gates; tours are optional."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 0")

        all_tasks_done = all(
            getattr(progress, f"task_{n}_done_at") is not None for n in (1, 5)
        )
        gates_ok = progress.task1_star_clicked and progress.task5_debrief_done
        if not (all_tasks_done and gates_ok):
            raise ConflictError("Chưa hoàn thành hai nhiệm vụ giao dịch và cổng Cấp 0")

        if progress.graduated_at is None:
            now = datetime.now(UTC)
            progress.graduated_at = now
            entered = progress.entered_at
            if entered.tzinfo is None:
                entered = entered.replace(tzinfo=UTC)
            progress.time_to_graduate_hours = (now - entered).total_seconds() / 3600.0
            placement = await self.get_placement(user_id)
            if placement is None:
                placement = UserPlacement(
                    user_id=user_id,
                    has_traded_before=False,
                    experience=PlacementExperience.NEVER,
                    placed_level=0,
                )
                self._session.add(placement)
            placement.da_xem_tour = True
            from app.services.journey_events import record_journey_event

            await record_journey_event(
                self._session,
                user_id,
                "cap0_graduate",
                {},
                dedup_key=now.isoformat(),
            )
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

    async def _find_matching_sell(self, buy_order: VirtualOrder) -> VirtualOrder | None:
        """The FILLED sell that closes ``buy_order`` — earliest one for the same
        account+symbol at/after it. Mirror image of ``Cap1Service._find_matching_buy``
        and it inherits that method's own caveat verbatim: the account model is
        average-cost, not lot-tracked (see ``VirtualPosition``), so this is a
        pragmatic single-lot approximation, good enough for the "1 lệnh = 1 round
        trip" flow Cấp 0 teaches.

        Exists so ``Thời gian giữ`` can be measured to the SELL. Measuring it to
        ``now()`` instead made the number drift with the calendar: the Kết sổ is
        re-openable days later (``findRetroDebrief`` exists for exactly that), so
        a same-session round trip re-read on Thursday reported "3 phiên".
        """
        result = await self._session.execute(
            select(VirtualOrder)
            .where(
                VirtualOrder.account_id == buy_order.account_id,
                VirtualOrder.symbol == buy_order.symbol,
                VirtualOrder.side == OrderSide.SELL,
                VirtualOrder.status == OrderStatus.FILLED,
                VirtualOrder.created_at >= buy_order.created_at,
            )
            .order_by(VirtualOrder.created_at.asc())
            .limit(1)
        )
        return result.scalars().first()

    async def _get_kehoach_by_order(self, order_id: uuid.UUID) -> Cap0OrderKehoach | None:
        result = await self._session.execute(
            select(Cap0OrderKehoach).where(Cap0OrderKehoach.order_id == order_id)
        )
        return result.scalar_one_or_none()

    async def record_kehoach(
        self, user_id: uuid.UUID, order_id: uuid.UUID, *, ly_do_doi_thuong: str
    ) -> Cap0OrderKehoach:
        """Persist the khối "Kế hoạch" chip for a Cấp 0 BUY order.

        The order engine resolves Cấp 0 to ``san_tap``. This method verifies
        ownership, BUY side and the five-chip vocabulary; it does not duplicate
        the level resolver, which keeps recovery calls idempotent.

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
        ``virtual_orders`` by :meth:`get_kehoach_view`, so they can never drift
        out of agreement with the order they describe.

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
        self, kehoach: Cap0OrderKehoach, order: VirtualOrder, den_ngay: date | None
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
            so_phien_giu=(
                None
                if den_ngay is None
                else self._count_trading_sessions(order.trading_date, den_ngay)
            ),
        )

    async def get_kehoach_view(
        self, user_id: uuid.UUID, order_id: uuid.UUID
    ) -> Cap0KehoachView | None:
        """Read model for ONE buy order's recorded chip — the Kết sổ's ``Lý do
        mua`` + ``Thời gian giữ`` rows (§5). ``None`` when that order has no
        chip or is not the caller's; the Kết sổ then shows "—" rather than a
        fabricated row.

        **Keyed on the ORDER, deliberately.** A symbol-keyed "most recent buy"
        read cannot name the round trip it is describing: buy VNM Mon (chip A) →
        sell Tue → buy VNM again Wed, and it answers with Wednesday's still-open
        order, so ``Lý do mua``/``Thời gian giữ`` describe a different order than
        the ``Giá vào``/``Giá ra`` printed beside them.

        ``so_phien_giu`` is DERIVED: from this buy's ``trading_date`` to the
        matching SELL's (:meth:`_find_matching_sell`) — never to ``now()``,
        which drifted with the calendar every day the Kết sổ went unread — and
        ``None`` while the position is still open.
        """
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
        sell = await self._find_matching_sell(order)
        return self._build_view(kehoach, order, sell.trading_date if sell else None)
