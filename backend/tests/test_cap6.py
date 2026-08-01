"""Tests for the Cấp 6 «Đối chiếu» backend — kiểu cổ phiếu map từ ngành +
bảng trọng số gợi ý (kèm vì sao), bước Đối chiếu trên ``order_kehoach``,
Thách thức Đối chiếu (3 legs), graduation. Plus the carried-over Cấp 5 fix:
``POST /cap1/ketso`` upserts ``cam_xuc``.

Mirrors ``tests/test_cap5.py``'s style. Uses the ``test_user``/``db_session``
fixtures from ``tests/conftest.py``.

**Setup cost note.** Cấp 6's only real prerequisite is
``Cap5Progress.graduated_at``. ``test_enter_requires_cap5_graduated`` exercises
the real Cấp 5 gate (entered-but-not-graduated → 409); every other test uses
``_fast_track_cap5`` which stamps the prerequisite progress rows directly (Cấp
0→5's full graduation chain is already pinned by ``tests/test_cap5.py``).

**★ THE PRINCIPLE (spec §5/§10):** the trọng-số table is a SUGGESTION, never a
law. Picking a lớp quyết định outside ``lop_uu_tien`` is ``khop_goi_y = False``
— a NEUTRAL fact that feeds the khớp-vs-lệch comparison and nothing else.
``test_lech_goi_y_is_neutral_never_penalised`` pins that down.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import select

from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    UnprocessableEntityError,
)
from app.models.cap1 import Cap1Progress, OrderKehoach
from app.models.cap2 import Cap2Progress
from app.models.cap3 import Cap3Progress
from app.models.cap4 import Cap4Progress
from app.models.cap5 import Cap5Progress
from app.models.cap6 import KIEU_CO_PHIEU, KieuCoPhieu
from app.models.symbol import Symbol
from app.models.virtual_trading import OrderSide, OrderStatus, OrderType, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.cap1.service import Cap1Service
from app.services.cap2.service import Cap2Service
from app.services.cap3.service import Cap3Service
from app.services.cap4.service import Cap4Service
from app.services.cap5.service import Cap5Service
from app.services.cap6.service import Cap6Service

_ALL_NEU = {
    "ky_thuat": "neu",
    "dong_tien": "neu",
    "noi_bo": "neu",
    "tin_tuc": "neu",
    "dinh_gia": "neu",
}

# A genuinely conflicting 5-lớp reading: ≥1 Ủng hộ AND ≥1 Ngược chiều (spec §4).
_MAU_THUAN = {**_ALL_NEU, "ky_thuat": "ok", "dinh_gia": "bad"}


def _doc(**overrides: str) -> dict[str, str]:
    return {**_ALL_NEU, **overrides}


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


async def _seed_symbol(db_session, symbol: str, *, icb_lv1=None, icb_lv2=None) -> Symbol:
    """A ``symbols`` reference row — this is the SERVER-side ngành source Cấp 6
    maps to a kiểu cổ phiếu (see ``app.services.cap6.service``)."""
    row = Symbol(symbol=symbol.upper(), name=symbol, icb_lv1=icb_lv1, icb_lv2=icb_lv2)
    db_session.add(row)
    await db_session.flush()
    return row


async def _fast_track_cap5(db_session, user_id, *, graduated: bool = True):
    """Stamp the Cấp 1-5 progress rows a Cấp 6 flow needs + a VT account."""
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
            Cap5Progress(
                user_id=user_id, entered_at=now, graduated_at=now if graduated else None
            ),
        ]
    )
    await db_session.flush()
    return account


async def _enter_cap6(db_session, user_id):
    """Fast-track Cấp 1-5 then enter Cấp 6. Returns ``(services, account)``."""
    account = await _fast_track_cap5(db_session, user_id)
    services = {
        "cap1": Cap1Service(db_session),
        "cap2": Cap2Service(db_session),
        "cap3": Cap3Service(db_session),
        "cap4": Cap4Service(db_session),
        "cap5": Cap5Service(db_session),
        "cap6": Cap6Service(db_session),
    }
    await services["cap6"].enter(user_id)
    return services, account


async def _buy_with_plan(
    db_session,
    services,
    account_id,
    user_id,
    *,
    symbol: str,
    doc_5_lop: dict[str, str] | None = None,
    buy_price: int = 20_000,
) -> VirtualOrder:
    """A BUY carrying Cấp 1-4's blocks (the row Cấp 6 extends)."""
    buy = await _make_order(
        db_session, account_id, user_id, symbol=symbol, price=buy_price
    )
    await services["cap1"].record_kehoach(
        user_id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=buy_price
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
        user_id, buy.id, doc_5_lop=doc_5_lop or _MAU_THUAN, ai_5_lop=_doc(ky_thuat="ok")
    )
    return buy


