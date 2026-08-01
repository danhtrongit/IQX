"""Cấp 7 «Đọc sổ lệnh» service — chỉ số Lực (bands là hằng số công khai), cờ
cảnh giác lệnh treo lớn (heuristic, GIÁO DỤC), bước đọc lực trên
``order_kehoach``, chấm ``doc_luc_dung`` từ giá thật, Thách thức Đọc sổ lệnh.

Cấp 7 is FREE and Thực chiến-only, built on a graduated Cấp 6. It owns
``cap7_progress`` and EXTENDS Cấp 1's ``order_kehoach`` rows in place (new
columns ``luc_chi_so``/``luc_doc_user``/``doc_luc_dung``/``dien_bien_pct``/
``co_canh_giac_lenh_gia``/``hanh_vi_co`` on the same physical table — see
``app.models.cap1``'s "Cấp 7 additions" block). It reuses
``VirtualTradingRepository`` (read-only here) for order lookups, Cấp 5's
``add_trading_days`` for the chấm deadline and Cấp 5's ``get_adjusted_ohlcv``
pattern (holiday-tolerant) for the close.

═══════════════════════════════════════════════════════════════════════════
★★ HONESTY NOTE 1 — ``luc_chi_so`` CANNOT be re-derived server-side ★★
═══════════════════════════════════════════════════════════════════════════
The chỉ số Lực is ``tổng dư MUA (3 mức) / tổng dư BÁN (3 mức)`` read off the
**realtime order book**. That book is a live websocket/quote stream the browser
already holds (``usePrice`` in the trading panel); the server does **not** keep
a tick-by-tick snapshot of the bid/ask ladder, and there is no historical store
it could query at request time to reconstruct what the ladder looked like the
instant the user pressed MUA. So ``luc_chi_so`` arrives from the client and the
server takes it on trust. **We do not pretend otherwise, and we do not fake a
server-side re-derivation.**

Two things — and only these two — keep the graduation metric sound:

  1. **The TIME-LOCK.** ``luc_chi_so`` and ``luc_doc_user`` are committed
     *before the outcome exists*. Once the chấm deadline has passed,
     ``record_kehoach`` REFUSES to change either of them (or the discipline
     flags) — ``ConflictError``, never a silent overwrite. A user therefore
     cannot back-fill a flattering reading after seeing what the price did.
     An identical re-post stays idempotent so a retried network call never 409s.
  2. **``doc_luc_dung`` is scored SERVER-SIDE from real price history** —
     ``SO_PHIEN_CHAM_LUC`` trading sessions after the buy, against the user's
     own fill price, using the same adjusted-OHLCV source the rest of the app
     trusts. The client never supplies the verdict, only the guess.

A wrong ``luc_chi_so`` can therefore only ever mislabel the *band shown back to
the user* — it can never manufacture a passing ``ty_le_doc_luc_dung``, because
the pass/fail comes from prices the client does not control.

═══════════════════════════════════════════════════════════════════════════
★★ HONESTY NOTE 2 — the cờ is EDUCATIONAL, never a detection claim ★★
═══════════════════════════════════════════════════════════════════════════
``co_canh_giac`` flags one order-book level whose volume is abnormally large
versus the others. That is a **shape heuristic on a static snapshot**, nothing
more. Telling a real wall from a spoof needs continuous tick data plus
order-lifetime tracking, which spec §9 puts explicitly out of scope. Nothing
this module returns may say IQX "detected a fake order" or label the current
book "lệnh giả" as a fact — ``COPY_CO_CANH_GIAC`` states the limitation out
loud, and ``test_api_copy_never_claims_fake_order_detection`` scans every
API string for the forbidden phrasings.

``hanh_vi_co = 'mua_duoi_theo'`` is recorded, **never penalised** (spec §5
"không phạt cứng"): its only effect is that the order does not join the
"không đuổi theo cờ" discipline count.

Design notes (documented here since the spec leaves them implicit):

  - **The dead band exists so ``can`` is falsifiable.** See
    ``NGUONG_DEAD_BAND_PCT`` below — without it, "cân bằng" would be a guess
    that can never be wrong, and "cầu mạnh"/"cầu yếu" would be decided by a
    single tick of noise.

  - **Unscoreable orders leave the denominator.** An order whose target
    session's price is unavailable (delisted, data gap, unfilled buy, deadline
    not reached) keeps ``doc_luc_dung IS NULL``. It is **never** counted as
    wrong; it is excluded from ``ty_le_doc_luc_dung`` entirely, and every
    payload carries ``so_lenh_chua_cham`` so the rate can never be mistaken for
    a rate over *all* readings.

  - **Lazy compute-on-read, no cron** (Cấp 5's ``_score_due_decisions``
    pattern): every read of ``/cap7/progress``, ``/cap7/thach-thuc`` (and every
    write) scores whatever has come due, and ``POST /cap7/cham`` exposes the
    same routine explicitly. Idempotent by construction — an already-scored row
    is skipped.

  - **Holiday tolerance** is inherited verbatim from Cấp 5's ``_fetch_close_vnd``:
    ``add_trading_days`` knows Mon-Fri but carries no holiday calendar, so a due
    session can legitimately have no bar. If history clearly runs PAST the due
    date, the last bar inside the window is used; otherwise the order stays
    unscored rather than guessed.

  - **``trong_phien`` comes from the SERVER clock** (``is_trading_session()``).
    The FE must never compute market-open from the browser clock — a user in
    another timezone would get the wrong answer — so it rides on
    ``/cap7/progress`` and on the cheap, re-fetchable ``/cap7/phien``.

  - **Counters.** ``so_lenh_doc_luc`` = the user's Thực chiến ``order_kehoach``
    rows with ``luc_doc_user`` set. Deliberately NOT filtered by ``entered_at``,
    for Cấp 4/5/6's reason: ``luc_doc_user`` can only ever be written by
    ``record_kehoach`` below, which requires a ``Cap7Progress`` row, so any row
    carrying it is inherently Cấp-7-era.

  - **Nhiệm vụ** ① first order that recorded a đọc lực (soft — reading is never
    required to buy, spec §9) · ② first CLOSED round trip whose buy carries a
    đọc lực · ③ all three legs at once. Once a ``task_N_done_at`` is stamped it
    is NEVER un-stamped — Cấp 1-6's pattern.
"""

from __future__ import annotations

import logging
import math
import uuid
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap1 import OrderKehoach, OrderKetso
from app.models.cap6 import Cap6Progress
from app.models.cap7 import (
    BAND_LUC_LABELS,
    HANH_VI_CO_LABELS,
    LUC_DOC_LABELS,
    BandLuc,
    Cap7Progress,
    HanhViCo,
    LucDocUser,
)
from app.models.virtual_trading import OrderSide, OrderStatus, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.ta.data import get_adjusted_ohlcv
from app.services.virtual_trading.price_resolver import is_trading_session
from app.services.virtual_trading.settlement import add_trading_days

