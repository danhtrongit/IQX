"""Tests for the Cấp 8 «Quản trị rủi ro danh mục» backend — bước Kiểm tra danh
mục (dồn ngành · tương quan · tổng vốn ở rủi ro), ghi khối Cấp 8 lên
``order_kehoach``, Thách thức Quản trị rủi ro danh mục (3 legs), graduation.

Mirrors ``tests/test_cap7.py``'s style. Uses the ``test_user``/``db_session``
fixtures from ``tests/conftest.py``.

**Setup cost note.** Cấp 8's only real prerequisite is
``Cap7Progress.graduated_at``. ``test_enter_requires_cap7_graduated`` exercises
the real Cấp 7 gate (entered-but-not-graduated → 409); every other test uses
``_fast_track_cap7`` which stamps the prerequisite progress rows directly (Cấp
0→7's full graduation chain is already pinned by ``tests/test_cap6.py`` and
``tests/test_cap7.py``).

**★ THE FOUR HONESTY PROPERTIES this file pins down:**

1. **A position with no cắt lỗ has UNKNOWN risk, not zero risk.** It is excluded
   from the tổng-vốn-ở-rủi-ro sum and reported by count.
   ``test_position_without_stop_loss_is_excluded_and_counted_not_summed_as_zero``.
2. **``correlation()`` returns ``0.0`` on thin history — that is "unknown", not
   "uncorrelated".** ``tuong_quan_an_toan`` returns ``None`` below
   ``TUONG_QUAN_MIN_PHIEN`` aligned sessions.
   ``test_tuong_quan_an_toan_never_launders_the_zero_from_thin_history``.
3. **The khẩu vị ceiling carries two different meanings** (max % of capital in
   ONE order vs total capital-at-risk-if-all-stops-hit). The service says so out
   loud, in its docstring AND in the copy the FE renders.
   ``test_the_khau_vi_ceiling_conflation_is_stated_out_loud``.
4. **The server re-derives the three measures itself.**
   ``test_record_kehoach_rederives_the_measures_and_ignores_the_clients_numbers``
   and ``test_record_kehoach_rejects_khong_canh_bao_when_warnings_actually_fired``.

Both external data sources are monkeypatched — no network in tests:
``get_adjusted_ohlcv`` at its import site in ``app.services.cap8.service`` (the
price history correlation needs) and ``resolve_price`` at its import site in
``app.services.virtual_trading.service`` (the portfolio's market values).
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap1 import Cap1Progress, OrderKehoach
from app.models.cap2 import Cap2Progress
from app.models.cap3 import Cap3Progress
from app.models.cap4 import Cap4Progress
from app.models.cap5 import Cap5Progress
from app.models.cap6 import Cap6Progress
from app.models.cap7 import Cap7Progress
from app.models.cap8 import HanhViCanhBao, LoaiCanhBao
from app.models.symbol import Symbol
from app.models.virtual_trading import (
    OrderSide,
    OrderStatus,
    OrderType,
    VirtualOrder,
    VirtualPosition,
)
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.ai.portfolio_manager.returns import correlation
from app.services.cap1.service import Cap1Service
from app.services.cap2.service import Cap2Service
from app.services.cap3.service import Cap3Service
from app.services.cap4.service import Cap4Service
from app.services.cap6.service import Cap6Service
from app.services.cap7.service import Cap7Service
from app.services.cap8.service import (
    KHAU_VI_TRAN_PCT,
    NGUONG_DON_NGANH_PCT,
    NGUONG_TUONG_QUAN,
    TUONG_QUAN_MIN_PHIEN,
    TUONG_QUAN_MIN_TY_TRONG_PCT,
    Cap8Service,
    khoang_toi_cat_lo_pct,
    tuong_quan_an_toan,
)
from app.services.ta.indicators import OHLCV
from app.services.virtual_trading.price_resolver import PriceResult

_SVC = "app.services.cap8.service"
_VT_SVC = "app.services.virtual_trading.service"

_ALL_NEU = {
    "ky_thuat": "neu",
    "dong_tien": "neu",
    "noi_bo": "neu",
    "tin_tuc": "neu",
    "dinh_gia": "neu",
}
_MAU_THUAN = {**_ALL_NEU, "ky_thuat": "ok", "dinh_gia": "bad"}

_BUY_PRICE = 20_000
_NAV_CASH = 250_000_000


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
        limit_price_vnd=price,
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


async def _seed_position(
    db_session, account_id, symbol: str, *, qty: int, avg_cost: int = _BUY_PRICE
) -> VirtualPosition:
    row = VirtualPosition(
        account_id=account_id,
        symbol=symbol.upper(),
        quantity_total=qty,
        quantity_sellable=qty,
        quantity_pending=0,
        quantity_reserved=0,
        avg_cost_vnd=avg_cost,
    )
    db_session.add(row)
    await db_session.flush()
    return row


async def _fast_track_cap7(
    db_session, user_id, *, graduated: bool = True, khau_vi: str | None = "can_bang"
):
    """Stamp the Cấp 1-7 progress rows a Cấp 8 flow needs + a VT account."""
    now = datetime.now(UTC)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(user_id)
    if account is None:
        account = await vt_repo.create_account(user_id, _NAV_CASH)
    db_session.add_all(
        [
            Cap1Progress(user_id=user_id, entered_at=now, graduated_at=now),
            Cap2Progress(user_id=user_id, entered_at=now, graduated_at=now),
            Cap3Progress(
                user_id=user_id,
                entered_at=now,
                khau_vi_da_dat=khau_vi is not None,
                khau_vi=khau_vi,
                graduated_at=now,
            ),
            Cap4Progress(user_id=user_id, entered_at=now, graduated_at=now),
            Cap5Progress(user_id=user_id, entered_at=now, graduated_at=now),
            Cap6Progress(user_id=user_id, entered_at=now, graduated_at=now),
            Cap7Progress(
                user_id=user_id, entered_at=now, graduated_at=now if graduated else None
            ),
        ]
    )
    await db_session.flush()
    return account


async def _enter_cap8(db_session, user_id, *, khau_vi: str | None = "can_bang"):
    """Fast-track Cấp 1-7 then enter Cấp 8. Returns ``(services, account)``."""
    account = await _fast_track_cap7(db_session, user_id, khau_vi=khau_vi)
    services = {
        "cap1": Cap1Service(db_session),
        "cap2": Cap2Service(db_session),
        "cap3": Cap3Service(db_session),
        "cap4": Cap4Service(db_session),
        "cap6": Cap6Service(db_session),
        "cap7": Cap7Service(db_session),
        "cap8": Cap8Service(db_session),
    }
    await services["cap8"].enter(user_id)
    return services, account


async def _buy_with_cap1_plan(
    db_session,
    services,
    account_id,
    user_id,
    *,
    symbol: str,
    cat_lo: int | None = None,
    buy_price: int = _BUY_PRICE,
    qty: int = 100,
    status: OrderStatus = OrderStatus.FILLED,
) -> VirtualOrder:
    """A BUY carrying Cấp 1's block (+ Cấp 2's cắt lỗ when given).

    Cheap on purpose: the full Cấp 1-7 cộng dồn is asserted once, by
    ``test_kehoach_keeps_cap1_to_7_blocks_intact``.
    """
    buy = await _make_order(
        db_session,
        account_id,
        user_id,
        symbol=symbol,
        price=buy_price,
        qty=qty,
        status=status,
    )
    await services["cap1"].record_kehoach(
        user_id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=buy_price
    )
    if cat_lo is not None:
        await services["cap2"].record_kehoach(
            user_id,
            buy.id,
            phuong_phap_sl_tp="bien_do_dao_dong",
            cat_lo=cat_lo,
            chot_loi=buy_price + 5_000,
        )
    return buy


async def _held(
    db_session,
    services,
    account_id,
    user_id,
    *,
    symbol: str,
    qty: int = 1_000,
    price: int = _BUY_PRICE,
    cat_lo: int | None = None,
    nganh: str | None = "Ngân hàng",
):
    """A symbol the user already holds: Symbol row + filled BUY (+cắt lỗ) + position."""
    if nganh is not None:
        await _seed_symbol(db_session, symbol, icb_lv2=nganh)
    await _buy_with_cap1_plan(
        db_session,
        services,
        account_id,
        user_id,
        symbol=symbol,
        cat_lo=cat_lo,
        buy_price=price,
        qty=qty,
    )
    await _seed_position(db_session, account_id, symbol, qty=qty, avg_cost=price)


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


# ── External-source fakes (no network) ────────────────


def _patch_prices(monkeypatch, prices: dict[str, int]):
    """Patch the portfolio's price source. A symbol absent from ``prices``
    raises ``PriceUnavailableError`` — which is how an unpriced position (whose
    weight is therefore UNKNOWN) is produced in tests."""
    from app.services.virtual_trading.price_resolver import PriceUnavailableError

    async def _fake(symbol, **kwargs):
        value = prices.get(symbol.upper())
        if value is None:
            raise PriceUnavailableError(symbol, "test: no price")
        return PriceResult(price_vnd=value, source="close", timestamp=datetime.now(UTC))

    monkeypatch.setattr(f"{_VT_SVC}.resolve_price", _fake)


def _weekdays_ending(n: int, anchor: date) -> list[date]:
    days: list[date] = []
    d = anchor
    while len(days) < n:
        if d.weekday() < 5:
            days.append(d)
        d -= timedelta(days=1)
    return list(reversed(days))


def _patch_history(monkeypatch, series: dict[str, list[float]]):
    """Patch the daily-close source used for correlation. Series share a common
    trailing date grid so they align; a symbol absent from ``series`` raises."""
    anchor = date.today()

    async def _fake(symbol, start, end, **kwargs):
        closes = series.get(symbol.upper())
        if closes is None:
            raise ValueError(f"test: no history for {symbol}")
        days = _weekdays_ending(len(closes), anchor)
        records = [
            {
                "time": d.isoformat(),
                "open": c,
                "high": c,
                "low": c,
                "close": c,
                "volume": 1_000.0,
            }
            for d, c in zip(days, closes, strict=True)
        ]
        return OHLCV.from_records(records), 0

    monkeypatch.setattr(f"{_SVC}.get_adjusted_ohlcv", _fake)


def _walk(n: int, steps: list[float], start: float = 100.0) -> list[float]:
    """A close series whose successive returns cycle through ``steps``."""
    out = [start]
    for i in range(n - 1):
        out.append(out[-1] * (1.0 + steps[i % len(steps)]))
    return out


#: A monotone clock for ``created_at``: SQLite's ``now()`` has second
#: resolution, so orders created inside one test would tie and "the latest
#: FILLED buy" would stop being well defined.
_SEQ = [0]


def _next_created_at() -> datetime:
    """NAIVE on purpose — ``TimestampMixin.created_at`` is ``DateTime()`` with
    no timezone, and mixing the two blows up ``_closed_pairs``' comparison."""
    _SEQ[0] += 1
    return datetime(2026, 1, 1) + timedelta(minutes=_SEQ[0])


