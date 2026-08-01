"""Tests for the Cấp 7 «Đọc sổ lệnh» backend — chỉ số Lực (bands as documented
constants), cờ cảnh giác lệnh treo lớn (heuristic, never a detection claim),
bước "đọc lực" trên ``order_kehoach``, chấm ``doc_luc_dung`` server-side sau
``SO_PHIEN_CHAM_LUC`` phiên, Thách thức Đọc sổ lệnh (3 legs), graduation.

Mirrors ``tests/test_cap6.py``'s style. Uses the ``test_user``/``db_session``
fixtures from ``tests/conftest.py``.

**Setup cost note.** Cấp 7's only real prerequisite is
``Cap6Progress.graduated_at``. ``test_enter_requires_cap6_graduated`` exercises
the real Cấp 6 gate (entered-but-not-graduated → 409); every other test uses
``_fast_track_cap6`` which stamps the prerequisite progress rows directly (Cấp
0→6's full graduation chain is already pinned by ``tests/test_cap5.py`` and
``tests/test_cap6.py``).

**★ THE PRINCIPLES this file pins down:**

1. ``luc_chi_so`` comes from the client (realtime order-book data the server does
   not hold) — what makes the graduation metric sound is the TIME-LOCK: the guess
   is committed before the outcome exists, and ``doc_luc_dung`` is scored
   SERVER-side from real price history.
   ``test_luc_doc_is_locked_once_the_window_has_elapsed`` pins the lock.
2. An order whose price history is unavailable is UNSCORED — excluded from the
   ratio's denominator, never counted as wrong, and reported as still-unscored.
   ``test_unscoreable_order_is_excluded_from_the_denominator`` pins that.
3. The cờ is EDUCATIONAL. Nothing the API returns may claim IQX detected a fake
   order. ``test_api_copy_never_claims_fake_order_detection`` pins that.

The price source (``get_adjusted_ohlcv`` for the close ``SO_PHIEN_CHAM_LUC``
phiên after the buy) is monkeypatched at its import site in
``app.services.cap7.service`` — no network in tests.
"""

from __future__ import annotations

import math
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap1 import Cap1Progress
from app.models.cap2 import Cap2Progress
from app.models.cap3 import Cap3Progress
from app.models.cap4 import Cap4Progress
from app.models.cap5 import Cap5Progress
from app.models.cap6 import Cap6Progress
from app.models.cap7 import BandLuc, HanhViCo, LucDocUser
from app.models.symbol import Symbol
from app.models.virtual_trading import OrderSide, OrderStatus, OrderType, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.cap1.service import Cap1Service
from app.services.cap2.service import Cap2Service
from app.services.cap3.service import Cap3Service
from app.services.cap4.service import Cap4Service
from app.services.cap6.service import Cap6Service
from app.services.cap7.service import (
    CO_CANH_GIAC_HE_SO,
    CO_CANH_GIAC_MIN_MUC,
    NGUONG_CAU_AP_DAO,
    NGUONG_CUNG_AP_DAO,
    NGUONG_DEAD_BAND_PCT,
    SO_PHIEN_CHAM_LUC,
    Cap7Service,
    band_luc,
    co_canh_giac,
    doc_luc_dung_rule,
    han_cham_luc_date,
)
from app.services.ta.indicators import OHLCV

_SVC = "app.services.cap7.service"

_ALL_NEU = {
    "ky_thuat": "neu",
    "dong_tien": "neu",
    "noi_bo": "neu",
    "tin_tuc": "neu",
    "dinh_gia": "neu",
}
_MAU_THUAN = {**_ALL_NEU, "ky_thuat": "ok", "dinh_gia": "bad"}

_BUY_PRICE = 20_000


# ══════════════════════════════════════════════════════
# Setup helpers
# ══════════════════════════════════════════════════════


async def _make_order(
    db_session,
    account_id,
    user_id,
    *,
    symbol: str = "AAA",
    side: OrderSide = OrderSide.BUY,
    qty: int = 100,
    price: int = _BUY_PRICE,
    trading_date: date | None = None,
    mode: str = "thuc_chien",
    status: OrderStatus = OrderStatus.FILLED,
) -> VirtualOrder:
    trading_date = trading_date or date.today()
    gross = price * qty
    net = -gross if side == OrderSide.BUY else gross
    order = VirtualOrder(
        account_id=account_id,
        user_id=user_id,
        symbol=symbol,
        mode=mode,
        side=side,
        order_type=OrderType.MARKET,
        status=status,
        quantity=qty,
        filled_price_vnd=price if status == OrderStatus.FILLED else None,
        gross_amount_vnd=gross if status == OrderStatus.FILLED else None,
        fee_vnd=0,
        tax_vnd=0,
        net_amount_vnd=net if status == OrderStatus.FILLED else None,
        trading_date=trading_date,
    )
    db_session.add(order)
    await db_session.flush()
    await db_session.refresh(order)
    return order


async def _seed_symbol(db_session, symbol: str, *, icb_lv1=None, icb_lv2=None) -> Symbol:
    row = Symbol(symbol=symbol.upper(), name=symbol, icb_lv1=icb_lv1, icb_lv2=icb_lv2)
    db_session.add(row)
    await db_session.flush()
    return row


async def _fast_track_cap6(db_session, user_id, *, graduated: bool = True):
    """Stamp the Cấp 1-6 progress rows a Cấp 7 flow needs + a VT account."""
    now = datetime.now(UTC)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(user_id)
    if account is None:
        account = await vt_repo.create_account(user_id, 250_000_000)
    db_session.add_all(
        [
            Cap1Progress(user_id=user_id, entered_at=now, graduated_at=now),
            Cap2Progress(user_id=user_id, entered_at=now, graduated_at=now),
            Cap3Progress(
                user_id=user_id,
                entered_at=now,
                khau_vi_da_dat=True,
                khau_vi="can_bang",
                graduated_at=now,
            ),
            Cap4Progress(user_id=user_id, entered_at=now, graduated_at=now),
            Cap5Progress(user_id=user_id, entered_at=now, graduated_at=now),
            Cap6Progress(
                user_id=user_id, entered_at=now, graduated_at=now if graduated else None
            ),
        ]
    )
    await db_session.flush()
    return account


async def _enter_cap7(db_session, user_id):
    """Fast-track Cấp 1-6 then enter Cấp 7. Returns ``(services, account)``."""
    account = await _fast_track_cap6(db_session, user_id)
    services = {
        "cap1": Cap1Service(db_session),
        "cap2": Cap2Service(db_session),
        "cap3": Cap3Service(db_session),
        "cap4": Cap4Service(db_session),
        "cap6": Cap6Service(db_session),
        "cap7": Cap7Service(db_session),
    }
    await services["cap7"].enter(user_id)
    return services, account


async def _buy_with_cap1_plan(
    db_session,
    services,
    account_id,
    user_id,
    *,
    symbol: str,
    days_ago: int = 0,
    buy_price: int = _BUY_PRICE,
) -> VirtualOrder:
    """A BUY carrying only Cấp 1's block — the minimum row Cấp 7 extends.

    Cheap on purpose: the full Cấp 1-6 cộng dồn is asserted once, by
    ``test_kehoach_keeps_cap1_to_6_blocks_intact``.
    """
    trading_date = date.today() - timedelta(days=days_ago)
    buy = await _make_order(
        db_session,
        account_id,
        user_id,
        symbol=symbol,
        price=buy_price,
        trading_date=trading_date,
    )
    await services["cap1"].record_kehoach(
        user_id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=buy_price
    )
    return buy