async def _sell_and_ketso(
    db_session, services, account_id, user_id, *, symbol: str, win: bool
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


async def _doi_chieu_round_trip(
    db_session,
    services,
    account_id,
    user_id,
    *,
    symbol: str,
    kieu: str | None = None,
    icb_lv2: str | None = None,
    lop_quyet_dinh: str = "dinh_gia",
    win: bool = True,
    close: bool = True,
):
    """One full Cấp 6 round trip: buy + kế hoạch (all levels) + Đối chiếu, then
    optionally sell + Cấp 1 kết sổ so the outcome feeds the win rates."""
    if icb_lv2 is not None:
        await _seed_symbol(db_session, symbol, icb_lv2=icb_lv2)
    buy = await _buy_with_plan(
        db_session, services, account_id, user_id, symbol=symbol
    )
    kehoach = await services["cap6"].record_kehoach(
        user_id,
        buy.id,
        kieu_co_phieu=kieu,
        lop_mau_thuan=_MAU_THUAN,
        lop_quyet_dinh=lop_quyet_dinh,
        ly_do_doi_chieu="Định giá là lớp tôi tin cho nhóm này.",
    )
    if close:
        await _sell_and_ketso(
            db_session, services, account_id, user_id, symbol=symbol, win=win
        )
    return kehoach


# ══════════════════════════════════════════════════════
# Enter / prerequisites
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_enter_requires_cap5_graduated(db_session, test_user):
    cap6 = Cap6Service(db_session)

    # No Cấp 5 progress at all.
    with pytest.raises(NotFoundError):
        await cap6.enter(test_user.id)

    # Entered Cấp 5 but not graduated → conflict.
    await _fast_track_cap5(db_session, test_user.id, graduated=False)
    with pytest.raises(ConflictError):
        await cap6.enter(test_user.id)

    cap5_row = (
        await db_session.execute(
            select(Cap5Progress).where(Cap5Progress.user_id == test_user.id)
        )
    ).scalar_one()
    cap5_row.graduated_at = datetime.now(UTC)
    await db_session.flush()

    progress = await cap6.enter(test_user.id)
    assert progress.user_id == test_user.id
    assert progress.graduated_at is None
    assert progress.so_lenh_doi_chieu == 0
    assert progress.so_kieu_da_gap == 0
    assert progress.ty_le_thang_khop == 0.0
    assert progress.ty_le_thang_lech == 0.0

    # idempotent
    again = await cap6.enter(test_user.id)
    assert again.id == progress.id


@pytest.mark.asyncio
async def test_get_progress_none_before_enter(db_session, test_user):
    cap6 = Cap6Service(db_session)
    assert await cap6.get_progress(test_user.id) is None


# ══════════════════════════════════════════════════════
# GET /cap6/goi-y — kiểu cổ phiếu + trọng số gợi ý
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_goi_y_maps_nganh_to_kieu_with_provenance(db_session, test_user):
    """A mapped ngành returns its kiểu + lớp ưu tiên / ít tin + the vì-sao
    sentence the FE shows verbatim (§C12c)."""
    services, _account = await _enter_cap6(db_session, test_user.id)
    await _seed_symbol(db_session, "VCB", icb_lv1="Ngân hàng", icb_lv2="Ngân hàng")

    result = await services["cap6"].goi_y(test_user.id, "vcb")
    assert result["symbol"] == "VCB"
    assert result["kieu"] == KieuCoPhieu.NGAN_HANG.value
    assert result["kieu_ten"] == "Ngân hàng"
    assert result["lop_uu_tien"] == ["dinh_gia", "noi_bo"]
    assert result["lop_it_tin"] == ["ky_thuat"]
    assert result["giai_thich"]
    assert "P/B" in result["giai_thich"]
    # Labels for the FE, and the ngành the kiểu was derived FROM.
    assert result["lop_uu_tien_ten"] == ["Định giá", "Nội bộ"]
    assert result["nganh"] == "Ngân hàng"


@pytest.mark.asyncio
async def test_goi_y_covers_every_kieu_in_the_table(db_session, test_user):
    """Every one of the 6 kiểu has a name, ưu-tiên/ít-tin lists made of real
    lớp keys, and a vì-sao sentence (spec §5's table)."""
    from app.models.cap4 import LOP_KEYS

    assert set(KIEU_CO_PHIEU) == {m.value for m in KieuCoPhieu}
    assert len(KIEU_CO_PHIEU) == 6
    for kieu, row in KIEU_CO_PHIEU.items():
        assert row["ten"], kieu
        assert row["giai_thich"], kieu
        assert row["lop_uu_tien"], kieu
        assert row["lop_it_tin"], kieu
        for lop in (*row["lop_uu_tien"], *row["lop_it_tin"]):
            assert lop in LOP_KEYS, (kieu, lop)
        # ưu tiên and ít tin never overlap.
        assert not set(row["lop_uu_tien"]) & set(row["lop_it_tin"]), kieu


@pytest.mark.asyncio
async def test_goi_y_unmapped_returns_null_kieu_with_honest_note(db_session, test_user):
    """No symbols row / no ngành / an unmapped ngành → ``kieu = null`` + an
    honest "chưa phân loại" note; the FE still lets the user pick a lớp."""
    services, _account = await _enter_cap6(db_session, test_user.id)

    # (a) no ``symbols`` row at all
    result = await services["cap6"].goi_y(test_user.id, "NOSUCH")
    assert result["kieu"] is None
    assert result["kieu_ten"] is None
    assert result["lop_uu_tien"] == []
    assert result["lop_it_tin"] == []
    assert "chưa phân loại" in result["giai_thich"].lower()

    # (b) a row with no ngành
    await _seed_symbol(db_session, "NONG")
    result = await services["cap6"].goi_y(test_user.id, "NONG")
    assert result["kieu"] is None
    assert "chưa phân loại" in result["giai_thich"].lower()

    # (c) an ngành that is deliberately NOT mapped ("Tài chính" at lv1 mixes
    #     bất động sản / chứng khoán / bảo hiểm — the service refuses to guess)
    await _seed_symbol(db_session, "MIX", icb_lv1="Tài chính")
    result = await services["cap6"].goi_y(test_user.id, "MIX")
    assert result["kieu"] is None


@pytest.mark.asyncio
async def test_goi_y_falls_back_from_icb_lv2_to_lv1(db_session, test_user):
    services, _account = await _enter_cap6(db_session, test_user.id)
    await _seed_symbol(db_session, "FPT", icb_lv1="Công nghệ Thông tin")
    result = await services["cap6"].goi_y(test_user.id, "FPT")
    assert result["kieu"] == KieuCoPhieu.TANG_TRUONG.value
    assert "dinh_gia" in result["lop_it_tin"]


@pytest.mark.asyncio
async def test_goi_y_requires_progress_and_a_symbol(db_session, test_user):
    cap6 = Cap6Service(db_session)
    with pytest.raises(NotFoundError):
        await cap6.goi_y(test_user.id, "VCB")

    services, _account = await _enter_cap6(db_session, test_user.id)
    with pytest.raises(BadRequestError):
        await services["cap6"].goi_y(test_user.id, "   ")


# ══════════════════════════════════════════════════════
# POST /cap6/kehoach — bước Đối chiếu
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_kehoach_stores_the_doi_chieu_block(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)
    await _seed_symbol(db_session, "VCB", icb_lv2="Ngân hàng")
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="VCB"
    )

    kehoach = await services["cap6"].record_kehoach(
        test_user.id,
        buy.id,
        kieu_co_phieu=None,
        lop_mau_thuan=_MAU_THUAN,
        lop_quyet_dinh="dinh_gia",
        ly_do_doi_chieu="P/B đang rẻ hơn trung bình ngành.",
    )
    assert kehoach.kieu_co_phieu == KieuCoPhieu.NGAN_HANG.value
    assert kehoach.lop_quyet_dinh == "dinh_gia"
    assert kehoach.ly_do_doi_chieu == "P/B đang rẻ hơn trung bình ngành."
    assert kehoach.khop_goi_y is True  # dinh_gia ∈ ưu tiên của ngân hàng

    # trọng số gợi ý is the server's own copy of the kiểu table + provenance.
    assert kehoach.trong_so_goi_y["lop_uu_tien"] == ["dinh_gia", "noi_bo"]
    assert kehoach.trong_so_goi_y["lop_it_tin"] == ["ky_thuat"]
    assert kehoach.trong_so_goi_y["giai_thich"]

    # lớp mâu thuẫn is normalised into an Ủng hộ / Ngược chiều summary.
    assert kehoach.lop_mau_thuan["ung_ho"] == ["ky_thuat"]
    assert kehoach.lop_mau_thuan["nguoc_chieu"] == ["dinh_gia"]
    assert kehoach.lop_mau_thuan["co_mau_thuan"] is True

    # Cấp 1-4's blocks are untouched (cộng dồn).
    assert kehoach.vung_mua == 20_000
    assert kehoach.cat_lo == 18_000
    assert kehoach.pct_von == 20.0
    assert kehoach.doc_5_lop == _MAU_THUAN


