"""Cấp 3 «Bản lĩnh» service — progression, khẩu vị rủi ro, mức tự tin, khối
lượng mua, Thách thức Bản lĩnh.

Cấp 3 is FREE and Thực chiến-only, built on a graduated Cấp 2. It owns
``cap3_progress`` and EXTENDS Cấp 1's ``order_kehoach`` rows in place (new
columns, same physical table — see ``app.models.cap1``). It reuses
``VirtualTradingRepository`` (read-only here) for order data and
``Cap2Service.diem_ky_luat`` (read-only) for the daily discipline score — the
formula itself is NOT duplicated, only averaged over the Cấp 3 period.

**Everything derived (so_lenh_cap3, lai_pct_cap3, diem_ky_luat_tb_cap3, the 3
nhiệm vụ) is recomputed server-side from the persisted ``order_kehoach`` /
``order_ketso`` history on every read/write — never trusted from
client-supplied counters.** ``khoi_luong``/``pct_von`` on a single order are
accepted from the caller (like ``cat_lo``/``chot_loi`` in Cấp 2 — an observed
commitment for this one order, not aggregate state) and persisted as the
source of truth; every aggregate is walked fresh from history.

Design notes (documented here since the spec leaves them implicit):
  - **"lệnh" = closed round trip.** Mirrors Cấp 2's own windows (which count
    ``order_ketso`` rows, i.e. one row per completed buy→sell cycle, not raw
    ``VirtualOrder`` rows). ``so_lenh_cap3`` and ``lai_pct_cap3`` are computed
    from the exact same set of Cấp-3-period ``order_ketso`` rows (closed at
    or after ``Cap3Progress.entered_at``) so both numbers in nhiệm vụ ③
    describe the identical set of trades.
  - **lãi % base = ``Cap3Progress.von_ban_dau``** (spec's fixed 100,000,000đ,
    §4/§C12b) — ``lai_pct_cap3 = Σ order_ketso.pnl_vnd (Cấp-3 period) /
    von_ban_dau × 100``. This matches the spec's worked example verbatim
    ("vốn 100tr = +5 triệu").
  - **diem_ky_luat_tb_cap3** = the mean of ``Cap2Service.diem_ky_luat``'s
    daily score (§C12c) over every calendar day (VN local date) that has
    Thực chiến order activity on/after the day Cấp 3 was entered. Days with
    no orders at all are skipped (``diem`` is ``None``, not zero) — a
    Cấp-3 period with no trading days yet averages to 0.0 (never trivially
    passes the ≥80 threshold with no data).
  - **Nhiệm vụ ① is NOT gated** — it fires the first time any Cấp-3-period
    ``order_kehoach`` row has all 3 of khẩu vị + mức tự tin + cách khối
    lượng filled in (checked directly from the persisted columns, not just
    at the moment ``record_kehoach`` is called, so it stays correct under
    concurrent recomputes).
  - **Nhiệm vụ ② is gated behind ①** (spec §2② "Điều kiện mở: xong ①, có
    ≥1 lệnh mở") — it fires the first time ≥1 Cấp-3-period ``order_ketso``
    row exists (any Kết sổ, using Cấp 1's existing mechanism — Cấp 3 adds no
    new ``order_ketso`` columns of its own per §10).
  - **Nhiệm vụ ③ is explicitly NOT gated behind ①/②** (spec §2③ "Điều kiện
    mở: vào Cấp 3") — it is evaluated independently from the moment the
    user enters Cấp 3.
  - Once a nhiệm vụ's ``task_N_done_at`` is stamped it is NEVER un-stamped,
    matching Cấp 1/2's "stamp when first met" pattern.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap1 import CachKhoiLuong, KhauViRuiRo, OrderKehoach, OrderKetso
from app.models.cap2 import Cap2Progress
from app.models.cap3 import Cap3Progress
from app.models.virtual_trading import OrderSide, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.cap2.service import Cap2Service

_TASK_NOS = (1, 2, 3)

# Thách thức Bản lĩnh (spec §2③) — triple condition, ALL must hold at once.
_TASK3_LAI_PCT_MIN = 5.0
_TASK3_SO_LENH_MIN = 15
_TASK3_DIEM_MIN = 80.0

_DIEM_KY_LUAT_GIAI_THICH = (
    "Điểm kỷ luật đo bạn có làm đúng cam kết không: cắt lỗ khi giá chạm, "
    "không gồng lỗ, không nhồi lệnh, không tham chốt lời hụt. Làm đúng thì điểm cao."
)


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

        progress.khau_vi = khau_vi_enum
        progress.khau_vi_da_dat = True
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

        try:
            khau_vi_enum = KhauViRuiRo(khau_vi)
        except ValueError as exc:
            raise BadRequestError("khau_vi không hợp lệ") from exc

        if muc_tu_tin not in (1, 2, 3):
            raise BadRequestError("muc_tu_tin phải là 1, 2 hoặc 3")

        try:
            cach_khoi_luong_enum = CachKhoiLuong(cach_khoi_luong)
        except ValueError as exc:
            raise BadRequestError("cach_khoi_luong không hợp lệ") from exc

        if khoi_luong is None or khoi_luong <= 0:
            raise BadRequestError("Khối lượng phải là số dương")
        if pct_von is None or pct_von <= 0:
            raise BadRequestError("%vốn phải là số dương")

        kehoach = await self._get_kehoach_by_order(order_id)
        if kehoach is None:
            raise NotFoundError("kế hoạch Cấp 1 — cần ghi lý do + vùng mua trước")

        kehoach.khau_vi = khau_vi_enum
        kehoach.muc_tu_tin = int(muc_tu_tin)
        kehoach.cach_khoi_luong = cach_khoi_luong_enum
        kehoach.khoi_luong = int(khoi_luong)
        kehoach.pct_von = float(pct_von)
        await self._session.flush()
        await self._session.refresh(kehoach)

        await self._recompute_progress(user_id, progress)
        return kehoach

    # ── Recompute so_lenh/lai_pct/diem_ky_luat_tb + 3 nhiệm vụ ────────

    async def _cap3_ketso_rows(
        self, user_id: uuid.UUID, progress: Cap3Progress
    ) -> list[OrderKetso]:
        """All Cấp 3-era closed Thực chiến round trips, oldest → newest."""
        result = await self._session.execute(
            select(OrderKetso)
            .join(VirtualOrder, VirtualOrder.id == OrderKetso.order_id)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.mode == "thuc_chien",
                OrderKetso.closed_at >= progress.entered_at,
            )
            .order_by(OrderKetso.closed_at.asc())
        )
        return list(result.scalars().all())

    async def _cap3_kehoach_du_dieu_kien(
        self, user_id: uuid.UUID, progress: Cap3Progress
    ) -> list[OrderKehoach]:
        """``order_kehoach`` rows with khẩu vị + mức tự tin + cách khối
        lượng ALL filled in — nhiệm vụ ① source rows.

        NOTE: deliberately NOT filtered by ``VirtualOrder.created_at >=
        progress.entered_at``. Two reasons: (1) it is unnecessary — these 3
        columns can only ever be set via ``record_kehoach`` below, which
        itself requires ``progress.khau_vi_da_dat`` (only true once the user
        has entered Cấp 3), so any row with all 3 filled is inherently
        Cấp-3-era; (2) it would be unreliable — ``VirtualOrder.created_at``
        comes from the DB's low-precision ``server_default=func.now()``
        (whole seconds under SQLite) while ``entered_at`` is a Python
        ``datetime.now(UTC)`` with microsecond precision, so an order created
        in the same wall-clock second as entering Cấp 3 could spuriously
        compare as "before" it.
        """
        result = await self._session.execute(
            select(OrderKehoach)
            .join(VirtualOrder, VirtualOrder.id == OrderKehoach.order_id)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.mode == "thuc_chien",
                OrderKehoach.khau_vi.is_not(None),
                OrderKehoach.muc_tu_tin.is_not(None),
                OrderKehoach.cach_khoi_luong.is_not(None),
            )
            .order_by(VirtualOrder.created_at.asc())
        )
        return list(result.scalars().all())

    async def _diem_ky_luat_tb(self, user_id: uuid.UUID, progress: Cap3Progress) -> float:
        """Mean of Cấp 2's daily điểm kỷ luật (§C12c) over every calendar day
        with Thực chiến order activity on/after entering Cấp 3."""
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
            return 0.0

        scores: list[float] = []
        for day in days:
            diem_result = await self._cap2_svc.diem_ky_luat(user_id, day)
            if diem_result["diem"] is not None:
                scores.append(diem_result["diem"])
        return sum(scores) / len(scores) if scores else 0.0

    async def _recompute_progress(self, user_id: uuid.UUID, progress: Cap3Progress) -> None:
        ketso_rows = await self._cap3_ketso_rows(user_id, progress)

        so_lenh_cap3 = len(ketso_rows)
        tong_pnl_vnd = sum(r.pnl_vnd for r in ketso_rows)
        lai_pct_cap3 = (
            (tong_pnl_vnd / progress.von_ban_dau) * 100.0 if progress.von_ban_dau else 0.0
        )
        diem_ky_luat_tb = await self._diem_ky_luat_tb(user_id, progress)

        progress.so_lenh_cap3 = so_lenh_cap3
        progress.lai_pct_cap3 = lai_pct_cap3
        progress.diem_ky_luat_tb_cap3 = diem_ky_luat_tb

        now = datetime.now(UTC)

        # ① first kehoach row with all 3 quản lý vốn fields filled — not gated.
        if progress.task_1_done_at is None:
            kehoach_rows = await self._cap3_kehoach_du_dieu_kien(user_id, progress)
            if kehoach_rows:
                progress.task_1_done_at = now

        # ② first Cấp 3 kết sổ — gated behind ① (spec §2②).
        if (
            progress.task_1_done_at is not None
            and progress.task_2_done_at is None
            and so_lenh_cap3 >= 1
        ):
            progress.task_2_done_at = now

        # ③ Thách thức Bản lĩnh — triple condition, NOT gated (spec §2③).
        if (
            progress.task_3_done_at is None
            and lai_pct_cap3 >= _TASK3_LAI_PCT_MIN
            and so_lenh_cap3 >= _TASK3_SO_LENH_MIN
            and diem_ky_luat_tb >= _TASK3_DIEM_MIN
        ):
            progress.task_3_done_at = now

        await self._session.flush()
        await self._session.refresh(progress)

    async def mark_task(self, user_id: uuid.UUID, task_no: int) -> Cap3Progress:
        """PATCH /cap3/task — all 3 nhiệm vụ are derived from order history,
        so this just triggers a recompute pass (idempotent)."""
        if task_no not in _TASK_NOS:
            raise BadRequestError("task_no không hợp lệ")
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 3")
        await self._recompute_progress(user_id, progress)
        return progress

    # ── Thách thức Bản lĩnh — GET /cap3/thach-thuc ────

    async def thach_thuc(self, user_id: uuid.UUID) -> dict:
        """3 sub-conditions of nhiệm vụ ③ + current values + đạt/chưa đạt +
        giải thích each (feeds §C12c display)."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 3")
        await self._recompute_progress(user_id, progress)

        lai_dat = progress.lai_pct_cap3 >= _TASK3_LAI_PCT_MIN
        so_lenh_dat = progress.so_lenh_cap3 >= _TASK3_SO_LENH_MIN
        diem_dat = progress.diem_ky_luat_tb_cap3 >= _TASK3_DIEM_MIN

        return {
            "dat_ca_3": lai_dat and so_lenh_dat and diem_dat,
            "lai_pct": {
                "ten": "Lãi ≥ +5% trên vốn",
                "gia_tri_hien_tai": progress.lai_pct_cap3,
                "muc_tieu": _TASK3_LAI_PCT_MIN,
                "dat": lai_dat,
                "giai_thich": (
                    f"Lãi/lỗ đã chốt ở Cấp 3 đang là {progress.lai_pct_cap3:.1f}% trên vốn "
                    f"{progress.von_ban_dau:,.0f}đ — cần đạt ít nhất "
                    f"+{_TASK3_LAI_PCT_MIN:.0f}%."
                ),
            },
            "so_lenh": {
                "ten": "Đủ 15 lệnh Thực chiến",
                "gia_tri_hien_tai": float(progress.so_lenh_cap3),
                "muc_tieu": float(_TASK3_SO_LENH_MIN),
                "dat": so_lenh_dat,
                "giai_thich": (
                    f"Đã qua {progress.so_lenh_cap3}/{_TASK3_SO_LENH_MIN} lệnh Thực chiến "
                    "kể từ khi vào Cấp 3."
                ),
            },
            "diem_ky_luat": {
                "ten": "Điểm kỷ luật ≥ 80%",
                "gia_tri_hien_tai": progress.diem_ky_luat_tb_cap3,
                "muc_tieu": _TASK3_DIEM_MIN,
                "dat": diem_dat,
                "giai_thich": (
                    f"{_DIEM_KY_LUAT_GIAI_THICH} Trung bình giai đoạn Cấp 3: "
                    f"{progress.diem_ky_luat_tb_cap3:.1f}%."
                ),
            },
        }

    # ── Graduation ────────────────────────────────────

    async def graduate(self, user_id: uuid.UUID) -> Cap3Progress:
        """Graduate Cấp 3 — only when all 3 nhiệm vụ are done (thực chất ③)."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 3")
        await self._recompute_progress(user_id, progress)

        all_tasks_done = all(
            getattr(progress, f"task_{n}_done_at") is not None for n in _TASK_NOS
        )
        if not all_tasks_done:
            raise ConflictError("Chưa hoàn thành đủ 3 nhiệm vụ Cấp 3")

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