async def _buy_with_full_plan(
    db_session, services, account_id, user_id, *, symbol: str
) -> VirtualOrder:
    """A BUY carrying Cấp 1-6's blocks (the row Cấp 7 extends in production)."""
    buy = await _buy_with_cap1_plan(
        db_session, services, account_id, user_id, symbol=symbol
    )
    await services["cap2"].record_kehoach(
        user_id, buy.id, phuong_phap_sl_tp="bien_do_dao_dong", cat_lo=18_000, chot_loi=25_000
    )
    await services["cap3"].record_kehoach(
        user_id,
        buy.id,
        khau_vi="can_bang",
        muc_tu_tin=3,
        cach_khoi_luong="linh_hoat",
        khoi_luong=100,
        pct_von=20.0,
    )
    await services["cap4"].record_kehoach(
        user_id, buy.id, doc_5_lop=_MAU_THUAN, ai_5_lop={**_ALL_NEU, "ky_thuat": "ok"}
    )
    await services["cap6"].record_kehoach(
        user_id,
        buy.id,
        lop_quyet_dinh="dinh_gia",
        ly_do_doi_chieu="Định giá là lớp tôi tin cho nhóm này.",
    )
    return buy


async def _sell_and_ketso(
    db_session, services, account_id, user_id, *, symbol: str, win: bool = True
) -> VirtualOrder:
    sell = await _make_order(
        db_session,
        account_id,
        user_id,
        symbol=symbol,
        side=OrderSide.SELL,
        price=22_000 if win else 18_000,
    )
    await services["cap1"].record_ketso(user_id, sell.id)
    return sell


async def _doc_luc_order(
    db_session,
    services,
    account_id,
    user_id,
    *,
    symbol: str,
    luc_chi_so: float = 1.9,
    luc_doc_user: str = "manh",
    co: bool = False,
    hanh_vi: str | None = None,
    days_ago: int = 0,
    close: bool = False,
):
    """One Cấp 7 order: buy + Cấp 1 kế hoạch + đọc lực (optionally closed)."""
    buy = await _buy_with_cap1_plan(
        db_session, services, account_id, user_id, symbol=symbol, days_ago=days_ago
    )
    kehoach = await services["cap7"].record_kehoach(
        user_id,
        buy.id,
        luc_chi_so=luc_chi_so,
        luc_doc_user=luc_doc_user,
        co_canh_giac_lenh_gia=co,
        hanh_vi_co=hanh_vi,
    )
    if close:
        await _sell_and_ketso(
            db_session, services, account_id, user_id, symbol=symbol
        )
    return buy, kehoach


# ── Price-source fake (no network) ────────────────────


def _patch_ohlcv(monkeypatch, closes: dict[date, float] | None):
    """Patch the historical close series. ``None`` → the fetch raises."""

    async def _fake(symbol, start, end, **kwargs):
        if closes is None:
            raise ValueError(f"test: no data for {symbol}")
        records = [
            {
                "time": d.isoformat(),
                "open": c,
                "high": c,
                "low": c,
                "close": c,
                "volume": 1_000.0,
            }
            for d, c in sorted(closes.items())
        ]
        return OHLCV.from_records(records), 0

    monkeypatch.setattr(f"{_SVC}.get_adjusted_ohlcv", _fake)


def _series_for(trading_date: date, close_on_due: float) -> dict[date, float]:
    """A daily close series covering the buy → due window, plus sessions after
    the due date (so the due bar is unambiguously final)."""
    due = han_cham_luc_date(trading_date)
    closes: dict[date, float] = {}
    d = trading_date
    while d <= due + timedelta(days=5):
        if d.weekday() < 5:
            closes[d] = close_on_due if d == due else close_on_due * 0.5
        d += timedelta(days=1)
    return closes


# ══════════════════════════════════════════════════════
# Enter / prerequisites
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_enter_requires_cap6_graduated(db_session, test_user):
    cap7 = Cap7Service(db_session)

    with pytest.raises(NotFoundError):  # no Cấp 6 progress at all
        await cap7.enter(test_user.id)

    await _fast_track_cap6(db_session, test_user.id, graduated=False)
    with pytest.raises(ConflictError):  # entered but not graduated
        await cap7.enter(test_user.id)

    cap6_row = (
        await db_session.execute(
            select(Cap6Progress).where(Cap6Progress.user_id == test_user.id)
        )
    ).scalar_one()
    cap6_row.graduated_at = datetime.now(UTC)
    await db_session.flush()

    progress = await cap7.enter(test_user.id)
    assert progress["user_id"] == test_user.id
    assert progress["graduated_at"] is None
    assert progress["so_lenh_doc_luc"] == 0
    assert progress["so_lan_khong_duoi_theo_co"] == 0
    assert progress["ty_le_doc_luc_dung"] == 0.0
    assert progress["so_lenh_chua_cham"] == 0
    assert progress["so_phien_cham"] == SO_PHIEN_CHAM_LUC

    again = await cap7.enter(test_user.id)
    assert again["id"] == progress["id"]


@pytest.mark.asyncio
async def test_get_progress_none_before_enter(db_session, test_user):
    cap7 = Cap7Service(db_session)
    assert await cap7.get_progress(test_user.id) is None


# ══════════════════════════════════════════════════════
# GET /cap7/phien — trong_phien comes from the SERVER clock
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_phien_comes_from_the_server_clock(db_session, test_user, monkeypatch):
    """``trong_phien`` is the server's own ``is_trading_session()`` — the FE must
    never compute market-open from the browser clock (a user in another timezone
    would get the wrong answer)."""
    services, _account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]

    monkeypatch.setattr(f"{_SVC}.is_trading_session", lambda **kw: True)
    open_payload = await cap7.phien(test_user.id)
    assert open_payload["trong_phien"] is True
    assert "09:00" in open_payload["gio_giao_dich_text"]
    assert "11:30" in open_payload["gio_giao_dich_text"]
    assert "13:00" in open_payload["gio_giao_dich_text"]
    assert "14:45" in open_payload["gio_giao_dich_text"]
    assert open_payload["giai_thich"]

    monkeypatch.setattr(f"{_SVC}.is_trading_session", lambda **kw: False)
    closed_payload = await cap7.phien(test_user.id)
    assert closed_payload["trong_phien"] is False
    # Spec §4's closed-market copy, verbatim.
    assert (
        closed_payload["giai_thich"]
        == "Sổ lệnh chỉ sống trong giờ giao dịch — quay lại lúc thị trường mở để "
        "đọc lực."
    )

    # And the same flag rides along on /cap7/progress.
    progress = await cap7.get_progress(test_user.id)
    assert progress["trong_phien"] is False


@pytest.mark.asyncio
async def test_phien_publishes_the_documented_constants(db_session, test_user):
    """The FE must render the SERVER's thresholds, never invent its own — so
    every constant the reading block needs is in the payload."""
    services, _account = await _enter_cap7(db_session, test_user.id)
    quy_tac = (await services["cap7"].phien(test_user.id))["quy_tac"]

    assert quy_tac["nguong_cau_ap_dao"] == NGUONG_CAU_AP_DAO
    assert quy_tac["nguong_cung_ap_dao"] == pytest.approx(NGUONG_CUNG_AP_DAO)
    assert quy_tac["co_canh_giac_he_so"] == CO_CANH_GIAC_HE_SO
    assert quy_tac["co_canh_giac_min_muc"] == CO_CANH_GIAC_MIN_MUC
    assert quy_tac["so_phien_cham"] == SO_PHIEN_CHAM_LUC
    assert quy_tac["dead_band_pct"] == NGUONG_DEAD_BAND_PCT

    # 3 bands, each with a label + a "vì sao" the FE shows verbatim (§C12c).
    bands = {b["ma"]: b for b in quy_tac["bands"]}
    assert set(bands) == {m.value for m in BandLuc}
    for band in bands.values():
        assert band["ten"]
        assert band["giai_thich"]

    # The cờ copy is honest: heuristic, never a detection claim.
    assert "chưa chắc" in quy_tac["co_canh_giac_copy"].lower()


@pytest.mark.asyncio
async def test_phien_requires_progress(db_session, test_user):
    cap7 = Cap7Service(db_session)
    with pytest.raises(NotFoundError):
        await cap7.phien(test_user.id)


