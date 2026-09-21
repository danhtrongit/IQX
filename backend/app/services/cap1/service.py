"""Cấp 1 «Học việc» service — progression, kế hoạch, kết sổ, task counters.

Cấp 1 is FREE and Thực chiến-only. This service owns ``cap1_progress``,
``order_kehoach`` and ``order_ketso``. It reuses ``VirtualTradingRepository``
(read-only here) for order/trade data — it does NOT touch the virtual-trading
matching/settlement engine.

**5 nhiệm vụ.** All of them are **recomputed from source data** — there is no
task in this level whose completion is asserted by the client:
  ① lệnh đầu có kế hoạch      — first ``order_kehoach`` row
  ② bán + Kết sổ đầu          — first ``order_ketso`` row
  ③ đủ 5 lý do (không cần khớp) — DISTINCT ``lyDo`` across the user's order_kehoach
  ④ ≥3 lệnh lý do ✅ Ủng hộ    — COUNT ``trangThai_luc_dat = 'ung_ho'``
  ⑤ 10 lệnh Thực chiến        — COUNT ``virtual_orders`` where mode='thuc_chien'

⑤ used to be «mở Phân tích danh mục 3 lần khác ngày» — a task whose entire
currency was a click, self-reported by the FE through ``PATCH /cap1/task`` and
deduped per calendar day on a bookkeeping column. It was cut, and the old ⑥
took its number (revision ``4d8e6b2a1c93``). Phân tích danh mục is still a tool
of this level; it is simply no longer scored, so opening it writes nothing.
That is what makes ``PATCH /cap1/task`` a pure recompute for every task_no now.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap0 import Cap0Progress, UserPlacement
from app.models.cap1 import (
    CamXuc,
    Cap1Progress,
    LyDo,
    OrderKehoach,
    OrderKetso,
    TrangThaiLucDat,
)
from app.models.virtual_trading import OrderSide, OrderStatus, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.virtual_trading.settlement import is_trading_day

_TASK_NOS = (1, 2, 3, 4, 5)
_TASK3_THRESHOLD = 5  # đủ 5/5 lý do
_TASK4_THRESHOLD = 3  # ≥3 lệnh ✅ Ủng hộ
_TASK5_THRESHOLD = 10  # ≥10 lệnh Thực chiến


class Cap1Service:
    """Business logic for the free Cấp 1 «Học việc» flow."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._vt_repo = VirtualTradingRepository(session)

    # ── Progress row ─────────────────────────────────

    async def _get_progress_row(self, user_id: uuid.UUID) -> Cap1Progress | None:
        result = await self._session.execute(
            select(Cap1Progress).where(Cap1Progress.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_progress(self, user_id: uuid.UUID) -> Cap1Progress | None:
        progress = await self._get_progress_row(user_id)
        if progress is not None:
            await self._recompute_counters(user_id, progress)
        return progress

    async def get_current_level(self, user_id: uuid.UUID) -> int:
        """Progression helper: 0 (Cấp 0 chưa tốt nghiệp) / 1 (đang học Cấp 1) /
        2 (đã tốt nghiệp Cấp 1, chờ Cấp 2 mở)."""
        cap0_result = await self._session.execute(
            select(Cap0Progress).where(Cap0Progress.user_id == user_id)
        )
        cap0_progress = cap0_result.scalar_one_or_none()
        cap1_progress = await self._get_progress_row(user_id)
        if cap1_progress is not None:
            return 2 if cap1_progress.graduated_at is not None else 1
        placement_result = await self._session.execute(
            select(UserPlacement).where(UserPlacement.user_id == user_id)
        )
        placement = placement_result.scalar_one_or_none()
        if placement is not None:
            return placement.placed_level
        if cap0_progress is None or cap0_progress.graduated_at is None:
            return 0
        if cap1_progress is None or cap1_progress.graduated_at is None:
            return 1
        return 2

    async def enter(self, user_id: uuid.UUID) -> Cap1Progress:
        """Enter Cấp 1 (idempotent). Requires the user to have graduated Cấp 0."""
        progress = await self._get_progress_row(user_id)
        if progress is not None:
            return progress

        cap0_result = await self._session.execute(
            select(Cap0Progress).where(Cap0Progress.user_id == user_id)
        )
        cap0_progress = cap0_result.scalar_one_or_none()
        placement_result = await self._session.execute(
            select(UserPlacement).where(UserPlacement.user_id == user_id)
        )
        placement = placement_result.scalar_one_or_none()
        from_cap0 = cap0_progress is not None and cap0_progress.graduated_at is not None
        directly_placed = placement is not None and placement.placed_level >= 1
        if not from_cap0 and not directly_placed:
            if cap0_progress is None and placement is None:
                raise NotFoundError("tiến trình Cấp 0 hoặc kết quả xếp lớp")
            raise ConflictError("Chưa tốt nghiệp Cấp 0 hoặc chưa được xếp vào Cấp 1")

        # Only reachable via a graduated Cấp 0 (Nhánh A) — tours already seen.
        progress = Cap1Progress(
            user_id=user_id,
            entered_at=datetime.now(UTC),
            da_xem_tour=True if from_cap0 else bool(placement and placement.da_xem_tour),
        )
        self._session.add(progress)
        await self._session.flush()
        await self._session.refresh(progress)
        if not progress.da_xem_tour:
            from app.services.journey_events import record_journey_event

            await record_journey_event(
                self._session, user_id, "cap1_tour_start", {}, dedup_key=str(progress.id)
            )
        return progress

    # ── Kế hoạch (buy-time plan) ─────────────────────

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
        ly_do: str,
        trang_thai_luc_dat: str,
        vung_mua: int,
        co_bam_doc_chi_tiet: bool = False,
        snapshot: dict | None = None,
    ) -> OrderKehoach:
        """Record the Form Kế hoạch for a BUY order (one row per order, unique)."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 1")

        order = await self._vt_repo.get_order_by_id(order_id)
        if order is None or order.user_id != user_id:
            raise NotFoundError("lệnh")
        if order.side != OrderSide.BUY:
            raise BadRequestError("Kế hoạch chỉ ghi cho lệnh MUA")
        if order.mode != "thuc_chien":
            raise BadRequestError("Cấp 1 chỉ ghi nhận lệnh Thực chiến")
        if order.status not in (OrderStatus.PENDING, OrderStatus.FILLED):
            raise BadRequestError("Chỉ ghi kế hoạch cho lệnh đang chờ hoặc đã khớp")
        if not progress.da_xem_tour:
            raise ConflictError("Cần xem xong 3 tour sản phẩm trước khi đặt lệnh")

        try:
            ly_do_enum = LyDo(ly_do)
            trang_thai_enum = TrangThaiLucDat(trang_thai_luc_dat)
        except ValueError as exc:
            raise BadRequestError("lyDo hoặc trangThai_luc_dat không hợp lệ") from exc

        if vung_mua is None or vung_mua <= 0:
            raise BadRequestError("Vùng mua phải là số dương")

        existing = await self._get_kehoach_by_order(order_id)
        if existing is not None:
            same = (
                existing.lyDo == ly_do_enum
                and existing.trangThai_luc_dat == trang_thai_enum
                and existing.vung_mua == int(vung_mua)
                and existing.co_bam_doc_chi_tiet == co_bam_doc_chi_tiet
                and existing.snapshot_lop_du_lieu == snapshot
            )
            if same:
                await self._recompute_counters(user_id, progress)
                return existing
            raise ConflictError("Kế hoạch đã được chốt lúc đặt lệnh")

        kehoach = OrderKehoach(
            order_id=order_id,
            lyDo=ly_do_enum,
            trangThai_luc_dat=trang_thai_enum,
            vung_mua=int(vung_mua),
            co_bam_doc_chi_tiet=co_bam_doc_chi_tiet,
            snapshot_lop_du_lieu=snapshot,
        )
        self._session.add(kehoach)
        await self._session.flush()
        await self._session.refresh(kehoach)

        if order.status == OrderStatus.FILLED and progress.task_1_done_at is None:
            progress.task_1_done_at = datetime.now(UTC)
            from app.services.journey_events import record_journey_event

            await record_journey_event(
                self._session, user_id, "cap1_task_complete", {"task_id": 1},
                dedup_key=f"1:{order.id}",
            )

        await self._recompute_counters(user_id, progress)
        return kehoach

    async def _recompute_counters(self, user_id: uuid.UUID, progress: Cap1Progress) -> None:
        """Recompute ③④⑤ from source rows (order_kehoach/virtual_orders)."""
        was_done = {n: getattr(progress, f"task_{n}_done_at") is not None for n in _TASK_NOS}
        common_filters = (
            VirtualOrder.user_id == user_id,
            VirtualOrder.mode == "thuc_chien",
            VirtualOrder.side == OrderSide.BUY,
            VirtualOrder.status == OrderStatus.FILLED,
        )

        # ③ distinct lyDo used across valid Cấp-1 buy plans.
        result = await self._session.execute(
            select(func.count(func.distinct(OrderKehoach.lyDo)))
            .select_from(OrderKehoach)
            .join(VirtualOrder, VirtualOrder.id == OrderKehoach.order_id)
            .where(*common_filters)
        )
        so_ly_do_da_dung = int(result.scalar_one() or 0)

        # ④ lệnh có lý do được chấm ✅ Ủng hộ lúc đặt
        result = await self._session.execute(
            select(func.count())
            .select_from(OrderKehoach)
            .join(VirtualOrder, VirtualOrder.id == OrderKehoach.order_id)
            .where(
                *common_filters,
                OrderKehoach.trangThai_luc_dat == TrangThaiLucDat.UNG_HO,
            )
        )
        so_lenh_ly_do_ung_ho = int(result.scalar_one() or 0)

        # ⑤ tổng lệnh Thực chiến đã khớp
        result = await self._session.execute(
            select(func.count())
            .select_from(OrderKehoach)
            .join(VirtualOrder, VirtualOrder.id == OrderKehoach.order_id)
            .where(
                *common_filters,
            )
        )
        so_lenh_thuc_chien = int(result.scalar_one() or 0)

        progress.so_ly_do_da_dung = so_ly_do_da_dung
        progress.so_lenh_ly_do_ung_ho = so_lenh_ly_do_ung_ho
        progress.so_lenh_thuc_chien = so_lenh_thuc_chien

        now = datetime.now(UTC)
        if so_ly_do_da_dung >= _TASK3_THRESHOLD and progress.task_3_done_at is None:
            progress.task_3_done_at = now
        if so_lenh_ly_do_ung_ho >= _TASK4_THRESHOLD and progress.task_4_done_at is None:
            progress.task_4_done_at = now
        if so_lenh_thuc_chien >= _TASK5_THRESHOLD and progress.task_5_done_at is None:
            progress.task_5_done_at = now

        # Repair the two milestone stamps from source facts after delayed limit fills.
        if so_lenh_thuc_chien >= 1 and progress.task_1_done_at is None:
            progress.task_1_done_at = now
        result = await self._session.execute(
            select(func.count(OrderKetso.id))
            .join(VirtualOrder, VirtualOrder.id == OrderKetso.order_id)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.mode == "thuc_chien",
                VirtualOrder.status == OrderStatus.FILLED,
                OrderKetso.closed_at >= progress.entered_at,
            )
        )
        if int(result.scalar_one() or 0) >= 1 and progress.task_2_done_at is None:
            progress.task_2_done_at = now

        from app.services.journey_events import record_journey_event

        for task_no in _TASK_NOS:
            if not was_done[task_no] and getattr(progress, f"task_{task_no}_done_at") is not None:
                await record_journey_event(
                    self._session, user_id, "cap1_task_complete", {"task_id": task_no},
                    dedup_key=f"{task_no}:{getattr(progress, f'task_{task_no}_done_at').isoformat()}",
                )

        await self._session.flush()
        await self._session.refresh(progress)

    # ── Kết sổ (sell-time reconciliation) ────────────

    async def _get_ketso_by_order(self, order_id: uuid.UUID) -> OrderKetso | None:
        result = await self._session.execute(
            select(OrderKetso).where(OrderKetso.order_id == order_id)
        )
        return result.scalar_one_or_none()

    async def _find_matching_buy(self, sell_order: VirtualOrder) -> VirtualOrder | None:
        """Best-effort match: the most recent FILLED buy for the same account+symbol
        at/before the sell. Cấp 1's account model is average-cost (not lot-tracked,
        see ``VirtualPosition``), so this is a pragmatic single-lot approximation —
        good enough for the common "1 lệnh = 1 round trip" flow this level teaches.
        """
        if sell_order.exit_matched_buy_order_id is not None:
            snapshotted = await self._vt_repo.get_order_by_id(
                sell_order.exit_matched_buy_order_id
            )
            if snapshotted is not None and snapshotted.user_id == sell_order.user_id:
                return snapshotted
        result = await self._session.execute(
            select(VirtualOrder)
            .where(
                VirtualOrder.account_id == sell_order.account_id,
                VirtualOrder.symbol == sell_order.symbol,
                VirtualOrder.side == OrderSide.BUY,
                VirtualOrder.status == OrderStatus.FILLED,
                VirtualOrder.created_at <= sell_order.created_at,
            )
            .order_by(VirtualOrder.created_at.desc())
            .limit(1)
        )
        return result.scalars().first()

    @staticmethod
    def _count_trading_sessions(start: date, end: date) -> int:
        """Number of trading sessions strictly after ``start`` through ``end``
        (Mon-Fri, no holiday calendar — reuses the Mon-Fri weekday rule from
        ``app.services.virtual_trading.settlement.is_trading_day``)."""
        if end <= start:
            return 0
        count = 0
        d = start
        while d < end:
            d += timedelta(days=1)
            if is_trading_day(d, set()):
                count += 1
        return count

    async def record_ketso(
        self,
        user_id: uuid.UUID,
        order_id: uuid.UUID,
        *,
        cam_xuc: str | None = None,
    ) -> OrderKetso:
        """Record Kết sổ for a filled SELL order — computes pnl/phiên from the
        VirtualOrder and its matched buy (spec §6).

        **``cam_xuc`` is UPSERTed.** From Cấp 5 on, the FE posts this endpoint
        as a PRE-FLIGHT step (right after the sell fills, so the pnl/số phiên the
        Kết sổ modal displays exist before it opens) — at which point the user
        has not picked an emotion yet, so ``cam_xuc`` is ``None``. The modal then
        posts AGAIN with the real emotion. That second call therefore finds an
        existing row: when it carries a non-null ``cam_xuc`` it UPDATES that row
        instead of 409-ing (which is why the emotion silently stopped persisting
        at Cấp 5). Everything else is unchanged: a repeat call WITHOUT an emotion
        still conflicts (nothing to add), the computed pnl/phiên fields are never
        recomputed on the second pass, and a non-null ``cam_xuc`` is never wiped
        back to null.
        """
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 1")

        sell_order = await self._vt_repo.get_order_by_id(order_id)
        if sell_order is None or sell_order.user_id != user_id:
            raise NotFoundError("lệnh")
        if sell_order.side != OrderSide.SELL:
            raise BadRequestError("Kết sổ chỉ ghi cho lệnh BÁN")
        if sell_order.status != OrderStatus.FILLED:
            raise BadRequestError("Lệnh bán chưa khớp")

        try:
            cam_xuc_enum = CamXuc(cam_xuc) if cam_xuc else None
        except ValueError as exc:
            raise BadRequestError("cam_xuc không hợp lệ") from exc

        existing = await self._get_ketso_by_order(order_id)
        if existing is not None:
            if cam_xuc_enum is None:
                return existing
            if existing.cam_xuc is not None:
                if existing.cam_xuc == cam_xuc_enum:
                    return existing
                raise ConflictError("Cảm xúc Kết sổ đã được chốt")
            existing.cam_xuc = cam_xuc_enum
            await self._session.flush()
            await self._session.refresh(existing)
            if progress.task_2_done_at is None:
                progress.task_2_done_at = datetime.now(UTC)
                from app.services.journey_events import record_journey_event

                await record_journey_event(
                    self._session, user_id, "cap1_task_complete", {"task_id": 2},
                    dedup_key=f"2:{existing.id}",
                )
                await self._session.flush()
                await self._session.refresh(progress)
            return existing

        buy_order = await self._find_matching_buy(sell_order)
        if buy_order is None:
            raise ConflictError("Không tìm thấy lệnh mua tương ứng để kết sổ")

        so_ngay_lich = (sell_order.trading_date - buy_order.trading_date).days
        so_phien_giu = self._count_trading_sessions(
            buy_order.trading_date, sell_order.trading_date
        )

        gia_ra = sell_order.filled_price_vnd or 0
        buy_net = buy_order.net_amount_vnd or 0  # negative (cash out)
        sell_net = sell_order.net_amount_vnd or 0  # positive (cash in)
        pnl_vnd = sell_net + buy_net
        cost_basis = -buy_net
        pnl_pct = (pnl_vnd / cost_basis * 100.0) if cost_basis else 0.0

        ketso = OrderKetso(
            order_id=order_id,
            gia_ra=gia_ra,
            so_phien_giu=so_phien_giu,
            so_ngay_lich=so_ngay_lich,
            pnl_pct=pnl_pct,
            pnl_vnd=pnl_vnd,
            cam_xuc=cam_xuc_enum,
            closed_at=datetime.now(UTC),
        )
        self._session.add(ketso)
        await self._session.flush()
        await self._session.refresh(ketso)

        if progress.task_2_done_at is None:
            progress.task_2_done_at = datetime.now(UTC)
            from app.services.journey_events import record_journey_event

            await record_journey_event(
                self._session, user_id, "cap1_task_complete", {"task_id": 2},
                dedup_key=f"2:{ketso.id}",
            )
            await self._session.flush()
            await self._session.refresh(progress)

        return ketso

    async def mark_task(self, user_id: uuid.UUID, task_no: int) -> Cap1Progress:
        """PATCH /cap1/task — every nhiệm vụ is derived from source data, so
        this only triggers a recompute pass. It never marks anything on the
        client's say-so; ``task_no`` is validated and then discarded."""
        if task_no not in _TASK_NOS:
            raise BadRequestError("task_no không hợp lệ")

        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 1")
        await self._recompute_counters(user_id, progress)
        return progress

    # ── Graduation ────────────────────────────────────

    async def graduate(self, user_id: uuid.UUID) -> Cap1Progress:
        """Graduate Cấp 1 — only when all 5 nhiệm vụ are done."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 1")
        await self._recompute_counters(user_id, progress)

        all_tasks_done = all(
            getattr(progress, f"task_{n}_done_at") is not None for n in _TASK_NOS
        )
        if not all_tasks_done:
            raise ConflictError("Chưa hoàn thành đủ 5 nhiệm vụ Cấp 1")

        if progress.graduated_at is None:
            now = datetime.now(UTC)
            progress.graduated_at = now
            entered = progress.entered_at
            if entered.tzinfo is None:
                entered = entered.replace(tzinfo=UTC)
            progress.time_to_graduate_hours = (now - entered).total_seconds() / 3600.0
            from app.services.journey_events import record_journey_event

            await record_journey_event(
                self._session, user_id, "cap1_graduate", {}, dedup_key=now.isoformat()
            )
            await self._session.flush()
            await self._session.refresh(progress)

        return progress

    async def list_trade_history(self, user_id: uuid.UUID) -> list[dict]:
        """Durable closed-trade history for Kết sổ and portfolio analysis."""
        result = await self._session.execute(
            select(OrderKetso, VirtualOrder)
            .join(VirtualOrder, VirtualOrder.id == OrderKetso.order_id)
            .where(VirtualOrder.user_id == user_id, VirtualOrder.side == OrderSide.SELL)
            .order_by(OrderKetso.closed_at.desc())
            .limit(500)
        )
        items: list[dict] = []
        for ketso, sell in result.all():
            buy = None
            matched_by = "unmatched"
            if sell.exit_matched_buy_order_id is not None:
                buy = await self._vt_repo.get_order_by_id(sell.exit_matched_buy_order_id)
                matched_by = "snapshot"
            if buy is None:
                buy = await self._find_matching_buy(sell)
                if buy is not None:
                    matched_by = "symbol_fallback"
            if buy is None:
                continue
            plan = await self._get_kehoach_by_order(buy.id)
            if plan is None:
                continue
            items.append(
                {
                    "buy_order_id": buy.id,
                    "sell_order_id": sell.id,
                    "matched_by": matched_by,
                    "symbol": sell.symbol,
                    "quantity": sell.quantity,
                    "bought_at": buy.created_at,
                    "closed_at": ketso.closed_at,
                    "gia_vao": buy.filled_price_vnd,
                    "gia_ra": ketso.gia_ra,
                    "pnl_pct": ketso.pnl_pct,
                    "pnl_vnd": ketso.pnl_vnd,
                    "lyDo": plan.lyDo,
                    "trangThai_luc_dat": plan.trangThai_luc_dat,
                    "vung_mua": plan.vung_mua,
                    "cam_xuc": ketso.cam_xuc,
                    "phuong_phap_sl_tp": plan.phuong_phap_sl_tp,
                    "cat_lo": plan.cat_lo,
                    "chot_loi": plan.chot_loi,
                    "cham_SL_cuoi_phien": ketso.cham_SL_cuoi_phien,
                    "cham_SL_cat_dung_phien_ke": ketso.cham_SL_cat_dung_phien_ke,
                    "cham_SL_khong_cat": ketso.cham_SL_khong_cat,
                    "giu_cham_SL_bao_nhieu_phien": ketso.giu_cham_SL_bao_nhieu_phien,
                    "cham_TP_giu_lam_hut": ketso.cham_TP_giu_lam_hut,
                    "ban_som_khi_lo_nhe": ketso.ban_som_khi_lo_nhe,
                    "nhoi_lenh_khi_lo": ketso.nhoi_lenh_khi_lo,
                    "ghi_chu_nhin_lai": ketso.ghi_chu_nhin_lai,
                    "khau_vi": plan.khau_vi,
                    "muc_tu_tin": plan.muc_tu_tin,
                    "cach_khoi_luong": plan.cach_khoi_luong,
                    "khoi_luong": plan.khoi_luong,
                    "pct_von": plan.pct_von,
                }
            )
        return items