logger = logging.getLogger(__name__)

_VN_TZ = timezone(timedelta(hours=7))

_TASK_NOS = (1, 2, 3)


# ══════════════════════════════════════════════════════
# ★ THE DOCUMENTED CONSTANTS
#
# Everything the reading block needs is published by the SERVER (see
# ``phien()``'s ``quy_tac``) so the gauge the user sees, the copy that explains
# it, and the server-side chấm can never drift apart. The FE renders THESE
# numbers; it must not invent its own cut-offs.
# ══════════════════════════════════════════════════════

#: Chỉ số Lực ≥ this → "Cầu áp đảo". 1.5 = dư mua gấp rưỡi dư bán.
#:
#: WHY 1.5: on a 3-level book a 10-20% imbalance is ordinary churn — one
#: institutional order refreshing its quote moves it. 1.5 : 1 is the point at
#: which the imbalance is visible to the naked eye on the ladder itself, which
#: matters here because the user is being taught to READ the ladder, not to
#: trust a number. Spec §4's own worked example (1,240,000 / 640,000 ≈ 1.94 : 1)
#: must read "Cầu áp đảo", which fixes the ceiling; 1.5 leaves that example
#: comfortably inside the band without making "áp đảo" a rare event.
NGUONG_CAU_AP_DAO = 1.5

#: Chỉ số Lực ≤ this → "Cung áp đảo". ★ Deliberately the RECIPROCAL of
#: ``NGUONG_CAU_AP_DAO``: the ratio is multiplicative (2 : 1 and 1 : 2 are the
#: same imbalance mirrored), so a symmetric pair of cut-offs is the only pair
#: that does not make the gauge quietly lean bullish.
NGUONG_CUNG_AP_DAO = 1.0 / NGUONG_CAU_AP_DAO

#: Cờ cảnh giác: one level's volume > this × the MEAN OF THE REMAINING levels.
#: Spec §5's own suggestion, fixed here as a constant.
CO_CANH_GIAC_HE_SO = 3.0

#: Below this many levels the rule stays SILENT. With 2 levels the "mean of the
#: remaining" is a single sample, so any lopsided pair would trip the flag — the
#: rule would cry wolf on a perfectly normal thin book.
CO_CANH_GIAC_MIN_MUC = 3

#: Trading sessions after the buy that count as "diễn biến ngay sau".
#:
#: WHY 2 (spec §4 allows 1-3): 1 session is dominated by the intraday noise of
#: the very session the user bought into — it would grade the fill, not the
#: reading. 3 sessions is long enough for news and sector rotation to swamp the
#: order-book signal entirely, which would grade luck. 2 sessions is the
#: shortest window that clears the entry session while still plausibly carrying
#: the imbalance the user read.
SO_PHIEN_CHAM_LUC = 2

#: |%| inside which the close counts as UNCHANGED, in percentage points.
#:
#: ★ WHY A DEAD BAND MUST EXIST: without one, "cân bằng" is unfalsifiable — the
#: close is essentially never exactly equal to the fill, so ``can`` would be
#: wrong 100% of the time, and ``manh``/``yeu`` would be decided by whichever
#: side of zero a single tick landed on. A dead band makes the three verdicts
#: mutually exclusive AND exhaustive, and makes each of them refutable.
#:
#: WHY 1.0: a HOSE round trip costs roughly 0.25-0.4% in phí + thuế, the tick
#: size alone is ~0.1-0.5% of price for mid-cap names, and HOSE's daily band is
#: ±7%. 1.0 percentage point over 2 sessions is therefore comfortably inside
#: "nothing happened" while staying far below the ±7% ceiling — a move that
#: clears it is a move a trader would actually notice.
NGUONG_DEAD_BAND_PCT = 1.0

# Thách thức Đọc sổ lệnh (spec §2③) — triple condition, ALL must hold at once.
_TASK3_SO_LENH_MIN = 15
_TASK3_KHONG_DUOI_THEO_MIN = 3
#: Deliberately lower than Cấp 5's 70%: reading a live book is noisier than
#: judging one's own process, and a bar the metric cannot honestly clear would
#: teach the user to distrust the level, not the book.
_TASK3_TY_LE_MIN = 55.0

#: The tỷ lệ leg (and the FE's khối ⑯) stay HIDDEN below this many SCORED
#: readings — spec §7's "<3 lệnh đọc lực đã đóng → chỉ đếm, ẩn thống kê".
MIN_DA_CHAM_THONG_KE = 3

#: The cờ copy, spec §5 verbatim. Heuristic and honest: it says a big resting
#: order MAY not be real, and never that IQX found one that isn't.
COPY_CO_CANH_GIAC = (
    "Lệnh treo to chưa chắc là cầu/cung thật — đôi khi là 'kê giá' rồi rút. "
    "Chờ nó KHỚP THẬT rồi hãy tin."
)

#: Spec §4's closed-market copy, verbatim (the FE shows this instead of the
#: guess UI — a static book cannot be read for lực).
COPY_NGOAI_GIO = (
    "Sổ lệnh chỉ sống trong giờ giao dịch — quay lại lúc thị trường mở để đọc lực."
)

COPY_TRONG_GIO = (
    "Sổ lệnh đang sống: chỉ số Lực là ảnh chụp 3 mức dư mua / dư bán ngay lúc "
    "bạn nhìn, và nó đổi liên tục trong phiên — đọc để chọn thời điểm, đừng coi "
    "là dự báo."
)

#: What the Kết sổ shows for an order that never recorded a đọc lực.
#: ★ Deliberately NOT phrased as a shortcoming: reading the book is never a
#: precondition for buying (spec §9), and orders placed before Cấp 7 existed
#: have all-null columns by design.
COPY_CHUA_DOC_LUC = (
    "Lệnh này chưa ghi bước đọc lực — sổ lệnh chỉ đọc được trong giờ giao dịch, "
    "và đọc lực không bao giờ là điều kiện bắt buộc để mua."
)

GIO_GIAO_DICH_TEXT = (
    "Giờ giao dịch: 09:00–11:30 (phiên sáng) và 13:00–14:45 (phiên chiều), "
    "các ngày trong tuần."
)

_LUC_VALUES = frozenset(m.value for m in LucDocUser)
_HANH_VI_VALUES = frozenset(m.value for m in HanhViCo)