_N_BARS = 130
#: Two series whose daily returns are IDENTICAL → correlation exactly 1.0.
_UP_DOWN = [0.01, -0.008, 0.006, -0.004, 0.012, -0.011]
#: A series whose returns are orthogonal to ``_UP_DOWN``'s over full cycles.
_ORTHOGONAL = [0.01, 0.01, -0.01, -0.01]


# ══════════════════════════════════════════════════════
# Enter / prerequisites
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_enter_requires_cap7_graduated(db_session, test_user):
    cap8 = Cap8Service(db_session)

    with pytest.raises(NotFoundError):  # no Cấp 7 progress at all
        await cap8.enter(test_user.id)

    await _fast_track_cap7(db_session, test_user.id, graduated=False)
    with pytest.raises(ConflictError):  # entered but not graduated
        await cap8.enter(test_user.id)

    cap7_row = (
        await db_session.execute(
            select(Cap7Progress).where(Cap7Progress.user_id == test_user.id)
        )
    ).scalar_one()
    cap7_row.graduated_at = datetime.now(UTC)
    await db_session.flush()

    progress = await cap8.enter(test_user.id)
    assert progress["user_id"] == test_user.id
    assert progress["graduated_at"] is None
    assert progress["so_lenh_kiem_tra"] == 0
    assert progress["so_lan_mua_bat_chap_canh_bao"] == 0
    # ★ "chưa tính được" is NULL, never 0.0 — 0% would be a *passing* value.
    assert progress["don_nganh_max_pct"] is None
    assert progress["tong_rui_ro_pct"] is None

    again = await cap8.enter(test_user.id)
    assert again["id"] == progress["id"]


@pytest.mark.asyncio
async def test_get_progress_none_before_enter(db_session, test_user):
    cap8 = Cap8Service(db_session)
    assert await cap8.get_progress(test_user.id) is None


# ══════════════════════════════════════════════════════
# ★ HONESTY 2 — correlation 0.0 from thin history is UNKNOWN
# ══════════════════════════════════════════════════════


def test_tuong_quan_an_toan_never_launders_the_zero_from_thin_history():
    """``correlation()`` (shared with the Portfolio Manager) answers ``0.0`` for
    a series it cannot judge. ``0.0`` renders as "không tương quan", which is a
    CLAIM — and the opposite of the truth, which is "we do not know".

    The wrapper must answer ``None`` until both series have at least
    ``TUONG_QUAN_MIN_PHIEN`` aligned sessions.
    """
    assert TUONG_QUAN_MIN_PHIEN >= 30  # a documented minimum, not an accident

    # The hazard, pinned: the raw helper answers "0.0" for input it cannot judge.
    assert correlation([0.01], [0.01]) == 0.0
    assert correlation([], []) == 0.0
    # The wrapper refuses to launder that into a number — and it refuses well
    # before n = 2, because a correlation off 3 points is not a fact either.
    assert tuong_quan_an_toan([0.01], [0.01]) is None
    assert tuong_quan_an_toan([], []) is None
    thin = [0.01, -0.01, 0.02]
    assert correlation(thin, thin) == 1.0  # confidently wrong on 3 points
    assert tuong_quan_an_toan(thin, thin) is None

    ident = [0.01, -0.008, 0.006, -0.004] * (TUONG_QUAN_MIN_PHIEN // 4 + 2)
    assert len(ident) >= TUONG_QUAN_MIN_PHIEN
    assert tuong_quan_an_toan(ident, ident) == pytest.approx(1.0)

    # Zero variance → correlation is undefined, not 0.0.
    flat = [0.0] * len(ident)
    assert correlation(flat, ident) == 0.0
    assert tuong_quan_an_toan(flat, ident) is None

    # A series ONE bar short of the minimum is still "chưa đủ dữ liệu".
    short = ident[: TUONG_QUAN_MIN_PHIEN - 1]
    assert tuong_quan_an_toan(short, ident) is None
    assert tuong_quan_an_toan(ident[:TUONG_QUAN_MIN_PHIEN], ident) is not None


# ══════════════════════════════════════════════════════
# ★ HONESTY 1 — no cắt lỗ ⇒ UNKNOWN risk, never 0
# ══════════════════════════════════════════════════════


def test_khoang_toi_cat_lo_pct_returns_none_for_an_unknown_stop():
    """``None`` in, ``None`` out — the caller must never be handed a 0 it could
    add to a sum."""
    assert khoang_toi_cat_lo_pct(20_000, None) is None
    assert khoang_toi_cat_lo_pct(20_000, 18_000) == pytest.approx(10.0)
    assert khoang_toi_cat_lo_pct(20_000, 0) is None
    assert khoang_toi_cat_lo_pct(0, 18_000) is None
    # A stop already at/above the price loses nothing FURTHER from here — 0 is
    # the computed answer there, not a stand-in for "unknown".
    assert khoang_toi_cat_lo_pct(20_000, 20_000) == 0.0
    assert khoang_toi_cat_lo_pct(20_000, 25_000) == 0.0


@pytest.mark.asyncio
async def test_position_without_stop_loss_is_excluded_and_counted_not_summed_as_zero(
    db_session, test_user, monkeypatch
):
    """Two positions, one with a cắt lỗ and one without.

    The one without must NOT contribute 0 to the sum — it must leave the sum and
    be reported by count, with the caveat in the copy. Summing 0 would
    understate total risk, which is the exact failure Cấp 8 teaches against.
    """
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]

    # 100,000,000đ each at 20,000đ; cash 250tr − nothing spent (positions are
    # seeded directly) → NAV = 250tr + 200tr = 450tr.
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=5_000, cat_lo=18_000, nganh="Ngân hàng",
    )
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="BBB", qty=5_000, cat_lo=None, nganh="Thép",
    )
    await _seed_symbol(db_session, "CCC", icb_lv2="Công nghệ")
    _patch_prices(monkeypatch, {"AAA": 20_000, "BBB": 20_000, "CCC": 20_000})
    _patch_history(monkeypatch, {})

    out = await cap8.kiem_tra(test_user.id, "CCC", 100, 20_000, cat_lo=18_000)

    assert out["so_vi_the"] == 2
    assert out["so_vi_the_thieu_cat_lo"] == 1
    # AAA: weight 100tr/450tr = 22.22%, distance to stop 10% → 2.222%.
    # BBB contributes NOTHING — not 0 by fiat, but by exclusion.
    assert out["tong_rui_ro_pct_truoc"] == pytest.approx(2.2222, abs=1e-3)
    assert "chưa có cắt lỗ" in out["giai_thich"]["tong_rui_ro"]
    assert "1 vị thế" in out["giai_thich"]["tong_rui_ro"]