# ══════════════════════════════════════════════════════
# The documented constants — chỉ số Lực bands
# ══════════════════════════════════════════════════════


def test_band_luc_cut_offs_are_symmetric_and_match_the_spec_example():
    """Spec §4's own worked example (1,240,000 / 640,000 ≈ 1.9 : 1) must read
    "Cầu áp đảo", and the two cut-offs must be RECIPROCAL — otherwise "Cung áp
    đảo" would be harder to reach than "Cầu áp đảo" and the gauge would quietly
    lean bullish."""
    assert NGUONG_CUNG_AP_DAO == pytest.approx(1.0 / NGUONG_CAU_AP_DAO)
    assert NGUONG_CAU_AP_DAO > 1.0

    assert band_luc(1_240_000 / 640_000) == BandLuc.CAU_AP_DAO.value
    assert band_luc(NGUONG_CAU_AP_DAO) == BandLuc.CAU_AP_DAO.value  # closed band
    assert band_luc(NGUONG_CAU_AP_DAO - 0.01) == BandLuc.CAN_BANG.value
    assert band_luc(1.0) == BandLuc.CAN_BANG.value
    assert band_luc(NGUONG_CUNG_AP_DAO) == BandLuc.CUNG_AP_DAO.value
    assert band_luc(NGUONG_CUNG_AP_DAO + 0.01) == BandLuc.CAN_BANG.value
    assert band_luc(0.1) == BandLuc.CUNG_AP_DAO.value

    # A non-positive / non-finite ratio is never a band — the book is unreadable.
    for bad in (0.0, -1.0, float("inf"), float("nan")):
        assert band_luc(bad) is None


def test_doc_luc_dung_rule_needs_a_real_dead_band():
    """Without a dead band ``can`` is unfalsifiable and ``manh``/``yeu`` are
    decided by noise. The band is CLOSED on ``can`` so the three verdicts are
    mutually exclusive AND exhaustive — no outcome escapes scoring."""
    assert NGUONG_DEAD_BAND_PCT > 0

    band = NGUONG_DEAD_BAND_PCT
    # manh — only a move UP beyond the band.
    assert doc_luc_dung_rule(LucDocUser.MANH.value, band + 0.5) is True
    assert doc_luc_dung_rule(LucDocUser.MANH.value, band) is False
    assert doc_luc_dung_rule(LucDocUser.MANH.value, 0.0) is False
    assert doc_luc_dung_rule(LucDocUser.MANH.value, -(band + 0.5)) is False
    # yeu — only a move DOWN beyond the band.
    assert doc_luc_dung_rule(LucDocUser.YEU.value, -(band + 0.5)) is True
    assert doc_luc_dung_rule(LucDocUser.YEU.value, -band) is False
    assert doc_luc_dung_rule(LucDocUser.YEU.value, band + 0.5) is False
    # can — only INSIDE the band (boundaries included).
    assert doc_luc_dung_rule(LucDocUser.CAN.value, 0.0) is True
    assert doc_luc_dung_rule(LucDocUser.CAN.value, band) is True
    assert doc_luc_dung_rule(LucDocUser.CAN.value, -band) is True
    assert doc_luc_dung_rule(LucDocUser.CAN.value, band + 0.5) is False

    # Exhaustive: every pct is correct for exactly ONE of the 3 guesses.
    for pct in (-9.0, -band - 0.1, -band, -0.3, 0.0, 0.3, band, band + 0.1, 9.0):
        hits = [
            g for g in (m.value for m in LucDocUser) if doc_luc_dung_rule(g, pct)
        ]
        assert len(hits) == 1, (pct, hits)


def test_co_canh_giac_rule_is_the_spec_heuristic():
    """Spec §5's suggestion, fixed as a constant: one level's volume > 3× the
    MEAN OF THE REMAINING levels. Below ``CO_CANH_GIAC_MIN_MUC`` levels the
    "mean of the remaining" is one sample, so any lopsided pair would trip it —
    the rule stays silent there instead of crying wolf."""
    assert CO_CANH_GIAC_HE_SO == 3.0
    assert CO_CANH_GIAC_MIN_MUC >= 3

    # 100_000 vs mean(10_000, 10_000, 10_000, 10_000, 10_000) = 10_000 → 10× → hit
    assert co_canh_giac([100_000, 10_000, 10_000, 10_000, 10_000, 10_000]) == 0
    # The tripping index is reported so the copy can name the price level.
    assert co_canh_giac([10_000, 10_000, 90_000, 10_000]) == 2
    # Flat book → nothing.
    assert co_canh_giac([10_000] * 6) is None
    # Exactly 3× is NOT "> 3×".
    assert co_canh_giac([30_000, 10_000, 10_000, 10_000]) is None
    assert co_canh_giac([30_100, 10_000, 10_000, 10_000]) == 0
    # Too few levels → silent, never a guess.
    assert co_canh_giac([100_000, 1_000]) is None
    assert co_canh_giac([]) is None
    # Zero-volume book → silent (no mean to compare against).
    assert co_canh_giac([0, 0, 0, 0]) is None


# ══════════════════════════════════════════════════════
# POST /cap7/kehoach — ghi đọc lực
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_kehoach_keeps_cap1_to_6_blocks_intact(db_session, test_user):
    """Cộng dồn: Cấp 7 only INSERTS its 5 fields onto the same
    ``order_kehoach`` row — every Cấp 1-6 block is untouched."""
    services, account = await _enter_cap7(db_session, test_user.id)
    await _seed_symbol(db_session, "VCB", icb_lv2="Ngân hàng")
    buy = await _buy_with_full_plan(
        db_session, services, account.id, test_user.id, symbol="VCB"
    )

    kehoach = await services["cap7"].record_kehoach(
        test_user.id,
        buy.id,
        luc_chi_so=1.9375,
        luc_doc_user="manh",
        co_canh_giac_lenh_gia=True,
        hanh_vi_co="cho_xac_nhan",
    )

    assert kehoach.luc_chi_so == pytest.approx(1.9375)
    assert kehoach.luc_doc_user == LucDocUser.MANH.value
    assert kehoach.co_canh_giac_lenh_gia is True
    assert kehoach.hanh_vi_co == HanhViCo.CHO_XAC_NHAN.value
    assert kehoach.doc_luc_dung is None  # chưa tới hạn chấm
    assert kehoach.dien_bien_pct is None

    # Cấp 1-6 intact.
    assert kehoach.vung_mua == _BUY_PRICE
    assert kehoach.cat_lo == 18_000
    assert kehoach.pct_von == 20.0
    assert kehoach.doc_5_lop == _MAU_THUAN
    assert kehoach.lop_quyet_dinh == "dinh_gia"
    assert kehoach.kieu_co_phieu == "ngan_hang"

    out = services["cap7"].kehoach_out(kehoach)
    assert out["luc_band"] == BandLuc.CAU_AP_DAO.value
    assert out["luc_band_ten"]
    assert out["luc_doc_user_ten"]
    assert out["hanh_vi_co_ten"]
    assert out["so_phien_cham"] == SO_PHIEN_CHAM_LUC
    assert out["giai_thich"]


@pytest.mark.asyncio
async def test_kehoach_validates_luc_chi_so_finite_and_positive(db_session, test_user):
    services, account = await _enter_cap7(db_session, test_user.id)
    buy = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id, symbol="LC1"
    )
    for bad in (0.0, -1.0, float("inf"), float("-inf"), float("nan")):
        with pytest.raises(BadRequestError):
            await services["cap7"].record_kehoach(
                test_user.id,
                buy.id,
                luc_chi_so=bad,
                luc_doc_user="manh",
                co_canh_giac_lenh_gia=False,
                hanh_vi_co=None,
            )


