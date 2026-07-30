"""Tests for the Cấp 5 «Lão luyện» backend — verdict hệ gợi ý + provenance,
phân loại 4 ô (quyết định × kết quả), đứng ngoài có chủ đích + chấm né
đúng/hụt sau 5 phiên, Thách thức Lão luyện, graduation.

Mirrors ``tests/test_cap4.py``'s style. Uses the ``test_user``/``db_session``
fixtures from ``tests/conftest.py``.

**Setup cost note.** Cấp 5's only real prerequisite is
``Cap4Progress.graduated_at``; replaying Cấp 0→4's full graduation costs ~60
service round trips per test. ``test_enter_requires_cap4_graduated`` DOES
exercise the real Cấp 0-4 chain (so the gate is pinned against the real
services); every other test uses ``_fast_track_cap4`` which stamps the
prerequisite progress rows directly.

**THE PRINCIPLE (spec §1/§4):** đúng/sai measures the PROCESS only — a losing
order that followed the plan is ``dung_thua``. ``test_losing_but_disciplined_
order_is_dung`` pins that down.

Đứng-ngoài scoring is lazy compute-on-read, so the price sources
(``resolve_price`` for the snapshot at decision time, ``get_adjusted_ohlcv``
for the close 5 phiên later) are monkeypatched at their import site in
``app.services.cap5.service`` — no network in tests.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest

from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    ServiceUnavailableError,
    UnprocessableEntityError,
)
from app.models.cap1 import Cap1Progress
from app.models.cap2 import Cap2Progress
from app.models.cap3 import Cap3Progress
from app.models.cap4 import Cap4Progress
from app.models.virtual_trading import OrderSide, OrderStatus, OrderType, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.cap0.service import Cap0Service
from app.services.cap1.service import Cap1Service
from app.services.cap2.service import Cap2Service
from app.services.cap3.service import Cap3Service
from app.services.cap4.service import Cap4Service
from app.services.cap5.service import Cap5Service, han_cham_date
from app.services.ta.indicators import OHLCV
from app.services.virtual_trading.price_resolver import PriceResult, PriceUnavailableError

_SVC = "app.services.cap5.service"

_ALL_NEU = {
    "ky_thuat": "neu",
    "dong_tien": "neu",
    "noi_bo": "neu",
    "tin_tuc": "neu",
    "dinh_gia": "neu",
}


def _doc(**overrides: str) -> dict[str, str]:
    """A fully-rated 5-lớp map with all 5 lớp = 'neu' unless overridden."""
    return {**_ALL_NEU, **overrides}


_AI_DONG_THUAN_CAO = _doc(ky_thuat="ok", dong_tien="ok", noi_bo="ok")  # 3/5 Ủng hộ
_AI_DONG_THUAN_THAP = _doc(ky_thuat="ok")  # 1/5 Ủng hộ


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
    price: int = 20_000,
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


async def _fast_track_cap4(db_session, user_id, *, khau_vi: str = "can_bang"):
    """Stamp the Cấp 1-4 progress rows a Cấp 5 flow needs + a VT account.

    Cấp 5 gates only on ``Cap4Progress.graduated_at``; Cấp 1/2/3's rows are
    needed because their ``record_kehoach``/``record_ketso`` calls (which write
    the process data Cấp 5's verdict reads) require them. See the module
    docstring for why the full chain is replayed in only one test.
    """
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
                khau_vi=khau_vi,
                graduated_at=now,
            ),
            Cap4Progress(user_id=user_id, entered_at=now, graduated_at=now),
        ]
    )
    await db_session.flush()
    return account


async def _enter_cap5(db_session, user_id, *, khau_vi: str = "can_bang"):
    """Fast-track Cấp 1-4 then enter Cấp 5.

    Returns ``(services, account)`` where ``services`` is a dict of the cap1-5
    service objects the round-trip helper needs.
    """
    account = await _fast_track_cap4(db_session, user_id, khau_vi=khau_vi)
    services = {
        "cap1": Cap1Service(db_session),
        "cap2": Cap2Service(db_session),
        "cap3": Cap3Service(db_session),
        "cap4": Cap4Service(db_session),
        "cap5": Cap5Service(db_session),
    }
    await services["cap5"].enter(user_id)
    return services, account


async def _round_trip(
    db_session,
    services,
    account_id,
    user_id,
    *,
    symbol: str,
    win: bool = True,
    trang_thai: str = "ung_ho",
    ai_5_lop: dict[str, str] | None = _AI_DONG_THUAN_CAO,
    with_cap4: bool = True,
    with_cap3: bool = True,
    khau_vi: str = "can_bang",
    pct_von: float = 20.0,
    with_cap2_ketso: bool = True,
    buy_price: int = 20_000,
    **vi_pham_flags,
):
    """One complete Cấp 1→4 round trip (buy plan with every level's block +
    sell + Cấp 1 kết sổ + Cấp 2 discipline flags). Returns the SELL order.

    This is the process data Cấp 5's suggested verdict reads back.
    """
    today = date.today()
    sell_price = 22_000 if win else 18_000
    buy = await _make_order(
        db_session, account_id, user_id, symbol=symbol, price=buy_price, trading_date=today
    )
    await services["cap1"].record_kehoach(
        user_id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat=trang_thai, vung_mua=buy_price
    )
    await services["cap2"].record_kehoach(
        user_id, buy.id, phuong_phap_sl_tp="bien_do_dao_dong", cat_lo=18_000, chot_loi=25_000
    )
    if with_cap3:
        await services["cap3"].record_kehoach(
            user_id,
            buy.id,
            khau_vi=khau_vi,
            muc_tu_tin=3,
            cach_khoi_luong="linh_hoat",
            khoi_luong=100,
            pct_von=pct_von,
        )
    if with_cap4:
        await services["cap4"].record_kehoach(
            user_id, buy.id, doc_5_lop=_doc(ky_thuat="ok"), ai_5_lop=ai_5_lop
        )
    sell = await _make_order(
        db_session,
        account_id,
        user_id,
        symbol=symbol,
        side=OrderSide.SELL,
        price=sell_price,
        trading_date=today,
    )
    await services["cap1"].record_ketso(user_id, sell.id)
    if with_cap2_ketso:
        await services["cap2"].record_ketso(user_id, sell.id, **vi_pham_flags)
    return sell


# ── Price-source fakes (no network) ───────────────────


def _patch_resolve_price(monkeypatch, price_vnd: int | None):
    """Patch the đứng-ngoài snapshot price. ``None`` → source unavailable."""

    async def _fake(symbol, **kwargs):
        if price_vnd is None:
            raise PriceUnavailableError(symbol, "test: no price")
        return PriceResult(price_vnd=price_vnd, source="close", timestamp=datetime.now(UTC))

    monkeypatch.setattr(f"{_SVC}.resolve_price", _fake)


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


async def _log_backdated_standby(
    db_session, cap5, user_id, *, symbol: str, reason: str = "dinh_gia_dat", days_ago: int = 30
):
    """Log a đứng-ngoài decision then backdate it so its 5-phiên window has
    elapsed (wall-clock ``decided_at`` would never be due)."""
    decision = await cap5.log_dung_ngoai(user_id, symbol, reason)
    decision.decided_at = datetime.now(UTC) - timedelta(days=days_ago)
    await db_session.flush()
    await db_session.refresh(decision)
    return decision


def _due_date(decision) -> date:
    """The session Cấp 5 scores against — imported from the service so the test
    and the implementation can never drift on the 5-phiên window."""
    return han_cham_date(decision.decided_at)


def _series_around(decision, close_on_due: float) -> dict[date, float]:
    """A daily close series covering the decision → due window, plus 3 sessions
    after the due date (so the due bar is unambiguously final)."""
    decided_on = decision.decided_at.date()
    due = _due_date(decision)
    closes: dict[date, float] = {}
    d = decided_on
    while d <= due + timedelta(days=5):
        if d.weekday() < 5:
            closes[d] = close_on_due if d == due else close_on_due * 0.9
        d += timedelta(days=1)
    return closes


# ══════════════════════════════════════════════════════
# Enter / prerequisites
# ══════════════════════════════════════════════════════


async def _graduate_cap0(db_session, user_id) -> None:
    cap0 = Cap0Service(db_session)
    await cap0.enter(user_id)
    for n in (1, 2, 3, 4, 5, 6):
        await cap0.complete_task(user_id, n)
    await cap0.complete_task(user_id, 5, gate="sl_typed")
    await cap0.complete_task(user_id, 6, gate="debrief")
    await cap0.complete_task(user_id, 1, gate="star")
    await cap0.graduate(user_id)


@pytest.mark.asyncio
async def test_enter_requires_cap4_graduated(db_session, test_user):
    """Exercises the REAL Cấp 0→4 chain (the one test that does — see module
    docstring)."""
    cap5 = Cap5Service(db_session)

    # No Cấp 4 progress at all.
    with pytest.raises(NotFoundError):
        await cap5.enter(test_user.id)

    await _graduate_cap0(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    cap3 = Cap3Service(db_session)
    cap4 = Cap4Service(db_session)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    # Cấp 1
    await cap1.enter(test_user.id)
    ly_dos = ["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]
    for i in range(10):
        buy = await _make_order(
            db_session, account.id, test_user.id, symbol=f"G{i}", trading_date=date(2026, 1, 5)
        )
        await cap1.record_kehoach(
            test_user.id,
            buy.id,
            ly_do=ly_dos[i % 5],
            trang_thai_luc_dat="ung_ho",
            vung_mua=20_000,
        )
    sell = await _make_order(
        db_session,
        account.id,
        test_user.id,
        symbol="G0",
        side=OrderSide.SELL,
        price=21_000,
        trading_date=date(2026, 1, 8),
    )
    await cap1.record_ketso(test_user.id, sell.id)
    for d in (10, 11, 12):
        await cap1.record_portfolio_view(test_user.id, as_of=date(2026, 1, d))
    await cap1.graduate(test_user.id)

    # Cấp 2 — 20 round trips, 5 of them a clean cắt lỗ
    await cap2.enter(test_user.id)
    day0 = date(2026, 2, 1)
    for i in range(20):
        td = day0 + timedelta(days=i)
        buy = await _make_order(
            db_session, account.id, test_user.id, symbol=f"P{i}", trading_date=td
        )
        await cap1.record_kehoach(
            test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000
        )
        await cap2.record_kehoach(
            test_user.id,
            buy.id,
            phuong_phap_sl_tp="bien_do_dao_dong",
            cat_lo=18_000,
            chot_loi=25_000,
        )
        s = await _make_order(
            db_session,
            account.id,
            test_user.id,
            symbol=f"P{i}",
            side=OrderSide.SELL,
            price=25_500 if i < 5 else 20_000,
            trading_date=td,
        )
        await cap1.record_ketso(test_user.id, s.id)
        await cap2.record_ketso(test_user.id, s.id, cham_sl_cat_dung_phien_ke=i < 5)
    await cap2.graduate(test_user.id)

    # Cấp 3
    await cap3.enter(test_user.id)
    await cap3.set_khau_vi(test_user.id, "can_bang")
    today = date.today()
    for i in range(15):
        buy = await _make_order(
            db_session, account.id, test_user.id, symbol=f"Z{i}", trading_date=today
        )
        await cap1.record_kehoach(
            test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000
        )
        await cap2.record_kehoach(
            test_user.id,
            buy.id,
            phuong_phap_sl_tp="bien_do_dao_dong",
            cat_lo=18_000,
            chot_loi=25_000,
        )
        await cap3.record_kehoach(
            test_user.id,
            buy.id,
            khau_vi="can_bang",
            muc_tu_tin=3,
            cach_khoi_luong="linh_hoat",
            khoi_luong=100,
            pct_von=20.0,
        )
        s = await _make_order(
            db_session,
            account.id,
            test_user.id,
            symbol=f"Z{i}",
            side=OrderSide.SELL,
            price=25_500,
            trading_date=today,
        )
        await cap1.record_ketso(test_user.id, s.id)
        await cap2.record_ketso(test_user.id, s.id, cham_sl_cat_dung_phien_ke=True)
    await cap3.graduate(test_user.id)

    # Entered Cấp 4 but not graduated → conflict.
    await cap4.enter(test_user.id)
    with pytest.raises(ConflictError):
        await cap5.enter(test_user.id)

    # Cấp 4 — 20 fully-rated orders satisfying all 3 legs.
    for i in range(12):
        buy = await _make_order(
            db_session, account.id, test_user.id, symbol=f"AA{i}", trading_date=today
        )
        await cap1.record_kehoach(
            test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000
        )
        await cap4.record_kehoach(
            test_user.id, buy.id, doc_5_lop=_doc(ky_thuat="ok"), ai_5_lop=_AI_DONG_THUAN_CAO
        )
        s = await _make_order(
            db_session,
            account.id,
            test_user.id,
            symbol=f"AA{i}",
            side=OrderSide.SELL,
            price=22_000 if i < 10 else 18_000,
            trading_date=today,
        )
        await cap1.record_ketso(test_user.id, s.id)
    for i in range(8):
        buy = await _make_order(
            db_session, account.id, test_user.id, symbol=f"BB{i}", trading_date=today
        )
        await cap1.record_kehoach(
            test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000
        )
        await cap4.record_kehoach(
            test_user.id, buy.id, doc_5_lop=_doc(tin_tuc="ok"), ai_5_lop=_doc(dinh_gia="ok")
        )
        s = await _make_order(
            db_session,
            account.id,
            test_user.id,
            symbol=f"BB{i}",
            side=OrderSide.SELL,
            price=22_000 if i < 2 else 18_000,
            trading_date=today,
        )
        await cap1.record_ketso(test_user.id, s.id)
    await cap4.graduate(test_user.id)

    progress = await cap5.enter(test_user.id)
    assert progress.user_id == test_user.id
    assert progress.graduated_at is None
    assert progress.so_lenh_phan_loai == 0
    assert progress.so_lan_dung_ngoai_da_cham == 0
    assert progress.ty_le_quyet_dinh_dung == 0.0

    # idempotent
    progress2 = await cap5.enter(test_user.id)
    assert progress2.id == progress.id


@pytest.mark.asyncio
async def test_get_progress_none_before_enter(db_session, test_user):
    cap5 = Cap5Service(db_session)
    assert await cap5.get_progress(test_user.id) is None


# ══════════════════════════════════════════════════════
# GET /cap5/verdict/{order_id} — hệ gợi ý + provenance
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_verdict_by_the_book_order_is_dung(db_session, test_user):
    services, account = await _enter_cap5(db_session, test_user.id)
    sell = await _round_trip(
        db_session, services, account.id, test_user.id, symbol="OK1", win=True
    )

    result = await services["cap5"].suggested_verdict(test_user.id, sell.id)
    assert result["verdict"] == "dung"
    by_ma = {s["ma"]: s for s in result["signals"]}
    assert set(by_ma) == {"co_so", "ky_luat_thoat", "khong_nhoi", "khoi_luong_khop"}
    for signal in result["signals"]:
        assert signal["dat"] is True
        assert signal["ten"]
        assert signal["giai_thich"]  # §C12c — provenance always present
    assert result["o_4_du_kien"] == "dung_thang"


@pytest.mark.asyncio
async def test_verdict_fails_when_no_co_so(db_session, test_user):
    """Lý do chính ngược chiều AND <3 lớp đồng thuận → không có cơ sở."""
    services, account = await _enter_cap5(db_session, test_user.id)
    sell = await _round_trip(
        db_session,
        services,
        account.id,
        test_user.id,
        symbol="NOCS",
        trang_thai="nguoc_chieu",
        ai_5_lop=_AI_DONG_THUAN_THAP,
    )

    result = await services["cap5"].suggested_verdict(test_user.id, sell.id)
    assert result["verdict"] == "sai"
    by_ma = {s["ma"]: s for s in result["signals"]}
    assert by_ma["co_so"]["dat"] is False
    assert by_ma["ky_luat_thoat"]["dat"] is True
    assert by_ma["khong_nhoi"]["dat"] is True
    assert by_ma["khoi_luong_khop"]["dat"] is True


@pytest.mark.asyncio
async def test_verdict_co_so_from_cap1_ung_ho_alone(db_session, test_user):
    """Cấp 4's đồng thuận is low but Cấp 1's lý do chính is Ủng hộ → cơ sở OK
    (the two sources are OR'd, spec §1)."""
    services, account = await _enter_cap5(db_session, test_user.id)
    sell = await _round_trip(
        db_session,
        services,
        account.id,
        test_user.id,
        symbol="CS1",
        trang_thai="ung_ho",
        ai_5_lop=_AI_DONG_THUAN_THAP,
    )
    result = await services["cap5"].suggested_verdict(test_user.id, sell.id)
    assert result["verdict"] == "dung"
    by_ma = {s["ma"]: s for s in result["signals"]}
    assert by_ma["co_so"]["dat"] is True


@pytest.mark.asyncio
async def test_verdict_fails_on_each_exit_discipline_violation(db_session, test_user):
    """Kỷ luật thoát breaks on ANY of Cấp 2's 3 exit violations."""
    services, account = await _enter_cap5(db_session, test_user.id)
    for i, flag in enumerate(
        ("cham_sl_khong_cat", "cham_tp_giu_lam_hut", "ban_som_khi_lo_nhe")
    ):
        sell = await _round_trip(
            db_session,
            services,
            account.id,
            test_user.id,
            symbol=f"VP{i}",
            **{flag: True},
        )
        result = await services["cap5"].suggested_verdict(test_user.id, sell.id)
        by_ma = {s["ma"]: s for s in result["signals"]}
        assert result["verdict"] == "sai", flag
        assert by_ma["ky_luat_thoat"]["dat"] is False, flag
        assert by_ma["co_so"]["dat"] is True, flag
        assert by_ma["khong_nhoi"]["dat"] is True, flag


@pytest.mark.asyncio
async def test_verdict_fails_when_nhoi_lenh_khi_lo(db_session, test_user):
    services, account = await _enter_cap5(db_session, test_user.id)
    sell = await _round_trip(
        db_session,
        services,
        account.id,
        test_user.id,
        symbol="NHOI",
        nhoi_lenh_khi_lo=True,
    )
    result = await services["cap5"].suggested_verdict(test_user.id, sell.id)
    by_ma = {s["ma"]: s for s in result["signals"]}
    assert result["verdict"] == "sai"
    assert by_ma["khong_nhoi"]["dat"] is False
    assert by_ma["ky_luat_thoat"]["dat"] is True


@pytest.mark.asyncio
async def test_verdict_fails_when_khoi_luong_over_khau_vi(db_session, test_user):
    """35% vốn on a Cân bằng khẩu vị (trần 20%) → khối lượng không khớp."""
    services, account = await _enter_cap5(db_session, test_user.id)
    sell = await _round_trip(
        db_session, services, account.id, test_user.id, symbol="KL1", pct_von=35.0
    )
    result = await services["cap5"].suggested_verdict(test_user.id, sell.id)
    by_ma = {s["ma"]: s for s in result["signals"]}
    assert result["verdict"] == "sai"
    assert by_ma["khoi_luong_khop"]["dat"] is False
    assert "20" in by_ma["khoi_luong_khop"]["giai_thich"]


@pytest.mark.asyncio
async def test_verdict_khoi_luong_tolerance(db_session, test_user):
    """Lot rounding lands slightly over the trần — inside the tolerance it
    still counts as khớp."""
    services, account = await _enter_cap5(db_session, test_user.id)
    sell = await _round_trip(
        db_session, services, account.id, test_user.id, symbol="KL2", pct_von=20.4
    )
    result = await services["cap5"].suggested_verdict(test_user.id, sell.id)
    by_ma = {s["ma"]: s for s in result["signals"]}
    assert by_ma["khoi_luong_khop"]["dat"] is True
    assert result["verdict"] == "dung"


@pytest.mark.asyncio
async def test_verdict_reports_missing_data_as_unknown_not_passed(db_session, test_user):
    """A signal whose source data was never recorded is reported ``dat=None``
    (chưa có dữ liệu) — never silently 'passed'. It is excluded from the AND."""
    services, account = await _enter_cap5(db_session, test_user.id)
    sell = await _round_trip(
        db_session,
        services,
        account.id,
        test_user.id,
        symbol="NODATA",
        with_cap3=False,  # no pct_von → khối lượng not assessable
        with_cap4=False,  # no đồng thuận → cơ sở falls back to Cấp 1
    )
    result = await services["cap5"].suggested_verdict(test_user.id, sell.id)
    by_ma = {s["ma"]: s for s in result["signals"]}
    assert by_ma["khoi_luong_khop"]["dat"] is None
    assert "chưa" in by_ma["khoi_luong_khop"]["giai_thich"].lower()
    assert by_ma["co_so"]["dat"] is True  # Cấp 1 'ung_ho' alone
    assert result["verdict"] == "dung"  # unknown signals don't fail the user


@pytest.mark.asyncio
async def test_verdict_requires_progress_and_a_ketso_row(db_session, test_user):
    account = await _fast_track_cap4(db_session, test_user.id)
    cap5 = Cap5Service(db_session)
    sell = await _make_order(
        db_session, account.id, test_user.id, symbol="ZZZ", side=OrderSide.SELL
    )
    with pytest.raises(NotFoundError):  # no Cấp 5 progress
        await cap5.suggested_verdict(test_user.id, sell.id)

    await cap5.enter(test_user.id)
    with pytest.raises(NotFoundError):  # no Cấp 1 kết sổ for this order
        await cap5.suggested_verdict(test_user.id, sell.id)


@pytest.mark.asyncio
async def test_verdict_rejects_buy_order(db_session, test_user):
    services, account = await _enter_cap5(db_session, test_user.id)
    buy = await _make_order(db_session, account.id, test_user.id, symbol="BUY1")
    with pytest.raises(BadRequestError):
        await services["cap5"].suggested_verdict(test_user.id, buy.id)


# ══════════════════════════════════════════════════════
# ★ THE PRINCIPLE — process only, never the P&L
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_losing_but_disciplined_order_is_dung(db_session, test_user):
    """★ A LOSING order that followed the plan is a CORRECT decision (spec §1
    "đúng/sai đo QUY TRÌNH, không đo kết quả"). Two identical processes that
    differ ONLY in P&L must get the SAME verdict + the same signal list."""
    services, account = await _enter_cap5(db_session, test_user.id)
    win_sell = await _round_trip(
        db_session, services, account.id, test_user.id, symbol="WIN", win=True
    )
    lose_sell = await _round_trip(
        db_session, services, account.id, test_user.id, symbol="LOSE", win=False
    )

    won = await services["cap5"].suggested_verdict(test_user.id, win_sell.id)
    lost = await services["cap5"].suggested_verdict(test_user.id, lose_sell.id)

    assert won["verdict"] == "dung"
    assert lost["verdict"] == "dung"  # ← the whole point of Cấp 5
    assert lost["pnl_pct"] < 0
    assert [(s["ma"], s["dat"]) for s in lost["signals"]] == [
        (s["ma"], s["dat"]) for s in won["signals"]
    ]
    # Only the ô differs, because only the OUTCOME differs.
    assert won["o_4_du_kien"] == "dung_thang"
    assert lost["o_4_du_kien"] == "dung_thua"


@pytest.mark.asyncio
async def test_winning_but_undisciplined_order_is_sai(db_session, test_user):
    """The mirror image: a WINNING order that broke the plan is still SAI
    (the ⚠ Sai-Thắng cell — may mắn, không phải năng lực)."""
    services, account = await _enter_cap5(db_session, test_user.id)
    sell = await _round_trip(
        db_session,
        services,
        account.id,
        test_user.id,
        symbol="LUCK",
        win=True,
        nhoi_lenh_khi_lo=True,
    )
    result = await services["cap5"].suggested_verdict(test_user.id, sell.id)
    assert result["verdict"] == "sai"
    assert result["pnl_pct"] > 0
    assert result["o_4_du_kien"] == "sai_thang"


# ══════════════════════════════════════════════════════
# POST /cap5/ketso — verdict hybrid + 4 ô
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_ketso_confirm_persists_both_verdicts_and_provenance(db_session, test_user):
    services, account = await _enter_cap5(db_session, test_user.id)
    sell = await _round_trip(
        db_session, services, account.id, test_user.id, symbol="C1", win=True
    )

    ketso = await services["cap5"].record_ketso(test_user.id, sell.id, verdict_user="dung")
    assert ketso.verdict_he == "dung"
    assert ketso.verdict_user == "dung"
    assert ketso.ly_do_sua is None
    assert ketso.o_4 == "dung_thang"
    assert isinstance(ketso.verdict_provenance, dict)
    assert ketso.verdict_provenance["verdict_he"] == "dung"
    assert len(ketso.verdict_provenance["signals"]) == 4


@pytest.mark.asyncio
async def test_ketso_override_requires_ly_do_sua(db_session, test_user):
    services, account = await _enter_cap5(db_session, test_user.id)
    sell = await _round_trip(
        db_session, services, account.id, test_user.id, symbol="C2", win=True
    )

    # Hệ says 'dung'; user overrides to 'sai' without a reason → 422.
    with pytest.raises(UnprocessableEntityError):
        await services["cap5"].record_ketso(test_user.id, sell.id, verdict_user="sai")

    ketso = await services["cap5"].record_ketso(
        test_user.id, sell.id, verdict_user="sai", ly_do_sua="Tôi vào theo tin đồn."
    )
    assert ketso.verdict_he == "dung"
    assert ketso.verdict_user == "sai"
    assert ketso.ly_do_sua == "Tôi vào theo tin đồn."
    assert ketso.o_4 == "sai_thang"  # final verdict × win


@pytest.mark.asyncio
async def test_ketso_agreeing_does_not_require_a_reason(db_session, test_user):
    services, account = await _enter_cap5(db_session, test_user.id)
    sell = await _round_trip(
        db_session, services, account.id, test_user.id, symbol="C3", nhoi_lenh_khi_lo=True
    )
    ketso = await services["cap5"].record_ketso(test_user.id, sell.id, verdict_user="sai")
    assert ketso.verdict_he == "sai"
    assert ketso.verdict_user == "sai"
    assert ketso.ly_do_sua is None


@pytest.mark.asyncio
async def test_ketso_recomputes_verdict_he_ignoring_client(db_session, test_user):
    """``verdict_he`` is recomputed at write time — a client cannot supply it."""
    services, account = await _enter_cap5(db_session, test_user.id)
    sell = await _round_trip(
        db_session,
        services,
        account.id,
        test_user.id,
        symbol="C4",
        cham_sl_khong_cat=True,
    )
    ketso = await services["cap5"].record_ketso(
        test_user.id, sell.id, verdict_user="sai", verdict_he="dung"
    )
    assert ketso.verdict_he == "sai"  # server's own computation wins


@pytest.mark.asyncio
async def test_ketso_rejects_invalid_verdict(db_session, test_user):
    services, account = await _enter_cap5(db_session, test_user.id)
    sell = await _round_trip(db_session, services, account.id, test_user.id, symbol="C5")
    with pytest.raises(BadRequestError):
        await services["cap5"].record_ketso(test_user.id, sell.id, verdict_user="co_the")
    with pytest.raises(BadRequestError):
        await services["cap5"].record_ketso(
            test_user.id, sell.id, verdict_user="sai", ly_do_sua="   "
        )


@pytest.mark.asyncio
async def test_o_4_all_four_combinations(db_session, test_user):
    """verdict cuối × kết quả → the 4 ô (spec §4)."""
    services, account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]

    dung_thang = await _round_trip(
        db_session, services, account.id, test_user.id, symbol="O1", win=True
    )
    dung_thua = await _round_trip(
        db_session, services, account.id, test_user.id, symbol="O2", win=False
    )
    sai_thang = await _round_trip(
        db_session,
        services,
        account.id,
        test_user.id,
        symbol="O3",
        win=True,
        nhoi_lenh_khi_lo=True,
    )
    sai_thua = await _round_trip(
        db_session,
        services,
        account.id,
        test_user.id,
        symbol="O4",
        win=False,
        nhoi_lenh_khi_lo=True,
    )

    assert (await cap5.record_ketso(test_user.id, dung_thang.id, verdict_user="dung")).o_4 == (
        "dung_thang"
    )
    assert (await cap5.record_ketso(test_user.id, dung_thua.id, verdict_user="dung")).o_4 == (
        "dung_thua"
    )
    assert (await cap5.record_ketso(test_user.id, sai_thang.id, verdict_user="sai")).o_4 == (
        "sai_thang"
    )
    assert (await cap5.record_ketso(test_user.id, sai_thua.id, verdict_user="sai")).o_4 == (
        "sai_thua"
    )

    progress = await cap5.get_progress(test_user.id)
    assert progress.so_lenh_phan_loai == 4
    assert progress.ty_le_quyet_dinh_dung == pytest.approx(50.0)
    assert progress.task_1_done_at is not None  # ① lệnh đầu đã phân loại


@pytest.mark.asyncio
async def test_ketso_requires_cap1_ketso_first(db_session, test_user):
    services, account = await _enter_cap5(db_session, test_user.id)
    sell = await _make_order(
        db_session, account.id, test_user.id, symbol="NOKS", side=OrderSide.SELL
    )
    with pytest.raises(NotFoundError):
        await services["cap5"].record_ketso(test_user.id, sell.id, verdict_user="dung")


# ══════════════════════════════════════════════════════
# Đứng ngoài có chủ đích
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_log_dung_ngoai_records_price_and_completes_task_2(
    db_session, test_user, monkeypatch
):
    services, _account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]
    _patch_resolve_price(monkeypatch, 20_000)
    _patch_ohlcv(monkeypatch, {})

    decision = await cap5.log_dung_ngoai(test_user.id, "vcb", "dinh_gia_dat")
    assert decision.symbol == "VCB"
    assert decision.reason == "dinh_gia_dat"
    assert float(decision.gia_luc_dung_ngoai) == pytest.approx(20_000.0)
    assert decision.ket_qua is None
    assert decision.cham_at is None

    progress = await cap5.get_progress(test_user.id)
    assert progress.task_2_done_at is not None  # ② đứng ngoài đầu tiên
    assert progress.so_lan_dung_ngoai_da_cham == 0  # chưa tới hạn chấm