@pytest.mark.asyncio
async def test_tong_rui_ro_sau_is_unknown_without_the_candidates_own_stop(
    db_session, test_user, monkeypatch
):
    """No cắt lỗ for the order being placed ⇒ its contribution is unknown ⇒ the
    "sau lệnh" figure is ``None`` with a stated reason, never the "truoc" figure
    quietly reused."""
    services, account = await _enter_cap8(db_session, test_user.id)
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=5_000, cat_lo=18_000,
    )
    await _seed_symbol(db_session, "CCC", icb_lv2="Công nghệ")
    _patch_prices(monkeypatch, {"AAA": 20_000, "CCC": 20_000})
    _patch_history(monkeypatch, {})

    out = await services["cap8"].kiem_tra(test_user.id, "CCC", 100, 20_000, cat_lo=None)

    assert out["tong_rui_ro_pct_truoc"] is not None
    assert out["tong_rui_ro_pct_sau"] is None
    assert out["tong_rui_ro_canh_bao"] is False
    assert "chưa đặt cắt lỗ" in out["giai_thich"]["tong_rui_ro"]


@pytest.mark.asyncio
async def test_an_unpriced_position_is_excluded_and_counted_too(
    db_session, test_user, monkeypatch
):
    """A position whose price cannot be resolved has an UNKNOWN weight. Same
    rule as a missing stop: out of the sums, into a count, stated in the copy."""
    services, account = await _enter_cap8(db_session, test_user.id)
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=5_000, cat_lo=18_000,
    )
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="BBB", qty=5_000, cat_lo=18_000, nganh="Thép",
    )
    await _seed_symbol(db_session, "CCC", icb_lv2="Công nghệ")
    _patch_prices(monkeypatch, {"AAA": 20_000, "CCC": 20_000})  # BBB unpriced
    _patch_history(monkeypatch, {})

    out = await services["cap8"].kiem_tra(test_user.id, "CCC", 100, 20_000, cat_lo=18_000)

    assert out["so_vi_the"] == 2
    assert out["so_vi_the_thieu_gia"] == 1
    assert "chưa lấy được giá" in out["giai_thich"]["tong_rui_ro"]


# ══════════════════════════════════════════════════════
# Dồn ngành
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_don_nganh_measures_the_sector_after_the_order_and_warns_above_40(
    db_session, test_user, monkeypatch
):
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]

    # NAV = 250tr cash + 100tr AAA = 350tr. Ngân hàng trước = 28.57%.
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=5_000, cat_lo=18_000, nganh="Ngân hàng",
    )
    await _seed_symbol(db_session, "BBB", icb_lv2="Ngân hàng")
    _patch_prices(monkeypatch, {"AAA": 20_000, "BBB": 20_000})
    _patch_history(monkeypatch, {})

    # +50tr of another Ngân hàng name → (100 + 50) / 350 = 42.86% > 40%.
    out = await cap8.kiem_tra(test_user.id, "BBB", 2_500, 20_000, cat_lo=18_000)

    assert out["nganh"] == "Ngân hàng"
    assert out["don_nganh_pct_truoc"] == pytest.approx(28.571, abs=1e-2)
    assert out["don_nganh_pct_sau"] == pytest.approx(42.857, abs=1e-2)
    assert out["don_nganh_canh_bao"] is True
    assert LoaiCanhBao.DON_NGANH.value in {c["ma"] for c in out["canh_bao"]}
    assert "42" in out["giai_thich"]["don_nganh"]
    assert "Ngân hàng" in out["giai_thich"]["don_nganh"]
    assert f"{NGUONG_DON_NGANH_PCT:.0f}" in out["giai_thich"]["don_nganh"]

    # A small add to the same sector stays under the threshold.
    ok = await cap8.kiem_tra(test_user.id, "BBB", 100, 20_000, cat_lo=18_000)
    assert ok["don_nganh_canh_bao"] is False


@pytest.mark.asyncio
async def test_unknown_sector_is_chua_tinh_duoc_never_a_fabricated_zero(
    db_session, test_user, monkeypatch
):
    services, account = await _enter_cap8(db_session, test_user.id)
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=5_000, cat_lo=18_000,
    )
    _patch_prices(monkeypatch, {"AAA": 20_000, "ZZZ": 20_000})
    _patch_history(monkeypatch, {})

    out = await services["cap8"].kiem_tra(test_user.id, "ZZZ", 100, 20_000, cat_lo=18_000)

    assert out["nganh"] is None
    assert out["don_nganh_pct_sau"] is None
    assert out["don_nganh_canh_bao"] is False
    assert "chưa" in out["giai_thich"]["don_nganh"].lower()


# ══════════════════════════════════════════════════════
# Tương quan
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_tuong_quan_warns_only_against_a_significant_position(
    db_session, test_user, monkeypatch
):
    """A 1.0 correlation with a 0.2%-weight position is noise, not a portfolio
    risk. Only partners at/above ``TUONG_QUAN_MIN_TY_TRONG_PCT`` of NAV count."""
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]

    # TINY = 500,000đ of NAV ≈ 0.2%; BIG = 100tr ≈ 28.5%.
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="TINY", qty=25, cat_lo=18_000, nganh="Thép",
    )
    await _seed_symbol(db_session, "CCC", icb_lv2="Công nghệ")
    _patch_prices(monkeypatch, {"TINY": 20_000, "CCC": 20_000, "BIG": 20_000})
    _patch_history(
        monkeypatch,
        {
            "TINY": _walk(_N_BARS, _UP_DOWN),
            "CCC": _walk(_N_BARS, _UP_DOWN),
            "BIG": _walk(_N_BARS, _UP_DOWN),
        },
    )

    out = await cap8.kiem_tra(test_user.id, "CCC", 100, 20_000, cat_lo=18_000)
    assert out["tuong_quan_du_lieu"] is False, "no significant partner to measure"
    assert out["tuong_quan"] is None
    assert out["tuong_quan_canh_bao"] is False
    assert str(TUONG_QUAN_MIN_TY_TRONG_PCT).rstrip("0").rstrip(".") in (
        out["giai_thich"]["tuong_quan"]
    )

    # Now add a position big enough to matter → the same 1.0 correlation warns.
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="BIG", qty=5_000, cat_lo=18_000, nganh="Thép",
    )
    out2 = await cap8.kiem_tra(test_user.id, "CCC", 100, 20_000, cat_lo=18_000)
    assert out2["tuong_quan_du_lieu"] is True
    assert out2["tuong_quan"]["symbol"] == "BIG"
    assert out2["tuong_quan"]["he_so"] == pytest.approx(1.0)
    assert out2["tuong_quan_canh_bao"] is True
    assert LoaiCanhBao.TUONG_QUAN.value in {c["ma"] for c in out2["canh_bao"]}
    assert "BIG" in out2["giai_thich"]["tuong_quan"]


@pytest.mark.asyncio
async def test_tuong_quan_reports_chua_du_du_lieu_rather_than_a_zero(
    db_session, test_user, monkeypatch
):
    """Thin history must surface as an explicit "chưa đủ dữ liệu" state — the FE
    renders that, and never a 0.0 dressed up as "không tương quan"."""
    services, account = await _enter_cap8(db_session, test_user.id)
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="BIG", qty=5_000, cat_lo=18_000, nganh="Thép",
    )
    await _seed_symbol(db_session, "CCC", icb_lv2="Công nghệ")
    _patch_prices(monkeypatch, {"BIG": 20_000, "CCC": 20_000})
    _patch_history(
        monkeypatch,
        {"BIG": _walk(10, _UP_DOWN), "CCC": _walk(10, _UP_DOWN)},  # 10 bars only
    )

    out = await services["cap8"].kiem_tra(test_user.id, "CCC", 100, 20_000, cat_lo=18_000)
    assert out["tuong_quan"] is None
    assert out["tuong_quan_du_lieu"] is False
    assert out["tuong_quan_canh_bao"] is False
    assert "chưa đủ dữ liệu" in out["giai_thich"]["tuong_quan"].lower()


@pytest.mark.asyncio
async def test_tuong_quan_hidden_when_there_is_nothing_to_compare_against(
    db_session, test_user, monkeypatch
):
    """spec §7 — correlation needs ≥2 symbols. With an empty portfolio the
    measure is not shown at all (and certainly not shown as 0)."""
    services, _account = await _enter_cap8(db_session, test_user.id)
    await _seed_symbol(db_session, "CCC", icb_lv2="Công nghệ")
    _patch_prices(monkeypatch, {"CCC": 20_000})
    _patch_history(monkeypatch, {"CCC": _walk(_N_BARS, _UP_DOWN)})

    out = await services["cap8"].kiem_tra(test_user.id, "CCC", 100, 20_000, cat_lo=18_000)
    assert out["so_vi_the"] == 0
    assert out["tuong_quan"] is None
    assert out["tuong_quan_du_lieu"] is False
    assert out["tuong_quan_canh_bao"] is False