@pytest.mark.asyncio
async def test_kehoach_validates_luc_doc_user(db_session, test_user):
    services, account = await _enter_cap7(db_session, test_user.id)
    buy = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id, symbol="LD1"
    )
    for bad in ("rat_manh", "", None):
        with pytest.raises(BadRequestError):
            await services["cap7"].record_kehoach(
                test_user.id,
                buy.id,
                luc_chi_so=1.5,
                luc_doc_user=bad,
                co_canh_giac_lenh_gia=False,
                hanh_vi_co=None,
            )


@pytest.mark.asyncio
async def test_kehoach_rejects_inconsistent_co_and_hanh_vi(db_session, test_user):
    """``hanh_vi_co`` is non-null IFF the cờ was shown. The inconsistent
    combination is REJECTED, not silently normalised — a behaviour recorded
    against a cờ that never appeared (or a cờ with no recorded behaviour) would
    corrupt the "không đuổi theo cờ" discipline count."""
    services, account = await _enter_cap7(db_session, test_user.id)
    buy = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id, symbol="CO1"
    )

    with pytest.raises(BadRequestError):  # cờ shown, no behaviour recorded
        await services["cap7"].record_kehoach(
            test_user.id,
            buy.id,
            luc_chi_so=1.5,
            luc_doc_user="manh",
            co_canh_giac_lenh_gia=True,
            hanh_vi_co=None,
        )
    with pytest.raises(BadRequestError):  # behaviour recorded, no cờ
        await services["cap7"].record_kehoach(
            test_user.id,
            buy.id,
            luc_chi_so=1.5,
            luc_doc_user="manh",
            co_canh_giac_lenh_gia=False,
            hanh_vi_co="cho_xac_nhan",
        )
    with pytest.raises(BadRequestError):  # unknown behaviour value
        await services["cap7"].record_kehoach(
            test_user.id,
            buy.id,
            luc_chi_so=1.5,
            luc_doc_user="manh",
            co_canh_giac_lenh_gia=True,
            hanh_vi_co="bo_qua",
        )

    # Both consistent combinations are accepted.
    ok = await services["cap7"].record_kehoach(
        test_user.id,
        buy.id,
        luc_chi_so=1.5,
        luc_doc_user="manh",
        co_canh_giac_lenh_gia=False,
        hanh_vi_co=None,
    )
    assert ok.co_canh_giac_lenh_gia is False
    assert ok.hanh_vi_co is None

    ok = await services["cap7"].record_kehoach(
        test_user.id,
        buy.id,
        luc_chi_so=1.5,
        luc_doc_user="manh",
        co_canh_giac_lenh_gia=True,
        hanh_vi_co="mua_duoi_theo",
    )
    assert ok.co_canh_giac_lenh_gia is True
    assert ok.hanh_vi_co == HanhViCo.MUA_DUOI_THEO.value


@pytest.mark.asyncio
async def test_kehoach_404_without_a_cap1_kehoach_row(db_session, test_user):
    """Same convention as Cấp 2-6: Cấp 7 ADDS onto the existing row."""
    services, account = await _enter_cap7(db_session, test_user.id)
    naked = await _make_order(db_session, account.id, test_user.id, symbol="NAKED")
    with pytest.raises(NotFoundError):
        await services["cap7"].record_kehoach(
            test_user.id,
            naked.id,
            luc_chi_so=1.5,
            luc_doc_user="manh",
            co_canh_giac_lenh_gia=False,
            hanh_vi_co=None,
        )


@pytest.mark.asyncio
async def test_kehoach_requires_progress_and_a_buy_order(db_session, test_user):
    account = await _fast_track_cap6(db_session, test_user.id)
    cap7 = Cap7Service(db_session)
    cap1 = Cap1Service(db_session)
    buy = await _make_order(db_session, account.id, test_user.id, symbol="P1")
    with pytest.raises(NotFoundError):  # no Cấp 7 progress
        await cap7.record_kehoach(
            test_user.id,
            buy.id,
            luc_chi_so=1.5,
            luc_doc_user="manh",
            co_canh_giac_lenh_gia=False,
            hanh_vi_co=None,
        )

    await cap7.enter(test_user.id)
    await cap1.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=_BUY_PRICE
    )
    sell = await _make_order(
        db_session, account.id, test_user.id, symbol="P1", side=OrderSide.SELL
    )
    with pytest.raises(BadRequestError):  # đọc lực chỉ ghi cho lệnh MUA
        await cap7.record_kehoach(
            test_user.id,
            sell.id,
            luc_chi_so=1.5,
            luc_doc_user="manh",
            co_canh_giac_lenh_gia=False,
            hanh_vi_co=None,
        )


@pytest.mark.asyncio
async def test_luc_doc_is_locked_once_the_window_has_elapsed(
    db_session, test_user, monkeypatch
):
    """★ THE TIME-LOCK. ``luc_chi_so`` cannot be re-derived server-side, so the
    ONLY thing that makes ``doc_luc_dung`` trustworthy is that the guess was
    committed BEFORE the outcome existed. A re-post that CHANGES the guess after
    the chấm deadline is therefore rejected; an identical re-post (a retry) is
    still accepted as a no-op."""
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    _patch_ohlcv(monkeypatch, {})

    # Fresh order (today) → still rewritable.
    buy = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id, symbol="LK1"
    )
    await cap7.record_kehoach(
        test_user.id, buy.id, luc_chi_so=1.9, luc_doc_user="manh",
        co_canh_giac_lenh_gia=False, hanh_vi_co=None,
    )
    rewritten = await cap7.record_kehoach(
        test_user.id, buy.id, luc_chi_so=0.5, luc_doc_user="yeu",
        co_canh_giac_lenh_gia=False, hanh_vi_co=None,
    )
    assert rewritten.luc_doc_user == LucDocUser.YEU.value

    # Backdated order whose window has elapsed → locked.
    old = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id, symbol="LK2", days_ago=30
    )
    await cap7.record_kehoach(
        test_user.id, old.id, luc_chi_so=1.9, luc_doc_user="manh",
        co_canh_giac_lenh_gia=False, hanh_vi_co=None,
    )
    with pytest.raises(ConflictError):
        await cap7.record_kehoach(
            test_user.id, old.id, luc_chi_so=0.4, luc_doc_user="yeu",
            co_canh_giac_lenh_gia=False, hanh_vi_co=None,
        )
    with pytest.raises(ConflictError):  # flipping the discipline flag is locked too
        await cap7.record_kehoach(
            test_user.id, old.id, luc_chi_so=1.9, luc_doc_user="manh",
            co_canh_giac_lenh_gia=True, hanh_vi_co="cho_xac_nhan",
        )
    # An identical re-post stays idempotent (a retried network call must not 409).
    same = await cap7.record_kehoach(
        test_user.id, old.id, luc_chi_so=1.9, luc_doc_user="manh",
        co_canh_giac_lenh_gia=False, hanh_vi_co=None,
    )
    assert same.luc_doc_user == LucDocUser.MANH.value


# ══════════════════════════════════════════════════════
# Chấm "đọc lực đúng" — SERVER-side, from real price history
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_scoring_manh_correct_when_price_rises_beyond_the_dead_band(
    db_session, test_user, monkeypatch
):
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    _patch_ohlcv(monkeypatch, {})
    buy, kehoach = await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="SM1", luc_doc_user="manh", days_ago=30,
    )
    assert kehoach.doc_luc_dung is None

    _patch_ohlcv(monkeypatch, _series_for(buy.trading_date, _BUY_PRICE * 1.05))
    progress = await cap7.get_progress(test_user.id)
    await db_session.refresh(kehoach)

    assert kehoach.doc_luc_dung is True
    assert kehoach.dien_bien_pct == pytest.approx(5.0)
    assert progress["ty_le_doc_luc_dung"] == pytest.approx(100.0)
    assert progress["so_lenh_da_cham"] == 1
    assert progress["so_lenh_chua_cham"] == 0


