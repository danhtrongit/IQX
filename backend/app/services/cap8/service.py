"""Cấp 8 «Quản trị rủi ro danh mục» service — bước Kiểm tra danh mục trước xác
nhận MUA (dồn ngành · tương quan với vị thế đang giữ · tổng vốn ở rủi ro), ghi
khối Cấp 8 lên ``order_kehoach``, Thách thức Quản trị rủi ro danh mục.

Cấp 8 is FREE and Thực chiến-only, built on a graduated Cấp 7, and it is the
LAST level of the current program (trọn mạch 0-8). It owns ``cap8_progress`` and
EXTENDS Cấp 1's ``order_kehoach`` rows in place (new columns ``don_nganh_pct`` /
``tuong_quan_cao_voi`` / ``tong_rui_ro_pct`` / ``danh_muc_canh_bao`` /
``hanh_vi_canh_bao`` on the same physical table — see ``app.models.cap1``'s
"Cấp 8 additions" block).

It reuses, rather than rebuilds: ``VirtualTradingService.get_portfolio`` for
positions + market values + NAV, ``SymbolRepository`` for the ICB ngành (the raw
ngành string — NOT Cấp 6's 6-kiểu mapping, which is a different abstraction),
``app.services.ta.data.get_adjusted_ohlcv`` for price history, the Portfolio
Manager's pure ``daily_returns``/``correlation``/``stdev`` math, and Cấp 5's
``KHAU_VI_TRAN_PCT`` table.

═══════════════════════════════════════════════════════════════════════════
★★ HONESTY NOTE 1 — a vị thế with NO cắt lỗ has UNKNOWN risk, not zero ★★
═══════════════════════════════════════════════════════════════════════════
``tong_rui_ro_pct`` is ``Σ (tỷ trọng vị thế × khoảng tới cắt lỗ)``. A position
bought before Cấp 2 — or one whose kế hoạch simply never set a cắt lỗ — has no
stop to measure against. Adding 0 for it would be a LIE that always points the
same way: it would make the total smaller, i.e. safer-looking, which is exactly
the failure this level teaches against.

So such a position is **excluded from the sum and reported by count**
(``so_vi_the_thieu_cat_lo``), and every payload that carries a tổng-rủi-ro
number also carries the sentence *"{N} vị thế chưa có cắt lỗ — chưa tính được
rủi ro của các vị thế này."*. The identical rule applies to a position whose
price cannot be resolved (``so_vi_the_thieu_gia``): an unknown market value is
an unknown weight, never a zero weight.

═══════════════════════════════════════════════════════════════════════════
★★ HONESTY NOTE 2 — correlation ``0.0`` is not "uncorrelated" ★★
═══════════════════════════════════════════════════════════════════════════
``app.services.ai.portfolio_manager.returns.correlation`` is documented as
"degenerate inputs return 0.0, never raise": fewer than 2 points, or a series
with zero variance, both answer ``0.0``. Rendered in this level's UI, ``0.0``
reads as *"hai mã này không đi cùng nhịp"* — a claim, and the opposite of the
truth, which is *"chúng tôi chưa biết"*.

``tuong_quan_an_toan`` below therefore wraps it and returns ``None`` unless BOTH
series have at least ``TUONG_QUAN_MIN_PHIEN`` **date-aligned** sessions and
neither is flat. ``None`` surfaces as ``tuong_quan_du_lieu = False`` +
"chưa đủ dữ liệu", never as a number.

═══════════════════════════════════════════════════════════════════════════
★★ HONESTY NOTE 3 — the khẩu vị ceiling carries TWO different meanings ★★
═══════════════════════════════════════════════════════════════════════════
``KHAU_VI_TRAN_PCT`` (10 / 20 / 30%) is imported from ``app.services.cap5``,
where — like everywhere else in this codebase, in Cấp 3's UI and in
``app.models.cap1.KhauViRuiRo``'s own docstring — it means **trần % vốn cho MỘT
lệnh**. The Cấp 8 spec (§2③, §4) compares something else against the very same
number: **tổng % vốn mất nếu mọi cắt lỗ bị chạm, trên cả danh mục**.

Those are different quantities. We implement the spec's comparison — but we
never let the two read as one thing:

  · The copy always spells both out, e.g. *"Tổng vốn ở rủi ro: 14% (nếu mọi cắt
    lỗ bị chạm) · trần khẩu vị Cân bằng: 20% (trần này vốn đặt cho MỘT lệnh, Cấp
    8 dùng lại làm mức trần cho cả danh mục)."*
  · **With typical stop distances this ceiling seldom trips.** A 20%-weight
    position with a 10%-away stop contributes 2 percentage points; a fully
    invested portfolio of such positions lands near 10%, under the Cân bằng
    trần of 20%. That is ACCEPTABLE and deliberate: graduation condition ③ is a
    **safety check, not a difficulty knob**. Its job is to catch the danh mục
    that is genuinely over-committed, not to make the level hard. The difficulty
    of Cấp 8 lives in conditions ① and ②.

═══════════════════════════════════════════════════════════════════════════
★★ HONESTY NOTE 4 — the server re-derives; it never takes the client's word ★★
═══════════════════════════════════════════════════════════════════════════
``record_kehoach`` recomputes dồn ngành / tương quan / tổng rủi ro / the list of
warnings from the REAL portfolio and stores its own values. The request body's
copies of those four are accepted for wire compatibility with the FE's check
payload and then **discarded**. Otherwise a client could post
``danh_muc_canh_bao = []`` and keep its ``so_lan_mua_bat_chap_canh_bao`` clean
forever — the same principle as Cấp 6's kiểu cổ phiếu.

``hanh_vi_canh_bao`` IS taken from the client, because only the user knows which
of the three buttons they pressed. It is then cross-checked against the
recomputed warnings: ``khong_canh_bao`` with warnings present, or ``van_mua``
with no warnings present, is a contradiction and is REJECTED (400) rather than
silently normalised — normalising either way would corrupt the discipline count,
in opposite directions.

═══════════════════════════════════════════════════════════════════════════
★★ HONESTY NOTE 5 — the record is WRITE-ONCE, and compliance is recordable ★★
═══════════════════════════════════════════════════════════════════════════
Two properties of ``record_kehoach`` that have to be designed together, because
they are the same seam:

  1. **WRITE-ONCE per order.** The Cấp 8 block is a SNAPSHOT of what the danh
     mục looked like at the moment of the order, and graduation condition ②
     ("≤ 2 lần mua bất chấp cảnh báo trong 15 lệnh gần nhất") is computed from
     the stored ``danh_muc_canh_bao``. A re-post that re-derived that list from
     TODAY's portfolio would let a user sell the concentrated ngành down until
     the warning stops firing and then rewrite each defiant order as "không có
     cảnh báo" — erasing ② and, worse, making ``kehoach_out`` render a "Lúc
     mua: ⚠ …" snapshot that is simply false. So once ``hanh_vi_canh_bao`` is
     set, an identical re-post is a no-op and anything else is a 409. The
     write-once rule holds whatever the order's status is: an unfilled order
     still counts in ``_kiem_tra_rows``, so its record must be immutable too.
     Nothing is lost — the panel step-back the FE offers happens BEFORE the
     order (and therefore before this call) exists.
  2. **``giam_kl`` / ``chon_ma_khac`` need the warnings from the check the user
     RESPONDED TO.** Reducing the size, or switching symbol, is precisely what
     makes a warning stop firing — so a server that only ever re-derives against
     the POST-adjustment order sees nothing, and the two "đã nghe cảnh báo"
     outcomes become recordable exactly when the user FAILED to clear the
     warning. ``canh_bao_da_hien`` (the ``canh_bao[].ma`` list from the
     ``/cap8/kiem-tra`` response the user acted on) closes that gap.

     ★ It is the ONE thing the client reports about the check, so it is confined
     to where it cannot game anything: it may only ever justify a COMPLIANCE
     answer. ``van_mua`` — the only value condition ② counts — and
     ``khong_canh_bao`` stay decided by the server's own re-derivation alone, in
     both directions. Claiming a warning that never fired therefore cannot
     manufacture a clean record (it is not accepted for ``van_mua``), and hiding
     one that did cannot erase a defiance (the server sees it anyway). What it
     can do is make an honest ``giam_kl`` recordable, which is the whole point.

Design notes (documented here since the spec leaves them implicit):

  - **CẢNH BÁO MỀM, KHÔNG CỔNG CỨNG** (spec §9, §C8). Nothing here can refuse a
    buy. ``kiem_tra`` is a read; ``record_kehoach`` runs AFTER the order exists.
    ``van_mua`` is unpenalised — its only effect is condition ②'s count.

  - **NAV does not move when the order fills.** Buying converts cash into
    position value, so "sau lệnh" percentages use the SAME NAV as "trước lệnh".
    Fees are ignored — they are far below the resolution of a warning threshold.

  - **"Sau lệnh" for tổng rủi ro adds a slice, it does not re-price the old
    lot.** When the candidate is already held, the new exposure is added as its
    own slice (khối lượng × giá, distance from ``gia`` to the NEW ``cat_lo``)
    while the existing lot keeps the stop its own kế hoạch recorded. That is the
    same single-lot approximation ``_cat_lo_of_position`` carries.

  - **Compute-on-read, no cron.** ``don_nganh_max_pct`` / ``tong_rui_ro_pct`` on
    ``cap8_progress`` are a SNAPSHOT refreshed whenever the portfolio is priced
    (``kiem_tra`` / ``thach_thuc``). They are NULL until then — never 0.0, which
    would be a *passing* value for both.

  - **Counters.** ``so_lenh_kiem_tra`` = the user's Thực chiến ``order_kehoach``
    rows with ``hanh_vi_canh_bao`` set. Deliberately NOT filtered by
    ``entered_at``, for Cấp 4/5/6/7's reason: that column can only ever be
    written by ``record_kehoach`` below, which requires a ``Cap8Progress`` row.

  - **Nhiệm vụ** ① first order that went through the check · ② first CLOSED
    round trip whose buy carries a Cấp 8 block · ③ all three legs at once. Once
    a ``task_N_done_at`` is stamped it is NEVER un-stamped — Cấp 1-7's pattern.
"""