@pytest.mark.asyncio
async def test_log_dung_ngoai_validates_reason_and_symbol(db_session, test_user, monkeypatch):
    services, _account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]
    _patch_resolve_price(monkeypatch, 20_000)
    with pytest.raises(BadRequestError):
        await cap5.log_dung_ngoai(test_user.id, "VCB", "khong_thich")
    with pytest.raises(BadRequestError):
        await cap5.log_dung_ngoai(test_user.id, "  ", "dinh_gia_dat")


@pytest.mark.asyncio
async def test_log_dung_ngoai_fails_closed_without_price(db_session, test_user, monkeypatch):
    """No price → no comparable snapshot → refuse rather than store a row that
    can never be scored."""
    services, _account = await _enter_cap5(db_session, test_user.id)
    _patch_resolve_price(monkeypatch, None)
    with pytest.raises(ServiceUnavailableError):
        await services["cap5"].log_dung_ngoai(test_user.id, "VCB", "dinh_gia_dat")


@pytest.mark.asyncio
async def test_dung_ngoai_scoring_ne_dung_at_plus_2_boundary(
    db_session, test_user, monkeypatch
):
    """≤ +2% → né đúng (boundary included)."""
    services, _account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]
    _patch_resolve_price(monkeypatch, 20_000)
    _patch_ohlcv(monkeypatch, {})
    decision = await _log_backdated_standby(db_session, cap5, test_user.id, symbol="AAA")

    _patch_ohlcv(monkeypatch, _series_around(decision, 20_400.0))  # exactly +2.0%
    result = await cap5.cham_dung_ngoai(test_user.id)
    assert result["so_moi_cham"] == 1

    await db_session.refresh(decision)
    assert decision.ket_qua == "ne_dung"
    assert float(decision.gia_sau_5_phien) == pytest.approx(20_400.0)
    assert decision.cham_at is not None

    progress = await cap5.get_progress(test_user.id)
    assert progress.so_lan_dung_ngoai_da_cham == 1