@pytest.mark.asyncio
async def test_scoring_yeu_and_can_use_the_same_dead_band(
    db_session, test_user, monkeypatch
):
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    _patch_ohlcv(monkeypatch, {})

    # yeu, price down 5% → correct.
    buy_y, ke_y = await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="SY1", luc_doc_user="yeu", days_ago=30,
    )
    _patch_ohlcv(monkeypatch, _series_for(buy_y.trading_date, _BUY_PRICE * 0.95))
    await cap7.get_progress(test_user.id)
    await db_session.refresh(ke_y)
    assert ke_y.doc_luc_dung is True
    assert ke_y.dien_bien_pct == pytest.approx(-5.0)

    # can, price flat → correct (inside the dead band).
    buy_c, ke_c = await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="SC1", luc_doc_user="can", days_ago=30,
    )
    _patch_ohlcv(monkeypatch, _series_for(buy_c.trading_date, _BUY_PRICE))
    await cap7.get_progress(test_user.id)
    await db_session.refresh(ke_c)
    assert ke_c.doc_luc_dung is True
    assert ke_c.dien_bien_pct == pytest.approx(0.0)

    # can, price up well past the dead band → NOT correct.
    buy_w, ke_w = await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="SC2", luc_doc_user="can", days_ago=30,
    )
    _patch_ohlcv(monkeypatch, _series_for(buy_w.trading_date, _BUY_PRICE * 1.06))
    await cap7.get_progress(test_user.id)
    await db_session.refresh(ke_w)
    assert ke_w.doc_luc_dung is False

    progress = await cap7.get_progress(test_user.id)
    assert progress["so_lenh_da_cham"] == 3
    assert progress["ty_le_doc_luc_dung"] == pytest.approx(200.0 / 3.0)


@pytest.mark.asyncio
async def test_unscoreable_order_is_excluded_from_the_denominator(
    db_session, test_user, monkeypatch
):
    """★ An order whose price history is unavailable must NOT count as wrong: it
    stays ``doc_luc_dung IS NULL``, leaves the ratio's denominator, and the API
    says how many are still unscored."""
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    _patch_ohlcv(monkeypatch, {})

    good, ke_good = await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="OK1", luc_doc_user="manh", days_ago=30,
    )
    _bad, ke_bad = await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="NOPX", luc_doc_user="manh", days_ago=30,
    )

    # Only OK1's window has data; NOPX's fetch raises for every symbol except
    # the ones present in the series, so give a series that covers OK1 only.
    series = _series_for(good.trading_date, _BUY_PRICE * 1.05)

    async def _fake(symbol, start, end, **kwargs):
        if symbol == "NOPX":
            raise ValueError("test: no data")
        records = [
            {"time": d.isoformat(), "open": c, "high": c, "low": c, "close": c, "volume": 1.0}
            for d, c in sorted(series.items())
        ]
        return OHLCV.from_records(records), 0

    monkeypatch.setattr(f"{_SVC}.get_adjusted_ohlcv", _fake)

    progress = await cap7.get_progress(test_user.id)
    await db_session.refresh(ke_good)
    await db_session.refresh(ke_bad)

    assert ke_good.doc_luc_dung is True
    assert ke_bad.doc_luc_dung is None  # never guessed, never "wrong"
    assert progress["so_lenh_doc_luc"] == 2
    assert progress["so_lenh_da_cham"] == 1
    assert progress["so_lenh_chua_cham"] == 1
    # 1/1 scored, NOT 1/2 — the unscoreable order left the denominator.
    assert progress["ty_le_doc_luc_dung"] == pytest.approx(100.0)

    thach_thuc = await cap7.thach_thuc(test_user.id)
    assert thach_thuc["so_lenh_chua_cham"] == 1
    assert "chưa" in thach_thuc["ty_le_doc_luc_dung"]["giai_thich"].lower()


@pytest.mark.asyncio
async def test_not_scored_before_the_window_elapses(db_session, test_user, monkeypatch):
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    _patch_ohlcv(monkeypatch, {})
    buy, kehoach = await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="NY1", luc_doc_user="manh", days_ago=0,
    )
    # A wildly bullish series is available — but the deadline has not arrived.
    _patch_ohlcv(monkeypatch, _series_for(buy.trading_date, _BUY_PRICE * 2))
    progress = await cap7.get_progress(test_user.id)
    await db_session.refresh(kehoach)
    assert kehoach.doc_luc_dung is None
    assert progress["so_lenh_chua_cham"] == 1
    assert progress["ty_le_doc_luc_dung"] == 0.0


@pytest.mark.asyncio
async def test_scoring_is_idempotent(db_session, test_user, monkeypatch):
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    _patch_ohlcv(monkeypatch, {})
    buy, kehoach = await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="ID1", luc_doc_user="manh", days_ago=30,
    )
    _patch_ohlcv(monkeypatch, _series_for(buy.trading_date, _BUY_PRICE * 1.05))
    first = await cap7.cham(test_user.id)
    assert first["so_moi_cham"] == 1
    second = await cap7.cham(test_user.id)
    assert second["so_moi_cham"] == 0
    await db_session.refresh(kehoach)
    assert kehoach.doc_luc_dung is True
    assert kehoach.dien_bien_pct == pytest.approx(5.0)


@pytest.mark.asyncio
async def test_unfilled_buy_is_never_scored(db_session, test_user, monkeypatch):
    """No fill price → no reference to compare against → unscored, never
    guessed."""
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    buy = await _make_order(
        db_session,
        account.id,
        test_user.id,
        symbol="UF1",
        status=OrderStatus.PENDING,
        trading_date=date.today() - timedelta(days=30),
    )
    await services["cap1"].record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=_BUY_PRICE
    )
    kehoach = await cap7.record_kehoach(
        test_user.id, buy.id, luc_chi_so=1.9, luc_doc_user="manh",
        co_canh_giac_lenh_gia=False, hanh_vi_co=None,
    )
    _patch_ohlcv(monkeypatch, _series_for(buy.trading_date, _BUY_PRICE * 1.05))
    progress = await cap7.get_progress(test_user.id)
    await db_session.refresh(kehoach)
    assert kehoach.doc_luc_dung is None
    assert progress["so_lenh_chua_cham"] == 1


# ══════════════════════════════════════════════════════
# Counters
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_khong_duoi_theo_co_counts_only_cho_xac_nhan(db_session, test_user):
    """The discipline count is "gặp cờ VÀ chờ xác nhận" — buying into the wall
    anyway is recorded but never counted, and a plain order with no cờ is
    neither."""
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]

    await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="D1", co=True, hanh_vi="cho_xac_nhan",
    )
    await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="D2", co=True, hanh_vi="cho_xac_nhan",
    )
    await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="D3", co=True, hanh_vi="mua_duoi_theo",
    )
    await _doc_luc_order(
        db_session, services, account.id, test_user.id, symbol="D4",
    )

    progress = await cap7.get_progress(test_user.id)
    assert progress["so_lenh_doc_luc"] == 4
    assert progress["so_lan_khong_duoi_theo_co"] == 2
    assert progress["so_lan_gap_co"] == 3
    assert progress["so_lan_mua_duoi_theo"] == 1
    assert progress["task_1_done_at"] is not None


@pytest.mark.asyncio
async def test_plain_cap1_to_6_orders_never_count(db_session, test_user):
    services, account = await _enter_cap7(db_session, test_user.id)
    await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id, symbol="PLAIN"
    )
    progress = await services["cap7"].get_progress(test_user.id)
    assert progress["so_lenh_doc_luc"] == 0
    assert progress["task_1_done_at"] is None