@pytest.mark.asyncio
async def test_kehoach_derives_khop_goi_y_both_ways(db_session, test_user):
    """★ The server derives ``khop_goi_y`` itself — in-suggestion AND
    out-of-suggestion picks are both computed, never taken from the client."""
    services, account = await _enter_cap6(db_session, test_user.id)
    await _seed_symbol(db_session, "TCB", icb_lv2="Ngân hàng")
    await _seed_symbol(db_session, "CTG", icb_lv2="Ngân hàng")

    khop_buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="TCB"
    )
    khop = await services["cap6"].record_kehoach(
        test_user.id,
        khop_buy.id,
        kieu_co_phieu=None,
        lop_mau_thuan=_MAU_THUAN,
        lop_quyet_dinh="noi_bo",  # ∈ ưu tiên
        ly_do_doi_chieu="Lãnh đạo đang mua vào.",
    )
    assert khop.khop_goi_y is True

    lech_buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="CTG"
    )
    lech = await services["cap6"].record_kehoach(
        test_user.id,
        lech_buy.id,
        kieu_co_phieu=None,
        lop_mau_thuan=_MAU_THUAN,
        lop_quyet_dinh="ky_thuat",  # ∉ ưu tiên (là lớp ít tin của ngân hàng)
        ly_do_doi_chieu="Nền giá vừa bứt phá, tôi tin đà.",
    )
    assert lech.khop_goi_y is False


@pytest.mark.asyncio
async def test_kehoach_never_trusts_client_kieu_or_khop(db_session, test_user):
    """A client claiming another kiểu (to flip ``khop_goi_y``) is overridden by
    the server's own ngành → kiểu derivation."""
    services, account = await _enter_cap6(db_session, test_user.id)
    await _seed_symbol(db_session, "BID", icb_lv2="Ngân hàng")
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="BID"
    )

    kehoach = await services["cap6"].record_kehoach(
        test_user.id,
        buy.id,
        kieu_co_phieu="tang_truong",  # ← client lies: would make ky_thuat "khớp"
        lop_mau_thuan=_MAU_THUAN,
        lop_quyet_dinh="ky_thuat",
        ly_do_doi_chieu="Tôi tin đà giá.",
    )
    assert kehoach.kieu_co_phieu == KieuCoPhieu.NGAN_HANG.value
    assert kehoach.khop_goi_y is False
    assert kehoach.trong_so_goi_y["nguon"] == "nganh"


@pytest.mark.asyncio
async def test_kehoach_accepts_client_kieu_only_when_nganh_unknown(db_session, test_user):
    """No server-side ngành → the client's kiểu is accepted BUT re-validated
    against the 6-value enum."""
    services, account = await _enter_cap6(db_session, test_user.id)
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="TINY"
    )

    with pytest.raises(BadRequestError):
        await services["cap6"].record_kehoach(
            test_user.id,
            buy.id,
            kieu_co_phieu="meme_coin",  # not one of the 6
            lop_mau_thuan=_MAU_THUAN,
            lop_quyet_dinh="dong_tien",
            ly_do_doi_chieu="Dòng tiền vào mạnh.",
        )

    kehoach = await services["cap6"].record_kehoach(
        test_user.id,
        buy.id,
        kieu_co_phieu="dau_co_nho",
        lop_mau_thuan=_MAU_THUAN,
        lop_quyet_dinh="dong_tien",
        ly_do_doi_chieu="Dòng tiền vào mạnh.",
    )
    assert kehoach.kieu_co_phieu == KieuCoPhieu.DAU_CO_NHO.value
    assert kehoach.khop_goi_y is True  # dong_tien ∈ ưu tiên của đầu cơ nhỏ
    assert kehoach.trong_so_goi_y["nguon"] == "client"


@pytest.mark.asyncio
async def test_kehoach_unclassified_kieu_leaves_khop_goi_y_null(db_session, test_user):
    """No ngành AND no client kiểu → "chưa phân loại": the đối chiếu is still
    recorded, but there is no suggestion so ``khop_goi_y`` stays NULL (it is
    NOT set to false — the user is never marked "lệch" against nothing)."""
    services, account = await _enter_cap6(db_session, test_user.id)
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="XYZ"
    )

    kehoach = await services["cap6"].record_kehoach(
        test_user.id,
        buy.id,
        kieu_co_phieu=None,
        lop_mau_thuan=_MAU_THUAN,
        lop_quyet_dinh="tin_tuc",
        ly_do_doi_chieu="Tin ngành vừa ra.",
    )
    assert kehoach.kieu_co_phieu is None
    assert kehoach.trong_so_goi_y is None
    assert kehoach.khop_goi_y is None
    assert kehoach.lop_quyet_dinh == "tin_tuc"

    progress = await services["cap6"].get_progress(test_user.id)
    assert progress.so_lenh_doi_chieu == 1  # vẫn tính là 1 lệnh đã đối chiếu
    assert progress.so_kieu_da_gap == 0  # nhưng chưa gặp kiểu nào


@pytest.mark.asyncio
async def test_kehoach_requires_non_empty_ly_do(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="LD1"
    )
    for bad in (None, "", "   "):
        with pytest.raises(UnprocessableEntityError):
            await services["cap6"].record_kehoach(
                test_user.id,
                buy.id,
                kieu_co_phieu=None,
                lop_mau_thuan=_MAU_THUAN,
                lop_quyet_dinh="dinh_gia",
                ly_do_doi_chieu=bad,
            )


@pytest.mark.asyncio
async def test_kehoach_validates_lop_quyet_dinh(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="LQ1"
    )
    with pytest.raises(BadRequestError):
        await services["cap6"].record_kehoach(
            test_user.id,
            buy.id,
            kieu_co_phieu=None,
            lop_mau_thuan=_MAU_THUAN,
            lop_quyet_dinh="linh_cam",
            ly_do_doi_chieu="Tôi thấy vậy.",
        )


@pytest.mark.asyncio
async def test_kehoach_404_without_a_cap1_kehoach_row(db_session, test_user):
    """Same convention as Cấp 2-5: Cấp 6 ADDS onto the existing row."""
    services, account = await _enter_cap6(db_session, test_user.id)
    naked = await _make_order(db_session, account.id, test_user.id, symbol="NAKED")
    with pytest.raises(NotFoundError):
        await services["cap6"].record_kehoach(
            test_user.id,
            naked.id,
            kieu_co_phieu=None,
            lop_mau_thuan=_MAU_THUAN,
            lop_quyet_dinh="dinh_gia",
            ly_do_doi_chieu="Định giá rẻ.",
        )


@pytest.mark.asyncio
async def test_kehoach_requires_progress_and_a_buy_order(db_session, test_user):
    account = await _fast_track_cap5(db_session, test_user.id)
    cap6 = Cap6Service(db_session)
    buy = await _make_order(db_session, account.id, test_user.id, symbol="P1")
    with pytest.raises(NotFoundError):  # no Cấp 6 progress
        await cap6.record_kehoach(
            test_user.id,
            buy.id,
            kieu_co_phieu=None,
            lop_mau_thuan=_MAU_THUAN,
            lop_quyet_dinh="dinh_gia",
            ly_do_doi_chieu="x",
        )

    await cap6.enter(test_user.id)
    sell = await _make_order(
        db_session, account.id, test_user.id, symbol="P1", side=OrderSide.SELL
    )
    with pytest.raises(BadRequestError):  # đối chiếu chỉ ghi cho lệnh MUA
        await cap6.record_kehoach(
            test_user.id,
            sell.id,
            kieu_co_phieu=None,
            lop_mau_thuan=_MAU_THUAN,
            lop_quyet_dinh="dinh_gia",
            ly_do_doi_chieu="x",
        )