_BAND_DIEU_KIEN: dict[str, str] = {
    BandLuc.CAU_AP_DAO.value: f"Lực ≥ {NGUONG_CAU_AP_DAO:.2f} : 1",
    BandLuc.CAN_BANG.value: (
        f"{NGUONG_CUNG_AP_DAO:.2f} : 1 < Lực < {NGUONG_CAU_AP_DAO:.2f} : 1"
    ),
    BandLuc.CUNG_AP_DAO.value: f"Lực ≤ {NGUONG_CUNG_AP_DAO:.2f} : 1",
}

_BAND_GIAI_THICH: dict[str, str] = {
    BandLuc.CAU_AP_DAO.value: (
        "Tổng dư MUA 3 mức đang lớn hơn tổng dư BÁN ít nhất "
        f"{NGUONG_CAU_AP_DAO:.1f} lần — bên mua xếp hàng dày hơn hẳn ngay lúc "
        "này. Đây là ảnh chụp tức thời của sổ lệnh, không phải dự báo giá."
    ),
    BandLuc.CAN_BANG.value: (
        "Dư mua và dư bán 3 mức xấp xỉ nhau — sổ lệnh không nghiêng về bên nào "
        "đủ rõ để đọc thành tín hiệu. Chênh lệch nhỏ trong khoảng này phần lớn "
        "là dao động bình thường."
    ),
    BandLuc.CUNG_AP_DAO.value: (
        "Tổng dư BÁN 3 mức đang lớn hơn tổng dư MUA ít nhất "
        f"{NGUONG_CAU_AP_DAO:.1f} lần — bên bán xếp hàng dày hơn hẳn ngay lúc "
        "này. Vẫn là ảnh chụp tức thời, không phải dự báo giá."
    ),
}

CHAM_GIAI_THICH = (
    f"Sau {SO_PHIEN_CHAM_LUC} phiên giao dịch kể từ ngày bạn mua, hệ lấy giá "
    "đóng cửa THẬT của phiên đó và so với giá bạn khớp: tăng quá "
    f"{NGUONG_DEAD_BAND_PCT:.1f}% thì đọc \"Cầu mạnh\" là đúng, giảm quá "
    f"{NGUONG_DEAD_BAND_PCT:.1f}% thì \"Cầu yếu\" là đúng, nằm trong "
    f"±{NGUONG_DEAD_BAND_PCT:.1f}% thì \"Cân bằng\" là đúng. Lệnh nào chưa lấy "
    "được giá phiên đó thì để trống — không bao giờ bị tính là đọc sai."
)


# ══════════════════════════════════════════════════════
# Pure rules (public so the tests — and any future tooling — read the SAME
# functions the service writes with; the two can never drift)
# ══════════════════════════════════════════════════════


def band_luc(ratio: float | None) -> str | None:
    """The gauge band a chỉ số Lực falls in, or ``None`` when it is unreadable.

    ``None`` for a missing, non-finite or non-positive ratio: an empty book, a
    zero dư bán (divide-by-zero) or a corrupted value must never be rendered as
    a fabricated band — the honest answer is "sổ lệnh quá mỏng để đọc".
    """
    if ratio is None:
        return None
    try:
        value = float(ratio)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(value) or value <= 0:
        return None
    if value >= NGUONG_CAU_AP_DAO:
        return BandLuc.CAU_AP_DAO.value
    if value <= NGUONG_CUNG_AP_DAO:
        return BandLuc.CUNG_AP_DAO.value
    return BandLuc.CAN_BANG.value


def doc_luc_dung_rule(luc_doc_user: str, dien_bien_pct: float) -> bool:
    """Was the user's reading right, given the % move ``SO_PHIEN_CHAM_LUC``
    phiên later?

    The three verdicts partition the real line around ``NGUONG_DEAD_BAND_PCT``:
    ``manh`` only above it, ``yeu`` only below its negative, ``can`` only inside
    it (boundaries INCLUDED, so every possible outcome is scored for exactly one
    guess — no move escapes and none counts twice).
    """
    if luc_doc_user == LucDocUser.MANH.value:
        return dien_bien_pct > NGUONG_DEAD_BAND_PCT
    if luc_doc_user == LucDocUser.YEU.value:
        return dien_bien_pct < -NGUONG_DEAD_BAND_PCT
    if luc_doc_user == LucDocUser.CAN.value:
        return abs(dien_bien_pct) <= NGUONG_DEAD_BAND_PCT
    return False


def co_canh_giac(volumes: Sequence[float]) -> int | None:
    """Index of the order-book level whose volume is abnormally large versus the
    others, or ``None`` when the rule stays silent.

    Rule (spec §5, fixed as constants above): one level's volume >
    ``CO_CANH_GIAC_HE_SO`` × the MEAN OF THE REMAINING levels, applied across
    the bid + ask levels together. Only the largest level can ever trip it (its
    ratio to the mean of the rest dominates every other level's), so the answer
    is unambiguous and the copy can name the price that tripped it.

    Silent — never a guess — when:
      · there are fewer than ``CO_CANH_GIAC_MIN_MUC`` levels (the "mean of the
        remaining" would be one or zero samples);
      · the remaining levels have no volume at all (nothing to compare against).

    ★ A hit means "look twice", NOT "this is a fake order" — see HONESTY NOTE 2.
    """
    values = [float(v) for v in volumes]
    n = len(values)
    if n < CO_CANH_GIAC_MIN_MUC:
        return None
    peak = max(range(n), key=lambda i: values[i])
    con_lai = [v for i, v in enumerate(values) if i != peak]
    trung_binh = sum(con_lai) / len(con_lai)
    if trung_binh <= 0:
        return None
    if values[peak] > CO_CANH_GIAC_HE_SO * trung_binh:
        return peak
    return None


def han_cham_luc_date(trading_date: date) -> date:
    """The session a đọc lực is scored against — ``SO_PHIEN_CHAM_LUC`` trading
    sessions after the buy's trading date.

    Uses the repo's existing Mon-Fri trading-day helper (no holiday calendar —
    see the module docstring's holiday-tolerance note).
    """
    return add_trading_days(trading_date, SO_PHIEN_CHAM_LUC, set())