@pytest.mark.asyncio
async def test_task2_needs_a_closed_round_trip_with_doc_luc(db_session, test_user):
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]

    await _doc_luc_order(
        db_session, services, account.id, test_user.id, symbol="K1", close=False
    )
    progress = await cap7.get_progress(test_user.id)
    assert progress["task_1_done_at"] is not None
    assert progress["task_2_done_at"] is None

    await _doc_luc_order(
        db_session, services, account.id, test_user.id, symbol="K2", close=True
    )
    progress = await cap7.get_progress(test_user.id)
    assert progress["task_2_done_at"] is not None


# ══════════════════════════════════════════════════════
# Thách thức Đọc sổ lệnh (nhiệm vụ ③) — each leg alone
# ══════════════════════════════════════════════════════


async def _make_task3(
    db_session,
    services,
    account,
    user_id,
    monkeypatch,
    *,
    n: int = 15,
    n_co: int = 3,
    n_dung: int = 15,
):
    """``n`` đọc-lực orders (all backdated + scoreable), of which ``n_co`` met a
    cờ and waited, and the first ``n_dung`` read the force correctly."""
    trading_date = date.today() - timedelta(days=30)
    _patch_ohlcv(monkeypatch, _series_for(trading_date, _BUY_PRICE * 1.05))
    for i in range(n):
        # +5% actual: guessing "manh" is right, "yeu" is wrong.
        await _doc_luc_order(
            db_session,
            services,
            account.id,
            user_id,
            symbol=f"T3{i:02d}",
            luc_doc_user="manh" if i < n_dung else "yeu",
            co=i < n_co,
            hanh_vi="cho_xac_nhan" if i < n_co else None,
            days_ago=30,
            close=(i == 0),
        )


@pytest.mark.asyncio
async def test_thach_thuc_shape_and_all_three_legs(db_session, test_user, monkeypatch):
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    _patch_ohlcv(monkeypatch, {})

    result = await cap7.thach_thuc(test_user.id)
    assert result["dat_ca_3"] is False
    for key in ("so_lenh_doc_luc", "so_lan_khong_duoi_theo_co", "ty_le_doc_luc_dung"):
        assert result[key]["ten"]
        assert result[key]["giai_thich"]  # §C12c — never a bare number
        assert result[key]["dat"] is False
    assert result["so_lenh_doc_luc"]["muc_tieu"] == 15
    assert result["so_lan_khong_duoi_theo_co"]["muc_tieu"] == 3
    assert result["ty_le_doc_luc_dung"]["muc_tieu"] == 55.0
    assert result["so_phien_cham"] == SO_PHIEN_CHAM_LUC

    await _make_task3(db_session, services, account, test_user.id, monkeypatch)

    result = await cap7.thach_thuc(test_user.id)
    assert result["so_lenh_doc_luc"]["gia_tri_hien_tai"] == 15
    assert result["so_lan_khong_duoi_theo_co"]["gia_tri_hien_tai"] == 3
    assert result["ty_le_doc_luc_dung"]["gia_tri_hien_tai"] == pytest.approx(100.0)
    assert result["dat_ca_3"] is True

    progress = await cap7.get_progress(test_user.id)
    assert progress["task_1_done_at"] is not None
    assert progress["task_2_done_at"] is not None
    assert progress["task_3_done_at"] is not None


@pytest.mark.asyncio
async def test_task3_fails_when_only_so_lenh_short(db_session, test_user, monkeypatch):
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    await _make_task3(
        db_session, services, account, test_user.id, monkeypatch, n=14, n_dung=14
    )
    result = await cap7.thach_thuc(test_user.id)
    assert result["so_lenh_doc_luc"]["dat"] is False
    assert result["so_lan_khong_duoi_theo_co"]["dat"] is True
    assert result["ty_le_doc_luc_dung"]["dat"] is True
    assert result["dat_ca_3"] is False
    progress = await cap7.get_progress(test_user.id)
    assert progress["task_3_done_at"] is None


@pytest.mark.asyncio
async def test_task3_fails_when_only_co_discipline_short(
    db_session, test_user, monkeypatch
):
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    await _make_task3(
        db_session, services, account, test_user.id, monkeypatch, n=15, n_co=2
    )
    result = await cap7.thach_thuc(test_user.id)
    assert result["so_lenh_doc_luc"]["dat"] is True
    assert result["so_lan_khong_duoi_theo_co"]["dat"] is False
    assert result["ty_le_doc_luc_dung"]["dat"] is True
    assert result["dat_ca_3"] is False


@pytest.mark.asyncio
async def test_task3_fails_when_only_ty_le_short(db_session, test_user, monkeypatch):
    """8/15 correct = 53.3% — just under the 55% bar (spec §2③'s deliberately
    lower bar than Cấp 5's, because reading the book is noisier)."""
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    await _make_task3(
        db_session, services, account, test_user.id, monkeypatch, n=15, n_dung=8
    )
    result = await cap7.thach_thuc(test_user.id)
    assert result["so_lenh_doc_luc"]["dat"] is True
    assert result["so_lan_khong_duoi_theo_co"]["dat"] is True
    assert result["ty_le_doc_luc_dung"]["gia_tri_hien_tai"] == pytest.approx(
        8 / 15 * 100.0
    )
    assert result["ty_le_doc_luc_dung"]["dat"] is False
    assert result["dat_ca_3"] is False


@pytest.mark.asyncio
async def test_ty_le_leg_hides_its_statistic_below_3_scored_orders(
    db_session, test_user, monkeypatch
):
    """Spec §7: <3 lệnh đọc lực đã chấm → chỉ đếm, ẩn thống kê. The leg is then
    neither passed nor held against the user."""
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    await _make_task3(
        db_session, services, account, test_user.id, monkeypatch, n=2, n_co=0
    )
    result = await cap7.thach_thuc(test_user.id)
    assert result["ty_le_doc_luc_dung"]["du_du_lieu"] is False
    assert result["ty_le_doc_luc_dung"]["dat"] is False
    assert "3" in result["ty_le_doc_luc_dung"]["giai_thich"]


@pytest.mark.asyncio
async def test_mark_task_recomputes_only(db_session, test_user):
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    with pytest.raises(BadRequestError):
        await cap7.mark_task(test_user.id, 9)

    progress = await cap7.mark_task(test_user.id, 1)
    assert progress["task_1_done_at"] is None  # no history → no fabrication

    await _doc_luc_order(
        db_session, services, account.id, test_user.id, symbol="MT1"
    )
    progress = await cap7.mark_task(test_user.id, 1)
    assert progress["task_1_done_at"] is not None
    assert progress["task_2_done_at"] is None


@pytest.mark.asyncio
async def test_thach_thuc_requires_progress(db_session, test_user):
    cap7 = Cap7Service(db_session)
    with pytest.raises(NotFoundError):
        await cap7.thach_thuc(test_user.id)


# ══════════════════════════════════════════════════════
# ★ HONESTY — no fake-order detection claim, anywhere
# ══════════════════════════════════════════════════════


def _all_strings(value) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [s for v in value.values() for s in _all_strings(v)]
    if isinstance(value, (list, tuple)):
        return [s for v in value for s in _all_strings(v)]
    return []


@pytest.mark.asyncio
async def test_api_copy_never_claims_fake_order_detection(
    db_session, test_user, monkeypatch
):
    """★ Spec §5/§9: the cờ is EDUCATIONAL. Nothing the API returns may claim
    IQX detected a fake order, label the current book "lệnh giả" as a fact, or
    promise tick-level detection."""
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    _patch_ohlcv(monkeypatch, {})
    buy, kehoach = await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="HN1", co=True, hanh_vi="mua_duoi_theo",
    )

    payloads = [
        await cap7.phien(test_user.id),
        await cap7.thach_thuc(test_user.id),
        await cap7.get_progress(test_user.id),
        cap7.kehoach_out(kehoach),
        await cap7.get_kehoach(test_user.id, buy.id),
    ]
    strings = [s for p in payloads for s in _all_strings(p)]
    assert strings

    forbidden = (
        "phát hiện lệnh giả",
        "đã phát hiện",
        "là lệnh giả",
        "chắc chắn là lệnh giả",
        "theo dõi từng tick",
        "tick-by-tick",
    )
    for text in strings:
        low = text.lower()
        for phrase in forbidden:
            assert phrase not in low, (phrase, text)

    # And the cờ copy states the honest limitation out loud.
    co_copy = (await cap7.phien(test_user.id))["quy_tac"]["co_canh_giac_copy"]
    assert "chưa chắc" in co_copy.lower()
    assert "khớp thật" in co_copy.lower()