from __future__ import annotations

import logging
import math
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap1 import OrderKehoach, OrderKetso
from app.models.cap3 import Cap3Progress
from app.models.cap7 import Cap7Progress
from app.models.cap8 import (
    HANH_VI_CANH_BAO_LABELS,
    LOAI_CANH_BAO_LABELS,
    Cap8Progress,
    HanhViCanhBao,
    LoaiCanhBao,
)
from app.models.virtual_trading import OrderSide, OrderStatus, VirtualOrder
from app.repositories.symbol import SymbolRepository
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.ai.portfolio_manager.config import RISK_LOOKBACK_DAYS
from app.services.ai.portfolio_manager.returns import correlation, daily_returns, stdev
from app.services.cap5.service import KHAU_VI_LABELS, KHAU_VI_TRAN_PCT
from app.services.ta.data import get_adjusted_ohlcv
from app.services.virtual_trading.service import VirtualTradingService

logger = logging.getLogger(__name__)

_TASK_NOS = (1, 2, 3)


# ══════════════════════════════════════════════════════
# ★ THE DOCUMENTED CONSTANTS
#
# Published by the SERVER (see ``quy_tac()``) so the numbers the user sees, the
# copy that explains them and the graduation rule can never drift apart. The FE
# renders THESE; it must not invent its own thresholds.
# ══════════════════════════════════════════════════════

#: Dồn ngành: warn when the candidate's ngành would exceed this % of NAV AFTER
#: the order. Spec §4's own number.
NGUONG_DON_NGANH_PCT = 40.0

#: Tương quan: warn above this coefficient with a *significant* position.
#: Spec §4's own number.
NGUONG_TUONG_QUAN = 0.7

#: ★ What makes a correlation partner "đáng kể" (spec §4 says "một vị thế đáng
#: kể" without defining it). A 0.9 correlation with a 0.5%-weight position is
#: noise, not a portfolio risk: if that position halved, NAV would move 0.25%.
#: 5% of NAV is the point at which a co-moving partner can actually hurt —
#: two 5% positions falling together is a 10% concentration behaving as one.
TUONG_QUAN_MIN_TY_TRONG_PCT = 5.0

#: ★ The minimum number of DATE-ALIGNED sessions before a correlation may be
#: reported at all (see HONESTY NOTE 2). 60 daily returns ≈ 3 tháng giao dịch:
#: the standard error of a correlation is roughly 1/√n ≈ 0.13 there, which is
#: small enough that a reading of 0.7+ is distinguishable from a reading of 0.4.
#: Below it the honest answer is "chưa đủ dữ liệu", never a number.
TUONG_QUAN_MIN_PHIEN = 60

#: How many recent sessions feed the correlation. Reuses the Portfolio Manager's
#: own risk lookback so the two features cannot quietly disagree about what
#: "recent" means.
SO_PHIEN_LICH_SU = RISK_LOOKBACK_DAYS

#: Calendar days of history requested to cover ``SO_PHIEN_LICH_SU`` sessions
#: (≈ 7/5 × trading days, plus slack for holidays).
_LICH_SU_NGAY_LICH = int(SO_PHIEN_LICH_SU * 1.8) + 30

#: The pairwise correlation map (khối ⑱) is computed over at most this many
#: positions, largest weight first. Pairs grow as O(n²) and each symbol costs a
#: price-history fetch; the tail of a retail danh mục cannot move it anyway.
TUONG_QUAN_MAX_VI_THE = 8

# Thách thức Quản trị rủi ro danh mục (spec §2③) — ALL three must hold at once.
_TASK3_SO_LENH_MIN = 15
#: ★ A ROLLING window, not a lifetime total — spec §2③ says "trong 15 lệnh gần
#: nhất". A user who ignored three warnings early on must be able to earn their
#: way out of it; a lifetime counter would make the level unfinishable for them.
_TASK3_CUA_SO = 15
_TASK3_BAT_CHAP_MAX = 2

#: Spec §9 — Cấp 8 is a compact pre-trade check, NOT a rebuild of the premium
#: Portfolio Manager report. Shown wherever the deep version is the better tool.
CROSS_REF_PM = (
    "Muốn phân tích sâu hơn (stress test, đóng góp lãi/lỗ)? Mở 'Phân tích danh "
    "mục' (Người quản lý danh mục)."
)

TIEN_MAT_NHAN = "Tiền mặt"
NGANH_KHAC_NHAN = "Chưa rõ ngành"

_HANH_VI_VALUES = frozenset(m.value for m in HanhViCanhBao)
#: The three responses that only make sense when something actually fired.
_HANH_VI_CO_CANH_BAO = frozenset(
    {
        HanhViCanhBao.VAN_MUA.value,
        HanhViCanhBao.GIAM_KL.value,
        HanhViCanhBao.CHON_MA_KHAC.value,
    }
)
#: The two "đã nghe cảnh báo" responses. ★ Acting on a warning is exactly what
#: makes it stop firing, so for these two the server CANNOT re-derive the warning
#: from the order it is recording — see HONESTY NOTE 5.2. They are also the two
#: whose Kết sổ copy must describe the danh mục AFTER the adjustment, not "lúc
#: mua". Deliberately NOT including ``van_mua``: nothing was adjusted there, and
#: it is the only value graduation condition ② counts.
_HANH_VI_NGHE_CANH_BAO = frozenset(
    {HanhViCanhBao.GIAM_KL.value, HanhViCanhBao.CHON_MA_KHAC.value}
)


# ══════════════════════════════════════════════════════
# Pure rules (public so the tests — and any future tooling — read the SAME
# functions the service writes with; the two can never drift)
# ══════════════════════════════════════════════════════


def tuong_quan_an_toan(a: list[float], b: list[float]) -> float | None:
    """Correlation of two return series, or ``None`` when it cannot be computed.

    ★ THE WHOLE POINT (HONESTY NOTE 2): the shared ``correlation()`` answers
    ``0.0`` for input it cannot judge — <2 points, or a flat series. ``0.0``
    displayed to a user means "these two do not move together", which is a claim
    we have no basis for. This wrapper returns ``None`` — "chưa đủ dữ liệu" —
    unless BOTH series carry at least ``TUONG_QUAN_MIN_PHIEN`` observations and
    neither is flat. It never returns a laundered zero.
    """
    n = min(len(a), len(b))
    if n < TUONG_QUAN_MIN_PHIEN:
        return None
    x = list(a[-n:])
    y = list(b[-n:])
    if stdev(x) == 0.0 or stdev(y) == 0.0:
        return None  # undefined, NOT 0.0
    value = correlation(x, y)
    if not math.isfinite(value):
        return None
    return value


def khoang_toi_cat_lo_pct(gia: float | None, cat_lo: int | float | None) -> float | None:
    """% the price would fall from ``gia`` down to ``cat_lo``, or ``None`` when
    the stop (or the price) is unknown.

    ★ ``None`` in ⇒ ``None`` out (HONESTY NOTE 1): the caller must never be
    handed a 0 it could add to a risk sum. A stop already at or above the price
    is a different thing — there the computed answer genuinely IS 0: hitting it
    from here costs nothing further.
    """
    if cat_lo is None or gia is None:
        return None
    try:
        gia_f = float(gia)
        cat_lo_f = float(cat_lo)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(gia_f) or not math.isfinite(cat_lo_f):
        return None
    if gia_f <= 0 or cat_lo_f <= 0:
        return None
    return max(0.0, (gia_f - cat_lo_f) / gia_f * 100.0)


def _pct(value: float) -> str:
    """A percent in the program-wide format (en-US digits, U+2212 for minus)."""
    if value < 0:
        return f"−{abs(value):.1f}%"
    return f"{value:.1f}%"


def _vi_the_text(n: int) -> str:
    return f"{n} vị thế"