@pytest.mark.asyncio
async def test_kehoach_derives_lop_mau_thuan_from_doc_5_lop(db_session, test_user):
    """``lop_mau_thuan`` is re-derived from the persisted ``doc_5_lop`` (Cấp 4's
    own ratings) rather than trusted from the client — a client sending a
    different conflict map cannot rewrite what the user actually rated."""
    services, account = await _enter_cap6(db_session, test_user.id)
    doc = _doc(dong_tien="ok", tin_tuc="ok", noi_bo="bad")
    buy = await _make_order(db_session, account.id, test_user.id, symbol="DRV")
    await services["cap1"].record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000
    )
    await services["cap4"].record_kehoach(test_user.id, buy.id, doc_5_lop=doc)

    kehoach = await services["cap6"].record_kehoach(
        test_user.id,
        buy.id,
        kieu_co_phieu=None,
        lop_mau_thuan={"ky_thuat": "ok"},  # ← client's version, ignored
        lop_quyet_dinh="dong_tien",
        ly_do_doi_chieu="Dòng tiền vào.",
    )
    assert kehoach.lop_mau_thuan["ung_ho"] == ["dong_tien", "tin_tuc"]
    assert kehoach.lop_mau_thuan["nguoc_chieu"] == ["noi_bo"]
    assert kehoach.lop_mau_thuan["nguon"] == "doc_5_lop"


# ══════════════════════════════════════════════════════
# ★ THE PRINCIPLE — lệch gợi ý is NEUTRAL
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_lech_goi_y_is_neutral_never_penalised(db_session, test_user):
    """★ Picking a lớp outside the suggestion is a NEUTRAL fact (spec §5/§10):
    two identical orders differing ONLY in khớp/lệch must both be recorded,
    both counted in ``so_lenh_doi_chieu``, and neither flagged as wrong. The
    only thing ``khop_goi_y`` does is choose which comparison GROUP it joins.
    """
    services, account = await _enter_cap6(db_session, test_user.id)
    khop = await _doi_chieu_round_trip(
        db_session, services, account.id, test_user.id,
        symbol="NK1", icb_lv2="Ngân hàng", lop_quyet_dinh="dinh_gia", win=False,
    )
    lech = await _doi_chieu_round_trip(
        db_session, services, account.id, test_user.id,
        symbol="NK2", icb_lv2="Ngân hàng", lop_quyet_dinh="ky_thuat", win=True,
    )

    assert khop.khop_goi_y is True
    assert lech.khop_goi_y is False
    # Both are complete, both persisted, both counted — nothing about `lech`
    # is nulled out, downgraded or marked invalid.
    assert lech.lop_quyet_dinh == "ky_thuat"
    assert lech.ly_do_doi_chieu
    assert lech.trong_so_goi_y["lop_uu_tien"] == ["dinh_gia", "noi_bo"]

    progress = await services["cap6"].get_progress(test_user.id)
    assert progress.so_lenh_doi_chieu == 2
    assert progress.task_1_done_at is not None

    # The lệch order even WON while the khớp one lost — and that is simply
    # reported, never "corrected" toward the suggestion.
    result = await services["cap6"].thach_thuc(test_user.id)
    assert result["nhom_lech"]["so_lenh"] == 1
    assert result["nhom_khop"]["so_lenh"] == 1
    assert "sai" not in result["nhom_lech"]["giai_thich"].lower()


# ══════════════════════════════════════════════════════
# Counters
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_counters_so_lenh_and_distinct_kieu(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)
    cap6 = services["cap6"]

    # 2 ngân hàng + 1 tăng trưởng → 3 lệnh, 2 kiểu distinct.
    await _doi_chieu_round_trip(
        db_session, services, account.id, test_user.id,
        symbol="B1", icb_lv2="Ngân hàng", close=False,
    )
    await _doi_chieu_round_trip(
        db_session, services, account.id, test_user.id,
        symbol="B2", icb_lv2="Ngân hàng", close=False,
    )
    await _doi_chieu_round_trip(
        db_session, services, account.id, test_user.id,
        symbol="T1", icb_lv2="Công nghệ Thông tin", lop_quyet_dinh="ky_thuat",
        close=False,
    )

    progress = await cap6.get_progress(test_user.id)
    assert progress.so_lenh_doi_chieu == 3
    assert progress.so_kieu_da_gap == 2

    # A plain Cấp 1-5 order (no lớp quyết định) never counts.
    await _buy_with_plan(db_session, services, account.id, test_user.id, symbol="PLAIN")
    progress = await cap6.get_progress(test_user.id)
    assert progress.so_lenh_doi_chieu == 3
    assert progress.so_kieu_da_gap == 2

    # A 3rd distinct kiểu.
    await _doi_chieu_round_trip(
        db_session, services, account.id, test_user.id,
        symbol="R1", icb_lv2="Bất động sản", lop_quyet_dinh="noi_bo", close=False,
    )
    progress = await cap6.get_progress(test_user.id)
    assert progress.so_lenh_doi_chieu == 4
    assert progress.so_kieu_da_gap == 3


# ══════════════════════════════════════════════════════
# Win-rate comparison (khớp vs lệch) + the ≥3 minimum
# ══════════════════════════════════════════════════════


async def _n_round_trips(
    db_session, services, account_id, user_id, *, prefix, n, khop, wins, icb="Ngân hàng"
):
    """``n`` closed đối-chiếu round trips in the khớp (or lệch) group, of which
    the first ``wins`` are winners."""
    lop = "dinh_gia" if khop else "ky_thuat"
    for i in range(n):
        await _doi_chieu_round_trip(
            db_session, services, account_id, user_id,
            symbol=f"{prefix}{i}", icb_lv2=icb, lop_quyet_dinh=lop, win=i < wins,
        )