# ══════════════════════════════════════════════════════
# Graduation
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_graduate_requires_3_of_3(db_session, test_user, monkeypatch):
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    _patch_ohlcv(monkeypatch, {})

    with pytest.raises(ConflictError):
        await cap7.graduate(test_user.id)

    await _make_task3(
        db_session, services, account, test_user.id, monkeypatch, n=14, n_dung=14
    )
    with pytest.raises(ConflictError):  # 14 lệnh — ③ chưa đạt
        await cap7.graduate(test_user.id)

    trading_date = date.today() - timedelta(days=30)
    _patch_ohlcv(monkeypatch, _series_for(trading_date, _BUY_PRICE * 1.05))
    await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="GZ", luc_doc_user="manh", days_ago=30,
    )

    progress = await cap7.get_progress(test_user.id)
    assert progress["task_1_done_at"] is not None
    assert progress["task_2_done_at"] is not None
    assert progress["task_3_done_at"] is not None

    progress = await cap7.graduate(test_user.id)
    assert progress["graduated_at"] is not None
    assert progress["time_to_graduate_hours"] is not None

    first = progress["graduated_at"]
    again = await cap7.graduate(test_user.id)
    assert again["graduated_at"] == first


# ══════════════════════════════════════════════════════
# GET /cap7/kehoach/{order_id} — đọc lại đọc lực của MỘT lệnh (Kết sổ)
# ══════════════════════════════════════════════════════


async def _second_user(db_session, email: str = "other-cap7@example.com"):
    """A second user + their own VT account — for the ownership check."""
    from app.core.security import hash_password
    from app.models.user import User, UserRole, UserStatus

    user = User(
        email=email,
        hashed_password=hash_password("Test@1234"),
        full_name="Other User",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    account = await VirtualTradingRepository(db_session).create_account(
        user.id, 250_000_000
    )
    return user, account


@pytest.mark.asyncio
async def test_get_kehoach_returns_the_stored_reading_with_its_scoring_context(
    db_session, test_user, monkeypatch
):
    """The Kết sổ reads back the reading + everything it needs to explain how it
    will be judged (số phiên chấm, dead band, hạn chấm) — no FE-side rules."""
    services, account = await _enter_cap7(db_session, test_user.id)
    _patch_ohlcv(monkeypatch, {})
    buy, _kehoach = await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="RD1", luc_chi_so=1.9, luc_doc_user="manh", co=True,
        hanh_vi="cho_xac_nhan", days_ago=0,
    )

    out = await services["cap7"].get_kehoach(test_user.id, buy.id)
    assert out["co_du_lieu"] is True
    assert out["order_id"] == buy.id
    assert out["symbol"] == "RD1"
    assert out["luc_chi_so"] == pytest.approx(1.9)
    assert out["luc_band"] == BandLuc.CAU_AP_DAO.value
    assert out["luc_band_ten"]
    assert out["luc_doc_user"] == LucDocUser.MANH.value
    assert out["luc_doc_user_ten"]
    assert out["co_canh_giac_lenh_gia"] is True
    assert out["hanh_vi_co"] == HanhViCo.CHO_XAC_NHAN.value
    assert out["hanh_vi_co_ten"]
    # Scoring context — the FE must render THESE numbers, not its own.
    assert out["so_phien_cham"] == SO_PHIEN_CHAM_LUC
    assert out["dead_band_pct"] == NGUONG_DEAD_BAND_PCT
    assert out["han_cham_ngay"] == han_cham_luc_date(buy.trading_date)
    assert out["da_toi_han_cham"] is False
    # Not due yet ⇒ no verdict, and the coach paragraph says so.
    assert out["doc_luc_dung"] is None
    assert out["dien_bien_pct"] is None
    assert out["giai_thich"]


@pytest.mark.asyncio
async def test_get_kehoach_scores_a_due_order_on_read(
    db_session, test_user, monkeypatch
):
    """★ THE GAP THIS ENDPOINT CLOSES. ``doc_luc_dung`` is computed server-side
    later, so without a per-order read the Kết sổ could only ever say "chưa tới
    hạn chấm". This read runs the SAME lazy compute-on-read pass every other
    Cấp 7 read runs, so opening the Kết sổ after the window returns a SCORED
    result."""
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    _patch_ohlcv(monkeypatch, {})
    buy, kehoach = await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="RD2", luc_doc_user="manh", days_ago=30,
    )
    assert kehoach.doc_luc_dung is None  # nothing scored yet

    _patch_ohlcv(monkeypatch, _series_for(buy.trading_date, _BUY_PRICE * 1.05))
    out = await cap7.get_kehoach(test_user.id, buy.id)

    assert out["doc_luc_dung"] is True
    assert out["dien_bien_pct"] == pytest.approx(5.0)
    assert out["da_toi_han_cham"] is True
    assert "ĐÚNG" in out["giai_thich"]
    # …and it was persisted by the shared scoring path, not faked for the read.
    await db_session.refresh(kehoach)
    assert kehoach.doc_luc_dung is True
    assert kehoach.dien_bien_pct == pytest.approx(5.0)


@pytest.mark.asyncio
async def test_get_kehoach_keeps_null_distinct_from_false(
    db_session, test_user, monkeypatch
):
    """★ ``None`` = chưa tới hạn chấm / chưa chấm được · ``False`` = đoán sai.
    Collapsing them would tell a user they were wrong when nothing was scored."""
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    _patch_ohlcv(monkeypatch, {})

    # (a) not due yet — a wildly bullish series exists but the deadline has not
    #     arrived, so the reading stays UNSCORED.
    buy_new, _ = await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="NUL", luc_doc_user="manh", days_ago=0,
    )
    _patch_ohlcv(monkeypatch, _series_for(buy_new.trading_date, _BUY_PRICE * 2))
    fresh = await cap7.get_kehoach(test_user.id, buy_new.id)
    assert fresh["doc_luc_dung"] is None
    assert fresh["doc_luc_dung"] is not False
    assert fresh["da_toi_han_cham"] is False

    # (b) due AND the guess was wrong — that is a real False.
    _patch_ohlcv(monkeypatch, {})
    buy_old, _ = await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="FLS", luc_doc_user="manh", days_ago=30,
    )
    _patch_ohlcv(monkeypatch, _series_for(buy_old.trading_date, _BUY_PRICE * 0.95))
    wrong = await cap7.get_kehoach(test_user.id, buy_old.id)
    assert wrong["doc_luc_dung"] is False
    assert wrong["dien_bien_pct"] == pytest.approx(-5.0)
    assert wrong["da_toi_han_cham"] is True


@pytest.mark.asyncio
async def test_get_kehoach_leaves_an_unscoreable_order_null(
    db_session, test_user, monkeypatch
):
    """Past the deadline but the price for that session is unavailable → still
    ``None``, never "đọc sai" (spec §7 / HONESTY NOTE 2)."""
    services, account = await _enter_cap7(db_session, test_user.id)
    cap7 = services["cap7"]
    _patch_ohlcv(monkeypatch, {})
    buy, _kehoach = await _doc_luc_order(
        db_session, services, account.id, test_user.id,
        symbol="GAP", luc_doc_user="manh", days_ago=30,
    )
    _patch_ohlcv(monkeypatch, None)  # the price source raises

    out = await cap7.get_kehoach(test_user.id, buy.id)
    assert out["doc_luc_dung"] is None
    assert out["dien_bien_pct"] is None
    assert out["da_toi_han_cham"] is True  # tới hạn nhưng chưa chấm được