async def _fetch_close_vnd(symbol: str, bought_on: date, target: date) -> float | None:
    """Adjusted close for ``target`` (VND), or ``None`` when the price history
    for that session is unavailable.

    Fail-soft on purpose: an unavailable price leaves the reading UNSCORED
    rather than guessed. Mirrors ``app.services.cap5.service._fetch_close_vnd``
    including its holiday-tolerant fallback.
    """
    try:
        data, _start_index = await get_adjusted_ohlcv(
            symbol, bought_on, target + timedelta(days=7)
        )
    except Exception as exc:  # noqa: BLE001 — any source failure ⇒ leave unscored
        logger.debug("Cấp 7: no price history for %s @ %s: %s", symbol, target, exc)
        return None

    times: list[str] = list(data.time)
    target_iso = target.isoformat()
    bought_iso = bought_on.isoformat()

    for i, t in enumerate(times):
        if t == target_iso:
            return float(data.close[i])

    # The due session has no bar. Only fall back if history clearly runs PAST
    # it (so this is a holiday inside a complete window, not missing data).
    if not any(t > target_iso for t in times):
        return None
    inside = [i for i, t in enumerate(times) if bought_iso < t < target_iso]
    if not inside:
        return None
    return float(data.close[inside[-1]])


def _pct_text(pct: float) -> str:
    """A signed percent using the typographic minus (U+2212) for negatives, per
    the program-wide number rule."""
    if pct < 0:
        return f"−{abs(pct):.1f}%"
    return f"+{pct:.1f}%"