@pytest.mark.asyncio
async def test_win_rate_groups_need_at_least_3_closed_trades_each(db_session, test_user):
    """With 1-2 closed trades in a group its rate is reported as INSUFFICIENT
    and the comparison must not be made (spec §7 khối ⑮'s <3 threshold)."""
    services, account = await _enter_cap6(db_session, test_user.id)
    cap6 = services["cap6"]

    # 2 khớp (both winners) vs 2 lệch (both losers) — tempting but too few.
    await _n_round_trips(
        db_session, services, account.id, test_user.id,
        prefix="KA", n=2, khop=True, wins=2,
    )
    await _n_round_trips(
        db_session, services, account.id, test_user.id,
        prefix="LA", n=2, khop=False, wins=0,
    )

    result = await cap6.thach_thuc(test_user.id)
    assert result["nhom_khop"]["so_lenh"] == 2
    assert result["nhom_lech"]["so_lenh"] == 2
    assert result["nhom_khop"]["du_du_lieu"] is False
    assert result["nhom_lech"]["du_du_lieu"] is False
    assert result["doi_chieu_giup_ich"]["dat"] is False
    assert result["doi_chieu_giup_ich"]["du_du_lieu"] is False
    assert "3" in result["doi_chieu_giup_ich"]["giai_thich"]

    # One more in each group → both qualify, and now khớp (100%) ≥ lệch (0%).
    await _doi_chieu_round_trip(
        db_session, services, account.id, test_user.id,
        symbol="KA9", icb_lv2="Ngân hàng", lop_quyet_dinh="dinh_gia", win=True,
    )
    await _doi_chieu_round_trip(
        db_session, services, account.id, test_user.id,
        symbol="LA9", icb_lv2="Ngân hàng", lop_quyet_dinh="ky_thuat", win=False,
    )
    result = await cap6.thach_thuc(test_user.id)
    assert result["nhom_khop"]["du_du_lieu"] is True
    assert result["nhom_lech"]["du_du_lieu"] is True
    assert result["nhom_khop"]["ty_le_thang"] == pytest.approx(100.0)
    assert result["nhom_lech"]["ty_le_thang"] == pytest.approx(0.0)
    assert result["doi_chieu_giup_ich"]["du_du_lieu"] is True
    assert result["doi_chieu_giup_ich"]["dat"] is True

    progress = await cap6.get_progress(test_user.id)
    assert progress.ty_le_thang_khop == pytest.approx(100.0)
    assert progress.ty_le_thang_lech == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_win_rate_comparison_reports_khop_below_lech_honestly(db_session, test_user):
    """When the suggestion is NOT helping this user, the leg simply fails and
    the giải thích says so plainly (spec §7 khối ⑮ "trung thực, không xu nịnh").
    """
    services, account = await _enter_cap6(db_session, test_user.id)
    cap6 = services["cap6"]
    await _n_round_trips(
        db_session, services, account.id, test_user.id,
        prefix="KB", n=4, khop=True, wins=1,  # 25%
    )
    await _n_round_trips(
        db_session, services, account.id, test_user.id,
        prefix="LB", n=4, khop=False, wins=3,  # 75%
    )

    result = await cap6.thach_thuc(test_user.id)
    assert result["nhom_khop"]["ty_le_thang"] == pytest.approx(25.0)
    assert result["nhom_lech"]["ty_le_thang"] == pytest.approx(75.0)
    assert result["doi_chieu_giup_ich"]["du_du_lieu"] is True
    assert result["doi_chieu_giup_ich"]["dat"] is False
    assert result["doi_chieu_giup_ich"]["giai_thich"]


@pytest.mark.asyncio
async def test_win_rate_ties_count_as_pass(db_session, test_user):
    """The bar is khớp **≥** lệch (spec §2③) — a tie passes."""
    services, account = await _enter_cap6(db_session, test_user.id)
    await _n_round_trips(
        db_session, services, account.id, test_user.id,
        prefix="KT", n=4, khop=True, wins=2,  # 50%
    )
    await _n_round_trips(
        db_session, services, account.id, test_user.id,
        prefix="LT", n=4, khop=False, wins=2,  # 50%
    )
    result = await services["cap6"].thach_thuc(test_user.id)
    assert result["doi_chieu_giup_ich"]["dat"] is True


@pytest.mark.asyncio
async def test_unclassified_orders_join_neither_win_rate_group(db_session, test_user):
    """``khop_goi_y = NULL`` (chưa phân loại kiểu) feeds NEITHER group."""
    services, account = await _enter_cap6(db_session, test_user.id)
    for i in range(4):
        await _doi_chieu_round_trip(
            db_session, services, account.id, test_user.id,
            symbol=f"UN{i}", icb_lv2=None, lop_quyet_dinh="tin_tuc", win=True,
        )
    result = await services["cap6"].thach_thuc(test_user.id)
    assert result["nhom_khop"]["so_lenh"] == 0
    assert result["nhom_lech"]["so_lenh"] == 0
    assert result["so_lenh_doi_chieu"]["gia_tri_hien_tai"] == 4


# ══════════════════════════════════════════════════════
# Thách thức Đối chiếu (nhiệm vụ ③) — each leg alone
# ══════════════════════════════════════════════════════


async def _make_task3_almost(
    db_session, services, account, user_id, *, n_khop=8, n_lech=7, kieus=3
):
    """15 đối-chiếu round trips across ``kieus`` kiểu, khớp winning 100% and
    lệch winning 0% — i.e. all 3 legs of nhiệm vụ ③ satisfied."""
    icbs = ["Ngân hàng", "Công nghệ Thông tin", "Bất động sản", "Hóa chất"]
    made = 0
    for i in range(n_khop):
        icb = icbs[i % kieus]
        lop = KIEU_CO_PHIEU[_kieu_of(icb)]["lop_uu_tien"][0]
        await _doi_chieu_round_trip(
            db_session, services, account.id, user_id,
            symbol=f"GK{i}", icb_lv2=icb, lop_quyet_dinh=lop, win=True,
        )
        made += 1
    for i in range(n_lech):
        icb = icbs[i % kieus]
        lop = KIEU_CO_PHIEU[_kieu_of(icb)]["lop_it_tin"][0]
        await _doi_chieu_round_trip(
            db_session, services, account.id, user_id,
            symbol=f"GL{i}", icb_lv2=icb, lop_quyet_dinh=lop, win=False,
        )
        made += 1
    return made


def _kieu_of(icb: str) -> str:
    from app.services.cap6.service import kieu_from_nganh

    kieu = kieu_from_nganh(icb)
    assert kieu is not None, icb
    return kieu


@pytest.mark.asyncio
async def test_thach_thuc_shape_and_all_three_legs(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)
    cap6 = services["cap6"]

    result = await cap6.thach_thuc(test_user.id)
    assert result["dat_ca_3"] is False
    for key in ("so_lenh_doi_chieu", "so_kieu_da_gap", "doi_chieu_giup_ich"):
        assert result[key]["ten"]
        assert result[key]["giai_thich"]  # §C12c — never a bare number
        assert result[key]["dat"] is False
    assert result["so_lenh_doi_chieu"]["muc_tieu"] == 15
    assert result["so_kieu_da_gap"]["muc_tieu"] == 3

    n = await _make_task3_almost(db_session, services, account, test_user.id)
    assert n == 15

    result = await cap6.thach_thuc(test_user.id)
    assert result["so_lenh_doi_chieu"]["gia_tri_hien_tai"] == 15
    assert result["so_kieu_da_gap"]["gia_tri_hien_tai"] == 3
    assert result["doi_chieu_giup_ich"]["dat"] is True
    assert result["dat_ca_3"] is True

    progress = await cap6.get_progress(test_user.id)
    assert progress.task_1_done_at is not None
    assert progress.task_2_done_at is not None  # ② kết sổ đầu có đối chiếu
    assert progress.task_3_done_at is not None


