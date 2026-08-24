"""Cấp 2 «Kỷ luật» service — progression, SL/TP commitment, đo lường kỷ luật.

Cấp 2 is FREE and Thực chiến-only, built on a graduated Cấp 1. It owns
``cap2_progress`` and EXTENDS Cấp 1's ``order_kehoach``/``order_ketso`` rows
in place (new columns, same physical tables — see ``app.models.cap1``). It
reuses ``VirtualTradingRepository`` (read-only here) for order data.

**ĐÚNG MỘT nhiệm vụ** (mockup ``iqx-cap2-hanhtrinh.html``: ``CẤP 2 · 0/1``):

  ① «10 lệnh Thực chiến có đặt cắt lỗ / chốt lời» — ``so_lenh_co_cl_tp`` ≥ 10

Tốt nghiệp là 1/1.

★ **Nhiệm vụ ② «Thực hiện đúng khi giá chạm mốc» đã BỎ HẲN** cùng với cột
``task_2_done_at`` (migration ``9c3f7ad10b52``). Cấp 2 chỉ còn dạy nửa đầu của
cơ chế — ĐẶT hai mốc — và không còn khoá việc tốt nghiệp vào chuyện thị trường
có chạm mốc hay không (điều user không điều khiển được).

★ **``so_lan_cat_lo_dung`` / ``so_lan_chot_loi_dung`` / ``so_lan_thuc_hien_dung``
vẫn được tính và vẫn được ghi** — chúng KHÔNG còn là nhiệm vụ, chúng là 3 con
số 🛑/🎯/✅ mà khối ④ của «Phân tích danh mục» vẽ (mockup
``iqx-cap2-phantich-danhmuc.html``, KHÔNG đổi) và các trang Phân tích của Cấp
3-8 vẽ lại từ chính hàng này. Chúng là số MÔ TẢ, không phải mốc phải đạt.

**The counter is recomputed server-side from the persisted
``order_kehoach``/``order_ketso`` rows on every write — never trusted from
client-supplied counters.** The 4 vi phạm booleans themselves
(``cham_SL_khong_cat``, ``cham_TP_giu_lam_hut``, ``ban_som_khi_lo_nhe``,
``nhoi_lenh_khi_lo``) ARE accepted from the caller (like ``cam_xuc`` in Cấp 1 —
observed facts about this one order, not aggregate state) and persisted as the
source of truth; every aggregate is walked fresh from that history.

Design notes (documented here since the mockup leaves them implicit):
  - **① recomputes on ``record_kehoach`` too, not just ``record_ketso``.** ① is
    about PLACING the marks; a user with 10 open positions that all carry cắt
    lỗ + chốt lời has done the task, and waiting for a Kết sổ would freeze the
    journey at 0/10.
  - ① counts FILLED Thực chiến **BUY** orders whose kế hoạch has BOTH
    ``cat_lo`` and ``chot_loi``. No date window is needed: those two columns
    can only ever be written by ``Cap2Service.record_kehoach``, which requires
    a ``cap2_progress`` row — so a Cấp 1-era plan can never carry them.
  - The 🛑/🎯 analytics count, per round trip, AT MOST ONE "thực hiện đúng khi
    giá chạm mốc", over ``order_ketso`` rows closed AT OR AFTER
    ``Cap2Progress.entered_at``:
      · **cắt lỗ** — ``cham_SL_cat_dung_phien_ke`` is True (spec §9: giá chạm
        cắt lỗ cuối phiên → bán ATO phiên kế. This is the spec's own definition
        of "cắt lỗ đúng phiên" and the mockups do not redefine it).
      · **chốt lời** — otherwise, the matched ``OrderKehoach.chot_loi`` is set,
        the sell's ``gia_ra`` reached/exceeded it, AND ``cham_TP_giu_lam_hut``
        is False (spec's "chốt lời đúng, không hụt" — §13 has no dedicated
        column for it).
    The SL leg wins when both would match, which keeps the invariant
    ``so_lan_thuc_hien_dung == so_lan_cat_lo_dung + so_lan_chot_loi_dung`` that
    «Phân tích danh mục» block ④ renders as 🛑 / 🎯 / ✅.
  - Once ``task_1_done_at`` is stamped it is NEVER un-stamped (matches Cấp 1's
    "stamp when first met" pattern). The counter is monotonic anyway, so this
    only matters for hand-edited data.

``diem_ky_luat`` (the 0-100 daily score) is NOT part of Cấp 2's journey any
more — the mockups drop it from both Hành trình and Phân tích danh mục. It
stays here as a pure read-only computation because **Cấp 3 consumes it** for
``Cap3Progress.diem_ky_luat_tb_cap3`` and the Cấp 6/7 trading pages still read
``GET /cap2/diem-ky-luat``.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap1 import Cap1Progress, OrderKehoach, OrderKetso, PhuongPhapSlTp
from app.models.cap2 import Cap2Progress
from app.models.virtual_trading import OrderSide, OrderStatus, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository

_VN_TZ = timezone(timedelta(hours=7))

#: ĐÚNG MỘT nhiệm vụ. Giữ dạng tuple để ``mark_task``/``graduate`` vẫn đọc
#: cùng một nguồn — và để việc thêm/bỏ nhiệm vụ chỉ phải sửa ở đây.
_TASK_NOS = (1,)
_TASK1_TARGET_LENH = 10  # ① 10 lệnh Thực chiến có đặt cắt lỗ / chốt lời

# Điểm kỷ luật formula (spec §7) — raw point values before normalization.
_DIEM_KE_HOACH_MAX = 40
_DIEM_CAT_LO_PER = 20
_DIEM_CAT_LO_MAX = 40
_DIEM_KHONG_NHOI_PER = 10
_DIEM_KHONG_NHOI_MAX = 30
_DIEM_CHOT_LOI_PER = 10
_DIEM_CHOT_LOI_MAX = 30
_DIEM_RAW_MAX = (
    _DIEM_KE_HOACH_MAX + _DIEM_CAT_LO_MAX + _DIEM_KHONG_NHOI_MAX + _DIEM_CHOT_LOI_MAX
)


def _is_chot_loi_dung(ketso: OrderKetso, kehoach: OrderKehoach | None) -> bool:
    """Chạm chốt lời cam kết và bán trong phiên đó (không giữ tiếp làm hụt)."""
    if kehoach is None or kehoach.chot_loi is None:
        return False
    return ketso.gia_ra >= kehoach.chot_loi and not ketso.cham_TP_giu_lam_hut


class Cap2Service:
    """Business logic for the free Cấp 2 «Kỷ luật» flow."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._vt_repo = VirtualTradingRepository(session)

    # ── Progress row ─────────────────────────────────

    async def _get_progress_row(self, user_id: uuid.UUID) -> Cap2Progress | None:
        result = await self._session.execute(
            select(Cap2Progress).where(Cap2Progress.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_progress(self, user_id: uuid.UUID) -> Cap2Progress | None:
        return await self._get_progress_row(user_id)

    async def enter(self, user_id: uuid.UUID) -> Cap2Progress:
        """Enter Cấp 2 (idempotent). Requires the user to have graduated Cấp 1."""
        progress = await self._get_progress_row(user_id)
        if progress is not None:
            return progress

        cap1_result = await self._session.execute(
            select(Cap1Progress).where(Cap1Progress.user_id == user_id)
        )
        cap1_progress = cap1_result.scalar_one_or_none()
        if cap1_progress is None:
            raise NotFoundError("tiến trình Cấp 1")
        if cap1_progress.graduated_at is None:
            raise ConflictError("Chưa tốt nghiệp Cấp 1")

        progress = Cap2Progress(user_id=user_id, entered_at=datetime.now(UTC))
        self._session.add(progress)
        await self._session.flush()
        await self._session.refresh(progress)
        return progress

    # ── Kế hoạch — cắt lỗ/chốt lời (spec §5) ──────────

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
        phuong_phap_sl_tp: str,
        cat_lo: int,
        chot_loi: int,
    ) -> OrderKehoach:
        """Adds the cắt lỗ/chốt lời commitment to the EXISTING ``order_kehoach``
        row created by Cấp 1's ``/cap1/kehoach`` (Cấp 1's Form Kế hoạch fields —
        lý do, vùng mua — are filled first; Cấp 2 only inserts the SL/TP block).
        """
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 2")

        order = await self._vt_repo.get_order_by_id(order_id)
        if order is None or order.user_id != user_id:
            raise NotFoundError("lệnh")
        if order.side != OrderSide.BUY:
            raise BadRequestError("Cắt lỗ/Chốt lời chỉ ghi cho lệnh MUA")

        try:
            phuong_phap_enum = PhuongPhapSlTp(phuong_phap_sl_tp)
        except ValueError as exc:
            raise BadRequestError("phuong_phap_sl_tp không hợp lệ") from exc

        if cat_lo is None or cat_lo <= 0 or chot_loi is None or chot_loi <= 0:
            raise BadRequestError("Cắt lỗ/Chốt lời phải là số dương")

        kehoach = await self._get_kehoach_by_order(order_id)
        if kehoach is None:
            raise NotFoundError("kế hoạch Cấp 1 — cần ghi lý do + vùng mua trước")

        kehoach.phuong_phap_sl_tp = phuong_phap_enum
        kehoach.cat_lo = int(cat_lo)
        kehoach.chot_loi = int(chot_loi)
        await self._session.flush()
        await self._session.refresh(kehoach)

        # ① counts lệnh that CARRY the marks — this write is the event that
        # moves it, so recompute here and not only on Kết sổ.
        await self._recompute_progress(user_id, progress)
        return kehoach

    # ── Kết sổ — 7 discipline flags (spec §8/§9/§13) ──

    async def _get_ketso_by_order(self, order_id: uuid.UUID) -> OrderKetso | None:
        result = await self._session.execute(
            select(OrderKetso).where(OrderKetso.order_id == order_id)
        )
        return result.scalar_one_or_none()

    async def record_ketso(
        self,
        user_id: uuid.UUID,
        order_id: uuid.UUID,
        *,
        cham_sl_cuoi_phien: bool = False,
        cham_sl_cat_dung_phien_ke: bool = False,
        cham_sl_khong_cat: bool = False,
        giu_cham_sl_bao_nhieu_phien: int | None = None,
        cham_tp_giu_lam_hut: bool = False,
        ban_som_khi_lo_nhe: bool = False,
        nhoi_lenh_khi_lo: bool = False,
    ) -> OrderKetso:
        """Persist the 4 vi phạm (+ 3 measurement) flags onto the EXISTING
        ``order_ketso`` row created by Cấp 1's ``/cap1/ketso`` (which already
        computed gia_ra/pnl/closed_at), then recompute nhiệm vụ ① and the
        🛑/🎯/✅ analytics counters.

        NOTE: params are lowercase (not the spec-verbatim mixed case used on
        the wire schema / ORM columns) purely to keep this a normal Python
        signature — mirrors Cấp 1's ``ly_do``/``trang_thai_luc_dat`` params.
        """
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 2")

        sell_order = await self._vt_repo.get_order_by_id(order_id)
        if sell_order is None or sell_order.user_id != user_id:
            raise NotFoundError("lệnh")
        if sell_order.side != OrderSide.SELL:
            raise BadRequestError("Đo kỷ luật chỉ ghi cho lệnh BÁN")

        ketso = await self._get_ketso_by_order(order_id)
        if ketso is None:
            raise NotFoundError("kết sổ Cấp 1 — cần kết sổ (Cấp 1) trước")

        ketso.cham_SL_cuoi_phien = cham_sl_cuoi_phien
        ketso.cham_SL_cat_dung_phien_ke = cham_sl_cat_dung_phien_ke
        ketso.cham_SL_khong_cat = cham_sl_khong_cat
        ketso.giu_cham_SL_bao_nhieu_phien = giu_cham_sl_bao_nhieu_phien
        ketso.cham_TP_giu_lam_hut = cham_tp_giu_lam_hut
        ketso.ban_som_khi_lo_nhe = ban_som_khi_lo_nhe
        ketso.nhoi_lenh_khi_lo = nhoi_lenh_khi_lo
        await self._session.flush()
        await self._session.refresh(ketso)

        await self._recompute_progress(user_id, progress)
        return ketso

    # ── Recompute nhiệm vụ ① + analytics from kế hoạch/kết sổ history ──

    async def _cap2_ketso_rows(
        self, user_id: uuid.UUID, progress: Cap2Progress
    ) -> list[OrderKetso]:
        """All Cấp 2-era closed Thực chiến round trips, oldest → newest."""
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

    async def _find_matching_kehoach(self, sell_order: VirtualOrder) -> OrderKehoach | None:
        """Best-effort match to the buy side of this round trip — same
        pragmatic single-lot approximation as Cấp 1's ``_find_matching_buy``."""
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
        buy_order = result.scalars().first()
        if buy_order is None:
            return None
        return await self._get_kehoach_by_order(buy_order.id)

    async def _so_lenh_co_cl_tp(self, user_id: uuid.UUID) -> int:
        """① — filled Thực chiến BUY orders whose kế hoạch carries BOTH marks.

        No date window: ``cat_lo``/``chot_loi`` are only ever written by
        ``record_kehoach`` above, which requires a ``cap2_progress`` row, so a
        Cấp 1-era plan can never satisfy this.
        """
        result = await self._session.execute(
            select(func.count(OrderKehoach.id))
            .join(VirtualOrder, VirtualOrder.id == OrderKehoach.order_id)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.mode == "thuc_chien",
                VirtualOrder.side == OrderSide.BUY,
                VirtualOrder.status == OrderStatus.FILLED,
                OrderKehoach.cat_lo.is_not(None),
                OrderKehoach.chot_loi.is_not(None),
            )
        )
        return int(result.scalar_one() or 0)

    async def _dem_thuc_hien_dung(self, rows: list[OrderKetso]) -> tuple[int, int]:
        """(số lần cắt lỗ đúng, số lần chốt lời đúng) over Cấp 2-era rows.

        ★ ANALYTICS ONLY — no nhiệm vụ reads these any more (nhiệm vụ ② is
        gone). They feed khối ④ «Bạn đã dùng cơ chế cắt lỗ / chốt lời thế nào»
        of «Phân tích danh mục», on Cấp 2's own page and on Cấp 3-8's.

        At most ONE execution per round trip; the cắt lỗ leg wins a tie so the
        two legs always sum to the ✅ total the block renders.
        """
        so_cat_lo_dung = 0
        so_chot_loi_dung = 0
        for row in rows:
            if row.cham_SL_cat_dung_phien_ke:
                so_cat_lo_dung += 1
                continue
            sell_order = await self._vt_repo.get_order_by_id(row.order_id)
            kehoach = (
                await self._find_matching_kehoach(sell_order)
                if sell_order is not None
                else None
            )
            if _is_chot_loi_dung(row, kehoach):
                so_chot_loi_dung += 1
        return so_cat_lo_dung, so_chot_loi_dung

    async def _recompute_progress(self, user_id: uuid.UUID, progress: Cap2Progress) -> None:
        now = datetime.now(UTC)
        rows = await self._cap2_ketso_rows(user_id, progress)

        # ① — 10 lệnh Thực chiến có đặt cắt lỗ / chốt lời.
        progress.so_lenh_co_cl_tp = await self._so_lenh_co_cl_tp(user_id)

        # 🛑/🎯/✅ — ANALYTICS for «Phân tích danh mục» khối ④. Không nhiệm vụ
        # nào đọc ba con số này; chúng không mở/đóng cổng tốt nghiệp nào.
        so_cat_lo_dung, so_chot_loi_dung = await self._dem_thuc_hien_dung(rows)
        progress.so_lan_cat_lo_dung = so_cat_lo_dung
        progress.so_lan_chot_loi_dung = so_chot_loi_dung
        progress.so_lan_thuc_hien_dung = so_cat_lo_dung + so_chot_loi_dung

        # ① là cổng DUY NHẤT của Cấp 2.
        if (
            progress.so_lenh_co_cl_tp >= _TASK1_TARGET_LENH
            and progress.task_1_done_at is None
        ):
            progress.task_1_done_at = now

        await self._session.flush()
        await self._session.refresh(progress)

    async def mark_task(self, user_id: uuid.UUID, task_no: int) -> Cap2Progress:
        """PATCH /cap2/task — nhiệm vụ ① is derived from kế hoạch/kết sổ
        history, so this just triggers a recompute pass (idempotent)."""
        if task_no not in _TASK_NOS:
            raise BadRequestError("task_no không hợp lệ")
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 2")
        await self._recompute_progress(user_id, progress)
        return progress

    # ── Điểm kỷ luật hằng ngày (spec §7) ──────────────

    async def diem_ky_luat(self, user_id: uuid.UUID, ngay: date | None = None) -> dict:
        """Chấm điểm 0-100 cho 1 ngày có giao dịch + breakdown (§C12c)."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 2")

        target_day = ngay or datetime.now(_VN_TZ).date()

        kehoach_result = await self._session.execute(
            select(OrderKehoach)
            .join(VirtualOrder, VirtualOrder.id == OrderKehoach.order_id)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.mode == "thuc_chien",
                VirtualOrder.trading_date == target_day,
            )
        )
        kehoach_rows = list(kehoach_result.scalars().all())

        ketso_result = await self._session.execute(
            select(OrderKetso)
            .join(VirtualOrder, VirtualOrder.id == OrderKetso.order_id)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.mode == "thuc_chien",
                VirtualOrder.trading_date == target_day,
            )
        )
        ketso_rows = list(ketso_result.scalars().all())

        if not kehoach_rows and not ketso_rows:
            return {
                "ngay": target_day,
                "co_giao_dich": False,
                "co_tinh_huong": False,
                "diem": None,
                "xep_loai": None,
                "giai_thich": "Ngày không đặt lệnh nào — không chấm điểm.",
                "thanh_phan": None,
            }

        # Component A — kế hoạch đầy đủ (lý do + vùng mua đã có sẵn từ Cấp 1;
        # ở đây chỉ còn kiểm SL/TP vì đó là phần Cấp 2 thêm). Vắng mặt lệnh mua
        # nào trong ngày → coi là không có gì để thiếu (đầy đủ mặc định).
        if kehoach_rows:
            so_du = sum(
                1
                for k in kehoach_rows
                if k.phuong_phap_sl_tp is not None
                and k.cat_lo is not None
                and k.chot_loi is not None
            )
            ty_le_du = so_du / len(kehoach_rows)
        else:
            ty_le_du = 1.0
        diem_ke_hoach = _DIEM_KE_HOACH_MAX * ty_le_du

        # Component B — cắt lỗ đúng phiên khi giá chạm (mỗi lần +20, tối đa 40)
        so_cat_lo_dung = sum(1 for k in ketso_rows if k.cham_SL_cat_dung_phien_ke)
        diem_cat_lo = min(_DIEM_CAT_LO_MAX, so_cat_lo_dung * _DIEM_CAT_LO_PER)

        # Component C — không nhồi lệnh khi đang lỗ (mỗi lần +10, tối đa 30)
        so_khong_nhoi = sum(1 for k in ketso_rows if not k.nhoi_lenh_khi_lo)
        diem_khong_nhoi = min(_DIEM_KHONG_NHOI_MAX, so_khong_nhoi * _DIEM_KHONG_NHOI_PER)

        # Component D — chốt lời đúng, không tham thêm (mỗi lần +10, tối đa 30)
        so_chot_loi_dung = 0
        for k in ketso_rows:
            sell_order = await self._vt_repo.get_order_by_id(k.order_id)
            kehoach = (
                await self._find_matching_kehoach(sell_order)
                if sell_order is not None
                else None
            )
            if _is_chot_loi_dung(k, kehoach):
                so_chot_loi_dung += 1
        diem_chot_loi = min(_DIEM_CHOT_LOI_MAX, so_chot_loi_dung * _DIEM_CHOT_LOI_PER)

        co_tinh_huong = len(ketso_rows) > 0
        thanh_phan = {
            "ke_hoach": diem_ke_hoach,
            "ke_hoach_toi_da": float(_DIEM_KE_HOACH_MAX),
            "cat_lo_dung": float(diem_cat_lo),
            "cat_lo_dung_toi_da": float(_DIEM_CAT_LO_MAX),
            "khong_nhoi": float(diem_khong_nhoi),
            "khong_nhoi_toi_da": float(_DIEM_KHONG_NHOI_MAX),
            "chot_loi_dung": float(diem_chot_loi),
            "chot_loi_dung_toi_da": float(_DIEM_CHOT_LOI_MAX),
        }

        if not co_tinh_huong:
            diem = diem_ke_hoach
            giai_thich = (
                "Ngày không có tình huống thử thách kỷ luật — điểm tính theo "
                f"phần kế hoạch (tối đa {_DIEM_KE_HOACH_MAX})."
            )
            return {
                "ngay": target_day,
                "co_giao_dich": True,
                "co_tinh_huong": False,
                "diem": diem,
                "xep_loai": None,
                "giai_thich": giai_thich,
                "thanh_phan": thanh_phan,
            }

        raw_total = diem_ke_hoach + diem_cat_lo + diem_khong_nhoi + diem_chot_loi
        diem = max(0.0, min(100.0, raw_total / _DIEM_RAW_MAX * 100.0))

        if diem >= 85:
            xep_loai = "xanh"
            nhan_xet = "Ngày kỷ luật cao"
        elif diem >= 70:
            xep_loai = "vang"
            nhan_xet = "Ổn, còn 1-2 điểm chưa trọn"
        else:
            xep_loai = "do"
            nhan_xet = "Có vi phạm đáng chú ý"

        giai_thich = (
            f"{nhan_xet}: kế hoạch {diem_ke_hoach:.0f}/{_DIEM_KE_HOACH_MAX} + "
            f"cắt lỗ đúng {diem_cat_lo:.0f}/{_DIEM_CAT_LO_MAX} + "
            f"không nhồi {diem_khong_nhoi:.0f}/{_DIEM_KHONG_NHOI_MAX} + "
            f"chốt lời đúng {diem_chot_loi:.0f}/{_DIEM_CHOT_LOI_MAX}."
        )

        return {
            "ngay": target_day,
            "co_giao_dich": True,
            "co_tinh_huong": True,
            "diem": diem,
            "xep_loai": xep_loai,
            "giai_thich": giai_thich,
            "thanh_phan": thanh_phan,
        }

    # ── Graduation ────────────────────────────────────

    async def graduate(self, user_id: uuid.UUID) -> Cap2Progress:
        """Graduate Cấp 2 — only when nhiệm vụ ① is done (1/1)."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 2")

        all_tasks_done = all(
            getattr(progress, f"task_{n}_done_at") is not None for n in _TASK_NOS
        )
        if not all_tasks_done:
            raise ConflictError("Chưa hoàn thành nhiệm vụ Cấp 2")

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