@pytest.mark.asyncio
async def test_dung_ngoai_scoring_ne_hut_at_plus_5_boundary(
    db_session, test_user, monkeypatch
):
    """≥ +5% → né hụt (boundary included)."""
    services, _account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]
    _patch_resolve_price(monkeypatch, 20_000)
    _patch_ohlcv(monkeypatch, {})
    decision = await _log_backdated_standby(db_session, cap5, test_user.id, symbol="BBB")

    _patch_ohlcv(monkeypatch, _series_around(decision, 21_000.0))  # exactly +5.0%
    await cap5.cham_dung_ngoai(test_user.id)
    await db_session.refresh(decision)
    assert decision.ket_qua == "ne_hut"


@pytest.mark.asyncio
async def test_dung_ngoai_scoring_middle_is_trung_tinh(db_session, test_user, monkeypatch):
    """The ambiguous 2-5% middle is NEVER punished (spec §5)."""
    services, _account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]
    _patch_resolve_price(monkeypatch, 20_000)
    _patch_ohlcv(monkeypatch, {})
    decision = await _log_backdated_standby(db_session, cap5, test_user.id, symbol="CCC")

    _patch_ohlcv(monkeypatch, _series_around(decision, 20_700.0))  # +3.5%
    await cap5.cham_dung_ngoai(test_user.id)
    await db_session.refresh(decision)
    assert decision.ket_qua == "trung_tinh"