@pytest.mark.asyncio
async def test_task3_fails_when_only_so_lenh_short(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)
    cap6 = services["cap6"]
    n = await _make_task3_almost(
        db_session, services, account, test_user.id, n_khop=7, n_lech=7
    )
    assert n == 14

    progress = await cap6.get_progress(test_user.id)
    assert progress.so_lenh_doi_chieu == 14
    assert progress.so_kieu_da_gap == 3
    assert progress.ty_le_thang_khop >= progress.ty_le_thang_lech
    assert progress.task_3_done_at is None
    result = await cap6.thach_thuc(test_user.id)
    assert result["so_lenh_doi_chieu"]["dat"] is False
    assert result["so_kieu_da_gap"]["dat"] is True
    assert result["doi_chieu_giup_ich"]["dat"] is True


@pytest.mark.asyncio
async def test_task3_fails_when_only_kieu_count_short(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)
    cap6 = services["cap6"]
    await _make_task3_almost(
        db_session, services, account, test_user.id, n_khop=8, n_lech=7, kieus=2
    )

    progress = await cap6.get_progress(test_user.id)
    assert progress.so_lenh_doi_chieu == 15
    assert progress.so_kieu_da_gap == 2
    assert progress.task_3_done_at is None
    result = await cap6.thach_thuc(test_user.id)
    assert result["so_lenh_doi_chieu"]["dat"] is True
    assert result["so_kieu_da_gap"]["dat"] is False
    assert result["doi_chieu_giup_ich"]["dat"] is True


@pytest.mark.asyncio
async def test_task3_fails_when_only_win_rate_leg_short(db_session, test_user):
    """15 lệnh across 3 kiểu, but the khớp group loses more than the lệch one."""
    services, account = await _enter_cap6(db_session, test_user.id)
    cap6 = services["cap6"]
    icbs = ["Ngân hàng", "Công nghệ Thông tin", "Bất động sản"]
    for i in range(8):
        icb = icbs[i % 3]
        await _doi_chieu_round_trip(
            db_session, services, account.id, test_user.id,
            symbol=f"SK{i}", icb_lv2=icb,
            lop_quyet_dinh=KIEU_CO_PHIEU[_kieu_of(icb)]["lop_uu_tien"][0],
            win=i < 2,  # 25%
        )
    for i in range(7):
        icb = icbs[i % 3]
        await _doi_chieu_round_trip(
            db_session, services, account.id, test_user.id,
            symbol=f"SL{i}", icb_lv2=icb,
            lop_quyet_dinh=KIEU_CO_PHIEU[_kieu_of(icb)]["lop_it_tin"][0],
            win=i < 6,  # ~86%
        )

    progress = await cap6.get_progress(test_user.id)
    assert progress.so_lenh_doi_chieu == 15
    assert progress.so_kieu_da_gap == 3
    assert progress.ty_le_thang_khop < progress.ty_le_thang_lech
    assert progress.task_3_done_at is None
    result = await cap6.thach_thuc(test_user.id)
    assert result["so_lenh_doi_chieu"]["dat"] is True
    assert result["so_kieu_da_gap"]["dat"] is True
    assert result["doi_chieu_giup_ich"]["dat"] is False


@pytest.mark.asyncio
async def test_mark_task_recomputes_only(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)
    cap6 = services["cap6"]
    with pytest.raises(BadRequestError):
        await cap6.mark_task(test_user.id, 9)

    progress = await cap6.mark_task(test_user.id, 1)
    assert progress.task_1_done_at is None  # no history → no fabrication

    await _doi_chieu_round_trip(
        db_session, services, account.id, test_user.id,
        symbol="MT1", icb_lv2="Ngân hàng", close=False,
    )
    progress = await cap6.mark_task(test_user.id, 1)
    assert progress.task_1_done_at is not None
    assert progress.task_2_done_at is None  # chưa kết sổ lệnh có đối chiếu


@pytest.mark.asyncio
async def test_thach_thuc_requires_progress(db_session, test_user):
    cap6 = Cap6Service(db_session)
    with pytest.raises(NotFoundError):
        await cap6.thach_thuc(test_user.id)


# ══════════════════════════════════════════════════════
# Graduation
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_graduate_requires_3_of_3(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)
    cap6 = services["cap6"]

    with pytest.raises(ConflictError):
        await cap6.graduate(test_user.id)

    await _make_task3_almost(
        db_session, services, account, test_user.id, n_khop=7, n_lech=7
    )
    with pytest.raises(ConflictError):  # 14 lệnh — ③ chưa đạt
        await cap6.graduate(test_user.id)

    await _doi_chieu_round_trip(
        db_session, services, account.id, test_user.id,
        symbol="GZ", icb_lv2="Ngân hàng", lop_quyet_dinh="dinh_gia", win=True,
    )
    progress = await cap6.get_progress(test_user.id)
    assert progress.task_1_done_at is not None
    assert progress.task_2_done_at is not None
    assert progress.task_3_done_at is not None

    progress = await cap6.graduate(test_user.id)
    assert progress.graduated_at is not None
    assert progress.time_to_graduate_hours is not None

    first = progress.graduated_at
    again = await cap6.graduate(test_user.id)
    assert again.graduated_at == first


# ══════════════════════════════════════════════════════
# CARRIED-OVER FIX — POST /cap1/ketso upserts cam_xuc
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_cap1_ketso_upserts_cam_xuc(db_session, test_user):
    """The FE now posts ``/cap1/ketso`` BEFORE the Kết sổ modal opens (so
    ``cam_xuc`` is null), then posts again with the real emotion. The second
    post must UPDATE the same row instead of erroring / silently dropping it.
    """
    services, account = await _enter_cap6(db_session, test_user.id)
    cap1 = services["cap1"]

    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="EMO"
    )
    assert buy is not None
    sell = await _make_order(
        db_session, account.id, test_user.id, symbol="EMO", side=OrderSide.SELL,
        price=22_000,
    )

    first = await cap1.record_ketso(test_user.id, sell.id)  # pre-flight, no cảm xúc
    assert first.cam_xuc is None
    assert first.pnl_vnd == 200_000

    second = await cap1.record_ketso(test_user.id, sell.id, cam_xuc="so")
    assert second.id == first.id  # SAME row, no duplicate
    assert second.cam_xuc.value == "so"
    # Nothing else was recomputed away.
    assert second.pnl_vnd == 200_000
    assert second.gia_ra == 22_000

    # A later null post never wipes a recorded emotion, and still conflicts.
    with pytest.raises(ConflictError):
        await cap1.record_ketso(test_user.id, sell.id)
    await db_session.refresh(second)
    assert second.cam_xuc.value == "so"

    # An invalid emotion is still rejected.
    with pytest.raises(BadRequestError):
        await cap1.record_ketso(test_user.id, sell.id, cam_xuc="hoang_mang")


# ══════════════════════════════════════════════════════
# GET /cap6/kehoach/{order_id} — đọc lại đối chiếu của MỘT lệnh (Kết sổ)
# ══════════════════════════════════════════════════════


