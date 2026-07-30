"""Cấp 5 «Lão luyện» service — verdict hệ gợi ý + provenance, phân loại 4 ô,
đứng ngoài có chủ đích + chấm né đúng/hụt sau 5 phiên, Thách thức Lão luyện.

Cấp 5 is FREE and Thực chiến-only, built on a graduated Cấp 4. It owns
``cap5_progress`` + ``standby_decision`` and EXTENDS Cấp 1's ``order_ketso``
rows in place (new columns ``verdict_he``/``verdict_user``/
``verdict_provenance``/``o_4``/``ly_do_sua`` on the same physical table — see
``app.models.cap1``). It reuses ``VirtualTradingRepository`` (read-only here)
for order lookups.

**★ CRITICAL PRINCIPLE (spec §1/§4) — đúng/sai measures the PROCESS, never the
outcome.** ``_compute_signals`` reads ONLY process data (cơ sở lúc đặt, kỷ luật
thoát, không nhồi lệnh, khối lượng khớp khẩu vị). ``pnl_pct`` is never an input
to it: it only chooses which COLUMN of the 4-ô matrix the order lands in, so a
losing order that followed its plan is ``dung_thua`` and a winning order that
broke it is ``sai_thang`` (the dangerous cell). ``test_losing_but_disciplined_
order_is_dung`` pins this invariant down.

**Everything derived is recomputed server-side on every read/write** —
``verdict_he`` (recomputed at ``record_ketso`` time even though the FE already
displayed it), ``o_4``, ``so_lenh_phan_loai``, ``so_lan_dung_ngoai_da_cham``,
``ty_le_quyet_dinh_dung`` and the 3 nhiệm vụ. The client can only ever supply
its OWN judgement (``verdict_user`` + ``ly_do_sua``) and the đứng-ngoài
``symbol``/``reason``; every number and the hệ verdict come from persisted data.

Design notes (documented here since the spec leaves them implicit):

  - **Which order does a verdict belong to?** ``order_id`` is the SELL order —
    the same key Cấp 1/2's Kết sổ uses (``order_ketso.order_id``). The process
    data lives partly on the SELL's ``order_ketso`` (Cấp 2's discipline flags)
    and partly on the matching BUY's ``order_kehoach`` (Cấp 1's lý do, Cấp 3's
    %vốn, Cấp 4's đồng thuận), paired with Cấp 1's own rule verbatim
    (``Cap1Service._find_matching_buy``: the most recent FILLED buy for the same
    account+symbol at/before the sell — the same approximation that produced
    that row's ``pnl_pct``). Mirrored in Python here exactly as Cấp 4 mirrors it.

  - **Signals whose source data is absent are reported ``dat=None``, NOT
    "passed".** They are then EXCLUDED from the verdict AND: the user is never
    failed for data the system never recorded, and the FE always shows the gap
    verbatim (§C12c) instead of an invisible free pass. Concretely:
      · ``co_so`` — always assessable: ``order_kehoach.trangThai_luc_dat`` is
        NOT NULL, so the Cấp 1 leg always exists; Cấp 4's ``so_lop_dong_thuan``
        is merely an additional way to pass (the two are OR'd, spec §1). Unknown
        only when there is no ``order_kehoach`` row at all (a sell with no
        recorded plan, e.g. a pre-Cấp-1 position).
      · ``ky_luat_thoat`` / ``khong_nhoi`` — Cấp 2's flags are NOT NULL booleans
        defaulting to ``false``, so "no violation recorded" and "never assessed"
        are indistinguishable at the schema level. We treat ``false`` as
        "không vi phạm", which is exactly how Cấp 2's own điểm kỷ luật reads
        them everywhere else — so these two signals are always assessable.
      · ``khoi_luong_khop`` — needs Cấp 3's ``pct_von`` (nullable) AND a khẩu vị;
        unknown when either is missing.

  - **Khẩu vị trần** (10/20/30% for thận trọng/cân bằng/tấn công — spec §5,
    mirrored from the FE's ``KHAU_VI_PCT`` and ``KhauViRuiRo``'s docstring). The
    per-order SNAPSHOT ``order_kehoach.khau_vi`` is preferred over the live
    ``Cap3Progress.khau_vi`` profile setting when present: it is the khẩu vị
    that was actually in force when the order was placed, so a later profile
    change can never retroactively flip an old verdict. ``Cap3Progress.khau_vi``
    is the fallback. A ``_KHAU_VI_TOLERANCE_PCT`` slack of 0.5 percentage points
    absorbs lot rounding (khối lượng must be a whole number of shares, so a 20%
    target can land at 20.3%) — without it the FE's own suggested khối lượng
    could read as a violation.

  - **Đứng ngoài scoring is lazy compute-on-read** (no cron): every read of
    ``/cap5/progress`` or ``/cap5/dung-ngoai`` scores any decision whose 5
    trading sessions have elapsed, and ``/cap5/dung-ngoai/cham`` exposes the
    same routine explicitly. The 5-phiên window uses the repo's existing
    trading-day helper (``app.services.virtual_trading.settlement.
    add_trading_days``, the same Mon-Fri rule Cấp 1's ``so_phien_giu`` counts
    with — no new calendar). Thresholds: ≤ +2% → né đúng, ≥ +5% → né hụt,
    in between → trung tính (spec §5's "never punish the ambiguous middle").
    If the target session's price is unavailable the decision is left UNSCORED —
    never guessed — and therefore never counts toward nhiệm vụ ③.

  - **Holiday tolerance.** The trading-day helper knows Mon-Fri but carries no
    holiday calendar, so the computed due session can be a holiday with no bar.
    If the due bar is missing but the series clearly runs PAST the due date
    (i.e. history for that window is complete), the last session inside the
    window is used instead; otherwise the decision stays unscored. Without this
    a single holiday would strand a decision permanently.

  - **Counters.** ``so_lenh_phan_loai`` = the user's Thực chiến ``order_ketso``
    rows with ``o_4`` set; ``ty_le_quyet_dinh_dung`` = % of those in a ``dung_*``
    ô. Deliberately NOT filtered by ``entered_at``, for Cấp 4's reason: ``o_4``
    can only ever be written by ``record_ketso`` below, which requires a
    ``Cap5Progress`` row, so any row carrying it is inherently Cấp-5-era.

  - **Nhiệm vụ** ① first classified order · ② first ``StandbyDecision`` (logged,
    not necessarily scored — spec §2②'s bar is "ghi xong 1 quyết định") ·
    ③ all three legs at once (≥20 phân loại, ≥5 đã chấm, ≥70% đúng). None are
    gated behind each other (spec §2: ①② "điều kiện mở: vào Cấp 5"), and once a
    ``task_N_done_at`` is stamped it is NEVER un-stamped — Cấp 1/2/3/4's pattern.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    ServiceUnavailableError,
    UnprocessableEntityError,
)
from app.models.cap1 import KhauViRuiRo, OrderKehoach, OrderKetso, TrangThaiLucDat
from app.models.cap3 import Cap3Progress
from app.models.cap4 import Cap4Progress
from app.models.cap5 import (
    KET_QUA_LABELS,
    LY_DO_DUNG_NGOAI_LABELS,
    O4,
    Cap5Progress,
    KetQuaDungNgoai,
    LyDoDungNgoai,
    StandbyDecision,
    Verdict,
)
from app.models.virtual_trading import OrderSide, OrderStatus, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.ta.data import get_adjusted_ohlcv
from app.services.virtual_trading.price_resolver import resolve_price
from app.services.virtual_trading.settlement import add_trading_days

logger = logging.getLogger(__name__)

_VN_TZ = timezone(timedelta(hours=7))

_TASK_NOS = (1, 2, 3)

# Đứng ngoài (spec §5) — N = 5 phiên giao dịch (same window AI Insight uses).
SO_PHIEN_CHAM = 5
NGUONG_NE_DUNG_PCT = 2.0  # ≤ +2% → nước đứng ngoài hợp lý
NGUONG_NE_HUT_PCT = 5.0  # ≥ +5% → đã bỏ lỡ
# Khối ⑬ hides its statistics below this many SCORED decisions (spec §6).
MIN_DA_CHAM_PHAN_TICH = 3

# Thách thức Lão luyện (spec §2③) — triple condition, ALL must hold at once.
_TASK3_SO_LENH_MIN = 20
_TASK3_DUNG_NGOAI_MIN = 5
_TASK3_TY_LE_MIN = 70.0

# Cơ sở lúc đặt — Cấp 4's "điểm đồng thuận" bar (spec §1: ≥3/5 lớp ủng hộ).
_DONG_THUAN_MIN = 3

# Khẩu vị rủi ro → trần %vốn/lệnh (spec §5; mirrors the FE's KHAU_VI_PCT and
# ``app.models.cap1.KhauViRuiRo``'s docstring).
KHAU_VI_TRAN_PCT: dict[str, float] = {
    KhauViRuiRo.THAN_TRONG.value: 10.0,
    KhauViRuiRo.CAN_BANG.value: 20.0,
    KhauViRuiRo.TAN_CONG.value: 30.0,
}
KHAU_VI_LABELS: dict[str, str] = {
    KhauViRuiRo.THAN_TRONG.value: "Thận trọng",
    KhauViRuiRo.CAN_BANG.value: "Cân bằng",
    KhauViRuiRo.TAN_CONG.value: "Tấn công",
}
# Slack for lot rounding — see the module docstring's khẩu vị trần note.
KHAU_VI_TOLERANCE_PCT = 0.5

_VERDICT_VALUES = frozenset(m.value for m in Verdict)
_LY_DO_VALUES = frozenset(m.value for m in LyDoDungNgoai)

_VERDICT_GIAI_THICH_DUNG = (
    "Quyết định ĐÚNG: lệnh này theo đúng kế hoạch + kỷ luật của chính bạn — "
    "đánh giá này đo QUY TRÌNH, hoàn toàn độc lập với lãi/lỗ."
)
_VERDICT_GIAI_THICH_SAI = (
    "Quyết định SAI: lệnh này phá ít nhất một điều bạn đã tự cam kết — "
    "đánh giá này đo QUY TRÌNH, hoàn toàn độc lập với lãi/lỗ."
)

_DUNG_NGOAI_GIAI_THICH = (
    f"Sau {SO_PHIEN_CHAM} phiên giao dịch, hệ so giá với lúc bạn đứng ngoài: "
    f"tăng không quá {NGUONG_NE_DUNG_PCT:.0f}% (hoặc giảm) là né đúng, "
    f"tăng từ {NGUONG_NE_HUT_PCT:.0f}% trở lên là né hụt, khoảng giữa là trung "
    "tính — không tính đúng cũng không tính hụt. Đứng ngoài nhiều hơn KHÔNG "
    "phải là tốt hơn; mục tiêu là biết vì sao mình không mua."
)


def han_cham_date(decided_at: datetime) -> date:
    """The session a đứng-ngoài decision is scored against — ``SO_PHIEN_CHAM``
    trading sessions after the decision's Vietnam calendar date.

    Uses the repo's existing Mon-Fri trading-day helper (no holiday calendar —
    see the module docstring's holiday-tolerance note).
    """
    if decided_at.tzinfo is None:
        decided_at = decided_at.replace(tzinfo=UTC)
    decided_on = decided_at.astimezone(_VN_TZ).date()
    return add_trading_days(decided_on, SO_PHIEN_CHAM, set())


def _decided_on(decided_at: datetime) -> date:
    if decided_at.tzinfo is None:
        decided_at = decided_at.replace(tzinfo=UTC)
    return decided_at.astimezone(_VN_TZ).date()


async def _fetch_close_vnd(symbol: str, decided_on: date, target: date) -> float | None:
    """Adjusted close for ``target`` (integer-ish VND), or ``None`` when the
    price history for that session is unavailable.

    Fail-soft on purpose: an unavailable price leaves the decision UNSCORED
    rather than guessed (spec §5 has no "assume flat" branch).
    """
    try:
        data, _start_index = await get_adjusted_ohlcv(
            symbol, decided_on, target + timedelta(days=7)
        )
    except Exception as exc:  # noqa: BLE001 — any source failure ⇒ leave unscored
        logger.debug("Cấp 5: no price history for %s @ %s: %s", symbol, target, exc)
        return None

    times: list[str] = list(data.time)
    target_iso = target.isoformat()
    decided_iso = decided_on.isoformat()

    for i, t in enumerate(times):
        if t == target_iso:
            return float(data.close[i])

    # The due session has no bar. Only fall back if history clearly runs PAST
    # it (so this is a holiday inside a complete window, not missing data).
    if not any(t > target_iso for t in times):
        return None
    inside = [i for i, t in enumerate(times) if decided_iso < t < target_iso]
    if not inside:
        return None
    return float(data.close[inside[-1]])


class Cap5Service:
    """Business logic for the free Cấp 5 «Lão luyện» flow."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._vt_repo = VirtualTradingRepository(session)

    # ── Progress row ─────────────────────────────────

    async def _get_progress_row(self, user_id: uuid.UUID) -> Cap5Progress | None:
        result = await self._session.execute(
            select(Cap5Progress).where(Cap5Progress.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def _require_progress(self, user_id: uuid.UUID) -> Cap5Progress:
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 5")
        return progress

    async def get_progress(self, user_id: uuid.UUID) -> Cap5Progress | None:
        progress = await self._get_progress_row(user_id)
        if progress is None:
            return None
        await self._recompute_progress(user_id, progress)
        return progress

    async def enter(self, user_id: uuid.UUID) -> Cap5Progress:
        """Enter Cấp 5 (idempotent). Requires the user to have graduated Cấp 4."""
        progress = await self._get_progress_row(user_id)
        if progress is not None:
            return progress

        cap4_result = await self._session.execute(
            select(Cap4Progress).where(Cap4Progress.user_id == user_id)
        )
        cap4_progress = cap4_result.scalar_one_or_none()
        if cap4_progress is None:
            raise NotFoundError("tiến trình Cấp 4")
        if cap4_progress.graduated_at is None:
            raise ConflictError("Chưa tốt nghiệp Cấp 4")

        progress = Cap5Progress(user_id=user_id, entered_at=datetime.now(UTC))
        self._session.add(progress)
        await self._session.flush()
        await self._session.refresh(progress)
        return progress

    # ── Source rows ───────────────────────────────────

    async def _get_ketso_by_order(self, order_id: uuid.UUID) -> OrderKetso | None:
        result = await self._session.execute(
            select(OrderKetso).where(OrderKetso.order_id == order_id)
        )
        return result.scalar_one_or_none()

    async def _find_matching_buy(self, sell_order: VirtualOrder) -> VirtualOrder | None:
        """The most recent FILLED buy for the same account+symbol at/before the
        sell — Cấp 1's own pairing rule verbatim (``Cap1Service._find_matching_
        buy``), mirrored here exactly as Cấp 4 mirrors it."""
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

    async def _kehoach_for_sell(self, sell_order: VirtualOrder) -> OrderKehoach | None:
        buy = await self._find_matching_buy(sell_order)
        if buy is None:
            return None
        result = await self._session.execute(
            select(OrderKehoach).where(OrderKehoach.order_id == buy.id)
        )
        return result.scalar_one_or_none()

    async def _khau_vi_ho_so(self, user_id: uuid.UUID) -> str | None:
        """The live khẩu vị profile setting — fallback when the order carries no
        snapshot (see the module docstring)."""
        result = await self._session.execute(
            select(Cap3Progress).where(Cap3Progress.user_id == user_id)
        )
        cap3 = result.scalar_one_or_none()
        if cap3 is None or cap3.khau_vi is None:
            return None
        return cap3.khau_vi.value if hasattr(cap3.khau_vi, "value") else str(cap3.khau_vi)

    # ── Verdict hệ gợi ý + provenance (spec §4/§C12c) ──

    @staticmethod
    def _signal(ma: str, ten: str, dat: bool | None, giai_thich: str) -> dict:
        return {"ma": ma, "ten": ten, "dat": dat, "giai_thich": giai_thich}

    @classmethod
    def _signal_co_so(cls, kehoach: OrderKehoach | None) -> dict:
        ten = "Có cơ sở lúc đặt"
        if kehoach is None:
            return cls._signal(
                "co_so",
                ten,
                None,
                "Chưa có dữ liệu: lệnh này không tìm thấy kế hoạch mua đã ghi, "
                "nên hệ không kết luận được về cơ sở lúc đặt.",
            )
        dong_thuan = kehoach.so_lop_dong_thuan
        trang_thai = kehoach.trangThai_luc_dat
        trang_thai_value = (
            trang_thai.value if hasattr(trang_thai, "value") else str(trang_thai)
        )
        du_dong_thuan = dong_thuan is not None and dong_thuan >= _DONG_THUAN_MIN
        ly_do_ung_ho = trang_thai_value == TrangThaiLucDat.UNG_HO.value

        if du_dong_thuan:
            return cls._signal(
                "co_so",
                ten,
                True,
                f"{dong_thuan}/5 lớp bạn đọc là Ủng hộ lúc đặt "
                f"(từ {_DONG_THUAN_MIN}/5 trở lên là đủ cơ sở).",
            )
        if ly_do_ung_ho:
            extra = (
                f" (chỉ {dong_thuan}/5 lớp Ủng hộ, nhưng lý do chính đã đủ)"
                if dong_thuan is not None
                else ""
            )
            return cls._signal(
                "co_so", ten, True, f"Lý do chính lúc đặt được AI Thanh tra đánh giá Ủng hộ{extra}."
            )
        so_lop_text = (
            f"chỉ {dong_thuan}/5 lớp Ủng hộ" if dong_thuan is not None else "chưa chấm 5 lớp"
        )
        return cls._signal(
            "co_so",
            ten,
            False,
            f"Lúc đặt không có cơ sở rõ: {so_lop_text} và lý do chính không được "
            f"đánh giá Ủng hộ (trạng thái: {trang_thai_value}).",
        )

    @classmethod
    def _signal_ky_luat_thoat(cls, ketso: OrderKetso) -> dict:
        ten = "Tôn trọng cắt lỗ / chốt lời đã cam kết"
        vi_pham: list[str] = []
        if ketso.cham_SL_khong_cat:
            vi_pham.append("chạm ngưỡng cắt lỗ nhưng không cắt")
        if ketso.cham_TP_giu_lam_hut:
            vi_pham.append("chạm chốt lời nhưng giữ lại làm hụt lãi")
        if ketso.ban_som_khi_lo_nhe:
            vi_pham.append("bán sớm khi mới lỗ nhẹ, chưa chạm ngưỡng")
        if vi_pham:
            return cls._signal(
                "ky_luat_thoat", ten, False, "Vi phạm ghi nhận: " + "; ".join(vi_pham) + "."
            )
        return cls._signal(
            "ky_luat_thoat",
            ten,
            True,
            "Bạn thoát lệnh theo đúng ngưỡng cắt lỗ / chốt lời đã cam kết lúc đặt.",
        )

    @classmethod
    def _signal_khong_nhoi(cls, ketso: OrderKetso) -> dict:
        ten = "Không nhồi lệnh khi lỗ"
        if ketso.nhoi_lenh_khi_lo:
            return cls._signal(
                "khong_nhoi",
                ten,
                False,
                "Vi phạm ghi nhận: bạn mua thêm mã này trong lúc đang lỗ (nhồi lệnh).",
            )
        return cls._signal(
            "khong_nhoi", ten, True, "Bạn không mua thêm mã này trong lúc đang lỗ."
        )

    @classmethod
    def _signal_khoi_luong(
        cls, kehoach: OrderKehoach | None, khau_vi_ho_so: str | None
    ) -> dict:
        ten = "Khối lượng khớp khẩu vị"
        pct_von = kehoach.pct_von if kehoach is not None else None
        khau_vi_snapshot = kehoach.khau_vi if kehoach is not None else None
        khau_vi = (
            (khau_vi_snapshot.value if hasattr(khau_vi_snapshot, "value") else khau_vi_snapshot)
            if khau_vi_snapshot is not None
            else khau_vi_ho_so
        )
        tran = KHAU_VI_TRAN_PCT.get(khau_vi or "")
        if pct_von is None or tran is None:
            return cls._signal(
                "khoi_luong_khop",
                ten,
                None,
                "Chưa có dữ liệu: lệnh này chưa ghi %vốn hoặc khẩu vị rủi ro, "
                "nên hệ không kết luận được về khối lượng.",
            )
        khau_vi_ten = KHAU_VI_LABELS.get(khau_vi or "", khau_vi or "")
        if pct_von <= tran + KHAU_VI_TOLERANCE_PCT:
            return cls._signal(
                "khoi_luong_khop",
                ten,
                True,
                f"Khối lượng dùng {pct_von:.1f}% vốn, trong trần {tran:.0f}% của khẩu vị "
                f"{khau_vi_ten}.",
            )
        return cls._signal(
            "khoi_luong_khop",
            ten,
            False,
            f"Khối lượng dùng {pct_von:.1f}% vốn, vượt trần {tran:.0f}% của khẩu vị "
            f"{khau_vi_ten}.",
        )

    @classmethod
    def _compute_signals(
        cls,
        kehoach: OrderKehoach | None,
        ketso: OrderKetso,
        khau_vi_ho_so: str | None,
    ) -> list[dict]:
        """The 4 tín hiệu behind the hệ verdict (spec §1's definition).

        ★ Reads process data ONLY — ``ketso.pnl_pct`` is deliberately not an
        input to any signal.
        """
        return [
            cls._signal_co_so(kehoach),
            cls._signal_ky_luat_thoat(ketso),
            cls._signal_khong_nhoi(ketso),
            cls._signal_khoi_luong(kehoach, khau_vi_ho_so),
        ]

    @staticmethod
    def _verdict_from_signals(signals: list[dict]) -> str:
        """'dung' only when EVERY applicable signal passes; unknown signals
        (``dat is None``) are excluded — see the module docstring."""
        known = [s["dat"] for s in signals if s["dat"] is not None]
        return Verdict.DUNG.value if all(known) else Verdict.SAI.value

    @staticmethod
    def _derive_o_4(verdict: str, pnl_pct: float) -> str:
        """4 ô = verdict cuối × kết quả (spec §4).

        ★ This is the ONLY place ``pnl_pct`` touches Cấp 5's classification — it
        picks the column, never the verdict. A flat close (pnl_pct == 0) counts
        as thua (not > 0), matching Cấp 4's ``_is_win``.
        """
        thang = pnl_pct > 0
        if verdict == Verdict.DUNG.value:
            return O4.DUNG_THANG.value if thang else O4.DUNG_THUA.value
        return O4.SAI_THANG.value if thang else O4.SAI_THUA.value

    async def _verdict_payload(self, user_id: uuid.UUID, order_id: uuid.UUID) -> dict:
        """Shared by ``GET /cap5/verdict/{order_id}`` and ``POST /cap5/ketso``
        (which recomputes rather than trusting whatever the FE displayed)."""
        sell_order = await self._vt_repo.get_order_by_id(order_id)
        if sell_order is None or sell_order.user_id != user_id:
            raise NotFoundError("lệnh")
        if sell_order.side != OrderSide.SELL:
            raise BadRequestError("Phân loại 4 ô chỉ áp dụng cho lệnh BÁN")

        ketso = await self._get_ketso_by_order(order_id)
        if ketso is None:
            raise NotFoundError("kết sổ Cấp 1 — cần kết sổ (Cấp 1) trước")

        kehoach = await self._kehoach_for_sell(sell_order)
        khau_vi_ho_so = await self._khau_vi_ho_so(user_id)
        signals = self._compute_signals(kehoach, ketso, khau_vi_ho_so)
        verdict = self._verdict_from_signals(signals)

        return {
            "order_id": order_id,
            "verdict": verdict,
            "giai_thich": (
                _VERDICT_GIAI_THICH_DUNG
                if verdict == Verdict.DUNG.value
                else _VERDICT_GIAI_THICH_SAI
            ),
            "signals": signals,
            "pnl_pct": ketso.pnl_pct,
            "thang": ketso.pnl_pct > 0,
            "o_4_du_kien": self._derive_o_4(verdict, ketso.pnl_pct),
            "_ketso": ketso,
        }

    async def suggested_verdict(self, user_id: uuid.UUID, order_id: uuid.UUID) -> dict:
        """``GET /cap5/verdict/{order_id}`` — the SUGGESTED verdict + the full
        provenance signal list (§C12c: never a bare verdict)."""
        await self._require_progress(user_id)
        payload = await self._verdict_payload(user_id, order_id)
        payload.pop("_ketso", None)
        return payload

    # ── Kết sổ Cấp 5 — phân loại 4 ô (spec §4) ─────────

    async def record_ketso(
        self,
        user_id: uuid.UUID,
        order_id: uuid.UUID,
        *,
        verdict_user: str,
        ly_do_sua: str | None = None,
        verdict_he: str | None = None,  # noqa: ARG002 — advisory, see below
    ) -> OrderKetso:
        """Persist the 4-ô classification onto the EXISTING ``order_ketso`` row
        created by Cấp 1's ``/cap1/ketso`` (Cấp 2's discipline flags are already
        on it; Cấp 5 only adds the verdict block).

        ``verdict_he`` is accepted for API symmetry with the FE (which displayed
        it) but is ADVISORY: the server always RECOMPUTES it here from the
        persisted process data, so a client cannot talk itself into a ô. An
        override (``verdict_user != verdict_he``) REQUIRES ``ly_do_sua`` — 422
        otherwise (spec §4 hybrid: user luôn chốt được, nhưng phải ghi lý do).

        Re-submitting the SAME order overwrites its classification (the Kết sổ
        step is a UI flow the user can go back a step in — "Đồng ý" then "Tôi
        thấy khác" — and a retry must not 409). That is a per-order correction,
        NOT the bulk "phân loại lại hàng loạt" spec §9 rules out: nothing here
        can rewrite another order, and ``verdict_he`` + ``o_4`` are always
        re-derived from the persisted process data, so no rewrite can invent a ô.
        """
        progress = await self._require_progress(user_id)

        if verdict_user not in _VERDICT_VALUES:
            raise BadRequestError("verdict_user phải là 'dung' hoặc 'sai'")
        ly_do_clean = (ly_do_sua or "").strip()
        if ly_do_sua is not None and not ly_do_clean:
            raise BadRequestError("Lý do sửa không được để trống")

        payload = await self._verdict_payload(user_id, order_id)
        ketso: OrderKetso = payload.pop("_ketso")
        he = payload["verdict"]

        if verdict_user != he and not ly_do_clean:
            raise UnprocessableEntityError(
                "Bạn thấy khác hệ — cần ghi 1 dòng lý do vì sao bạn đánh giá khác."
            )

        ketso.verdict_he = he
        ketso.verdict_user = verdict_user
        ketso.verdict_provenance = {
            "verdict_he": he,
            "giai_thich": payload["giai_thich"],
            "signals": payload["signals"],
            "computed_at": datetime.now(UTC).isoformat(),
        }
        ketso.ly_do_sua = ly_do_clean if verdict_user != he else None
        ketso.o_4 = self._derive_o_4(verdict_user, ketso.pnl_pct)
        await self._session.flush()
        await self._session.refresh(ketso)

        await self._recompute_progress(user_id, progress)
        return ketso

    # ── Đứng ngoài có chủ đích (spec §5) ───────────────

    async def log_dung_ngoai(
        self, user_id: uuid.UUID, symbol: str, reason: str
    ) -> StandbyDecision:
        """Log a non-trade decision with the price at that moment.

        The price snapshot is resolved SERVER-side (never client-supplied) and
        the call fails closed if no source has a price: a row without a
        comparable snapshot could never be scored né đúng/hụt, which is the
        whole point of recording it.
        """
        progress = await self._require_progress(user_id)

        symbol_clean = (symbol or "").strip().upper()
        if not symbol_clean:
            raise BadRequestError("Thiếu mã cổ phiếu")
        if reason not in _LY_DO_VALUES:
            raise BadRequestError("Lý do đứng ngoài không hợp lệ")

        try:
            price = await resolve_price(symbol_clean)
        except Exception as exc:  # noqa: BLE001 — any source failure ⇒ fail closed
            raise ServiceUnavailableError(
                f"Chưa lấy được giá hiện tại của {symbol_clean} — thử lại sau."
            ) from exc

        decision = StandbyDecision(
            user_id=user_id,
            symbol=symbol_clean,
            decided_at=datetime.now(UTC),
            reason=reason,
            gia_luc_dung_ngoai=float(price.price_vnd),
        )
        self._session.add(decision)
        await self._session.flush()
        await self._session.refresh(decision)

        await self._recompute_progress(user_id, progress)
        await self._session.refresh(decision)
        return decision

    async def _all_decisions(self, user_id: uuid.UUID) -> list[StandbyDecision]:
        result = await self._session.execute(
            select(StandbyDecision)
            .where(StandbyDecision.user_id == user_id)
            .order_by(StandbyDecision.decided_at.desc())
        )
        return list(result.scalars().all())

    @staticmethod
    def _classify_dung_ngoai(gia_luc: float, gia_sau: float) -> tuple[str, float]:
        """né đúng ≤ +2% · né hụt ≥ +5% · giữa = trung tính (spec §5)."""
        pct = (gia_sau - gia_luc) / gia_luc * 100.0 if gia_luc else 0.0
        if pct <= NGUONG_NE_DUNG_PCT:
            return KetQuaDungNgoai.NE_DUNG.value, pct
        if pct >= NGUONG_NE_HUT_PCT:
            return KetQuaDungNgoai.NE_HUT.value, pct
        return KetQuaDungNgoai.TRUNG_TINH.value, pct

    async def _score_due_decisions(self, user_id: uuid.UUID) -> int:
        """Score every unscored decision whose 5 phiên have elapsed. Returns how
        many were newly scored. Decisions whose target session has no price are
        left UNSCORED (never guessed) and retried on the next read."""
        decisions = await self._all_decisions(user_id)
        today_vn = datetime.now(_VN_TZ).date()
        scored = 0
        for decision in decisions:
            if decision.ket_qua is not None:
                continue
            target = han_cham_date(decision.decided_at)
            if target > today_vn:
                continue  # chưa tới hạn
            gia_sau = await _fetch_close_vnd(
                decision.symbol, _decided_on(decision.decided_at), target
            )
            if gia_sau is None:
                continue
            gia_luc = float(decision.gia_luc_dung_ngoai)
            ket_qua, _pct = self._classify_dung_ngoai(gia_luc, gia_sau)
            decision.gia_sau_5_phien = gia_sau
            decision.ket_qua = ket_qua
            decision.cham_at = datetime.now(UTC)
            scored += 1
        if scored:
            await self._session.flush()
        return scored

    def _decision_out(self, decision: StandbyDecision, today_vn: date) -> dict:
        target = han_cham_date(decision.decided_at)
        gia_luc = float(decision.gia_luc_dung_ngoai)
        gia_sau = (
            float(decision.gia_sau_5_phien) if decision.gia_sau_5_phien is not None else None
        )
        pct = ((gia_sau - gia_luc) / gia_luc * 100.0) if (gia_sau is not None and gia_luc) else None
        ly_do_ten = LY_DO_DUNG_NGOAI_LABELS.get(decision.reason, decision.reason)
        ket_qua_ten = KET_QUA_LABELS.get(decision.ket_qua or "") or None
        da_toi_han = target <= today_vn

        decided_on = _decided_on(decision.decided_at)
        if decision.ket_qua == KetQuaDungNgoai.NE_DUNG.value and pct is not None:
            huong = f"giảm {abs(pct):.1f}%" if pct < 0 else f"chỉ tăng {pct:.1f}%"
            giai_thich = (
                f"Bạn đứng ngoài {decision.symbol} ngày {decided_on:%d/%m/%Y} ở giá "
                f"{gia_luc:,.0f}đ — sau {SO_PHIEN_CHAM} phiên giá {huong}. "
                "Nước đứng ngoài hợp lý."
            )
        elif decision.ket_qua == KetQuaDungNgoai.NE_HUT.value and pct is not None:
            giai_thich = (
                f"Bạn đứng ngoài {decision.symbol} ngày {decided_on:%d/%m/%Y} ở giá "
                f"{gia_luc:,.0f}đ — sau {SO_PHIEN_CHAM} phiên giá tăng {pct:.1f}%. "
                "Lần này bạn đã bỏ lỡ."
            )
        elif decision.ket_qua == KetQuaDungNgoai.TRUNG_TINH.value and pct is not None:
            giai_thich = (
                f"Bạn đứng ngoài {decision.symbol} ngày {decided_on:%d/%m/%Y} ở giá "
                f"{gia_luc:,.0f}đ — sau {SO_PHIEN_CHAM} phiên giá tăng {pct:.1f}%, nằm "
                f"giữa {NGUONG_NE_DUNG_PCT:.0f}% và {NGUONG_NE_HUT_PCT:.0f}%: trung tính, "
                "không tính đúng cũng không tính hụt."
            )
        elif da_toi_han:
            giai_thich = (
                f"Đã tới hạn chấm (phiên {target:%d/%m/%Y}) nhưng chưa lấy được giá "
                "phiên đó — hệ sẽ chấm lại khi có dữ liệu, không đoán."
            )
        else:
            giai_thich = (
                f"Chưa tới hạn — hệ sẽ chấm sau phiên {target:%d/%m/%Y} "
                f"({SO_PHIEN_CHAM} phiên giao dịch kể từ lúc bạn đứng ngoài)."
            )

        return {
            "id": decision.id,
            "symbol": decision.symbol,
            "decided_at": decision.decided_at,
            "reason": decision.reason,
            "ly_do_ten": ly_do_ten,
            "gia_luc_dung_ngoai": gia_luc,
            "han_cham_date": target,
            "da_toi_han": da_toi_han,
            "cham_at": decision.cham_at,
            "gia_sau_5_phien": gia_sau,
            "ket_qua": decision.ket_qua,
            "ket_qua_ten": ket_qua_ten,
            "pct_thay_doi": pct,
            "giai_thich": giai_thich,
        }

    def decision_out(self, decision: StandbyDecision) -> dict:
        """Serialize one decision for the API (public wrapper — used right after
        a fresh log, where there is no listing to piggyback on)."""
        return self._decision_out(decision, datetime.now(_VN_TZ).date())

    async def _dung_ngoai_summary(self, user_id: uuid.UUID) -> dict:
        decisions = await self._all_decisions(user_id)
        today_vn = datetime.now(_VN_TZ).date()
        items = [self._decision_out(d, today_vn) for d in decisions]

        so_ne_dung = sum(1 for d in decisions if d.ket_qua == KetQuaDungNgoai.NE_DUNG.value)
        so_ne_hut = sum(1 for d in decisions if d.ket_qua == KetQuaDungNgoai.NE_HUT.value)
        so_trung_tinh = sum(
            1 for d in decisions if d.ket_qua == KetQuaDungNgoai.TRUNG_TINH.value
        )
        so_da_cham = so_ne_dung + so_ne_hut + so_trung_tinh
        so_chua_toi_han = len(decisions) - so_da_cham

        ly_do_hay_dung = None
        if decisions:
            counts: dict[str, int] = {}
            for d in decisions:
                counts[d.reason] = counts.get(d.reason, 0) + 1
            # Ties broken by the canonical lý do order so the pick is deterministic.
            order = list(LY_DO_DUNG_NGOAI_LABELS)
            ma = min(counts, key=lambda k: (-counts[k], order.index(k) if k in order else 99))
            ly_do_hay_dung = {
                "ma": ma,
                "ten": LY_DO_DUNG_NGOAI_LABELS.get(ma, ma),
                "so_lan": counts[ma],
            }

        return {
            "so_lan": len(decisions),
            "so_ne_dung": so_ne_dung,
            "so_ne_hut": so_ne_hut,
            "so_trung_tinh": so_trung_tinh,
            "so_chua_toi_han": so_chua_toi_han,
            "so_lan_da_cham": so_da_cham,
            "du_de_phan_tich": so_da_cham >= MIN_DA_CHAM_PHAN_TICH,
            "so_lan_toi_thieu_phan_tich": MIN_DA_CHAM_PHAN_TICH,
            "ly_do_hay_dung": ly_do_hay_dung,
            "so_phien_cham": SO_PHIEN_CHAM,
            "nguong_ne_dung_pct": NGUONG_NE_DUNG_PCT,
            "nguong_ne_hut_pct": NGUONG_NE_HUT_PCT,
            "giai_thich": _DUNG_NGOAI_GIAI_THICH,
            "items": items,
        }

    async def list_dung_ngoai(self, user_id: uuid.UUID) -> dict:
        """``GET /cap5/dung-ngoai`` — the nhật ký + scores. Scores any due
        decision on the way (lazy compute-on-read)."""
        progress = await self._require_progress(user_id)
        await self._recompute_progress(user_id, progress)
        return await self._dung_ngoai_summary(user_id)

    async def cham_dung_ngoai(self, user_id: uuid.UUID) -> dict:
        """``POST /cap5/dung-ngoai/cham`` — the same scoring routine the reads
        run, exposed explicitly (idempotent)."""
        progress = await self._require_progress(user_id)
        so_moi_cham = await self._score_due_decisions(user_id)
        await self._recompute_progress(user_id, progress)
        summary = await self._dung_ngoai_summary(user_id)
        return {
            "so_moi_cham": so_moi_cham,
            "so_lan_da_cham": summary["so_lan_da_cham"],
            "so_chua_toi_han": summary["so_chua_toi_han"],
            "giai_thich": _DUNG_NGOAI_GIAI_THICH,
            "items": summary["items"],
        }

    # ── Metrics + recompute + 3 nhiệm vụ ──────────────

    async def _classified_o_4(self, user_id: uuid.UUID) -> list[str]:
        """Every Cấp-5-classified ô of the user's Thực chiến round trips (see
        the module docstring for why there is no ``entered_at`` filter)."""
        result = await self._session.execute(
            select(OrderKetso.o_4)
            .join(VirtualOrder, VirtualOrder.id == OrderKetso.order_id)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.mode == "thuc_chien",
                OrderKetso.o_4.is_not(None),
            )
        )
        return [row[0] for row in result.all()]

    async def _compute_metrics(self, user_id: uuid.UUID) -> dict:
        o_4_values = await self._classified_o_4(user_id)
        so_lenh_phan_loai = len(o_4_values)
        so_dung = sum(1 for v in o_4_values if v.startswith("dung"))
        ty_le = (so_dung / so_lenh_phan_loai * 100.0) if so_lenh_phan_loai else 0.0

        decisions = await self._all_decisions(user_id)
        so_da_cham = sum(1 for d in decisions if d.ket_qua is not None)

        return {
            "so_lenh_phan_loai": so_lenh_phan_loai,
            "so_lenh_quyet_dinh_dung": so_dung,
            "ty_le_quyet_dinh_dung": ty_le,
            "so_lan_dung_ngoai": len(decisions),
            "so_lan_dung_ngoai_da_cham": so_da_cham,
        }

    async def _recompute_progress(self, user_id: uuid.UUID, progress: Cap5Progress) -> dict:
        await self._score_due_decisions(user_id)
        metrics = await self._compute_metrics(user_id)

        progress.so_lenh_phan_loai = metrics["so_lenh_phan_loai"]
        progress.so_lan_dung_ngoai_da_cham = metrics["so_lan_dung_ngoai_da_cham"]
        progress.ty_le_quyet_dinh_dung = metrics["ty_le_quyet_dinh_dung"]

        now = datetime.now(UTC)

        # ① lệnh đầu đã phân loại 4 ô — not gated.
        if progress.task_1_done_at is None and metrics["so_lenh_phan_loai"] >= 1:
            progress.task_1_done_at = now

        # ② đứng ngoài đầu tiên — ghi xong 1 quyết định là đủ (chưa cần chấm).
        if progress.task_2_done_at is None and metrics["so_lan_dung_ngoai"] >= 1:
            progress.task_2_done_at = now

        # ③ Thách thức Lão luyện — triple condition, NOT gated.
        if progress.task_3_done_at is None and self._task3_legs(progress)["dat_ca_3"]:
            progress.task_3_done_at = now

        await self._session.flush()
        await self._session.refresh(progress)
        return metrics

    @staticmethod
    def _task3_legs(progress: Cap5Progress) -> dict:
        """The 3 legs of nhiệm vụ ③ (spec §2③), read off the recomputed row."""
        so_lenh_dat = progress.so_lenh_phan_loai >= _TASK3_SO_LENH_MIN
        dung_ngoai_dat = progress.so_lan_dung_ngoai_da_cham >= _TASK3_DUNG_NGOAI_MIN
        ty_le_dat = progress.ty_le_quyet_dinh_dung >= _TASK3_TY_LE_MIN
        return {
            "so_lenh_dat": so_lenh_dat,
            "dung_ngoai_dat": dung_ngoai_dat,
            "ty_le_dat": ty_le_dat,
            "dat_ca_3": so_lenh_dat and dung_ngoai_dat and ty_le_dat,
        }

    async def mark_task(self, user_id: uuid.UUID, task_no: int) -> Cap5Progress:
        """``PATCH /cap5/task`` — all 3 nhiệm vụ are derived from order_ketso /
        standby_decision, so this just triggers a recompute pass (idempotent)."""
        if task_no not in _TASK_NOS:
            raise BadRequestError("task_no không hợp lệ")
        progress = await self._require_progress(user_id)
        await self._recompute_progress(user_id, progress)
        return progress

    # ── Thách thức Lão luyện — GET /cap5/thach-thuc ────

    async def thach_thuc(self, user_id: uuid.UUID) -> dict:
        """3 sub-conditions of nhiệm vụ ③ + current values + giải thích each
        (feeds the §C12c display — never a bare number)."""
        progress = await self._require_progress(user_id)
        metrics = await self._recompute_progress(user_id, progress)
        legs = self._task3_legs(progress)

        return {
            "dat_ca_3": legs["dat_ca_3"],
            "so_lenh_phan_loai": {
                "ten": f"Phân loại 4 ô cho ≥ {_TASK3_SO_LENH_MIN} lệnh",
                "gia_tri_hien_tai": float(progress.so_lenh_phan_loai),
                "muc_tieu": float(_TASK3_SO_LENH_MIN),
                "dat": legs["so_lenh_dat"],
                "giai_thich": (
                    f"Đã có {progress.so_lenh_phan_loai}/{_TASK3_SO_LENH_MIN} lệnh bạn nhìn "
                    "lại qua 4 ô — mỗi lệnh được xếp theo quyết định đúng/sai × thắng/thua."
                ),
            },
            "so_lan_dung_ngoai_da_cham": {
                "ten": f"≥ {_TASK3_DUNG_NGOAI_MIN} lần đứng ngoài đã tới hạn chấm",
                "gia_tri_hien_tai": float(progress.so_lan_dung_ngoai_da_cham),
                "muc_tieu": float(_TASK3_DUNG_NGOAI_MIN),
                "dat": legs["dung_ngoai_dat"],
                "giai_thich": (
                    f"Đã chấm {progress.so_lan_dung_ngoai_da_cham}/"
                    f"{_TASK3_DUNG_NGOAI_MIN} nước đứng ngoài "
                    f"(trên tổng {metrics['so_lan_dung_ngoai']} lần đã ghi) — chỉ tính các "
                    f"lần đã đủ {SO_PHIEN_CHAM} phiên để biết né đúng hay hụt. Đứng ngoài "
                    "nhiều hơn KHÔNG được thưởng thêm."
                ),
            },
            "ty_le_quyet_dinh_dung": {
                "ten": f"Tỷ lệ quyết định đúng ≥ {_TASK3_TY_LE_MIN:.0f}%",
                "gia_tri_hien_tai": progress.ty_le_quyet_dinh_dung,
                "muc_tieu": _TASK3_TY_LE_MIN,
                "dat": legs["ty_le_dat"],
                "giai_thich": (
                    f"{progress.ty_le_quyet_dinh_dung:.0f}% "
                    f"({metrics['so_lenh_quyet_dinh_dung']}/{progress.so_lenh_phan_loai} lệnh) "
                    "làm đúng quy trình — bất kể lãi/lỗ. Đây là thước đo CHẤT LƯỢNG QUYẾT "
                    "ĐỊNH, không phải tỷ lệ thắng."
                ),
            },
        }

    # ── Graduation ────────────────────────────────────

    async def graduate(self, user_id: uuid.UUID) -> Cap5Progress:
        """Graduate Cấp 5 — only when all 3 nhiệm vụ are done (thực chất ③)."""
        progress = await self._require_progress(user_id)
        await self._recompute_progress(user_id, progress)

        all_tasks_done = all(
            getattr(progress, f"task_{n}_done_at") is not None for n in _TASK_NOS
        )
        if not all_tasks_done:
            raise ConflictError("Chưa hoàn thành đủ 3 nhiệm vụ Cấp 5")

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