@pytest.mark.asyncio
async def test_dung_ngoai_unscorable_when_history_missing(db_session, test_user, monkeypatch):
    """No price history for the target session → leave it UNSCORED (never
    guess), and it must not count toward nhiệm vụ ③."""
    services, _account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]
    _patch_resolve_price(monkeypatch, 20_000)
    _patch_ohlcv(monkeypatch, {})
    decision = await _log_backdated_standby(db_session, cap5, test_user.id, symbol="DDD")

    _patch_ohlcv(monkeypatch, None)  # the fetch raises
    result = await cap5.cham_dung_ngoai(test_user.id)
    assert result["so_moi_cham"] == 0
    await db_session.refresh(decision)
    assert decision.ket_qua is None
    assert decision.gia_sau_5_phien is None
    assert decision.cham_at is None

    # Series that stops before the due session → still unscored.
    decided_on = decision.decided_at.date()
    _patch_ohlcv(monkeypatch, {decided_on: 20_000.0})
    await cap5.cham_dung_ngoai(test_user.id)
    await db_session.refresh(decision)
    assert decision.ket_qua is None

    progress = await cap5.get_progress(test_user.id)
    assert progress.so_lan_dung_ngoai_da_cham == 0


@pytest.mark.asyncio
async def test_dung_ngoai_not_scored_before_5_sessions(db_session, test_user, monkeypatch):
    """A decision taken today is not due yet — no score, no guess."""
    services, _account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]
    _patch_resolve_price(monkeypatch, 20_000)
    decision = await cap5.log_dung_ngoai(test_user.id, "EEE", "cho_vung_mua_tot_hon")
    _patch_ohlcv(monkeypatch, _series_around(decision, 30_000.0))

    result = await cap5.cham_dung_ngoai(test_user.id)
    assert result["so_moi_cham"] == 0
    await db_session.refresh(decision)
    assert decision.ket_qua is None