async def _second_user(db_session, email: str = "other-cap6@example.com"):
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
async def test_get_kehoach_returns_the_stored_doi_chieu_with_its_labels(
    db_session, test_user
):
    """The Kết sổ reads back exactly what was recorded, with every label + the
    vì-sao sentence it needs to render khớp/lệch — nothing recomputed."""
    services, account = await _enter_cap6(db_session, test_user.id)
    await _seed_symbol(db_session, "VCB", icb_lv1="Ngân hàng", icb_lv2="Ngân hàng")
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="VCB"
    )
    await services["cap6"].record_kehoach(
        test_user.id,
        buy.id,
        lop_quyet_dinh="dinh_gia",
        ly_do_doi_chieu="P/B rẻ hơn trung bình ngành.",
    )

    out = await services["cap6"].get_kehoach(test_user.id, buy.id)
    assert out["co_du_lieu"] is True
    assert out["order_id"] == buy.id
    assert out["symbol"] == "VCB"
    assert out["kieu_co_phieu"] == KieuCoPhieu.NGAN_HANG.value
    assert out["kieu_ten"] == "Ngân hàng"
    assert out["nganh"] == "Ngân hàng"
    assert out["lop_uu_tien"] == ["dinh_gia", "noi_bo"]
    assert out["lop_uu_tien_ten"] == ["Định giá", "Nội bộ"]
    assert out["lop_it_tin"] == ["ky_thuat"]
    assert out["lop_it_tin_ten"] == ["Kỹ thuật"]
    assert out["lop_quyet_dinh"] == "dinh_gia"
    assert out["lop_quyet_dinh_ten"] == "Định giá"
    assert out["khop_goi_y"] is True
    assert out["khop_goi_y_ten"] == "Khớp gợi ý"
    assert out["ly_do_doi_chieu"] == "P/B rẻ hơn trung bình ngành."
    assert out["lop_mau_thuan"]["co_mau_thuan"] is True
    assert out["trong_so_goi_y"]["nguon"] == "nganh"
    # The §C12c provenance sentence, verbatim from the kiểu table.
    assert "P/B" in out["giai_thich"]
    assert "KHỚP" in out["giai_thich"]


@pytest.mark.asyncio
async def test_get_kehoach_says_lech_without_ever_calling_it_wrong(
    db_session, test_user
):
    """★ Lệch gợi ý is a NEUTRAL fact (spec §5/§10) — the Kết sổ sentence must
    say so out loud, never "sai"."""
    services, account = await _enter_cap6(db_session, test_user.id)
    await _seed_symbol(db_session, "VCB", icb_lv1="Ngân hàng", icb_lv2="Ngân hàng")
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="VCB"
    )
    await services["cap6"].record_kehoach(
        test_user.id,
        buy.id,
        lop_quyet_dinh="ky_thuat",  # ← ít tin cho ngân hàng ⇒ lệch
        ly_do_doi_chieu="Nền giá vừa bứt lên.",
    )

    out = await services["cap6"].get_kehoach(test_user.id, buy.id)
    assert out["khop_goi_y"] is False
    assert out["khop_goi_y_ten"] == "Lệch gợi ý"
    assert "LỆCH" in out["giai_thich"]
    assert "KHÔNG bị tính là sai" in out["giai_thich"]


@pytest.mark.asyncio
async def test_get_kehoach_serves_a_client_picked_kieu_that_goi_y_cannot(
    db_session, test_user
):
    """★ THE GAP THIS ENDPOINT CLOSES.

    For a symbol the server cannot classify, the kiểu came from the CLIENT and
    lives only on the order. ``/cap6/goi-y`` re-derives from ngành and therefore
    still answers "chưa phân loại" — so a Kết sổ built on it renders "không xét"
    even though the server DID record a ``khop_goi_y``. The per-order read
    returns what was recorded.
    """
    services, account = await _enter_cap6(db_session, test_user.id)
    # No ``symbols`` row for ZZZZ → server cannot classify → client fallback.
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="ZZZZ"
    )
    await services["cap6"].record_kehoach(
        test_user.id,
        buy.id,
        kieu_co_phieu=KieuCoPhieu.DAU_CO_NHO.value,
        lop_quyet_dinh="dong_tien",
        ly_do_doi_chieu="Dòng tiền vào rất mạnh mấy phiên nay.",
    )

    # /cap6/goi-y still knows nothing about ZZZZ …
    goi_y = await services["cap6"].goi_y(test_user.id, "ZZZZ")
    assert goi_y["kieu"] is None
    assert goi_y["lop_uu_tien"] == []

    # … but the per-order read serves the RECORDED đối chiếu in full.
    out = await services["cap6"].get_kehoach(test_user.id, buy.id)
    assert out["co_du_lieu"] is True
    assert out["kieu_co_phieu"] == KieuCoPhieu.DAU_CO_NHO.value
    assert out["kieu_ten"] == KIEU_CO_PHIEU[KieuCoPhieu.DAU_CO_NHO.value]["ten"]
    assert out["lop_uu_tien"] == ["dong_tien", "ky_thuat"]
    assert out["khop_goi_y"] is True
    assert out["khop_goi_y_ten"] == "Khớp gợi ý"
    assert out["trong_so_goi_y"]["nguon"] == "client"
    assert "chưa phân loại" not in out["giai_thich"].lower()


@pytest.mark.asyncio
async def test_get_kehoach_stays_honest_when_the_kieu_was_never_known(
    db_session, test_user
):
    """Kiểu unknown AND no client fallback → ``khop_goi_y`` is NULL (never
    False) and the sentence is the same "chưa phân loại" one ``/goi-y``
    returns: the user is never marked lệch against a suggestion never made."""
    services, account = await _enter_cap6(db_session, test_user.id)
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="ZZZZ"
    )
    await services["cap6"].record_kehoach(
        test_user.id,
        buy.id,
        lop_quyet_dinh="dinh_gia",
        ly_do_doi_chieu="Tôi tin định giá cho mã này.",
    )

    out = await services["cap6"].get_kehoach(test_user.id, buy.id)
    assert out["co_du_lieu"] is True
    assert out["kieu_co_phieu"] is None
    assert out["kieu_ten"] is None
    assert out["khop_goi_y"] is None
    assert out["khop_goi_y_ten"] is None
    assert out["lop_uu_tien"] == []
    assert "Chưa phân loại được kiểu cổ phiếu cho ZZZZ" in out["giai_thich"]


@pytest.mark.asyncio
async def test_get_kehoach_404_for_another_users_order(db_session, test_user):
    """Ownership check — a foreign order is 404 (never 403), the same
    convention ``record_kehoach`` uses for an unknown order."""
    services, _account = await _enter_cap6(db_session, test_user.id)
    other, other_account = await _second_user(db_session)
    foreign = await _make_order(db_session, other_account.id, other.id, symbol="AAA")

    with pytest.raises(NotFoundError):
        await services["cap6"].get_kehoach(test_user.id, foreign.id)

    # An order that does not exist at all behaves identically.
    import uuid as _uuid

    with pytest.raises(NotFoundError):
        await services["cap6"].get_kehoach(test_user.id, _uuid.uuid4())