@pytest.mark.asyncio
async def test_a_computed_low_correlation_is_reported_without_a_warning(
    db_session, test_user, monkeypatch
):
    """The difference that matters: a COMPUTED ~0 comes back as a number with
    ``tuong_quan_du_lieu = True``; an UNKNOWN comes back as ``None``."""
    services, account = await _enter_cap8(db_session, test_user.id)
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="BIG", qty=5_000, cat_lo=18_000, nganh="Thép",
    )
    await _seed_symbol(db_session, "CCC", icb_lv2="Công nghệ")
    _patch_prices(monkeypatch, {"BIG": 20_000, "CCC": 20_000})
    _patch_history(
        monkeypatch,
        {
            "BIG": _walk(_N_BARS, _UP_DOWN),
            "CCC": _walk(_N_BARS, _ORTHOGONAL),
        },
    )

    out = await services["cap8"].kiem_tra(test_user.id, "CCC", 100, 20_000, cat_lo=18_000)
    assert out["tuong_quan_du_lieu"] is True
    assert out["tuong_quan"] is not None
    assert abs(out["tuong_quan"]["he_so"]) < NGUONG_TUONG_QUAN
    assert out["tuong_quan_canh_bao"] is False


# ══════════════════════════════════════════════════════
# ★ HONESTY 3 — the khẩu vị ceiling means two different things
# ══════════════════════════════════════════════════════


def test_the_khau_vi_ceiling_conflation_is_stated_out_loud():
    """``KHAU_VI_TRAN_PCT`` is documented everywhere else as "max % of capital in
    ONE order"; the Cấp 8 spec compares TOTAL capital-at-risk-if-all-stops-hit
    against the same number. We implement the spec — and we say so, in the
    service docstring, so the next reader is not misled."""
    import app.services.cap8.service as svc

    doc = svc.__doc__ or ""
    assert "MỘT lệnh" in doc
    assert "cả danh mục" in doc
    # ③ is a safety check, not a difficulty knob — and the docstring says so,
    # together with the fact that the ceiling seldom trips in practice.
    assert "safety check, not a difficulty knob" in doc
    assert "seldom trips" in doc

    # And it is the SAME table Cấp 5 owns — not a second copy of 10/20/30.
    from app.services.cap5.service import KHAU_VI_TRAN_PCT as CAP5_TRAN

    assert KHAU_VI_TRAN_PCT is CAP5_TRAN


@pytest.mark.asyncio
async def test_tong_rui_ro_copy_states_what_each_number_means(
    db_session, test_user, monkeypatch
):
    """A user must not be able to read the two percentages as the same
    quantity, so both are spelled out wherever they appear together."""
    services, account = await _enter_cap8(db_session, test_user.id)
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=5_000, cat_lo=18_000,
    )
    await _seed_symbol(db_session, "CCC", icb_lv2="Công nghệ")
    _patch_prices(monkeypatch, {"AAA": 20_000, "CCC": 20_000})
    _patch_history(monkeypatch, {})

    out = await services["cap8"].kiem_tra(test_user.id, "CCC", 100, 20_000, cat_lo=18_000)
    text = out["giai_thich"]["tong_rui_ro"] + " " + out["giai_thich"]["tran_khau_vi"]

    assert "nếu mọi cắt lỗ bị chạm" in text
    assert "Cân bằng" in text
    assert "20%" in text
    assert "một lệnh" in text.lower()  # the ceiling's ORIGINAL meaning, named


@pytest.mark.asyncio
async def test_tong_rui_ro_warns_when_it_exceeds_the_khau_vi_ceiling(
    db_session, test_user, monkeypatch
):
    services, account = await _enter_cap8(db_session, test_user.id, khau_vi="than_trong")
    # Cash 250tr; one 250tr position with a 50%-away stop → 50% × 50% = 25%.
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=12_500, cat_lo=10_000,
    )
    await _seed_symbol(db_session, "CCC", icb_lv2="Công nghệ")
    _patch_prices(monkeypatch, {"AAA": 20_000, "CCC": 20_000})
    _patch_history(monkeypatch, {})

    out = await services["cap8"].kiem_tra(test_user.id, "CCC", 100, 20_000, cat_lo=18_000)

    assert out["tran_khau_vi_pct"] == KHAU_VI_TRAN_PCT["than_trong"]
    assert out["tong_rui_ro_pct_sau"] > out["tran_khau_vi_pct"]
    assert out["tong_rui_ro_canh_bao"] is True
    assert LoaiCanhBao.TONG_RUI_RO.value in {c["ma"] for c in out["canh_bao"]}


@pytest.mark.asyncio
async def test_no_khau_vi_set_means_no_ceiling_to_compare_against(
    db_session, test_user, monkeypatch
):
    services, account = await _enter_cap8(db_session, test_user.id, khau_vi=None)
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=12_500, cat_lo=10_000,
    )
    await _seed_symbol(db_session, "CCC", icb_lv2="Công nghệ")
    _patch_prices(monkeypatch, {"AAA": 20_000, "CCC": 20_000})
    _patch_history(monkeypatch, {})

    out = await services["cap8"].kiem_tra(test_user.id, "CCC", 100, 20_000, cat_lo=18_000)
    assert out["tran_khau_vi_pct"] is None
    assert out["tong_rui_ro_canh_bao"] is False
    assert "khẩu vị" in out["giai_thich"]["tran_khau_vi"]


# ══════════════════════════════════════════════════════
# The check itself — never a gate, always with its "vì sao"
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_every_measure_ships_with_its_own_giai_thich(
    db_session, test_user, monkeypatch
):
    """§C12c — the FE renders these verbatim and invents no wording of its own,
    so every measure must carry one even when it could not be computed."""
    services, _account = await _enter_cap8(db_session, test_user.id)
    await _seed_symbol(db_session, "CCC", icb_lv2="Công nghệ")
    _patch_prices(monkeypatch, {"CCC": 20_000})
    _patch_history(monkeypatch, {})

    out = await services["cap8"].kiem_tra(test_user.id, "CCC", 100, 20_000, cat_lo=18_000)

    for key in ("don_nganh", "tuong_quan", "tong_rui_ro", "tran_khau_vi"):
        assert out["giai_thich"][key], key
    assert out["cross_ref_pm"]
    assert "Người quản lý danh mục" in out["cross_ref_pm"]
    assert out["quy_tac"]["nguong_don_nganh_pct"] == NGUONG_DON_NGANH_PCT
    assert out["quy_tac"]["nguong_tuong_quan"] == NGUONG_TUONG_QUAN
    assert out["quy_tac"]["khau_vi_tran_pct"] == KHAU_VI_TRAN_PCT


@pytest.mark.asyncio
async def test_kiem_tra_requires_progress_and_a_symbol(db_session, test_user):
    cap8 = Cap8Service(db_session)
    with pytest.raises(NotFoundError):
        await cap8.kiem_tra(test_user.id, "CCC", 100, 20_000)

    await _enter_cap8(db_session, test_user.id)
    with pytest.raises(BadRequestError):
        await cap8.kiem_tra(test_user.id, "  ", 100, 20_000)
    with pytest.raises(BadRequestError):
        await cap8.kiem_tra(test_user.id, "CCC", 0, 20_000)
    with pytest.raises(BadRequestError):
        await cap8.kiem_tra(test_user.id, "CCC", 100, 0)


# ══════════════════════════════════════════════════════
# ★ HONESTY 4 — the server re-derives; the client only reports its choice
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_record_kehoach_rederives_the_measures_and_ignores_the_clients_numbers(
    db_session, test_user, monkeypatch
):
    """A client that posts flattering numbers must change nothing. Only
    ``hanh_vi_canh_bao`` is taken on trust — the user is the only source for
    which button they pressed."""
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]

    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=5_000, cat_lo=18_000, nganh="Ngân hàng",
    )
    await _seed_symbol(db_session, "BBB", icb_lv2="Ngân hàng")
    _patch_prices(monkeypatch, {"AAA": 20_000, "BBB": 20_000})
    _patch_history(monkeypatch, {})

    # A pending BUY that would push Ngân hàng to 42.86% (>40%).
    buy = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id,
        symbol="BBB", cat_lo=18_000, qty=2_500, status=OrderStatus.PENDING,
    )

    kehoach = await cap8.record_kehoach(
        test_user.id,
        buy.id,
        hanh_vi_canh_bao="van_mua",
        # ↓ everything below is a LIE the client sent. All of it is discarded.
        don_nganh_pct=1.0,
        tuong_quan_cao_voi={"symbol": "XXX", "he_so": 0.01},
        tong_rui_ro_pct=0.0,
        danh_muc_canh_bao=[],
    )

    assert float(kehoach.don_nganh_pct) == pytest.approx(42.857, abs=1e-2)
    assert kehoach.danh_muc_canh_bao == [LoaiCanhBao.DON_NGANH.value]
    assert kehoach.tuong_quan_cao_voi is None  # no history patched → unknown
    assert kehoach.hanh_vi_canh_bao == HanhViCanhBao.VAN_MUA.value

    progress = await cap8.get_progress(test_user.id)
    assert progress["so_lenh_kiem_tra"] == 1
    assert progress["so_lan_mua_bat_chap_canh_bao"] == 1