@pytest.mark.asyncio
async def test_dung_ngoai_scored_lazily_on_read(db_session, test_user, monkeypatch):
    """``GET /cap5/dung-ngoai`` scores due decisions itself (no cron)."""
    services, _account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]
    _patch_resolve_price(monkeypatch, 20_000)
    _patch_ohlcv(monkeypatch, {})
    decision = await _log_backdated_standby(db_session, cap5, test_user.id, symbol="FFF")

    _patch_ohlcv(monkeypatch, _series_around(decision, 19_000.0))  # -5% → né đúng
    listing = await cap5.list_dung_ngoai(test_user.id)
    assert listing["so_lan"] == 1
    assert listing["so_ne_dung"] == 1
    assert listing["so_chua_toi_han"] == 0
    item = listing["items"][0]
    assert item["symbol"] == "FFF"
    assert item["ket_qua"] == "ne_dung"
    assert item["pct_thay_doi"] == pytest.approx(-5.0)
    assert item["ly_do_ten"]
    assert item["han_cham_date"]
    assert listing["giai_thich"]


@pytest.mark.asyncio
async def test_dung_ngoai_scoring_is_idempotent(db_session, test_user, monkeypatch):
    services, _account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]
    _patch_resolve_price(monkeypatch, 20_000)
    _patch_ohlcv(monkeypatch, {})
    decision = await _log_backdated_standby(db_session, cap5, test_user.id, symbol="GGG")

    _patch_ohlcv(monkeypatch, _series_around(decision, 20_000.0))
    assert (await cap5.cham_dung_ngoai(test_user.id))["so_moi_cham"] == 1
    assert (await cap5.cham_dung_ngoai(test_user.id))["so_moi_cham"] == 0
    await db_session.refresh(decision)
    assert decision.ket_qua == "ne_dung"