@pytest.mark.asyncio
async def test_get_kehoach_200_with_an_explicit_no_data_signal(db_session, test_user):
    """An order that predates Cấp 6 (all-null columns) is a NORMAL read with
    ``co_du_lieu = False`` — not a 404, so the FE can tell "chưa có bước Đối
    chiếu" apart from "endpoint hỏng"."""
    services, account = await _enter_cap6(db_session, test_user.id)

    # (a) row exists (Cấp 1-4 blocks) but no Đối chiếu was ever recorded
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="OLD"
    )
    out = await services["cap6"].get_kehoach(test_user.id, buy.id)
    assert out["co_du_lieu"] is False
    assert out["order_id"] == buy.id
    assert out["symbol"] == "OLD"
    assert out["kieu_co_phieu"] is None
    assert out["lop_quyet_dinh"] is None
    assert out["khop_goi_y"] is None
    assert out["ly_do_doi_chieu"] is None
    assert out["lop_uu_tien"] == []
    assert out["giai_thich"]

    # (b) no ``order_kehoach`` row at all — same shape, still a 200
    bare = await _make_order(db_session, account.id, test_user.id, symbol="BARE")
    bare_out = await services["cap6"].get_kehoach(test_user.id, bare.id)
    assert bare_out["co_du_lieu"] is False
    assert bare_out["id"] is None
    assert bare_out["giai_thich"] == out["giai_thich"]


@pytest.mark.asyncio
async def test_get_kehoach_never_rewrites_what_was_recorded(db_session, test_user):
    """A read is a READ: even after the symbol gains an ngành that maps to a
    different kiểu, the order keeps the kiểu (and the khớp) it was recorded
    with. Recomputing here would rewrite history after the outcome is known."""
    services, account = await _enter_cap6(db_session, test_user.id)
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="ZZZZ"
    )
    await services["cap6"].record_kehoach(
        test_user.id,
        buy.id,
        kieu_co_phieu=KieuCoPhieu.DAU_CO_NHO.value,
        lop_quyet_dinh="dong_tien",
        ly_do_doi_chieu="Dòng tiền vào rất mạnh.",
    )
    # The ngành arrives later and maps to a DIFFERENT kiểu.
    await _seed_symbol(db_session, "ZZZZ", icb_lv1="Ngân hàng", icb_lv2="Ngân hàng")

    first = await services["cap6"].get_kehoach(test_user.id, buy.id)
    second = await services["cap6"].get_kehoach(test_user.id, buy.id)
    assert first == second
    assert first["kieu_co_phieu"] == KieuCoPhieu.DAU_CO_NHO.value
    assert first["khop_goi_y"] is True

    kehoach = (
        await db_session.execute(
            select(OrderKehoach).where(OrderKehoach.order_id == buy.id)
        )
    ).scalar_one()
    assert kehoach.kieu_co_phieu == KieuCoPhieu.DAU_CO_NHO.value
    assert kehoach.khop_goi_y is True


@pytest.mark.asyncio
async def test_get_kehoach_requires_progress(db_session, test_user):
    account = await _fast_track_cap5(db_session, test_user.id)
    order = await _make_order(db_session, account.id, test_user.id, symbol="AAA")
    with pytest.raises(NotFoundError):
        await Cap6Service(db_session).get_kehoach(test_user.id, order.id)


# ══════════════════════════════════════════════════════
# HTTP wiring
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_cap6_endpoints_wired_and_free(client, db_session, test_user):
    """Router mounted under /api/v1/cap6, gated by CurrentUser (not premium)."""
    from app.core.security import create_access_token

    account = await _fast_track_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "VCB", icb_lv1="Ngân hàng", icb_lv2="Ngân hàng")
    await db_session.commit()

    token = create_access_token(
        subject=test_user.id, extra_claims={"role": test_user.role.value}
    )
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.get("/api/v1/cap6/progress", headers=headers)
    assert r.status_code == 200
    assert r.json() is None

    r = await client.post("/api/v1/cap6/enter", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["so_lenh_doi_chieu"] == 0
    assert body["so_kieu_da_gap"] == 0

    r = await client.post("/api/v1/cap6/graduate", headers=headers)
    assert r.status_code == 409

    r = await client.get("/api/v1/cap6/goi-y", headers=headers, params={"symbol": "VCB"})
    assert r.status_code == 200, r.text
    gbody = r.json()
    assert gbody["kieu"] == "ngan_hang"
    assert gbody["lop_uu_tien"] == ["dinh_gia", "noi_bo"]
    assert gbody["giai_thich"]

    r = await client.get(
        "/api/v1/cap6/goi-y", headers=headers, params={"symbol": "ZZZZ"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["kieu"] is None

    services = {
        "cap1": Cap1Service(db_session),
        "cap2": Cap2Service(db_session),
        "cap3": Cap3Service(db_session),
        "cap4": Cap4Service(db_session),
        "cap6": Cap6Service(db_session),
    }
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="VCB"
    )
    await db_session.commit()

    # Empty lý do → 422
    r = await client.post(
        "/api/v1/cap6/kehoach",
        headers=headers,
        json={
            "order_id": str(buy.id),
            "kieu_co_phieu": None,
            "lop_mau_thuan": _MAU_THUAN,
            "lop_quyet_dinh": "dinh_gia",
            "ly_do_doi_chieu": "   ",
        },
    )
    assert r.status_code == 422, r.text

    r = await client.post(
        "/api/v1/cap6/kehoach",
        headers=headers,
        json={
            "order_id": str(buy.id),
            "kieu_co_phieu": None,
            "lop_mau_thuan": _MAU_THUAN,
            "lop_quyet_dinh": "dinh_gia",
            "ly_do_doi_chieu": "P/B rẻ hơn ngành.",
        },
    )
    assert r.status_code == 200, r.text
    kbody = r.json()
    assert kbody["kieu_co_phieu"] == "ngan_hang"
    assert kbody["kieu_ten"] == "Ngân hàng"
    assert kbody["khop_goi_y"] is True

    # Per-order read-back for the Kết sổ.
    r = await client.get(f"/api/v1/cap6/kehoach/{buy.id}", headers=headers)
    assert r.status_code == 200, r.text
    dbody = r.json()
    assert dbody["co_du_lieu"] is True
    assert dbody["kieu_co_phieu"] == "ngan_hang"
    assert dbody["kieu_ten"] == "Ngân hàng"
    assert dbody["lop_uu_tien"] == ["dinh_gia", "noi_bo"]
    assert dbody["khop_goi_y"] is True
    assert dbody["khop_goi_y_ten"] == "Khớp gợi ý"
    assert dbody["giai_thich"]

    import uuid as _uuid

    r = await client.get(f"/api/v1/cap6/kehoach/{_uuid.uuid4()}", headers=headers)
    assert r.status_code == 404, r.text

    r = await client.patch("/api/v1/cap6/task", headers=headers, json={"task_no": 1})
    assert r.status_code == 200, r.text
    assert r.json()["task_1_done_at"] is not None

    r = await client.get("/api/v1/cap6/thach-thuc", headers=headers)
    assert r.status_code == 200, r.text
    tbody = r.json()
    for key in (
        "dat_ca_3",
        "so_lenh_doi_chieu",
        "so_kieu_da_gap",
        "doi_chieu_giup_ich",
        "nhom_khop",
        "nhom_lech",
    ):
        assert key in tbody

    # Unauthenticated is rejected
    r = await client.get("/api/v1/cap6/progress")
    assert r.status_code == 401