@pytest.mark.asyncio
async def test_record_kehoach_rejects_khong_canh_bao_when_warnings_actually_fired(
    db_session, test_user, monkeypatch
):
    """The contradiction is REJECTED, not silently normalised: accepting it
    would let a client keep its "mua bất chấp cảnh báo" count clean."""
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=5_000, cat_lo=18_000, nganh="Ngân hàng",
    )
    await _seed_symbol(db_session, "BBB", icb_lv2="Ngân hàng")
    _patch_prices(monkeypatch, {"AAA": 20_000, "BBB": 20_000})
    _patch_history(monkeypatch, {})

    buy = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id,
        symbol="BBB", cat_lo=18_000, qty=2_500, status=OrderStatus.PENDING,
    )

    with pytest.raises(BadRequestError):
        await cap8.record_kehoach(test_user.id, buy.id, hanh_vi_canh_bao="khong_canh_bao")

    # Nothing was written.
    row = (
        await db_session.execute(
            select(OrderKehoach).where(OrderKehoach.order_id == buy.id)
        )
    ).scalar_one()
    assert row.hanh_vi_canh_bao is None
    assert row.danh_muc_canh_bao is None

    # The honest answer is accepted.
    ok = await cap8.record_kehoach(test_user.id, buy.id, hanh_vi_canh_bao="van_mua")
    assert ok.hanh_vi_canh_bao == HanhViCanhBao.VAN_MUA.value


@pytest.mark.asyncio
async def test_record_kehoach_requires_khong_canh_bao_when_nothing_fired(
    db_session, test_user, monkeypatch
):
    """The mirror image: claiming "Vẫn mua" when no warning existed would inflate
    the discipline counter against the user. Also rejected."""
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]
    await _seed_symbol(db_session, "BBB", icb_lv2="Ngân hàng")
    _patch_prices(monkeypatch, {"BBB": 20_000})
    _patch_history(monkeypatch, {})

    buy = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id,
        symbol="BBB", cat_lo=18_000, qty=100, status=OrderStatus.PENDING,
    )
    with pytest.raises(BadRequestError):
        await cap8.record_kehoach(test_user.id, buy.id, hanh_vi_canh_bao="van_mua")

    kehoach = await cap8.record_kehoach(
        test_user.id, buy.id, hanh_vi_canh_bao="khong_canh_bao"
    )
    assert kehoach.danh_muc_canh_bao == []
    assert kehoach.hanh_vi_canh_bao == HanhViCanhBao.KHONG_CANH_BAO.value

    progress = await cap8.get_progress(test_user.id)
    assert progress["so_lenh_kiem_tra"] == 1
    assert progress["so_lan_mua_bat_chap_canh_bao"] == 0


@pytest.mark.asyncio
async def test_a_recorded_check_can_never_be_rewritten_afterwards(
    db_session, test_user, monkeypatch
):
    """★ THE EXPLOIT WRITE-ONCE MUST STOP.

    Condition ② is "≤ 2 lần mua bất chấp cảnh báo trong 15 lệnh gần nhất", and
    ``_la_bat_chap`` reads the STORED ``danh_muc_canh_bao``. If a re-post
    re-derived that list from TODAY's portfolio, a user sitting on 3 defiances
    could simply sell the concentrated ngành down until the >40% warning stops
    firing, re-post each old order as "không có cảnh báo", and watch condition ②
    turn green — the record of what the danh mục looked like AT THE MOMENT OF THE
    ORDER rewritten into something that never happened.
    """
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=5_000, cat_lo=18_000, nganh="Ngân hàng",
    )
    await _seed_symbol(db_session, "BBB", icb_lv2="Ngân hàng")
    _patch_prices(monkeypatch, {"AAA": 20_000, "BBB": 20_000})
    _patch_history(monkeypatch, {})

    buy = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id,
        symbol="BBB", cat_lo=18_000, qty=2_500, status=OrderStatus.PENDING,
    )
    await cap8.record_kehoach(test_user.id, buy.id, hanh_vi_canh_bao="van_mua")
    progress = await cap8.get_progress(test_user.id)
    assert progress["bat_chap_gan_day"] == 1

    # The user now sells the concentrated ngành down: nothing would warn today.
    position = (
        await db_session.execute(
            select(VirtualPosition).where(VirtualPosition.symbol == "AAA")
        )
    ).scalar_one()
    await db_session.delete(position)
    await db_session.flush()
    fresh = await cap8.kiem_tra(test_user.id, "BBB", 2_500, 20_000, cat_lo=18_000)
    assert fresh["canh_bao"] == []  # …the warning really has stopped firing

    with pytest.raises(ConflictError):
        await cap8.record_kehoach(
            test_user.id, buy.id, hanh_vi_canh_bao="khong_canh_bao"
        )

    row = (
        await db_session.execute(
            select(OrderKehoach).where(OrderKehoach.order_id == buy.id)
        )
    ).scalar_one()
    assert row.danh_muc_canh_bao == [LoaiCanhBao.DON_NGANH.value]  # history intact
    assert row.hanh_vi_canh_bao == HanhViCanhBao.VAN_MUA.value
    assert float(row.don_nganh_pct) == pytest.approx(42.857, abs=1e-2)

    progress = await cap8.get_progress(test_user.id)
    assert progress["bat_chap_gan_day"] == 1
    assert progress["so_lan_mua_bat_chap_canh_bao"] == 1

    # An identical re-post is still a no-op (a retried network call must not 409).
    same = await cap8.record_kehoach(test_user.id, buy.id, hanh_vi_canh_bao="van_mua")
    assert same.danh_muc_canh_bao == [LoaiCanhBao.DON_NGANH.value]
    assert float(same.don_nganh_pct) == pytest.approx(42.857, abs=1e-2)


@pytest.mark.asyncio
async def test_giam_kl_is_recordable_when_the_reduction_cleared_the_warning(
    db_session, test_user, monkeypatch
):
    """★ Compliance must be representable. Reducing the size is exactly what
    makes a dồn-ngành warning stop firing, so a server that re-derives against
    the POST-adjustment order sees no warning and rejects ``giam_kl`` — i.e. the
    two "đã nghe cảnh báo" outcomes were recordable only when the user's
    reduction did NOT work.

    ``canh_bao_da_hien`` carries the warnings from the CHECK THE USER RESPONDED
    TO, so the compliant order records what it actually was.
    """
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=5_000, cat_lo=18_000, nganh="Ngân hàng",
    )
    await _seed_symbol(db_session, "BBB", icb_lv2="Ngân hàng")
    _patch_prices(monkeypatch, {"AAA": 20_000, "BBB": 20_000})
    _patch_history(monkeypatch, {})

    # The check the user saw: 2,500 lô would push Ngân hàng to 42.86% (>40%).
    check = await cap8.kiem_tra(test_user.id, "BBB", 2_500, 20_000, cat_lo=18_000)
    assert [c["ma"] for c in check["canh_bao"]] == [LoaiCanhBao.DON_NGANH.value]

    # They pressed "Giảm khối lượng" and bought 100 lô instead — which clears it.
    buy = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id,
        symbol="BBB", cat_lo=18_000, qty=100, status=OrderStatus.PENDING,
    )
    with pytest.raises(BadRequestError):  # no evidence any warning ever fired
        await cap8.record_kehoach(test_user.id, buy.id, hanh_vi_canh_bao="giam_kl")

    kehoach = await cap8.record_kehoach(
        test_user.id,
        buy.id,
        hanh_vi_canh_bao="giam_kl",
        canh_bao_da_hien=[c["ma"] for c in check["canh_bao"]],
    )
    assert kehoach.hanh_vi_canh_bao == HanhViCanhBao.GIAM_KL.value
    assert kehoach.danh_muc_canh_bao == [LoaiCanhBao.DON_NGANH.value]
    # ★ The stored measures stay the SERVER's own, computed after the reduction.
    assert float(kehoach.don_nganh_pct) == pytest.approx(29.14, abs=1e-2)

    out = cap8.kehoach_out(kehoach)
    assert "Giảm khối lượng" in out["giai_thich"]
    # …and it must NOT read as "danh mục không có cảnh báo nào".
    assert "không có cảnh báo nào" not in out["giai_thich"]

    # Complying is not defiance.
    progress = await cap8.get_progress(test_user.id)
    assert progress["so_lan_mua_bat_chap_canh_bao"] == 0
    assert progress["bat_chap_gan_day"] == 0