@pytest.mark.asyncio
async def test_dung_ngoai_tolerates_a_holiday_on_the_due_session(
    db_session, test_user, monkeypatch
):
    """The repo's trading-day helper knows Mon-Fri but no holiday calendar; if
    the due session has no bar but the series clearly runs past it, the last
    session inside the window is used (documented in the service)."""
    services, _account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]
    _patch_resolve_price(monkeypatch, 20_000)
    _patch_ohlcv(monkeypatch, {})
    decision = await _log_backdated_standby(db_session, cap5, test_user.id, symbol="HHH")

    closes = _series_around(decision, 21_000.0)
    del closes[_due_date(decision)]  # the due session was a holiday
    _patch_ohlcv(monkeypatch, closes)
    assert (await cap5.cham_dung_ngoai(test_user.id))["so_moi_cham"] == 1
    await db_session.refresh(decision)
    assert decision.ket_qua is not None


@pytest.mark.asyncio
async def test_dung_ngoai_listing_thresholds_and_reason_stats(
    db_session, test_user, monkeypatch
):
    services, _account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]
    _patch_resolve_price(monkeypatch, 20_000)
    _patch_ohlcv(monkeypatch, {})

    listing = await cap5.list_dung_ngoai(test_user.id)
    assert listing["so_lan"] == 0
    assert listing["items"] == []
    assert listing["ly_do_hay_dung"] is None

    for symbol in ("K1", "K2"):
        await cap5.log_dung_ngoai(test_user.id, symbol, "dinh_gia_dat")
    await cap5.log_dung_ngoai(test_user.id, "K3", "chua_du_co_so")
    listing = await cap5.list_dung_ngoai(test_user.id)
    assert listing["so_lan"] == 3
    assert listing["so_chua_toi_han"] == 3
    assert listing["ly_do_hay_dung"]["ma"] == "dinh_gia_dat"
    assert listing["ly_do_hay_dung"]["so_lan"] == 2
    assert listing["du_de_phan_tich"] is False  # <3 đã chấm