@pytest.mark.asyncio
async def test_get_kehoach_404_for_another_users_order(
    db_session, test_user, monkeypatch
):
    """Ownership check — a foreign order is 404 (never 403), the same
    convention ``record_kehoach`` uses for an unknown order."""
    services, _account = await _enter_cap7(db_session, test_user.id)
    _patch_ohlcv(monkeypatch, {})
    other, other_account = await _second_user(db_session)
    foreign = await _make_order(db_session, other_account.id, other.id, symbol="AAA")

    with pytest.raises(NotFoundError):
        await services["cap7"].get_kehoach(test_user.id, foreign.id)

    import uuid as _uuid

    with pytest.raises(NotFoundError):
        await services["cap7"].get_kehoach(test_user.id, _uuid.uuid4())


@pytest.mark.asyncio
async def test_get_kehoach_200_with_an_explicit_no_data_signal(
    db_session, test_user, monkeypatch
):
    """An order that predates Cấp 7 (all-null columns) is a NORMAL read with
    ``co_du_lieu = False`` — not a 404, so the FE can tell "chưa ghi bước đọc
    lực" apart from "endpoint hỏng"."""
    services, account = await _enter_cap7(db_session, test_user.id)
    _patch_ohlcv(monkeypatch, {})

    # (a) row exists (Cấp 1 block) but no đọc lực was ever recorded
    buy = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id, symbol="OLD"
    )
    out = await services["cap7"].get_kehoach(test_user.id, buy.id)
    assert out["co_du_lieu"] is False
    assert out["order_id"] == buy.id
    assert out["symbol"] == "OLD"
    assert out["luc_chi_so"] is None
    assert out["luc_band"] is None
    assert out["luc_doc_user"] is None
    assert out["doc_luc_dung"] is None
    assert out["so_phien_cham"] == SO_PHIEN_CHAM_LUC
    assert out["dead_band_pct"] == NGUONG_DEAD_BAND_PCT
    assert out["giai_thich"]

    # (b) no ``order_kehoach`` row at all — same shape, still a 200
    bare = await _make_order(db_session, account.id, test_user.id, symbol="BARE")
    bare_out = await services["cap7"].get_kehoach(test_user.id, bare.id)
    assert bare_out["co_du_lieu"] is False
    assert bare_out["id"] is None
    assert bare_out["giai_thich"] == out["giai_thich"]


@pytest.mark.asyncio
async def test_get_kehoach_requires_progress(db_session, test_user):
    account = await _fast_track_cap6(db_session, test_user.id)
    order = await _make_order(db_session, account.id, test_user.id, symbol="AAA")
    with pytest.raises(NotFoundError):
        await Cap7Service(db_session).get_kehoach(test_user.id, order.id)


# ══════════════════════════════════════════════════════
# HTTP wiring
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_cap7_endpoints_wired_and_free(client, db_session, test_user):
    """Router mounted under /api/v1/cap7, gated by CurrentUser (not premium)."""
    from app.core.security import create_access_token

    account = await _fast_track_cap6(db_session, test_user.id)
    await db_session.commit()

    token = create_access_token(
        subject=test_user.id, extra_claims={"role": test_user.role.value}
    )
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.get("/api/v1/cap7/progress", headers=headers)
    assert r.status_code == 200
    assert r.json() is None

    r = await client.post("/api/v1/cap7/enter", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["so_lenh_doc_luc"] == 0
    assert body["so_lan_khong_duoi_theo_co"] == 0
    assert isinstance(body["trong_phien"], bool)
    assert body["so_phien_cham"] == SO_PHIEN_CHAM_LUC

    r = await client.get("/api/v1/cap7/phien", headers=headers)
    assert r.status_code == 200, r.text
    pbody = r.json()
    assert isinstance(pbody["trong_phien"], bool)
    assert pbody["gio_giao_dich_text"]
    assert pbody["giai_thich"]
    assert pbody["quy_tac"]["so_phien_cham"] == SO_PHIEN_CHAM_LUC
    assert len(pbody["quy_tac"]["bands"]) == 3

    r = await client.post("/api/v1/cap7/graduate", headers=headers)
    assert r.status_code == 409

    services = {
        "cap1": Cap1Service(db_session),
        "cap7": Cap7Service(db_session),
    }
    buy = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id, symbol="HTTP"
    )
    await db_session.commit()

    # Inconsistent cờ / hành vi → 400
    r = await client.post(
        "/api/v1/cap7/kehoach",
        headers=headers,
        json={
            "order_id": str(buy.id),
            "luc_chi_so": 1.9,
            "luc_doc_user": "manh",
            "co_canh_giac_lenh_gia": True,
            "hanh_vi_co": None,
        },
    )
    assert r.status_code == 400, r.text

    r = await client.post(
        "/api/v1/cap7/kehoach",
        headers=headers,
        json={
            "order_id": str(buy.id),
            "luc_chi_so": 1.9,
            "luc_doc_user": "manh",
            "co_canh_giac_lenh_gia": False,
            "hanh_vi_co": None,
        },
    )
    assert r.status_code == 200, r.text
    kbody = r.json()
    assert kbody["luc_doc_user"] == "manh"
    assert kbody["luc_band"] == "cau_ap_dao"
    assert kbody["doc_luc_dung"] is None
    assert kbody["giai_thich"]

    # Per-order read-back for the Kết sổ (runs the lazy chấm pass).
    r = await client.get(f"/api/v1/cap7/kehoach/{buy.id}", headers=headers)
    assert r.status_code == 200, r.text
    dbody = r.json()
    assert dbody["co_du_lieu"] is True
    assert dbody["luc_doc_user"] == "manh"
    assert dbody["luc_band"] == "cau_ap_dao"
    assert dbody["doc_luc_dung"] is None  # chưa tới hạn — KHÔNG phải "sai"
    assert dbody["da_toi_han_cham"] is False
    assert dbody["so_phien_cham"] == SO_PHIEN_CHAM_LUC
    assert dbody["dead_band_pct"] == NGUONG_DEAD_BAND_PCT
    assert dbody["han_cham_ngay"]
    assert dbody["giai_thich"]

    import uuid as _uuid

    r = await client.get(f"/api/v1/cap7/kehoach/{_uuid.uuid4()}", headers=headers)
    assert r.status_code == 404, r.text

    r = await client.patch("/api/v1/cap7/task", headers=headers, json={"task_no": 1})
    assert r.status_code == 200, r.text
    assert r.json()["task_1_done_at"] is not None

    r = await client.get("/api/v1/cap7/thach-thuc", headers=headers)
    assert r.status_code == 200, r.text
    tbody = r.json()
    for key in (
        "dat_ca_3",
        "so_lenh_doc_luc",
        "so_lan_khong_duoi_theo_co",
        "ty_le_doc_luc_dung",
        "so_lenh_da_cham",
        "so_lenh_chua_cham",
        "so_phien_cham",
    ):
        assert key in tbody

    r = await client.post("/api/v1/cap7/cham", headers=headers)
    assert r.status_code == 200, r.text
    assert "so_moi_cham" in r.json()

    r = await client.get("/api/v1/cap7/progress")
    assert r.status_code == 401


def test_dead_band_and_window_are_finite_documented_numbers():
    """Guard against a future edit turning a documented constant into something
    unfalsifiable (an infinite dead band would make every guess "can")."""
    assert math.isfinite(NGUONG_DEAD_BAND_PCT)
    assert 0 < NGUONG_DEAD_BAND_PCT < 7  # HOSE's daily band is ±7%
    assert 1 <= SO_PHIEN_CHAM_LUC <= 3  # spec §4's window
    assert han_cham_luc_date(date(2026, 7, 31)) == date(2026, 8, 4)  # Fri +2 phiên