@pytest.mark.asyncio
async def test_canh_bao_da_hien_can_never_manufacture_or_erase_a_defiance(
    db_session, test_user, monkeypatch
):
    """``canh_bao_da_hien`` is the ONE thing the client reports about the check,
    so it may only ever justify a COMPLIANCE answer. ``van_mua`` (which feeds
    condition ②) and ``khong_canh_bao`` stay decided by the server's own
    re-derivation alone — in both directions."""
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]
    await _seed_symbol(db_session, "BBB", icb_lv2="Ngân hàng")
    _patch_prices(monkeypatch, {"BBB": 20_000})
    _patch_history(monkeypatch, {})

    small = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id,
        symbol="BBB", cat_lo=18_000, qty=100, status=OrderStatus.PENDING,
    )
    # A client claiming a warning it never got cannot record "mua bất chấp"…
    with pytest.raises(BadRequestError):
        await cap8.record_kehoach(
            test_user.id, small.id, hanh_vi_canh_bao="van_mua",
            canh_bao_da_hien=[LoaiCanhBao.DON_NGANH.value],
        )

    # …and a client hiding the warning it DID get cannot record "no warning".
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=5_000, cat_lo=18_000, nganh="Ngân hàng",
    )
    _patch_prices(monkeypatch, {"AAA": 20_000, "BBB": 20_000})
    big = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id,
        symbol="BBB", cat_lo=18_000, qty=2_500, status=OrderStatus.PENDING,
    )
    with pytest.raises(BadRequestError):
        await cap8.record_kehoach(
            test_user.id, big.id, hanh_vi_canh_bao="khong_canh_bao",
            canh_bao_da_hien=[],
        )

    # Garbage in the list is dropped, never stored.
    ok = await cap8.record_kehoach(
        test_user.id, small.id, hanh_vi_canh_bao="chon_ma_khac",
        canh_bao_da_hien=["khong_ton_tai", LoaiCanhBao.TUONG_QUAN.value],
    )
    assert ok.danh_muc_canh_bao == [LoaiCanhBao.TUONG_QUAN.value]


@pytest.mark.asyncio
async def test_record_kehoach_falls_back_to_the_planned_vung_mua_for_an_unfilled_market_order(
    db_session, test_user, monkeypatch
):
    """A MARKET order that has not filled has NO price of its own — neither
    ``filled_price_vnd`` nor ``limit_price_vnd``. Refusing it would mean the Cấp
    8 block is simply never recorded for that order; Cấp 1's vùng mua is the
    price the user themself planned to pay, and is the honest stand-in."""
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]
    await _seed_symbol(db_session, "BBB", icb_lv2="Ngân hàng")
    _patch_prices(monkeypatch, {"BBB": 20_000})
    _patch_history(monkeypatch, {})

    buy = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id,
        symbol="BBB", cat_lo=18_000, status=OrderStatus.PENDING,
    )
    buy.limit_price_vnd = None  # a MARKET order, still queued
    await db_session.flush()

    kehoach = await cap8.record_kehoach(
        test_user.id, buy.id, hanh_vi_canh_bao="khong_canh_bao"
    )
    assert kehoach.hanh_vi_canh_bao == HanhViCanhBao.KHONG_CANH_BAO.value
    assert kehoach.danh_muc_canh_bao == []
    assert kehoach.don_nganh_pct is not None


@pytest.mark.asyncio
async def test_record_kehoach_validates_and_needs_a_cap1_plan(
    db_session, test_user, monkeypatch
):
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]
    await _seed_symbol(db_session, "BBB", icb_lv2="Ngân hàng")
    _patch_prices(monkeypatch, {"BBB": 20_000})
    _patch_history(monkeypatch, {})

    naked = await _make_order(
        db_session, account.id, test_user.id, symbol="BBB", status=OrderStatus.PENDING
    )
    with pytest.raises(NotFoundError):  # no Cấp 1 kế hoạch row yet
        await cap8.record_kehoach(test_user.id, naked.id, hanh_vi_canh_bao="khong_canh_bao")

    buy = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id,
        symbol="BBB", cat_lo=18_000, status=OrderStatus.PENDING,
    )
    with pytest.raises(BadRequestError):
        await cap8.record_kehoach(test_user.id, buy.id, hanh_vi_canh_bao="khong_ro")

    sell = await _make_order(
        db_session, account.id, test_user.id, symbol="BBB", side=OrderSide.SELL
    )
    with pytest.raises(BadRequestError):
        await cap8.record_kehoach(test_user.id, sell.id, hanh_vi_canh_bao="khong_canh_bao")


@pytest.mark.asyncio
async def test_record_kehoach_is_idempotent(db_session, test_user, monkeypatch):
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]
    await _seed_symbol(db_session, "BBB", icb_lv2="Ngân hàng")
    _patch_prices(monkeypatch, {"BBB": 20_000})
    _patch_history(monkeypatch, {})

    buy = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id,
        symbol="BBB", cat_lo=18_000, status=OrderStatus.PENDING,
    )
    await cap8.record_kehoach(test_user.id, buy.id, hanh_vi_canh_bao="khong_canh_bao")
    await cap8.record_kehoach(test_user.id, buy.id, hanh_vi_canh_bao="khong_canh_bao")

    progress = await cap8.get_progress(test_user.id)
    assert progress["so_lenh_kiem_tra"] == 1


@pytest.mark.asyncio
async def test_kehoach_keeps_cap1_to_6_blocks_intact(db_session, test_user, monkeypatch):
    """Cấp 8's current risk block preserves all remaining plan blocks."""
    services, account = await _enter_cap8(db_session, test_user.id)
    await _seed_symbol(db_session, "BBB", icb_lv2="Ngân hàng")
    _patch_prices(monkeypatch, {"BBB": 20_000})
    _patch_history(monkeypatch, {})

    buy = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id,
        symbol="BBB", cat_lo=18_000, status=OrderStatus.PENDING,
    )
    await services["cap3"].record_kehoach(
        test_user.id, buy.id,
        khau_vi="can_bang", muc_tu_tin=3, cach_khoi_luong="linh_hoat",
        khoi_luong=100, pct_von=20.0,
    )
    await services["cap4"].record_kehoach(
        test_user.id, buy.id, doc_5_lop=_MAU_THUAN, ai_5_lop={**_ALL_NEU, "ky_thuat": "ok"}
    )
    await services["cap6"].record_kehoach(test_user.id, buy.id, conflict_level="nghiem")

    kehoach = await services["cap8"].record_kehoach(
        test_user.id, buy.id, hanh_vi_canh_bao="khong_canh_bao"
    )

    assert kehoach.lyDo.value == "ky_thuat"          # Cấp 1
    assert kehoach.cat_lo == 18_000                   # Cấp 2
    assert kehoach.khoi_luong == 100                  # Cấp 3
    assert kehoach.doc_5_lop == _MAU_THUAN            # Cấp 4
    assert kehoach.conflict_level == "nghiem"          # Cấp 6
    assert kehoach.hanh_vi_canh_bao == "khong_canh_bao"  # Cấp 8


@pytest.mark.asyncio
async def test_kehoach_out_explains_what_was_recorded(db_session, test_user, monkeypatch):
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=5_000, cat_lo=18_000, nganh="Ngân hàng",
    )
    await _seed_symbol(db_session, "BBB", icb_lv2="Ngân hàng")
    _patch_prices(monkeypatch, {"AAA": 20_000, "BBB": 20_000})
    _patch_history(monkeypatch, {})

    buy = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id,
        symbol="BBB", cat_lo=18_000, qty=2_500, status=OrderStatus.PENDING,
    )
    kehoach = await cap8.record_kehoach(test_user.id, buy.id, hanh_vi_canh_bao="giam_kl")

    out = cap8.kehoach_out(kehoach)
    assert out["hanh_vi_canh_bao"] == "giam_kl"
    assert out["hanh_vi_canh_bao_ten"] == "Giảm khối lượng"
    assert out["danh_muc_canh_bao"] == [LoaiCanhBao.DON_NGANH.value]
    assert "Dồn ngành" in out["canh_bao_text"]
    assert out["giai_thich"]

    # An order that never went through the check says so, and invents nothing.
    plain = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id,
        symbol="BBB", cat_lo=18_000, status=OrderStatus.PENDING,
    )
    plain_kehoach = (
        await db_session.execute(
            select(OrderKehoach).where(OrderKehoach.order_id == plain.id)
        )
    ).scalar_one()
    plain_out = cap8.kehoach_out(plain_kehoach)
    assert plain_out["danh_muc_canh_bao"] is None
    assert plain_out["hanh_vi_canh_bao"] is None
    assert "chưa" in plain_out["giai_thich"].lower()