class Cap7Service:
    """Business logic for the free Cấp 7 «Đọc sổ lệnh» flow."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._vt_repo = VirtualTradingRepository(session)

    # ── Progress row ─────────────────────────────────

    async def _get_progress_row(self, user_id: uuid.UUID) -> Cap7Progress | None:
        result = await self._session.execute(
            select(Cap7Progress).where(Cap7Progress.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def _require_progress(self, user_id: uuid.UUID) -> Cap7Progress:
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 7")
        return progress

    async def get_progress(self, user_id: uuid.UUID) -> dict | None:
        """``GET /cap7/progress`` — the row + the derived fields the columns do
        not hold (``trong_phien`` from the SERVER clock, and how many readings
        are scored vs still waiting). Scores whatever has come due first."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            return None
        metrics = await self._recompute_progress(user_id, progress)
        return self._progress_payload(progress, metrics)

    async def enter(self, user_id: uuid.UUID) -> dict:
        """Enter Cấp 7 (idempotent). Requires the user to have graduated Cấp 6."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            cap6_result = await self._session.execute(
                select(Cap6Progress).where(Cap6Progress.user_id == user_id)
            )
            cap6_progress = cap6_result.scalar_one_or_none()
            if cap6_progress is None:
                raise NotFoundError("tiến trình Cấp 6")
            if cap6_progress.graduated_at is None:
                raise ConflictError("Chưa tốt nghiệp Cấp 6")

            progress = Cap7Progress(user_id=user_id, entered_at=datetime.now(UTC))
            self._session.add(progress)
            await self._session.flush()
            await self._session.refresh(progress)

        metrics = await self._recompute_progress(user_id, progress)
        return self._progress_payload(progress, metrics)

    # ── Giờ giao dịch + hằng số công khai (§4/§5) ─────

    @staticmethod
    def quy_tac() -> dict:
        """Every Cấp 7 constant the reading block needs, in one payload.

        ★ Published so the FE renders the SERVER's thresholds instead of
        inventing its own — the only way the gauge, the copy that explains it and
        the server-side chấm are guaranteed to agree.
        """
        return {
            "nguong_cau_ap_dao": NGUONG_CAU_AP_DAO,
            "nguong_cung_ap_dao": NGUONG_CUNG_AP_DAO,
            "bands": [
                {
                    "ma": ma,
                    "ten": BAND_LUC_LABELS[ma],
                    "dieu_kien_text": _BAND_DIEU_KIEN[ma],
                    "giai_thich": _BAND_GIAI_THICH[ma],
                }
                for ma in (m.value for m in BandLuc)
            ],
            "co_canh_giac_he_so": CO_CANH_GIAC_HE_SO,
            "co_canh_giac_min_muc": CO_CANH_GIAC_MIN_MUC,
            "co_canh_giac_copy": COPY_CO_CANH_GIAC,
            "so_phien_cham": SO_PHIEN_CHAM_LUC,
            "dead_band_pct": NGUONG_DEAD_BAND_PCT,
            "cham_giai_thich": CHAM_GIAI_THICH,
        }

    async def phien(self, user_id: uuid.UUID) -> dict:
        """``GET /cap7/phien`` — cheap and re-fetchable.

        ★ ``trong_phien`` is the SERVER's own ``is_trading_session()``. The panel
        can stay open across the 11:30 boundary, so the FE must be able to
        refresh this independently of ``/cap7/progress`` — and it must never
        compute market-open from the browser clock.
        """
        await self._require_progress(user_id)
        trong_phien = bool(is_trading_session())
        return {
            "trong_phien": trong_phien,
            "gio_giao_dich_text": GIO_GIAO_DICH_TEXT,
            "giai_thich": COPY_TRONG_GIO if trong_phien else COPY_NGOAI_GIO,
            "quy_tac": self.quy_tac(),
        }

    # ── Bước đọc lực (spec §4/§5) ─────────────────────

    async def _get_kehoach_by_order(self, order_id: uuid.UUID) -> OrderKehoach | None:
        result = await self._session.execute(
            select(OrderKehoach).where(OrderKehoach.order_id == order_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    def _validate_reading(
        luc_chi_so: float,
        luc_doc_user: str | None,
        co_canh_giac_lenh_gia: bool,
        hanh_vi_co: str | None,
    ) -> float:
        """Validate the đọc-lực payload, returning the cleaned ratio.

        ``luc_chi_so`` must be finite and > 0 — the FE is required to send
        ``null`` (and skip the step) rather than ``Infinity`` when tổng dư bán is
        0, so a non-finite value here means a broken client, not a thin book.
        """
        try:
            ratio = float(luc_chi_so)
        except (TypeError, ValueError) as exc:
            raise BadRequestError("luc_chi_so phải là một số") from exc
        if not math.isfinite(ratio) or ratio <= 0:
            raise BadRequestError(
                "luc_chi_so phải là số hữu hạn và lớn hơn 0 (sổ lệnh không đọc "
                "được thì bỏ qua bước đọc lực, đừng gửi 0 hay vô cực)"
            )
        if luc_doc_user not in _LUC_VALUES:
            raise BadRequestError("luc_doc_user phải là 'manh', 'can' hoặc 'yeu'")
        if hanh_vi_co is not None and hanh_vi_co not in _HANH_VI_VALUES:
            raise BadRequestError("hanh_vi_co phải là 'cho_xac_nhan' hoặc 'mua_duoi_theo'")
        # ★ non-null IFF the cờ was shown — the inconsistent combination is
        # REJECTED, never silently normalised: a behaviour recorded against a cờ
        # that never appeared (or a cờ with no recorded behaviour) would corrupt
        # the "không đuổi theo cờ" discipline count in opposite directions.
        if co_canh_giac_lenh_gia and hanh_vi_co is None:
            raise BadRequestError(
                "Có cờ cảnh giác thì phải ghi bạn đã làm gì (hanh_vi_co)"
            )
        if not co_canh_giac_lenh_gia and hanh_vi_co is not None:
            raise BadRequestError(
                "Không có cờ cảnh giác thì không được ghi hanh_vi_co"
            )
        return ratio

    @staticmethod
    def _same_reading(
        kehoach: OrderKehoach,
        ratio: float,
        luc_doc_user: str,
        co_canh_giac_lenh_gia: bool,
        hanh_vi_co: str | None,
    ) -> bool:
        """Is this re-post byte-for-byte the reading already stored? (A retried
        network call must be a no-op, not a 409.)"""
        stored = kehoach.luc_chi_so
        if stored is None:
            return False
        # 1e-6 matches the column's Numeric(18, 6) precision exactly.
        if not math.isclose(float(stored), ratio, rel_tol=0.0, abs_tol=1e-6):
            return False
        return (
            kehoach.luc_doc_user == luc_doc_user
            and bool(kehoach.co_canh_giac_lenh_gia) is bool(co_canh_giac_lenh_gia)
            and kehoach.hanh_vi_co == hanh_vi_co
        )

    async def record_kehoach(
        self,
        user_id: uuid.UUID,
        order_id: uuid.UUID,
        *,
        luc_chi_so: float,
        luc_doc_user: str | None,
        co_canh_giac_lenh_gia: bool = False,
        hanh_vi_co: str | None = None,
    ) -> OrderKehoach:
        """Adds the "Đọc sổ lệnh" block to the EXISTING ``order_kehoach`` row
        created by Cấp 1's ``/cap1/kehoach`` (Cấp 2's SL/TP, Cấp 3's quản lý vốn,
        Cấp 4's đọc-5-lớp and Cấp 6's đối chiếu are filled first; Cấp 7 only
        inserts this block — spec §4's "thêm lớp phủ đọc, KHÔNG dựng lại sổ").
        404 when that row is absent, the same convention as Cấp 2-6.

        ★ ``luc_chi_so`` is the ONLY client-computed number Cấp 7 accepts, and
        the server cannot re-derive it — see HONESTY NOTE 1 in the module
        docstring. The TIME-LOCK below is what makes that acceptable:

        Re-submitting is allowed **while the chấm deadline has not passed** (the
        panel is a form the user can step back in). Once
        ``han_cham_luc_date(trading_date)`` has arrived, the outcome exists, so a
        re-post that CHANGES the reading is rejected with 409 — the guess can
        never be back-filled to match what the price did. An identical re-post
        stays idempotent.
        """
        progress = await self._require_progress(user_id)

        order = await self._vt_repo.get_order_by_id(order_id)
        if order is None or order.user_id != user_id:
            raise NotFoundError("lệnh")
        if order.side != OrderSide.BUY:
            raise BadRequestError("Bước đọc lực chỉ ghi cho lệnh MUA")

        ratio = self._validate_reading(
            luc_chi_so, luc_doc_user, co_canh_giac_lenh_gia, hanh_vi_co
        )
        assert luc_doc_user is not None  # narrowed by _validate_reading

        kehoach = await self._get_kehoach_by_order(order_id)
        if kehoach is None:
            raise NotFoundError("kế hoạch Cấp 1 — cần ghi vùng mua trước")

        # ★ THE TIME-LOCK (see the docstring above).
        if kehoach.luc_doc_user is not None:
            today_vn = datetime.now(_VN_TZ).date()
            da_toi_han = han_cham_luc_date(order.trading_date) <= today_vn
            same = self._same_reading(
                kehoach, ratio, luc_doc_user, co_canh_giac_lenh_gia, hanh_vi_co
            )
            if same:
                return kehoach
            if da_toi_han:
                raise ConflictError(
                    "Lệnh này đã qua hạn chấm đọc lực — không sửa được nữa. Chỉ "
                    "số Lực và phần bạn đọc phải được chốt TRƯỚC khi biết giá đi "
                    "đâu, đó là điều làm thống kê đọc lực có nghĩa."
                )

        kehoach.luc_chi_so = ratio
        kehoach.luc_doc_user = luc_doc_user
        kehoach.co_canh_giac_lenh_gia = bool(co_canh_giac_lenh_gia)
        kehoach.hanh_vi_co = hanh_vi_co
        await self._session.flush()
        await self._session.refresh(kehoach)

        # ``score=False``: this is the buy panel's critical path. Scoring is
        # compute-on-READ (see ``_score_due_orders``) — firing N price fetches
        # here would add network latency to placing an order, and the reading
        # just written cannot possibly be due yet.
        await self._recompute_progress(user_id, progress, score=False)
        return kehoach

    @staticmethod
    def kehoach_out(kehoach: OrderKehoach) -> dict:
        """Serialize the đọc-lực block for the API (adds the derived band + the
        labels the FE renders — never stored twice) plus the §C12c one-sentence
        explanation of what was recorded and how it will be judged."""
        ratio = float(kehoach.luc_chi_so) if kehoach.luc_chi_so is not None else None
        band = band_luc(ratio)
        doc = kehoach.luc_doc_user
        doc_ten = LUC_DOC_LABELS.get(doc or "") or None
        hanh_vi = kehoach.hanh_vi_co
        hanh_vi_ten = HANH_VI_CO_LABELS.get(hanh_vi or "") or None

        if ratio is None or doc is None:
            giai_thich = COPY_CHUA_DOC_LUC
        else:
            band_ten = BAND_LUC_LABELS.get(band or "") or "không đọc được"
            phan = [
                f"Lúc mua: Lực = {ratio:.2f} : 1 ({band_ten}) · bạn đọc "
                f"\"{doc_ten}\"."
            ]
            if kehoach.doc_luc_dung is None:
                phan.append(
                    f"Sẽ chấm sau {SO_PHIEN_CHAM_LUC} phiên giao dịch bằng giá "
                    "đóng cửa thật — hiện chưa có kết luận."
                )
            else:
                pct = kehoach.dien_bien_pct
                pct_text = _pct_text(pct) if pct is not None else "—"
                ket = "ĐÚNG" if kehoach.doc_luc_dung else "CHƯA ĐÚNG"
                phan.append(
                    f"Diễn biến {SO_PHIEN_CHAM_LUC} phiên sau: {pct_text} → đọc "
                    f"lực {ket} (ngoài ±{NGUONG_DEAD_BAND_PCT:.1f}% mới tính là "
                    "có hướng)."
                )
            if kehoach.co_canh_giac_lenh_gia and hanh_vi_ten:
                phan.append(
                    f"Có cờ cảnh giác lệnh treo lớn — bạn chọn: {hanh_vi_ten}. "
                    "Cờ chỉ nhắc nhìn kỹ, không kết luận gì về lệnh treo đó."
                )
            giai_thich = " ".join(phan)

        return {
            "id": kehoach.id,
            "order_id": kehoach.order_id,
            "luc_chi_so": ratio,
            "luc_band": band,
            "luc_band_ten": BAND_LUC_LABELS.get(band or "") or None,
            "luc_doc_user": doc,
            "luc_doc_user_ten": doc_ten,
            "doc_luc_dung": kehoach.doc_luc_dung,
            "dien_bien_pct": kehoach.dien_bien_pct,
            "co_canh_giac_lenh_gia": kehoach.co_canh_giac_lenh_gia,
            "hanh_vi_co": hanh_vi,
            "hanh_vi_co_ten": hanh_vi_ten,
            "so_phien_cham": SO_PHIEN_CHAM_LUC,
            "giai_thich": giai_thich,
        }

    # ── Đọc lại đọc lực của MỘT lệnh (Kết sổ) ──────────

    async def get_kehoach(self, user_id: uuid.UUID, order_id: uuid.UUID) -> dict:
        """``GET /cap7/kehoach/{order_id}`` — the đọc-lực block recorded on one
        order + the scoring context the Kết sổ needs to explain it.

        ★ **This read RUNS THE CHẤM.** ``doc_luc_dung`` is computed server-side
        ``SO_PHIEN_CHAM_LUC`` phiên after the buy, so a Kết sổ that only ever read
        stored columns could never show a scored reading — it would say "chưa tới
        hạn chấm" forever. This calls the SAME ``_recompute_progress`` pass every
        other Cấp 7 read calls (which runs ``_score_due_orders``), so opening the
        Kết sổ after the window returns a scored result. Nothing is duplicated and
        nothing extra is written: an already-scored row is skipped, and a row that
        cannot be scored stays NULL.

        ★ ``doc_luc_dung`` keeps THREE states and this endpoint never collapses
        them: ``True`` đọc đúng · ``False`` đọc sai · ``None`` chưa tới hạn chấm
        hoặc chưa lấy được giá phiên đó. ``da_toi_han_cham`` tells the two ``None``
        cases apart.

        Ownership: a foreign or unknown ``order_id`` is 404 (never 403) —
        ``record_kehoach``'s convention. An order with NO Cấp 7 data is a normal
        200 carrying ``co_du_lieu = False``, so the FE can tell "lệnh có trước
        Cấp 7" apart from "endpoint hỏng".
        """
        progress = await self._require_progress(user_id)
        order = await self._vt_repo.get_order_by_id(order_id)
        if order is None or order.user_id != user_id:
            raise NotFoundError("lệnh")

        # Lazy compute-on-read, the shared path (see the module docstring).
        await self._recompute_progress(user_id, progress)

        kehoach = await self._get_kehoach_by_order(order_id)
        return self.kehoach_detail_out(kehoach, order=order)

    @staticmethod
    def kehoach_detail_out(
        kehoach: OrderKehoach | None, *, order: VirtualOrder
    ) -> dict:
        """``kehoach_out`` + the scoring context: số phiên chấm, dead band, the
        session the reading is judged against, and whether that session has
        arrived.

        ``han_cham_ngay``/``da_toi_han_cham`` are DERIVED for display only (the FE
        cannot compute them — they need trading-day arithmetic and the server's
        own clock). Nothing here writes.
        """
        if kehoach is None:
            base: dict = {
                "id": None,
                "order_id": order.id,
                "luc_chi_so": None,
                "luc_band": None,
                "luc_band_ten": None,
                "luc_doc_user": None,
                "luc_doc_user_ten": None,
                "doc_luc_dung": None,
                "dien_bien_pct": None,
                "co_canh_giac_lenh_gia": None,
                "hanh_vi_co": None,
                "hanh_vi_co_ten": None,
                "so_phien_cham": SO_PHIEN_CHAM_LUC,
                "giai_thich": COPY_CHUA_DOC_LUC,
            }
        else:
            base = Cap7Service.kehoach_out(kehoach)

        han = han_cham_luc_date(order.trading_date) if order.trading_date else None
        return {
            **base,
            "symbol": order.symbol,
            # ``luc_doc_user`` is the column that marks a recorded reading — the
            # same predicate ``_doc_luc_rows`` filters on.
            "co_du_lieu": base["luc_doc_user"] is not None,
            "dead_band_pct": NGUONG_DEAD_BAND_PCT,
            "han_cham_ngay": han,
            "da_toi_han_cham": bool(
                han is not None and han <= datetime.now(_VN_TZ).date()
            ),
        }

    # ── Source rows ───────────────────────────────────

    async def _doc_luc_rows(
        self, user_id: uuid.UUID
    ) -> list[tuple[OrderKehoach, VirtualOrder]]:
        """``order_kehoach`` rows that recorded a đọc lực, with their BUY order
        (see the module docstring for why there is no ``entered_at`` filter)."""
        result = await self._session.execute(
            select(OrderKehoach, VirtualOrder)
            .join(VirtualOrder, VirtualOrder.id == OrderKehoach.order_id)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.mode == "thuc_chien",
                OrderKehoach.luc_doc_user.is_not(None),
            )
            .order_by(VirtualOrder.created_at.asc())
        )
        return [(kehoach, order) for kehoach, order in result.all()]

    async def _closed_pairs(
        self, user_id: uuid.UUID
    ) -> list[tuple[OrderKehoach, OrderKetso]]:
        """Every closed round trip whose BUY carries a Cấp 7 đọc lực, paired with
        its ``order_ketso`` outcome (pairing rule = Cấp 1's, mirrored exactly as
        Cấp 4/6 mirror it: the most recent FILLED buy for the same
        account+symbol at/before the sell)."""
        kehoach_rows = await self._doc_luc_rows(user_id)
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

    # ── Chấm "đọc lực đúng" — SERVER-side, from real prices ──

    async def _score_due_orders(self, user_id: uuid.UUID) -> int:
        """Score every unscored đọc lực whose ``SO_PHIEN_CHAM_LUC`` phiên have
        elapsed. Returns how many were newly scored.

        ★ Three ways an order is SKIPPED rather than judged — none of them ever
        counts as "đọc sai":
          · the buy never filled (no reference price to compare against);
          · the chấm deadline has not arrived (the outcome does not exist yet);
          · the target session's price is unavailable (data gap / delisting).
        Skipped orders keep ``doc_luc_dung IS NULL``, stay out of
        ``ty_le_doc_luc_dung``'s denominator, are counted in
        ``so_lenh_chua_cham``, and are retried on the next read.
        """
        rows = await self._doc_luc_rows(user_id)
        today_vn = datetime.now(_VN_TZ).date()
        scored = 0
        for kehoach, order in rows:
            if kehoach.doc_luc_dung is not None:
                continue  # already scored — idempotent
            if order.status != OrderStatus.FILLED or not order.filled_price_vnd:
                continue
            gia_mua = float(order.filled_price_vnd)
            if gia_mua <= 0:
                continue
            target = han_cham_luc_date(order.trading_date)
            if target > today_vn:
                continue  # chưa tới hạn
            gia_sau = await _fetch_close_vnd(order.symbol, order.trading_date, target)
            if gia_sau is None:
                continue  # ★ unavailable ⇒ unscored, never "wrong"
            pct = (gia_sau - gia_mua) / gia_mua * 100.0
            kehoach.dien_bien_pct = pct
            kehoach.doc_luc_dung = doc_luc_dung_rule(kehoach.luc_doc_user or "", pct)
            scored += 1
        if scored:
            await self._session.flush()
        return scored

    async def cham(self, user_id: uuid.UUID) -> dict:
        """``POST /cap7/cham`` — the same lazy scoring pass every read performs,
        exposed explicitly. Idempotent: a second call scores 0."""
        progress = await self._require_progress(user_id)
        so_moi_cham = await self._score_due_orders(user_id)
        metrics = await self._recompute_progress(user_id, progress)
        return {
            "so_moi_cham": so_moi_cham,
            "so_lenh_doc_luc": metrics["so_lenh_doc_luc"],
            "so_lenh_da_cham": metrics["so_lenh_da_cham"],
            "so_lenh_chua_cham": metrics["so_lenh_chua_cham"],
            "ty_le_doc_luc_dung": metrics["ty_le_doc_luc_dung"],
            "so_phien_cham": SO_PHIEN_CHAM_LUC,
            "giai_thich": CHAM_GIAI_THICH,
        }

    # ── Metrics + recompute + 3 nhiệm vụ ──────────────

    async def _compute_metrics(self, user_id: uuid.UUID) -> dict:
        rows = await self._doc_luc_rows(user_id)
        da_cham = [kehoach for kehoach, _order in rows if kehoach.doc_luc_dung is not None]
        so_dung = sum(1 for kehoach in da_cham if kehoach.doc_luc_dung)
        # ★ The denominator is SCORED readings only — an order whose price
        # history is unavailable left it, and never counted as wrong.
        ty_le = (so_dung / len(da_cham) * 100.0) if da_cham else 0.0

        pairs = await self._closed_pairs(user_id)

        return {
            "so_lenh_doc_luc": len(rows),
            "so_lenh_da_cham": len(da_cham),
            "so_lenh_chua_cham": len(rows) - len(da_cham),
            "so_lenh_doc_dung": so_dung,
            "ty_le_doc_luc_dung": ty_le,
            "so_lan_gap_co": sum(
                1 for kehoach, _order in rows if kehoach.co_canh_giac_lenh_gia
            ),
            "so_lan_khong_duoi_theo_co": sum(
                1
                for kehoach, _order in rows
                if kehoach.co_canh_giac_lenh_gia
                and kehoach.hanh_vi_co == HanhViCo.CHO_XAC_NHAN.value
            ),
            "so_lan_mua_duoi_theo": sum(
                1
                for kehoach, _order in rows
                if kehoach.hanh_vi_co == HanhViCo.MUA_DUOI_THEO.value
            ),
            "so_lenh_da_ket_so": len(pairs),
        }

    async def _recompute_progress(
        self, user_id: uuid.UUID, progress: Cap7Progress, *, score: bool = True
    ) -> dict:
        """Recompute every derived counter + the 3 nhiệm vụ.

        ``score=False`` skips the price-fetching pass — used only by
        ``record_kehoach``, whose newly written reading cannot be due yet and
        which runs on the buy panel's critical path.
        """
        if score:
            await self._score_due_orders(user_id)
        metrics = await self._compute_metrics(user_id)

        progress.so_lenh_doc_luc = metrics["so_lenh_doc_luc"]
        progress.so_lan_khong_duoi_theo_co = metrics["so_lan_khong_duoi_theo_co"]
        progress.ty_le_doc_luc_dung = metrics["ty_le_doc_luc_dung"]

        now = datetime.now(UTC)

        # ① lệnh đầu có đọc lực — SOFT, never a gate on MUA (spec §9).
        if progress.task_1_done_at is None and metrics["so_lenh_doc_luc"] >= 1:
            progress.task_1_done_at = now

        # ② Kết sổ đầu Cấp 7 = lệnh đầu tiên CÓ ĐỌC LỰC đã đóng.
        if progress.task_2_done_at is None and metrics["so_lenh_da_ket_so"] >= 1:
            progress.task_2_done_at = now

        # ③ Thách thức Đọc sổ lệnh — triple condition, NOT gated.
        if progress.task_3_done_at is None and self._task3_legs(metrics)["dat_ca_3"]:
            progress.task_3_done_at = now

        await self._session.flush()
        await self._session.refresh(progress)
        return metrics

    @staticmethod
    def _task3_legs(metrics: dict) -> dict:
        """The 3 legs of nhiệm vụ ③ (spec §2③) — ALL must hold at once.

        The tỷ lệ leg needs ≥``MIN_DA_CHAM_THONG_KE`` SCORED readings before it
        can pass: below that it is "chưa đủ dữ liệu" — neither a free pass nor a
        mark against the user (spec §7).
        """
        so_lenh_dat = metrics["so_lenh_doc_luc"] >= _TASK3_SO_LENH_MIN
        co_dat = metrics["so_lan_khong_duoi_theo_co"] >= _TASK3_KHONG_DUOI_THEO_MIN
        du_du_lieu = metrics["so_lenh_da_cham"] >= MIN_DA_CHAM_THONG_KE
        ty_le_dat = du_du_lieu and metrics["ty_le_doc_luc_dung"] >= _TASK3_TY_LE_MIN
        return {
            "so_lenh_dat": so_lenh_dat,
            "co_dat": co_dat,
            "ty_le_du_du_lieu": du_du_lieu,
            "ty_le_dat": ty_le_dat,
            "dat_ca_3": so_lenh_dat and co_dat and ty_le_dat,
        }

    def _progress_payload(self, progress: Cap7Progress, metrics: dict) -> dict:
        """The stored row + the three DERIVED fields the columns do not hold.

        ``so_lenh_chua_cham`` is part of the contract, not decoration: the rate
        is computed over scored readings only, so a payload without it would let
        the FE present it as a rate over everything.
        """
        return {
            "id": progress.id,
            "user_id": progress.user_id,
            "entered_at": progress.entered_at,
            "task_1_done_at": progress.task_1_done_at,
            "task_2_done_at": progress.task_2_done_at,
            "task_3_done_at": progress.task_3_done_at,
            "so_lenh_doc_luc": progress.so_lenh_doc_luc,
            "so_lan_khong_duoi_theo_co": progress.so_lan_khong_duoi_theo_co,
            "ty_le_doc_luc_dung": progress.ty_le_doc_luc_dung,
            "graduated_at": progress.graduated_at,
            "time_to_graduate_hours": progress.time_to_graduate_hours,
            # ── derived (never stored) ──
            "trong_phien": bool(is_trading_session()),
            "so_lenh_da_cham": metrics["so_lenh_da_cham"],
            "so_lenh_chua_cham": metrics["so_lenh_chua_cham"],
            "so_lan_gap_co": metrics["so_lan_gap_co"],
            "so_lan_mua_duoi_theo": metrics["so_lan_mua_duoi_theo"],
            "so_phien_cham": SO_PHIEN_CHAM_LUC,
        }

    async def mark_task(self, user_id: uuid.UUID, task_no: int) -> dict:
        """``PATCH /cap7/task`` — all 3 nhiệm vụ are derived from
        ``order_kehoach``/``order_ketso``, so this just triggers a recompute pass
        (idempotent, never sets a task the history does not support)."""
        if task_no not in _TASK_NOS:
            raise BadRequestError("task_no không hợp lệ")
        progress = await self._require_progress(user_id)
        metrics = await self._recompute_progress(user_id, progress)
        return self._progress_payload(progress, metrics)

    # ── Thách thức Đọc sổ lệnh — GET /cap7/thach-thuc ──

    async def thach_thuc(self, user_id: uuid.UUID) -> dict:
        """3 sub-conditions of nhiệm vụ ③ + current values + giải thích each
        (feeds the §C12c display — never a bare number). Recomputed server-side
        on read; the stored aggregates are never trusted."""
        progress = await self._require_progress(user_id)
        metrics = await self._recompute_progress(user_id, progress)
        legs = self._task3_legs(metrics)

        da_cham = metrics["so_lenh_da_cham"]
        chua_cham = metrics["so_lenh_chua_cham"]
        chua_cham_text = (
            f" Còn {chua_cham} lệnh chưa chấm được (chưa tới hạn hoặc chưa lấy "
            "được giá phiên đó) — những lệnh đó không nằm trong mẫu số và không "
            "bị tính là đọc sai."
            if chua_cham
            else ""
        )

        if not legs["ty_le_du_du_lieu"]:
            ty_le_giai_thich = (
                f"Mới có {da_cham} lệnh đọc lực đã chấm — cần ít nhất "
                f"{MIN_DA_CHAM_THONG_KE} lệnh đã chấm thì tỷ lệ mới nói được gì, "
                "nên IQX chỉ đếm và chưa hiện thống kê." + chua_cham_text
            )
        else:
            ty_le_giai_thich = (
                f"Đọc lực đúng: {metrics['ty_le_doc_luc_dung']:.0f}% "
                f"(đoán khớp diễn biến {metrics['so_lenh_doc_dung']}/{da_cham} "
                f"lệnh đã chấm sau {SO_PHIEN_CHAM_LUC} phiên; mục tiêu ≥ "
                f"{_TASK3_TY_LE_MIN:.0f}%)." + chua_cham_text
            )

        return {
            "dat_ca_3": legs["dat_ca_3"],
            "so_lenh_doc_luc": {
                "ten": f"Đọc lực cho ≥ {_TASK3_SO_LENH_MIN} lệnh",
                "gia_tri_hien_tai": float(metrics["so_lenh_doc_luc"]),
                "muc_tieu": float(_TASK3_SO_LENH_MIN),
                "dat": legs["so_lenh_dat"],
                "du_du_lieu": True,
                "giai_thich": (
                    f"Đã đọc lực cho {metrics['so_lenh_doc_luc']}/"
                    f"{_TASK3_SO_LENH_MIN} lệnh mua — mỗi lần là một lần bạn tự "
                    "nhìn sổ dư mua/dư bán rồi tự chốt câu trả lời, thay vì mua "
                    "theo cảm giác."
                ),
            },
            "so_lan_khong_duoi_theo_co": {
                "ten": f"Không đuổi theo ≥ {_TASK3_KHONG_DUOI_THEO_MIN} cờ cảnh giác",
                "gia_tri_hien_tai": float(metrics["so_lan_khong_duoi_theo_co"]),
                "muc_tieu": float(_TASK3_KHONG_DUOI_THEO_MIN),
                "dat": legs["co_dat"],
                "du_du_lieu": True,
                "giai_thich": (
                    f"Gặp cờ {metrics['so_lan_gap_co']} lần, chờ xác nhận "
                    f"{metrics['so_lan_khong_duoi_theo_co']}/"
                    f"{_TASK3_KHONG_DUOI_THEO_MIN} lần "
                    f"(mua đuổi {metrics['so_lan_mua_duoi_theo']} lần). Mua đuổi "
                    "KHÔNG bị phạt — nó chỉ không được tính vào ô kỷ luật này."
                ),
            },
            "ty_le_doc_luc_dung": {
                "ten": f"Tỷ lệ đọc lực đúng ≥ {_TASK3_TY_LE_MIN:.0f}%",
                "gia_tri_hien_tai": metrics["ty_le_doc_luc_dung"],
                "muc_tieu": _TASK3_TY_LE_MIN,
                "dat": legs["ty_le_dat"],
                "du_du_lieu": legs["ty_le_du_du_lieu"],
                "giai_thich": ty_le_giai_thich,
            },
            "so_lenh_da_cham": da_cham,
            "so_lenh_chua_cham": chua_cham,
            "so_lan_gap_co": metrics["so_lan_gap_co"],
            "so_lan_mua_duoi_theo": metrics["so_lan_mua_duoi_theo"],
            "so_phien_cham": SO_PHIEN_CHAM_LUC,
        }

    # ── Graduation ────────────────────────────────────

    async def graduate(self, user_id: uuid.UUID) -> dict:
        """Graduate Cấp 7 — only when all 3 nhiệm vụ are done (thực chất ③)."""
        progress = await self._require_progress(user_id)
        metrics = await self._recompute_progress(user_id, progress)

        all_tasks_done = all(
            getattr(progress, f"task_{n}_done_at") is not None for n in _TASK_NOS
        )
        if not all_tasks_done:
            raise ConflictError("Chưa hoàn thành đủ 3 nhiệm vụ Cấp 7")

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
