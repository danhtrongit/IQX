"""Cấp 3 «Bản lĩnh» progression and sizing-plan evidence.

The two concurrent journey tasks are server-derived from Thực chiến
``order_kehoach`` rows whose khẩu vị, confidence, and sizing-method snapshots
are present. Task ① requires ten qualifying placed plans; task ② requires all
three confidence values. Neither task reads fills, closeouts, P&L, or
discipline. P&L and discipline remain recomputed analytics for existing
portfolio and learning surfaces.
"""

from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap1 import CachKhoiLuong, KhauViRuiRo, OrderKehoach, OrderKetso
from app.models.cap2 import Cap2Progress
from app.models.cap3 import Cap3Progress
from app.models.virtual_trading import OrderSide, OrderStatus, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.cap2.service import Cap2Service

_TASK_NOS = (1, 2)
_CONFIDENCE_LEVELS = frozenset((1, 2, 3))


def _naive_utc(value: datetime) -> datetime:
    """Match VirtualOrder's UTC timestamp-without-time-zone storage."""
    if value.tzinfo is not None:
        value = value.astimezone(UTC)
    return value.replace(tzinfo=None)


class Cap3Service:
    """Business logic for the free Cấp 3 «Bản lĩnh» flow."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._vt_repo = VirtualTradingRepository(session)
        self._cap2_svc = Cap2Service(session)

    # ── Progress row ─────────────────────────────────

    async def _get_progress_row(self, user_id: uuid.UUID) -> Cap3Progress | None:
        result = await self._session.execute(
            select(Cap3Progress).where(Cap3Progress.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_progress(self, user_id: uuid.UUID) -> Cap3Progress | None:
        progress = await self._get_progress_row(user_id)
        if progress is None:
            return None
        await self._recompute_progress(user_id, progress)
        return progress

    async def enter(self, user_id: uuid.UUID) -> Cap3Progress:
        """Enter Cấp 3 (idempotent). Requires the user to have graduated Cấp 2."""
        progress = await self._get_progress_row(user_id)
        if progress is not None:
            await self._recompute_progress(user_id, progress)
            return progress

        cap2_result = await self._session.execute(
            select(Cap2Progress).where(Cap2Progress.user_id == user_id)
        )
        cap2_progress = cap2_result.scalar_one_or_none()
        if cap2_progress is None:
            raise NotFoundError("tiến trình Cấp 2")
        if cap2_progress.graduated_at is None:
            raise ConflictError("Chưa tốt nghiệp Cấp 2")

        progress = Cap3Progress(user_id=user_id, entered_at=datetime.now(UTC))
        self._session.add(progress)
        await self._session.flush()
        await self._session.refresh(progress)
        return progress

    # ── Khẩu vị rủi ro — hồ sơ, đặt 1 lần (spec §5) ───

    async def set_khau_vi(self, user_id: uuid.UUID, khau_vi: str) -> Cap3Progress:
        """Đặt/đổi khẩu vị rủi ro — áp cho mọi lệnh sau (§5.2)."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 3")

        try:
            khau_vi_enum = KhauViRuiRo(khau_vi)
        except ValueError as exc:
            raise BadRequestError("khau_vi không hợp lệ") from exc

        was_set = progress.khau_vi_da_dat
        previous = progress.khau_vi
        progress.khau_vi = khau_vi_enum
        progress.khau_vi_da_dat = True
        from app.services.journey_events import record_journey_event

        event_name = "cap3_khau_vi_change" if was_set else "cap3_khau_vi_set"
        if not was_set or previous != khau_vi_enum:
            await record_journey_event(
                self._session,
                user_id,
                event_name,
                {"loai": khau_vi_enum.value},
                dedup_key=f"{progress.id}:{event_name}:{khau_vi_enum.value}",
            )
        await self._session.flush()
        await self._session.refresh(progress)
        return progress

    # ── Kế hoạch — quản lý vốn (spec §6) ──────────────

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
        khau_vi: str,
        muc_tu_tin: int,
        cach_khoi_luong: str,
        khoi_luong: int,
        pct_von: float,
    ) -> OrderKehoach:
        """Adds the quản lý vốn block (khẩu vị + mức tự tin + cách/khối lượng)
        to the EXISTING ``order_kehoach`` row created by Cấp 1's
        ``/cap1/kehoach`` (Cấp 1's lý do + vùng mua, and Cấp 2's SL/TP if
        present, are filled first; Cấp 3 only inserts this block).
        """
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 3")
        if not progress.khau_vi_da_dat:
            raise ConflictError("Chưa đặt khẩu vị rủi ro — cần đặt trước khi vào lệnh")

        order = await self._vt_repo.get_order_by_id(order_id)
        if order is None or order.user_id != user_id:
            raise NotFoundError("lệnh")
        if order.side != OrderSide.BUY:
            raise BadRequestError("Quản lý vốn chỉ ghi cho lệnh MUA")
        if order.mode != "thuc_chien":
            raise BadRequestError("Cấp 3 chỉ ghi nhận lệnh Thực chiến")
        if order.status not in (OrderStatus.PENDING, OrderStatus.FILLED):
            raise BadRequestError("Chỉ ghi kế hoạch cho lệnh đang chờ hoặc đã khớp")
        order_created = order.created_at
        entered = progress.entered_at
        if order_created.tzinfo is None:
            order_created = order_created.replace(tzinfo=UTC)
        if entered.tzinfo is None:
            entered = entered.replace(tzinfo=UTC)
        if order_created < entered.replace(microsecond=0):
            raise BadRequestError("Lệnh được tạo trước khi vào Cấp 3")

        try:
            khau_vi_enum = KhauViRuiRo(khau_vi)
        except ValueError as exc:
            raise BadRequestError("khau_vi không hợp lệ") from exc
        if khau_vi_enum != progress.khau_vi:
            raise ConflictError("Khẩu vị của lệnh không khớp cài đặt hiện tại")

        if muc_tu_tin not in _CONFIDENCE_LEVELS:
            raise BadRequestError("muc_tu_tin phải là 1, 2 hoặc 3")

        canonical_method = {"linh_hoat": "khau_vi_tu_tin", "ky_luat": "chia_deu"}.get(
            cach_khoi_luong, cach_khoi_luong
        )
        try:
            cach_khoi_luong_enum = CachKhoiLuong(canonical_method)
        except ValueError as exc:
            raise BadRequestError("cach_khoi_luong không hợp lệ") from exc

        if khoi_luong is None or khoi_luong <= 0:
            raise BadRequestError("Khối lượng phải là số dương")
        if pct_von is None or not math.isfinite(pct_von) or pct_von <= 0:
            raise BadRequestError("%vốn phải là số dương")

        # Snapshot actual order facts; callers cannot manufacture progress by
        # posting a different quantity or arbitrary percentage.
        if int(khoi_luong) != order.quantity:
            raise BadRequestError("Khối lượng kế hoạch phải khớp khối lượng lệnh")
        reference_price = order.filled_price_vnd or order.limit_price_vnd
        if reference_price is None or reference_price <= 0:
            raise BadRequestError("Chưa xác định được giá để tính % vốn")
        actual_pct_von = order.quantity * reference_price / progress.von_ban_dau * 100.0
        if not math.isclose(float(pct_von), actual_pct_von, rel_tol=0.0, abs_tol=0.05):
            raise BadRequestError("% vốn không khớp giá trị thực tế của lệnh")

        kehoach = await self._get_kehoach_by_order(order_id)
        if kehoach is None:
            raise NotFoundError("kế hoạch Cấp 1 — cần ghi lý do + vùng mua trước")

        existing_snapshot = (
            kehoach.khau_vi,
            kehoach.muc_tu_tin,
            kehoach.cach_khoi_luong,
            kehoach.khoi_luong,
            kehoach.pct_von,
        )
        proposed_snapshot = (
            khau_vi_enum,
            int(muc_tu_tin),
            cach_khoi_luong_enum,
            order.quantity,
            actual_pct_von,
        )
        if any(value is not None for value in existing_snapshot):
            same = (
                existing_snapshot[:4] == proposed_snapshot[:4]
                and existing_snapshot[4] is not None
                and math.isclose(existing_snapshot[4], actual_pct_von, abs_tol=1e-9)
            )
            if same:
                await self._recompute_progress(user_id, progress)
                return kehoach
            raise ConflictError("Kế hoạch quản lý vốn đã được chốt lúc đặt lệnh")

        kehoach.khau_vi = khau_vi_enum
        kehoach.muc_tu_tin = int(muc_tu_tin)
        kehoach.cach_khoi_luong = cach_khoi_luong_enum
        kehoach.khoi_luong = order.quantity
        kehoach.pct_von = actual_pct_von
        await self._session.flush()
        await self._session.refresh(kehoach)

        await self._recompute_progress(user_id, progress)
        from app.services.journey_events import record_journey_event

        await record_journey_event(
            self._session, user_id, "cap3_tu_tin_chon", {"muc": int(muc_tu_tin)},
            dedup_key=str(order.id),
        )
        await record_journey_event(
            self._session, user_id, "cap3_khoi_luong_cach",
            {"cach": cach_khoi_luong_enum.value}, dedup_key=str(order.id),
        )
        return kehoach

    # ── Recompute analytics and server-owned task evidence ──────────────

    async def _cap3_ketso_rows(
        self, user_id: uuid.UUID, progress: Cap3Progress
    ) -> list[OrderKetso]:
        """All Cấp 3-era closed Thực chiến round trips, oldest → newest."""
        sell = aliased(VirtualOrder)
        buy = aliased(VirtualOrder)
        result = await self._session.execute(
            select(OrderKetso)
            .join(sell, sell.id == OrderKetso.order_id)
            .join(buy, buy.id == sell.exit_matched_buy_order_id)
            .join(OrderKehoach, OrderKehoach.order_id == buy.id)
            .where(
                sell.user_id == user_id,
                sell.mode == "thuc_chien",
                OrderKetso.closed_at >= progress.entered_at,
                OrderKehoach.khau_vi.is_not(None),
                OrderKehoach.muc_tu_tin.in_(_CONFIDENCE_LEVELS),
                OrderKehoach.cach_khoi_luong.is_not(None),
                *(
                    [OrderKetso.closed_at <= progress.graduated_at]
                    if progress.graduated_at is not None
                    else []
                ),
            )
            .order_by(OrderKetso.closed_at.asc())
        )
        return list(result.scalars().all())

    async def _qualified_kehoach(
        self, user_id: uuid.UUID, progress: Cap3Progress
    ) -> list[OrderKehoach]:
        """Placed Thực chiến plans that operate the sizing mechanism.

        Plans, not fills or closeouts, are the evidence: each row joins the
        user's virtual order and has all three persisted mechanism snapshots.
        Invalid legacy confidence values are excluded instead of being treated
        as coverage.
        """
        result = await self._session.execute(
            select(OrderKehoach)
            .join(VirtualOrder, VirtualOrder.id == OrderKehoach.order_id)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.mode == "thuc_chien",
                VirtualOrder.side == OrderSide.BUY,
                VirtualOrder.status == OrderStatus.FILLED,
                VirtualOrder.created_at >= _naive_utc(progress.entered_at).replace(microsecond=0),
                OrderKehoach.khau_vi.is_not(None),
                OrderKehoach.muc_tu_tin.in_(_CONFIDENCE_LEVELS),
                OrderKehoach.cach_khoi_luong.is_not(None),
                OrderKehoach.khoi_luong.is_not(None),
                OrderKehoach.khoi_luong > 0,
                OrderKehoach.pct_von.is_not(None),
                OrderKehoach.pct_von > 0,
                *(
                    [VirtualOrder.created_at <= _naive_utc(progress.graduated_at)]
                    if progress.graduated_at is not None
                    else []
                ),
            )
            .order_by(VirtualOrder.created_at.asc())
        )
        return list(result.scalars().all())

    async def _diem_ky_luat_tb(self, user_id: uuid.UUID, progress: Cap3Progress) -> float | None:
        """Mean of Cấp 2's daily điểm kỷ luật (§C12c) over every calendar day
        with Thực chiến order activity on/after entering Cấp 3.

        ★ Returns ``None`` for **CHƯA BIẾT** — no trading day yet, or days but
        no day with a scorable tình huống. It must NOT be 0.0: 0 is a real,
        terrible score, and printing it for a user who has simply not traded
        yet contradicts the «Điểm kỷ luật» card sitting right above the widget
        (which correctly says "chưa có dữ liệu" for the same state).
        """
        result = await self._session.execute(
            select(VirtualOrder.trading_date)
            .distinct()
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.mode == "thuc_chien",
                VirtualOrder.trading_date >= progress.entered_at.date(),
            )
        )
        days = sorted(row[0] for row in result.all())
        if not days:
            return None

        scores: list[float] = []
        for day in days:
            diem_result = await self._cap2_svc.diem_ky_luat(user_id, day)
            if diem_result["diem"] is not None:
                scores.append(diem_result["diem"])
        return sum(scores) / len(scores) if scores else None

    async def _sync_von_ban_dau(self, user_id: uuid.UUID, progress: Cap3Progress) -> None:
        """Keep ``von_ban_dau`` = the user's REAL virtual-account capital.

        Every "% vốn" Cấp 3 shows (khối lượng gợi ý, ``pct_von`` per order,
        ``lai_pct_cap3``, the graduation headline) divides by this number, while
        ``AccountStrip`` right above the panel divides by
        ``VirtualTradingAccount.initial_cash_vnd``. Two different denominators
        for the same money is two different truths on one screen.

        Re-synced on every recompute (not only at ``enter``) so rows created
        while the spec constant was hard-coded heal themselves. A user with no
        virtual account yet keeps ``VON_BAN_DAU_MAC_DINH``.
        """
        account = await self._vt_repo.get_account_by_user_id(user_id)
        if account is None or account.initial_cash_vnd <= 0:
            return
        if progress.von_ban_dau != account.initial_cash_vnd:
            progress.von_ban_dau = account.initial_cash_vnd

    async def _recompute_progress(self, user_id: uuid.UUID, progress: Cap3Progress) -> None:
        await self._sync_von_ban_dau(user_id, progress)
        ketso_rows = await self._cap3_ketso_rows(user_id, progress)
        so_lenh_cap3 = len(ketso_rows)
        tong_pnl_vnd = sum(row.pnl_vnd for row in ketso_rows)
        progress.so_lenh_cap3 = so_lenh_cap3
        progress.lai_pct_cap3 = (
            (tong_pnl_vnd / progress.von_ban_dau) * 100.0 if progress.von_ban_dau else 0.0
        )
        progress.diem_ky_luat_tb_cap3 = await self._diem_ky_luat_tb(user_id, progress)

        qualifying_plans = await self._qualified_kehoach(user_id, progress)
        confidence_levels: tuple[int, ...] = tuple(
            sorted({plan.muc_tu_tin for plan in qualifying_plans if plan.muc_tu_tin is not None})
        )
        progress._so_lenh_quan_ly_von = len(qualifying_plans)
        progress._muc_tu_tin_da_dung = confidence_levels

        now = datetime.now(UTC)
        completed: list[tuple[int, datetime]] = []
        if progress.task_1_done_at is None and progress.so_lenh_quan_ly_von >= 10:
            progress.task_1_done_at = now
            completed.append((1, now))
        if progress.task_2_done_at is None and set(confidence_levels) == _CONFIDENCE_LEVELS:
            progress.task_2_done_at = now
            completed.append((2, now))

        if completed:
            from app.services.journey_events import record_journey_event

            for task_id, done_at in completed:
                await record_journey_event(
                    self._session,
                    user_id,
                    "cap3_task_complete",
                    {"task_id": task_id},
                    dedup_key=f"{task_id}:{done_at.isoformat()}",
                )

        await self._session.flush()
        await self._session.refresh(progress)

    async def mark_task(self, user_id: uuid.UUID, task_no: int) -> Cap3Progress:
        """Trigger an idempotent server-side recomputation of either task."""
        if task_no not in _TASK_NOS:
            raise BadRequestError("task_no không hợp lệ")
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 3")
        await self._recompute_progress(user_id, progress)
        return progress

    # ── Graduation ────────────────────────────────────

    async def graduate(self, user_id: uuid.UUID) -> Cap3Progress:
        """Graduate after both task stamps, preserving already-graduated users."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 3")
        if progress.graduated_at is not None:
            await self._recompute_progress(user_id, progress)
            return progress
        await self._recompute_progress(user_id, progress)

        all_tasks_done = all(
            getattr(progress, f"task_{task_no}_done_at") is not None for task_no in _TASK_NOS
        )
        if not all_tasks_done:
            raise ConflictError("Chưa hoàn thành đủ 2 nhiệm vụ Cấp 3")

        now = datetime.now(UTC)
        progress.graduated_at = now
        entered = progress.entered_at
        if entered.tzinfo is None:
            entered = entered.replace(tzinfo=UTC)
        progress.time_to_graduate_hours = (now - entered).total_seconds() / 3600.0
        from app.services.journey_events import record_journey_event

        await record_journey_event(
            self._session, user_id, "cap3_graduate", {}, dedup_key=now.isoformat()
        )
        await self._session.flush()
        await self._session.refresh(progress)

        return progress

    async def get_plan(self, user_id: uuid.UUID, order_id: uuid.UUID) -> dict:
        order = await self._vt_repo.get_order_by_id(order_id)
        if order is None or order.user_id != user_id or order.side != OrderSide.BUY:
            raise NotFoundError("lệnh mua")
        plan = await self._get_kehoach_by_order(order_id)
        if plan is None:
            raise NotFoundError("kế hoạch")
        reference_price = order.filled_price_vnd or order.limit_price_vnd
        if reference_price is None:
            raise BadRequestError("Chưa xác định được giá mua")
        return {
            "id": plan.id,
            "order_id": plan.order_id,
            "symbol": order.symbol,
            "quantity": order.quantity,
            "bought_at": order.created_at,
            "gia_vao": reference_price,
            "lyDo": plan.lyDo,
            "trangThai_luc_dat": plan.trangThai_luc_dat,
            "vung_mua": plan.vung_mua,
            "phuong_phap_sl_tp": plan.phuong_phap_sl_tp,
            "cat_lo": plan.cat_lo,
            "chot_loi": plan.chot_loi,
            "khau_vi": plan.khau_vi,
            "muc_tu_tin": plan.muc_tu_tin,
            "cach_khoi_luong": plan.cach_khoi_luong,
            "khoi_luong": plan.khoi_luong,
            "pct_von": plan.pct_von,
        }

    async def list_trade_history(self, user_id: uuid.UUID) -> list[dict]:
        from app.services.cap1.service import Cap1Service

        rows = await Cap1Service(self._session).list_trade_history(user_id)
        # Historical rows may predate the Cấp 3 sizing contract.  Only expose
        # fully qualified Cấp 3 plans so analysis never treats a partial legacy
        # row as authoritative sizing evidence (or attempts arithmetic on
        # nullable quantities/percentages).
        return [
            row
            for row in rows
            if row["khau_vi"] is not None
            and row["muc_tu_tin"] in (1, 2, 3)
            and row["cach_khoi_luong"] is not None
            and row["khoi_luong"] is not None
            and row["khoi_luong"] > 0
            and row["pct_von"] is not None
            and row["pct_von"] > 0
        ]

    async def trade_analysis(self, user_id: uuid.UUID) -> dict:
        rows = await self.list_trade_history(user_id)
        buckets = []
        for confidence in (3, 2, 1):
            selected = [row for row in rows if row["muc_tu_tin"] == confidence]
            count = len(selected)
            wins = sum(1 for row in selected if row["pnl_vnd"] > 0)
            buckets.append(
                {
                    "muc_tu_tin": confidence,
                    "count": count,
                    "wins": wins,
                    "win_rate": wins / count * 100.0 if count else None,
                    "avg_pnl_pct": (
                        sum(row["pnl_pct"] for row in selected) / count if count else None
                    ),
                    "avg_khoi_luong": (
                        sum(row["khoi_luong"] for row in selected) / count if count else None
                    ),
                    "avg_pct_von": (
                        sum(row["pct_von"] for row in selected) / count if count else None
                    ),
                }
            )
        return {"trades": rows, "total": len(rows), "by_confidence": buckets}