# ══════════════════════════════════════════════════════
# _cat_lo_of_position — the new position→stop helper
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_cat_lo_of_position_reads_the_latest_filled_buy(db_session, test_user):
    """Single-lot approximation, documented: the account is average-cost, not
    lot-tracked, so the LATEST filled buy's kế hoạch stands for the position."""
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]

    assert await cap8._cat_lo_of_position(account.id, "AAA") is None  # no buy at all

    old = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id, symbol="AAA", cat_lo=15_000
    )
    old.created_at = _next_created_at()
    await db_session.flush()
    assert await cap8._cat_lo_of_position(account.id, "AAA") == 15_000

    newer = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id, symbol="AAA", cat_lo=18_000
    )
    newer.created_at = _next_created_at()
    await db_session.flush()
    assert await cap8._cat_lo_of_position(account.id, "AAA") == 18_000

    # A buy with a kế hoạch but no cắt lỗ → UNKNOWN, not the older 18,000. The
    # honest answer must not silently fall back to a stop the user replaced.
    newest = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id, symbol="AAA", cat_lo=None
    )
    newest.created_at = _next_created_at()
    await db_session.flush()
    assert await cap8._cat_lo_of_position(account.id, "AAA") is None

    # An UNFILLED buy is not the position's lot.
    pending = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id,
        symbol="BBB", cat_lo=12_000, status=OrderStatus.PENDING,
    )
    pending.created_at = _next_created_at()
    await db_session.flush()
    assert await cap8._cat_lo_of_position(account.id, "BBB") is None


# ══════════════════════════════════════════════════════
# Thách thức Quản trị rủi ro danh mục (§2③)
# ══════════════════════════════════════════════════════


async def _n_checked_orders(
    db_session, services, account_id, user_id, n: int, *, defiant: int = 0
):
    """``n`` orders that went through the check, the FIRST ``defiant`` of them
    with a real dồn-ngành warning the user bought through anyway."""
    cap8 = services["cap8"]
    for i in range(n):
        buy = await _buy_with_cap1_plan(
            db_session, services, account_id, user_id,
            symbol="BBB" if i < defiant else "DDD",
            cat_lo=18_000, qty=2_500 if i < defiant else 100,
            status=OrderStatus.PENDING,
        )
        buy.created_at = _next_created_at()
        await db_session.flush()
        await cap8.record_kehoach(
            user_id,
            buy.id,
            hanh_vi_canh_bao="van_mua" if i < defiant else "khong_canh_bao",
        )


@pytest.mark.asyncio
async def test_thach_thuc_window_is_rolling_not_lifetime(
    db_session, test_user, monkeypatch
):
    """Spec §2③ — "≤ 2 lần mua bất chấp cảnh báo TRONG 15 LỆNH GẦN NHẤT". Three
    old defiances that have scrolled out of the window must stop counting."""
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]
    # AAA is a real Ngân hàng position so BBB (also Ngân hàng, 2,500 lô) trips
    # the >40% warning while DDD (Công nghệ, 100 lô) trips nothing.
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=5_000, cat_lo=18_000, nganh="Ngân hàng",
    )
    await _seed_symbol(db_session, "BBB", icb_lv2="Ngân hàng")
    await _seed_symbol(db_session, "DDD", icb_lv2="Công nghệ")
    _patch_prices(monkeypatch, {"AAA": 20_000, "BBB": 20_000, "DDD": 20_000})
    _patch_history(monkeypatch, {})

    await _n_checked_orders(
        db_session, services, account.id, test_user.id, 3, defiant=3
    )
    tt = await cap8.thach_thuc(test_user.id)
    assert tt["mua_bat_chap"]["gia_tri_hien_tai"] == 3.0
    assert tt["mua_bat_chap"]["dat"] is False

    # 15 more clean orders push all 3 defiances out of the 15-order window.
    await _n_checked_orders(
        db_session, services, account.id, test_user.id, 15, defiant=0
    )
    tt2 = await cap8.thach_thuc(test_user.id)
    assert tt2["so_lenh_kiem_tra"]["gia_tri_hien_tai"] == 18.0
    assert tt2["mua_bat_chap"]["gia_tri_hien_tai"] == 0.0
    assert tt2["mua_bat_chap"]["dat"] is True
    assert "15 lệnh gần nhất" in tt2["mua_bat_chap"]["giai_thich"]

    # The LIFETIME figure is still 3 and is still reported — the window is a
    # graduation rule, not an eraser.
    progress = await cap8.get_progress(test_user.id)
    assert progress["so_lan_mua_bat_chap_canh_bao"] == 3


@pytest.mark.asyncio
async def test_thach_thuc_closing_state_states_the_missing_stop_caveat(
    db_session, test_user, monkeypatch
):
    """Condition ③ must never tell a user their portfolio is inside budget on
    the strength of positions whose risk is unknown."""
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=1_000, cat_lo=18_000, nganh="Ngân hàng",
    )
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="BBB", qty=1_000, cat_lo=None, nganh="Thép",
    )
    _patch_prices(monkeypatch, {"AAA": 20_000, "BBB": 20_000})
    _patch_history(monkeypatch, {})

    tt = await cap8.thach_thuc(test_user.id)
    leg = tt["danh_muc_an_toan"]
    assert leg["du_du_lieu"] is True
    assert "chưa có cắt lỗ" in leg["giai_thich"]
    assert tt["danh_muc"]["so_vi_the_thieu_cat_lo"] == 1
    # 2 positions of 20tr each vs 250tr cash → no sector anywhere near 40%.
    assert leg["dat"] is True


@pytest.mark.asyncio
async def test_thach_thuc_closing_state_fails_on_a_dominant_sector(
    db_session, test_user, monkeypatch
):
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]
    # 300tr Ngân hàng vs 250tr cash → NAV 550tr, ngành = 54.5% > 40%.
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=15_000, cat_lo=19_000, nganh="Ngân hàng",
    )
    _patch_prices(monkeypatch, {"AAA": 20_000})
    _patch_history(monkeypatch, {})

    tt = await cap8.thach_thuc(test_user.id)
    assert tt["danh_muc_an_toan"]["dat"] is False
    assert "Ngân hàng" in tt["danh_muc_an_toan"]["giai_thich"]
    assert tt["danh_muc"]["don_nganh_max"]["pct"] == pytest.approx(54.545, abs=1e-2)

    progress = await cap8.get_progress(test_user.id)
    assert progress["don_nganh_max_pct"] == pytest.approx(54.545, abs=1e-2)


@pytest.mark.asyncio
async def test_thach_thuc_reports_the_allocation_including_cash(
    db_session, test_user, monkeypatch
):
    """Khối ⑱'s "PHÂN BỔ NGÀNH" line — cash is a bucket, not a rounding gap."""
    services, account = await _enter_cap8(db_session, test_user.id)
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=5_000, cat_lo=18_000, nganh="Ngân hàng",
    )
    _patch_prices(monkeypatch, {"AAA": 20_000})
    _patch_history(monkeypatch, {})

    danh_muc = (await services["cap8"].thach_thuc(test_user.id))["danh_muc"]
    buckets = {row["nganh"]: row["pct"] for row in danh_muc["phan_bo_nganh"]}
    assert buckets["Ngân hàng"] == pytest.approx(28.571, abs=1e-2)
    assert buckets["Tiền mặt"] == pytest.approx(71.428, abs=1e-2)
    assert sum(buckets.values()) == pytest.approx(100.0, abs=1e-6)


# ══════════════════════════════════════════════════════
# Nhiệm vụ + graduation
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_tasks_and_graduation(db_session, test_user, monkeypatch):
    services, account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]
    await _seed_symbol(db_session, "DDD", icb_lv2="Công nghệ")
    _patch_prices(monkeypatch, {"DDD": 20_000})
    _patch_history(monkeypatch, {})

    with pytest.raises(ConflictError):
        await cap8.graduate(test_user.id)

    # ① first order through the check.
    await _n_checked_orders(db_session, services, account.id, test_user.id, 1)
    progress = await cap8.get_progress(test_user.id)
    assert progress["task_1_done_at"] is not None
    assert progress["task_2_done_at"] is None

    # ② first CLOSED round trip whose buy carries a Cấp 8 block.
    filled = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id, symbol="DDD", cat_lo=18_000
    )
    filled.created_at = _next_created_at()
    await db_session.flush()
    await cap8.record_kehoach(test_user.id, filled.id, hanh_vi_canh_bao="khong_canh_bao")
    await _sell_and_ketso(
        db_session, services, account.id, test_user.id, symbol="DDD"
    )
    progress = await cap8.get_progress(test_user.id)
    assert progress["task_2_done_at"] is not None
    assert progress["task_3_done_at"] is None

    with pytest.raises(ConflictError):
        await cap8.graduate(test_user.id)

    # ③ 15 checked orders + ≤2 defiances + a safe closing portfolio.
    await _n_checked_orders(db_session, services, account.id, test_user.id, 14)
    tt = await cap8.thach_thuc(test_user.id)
    assert tt["dat_ca_3"] is True

    graduated = await cap8.graduate(test_user.id)
    assert graduated["graduated_at"] is not None
    assert graduated["time_to_graduate_hours"] is not None

    again = await cap8.graduate(test_user.id)
    assert again["graduated_at"] == graduated["graduated_at"]