class Cap8Service:
    """Business logic for the free Cấp 8 «Quản trị rủi ro danh mục» flow."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._vt_repo = VirtualTradingRepository(session)
        self._vt_service = VirtualTradingService(session)
        self._symbol_repo = SymbolRepository(session)
        #: Per-request memo so one ``thach_thuc`` call fetches each symbol's
        #: history at most once even across O(n²) pairs.
        self._lich_su_cache: dict[str, dict[str, float] | None] = {}

    # ── Progress row ─────────────────────────────────

    async def _get_progress_row(self, user_id: uuid.UUID) -> Cap8Progress | None:
        result = await self._session.execute(
            select(Cap8Progress).where(Cap8Progress.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def _require_progress(self, user_id: uuid.UUID) -> Cap8Progress:
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 8")
        return progress

    async def get_progress(self, user_id: uuid.UUID) -> dict | None:
        """``GET /cap8/progress`` — the row + the derived counters.

        Deliberately does NOT price the portfolio: that costs one price lookup
        per position and the panel calls this on every mount. The snapshot
        fields keep whatever ``kiem_tra`` / ``thach-thuc`` last stored (NULL
        until then).
        """
        progress = await self._get_progress_row(user_id)
        if progress is None:
            return None
        metrics = await self._recompute_progress(user_id, progress)
        return self._progress_payload(progress, metrics)

    async def enter(self, user_id: uuid.UUID) -> dict:
        """Enter Cấp 8 (idempotent). Requires the user to have graduated Cấp 7."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            cap7_result = await self._session.execute(
                select(Cap7Progress).where(Cap7Progress.user_id == user_id)
            )
            cap7_progress = cap7_result.scalar_one_or_none()
            if cap7_progress is None:
                raise NotFoundError("tiến trình Cấp 7")
            if cap7_progress.graduated_at is None:
                raise ConflictError("Chưa tốt nghiệp Cấp 7")

            progress = Cap8Progress(user_id=user_id, entered_at=datetime.now(UTC))
            self._session.add(progress)
            await self._session.flush()
            await self._session.refresh(progress)

        metrics = await self._recompute_progress(user_id, progress)
        return self._progress_payload(progress, metrics)

    # ── Hằng số công khai ─────────────────────────────

    @staticmethod
    def quy_tac() -> dict:
        """Every Cấp 8 threshold, published by the SERVER.

        ★ The FE renders THESE numbers instead of inventing its own — the only
        way the warning the user sees, the copy that explains it and the
        graduation rule are guaranteed to agree.
        """
        return {
            "nguong_don_nganh_pct": NGUONG_DON_NGANH_PCT,
            "nguong_tuong_quan": NGUONG_TUONG_QUAN,
            "tuong_quan_min_ty_trong_pct": TUONG_QUAN_MIN_TY_TRONG_PCT,
            "tuong_quan_min_phien": TUONG_QUAN_MIN_PHIEN,
            "so_phien_lich_su": SO_PHIEN_LICH_SU,
            "khau_vi_tran_pct": KHAU_VI_TRAN_PCT,
            "cua_so_bat_chap": _TASK3_CUA_SO,
            "bat_chap_toi_da": _TASK3_BAT_CHAP_MAX,
            "so_lenh_kiem_tra_min": _TASK3_SO_LENH_MIN,
            "cross_ref_pm": CROSS_REF_PM,
        }

    # ── Ngành (ICB thô — KHÔNG đi qua 6 kiểu của Cấp 6) ──

    async def _nganh_of(self, symbol: str) -> str | None:
        """The symbol's ICB ngành — ``icb_lv2`` preferred, ``icb_lv1`` fallback.

        Fail-soft: any lookup failure is "ngành unknown" (→ the dồn-ngành
        measure reports "chưa tính được"), never an error that would block the
        buy panel. Mirrors ``Cap6Service._nganh_of``; the raw string is used
        as-is here — Cấp 6's 6-kiểu mapping is a different abstraction.
        """
        try:
            row = await self._symbol_repo.get_by_symbol(symbol)
        except Exception:  # noqa: BLE001 — unknown ngành, never a hard failure
            return None
        if row is None:
            return None
        return (row.icb_lv2 or None) or (row.icb_lv1 or None)

    # ── Vị thế → cắt lỗ (NEW in Cấp 8) ────────────────

    async def _cat_lo_of_position(
        self, account_id: uuid.UUID, symbol: str
    ) -> int | None:
        """The cắt lỗ that stands for an OPEN position, or ``None`` when unknown.

        Rule: the latest FILLED BUY for this account+symbol (no upper time
        bound), then that order's ``OrderKehoach.cat_lo``.

        ★ Same **pragmatic single-lot approximation** as
        ``Cap2Service._find_matching_kehoach`` / ``Cap1Service._find_matching_buy``
        and for the same reason: the virtual account is AVERAGE-COST, not
        lot-tracked, so a position built from several buys has no per-lot stop
        to read. The most recent buy's plan is the best available proxy for
        "the stop the user is currently working to".

        ★ ``None`` means UNKNOWN — no buy, no kế hoạch row, or a kế hoạch with
        no cắt lỗ. The caller MUST treat it as unknown and exclude the position
        from the risk sum (HONESTY NOTE 1). It must never be read as 0.
        """
        result = await self._session.execute(
            select(VirtualOrder)
            .where(
                VirtualOrder.account_id == account_id,
                VirtualOrder.symbol == symbol.upper(),
                VirtualOrder.side == OrderSide.BUY,
                VirtualOrder.status == OrderStatus.FILLED,
            )
            .order_by(VirtualOrder.created_at.desc())
            .limit(1)
        )
        buy_order = result.scalars().first()
        if buy_order is None:
            return None
        kehoach = await self._get_kehoach_by_order(buy_order.id)
        if kehoach is None:
            return None
        return kehoach.cat_lo

    # ── Lịch sử giá + tương quan ──────────────────────

    async def _closes_by_date(self, symbol: str) -> dict[str, float] | None:
        """``{iso_date: close}`` for the last ``SO_PHIEN_LICH_SU`` sessions, or
        ``None`` when the history is unavailable.

        Fail-soft on purpose: no history ⇒ the correlation is UNKNOWN, which is
        an explicit state, not a zero.
        """
        key = symbol.upper()
        if key in self._lich_su_cache:
            return self._lich_su_cache[key]

        result: dict[str, float] | None = None
        try:
            today = date.today()
            data, _start_index = await get_adjusted_ohlcv(
                key, today - timedelta(days=_LICH_SU_NGAY_LICH), today
            )
            times = list(data.time)[-SO_PHIEN_LICH_SU:]
            closes = [float(c) for c in list(data.close)[-SO_PHIEN_LICH_SU:]]
            result = dict(zip(times, closes, strict=True))
        except Exception as exc:  # noqa: BLE001 — any source failure ⇒ unknown
            logger.debug("Cấp 8: no price history for %s: %s", key, exc)
            result = None

        self._lich_su_cache[key] = result
        return result

    async def _tuong_quan_giua(self, a: str, b: str) -> float | None:
        """Correlation between two symbols' DATE-ALIGNED daily returns, or
        ``None`` when either history is missing or too short.

        Aligning on the calendar date (rather than tail-aligning two lists of
        different lengths, which is what a bare ``correlation()`` call would do)
        matters: a halted or newly listed symbol has a different session grid,
        and pairing session *k* of one with session *k* of the other would
        correlate two different days.
        """
        closes_a = await self._closes_by_date(a)
        closes_b = await self._closes_by_date(b)
        if not closes_a or not closes_b:
            return None
        chung = sorted(set(closes_a) & set(closes_b))
        if len(chung) < TUONG_QUAN_MIN_PHIEN + 1:  # n closes → n-1 returns
            return None
        ra = daily_returns([closes_a[d] for d in chung])
        rb = daily_returns([closes_b[d] for d in chung])
        return tuong_quan_an_toan(ra, rb)

    # ── Ảnh chụp danh mục (dùng chung bởi kiem_tra + thach_thuc) ──

    async def _danh_muc_snapshot(self, user_id: uuid.UUID) -> dict | None:
        """The priced portfolio + every derived weight/risk figure, or ``None``
        when it could not be priced at all.

        Everything downstream reads THIS — one place where the honesty rules
        about unknown stops and unknown prices are applied.
        """
        try:
            portfolio = await self._vt_service.get_portfolio(user_id)
        except NotFoundError:
            raise
        except Exception as exc:  # noqa: BLE001 — price source down ⇒ unknown
            logger.warning("Cấp 8: không lấy được danh mục của %s: %s", user_id, exc)
            return None

        account = portfolio["account"]
        nav = float(portfolio["nav_vnd"] or 0)
        tien_mat = float(
            account.cash_available_vnd
            + account.cash_reserved_vnd
            + account.cash_pending_vnd
        )

        vi_the: list[dict] = []
        thieu_gia = 0
        thieu_cat_lo = 0
        for row in portfolio["positions"]:
            mv = row.get("market_value_vnd")
            symbol = row["symbol"]
            if mv is None:
                # ★ Unknown price ⇒ unknown weight. Out of every sum, into a
                # count — never assumed to be worth 0.
                thieu_gia += 1
                vi_the.append(
                    {
                        "symbol": symbol,
                        "market_value_vnd": None,
                        "ty_trong_pct": None,
                        "nganh": await self._nganh_of(symbol) or NGANH_KHAC_NHAN,
                        "cat_lo": None,
                        "rui_ro_pct": None,
                    }
                )
                continue
            cat_lo = await self._cat_lo_of_position(account.id, symbol)
            if cat_lo is None:
                thieu_cat_lo += 1
            ty_trong = (float(mv) / nav * 100.0) if nav > 0 else None
            khoang = khoang_toi_cat_lo_pct(row.get("current_price_vnd"), cat_lo)
            vi_the.append(
                {
                    "symbol": symbol,
                    "market_value_vnd": float(mv),
                    "ty_trong_pct": ty_trong,
                    "nganh": await self._nganh_of(symbol) or NGANH_KHAC_NHAN,
                    "cat_lo": cat_lo,
                    # ★ None (not 0.0) whenever the stop or the weight is unknown.
                    "rui_ro_pct": (
                        ty_trong * khoang / 100.0
                        if (ty_trong is not None and khoang is not None)
                        else None
                    ),
                }
            )

        # ★ HONESTY NOTE 1: the sum runs over the positions whose risk is KNOWN.
        # The others are not summed as 0 — they are excluded here and counted in
        # ``so_vi_the_thieu_cat_lo`` / ``so_vi_the_thieu_gia``, and every payload
        # that shows this number also shows ``_caveat_text``.
        biet_rui_ro = [v["rui_ro_pct"] for v in vi_the if v["rui_ro_pct"] is not None]
        tong_rui_ro = sum(biet_rui_ro)

        nganh_mv: dict[str, float] = {}
        for v in vi_the:
            if v["market_value_vnd"] is None:
                continue
            nganh_mv[v["nganh"]] = nganh_mv.get(v["nganh"], 0.0) + v["market_value_vnd"]

        khau_vi = await self._khau_vi_of(user_id)
        return {
            "account_id": account.id,
            "nav_vnd": nav,
            "tien_mat_vnd": tien_mat,
            "vi_the": vi_the,
            "so_vi_the": len(vi_the),
            "so_vi_the_thieu_cat_lo": thieu_cat_lo,
            "so_vi_the_thieu_gia": thieu_gia,
            "nganh_mv": nganh_mv,
            "tong_rui_ro_pct": tong_rui_ro if nav > 0 else None,
            "khau_vi": khau_vi,
            "tran_khau_vi_pct": KHAU_VI_TRAN_PCT.get(khau_vi or ""),
        }

    async def _khau_vi_of(self, user_id: uuid.UUID) -> str | None:
        """The LIVE khẩu vị from ``Cap3Progress`` (the canonical editable value),
        never inferred from the most recent order's snapshot."""
        result = await self._session.execute(
            select(Cap3Progress.khau_vi).where(Cap3Progress.user_id == user_id)
        )
        value = result.scalars().first()
        return value.value if value is not None else None

    @staticmethod
    def _caveat_text(snapshot: dict) -> str:
        """The "what this number does NOT include" sentence. Appended to EVERY
        tổng-rủi-ro explanation — see HONESTY NOTE 1."""
        parts: list[str] = []
        if snapshot["so_vi_the_thieu_cat_lo"]:
            parts.append(
                f" {_vi_the_text(snapshot['so_vi_the_thieu_cat_lo'])} chưa có cắt "
                "lỗ — chưa tính được rủi ro của các vị thế này, nên con số trên "
                "là phần ĐÃ BIẾT, không phải toàn bộ."
            )
        if snapshot["so_vi_the_thieu_gia"]:
            parts.append(
                f" {_vi_the_text(snapshot['so_vi_the_thieu_gia'])} chưa lấy được "
                "giá — cũng chưa tính được tỷ trọng và rủi ro của các vị thế này."
            )
        return "".join(parts)

    def _tran_khau_vi_text(self, snapshot: dict) -> str:
        """★ HONESTY NOTE 3 spelled out for the user, every time."""
        khau_vi = snapshot["khau_vi"]
        tran = snapshot["tran_khau_vi_pct"]
        if khau_vi is None or tran is None:
            return (
                "Bạn chưa đặt khẩu vị rủi ro ở Cấp 3, nên chưa có trần nào để đối "
                "chiếu — đặt khẩu vị rồi IQX mới so được tổng vốn ở rủi ro với "
                "mức bạn đã chọn."
            )
        ten = KHAU_VI_LABELS.get(khau_vi, khau_vi)
        return (
            f"Trần khẩu vị {ten}: {tran:.0f}%. Lưu ý hai con số này KHÔNG cùng "
            f"một nghĩa: {tran:.0f}% vốn là trần cho một lệnh (cách bạn đặt ở Cấp "
            "3), còn tổng vốn ở rủi ro là phần vốn mất nếu mọi cắt lỗ bị chạm "
            "trên cả danh mục. Cấp 8 mượn lại chính con số đó làm mức trần cho cả "
            "danh mục."
        )

    # ── GET /cap8/kiem-tra ────────────────────────────

    async def kiem_tra(
        self,
        user_id: uuid.UUID,
        symbol: str,
        khoi_luong: int,
        gia: int,
        *,
        cat_lo: int | None = None,
    ) -> dict:
        """The whole pre-trade check in ONE response (spec §4).

        Three measures, each with its own plain-Vietnamese ``giai_thich`` the FE
        renders VERBATIM. A measure that cannot be computed returns an explicit
        "chưa tính được" state with the reason — never a fabricated 0.

        ★ This is a READ. It can never block a buy (spec §9, §C8): the three
        actions the FE offers (Vẫn mua / Giảm khối lượng / Chọn mã khác) are all
        equally available whatever this returns.
        """
        progress = await self._require_progress(user_id)
        ma = (symbol or "").strip().upper()
        if not ma:
            raise BadRequestError("Thiếu mã cổ phiếu")
        if not khoi_luong or int(khoi_luong) <= 0:
            raise BadRequestError("Khối lượng phải lớn hơn 0")
        if not gia or int(gia) <= 0:
            raise BadRequestError("Giá phải lớn hơn 0")

        snapshot = await self._danh_muc_snapshot(user_id)
        if snapshot is None:
            raise BadRequestError(
                "Chưa lấy được danh mục để kiểm tra — thử lại sau. Bước kiểm tra "
                "này không bao giờ chặn lệnh mua của bạn."
            )
        await self._recompute_progress(user_id, progress, snapshot=snapshot)

        result = await self._do_kiem_tra(
            snapshot, ma, int(khoi_luong), int(gia), cat_lo, them_lenh=True
        )
        return result

    async def _do_kiem_tra(
        self,
        snapshot: dict,
        symbol: str,
        khoi_luong: int,
        gia: int,
        cat_lo: int | None,
        *,
        them_lenh: bool,
    ) -> dict:
        """The three measures. ``them_lenh=False`` means the portfolio ALREADY
        contains the order (it filled), so "sau lệnh" is simply the current
        state — see ``record_kehoach``."""
        nav = snapshot["nav_vnd"]
        gia_tri_lenh = float(khoi_luong) * float(gia) if them_lenh else 0.0
        canh_bao: list[dict] = []

        # ── ① Dồn ngành ──────────────────────────────
        nganh = await self._nganh_of(symbol)
        don_nganh_truoc: float | None = None
        don_nganh_sau: float | None = None
        don_nganh_canh_bao = False
        if nav <= 0:
            don_nganh_text = (
                "Chưa tính được tỷ trọng ngành: danh mục chưa định giá được "
                "(NAV bằng 0)."
            )
        elif nganh is None:
            don_nganh_text = (
                f"Chưa xác định được ngành của {symbol} nên chưa tính được mức dồn "
                "ngành. IQX không đoán ngành — không có dữ liệu thì báo là chưa "
                "có, chứ không hiện 0%."
            )
        else:
            nganh_mv = snapshot["nganh_mv"].get(nganh, 0.0)
            don_nganh_truoc = nganh_mv / nav * 100.0
            # ★ NAV does not move when a buy fills — cash becomes position value.
            don_nganh_sau = (nganh_mv + gia_tri_lenh) / nav * 100.0
            don_nganh_canh_bao = don_nganh_sau > NGUONG_DON_NGANH_PCT
            don_nganh_text = (
                f"Ngành {nganh}: {_pct(don_nganh_truoc)} danh mục hiện tại → "
                f"{_pct(don_nganh_sau)} sau lệnh này "
                f"(tính trên NAV {nav:,.0f}đ, theo ngành ICB của từng mã). "
                f"Ngưỡng cảnh báo: trên {NGUONG_DON_NGANH_PCT:.0f}%."
            )
            if don_nganh_canh_bao:
                don_nganh_text += (
                    " Một cú sốc của ngành này sẽ chạm phần lớn danh mục cùng lúc."
                )
                canh_bao.append(
                    {
                        "ma": LoaiCanhBao.DON_NGANH.value,
                        "ten": LOAI_CANH_BAO_LABELS[LoaiCanhBao.DON_NGANH.value],
                        "text": (
                            f"Dồn ngành {nganh}: {_pct(don_nganh_sau)} danh mục sau "
                            f"lệnh này (ngưỡng {NGUONG_DON_NGANH_PCT:.0f}%)."
                        ),
                    }
                )

        # ── ② Tương quan ─────────────────────────────
        (
            tuong_quan,
            tuong_quan_du_lieu,
            tuong_quan_text,
        ) = await self._do_tuong_quan(snapshot, symbol)
        tuong_quan_canh_bao = bool(
            tuong_quan is not None and tuong_quan["he_so"] > NGUONG_TUONG_QUAN
        )
        if tuong_quan_canh_bao:
            canh_bao.append(
                {
                    "ma": LoaiCanhBao.TUONG_QUAN.value,
                    "ten": LOAI_CANH_BAO_LABELS[LoaiCanhBao.TUONG_QUAN.value],
                    "text": (
                        f"{symbol} đi cùng nhịp với {tuong_quan['symbol']} bạn đang "
                        f"giữ (hệ số {tuong_quan['he_so']:.2f}) — mua thêm không "
                        "thật sự phân tán rủi ro."
                    ),
                }
            )

        # ── ③ Tổng vốn ở rủi ro ──────────────────────
        tong_truoc = snapshot["tong_rui_ro_pct"]
        tran = snapshot["tran_khau_vi_pct"]
        tong_sau: float | None = None
        tong_canh_bao = False
        if tong_truoc is None:
            tong_text = (
                "Chưa tính được tổng vốn ở rủi ro: danh mục chưa định giá được."
            )
        else:
            khoang = khoang_toi_cat_lo_pct(gia, cat_lo) if them_lenh else 0.0
            if them_lenh and khoang is None:
                # ★ Unknown stop for the candidate ⇒ unknown total AFTER. We do
                # NOT quietly show the "trước" number as if it were the answer.
                tong_text = (
                    f"Tổng vốn ở rủi ro hiện tại: {_pct(tong_truoc)} — tổng phần "
                    "vốn sẽ mất nếu mọi cắt lỗ bị chạm. Lệnh này chưa đặt cắt lỗ "
                    "nên chưa tính được con số sau lệnh: một vị thế không có cắt "
                    "lỗ có rủi ro CHƯA BIẾT, không phải bằng 0."
                )
            else:
                them = (
                    (gia_tri_lenh / nav * 100.0) * (khoang or 0.0) / 100.0
                    if nav > 0
                    else 0.0
                )
                tong_sau = tong_truoc + them
                tong_canh_bao = bool(tran is not None and tong_sau > tran)
                tong_text = (
                    f"Tổng vốn ở rủi ro: {_pct(tong_truoc)} → {_pct(tong_sau)} sau "
                    "lệnh này — tổng phần vốn sẽ mất nếu mọi cắt lỗ bị chạm "
                    "(cộng tỷ trọng từng vị thế × khoảng cách tới cắt lỗ của "
                    "chính nó)."
                )
                if tong_canh_bao and tran is not None:
                    tong_text += (
                        f" Con số này vượt trần khẩu vị {tran:.0f}% bạn đã chọn."
                    )
                    canh_bao.append(
                        {
                            "ma": LoaiCanhBao.TONG_RUI_RO.value,
                            "ten": LOAI_CANH_BAO_LABELS[LoaiCanhBao.TONG_RUI_RO.value],
                            "text": (
                                f"Tổng vốn ở rủi ro {_pct(tong_sau)} (nếu mọi cắt lỗ "
                                f"bị chạm) vượt trần khẩu vị {tran:.0f}%."
                            ),
                        }
                    )
            tong_text += self._caveat_text(snapshot)

        return {
            "symbol": symbol,
            "khoi_luong": khoi_luong,
            "gia": gia,
            "cat_lo": cat_lo,
            "gia_tri_lenh_vnd": gia_tri_lenh,
            "nav_vnd": nav,
            "so_vi_the": snapshot["so_vi_the"],
            "so_vi_the_thieu_cat_lo": snapshot["so_vi_the_thieu_cat_lo"],
            "so_vi_the_thieu_gia": snapshot["so_vi_the_thieu_gia"],
            "nganh": nganh,
            "don_nganh_pct_truoc": don_nganh_truoc,
            "don_nganh_pct_sau": don_nganh_sau,
            "don_nganh_canh_bao": don_nganh_canh_bao,
            "tuong_quan": tuong_quan,
            "tuong_quan_canh_bao": tuong_quan_canh_bao,
            "tuong_quan_du_lieu": tuong_quan_du_lieu,
            "tong_rui_ro_pct_truoc": tong_truoc,
            "tong_rui_ro_pct_sau": tong_sau,
            "tong_rui_ro_canh_bao": tong_canh_bao,
            "khau_vi": snapshot["khau_vi"],
            "khau_vi_ten": KHAU_VI_LABELS.get(snapshot["khau_vi"] or ""),
            "tran_khau_vi_pct": tran,
            "canh_bao": canh_bao,
            "giai_thich": {
                "don_nganh": don_nganh_text,
                "tuong_quan": tuong_quan_text,
                "tong_rui_ro": tong_text,
                "tran_khau_vi": self._tran_khau_vi_text(snapshot),
            },
            "cross_ref_pm": CROSS_REF_PM,
            "quy_tac": self.quy_tac(),
        }

    async def _do_tuong_quan(
        self, snapshot: dict, symbol: str
    ) -> tuple[dict | None, bool, str]:
        """``(tuong_quan | None, du_du_lieu, giai_thich)`` for the candidate
        against the ĐÁNG KỂ positions it does not already occupy.

        ★ Three distinct "no number" states, never collapsed into a 0:
          · nothing to compare against (spec §7: correlation needs ≥2 mã);
          · nothing big enough to matter (``TUONG_QUAN_MIN_TY_TRONG_PCT``);
          · not enough aligned history (``TUONG_QUAN_MIN_PHIEN``).
        """
        doi_tac = [
            v
            for v in snapshot["vi_the"]
            if v["symbol"] != symbol
            and v["ty_trong_pct"] is not None
            and v["ty_trong_pct"] >= TUONG_QUAN_MIN_TY_TRONG_PCT
        ]
        khac = [v for v in snapshot["vi_the"] if v["symbol"] != symbol]

        if not khac:
            return (
                None,
                False,
                "Chưa có vị thế nào khác để so tương quan — cần ít nhất 2 mã thì "
                "mới có gì để so.",
            )
        if not doi_tac:
            return (
                None,
                False,
                "Các vị thế đang giữ đều nhỏ hơn "
                f"{TUONG_QUAN_MIN_TY_TRONG_PCT:.0f}% danh mục nên IQX không so "
                "tương quan: một mã đi cùng nhịp với vị thế quá nhỏ thì có cùng "
                "nhịp cũng không ảnh hưởng đáng kể tới danh mục.",
            )

        ket_qua: list[dict] = []
        for v in sorted(doi_tac, key=lambda x: -x["ty_trong_pct"])[
            :TUONG_QUAN_MAX_VI_THE
        ]:
            he_so = await self._tuong_quan_giua(symbol, v["symbol"])
            if he_so is None:
                continue  # ★ chưa đủ dữ liệu — NOT 0.0
            ket_qua.append({"symbol": v["symbol"], "he_so": he_so})

        if not ket_qua:
            return (
                None,
                False,
                "Chưa đủ dữ liệu giá để tính tương quan (cần ít nhất "
                f"{TUONG_QUAN_MIN_PHIEN} phiên có cả hai mã). IQX để trống chỗ này "
                "thay vì hiện 0 — không tính được KHÔNG có nghĩa là hai mã không "
                "đi cùng nhịp.",
            )

        cao_nhat = max(ket_qua, key=lambda x: x["he_so"])
        if cao_nhat["he_so"] > NGUONG_TUONG_QUAN:
            text = (
                f"{symbol} đi cùng nhịp với {cao_nhat['symbol']} bạn đang giữ "
                f"(hệ số {cao_nhat['he_so']:.2f}, tính trên {SO_PHIEN_LICH_SU} "
                f"phiên gần nhất; ngưỡng cảnh báo {NGUONG_TUONG_QUAN:.1f}) — mua "
                "thêm không thật sự phân tán rủi ro."
            )
        else:
            text = (
                f"Tương quan cao nhất với vị thế đang giữ: {cao_nhat['symbol']} "
                f"{cao_nhat['he_so']:.2f} (tính trên {SO_PHIEN_LICH_SU} phiên gần "
                f"nhất; ngưỡng cảnh báo {NGUONG_TUONG_QUAN:.1f}) — dưới ngưỡng, "
                "thêm mã này vẫn có tác dụng phân tán."
            )
        return cao_nhat, True, text

    # ── POST /cap8/kehoach ────────────────────────────

    async def _get_kehoach_by_order(self, order_id: uuid.UUID) -> OrderKehoach | None:
        result = await self._session.execute(
            select(OrderKehoach).where(OrderKehoach.order_id == order_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    def _validate_canh_bao_da_hien(value: list | None) -> list[str]:
        """The warning codes the CLIENT reports having been shown, cleaned.

        Lenient rather than 400-ing: unknown codes are dropped and duplicates
        collapsed, in ``LoaiCanhBao`` order. This list can only ever justify a
        compliance answer (HONESTY NOTE 5), so a malformed one costs the user a
        rejected ``giam_kl`` — never a corrupted discipline count.
        """
        if not isinstance(value, list):
            return []
        seen = {str(v) for v in value}
        return [m.value for m in LoaiCanhBao if m.value in seen]

    async def record_kehoach(
        self,
        user_id: uuid.UUID,
        order_id: uuid.UUID,
        *,
        hanh_vi_canh_bao: str | None,
        canh_bao_da_hien: list | None = None,
        don_nganh_pct: float | None = None,
        tuong_quan_cao_voi: dict | None = None,
        tong_rui_ro_pct: float | None = None,
        danh_muc_canh_bao: list | None = None,
    ) -> OrderKehoach:
        """Adds the "Kiểm tra danh mục" block to the EXISTING ``order_kehoach``
        row created by Cấp 1's ``/cap1/kehoach`` (Cấp 2-7's blocks are filled
        first; Cấp 8 only inserts this one). 404 when that row is absent, the
        same convention as Cấp 2-7.

        ★ HONESTY NOTE 4. ``don_nganh_pct`` / ``tuong_quan_cao_voi`` /
        ``tong_rui_ro_pct`` / ``danh_muc_canh_bao`` are accepted for wire
        compatibility with the FE's check payload and then **DISCARDED**: the
        server recomputes all four from the real portfolio and stores its own.
        Otherwise a client could post an empty warning list and keep its
        ``so_lan_mua_bat_chap_canh_bao`` permanently clean.

        ``hanh_vi_canh_bao`` IS the client's to report — only the user knows
        which button they pressed — but it must agree with what actually fired:
        ``khong_canh_bao`` while warnings are present (or ``van_mua`` while none
        are) is a contradiction and is rejected (400).

        ★ WRITE-ONCE (HONESTY NOTE 5.1). Once the block is recorded it is frozen:
        an identical re-post returns the stored row untouched (a retried network
        call must not 409, and must not silently re-price the snapshot against a
        newer portfolio either), anything else raises ``ConflictError``.

        ★ ``canh_bao_da_hien`` (HONESTY NOTE 5.2) is the ``canh_bao[].ma`` list
        from the ``/cap8/kiem-tra`` response the user responded to. It is used
        for exactly one thing: letting ``giam_kl`` / ``chon_ma_khac`` be recorded
        when the adjustment WORKED and the warning no longer fires. It is ignored
        for ``van_mua`` and ``khong_canh_bao``, which stay server-decided. For
        ``chon_ma_khac`` the warnings are those of the ABANDONED candidate — this
        order is a different mã, so the server could not re-derive them even in
        principle.
        """
        del don_nganh_pct, tuong_quan_cao_voi, tong_rui_ro_pct, danh_muc_canh_bao

        progress = await self._require_progress(user_id)

        if hanh_vi_canh_bao not in _HANH_VI_VALUES:
            raise BadRequestError(
                "hanh_vi_canh_bao phải là 'van_mua', 'giam_kl', 'chon_ma_khac' "
                "hoặc 'khong_canh_bao'"
            )

        order = await self._vt_repo.get_order_by_id(order_id)
        if order is None or order.user_id != user_id:
            raise NotFoundError("lệnh")
        if order.side != OrderSide.BUY:
            raise BadRequestError("Bước Kiểm tra danh mục chỉ ghi cho lệnh MUA")

        kehoach = await self._get_kehoach_by_order(order_id)
        if kehoach is None:
            raise NotFoundError("kế hoạch Cấp 1 — cần ghi vùng mua trước")

        # ★ WRITE-ONCE (see the docstring / HONESTY NOTE 5.1). Checked BEFORE the
        # portfolio is priced: a retry must not even re-measure, let alone rewrite.
        if kehoach.hanh_vi_canh_bao is not None:
            if kehoach.hanh_vi_canh_bao == hanh_vi_canh_bao:
                return kehoach  # retried network call — a no-op, never a 409
            raise ConflictError(
                "Lệnh này đã ghi bước Kiểm tra danh mục rồi — ảnh chụp danh mục "
                "LÚC MUA không sửa lại được. Đó là điều làm ô \"mua bất chấp cảnh "
                "báo\" có nghĩa: nó ghi lại điều đã xảy ra, không phải điều danh "
                "mục trông như thế nào hôm nay."
            )

        snapshot = await self._danh_muc_snapshot(user_id)
        if snapshot is None:
            raise BadRequestError("Chưa lấy được danh mục để kiểm tra — thử lại sau")

        # ★ An unfilled MARKET order has NO price of its own — no fill price and
        # no limit price. Cấp 1's vùng mua is the price the USER planned to pay
        # and is the honest stand-in; 400-ing instead would mean the Cấp 8 block
        # is simply never recorded for such an order, and the level's central
        # step silently disappears for it.
        gia = order.filled_price_vnd or order.limit_price_vnd or kehoach.vung_mua
        if not gia or int(gia) <= 0:
            raise BadRequestError("Lệnh chưa có giá để tính tác động lên danh mục")

        # ★ A FILLED order is already inside the priced portfolio, so "sau lệnh"
        # IS the current state; a still-pending one is not, so its slice is added.
        them_lenh = order.status != OrderStatus.FILLED
        check = await self._do_kiem_tra(
            snapshot,
            order.symbol.upper(),
            int(order.quantity),
            int(gia),
            kehoach.cat_lo,
            them_lenh=them_lenh,
        )

        ma_canh_bao = [c["ma"] for c in check["canh_bao"]]
        co_canh_bao = bool(ma_canh_bao)
        if co_canh_bao and hanh_vi_canh_bao == HanhViCanhBao.KHONG_CANH_BAO.value:
            raise BadRequestError(
                "Lệnh này CÓ cảnh báo danh mục ("
                + ", ".join(LOAI_CANH_BAO_LABELS[m] for m in ma_canh_bao)
                + ") nên không ghi được 'không có cảnh báo'."
            )
        if not co_canh_bao and hanh_vi_canh_bao in _HANH_VI_CO_CANH_BAO:
            # ★ THE COMPLIANCE CASE (HONESTY NOTE 5.2). Giảm khối lượng / chọn mã
            # khác is exactly what makes the warning stop firing, so "nothing
            # fires now" is the EXPECTED state for a user who listened. The
            # warnings from the check they responded to make that recordable.
            da_hien = self._validate_canh_bao_da_hien(canh_bao_da_hien)
            if hanh_vi_canh_bao in _HANH_VI_NGHE_CANH_BAO and da_hien:
                ma_canh_bao = da_hien
            else:
                raise BadRequestError(
                    "Lệnh này KHÔNG có cảnh báo danh mục nào nên chỉ ghi được "
                    "'khong_canh_bao' — trừ khi bạn gửi kèm canh_bao_da_hien "
                    "(các cảnh báo của chính lần kiểm tra bạn đã phản hồi)."
                )

        kehoach.don_nganh_pct = check["don_nganh_pct_sau"]
        kehoach.tuong_quan_cao_voi = (
            check["tuong_quan"] if check["tuong_quan_canh_bao"] else None
        )
        kehoach.tong_rui_ro_pct = check["tong_rui_ro_pct_sau"]
        kehoach.danh_muc_canh_bao = ma_canh_bao
        kehoach.hanh_vi_canh_bao = hanh_vi_canh_bao
        await self._session.flush()
        await self._session.refresh(kehoach)

        await self._recompute_progress(user_id, progress, snapshot=snapshot)
        return kehoach

    @staticmethod
    def kehoach_out(kehoach: OrderKehoach) -> dict:
        """Serialize the Cấp 8 block for the API + the §C12c one-sentence
        explanation of what was checked and what the user did about it."""
        ma_canh_bao = kehoach.danh_muc_canh_bao
        hanh_vi = kehoach.hanh_vi_canh_bao
        hanh_vi_ten = HANH_VI_CANH_BAO_LABELS.get(hanh_vi or "") or None
        canh_bao_ten = [
            LOAI_CANH_BAO_LABELS.get(m, m) for m in (ma_canh_bao or [])
        ]
        canh_bao_text = " · ".join(canh_bao_ten)

        if hanh_vi is None:
            giai_thich = (
                "Lệnh này chưa qua bước Kiểm tra danh mục — bước này chỉ có từ "
                "Cấp 8, và nó không bao giờ là điều kiện bắt buộc để mua."
            )
        elif not canh_bao_ten:
            giai_thich = (
                "Lúc mua: danh mục không có cảnh báo nào — lệnh này không làm "
                "danh mục mất cân đối."
            )
        else:
            # ★ For giảm khối lượng / chọn mã khác the warning belongs to the
            # CHECK the user responded to, and every number below is the danh mục
            # AFTER they adjusted — saying "Lúc mua: ⚠ …" there would describe a
            # danh mục that never existed. The two cases get their own opening.
            da_nghe = hanh_vi in _HANH_VI_NGHE_CANH_BAO
            phan = [
                f"Lúc kiểm tra: ⚠ {canh_bao_text}."
                if da_nghe
                else f"Lúc mua: ⚠ {canh_bao_text}."
            ]
            if kehoach.don_nganh_pct is not None:
                phan.append(f"Dồn ngành sau lệnh: {float(kehoach.don_nganh_pct):.1f}%.")
            if kehoach.tuong_quan_cao_voi:
                phan.append(
                    "Đi cùng nhịp với "
                    f"{kehoach.tuong_quan_cao_voi.get('symbol')} "
                    f"(~{float(kehoach.tuong_quan_cao_voi.get('he_so', 0)):.2f})."
                )
            if kehoach.tong_rui_ro_pct is not None:
                phan.append(
                    "Tổng vốn ở rủi ro sau lệnh: "
                    f"{float(kehoach.tong_rui_ro_pct):.1f}% (nếu mọi cắt lỗ bị chạm)."
                )
            phan.append(f"Bạn chọn: {hanh_vi_ten}.")
            if hanh_vi == HanhViCanhBao.VAN_MUA.value:
                phan.append(
                    "Vẫn mua là một lựa chọn hợp lệ — IQX cảnh báo chứ không "
                    "quyết thay bạn."
                )
            elif da_nghe:
                phan.append(
                    "Các con số trên là ảnh chụp danh mục SAU khi bạn điều "
                    "chỉnh, nên chúng có thể đã nằm trong ngưỡng — đó chính là "
                    "tác dụng của việc bạn nghe cảnh báo."
                )
            giai_thich = " ".join(phan)

        return {
            "id": kehoach.id,
            "order_id": kehoach.order_id,
            "don_nganh_pct": (
                float(kehoach.don_nganh_pct) if kehoach.don_nganh_pct is not None else None
            ),
            "tuong_quan_cao_voi": kehoach.tuong_quan_cao_voi,
            "tong_rui_ro_pct": (
                float(kehoach.tong_rui_ro_pct)
                if kehoach.tong_rui_ro_pct is not None
                else None
            ),
            "danh_muc_canh_bao": ma_canh_bao,
            "danh_muc_canh_bao_ten": canh_bao_ten if ma_canh_bao is not None else None,
            "canh_bao_text": canh_bao_text,
            "hanh_vi_canh_bao": hanh_vi,
            "hanh_vi_canh_bao_ten": hanh_vi_ten,
            "giai_thich": giai_thich,
        }

    # ── Source rows ───────────────────────────────────

    async def _kiem_tra_rows(
        self, user_id: uuid.UUID
    ) -> list[tuple[OrderKehoach, VirtualOrder]]:
        """``order_kehoach`` rows that went through the Kiểm tra danh mục step,
        with their BUY order, OLDEST → NEWEST (see the module docstring for why
        there is no ``entered_at`` filter)."""
        result = await self._session.execute(
            select(OrderKehoach, VirtualOrder)
            .join(VirtualOrder, VirtualOrder.id == OrderKehoach.order_id)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.mode == "thuc_chien",
                OrderKehoach.hanh_vi_canh_bao.is_not(None),
            )
            .order_by(VirtualOrder.created_at.asc())
        )
        return [(kehoach, order) for kehoach, order in result.all()]

    @staticmethod
    def _la_bat_chap(kehoach: OrderKehoach) -> bool:
        """"Mua bất chấp cảnh báo" = a real warning fired AND the user chose
        ``van_mua``. ★ NOT a violation — spec §9 rules out a hard gate. It only
        counts against condition ②, and nothing else."""
        return bool(kehoach.danh_muc_canh_bao) and (
            kehoach.hanh_vi_canh_bao == HanhViCanhBao.VAN_MUA.value
        )

    async def _closed_pairs(
        self, user_id: uuid.UUID
    ) -> list[tuple[OrderKehoach, OrderKetso]]:
        """Every closed round trip whose BUY carries a Cấp 8 block, paired with
        its ``order_ketso`` outcome (pairing rule = Cấp 1's, mirrored exactly as
        Cấp 4/6/7 mirror it: the most recent FILLED buy for the same
        account+symbol at/before the sell)."""
        kehoach_rows = await self._kiem_tra_rows(user_id)
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

    # ── Metrics + recompute + 3 nhiệm vụ ──────────────

    async def _compute_metrics(self, user_id: uuid.UUID) -> dict:
        rows = await self._kiem_tra_rows(user_id)
        gan_day = rows[-_TASK3_CUA_SO :] if rows else []
        return {
            "so_lenh_kiem_tra": len(rows),
            "so_lan_co_canh_bao": sum(
                1 for kehoach, _order in rows if kehoach.danh_muc_canh_bao
            ),
            # ★ LIFETIME — the honest all-time figure.
            "so_lan_mua_bat_chap_canh_bao": sum(
                1 for kehoach, _order in rows if self._la_bat_chap(kehoach)
            ),
            # ★ ROLLING window — what graduation condition ② actually measures.
            "bat_chap_gan_day": sum(
                1 for kehoach, _order in gan_day if self._la_bat_chap(kehoach)
            ),
            "cua_so_gan_day": len(gan_day),
            "so_lenh_da_ket_so": len(await self._closed_pairs(user_id)),
        }

    async def _recompute_progress(
        self,
        user_id: uuid.UUID,
        progress: Cap8Progress,
        *,
        snapshot: dict | None = None,
    ) -> dict:
        """Recompute every derived counter + the 3 nhiệm vụ.

        ``snapshot`` is the priced portfolio when the caller already has one.
        When it is ``None`` the stored closing-state figures are left ALONE
        (they keep their last known values, or stay NULL) and nhiệm vụ ③'s
        third leg simply cannot pass on this pass — we never invent a portfolio
        state just to be able to stamp a task.
        """
        metrics = await self._compute_metrics(user_id)

        progress.so_lenh_kiem_tra = metrics["so_lenh_kiem_tra"]
        progress.so_lan_mua_bat_chap_canh_bao = metrics["so_lan_mua_bat_chap_canh_bao"]

        legs = self._task3_legs(metrics, snapshot)
        if snapshot is not None:
            progress.don_nganh_max_pct = legs["don_nganh_max_pct"]
            progress.tong_rui_ro_pct = snapshot["tong_rui_ro_pct"]

        now = datetime.now(UTC)

        # ① lệnh đầu qua Kiểm tra danh mục.
        if progress.task_1_done_at is None and metrics["so_lenh_kiem_tra"] >= 1:
            progress.task_1_done_at = now

        # ② Kết sổ đầu Cấp 8 = lệnh đầu tiên CÓ khối Cấp 8 đã đóng.
        if progress.task_2_done_at is None and metrics["so_lenh_da_ket_so"] >= 1:
            progress.task_2_done_at = now

        # ③ Thách thức — triple condition, NOT gated.
        if progress.task_3_done_at is None and legs["dat_ca_3"]:
            progress.task_3_done_at = now

        await self._session.flush()
        await self._session.refresh(progress)
        return metrics

    @staticmethod
    def _task3_legs(metrics: dict, snapshot: dict | None) -> dict:
        """The 3 legs of nhiệm vụ ③ (spec §2③) — ALL must hold at once.

        Leg ③ is the CLOSING STATE of the portfolio and needs it priced; without
        a snapshot it is "chưa đủ dữ liệu" — neither a pass nor a mark against
        the user, exactly like Cấp 5/6/7's unscoreable legs.
        """
        so_lenh_dat = metrics["so_lenh_kiem_tra"] >= _TASK3_SO_LENH_MIN
        bat_chap_dat = metrics["bat_chap_gan_day"] <= _TASK3_BAT_CHAP_MAX

        don_nganh_max_pct: float | None = None
        don_nganh_max_nganh: str | None = None
        danh_muc_du_lieu = False
        danh_muc_dat = False
        if snapshot is not None and snapshot["nav_vnd"] > 0:
            danh_muc_du_lieu = True
            if snapshot["nganh_mv"]:
                nganh, mv = max(snapshot["nganh_mv"].items(), key=lambda kv: kv[1])
                don_nganh_max_nganh = nganh
                don_nganh_max_pct = mv / snapshot["nav_vnd"] * 100.0
            else:
                don_nganh_max_pct = 0.0
            nganh_ok = don_nganh_max_pct <= NGUONG_DON_NGANH_PCT
            # ``tong`` is non-NULL whenever the danh mục is priced — see
            # ``_danh_muc_snapshot``, which sets it to NULL only when NAV is 0,
            # and this whole branch already requires ``nav_vnd > 0``.
            tong = snapshot["tong_rui_ro_pct"]
            tran = snapshot["tran_khau_vi_pct"]
            if tran is None:
                # No khẩu vị set ⇒ no ceiling ⇒ nothing to check against.
                danh_muc_du_lieu = False
                rui_ro_ok = False
            else:
                rui_ro_ok = tong <= tran
            danh_muc_dat = bool(danh_muc_du_lieu and nganh_ok and rui_ro_ok)

        return {
            "so_lenh_dat": so_lenh_dat,
            "bat_chap_dat": bat_chap_dat,
            "danh_muc_du_lieu": danh_muc_du_lieu,
            "danh_muc_dat": danh_muc_dat,
            "don_nganh_max_pct": don_nganh_max_pct,
            "don_nganh_max_nganh": don_nganh_max_nganh,
            "dat_ca_3": so_lenh_dat and bat_chap_dat and danh_muc_dat,
        }

    def _progress_payload(self, progress: Cap8Progress, metrics: dict) -> dict:
        """The stored row + the derived counters the columns do not hold.

        ``bat_chap_gan_day`` rides along beside the LIFETIME
        ``so_lan_mua_bat_chap_canh_bao`` precisely so the two can never be
        mistaken for each other — condition ② measures the window, the column
        records the whole history.
        """
        return {
            "id": progress.id,
            "user_id": progress.user_id,
            "entered_at": progress.entered_at,
            "task_1_done_at": progress.task_1_done_at,
            "task_2_done_at": progress.task_2_done_at,
            "task_3_done_at": progress.task_3_done_at,
            "so_lenh_kiem_tra": progress.so_lenh_kiem_tra,
            "so_lan_mua_bat_chap_canh_bao": progress.so_lan_mua_bat_chap_canh_bao,
            "don_nganh_max_pct": progress.don_nganh_max_pct,
            "tong_rui_ro_pct": progress.tong_rui_ro_pct,
            "graduated_at": progress.graduated_at,
            "time_to_graduate_hours": progress.time_to_graduate_hours,
            # ── derived (never stored) ──
            "so_lan_co_canh_bao": metrics["so_lan_co_canh_bao"],
            "bat_chap_gan_day": metrics["bat_chap_gan_day"],
            "cua_so_gan_day": metrics["cua_so_gan_day"],
            "so_lenh_da_ket_so": metrics["so_lenh_da_ket_so"],
        }

    async def mark_task(self, user_id: uuid.UUID, task_no: int) -> dict:
        """``PATCH /cap8/task`` — all 3 nhiệm vụ are derived from
        ``order_kehoach``/``order_ketso`` + the live danh mục, so this just
        triggers a recompute pass (idempotent, never sets a task the history
        does not support)."""
        if task_no not in _TASK_NOS:
            raise BadRequestError("task_no không hợp lệ")
        progress = await self._require_progress(user_id)
        metrics = await self._recompute_progress(user_id, progress)
        return self._progress_payload(progress, metrics)

    # ── Thách thức — GET /cap8/thach-thuc ─────────────

    async def thach_thuc(self, user_id: uuid.UUID) -> dict:
        """3 sub-conditions of nhiệm vụ ③ + current values + giải thích each
        (feeds the §C12c display — never a bare number), plus the closing-state
        ``danh_muc`` block khối ⑱ renders. Recomputed server-side on read; the
        stored aggregates are never trusted."""
        progress = await self._require_progress(user_id)
        snapshot = await self._danh_muc_snapshot(user_id)
        metrics = await self._recompute_progress(user_id, progress, snapshot=snapshot)
        legs = self._task3_legs(metrics, snapshot)

        # ① số lệnh qua kiểm tra
        so_lenh_giai_thich = (
            f"Đã qua bước Kiểm tra danh mục {metrics['so_lenh_kiem_tra']}/"
            f"{_TASK3_SO_LENH_MIN} lệnh — mỗi lần là một lần bạn nhìn lệnh mới "
            "trong bối cảnh CẢ danh mục, chứ không chỉ nhìn riêng mã đó."
        )

        # ② mua bất chấp cảnh báo — ROLLING WINDOW
        bat_chap_giai_thich = (
            f"Trong {metrics['cua_so_gan_day']} lệnh gần nhất (cửa sổ trượt "
            f"{_TASK3_CUA_SO} lệnh gần nhất), bạn mua bất chấp cảnh báo "
            f"{metrics['bat_chap_gan_day']}/{_TASK3_BAT_CHAP_MAX} lần. Cả đời tài "
            f"khoản là {metrics['so_lan_mua_bat_chap_canh_bao']} lần — cửa sổ chỉ "
            "tính các lệnh gần đây, nên một giai đoạn cũ không theo bạn mãi. Vẫn "
            "mua KHÔNG bị phạt: nó chỉ được đếm ở ô kỷ luật này."
        )

        # ③ closing state
        danh_muc_giai_thich = self._danh_muc_leg_text(legs, snapshot)

        return {
            "dat_ca_3": legs["dat_ca_3"],
            "so_lenh_kiem_tra": {
                "ten": f"Kiểm tra danh mục cho ≥ {_TASK3_SO_LENH_MIN} lệnh",
                "gia_tri_hien_tai": float(metrics["so_lenh_kiem_tra"]),
                "muc_tieu": float(_TASK3_SO_LENH_MIN),
                "dat": legs["so_lenh_dat"],
                "du_du_lieu": True,
                "giai_thich": so_lenh_giai_thich,
            },
            "mua_bat_chap": {
                "ten": (
                    f"≤ {_TASK3_BAT_CHAP_MAX} lần mua bất chấp cảnh báo trong "
                    f"{_TASK3_CUA_SO} lệnh gần nhất"
                ),
                "gia_tri_hien_tai": float(metrics["bat_chap_gan_day"]),
                "muc_tieu": float(_TASK3_BAT_CHAP_MAX),
                "dat": legs["bat_chap_dat"],
                "du_du_lieu": True,
                "giai_thich": bat_chap_giai_thich,
            },
            "danh_muc_an_toan": {
                "ten": (
                    f"Không ngành nào > {NGUONG_DON_NGANH_PCT:.0f}% và tổng vốn ở "
                    "rủi ro ≤ trần khẩu vị"
                ),
                "gia_tri_hien_tai": (
                    legs["don_nganh_max_pct"]
                    if legs["don_nganh_max_pct"] is not None
                    else 0.0
                ),
                "muc_tieu": NGUONG_DON_NGANH_PCT,
                "dat": legs["danh_muc_dat"],
                "du_du_lieu": legs["danh_muc_du_lieu"],
                "giai_thich": danh_muc_giai_thich,
            },
            "so_lenh_da_ket_so": metrics["so_lenh_da_ket_so"],
            "so_lan_co_canh_bao": metrics["so_lan_co_canh_bao"],
            "so_lan_mua_bat_chap_canh_bao": metrics["so_lan_mua_bat_chap_canh_bao"],
            "cua_so_gan_day": metrics["cua_so_gan_day"],
            "danh_muc": await self._danh_muc_payload(snapshot, legs),
        }

    def _danh_muc_leg_text(self, legs: dict, snapshot: dict | None) -> str:
        if snapshot is None or not legs["danh_muc_du_lieu"]:
            if snapshot is not None and snapshot["tran_khau_vi_pct"] is None:
                return (
                    "Bạn chưa đặt khẩu vị rủi ro ở Cấp 3 nên chưa có trần nào để "
                    "đối chiếu tổng vốn ở rủi ro — đặt khẩu vị rồi IQX mới chấm "
                    "được điều kiện này."
                )
            return (
                "Chưa định giá được danh mục nên chưa chấm được điều kiện này — "
                "IQX để trống thay vì coi như đạt."
            )

        phan: list[str] = []
        if snapshot["so_vi_the"] == 0:
            phan.append("Danh mục hiện không còn vị thế nào, nên không có ngành nào dồn.")
        else:
            nganh = legs["don_nganh_max_nganh"] or NGANH_KHAC_NHAN
            pct = legs["don_nganh_max_pct"] or 0.0
            phan.append(
                f"Ngành lớn nhất: {nganh} {_pct(pct)} "
                f"(ngưỡng {NGUONG_DON_NGANH_PCT:.0f}%)."
            )
        tong = snapshot["tong_rui_ro_pct"]
        tran = snapshot["tran_khau_vi_pct"]
        if tong is not None and tran is not None:
            ten = KHAU_VI_LABELS.get(snapshot["khau_vi"] or "", snapshot["khau_vi"] or "")
            phan.append(
                f"Tổng vốn ở rủi ro: {_pct(tong)} (nếu mọi cắt lỗ bị chạm) · trần "
                f"khẩu vị {ten}: {tran:.0f}% (trần này vốn đặt cho một lệnh; Cấp 8 "
                "dùng lại làm mức trần cho cả danh mục)."
            )
        phan.append(self._caveat_text(snapshot).strip())
        return " ".join(p for p in phan if p)

    async def _danh_muc_payload(self, snapshot: dict | None, legs: dict) -> dict | None:
        """The closing-state block khối ⑱ renders: sector allocation (cash
        included), the high-correlation pairs, tổng rủi ro vs trần khẩu vị.

        ``None`` when the portfolio could not be priced — an explicit "chưa tính
        được", never an empty-but-confident payload.
        """
        if snapshot is None:
            return None
        nav = snapshot["nav_vnd"]
        phan_bo: list[dict] = []
        if nav > 0:
            for nganh, mv in sorted(
                snapshot["nganh_mv"].items(), key=lambda kv: -kv[1]
            ):
                phan_bo.append({"nganh": nganh, "pct": mv / nav * 100.0})
            phan_bo.append(
                {"nganh": TIEN_MAT_NHAN, "pct": snapshot["tien_mat_vnd"] / nav * 100.0}
            )

        cap_cao, tuong_quan_du_lieu = await self._cap_tuong_quan_cao(snapshot)

        return {
            "nav_vnd": nav,
            "so_vi_the": snapshot["so_vi_the"],
            "so_vi_the_thieu_cat_lo": snapshot["so_vi_the_thieu_cat_lo"],
            "so_vi_the_thieu_gia": snapshot["so_vi_the_thieu_gia"],
            "phan_bo_nganh": phan_bo,
            "don_nganh_max": (
                {
                    "nganh": legs["don_nganh_max_nganh"] or NGANH_KHAC_NHAN,
                    "pct": legs["don_nganh_max_pct"],
                }
                if legs["don_nganh_max_pct"] is not None
                else None
            ),
            "tong_rui_ro_pct": snapshot["tong_rui_ro_pct"],
            "khau_vi": snapshot["khau_vi"],
            "khau_vi_ten": KHAU_VI_LABELS.get(snapshot["khau_vi"] or ""),
            "tran_khau_vi_pct": snapshot["tran_khau_vi_pct"],
            "cap_tuong_quan_cao": cap_cao,
            "tuong_quan_du_lieu": tuong_quan_du_lieu,
            "caveat": self._caveat_text(snapshot).strip(),
            "cross_ref_pm": CROSS_REF_PM,
        }

    async def _cap_tuong_quan_cao(self, snapshot: dict) -> tuple[list[dict], bool]:
        """High-correlation pairs among the ĐÁNG KỂ positions (spec §7).

        ``(pairs, du_du_lieu)`` — ``du_du_lieu=False`` means no pair could be
        computed at all (fewer than 2 significant positions, or not enough
        aligned history), which the FE must render as "chưa đủ dữ liệu" rather
        than as "không có cặp nào tương quan cao".
        """
        dang_ke = sorted(
            (
                v
                for v in snapshot["vi_the"]
                if v["ty_trong_pct"] is not None
                and v["ty_trong_pct"] >= TUONG_QUAN_MIN_TY_TRONG_PCT
            ),
            key=lambda v: -v["ty_trong_pct"],
        )[:TUONG_QUAN_MAX_VI_THE]
        if len(dang_ke) < 2:
            return [], False

        pairs: list[dict] = []
        tinh_duoc = 0
        for i in range(len(dang_ke)):
            for j in range(i + 1, len(dang_ke)):
                a = dang_ke[i]["symbol"]
                b = dang_ke[j]["symbol"]
                he_so = await self._tuong_quan_giua(a, b)
                if he_so is None:
                    continue  # ★ chưa đủ dữ liệu — NOT 0.0
                tinh_duoc += 1
                if he_so > NGUONG_TUONG_QUAN:
                    pairs.append({"a": a, "b": b, "he_so": he_so})
        pairs.sort(key=lambda p: -p["he_so"])
        return pairs, tinh_duoc > 0

    # ── Graduation ────────────────────────────────────

    async def graduate(self, user_id: uuid.UUID) -> dict:
        """Graduate Cấp 8 — only when all 3 nhiệm vụ are done (thực chất ③).

        ★ This closes the 0-8 arc. There is no next level to enter: the FE's
        graduation CTA opens the Hành trình tab, and Cấp 9+ is text only.
        """
        progress = await self._require_progress(user_id)
        snapshot = await self._danh_muc_snapshot(user_id)
        metrics = await self._recompute_progress(user_id, progress, snapshot=snapshot)

        all_tasks_done = all(
            getattr(progress, f"task_{n}_done_at") is not None for n in _TASK_NOS
        )
        if not all_tasks_done:
            raise ConflictError("Chưa hoàn thành đủ 3 nhiệm vụ Cấp 8")

        if progress.graduated_at is None:
            now = datetime.now(UTC)
            progress.graduated_at = now
            entered = progress.entered_at
            if entered.tzinfo is None:
                entered = entered.replace(tzinfo=UTC)
            progress.time_to_graduate_hours = (now - entered).total_seconds() / 3600.0
            await self._session.flush()
            await self._session.refresh(progress)

        return self._progress_payload(progress, metrics)