# ══════════════════════════════════════════════════════
# Counters + Thách thức Lão luyện (nhiệm vụ ③)
# ══════════════════════════════════════════════════════


async def _classify(db_session, services, account_id, user_id, *, symbol, verdict, win):
    """One round trip classified into a 4-ô cell.

    ``verdict='sai'`` is produced by a REAL process violation (nhồi lệnh) so the
    hệ verdict matches and no override reason is needed.
    """
    sell = await _round_trip(
        db_session,
        services,
        account_id,
        user_id,
        symbol=symbol,
        win=win,
        nhoi_lenh_khi_lo=(verdict == "sai"),
    )
    return await services["cap5"].record_ketso(user_id, sell.id, verdict_user=verdict)


async def _score_n_standbys(db_session, cap5, user_id, monkeypatch, n: int) -> None:
    """Log + score ``n`` đứng-ngoài decisions (all né đúng)."""
    for i in range(n):
        _patch_resolve_price(monkeypatch, 20_000)
        _patch_ohlcv(monkeypatch, {})
        decision = await _log_backdated_standby(
            db_session, cap5, user_id, symbol=f"S{i}", days_ago=30 + i
        )
        _patch_ohlcv(monkeypatch, _series_around(decision, 19_000.0))
        await cap5.cham_dung_ngoai(user_id)


@pytest.mark.asyncio
async def test_counters_and_ty_le_quyet_dinh_dung(db_session, test_user):
    services, account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]

    # 3 đúng (1 of them a loss) + 1 sai → 75%
    await _classify(
        db_session, services, account.id, test_user.id, symbol="R1", verdict="dung", win=True
    )
    await _classify(
        db_session, services, account.id, test_user.id, symbol="R2", verdict="dung", win=False
    )
    await _classify(
        db_session, services, account.id, test_user.id, symbol="R3", verdict="dung", win=True
    )
    await _classify(
        db_session, services, account.id, test_user.id, symbol="R4", verdict="sai", win=True
    )

    progress = await cap5.get_progress(test_user.id)
    assert progress.so_lenh_phan_loai == 4
    assert progress.ty_le_quyet_dinh_dung == pytest.approx(75.0)

    # Unclassified round trips never count.
    await _round_trip(db_session, services, account.id, test_user.id, symbol="R5")
    progress = await cap5.get_progress(test_user.id)
    assert progress.so_lenh_phan_loai == 4


@pytest.mark.asyncio
async def test_thach_thuc_shape_and_all_three_legs(db_session, test_user, monkeypatch):
    services, account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]

    result = await cap5.thach_thuc(test_user.id)
    assert result["dat_ca_3"] is False
    for key in ("so_lenh_phan_loai", "so_lan_dung_ngoai_da_cham", "ty_le_quyet_dinh_dung"):
        assert result[key]["ten"]
        assert result[key]["giai_thich"]  # §C12c
        assert result[key]["dat"] is False
    assert result["so_lenh_phan_loai"]["muc_tieu"] == 20
    assert result["so_lan_dung_ngoai_da_cham"]["muc_tieu"] == 5
    assert result["ty_le_quyet_dinh_dung"]["muc_tieu"] == 70.0

    for i in range(20):
        await _classify(
            db_session,
            services,
            account.id,
            test_user.id,
            symbol=f"T{i}",
            verdict="dung" if i < 15 else "sai",
            win=i % 2 == 0,
        )
    await _score_n_standbys(db_session, cap5, test_user.id, monkeypatch, 5)

    result = await cap5.thach_thuc(test_user.id)
    assert result["so_lenh_phan_loai"]["gia_tri_hien_tai"] == 20
    assert result["so_lan_dung_ngoai_da_cham"]["gia_tri_hien_tai"] == 5
    assert result["ty_le_quyet_dinh_dung"]["gia_tri_hien_tai"] == pytest.approx(75.0)
    assert result["dat_ca_3"] is True

    progress = await cap5.get_progress(test_user.id)
    assert progress.task_3_done_at is not None


@pytest.mark.asyncio
async def test_task3_fails_when_only_so_lenh_short(db_session, test_user, monkeypatch):
    services, account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]
    for i in range(19):
        await _classify(
            db_session, services, account.id, test_user.id,
            symbol=f"U{i}", verdict="dung", win=True,
        )
    await _score_n_standbys(db_session, cap5, test_user.id, monkeypatch, 5)

    progress = await cap5.get_progress(test_user.id)
    assert progress.so_lenh_phan_loai == 19
    assert progress.so_lan_dung_ngoai_da_cham == 5
    assert progress.ty_le_quyet_dinh_dung == pytest.approx(100.0)
    assert progress.task_3_done_at is None


@pytest.mark.asyncio
async def test_task3_fails_when_only_dung_ngoai_short(db_session, test_user, monkeypatch):
    services, account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]
    for i in range(20):
        await _classify(
            db_session, services, account.id, test_user.id,
            symbol=f"V{i}", verdict="dung", win=True,
        )
    await _score_n_standbys(db_session, cap5, test_user.id, monkeypatch, 4)

    progress = await cap5.get_progress(test_user.id)
    assert progress.so_lenh_phan_loai == 20
    assert progress.so_lan_dung_ngoai_da_cham == 4
    assert progress.task_3_done_at is None