@pytest.mark.asyncio
async def test_mark_task_never_sets_what_the_history_does_not_support(
    db_session, test_user
):
    services, _account = await _enter_cap8(db_session, test_user.id)
    cap8 = services["cap8"]
    with pytest.raises(BadRequestError):
        await cap8.mark_task(test_user.id, 9)
    progress = await cap8.mark_task(test_user.id, 1)
    assert progress["task_1_done_at"] is None


# ══════════════════════════════════════════════════════
# Copy discipline (spec §9)
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_copy_never_gives_concrete_rebalancing_advice(
    db_session, test_user, monkeypatch
):
    """Spec §9 rules out auto-optimisation and concrete rebalancing advice: the
    check WARNS, then lets the user decide. Nothing may tell them to sell X."""
    services, account = await _enter_cap8(db_session, test_user.id)
    await _held(
        db_session, services, account.id, test_user.id,
        symbol="AAA", qty=15_000, cat_lo=19_000, nganh="Ngân hàng",
    )
    await _seed_symbol(db_session, "BBB", icb_lv2="Ngân hàng")
    _patch_prices(monkeypatch, {"AAA": 20_000, "BBB": 20_000})
    _patch_history(monkeypatch, {})

    check = await services["cap8"].kiem_tra(test_user.id, "BBB", 2_500, 20_000, cat_lo=18_000)
    tt = await services["cap8"].thach_thuc(test_user.id)

    blob = " ".join(
        [
            *check["giai_thich"].values(),
            *(c["text"] for c in check["canh_bao"]),
            check["cross_ref_pm"],
            *(
                leg["giai_thich"]
                for leg in (
                    tt["so_lenh_kiem_tra"],
                    tt["mua_bat_chap"],
                    tt["danh_muc_an_toan"],
                )
            ),
        ]
    ).lower()

    for forbidden in ("nên bán", "hãy bán", "bắt buộc", "không được mua", "cấm mua"):
        assert forbidden not in blob, forbidden
    # And it never presents itself as a gate.
    assert "cảnh báo" in blob


# ══════════════════════════════════════════════════════
# HTTP wiring
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_cap8_endpoints_wired_and_free(
    client, db_session, test_user, monkeypatch
):
    """Router mounted under /api/v1/cap8, gated by CurrentUser (not premium).

    Also pins HONESTY 4 across the wire: the lying numbers in the POST body are
    discarded and the server's own recomputation is what comes back.
    """
    from app.core.security import create_access_token

    account = await _fast_track_cap7(db_session, test_user.id)
    await db_session.commit()

    token = create_access_token(
        subject=test_user.id, extra_claims={"role": test_user.role.value}
    )
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.get("/api/v1/cap8/progress", headers=headers)
    assert r.status_code == 200
    assert r.json() is None

    r = await client.post("/api/v1/cap8/enter", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["so_lenh_kiem_tra"] == 0
    assert body["so_lan_mua_bat_chap_canh_bao"] == 0
    assert body["bat_chap_gan_day"] == 0
    # ★ NULL, not 0.0 — nothing has been priced yet.
    assert body["don_nganh_max_pct"] is None
    assert body["tong_rui_ro_pct"] is None

    r = await client.post("/api/v1/cap8/graduate", headers=headers)
    assert r.status_code == 409

    services = {
        "cap1": Cap1Service(db_session),
        "cap2": Cap2Service(db_session),
        "cap8": Cap8Service(db_session),
    }
    await _seed_symbol(db_session, "HTTP", icb_lv2="Công nghệ")
    _patch_prices(monkeypatch, {"HTTP": 20_000})
    _patch_history(monkeypatch, {})
    buy = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id,
        symbol="HTTP", cat_lo=18_000, status=OrderStatus.PENDING,
    )
    await db_session.commit()

    r = await client.get(
        "/api/v1/cap8/kiem-tra",
        headers=headers,
        params={"symbol": "HTTP", "khoi_luong": 100, "gia": 20_000, "cat_lo": 18_000},
    )
    assert r.status_code == 200, r.text
    kt = r.json()
    assert kt["nganh"] == "Công nghệ"
    assert kt["quy_tac"]["nguong_don_nganh_pct"] == NGUONG_DON_NGANH_PCT
    assert kt["quy_tac"]["nguong_tuong_quan"] == NGUONG_TUONG_QUAN
    assert kt["quy_tac"]["khau_vi_tran_pct"]["can_bang"] == KHAU_VI_TRAN_PCT["can_bang"]
    # No holdings at all → correlation is an explicit "chưa đủ dữ liệu", not 0.
    assert kt["tuong_quan"] is None
    assert kt["tuong_quan_du_lieu"] is False
    for key in ("don_nganh", "tuong_quan", "tong_rui_ro", "tran_khau_vi"):
        assert kt["giai_thich"][key]
    assert kt["canh_bao"] == []

    # ★ The body below lies about all four server-derived fields. All discarded.
    r = await client.post(
        "/api/v1/cap8/kehoach",
        headers=headers,
        json={
            "order_id": str(buy.id),
            "hanh_vi_canh_bao": "khong_canh_bao",
            "don_nganh_pct": 99.0,
            "tuong_quan_cao_voi": {"symbol": "XXX", "he_so": 0.99},
            "tong_rui_ro_pct": 99.0,
            "danh_muc_canh_bao": ["don_nganh", "tuong_quan", "tong_rui_ro"],
        },
    )
    assert r.status_code == 200, r.text
    kb = r.json()
    assert kb["danh_muc_canh_bao"] == []
    assert kb["tuong_quan_cao_voi"] is None
    assert kb["don_nganh_pct"] != 99.0
    assert kb["hanh_vi_canh_bao"] == "khong_canh_bao"
    assert kb["giai_thich"]

    # Re-posting a DIFFERENT hành vi onto a recorded order is 409 — the snapshot
    # is write-once (a re-derivation against today's danh mục would erase ②).
    r = await client.post(
        "/api/v1/cap8/kehoach",
        headers=headers,
        json={"order_id": str(buy.id), "hanh_vi_canh_bao": "van_mua"},
    )
    assert r.status_code == 409, r.text
    # …while an identical re-post is a plain no-op (retried network call).
    r = await client.post(
        "/api/v1/cap8/kehoach",
        headers=headers,
        json={"order_id": str(buy.id), "hanh_vi_canh_bao": "khong_canh_bao"},
    )
    assert r.status_code == 200, r.text

    # Claiming a warning-response when nothing fired is a contradiction → 400.
    buy2 = await _buy_with_cap1_plan(
        db_session, services, account.id, test_user.id,
        symbol="HTTP", cat_lo=18_000, status=OrderStatus.PENDING,
    )
    await db_session.commit()
    r = await client.post(
        "/api/v1/cap8/kehoach",
        headers=headers,
        json={"order_id": str(buy2.id), "hanh_vi_canh_bao": "van_mua"},
    )
    assert r.status_code == 400, r.text

    r = await client.patch("/api/v1/cap8/task", headers=headers, json={"task_no": 1})
    assert r.status_code == 200, r.text
    assert r.json()["task_1_done_at"] is not None

    r = await client.get("/api/v1/cap8/thach-thuc", headers=headers)
    assert r.status_code == 200, r.text
    tt = r.json()
    for key in (
        "dat_ca_3",
        "so_lenh_kiem_tra",
        "mua_bat_chap",
        "danh_muc_an_toan",
        "so_lenh_da_ket_so",
        "so_lan_mua_bat_chap_canh_bao",
        "cua_so_gan_day",
        "danh_muc",
    ):
        assert key in tt
    cua_so = Cap8Service.quy_tac()["cua_so_bat_chap"]
    assert f"{cua_so} lệnh gần nhất" in tt["mua_bat_chap"]["ten"]
    assert tt["danh_muc"]["cross_ref_pm"]

    r = await client.get("/api/v1/cap8/progress")
    assert r.status_code == 401