@pytest.mark.asyncio
async def test_task3_fails_when_only_ty_le_short(db_session, test_user, monkeypatch):
    """20 lệnh + 5 đứng ngoài đã chấm, but only 65% quyết định đúng."""
    services, account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]
    for i in range(20):
        await _classify(
            db_session, services, account.id, test_user.id,
            symbol=f"W{i}", verdict="dung" if i < 13 else "sai", win=True,
        )
    await _score_n_standbys(db_session, cap5, test_user.id, monkeypatch, 5)

    progress = await cap5.get_progress(test_user.id)
    assert progress.so_lenh_phan_loai == 20
    assert progress.so_lan_dung_ngoai_da_cham == 5
    assert progress.ty_le_quyet_dinh_dung == pytest.approx(65.0)
    assert progress.task_3_done_at is None


@pytest.mark.asyncio
async def test_mark_task_recomputes_only(db_session, test_user):
    services, account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]
    with pytest.raises(BadRequestError):
        await cap5.mark_task(test_user.id, 9)

    progress = await cap5.mark_task(test_user.id, 1)
    assert progress.task_1_done_at is None  # no history → no fabrication

    await _classify(
        db_session, services, account.id, test_user.id, symbol="M1", verdict="dung", win=True
    )
    progress = await cap5.mark_task(test_user.id, 1)
    assert progress.task_1_done_at is not None


@pytest.mark.asyncio
async def test_thach_thuc_and_list_require_progress(db_session, test_user):
    cap5 = Cap5Service(db_session)
    with pytest.raises(NotFoundError):
        await cap5.thach_thuc(test_user.id)
    with pytest.raises(NotFoundError):
        await cap5.list_dung_ngoai(test_user.id)
    with pytest.raises(NotFoundError):
        await cap5.cham_dung_ngoai(test_user.id)
    with pytest.raises(NotFoundError):
        await cap5.log_dung_ngoai(test_user.id, "VCB", "dinh_gia_dat")


# ══════════════════════════════════════════════════════
# Graduation
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_graduate_requires_3_of_3(db_session, test_user, monkeypatch):
    services, account = await _enter_cap5(db_session, test_user.id)
    cap5 = services["cap5"]

    with pytest.raises(ConflictError):
        await cap5.graduate(test_user.id)

    for i in range(20):
        await _classify(
            db_session, services, account.id, test_user.id,
            symbol=f"X{i}", verdict="dung" if i < 15 else "sai", win=i % 2 == 0,
        )
    # ①③'s lệnh leg met, but ② (đứng ngoài) not yet → still blocked.
    with pytest.raises(ConflictError):
        await cap5.graduate(test_user.id)

    await _score_n_standbys(db_session, cap5, test_user.id, monkeypatch, 5)
    progress = await cap5.get_progress(test_user.id)
    assert progress.task_1_done_at is not None
    assert progress.task_2_done_at is not None
    assert progress.task_3_done_at is not None

    progress = await cap5.graduate(test_user.id)
    assert progress.graduated_at is not None
    assert progress.time_to_graduate_hours is not None

    first = progress.graduated_at
    again = await cap5.graduate(test_user.id)
    assert again.graduated_at == first


# ══════════════════════════════════════════════════════
# HTTP wiring
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_cap5_endpoints_wired_and_free(client, db_session, test_user, monkeypatch):
    """Router mounted under /api/v1/cap5, gated by CurrentUser (not premium)."""
    from app.core.security import create_access_token

    await _fast_track_cap4(db_session, test_user.id)
    await db_session.commit()

    token = create_access_token(
        subject=test_user.id, extra_claims={"role": test_user.role.value}
    )
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.get("/api/v1/cap5/progress", headers=headers)
    assert r.status_code == 200
    assert r.json() is None

    r = await client.post("/api/v1/cap5/enter", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["so_lenh_phan_loai"] == 0
    assert body["ty_le_quyet_dinh_dung"] == 0.0

    r = await client.post("/api/v1/cap5/graduate", headers=headers)
    assert r.status_code == 409

    services = {
        "cap1": Cap1Service(db_session),
        "cap2": Cap2Service(db_session),
        "cap3": Cap3Service(db_session),
        "cap4": Cap4Service(db_session),
        "cap5": Cap5Service(db_session),
    }
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)
    sell = await _round_trip(
        db_session, services, account.id, test_user.id, symbol="HTTP1", win=True
    )
    await db_session.commit()

    r = await client.get(f"/api/v1/cap5/verdict/{sell.id}", headers=headers)
    assert r.status_code == 200, r.text
    vbody = r.json()
    assert vbody["verdict"] == "dung"
    assert len(vbody["signals"]) == 4
    assert vbody["o_4_du_kien"] == "dung_thang"

    # Override without a reason → 422
    r = await client.post(
        "/api/v1/cap5/ketso",
        headers=headers,
        json={"order_id": str(sell.id), "verdict_user": "sai"},
    )
    assert r.status_code == 422, r.text

    r = await client.post(
        "/api/v1/cap5/ketso",
        headers=headers,
        json={"order_id": str(sell.id), "verdict_user": "dung"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["o_4"] == "dung_thang"

    r = await client.patch("/api/v1/cap5/task", headers=headers, json={"task_no": 1})
    assert r.status_code == 200, r.text
    assert r.json()["task_1_done_at"] is not None

    _patch_resolve_price(monkeypatch, 20_000)
    _patch_ohlcv(monkeypatch, {})
    r = await client.post(
        "/api/v1/cap5/dung-ngoai",
        headers=headers,
        json={"symbol": "VCB", "reason": "dinh_gia_dat"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["symbol"] == "VCB"

    r = await client.get("/api/v1/cap5/dung-ngoai", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["so_lan"] == 1

    r = await client.post("/api/v1/cap5/dung-ngoai/cham", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["so_moi_cham"] == 0

    r = await client.get("/api/v1/cap5/thach-thuc", headers=headers)
    assert r.status_code == 200, r.text
    tbody = r.json()
    assert "dat_ca_3" in tbody
    assert "so_lenh_phan_loai" in tbody
    assert "so_lan_dung_ngoai_da_cham" in tbody
    assert "ty_le_quyet_dinh_dung" in tbody

    # Invalid reason → 400 from the service's own validation.
    r = await client.post(
        "/api/v1/cap5/dung-ngoai",
        headers=headers,
        json={"symbol": "VCB", "reason": "khong_thich"},
    )
    assert r.status_code == 400, r.text

    # Unauthenticated is rejected
    r = await client.get("/api/v1/cap5/progress")
    assert r.status_code == 401
