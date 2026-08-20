"""Tests cho backend Cấp 5 «Lão luyện — Săn mã» — màn Săn mã (5 bộ lọc + lọc
sàn), Watchlist + điểm đồng thuận 5 lớp, 2 nhiệm vụ song song, nguồn săn cho
Kết sổ, Phân tích danh mục (khối ⑫/⑬), tốt nghiệp 2/2, migration.

Theo style của ``tests/test_cap4.py``. Dùng fixture ``test_user``/``db_session``
của ``tests/conftest.py``.

★★ **BỘ TEST CŨ ĐÃ ĐI CÙNG CẤP 5 CŨ.** 42 test về verdict hệ gợi ý / phân loại
4 ô / nhật ký "đứng ngoài có chủ đích" / Thách thức Lão luyện KHÔNG còn: bảng
``standby_decision``, 5 cột ``verdict_*``/``o_4``/``ly_do_sua`` và 4 cột nhiệm vụ
cũ bị bỏ ở revision ``b2e6f4a17c93``. ``test_cap5_khong_con_api_4_o_dung_ngoai``
canh cho chúng không bò trở lại.

**Setup cost note.** Điều kiện duy nhất để vào Cấp 5 là
``Cap4Progress.graduated_at``; diễn lại trọn Cấp 0→4 tốn ~60 lượt gọi service mỗi
test. ``test_enter_requires_cap4_graduated`` chạy chuỗi service THẬT (để cái cổng
được ghim vào service thật); mọi test khác dùng ``_fast_track_cap4``.

**KHÔNG có mạng trong test.** Máy săn mã nói chuyện với nguồn dữ liệu qua
protocol ``HuntDataSource``; test tiêm ``_FakeHuntSource`` (nến ngày + chuỗi mua
ròng dựng tay). Điểm đồng thuận 5 lớp đọc bảng ``ai_insight_history`` thật —
test seed hàng vào đó, không gọi AI.

★★ **LUẬT 1 ĐƯỢC CANH RIÊNG** (``TestLuat1*`` bên dưới): bộ lọc thiếu dữ liệu
phải trả ``kha_dung=False`` + ``tong_so_ma=None``, TUYỆT ĐỐI không phải "0 mã
thoả". Repo đã dính lớp lỗi "chưa biết hiện thành 0" 5 lần.
"""

from __future__ import annotations

import dataclasses
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.ai_insight_history import AIInsightHistory
from app.models.cap1 import Cap1Progress, OrderKehoach, OrderKetso
from app.models.cap2 import Cap2Progress
from app.models.cap3 import Cap3Progress
from app.models.cap4 import Cap4Progress
from app.models.cap5 import Cap5HuntLog, Cap5Progress
from app.models.symbol import Symbol
from app.models.virtual_trading import OrderSide, OrderStatus, OrderType, VirtualOrder
from app.models.watchlist import WatchlistItem
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.cap0.service import Cap0Service
from app.services.cap1.service import Cap1Service
from app.services.cap2.service import Cap2Service
from app.services.cap3.service import Cap3Service
from app.services.cap4.service import Cap4Service
from app.services.cap5.hunt import (
    MIN_GIA_VND,
    MIN_GTGD_TB_VND,
    SO_NEN_CAN,
    HuntBar,
)
from app.services.cap5.service import (
    MAX_WATCHLIST_ITEMS,
    MIN_LENH_KHOI_12,
    MUC_TIEU_SO_MA_MUA,
    MUC_TIEU_SO_MA_SAN,
    Cap5Service,
)

# ══════════════════════════════════════════════════════
# Nguồn dữ liệu giả cho máy săn mã
# ══════════════════════════════════════════════════════

_D0 = date(2026, 1, 5)  # thứ Hai


def _bars(
    *,
    n: int = SO_NEN_CAN,
    close: float = 20_000.0,
    volume: float = 100_000.0,
    gtgd: float | None = 5 * MIN_GTGD_TB_VND,
) -> list[HuntBar]:
    """``n`` nến ngày phẳng, đủ qua lọc sàn (giá 20.000đ · GTGD 5 tỷ/phiên)."""
    return [
        HuntBar(
            ngay=(_D0 + timedelta(days=i)).isoformat(),
            close=close,
            volume=volume,
            gtgd_vnd=gtgd,
        )
        for i in range(n)
    ]


def _with_last(bars: list[HuntBar], **fields) -> list[HuntBar]:
    """Sửa nến CUỐI (phiên gần nhất) — nơi mọi ngưỡng §5.3 được đo."""
    return [*bars[:-1], dataclasses.replace(bars[-1], **fields)]


class _FakeHuntSource:
    """``HuntDataSource`` dựng tay — không mạng, đếm luôn số lần bị gọi.

    ``flows=None`` mô phỏng ĐÚNG backend hôm nay: không có nguồn mua ròng theo
    từng phiên cho toàn sàn ⇒ ``net_flow`` trả ``None`` (chứ không phải ``{}``).
    """

    def __init__(
        self,
        bars: dict[str, list[HuntBar]] | None = None,
        flows: dict[str, dict[str, list[float]]] | None = None,
    ) -> None:
        self.bars = {k.upper(): v for k, v in (bars or {}).items()}
        self.flows = flows
        self.bars_calls = 0
        self.flow_calls = 0

    async def daily_bars(self, symbols, *, so_nen):  # noqa: ANN001, ANN201
        self.bars_calls += 1
        wanted = {s.upper() for s in symbols}
        return {k: v for k, v in self.bars.items() if k in wanted}

    async def net_flow(self, symbols, *, ben, so_phien):  # noqa: ANN001, ANN201
        self.flow_calls += 1
        if self.flows is None:
            return None
        wanted = {s.upper() for s in symbols}
        return {
            k.upper(): v for k, v in self.flows.get(ben, {}).items() if k.upper() in wanted
        }


# ══════════════════════════════════════════════════════
# Setup helpers
# ══════════════════════════════════════════════════════


async def _seed_symbol(
    db_session, symbol: str, *, exchange: str = "HOSE", asset_type: str = "stock",
    is_index: bool = False, is_active: bool = True,
) -> Symbol:
    """Một hàng bảng ``symbols`` — nguồn rổ mã HOSE của lọc sàn (§5.2)."""
    row = Symbol(
        symbol=symbol.upper(),
        name=symbol,
        exchange=exchange,
        asset_type=asset_type,
        is_index=is_index,
        is_active=is_active,
    )
    db_session.add(row)
    await db_session.flush()
    return row


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
    created_at: datetime | None = None,
) -> VirtualOrder:
    """Một lệnh ảo.

    ★ ``created_at`` đặt được TƯỜNG MINH: mốc mặc định của SQLite
    (``CURRENT_TIMESTAMP``) chỉ có độ phân giải GIÂY, nên một lệnh đặt cùng giây
    với lúc săn sẽ ngẫu nhiên rơi trước/sau mốc săn. Nhiệm vụ ② đo đúng thứ tự
    "săn TRƯỚC → mua SAU", nên test phải nói rõ mốc chứ không phó cho đồng hồ.
    """
    trading_date = trading_date or date.today()
    gross = price * qty
    net = -gross if side == OrderSide.BUY else gross
    order = VirtualOrder(
        account_id=account_id,
        user_id=user_id,
        symbol=symbol.upper(),
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
    if created_at is not None:
        order.created_at = created_at
    db_session.add(order)
    await db_session.flush()
    await db_session.refresh(order)
    return order


async def _fast_track_cap4(db_session, user_id, *, khau_vi: str = "can_bang"):
    """Đóng dấu các hàng tiến trình Cấp 1-4 + tài khoản ảo mà Cấp 5 cần."""
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


async def _enter_cap5(db_session, user_id, *, source: _FakeHuntSource | None = None):
    """Fast-track Cấp 1-4 rồi vào Cấp 5. Trả ``(cap5, account, source)``."""
    account = await _fast_track_cap4(db_session, user_id)
    source = source or _FakeHuntSource()
    cap5 = Cap5Service(db_session, hunt_source=source)
    await cap5.enter(user_id)
    return cap5, account, source


async def _hunt(cap5, user_id, symbol: str, *, bo_loc: str = "kl") -> dict:
    """Săn một mã vào Watchlist (đúng đường FE bấm "+ Watchlist")."""
    return await cap5.add_watchlist(user_id, symbol, bo_loc)


async def _hunt_n(db_session, cap5, user_id, n: int, *, prefix: str = "H") -> list[str]:
    """Săn ``n`` mã phân biệt (seed luôn bảng ``symbols``)."""
    out = []
    for i in range(n):
        sym = f"{prefix}{i:02d}"
        await _seed_symbol(db_session, sym)
        await _hunt(cap5, user_id, sym)
        out.append(sym)
    return out


def _insight(**layers: str) -> dict:
    """Payload AI Insight v2 tối giản: mỗi lớp một ``statusLabel``."""
    return {key: {"statusLabel": nhan} for key, nhan in layers.items()}


_AI_4_UNG_HO = _insight(
    L1="Rất mạnh", L3="Hỗ trợ mạnh", L4="Hỗ trợ nhẹ", L5="Tích cực"
)
_AI_3_UNG_HO = _insight(L1="Mạnh", L3="Hỗ trợ nhẹ", L4="Hỗ trợ mạnh", L5="Trung tính")
_AI_0_UNG_HO = _insight(
    L1="Rất yếu", L3="Cảnh báo mạnh", L4="Trung tính", L5="Tiêu cực"
)


async def _seed_insight(db_session, symbol: str, payload: dict, *, day: date | None = None):
    row = AIInsightHistory(
        symbol=symbol.upper(),
        session_date=day or date(2026, 8, 19),
        payload=payload,
    )
    db_session.add(row)
    await db_session.flush()
    return row


# ── Helper cho chuỗi Cấp 0→4 thật (chỉ 1 test dùng) ───

_ALL_NEU = {
    "ky_thuat": "neu",
    "dong_tien": "neu",
    "noi_bo": "neu",
    "tin_tuc": "neu",
    "dinh_gia": "neu",
}


def _doc(**overrides: str) -> dict[str, str]:
    return {**_ALL_NEU, **overrides}


_AI_DONG_THUAN_CAO = _doc(ky_thuat="ok", dong_tien="ok", noi_bo="ok")


async def _graduate_cap0(db_session, user_id) -> None:
    cap0 = Cap0Service(db_session)
    await cap0.enter(user_id)
    for n in (1, 2, 3):
        await cap0.complete_task(user_id, n)
    await cap0.complete_task(user_id, 4, gate="debrief")
    await cap0.graduate(user_id)


# ══════════════════════════════════════════════════════
# Cấp 5 CŨ đã nghỉ hưu — canh cho nó không bò trở lại
# ══════════════════════════════════════════════════════


def test_cap5_khong_con_api_4_o_dung_ngoai():
    """Verdict/4 ô/đứng ngoài/Thách thức Lão luyện phải BIẾN MẤT khỏi cả 3 tầng.

    ★ Để một trường chết ở dạng optional là cách repo này đã im lặng trả ``None``
    cho FE nhiều tháng — nên test kiểm sự VẮNG MẶT, không kiểm "vẫn còn nhưng
    không dùng".
    """
    import app.api.v1.endpoints.cap5 as ep
    import app.models.cap5 as models
    import app.schemas.cap5 as schemas
    import app.services.cap5.service as svc

    for name in ("Verdict", "O4", "LyDoDungNgoai", "KetQuaDungNgoai", "StandbyDecision",
                 "KET_QUA_LABELS", "LY_DO_DUNG_NGOAI_LABELS"):
        assert not hasattr(models, name), f"models.cap5 vẫn còn {name}"
    for name in ("VerdictOut", "VerdictSignal", "KetsoRequest", "KetsoCap5Out",
                 "DungNgoaiOut", "DungNgoaiListOut", "DungNgoaiRequest",
                 "ChamDungNgoaiOut", "ThachThucOut", "ThachThucDieuKien"):
        assert not hasattr(schemas, name), f"schemas.cap5 vẫn còn {name}"
    for name in ("han_cham_date", "SO_PHIEN_CHAM", "NGUONG_NE_DUNG_PCT",
                 "NGUONG_NE_HUT_PCT"):
        assert not hasattr(svc, name), f"service vẫn còn {name}"
    for name in ("suggested_verdict", "record_ketso", "log_dung_ngoai",
                 "list_dung_ngoai", "cham_dung_ngoai", "thach_thuc"):
        assert not hasattr(Cap5Service, name), f"Cap5Service vẫn còn {name}"

    paths = {r.path for r in ep.router.routes}
    for gone in ("/cap5/ketso", "/cap5/dung-ngoai", "/cap5/dung-ngoai/cham",
                 "/cap5/thach-thuc", "/cap5/verdict/{order_id}"):
        assert gone not in paths, f"route cũ {gone} vẫn còn"
    for moi in ("/cap5/progress", "/cap5/enter", "/cap5/task", "/cap5/tour-sanma",
                "/cap5/san-ma", "/cap5/san-ma/{bo_loc}", "/cap5/watchlist",
                "/cap5/watchlist/{symbol}", "/cap5/nguon-san/{symbol}",
                "/cap5/phan-tich", "/cap5/graduate"):
        assert moi in paths, f"thiếu route {moi}"


def test_khau_vi_tables_stay_put_for_cap8():
    """★ CASCADE: Cấp 8 import ``KHAU_VI_TRAN_PCT``/``KHAU_VI_LABELS`` từ service
    Cấp 5 và ``tests/test_cap8.py`` khẳng định ĐỊNH DANH đối tượng. Cấp 5 mới
    không dùng hai bảng đó nữa — nhưng xoá chúng là bẻ Cấp 8, nên chúng ở lại."""
    from app.services.cap5.service import KHAU_VI_LABELS, KHAU_VI_TRAN_PCT
    from app.services.cap8.service import (
        KHAU_VI_TRAN_PCT as CAP8_TRAN,
    )

    assert CAP8_TRAN is KHAU_VI_TRAN_PCT
    assert set(KHAU_VI_LABELS) == set(KHAU_VI_TRAN_PCT)


def test_watchlist_cap_matches_the_shared_endpoint():
    """Cùng một bảng vật lý ``watchlist_items`` ⇒ chỉ được có MỘT cái trần.

    Hai trần khác nhau nghĩa là user vượt được trần của trang Theo dõi bằng cách
    thêm mã qua đường Cấp 5.
    """
    from app.api.v1.endpoints.watchlist import _MAX_ITEMS

    assert MAX_WATCHLIST_ITEMS == _MAX_ITEMS


# ══════════════════════════════════════════════════════
# Vào cấp / tiến trình
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_enter_requires_cap4_graduated(db_session, test_user):
    """Chạy CHUỖI Cấp 0→4 THẬT (test duy nhất làm vậy — xem docstring module)."""
    cap5 = Cap5Service(db_session, hunt_source=_FakeHuntSource())

    with pytest.raises(NotFoundError):
        await cap5.enter(test_user.id)

    await _graduate_cap0(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    cap3 = Cap3Service(db_session)
    cap4 = Cap4Service(db_session)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    await cap1.enter(test_user.id)
    ly_dos = ["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]
    for i in range(10):
        buy = await _make_order(
            db_session, account.id, test_user.id, symbol=f"G{i}", trading_date=date(2026, 1, 5)
        )
        await cap1.record_kehoach(
            test_user.id, buy.id, ly_do=ly_dos[i % 5],
            trang_thai_luc_dat="ung_ho", vung_mua=20_000,
        )
    sell = await _make_order(
        db_session, account.id, test_user.id, symbol="G0", side=OrderSide.SELL,
        price=21_000, trading_date=date(2026, 1, 8),
    )
    await cap1.record_ketso(test_user.id, sell.id)
    await cap1.graduate(test_user.id)

    await cap2.enter(test_user.id)
    day0 = date(2026, 2, 1)
    for i in range(10):
        td = day0 + timedelta(days=i)
        buy = await _make_order(
            db_session, account.id, test_user.id, symbol=f"P{i}", trading_date=td
        )
        await cap1.record_kehoach(
            test_user.id, buy.id, ly_do="ky_thuat",
            trang_thai_luc_dat="ung_ho", vung_mua=20_000,
        )
        await cap2.record_kehoach(
            test_user.id, buy.id, phuong_phap_sl_tp="bien_do_dao_dong",
            cat_lo=18_000, chot_loi=25_000,
        )
        s = await _make_order(
            db_session, account.id, test_user.id, symbol=f"P{i}", side=OrderSide.SELL,
            price=25_500 if i == 0 else 20_000, trading_date=td,
        )
        await cap1.record_ketso(test_user.id, s.id)
        await cap2.record_ketso(test_user.id, s.id, cham_sl_cat_dung_phien_ke=(i == 1))
    await cap2.graduate(test_user.id)

    await cap3.enter(test_user.id)
    await cap3.set_khau_vi(test_user.id, "can_bang")
    today = date.today()
    for i in range(15):
        buy = await _make_order(
            db_session, account.id, test_user.id, symbol=f"Z{i}", trading_date=today
        )
        await cap1.record_kehoach(
            test_user.id, buy.id, ly_do="ky_thuat",
            trang_thai_luc_dat="ung_ho", vung_mua=20_000,
        )
        await cap2.record_kehoach(
            test_user.id, buy.id, phuong_phap_sl_tp="bien_do_dao_dong",
            cat_lo=18_000, chot_loi=25_000,
        )
        await cap3.record_kehoach(
            test_user.id, buy.id, khau_vi="can_bang", muc_tu_tin=3,
            cach_khoi_luong="linh_hoat", khoi_luong=100, pct_von=20.0,
        )
        s = await _make_order(
            db_session, account.id, test_user.id, symbol=f"Z{i}", side=OrderSide.SELL,
            price=30_000, trading_date=today,
        )
        await cap1.record_ketso(test_user.id, s.id)
        await cap2.record_ketso(test_user.id, s.id, cham_sl_cat_dung_phien_ke=True)
    await cap3.graduate(test_user.id)

    await cap4.enter(test_user.id)
    with pytest.raises(ConflictError):
        await cap5.enter(test_user.id)

    for i in range(12):
        buy = await _make_order(
            db_session, account.id, test_user.id, symbol=f"AA{i}", trading_date=today
        )
        await cap1.record_kehoach(
            test_user.id, buy.id, ly_do="ky_thuat",
            trang_thai_luc_dat="ung_ho", vung_mua=20_000,
        )
        await cap4.record_kehoach(
            test_user.id, buy.id, doc_5_lop=_doc(ky_thuat="ok"), ai_5_lop=_AI_DONG_THUAN_CAO
        )
        s = await _make_order(
            db_session, account.id, test_user.id, symbol=f"AA{i}", side=OrderSide.SELL,
            price=22_000 if i < 10 else 18_000, trading_date=today,
        )
        await cap1.record_ketso(test_user.id, s.id)
    for i in range(8):
        buy = await _make_order(
            db_session, account.id, test_user.id, symbol=f"BB{i}", trading_date=today
        )
        await cap1.record_kehoach(
            test_user.id, buy.id, ly_do="ky_thuat",
            trang_thai_luc_dat="ung_ho", vung_mua=20_000,
        )
        await cap4.record_kehoach(
            test_user.id, buy.id, doc_5_lop=_doc(tin_tuc="ok"), ai_5_lop=_doc(dinh_gia="ok")
        )
        s = await _make_order(
            db_session, account.id, test_user.id, symbol=f"BB{i}", side=OrderSide.SELL,
            price=22_000 if i < 2 else 18_000, trading_date=today,
        )
        await cap1.record_ketso(test_user.id, s.id)
    await cap4.graduate(test_user.id)

    progress = await cap5.enter(test_user.id)
    assert progress["user_id"] == test_user.id
    assert progress["graduated_at"] is None
    # 0 ở hai ô đếm là 0 THẬT (đếm hàng trong bảng ta sở hữu)…
    assert progress["so_ma_da_san"] == 0
    assert progress["so_ma_mua_tu_watchlist"] == 0
    # …còn hai ô dưới đây là "CHƯA BIẾT", nên phải là None.
    assert progress["so_ma_cho_du_lop"] is None
    assert progress["best_filter"] is None
    assert progress["muc_tieu_so_ma_san"] == MUC_TIEU_SO_MA_SAN == 10
    assert progress["muc_tieu_so_ma_mua"] == MUC_TIEU_SO_MA_MUA == 5
    assert progress["da_xem_tour_sanma"] is False

    progress2 = await cap5.enter(test_user.id)
    assert progress2["id"] == progress["id"]


@pytest.mark.asyncio
async def test_get_progress_none_before_enter(db_session, test_user):
    cap5 = Cap5Service(db_session, hunt_source=_FakeHuntSource())
    assert await cap5.get_progress(test_user.id) is None


# ══════════════════════════════════════════════════════
# 2 nhiệm vụ SONG SONG (§2) + tốt nghiệp (§3)
# ══════════════════════════════════════════════════════


def _sau(phut: int = 5) -> datetime:
    """Mốc ``created_at`` naive-UTC sau thời điểm săn — xem ``_make_order``."""
    return datetime.now(UTC).replace(tzinfo=None) + timedelta(minutes=phut)


async def _mua(db_session, account, user_id, symbol: str, **kwargs):
    return await _make_order(
        db_session, account.id, user_id, symbol=symbol,
        created_at=kwargs.pop("created_at", _sau()), **kwargs,
    )


@pytest.mark.asyncio
async def test_task_1_dong_dau_dung_o_10_ma_san(db_session, test_user):
    """① đo ĐỘ RỘNG: đúng 10 mã phân biệt vào Watchlist mới đóng dấu."""
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)

    await _hunt_n(db_session, cap5, test_user.id, MUC_TIEU_SO_MA_SAN - 1)
    p = await cap5.get_progress(test_user.id)
    assert p["so_ma_da_san"] == 9
    assert p["task_1_done_at"] is None

    await _seed_symbol(db_session, "LAST")
    await _hunt(cap5, test_user.id, "LAST")
    p = await cap5.get_progress(test_user.id)
    assert p["so_ma_da_san"] == 10
    assert p["task_1_done_at"] is not None


@pytest.mark.asyncio
async def test_task_2_xong_duoc_truoc_task_1(db_session, test_user):
    """★ HAI NHIỆM VỤ ĐỘC LẬP: mua đủ 5 mã săn khi mới săn 5 mã ⇒ ② đóng dấu,
    ① vẫn mở. ② KHÔNG bị gác sau ①."""
    cap5, account, _src = await _enter_cap5(db_session, test_user.id)

    syms = await _hunt_n(db_session, cap5, test_user.id, MUC_TIEU_SO_MA_MUA)
    for sym in syms:
        await _mua(db_session, account, test_user.id, sym)

    p = await cap5.get_progress(test_user.id)
    assert p["so_ma_da_san"] == 5
    assert p["so_ma_mua_tu_watchlist"] == 5
    assert p["task_2_done_at"] is not None
    assert p["task_1_done_at"] is None


@pytest.mark.asyncio
async def test_mua_truoc_khi_san_khong_tinh_la_mua_tu_watchlist(db_session, test_user):
    """"Mua từ Watchlist" là một THỨ TỰ: săn trước, mua sau.

    Mua rồi mới đưa mã vào Watchlist thì không phải "chờ mã chín rồi vào lệnh" —
    tính nó vào ② là ghi công một hành vi user chưa làm.
    """
    cap5, account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "EARLY")
    await _mua(
        db_session, account, test_user.id, "EARLY",
        created_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=1),
    )
    await _hunt(cap5, test_user.id, "EARLY")

    p = await cap5.get_progress(test_user.id)
    assert p["so_ma_da_san"] == 1
    assert p["so_ma_mua_tu_watchlist"] == 0


@pytest.mark.asyncio
async def test_san_lai_cung_ma_khong_lam_tang_so_ma_san(db_session, test_user):
    """① đếm MÃ PHÂN BIỆT: săn lại AAA từ bộ lọc khác vẫn là 1 mã.

    ``first_hunted_at`` giữ nguyên (mốc so với lệnh mua), ``hunt_filter`` cập
    nhật sang bộ lọc mới nhất.
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "AAA")
    await _hunt(cap5, test_user.id, "AAA", bo_loc="kl")
    log_1 = (
        await db_session.execute(select(Cap5HuntLog).where(Cap5HuntLog.symbol == "AAA"))
    ).scalar_one()
    first = log_1.first_hunted_at

    await _hunt(cap5, test_user.id, "AAA", bo_loc="dinh")
    await db_session.refresh(log_1)

    p = await cap5.get_progress(test_user.id)
    assert p["so_ma_da_san"] == 1
    assert log_1.first_hunted_at == first
    assert log_1.hunt_filter == "dinh"
    assert log_1.last_hunted_at >= first


@pytest.mark.asyncio
async def test_xoa_khoi_watchlist_khong_lam_tut_nhiem_vu(db_session, test_user):
    """★ Sổ săn mã tồn tại RIÊNG khỏi Watchlist: bỏ theo dõi hết 10 mã thì
    ``so_ma_da_san`` vẫn 10 và ``task_1_done_at`` không bị rút lại.

    Không có sổ riêng, một cú xoá sẽ làm con số hiển thị mâu thuẫn với cái dấu
    tick đã đóng.
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    syms = await _hunt_n(db_session, cap5, test_user.id, 10)
    p = await cap5.get_progress(test_user.id)
    stamp = p["task_1_done_at"]
    assert stamp is not None

    for sym in syms:
        await cap5.remove_watchlist(test_user.id, sym)

    p = await cap5.get_progress(test_user.id)
    assert p["so_ma_da_san"] == 10
    assert p["task_1_done_at"] == stamp
    wl = await cap5.watchlist(test_user.id)
    assert wl["so_luong"] == 0


@pytest.mark.asyncio
async def test_lenh_chua_khop_va_lenh_san_tap_khong_tinh(db_session, test_user):
    """② chỉ đếm lệnh MUA ĐÃ KHỚP ở chế độ Thực chiến (Cấp 5 là cấp Thực chiến).

    Lệnh còn chờ khớp chưa phải một quyết định mua đã xảy ra; lệnh sân tập thì
    không thuộc cấp này.
    """
    cap5, account, _src = await _enter_cap5(db_session, test_user.id)
    for sym in ("PEND", "SANT"):
        await _seed_symbol(db_session, sym)
        await _hunt(cap5, test_user.id, sym)
    await _mua(db_session, account, test_user.id, "PEND", status=OrderStatus.PENDING)
    await _mua(db_session, account, test_user.id, "SANT", mode="san_tap")

    p = await cap5.get_progress(test_user.id)
    assert p["so_ma_da_san"] == 2
    assert p["so_ma_mua_tu_watchlist"] == 0


@pytest.mark.asyncio
async def test_mark_task_chi_tinh_lai_va_chi_nhan_1_hoac_2(db_session, test_user):
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    for bad in (0, 3, 5):
        with pytest.raises(BadRequestError):
            await cap5.mark_task(test_user.id, bad)

    p = await cap5.mark_task(test_user.id, 1)
    assert p["task_1_done_at"] is None  # gọi tay KHÔNG tự đóng dấu
    assert p["so_ma_da_san"] == 0


@pytest.mark.asyncio
async def test_tour_sanma_ghi_co_nhung_khong_phai_cong_tot_nghiep(db_session, test_user):
    """Cờ tour (§7) chỉ để tour tự bật một lần.

    ★ Nếu tour là cổng thì nút "Bỏ qua" của engine tour (gọi thẳng
    ``onComplete``) sẽ tặng không một nhiệm vụ.
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    p = await cap5.mark_tour_sanma(test_user.id)
    assert p["da_xem_tour_sanma"] is True
    assert p["task_1_done_at"] is None
    assert p["task_2_done_at"] is None
    with pytest.raises(ConflictError):
        await cap5.graduate(test_user.id)


@pytest.mark.asyncio
async def test_graduate_can_dung_2_of_2(db_session, test_user):
    cap5, account, _src = await _enter_cap5(db_session, test_user.id)

    with pytest.raises(ConflictError):
        await cap5.graduate(test_user.id)

    syms = await _hunt_n(db_session, cap5, test_user.id, 10)
    p = await cap5.get_progress(test_user.id)
    assert p["task_1_done_at"] is not None
    # ① xong, ② chưa ⇒ vẫn chưa tốt nghiệp.
    with pytest.raises(ConflictError):
        await cap5.graduate(test_user.id)

    for sym in syms[:4]:
        await _mua(db_session, account, test_user.id, sym)
    with pytest.raises(ConflictError):
        await cap5.graduate(test_user.id)

    await _mua(db_session, account, test_user.id, syms[4])
    p = await cap5.graduate(test_user.id)
    assert p["graduated_at"] is not None
    assert p["time_to_graduate_hours"] is not None
    assert p["time_to_graduate_hours"] >= 0

    # idempotent — mốc tốt nghiệp không bị ghi lại
    again = await cap5.graduate(test_user.id)
    assert again["graduated_at"] == p["graduated_at"]


@pytest.mark.asyncio
async def test_progress_va_watchlist_can_da_vao_cap(db_session, test_user):
    """Mọi endpoint ghi/đọc của Cấp 5 đòi đã vào cấp (404 nếu chưa)."""
    await _fast_track_cap4(db_session, test_user.id)
    cap5 = Cap5Service(db_session, hunt_source=_FakeHuntSource())
    await _seed_symbol(db_session, "AAA")
    for coro in (
        cap5.watchlist(test_user.id),
        cap5.add_watchlist(test_user.id, "AAA", "kl"),
        cap5.remove_watchlist(test_user.id, "AAA"),
        cap5.san_ma_index(test_user.id),
        cap5.san_ma_result(test_user.id, "kl"),
        cap5.nguon_san(test_user.id, "AAA"),
        cap5.phan_tich(test_user.id),
        cap5.graduate(test_user.id),
        cap5.mark_tour_sanma(test_user.id),
        cap5.mark_task(test_user.id, 1),
    ):
        with pytest.raises(NotFoundError):
            await coro


# ══════════════════════════════════════════════════════
# ★★ MÀN SĂN MÃ (§5) — LUẬT 1: "chưa biết" ≠ 0
# ══════════════════════════════════════════════════════


def _by_ma(rows: list[dict]) -> dict[str, dict]:
    return {r["ma"]: r for r in rows}


@pytest.mark.asyncio
async def test_san_ma_index_bao_dich_danh_2_bo_loc_dong_tien_thieu_nguon(
    db_session, test_user
):
    """★★ ĐÍCH DANH: ``ngoai`` + ``tudoanh`` CHƯA CÓ NGUỒN ⇒ ``kha_dung=False``
    kèm lý do; 3 bộ lọc nến ngày thì chạy được.

    Backend chỉ lấy được chuỗi mua ròng theo phiên cho TỪNG MÃ MỘT (406 lượt HTTP
    cho một cú bấm) hoặc bảng xếp hạng đã cộng gộp cả kỳ (không tách phiên).
    Không được im lặng trả danh sách rỗng như thể đã lọc xong.
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "AAA")

    index = await cap5.san_ma_index(test_user.id)
    bo_loc = _by_ma(index["bo_loc"])
    assert set(bo_loc) == {"ngoai", "tudoanh", "kl", "dinh", "tang"}

    for ma in ("ngoai", "tudoanh"):
        assert bo_loc[ma]["kha_dung"] is False, ma
        ly_do = bo_loc[ma]["ly_do_chua_kha_dung"]
        assert ly_do and "từng phiên" in ly_do.lower(), ma
        # Câu chốt bắt buộc: chưa lọc được KHÁC không có mã nào thoả.
        assert "không phải là không có mã nào thoả" in ly_do.lower(), ma
    for ma in ("kl", "dinh", "tang"):
        assert bo_loc[ma]["kha_dung"] is True, ma
        assert bo_loc[ma]["ly_do_chua_kha_dung"] is None, ma

    assert index["so_ma_trong_ro"] == 1
    assert index["hien_thi_toi_da"] == 10


@pytest.mark.asyncio
async def test_bo_loc_dong_tien_tra_chua_du_du_lieu_chu_khong_tra_0_ma(
    db_session, test_user
):
    """★★ Đúng cái ô hay bị điền bừa: ``tong_so_ma`` phải là ``None``, KHÔNG PHẢI 0."""
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "AAA")

    for ma in ("ngoai", "tudoanh"):
        result = await cap5.san_ma_result(test_user.id, ma)
        assert result["kha_dung"] is False, ma
        assert result["tong_so_ma"] is None, ma
        assert result["so_ma_xet"] is None, ma
        assert result["so_ma_bo_qua_thieu_du_lieu"] is None, ma
        assert result["items"] == [], ma
        assert result["ly_do_chua_kha_dung"], ma


@pytest.mark.asyncio
async def test_loc_san_khai_that_tieu_chi_canh_bao_chua_ap_dung(db_session, test_user):
    """Lọc sàn §5.2 có 4 tiêu chí; "diện cảnh báo/kiểm soát/hạn chế" THIẾU NGUỒN
    trong backend nên phải tự khai ``ap_dung=False``.

    Im lặng bỏ qua nó rồi để dòng "Đã lọc: …" liệt kê đủ 4 là hứa hão.
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "AAA")
    index = await cap5.san_ma_index(test_user.id)
    loc_san = _by_ma(index["loc_san"])

    assert set(loc_san) == {"san", "thanh_khoan", "gia", "canh_bao"}
    assert loc_san["san"]["ap_dung"] is True
    assert loc_san["thanh_khoan"]["ap_dung"] is True
    assert loc_san["gia"]["ap_dung"] is True
    assert loc_san["canh_bao"]["ap_dung"] is False
    assert "CHƯA lọc được" in loc_san["canh_bao"]["giai_thich"]

    # Cùng bộ tiêu chí phải đi kèm MỖI kết quả (popup nói đúng nó đã lọc gì).
    result = await cap5.san_ma_result(test_user.id, "kl")
    assert _by_ma(result["loc_san"])["canh_bao"]["ap_dung"] is False


@pytest.mark.asyncio
async def test_ro_ma_rong_thi_moi_bo_loc_bao_chua_du_du_lieu(db_session, test_user):
    """Bảng ``symbols`` chưa nạp ⇒ không bộ lọc nào chạy được.

    ★ Đây là bẫy im lặng: rổ rỗng ⇒ vòng lặp không chạy ⇒ ``0 mã thoả``.
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    index = await cap5.san_ma_index(test_user.id)
    assert index["so_ma_trong_ro"] == 0
    for row in index["bo_loc"]:
        assert row["kha_dung"] is False, row["ma"]
        assert row["ly_do_chua_kha_dung"], row["ma"]

    for ma in ("kl", "dinh", "tang"):
        result = await cap5.san_ma_result(test_user.id, ma)
        assert result["kha_dung"] is False, ma
        assert result["tong_so_ma"] is None, ma


@pytest.mark.asyncio
async def test_khong_lay_duoc_nen_nao_la_chua_du_du_lieu_khong_phai_0_ma(
    db_session, test_user
):
    """★★ LỖ LUẬT-1 KHÓ THẤY NHẤT: rổ có 3 mã nhưng nguồn giá không trả nến nào.

    Nếu để rơi xuống nhánh thường, ``so_ma_thoa`` = 0 và popup in "0 mã HOSE thoả
    điều kiện" y như một phiên thị trường buồn — trong khi thật ra CHƯA LỌC ĐƯỢC.
    """
    src = _FakeHuntSource(bars={})
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    for sym in ("AAA", "BBB", "CCC"):
        await _seed_symbol(db_session, sym)

    result = await cap5.san_ma_result(test_user.id, "kl")
    assert result["kha_dung"] is False
    assert result["tong_so_ma"] is None
    assert result["items"] == []
    ly_do = result["ly_do_chua_kha_dung"]
    assert "3 mã HOSE" in ly_do
    assert "không phải là không có mã nào thoả" in ly_do.lower()


@pytest.mark.asyncio
async def test_0_ma_thoa_la_mot_cau_khac_han_chua_du_du_lieu(db_session, test_user):
    """Mặt còn lại của bất biến: nến ĐỦ, chỉ là hôm nay không mã nào thoả.

    Đây mới là lúc được nói "0 mã": ``kha_dung=True`` + ``tong_so_ma=0``.
    """
    src = _FakeHuntSource(bars={"AAA": _bars(), "BBB": _bars()})
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    for sym in ("AAA", "BBB"):
        await _seed_symbol(db_session, sym)

    result = await cap5.san_ma_result(test_user.id, "kl")
    assert result["kha_dung"] is True
    assert result["tong_so_ma"] == 0
    assert result["so_ma_xet"] == 2
    assert result["so_ma_bo_qua_thieu_du_lieu"] == 0
    assert result["items"] == []
    assert result["ly_do_chua_kha_dung"] is None


@pytest.mark.asyncio
async def test_ma_thieu_gtgd_bi_bo_qua_chu_khong_bi_doan(db_session, test_user):
    """Nguồn không trả GTGD phiên ⇒ mã bị BỎ RA và đếm riêng.

    ★ Không được ước lượng thanh khoản bằng ``giá × khối lượng`` (giá khớp đổi
    trong phiên nên tích đó không phải giá trị khớp thật), cũng không được coi
    thiếu dữ liệu là "trượt lọc sàn".
    """
    src = _FakeHuntSource(
        bars={
            "GOOD": _with_last(_bars(), volume=300_000.0),
            "NOGT": _with_last(_bars(gtgd=None), volume=300_000.0),
        }
    )
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    for sym in ("GOOD", "NOGT"):
        await _seed_symbol(db_session, sym)

    result = await cap5.san_ma_result(test_user.id, "kl")
    assert result["kha_dung"] is True
    assert result["so_ma_bo_qua_thieu_du_lieu"] == 1
    assert result["so_ma_xet"] == 1
    assert [i["symbol"] for i in result["items"]] == ["GOOD"]


@pytest.mark.asyncio
async def test_bo_loc_kl_dung_nguong_2_lan_tb20(db_session, test_user):
    """§5.3 📊 ``kl``: KL phiên gần nhất ≥ 2× TB20. Đúng 2,0× là ĐẠT."""
    src = _FakeHuntSource(
        bars={
            "EXACT": _with_last(_bars(), volume=200_000.0),  # 2,0×
            "UNDER": _with_last(_bars(), volume=199_000.0),  # 1,99×
            "BIG": _with_last(_bars(), volume=500_000.0),  # 5,0×
        }
    )
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    for sym in ("EXACT", "UNDER", "BIG"):
        await _seed_symbol(db_session, sym)

    result = await cap5.san_ma_result(test_user.id, "kl")
    assert result["tong_so_ma"] == 2
    # Xếp hạng theo SỐ LẦN vượt TB, giảm dần.
    assert [i["symbol"] for i in result["items"]] == ["BIG", "EXACT"]
    assert result["items"][0]["hang"] == 1
    assert "5,0×" in result["items"][0]["tin_hieu"]


@pytest.mark.asyncio
async def test_bo_loc_dinh_phai_vuot_han_dinh_cu(db_session, test_user):
    """§5.3 🎯 ``dinh``: đóng cửa > đỉnh 20 phiên TRƯỚC. Bằng đỉnh là CHƯA vượt."""
    src = _FakeHuntSource(
        bars={
            "OVER": _with_last(_bars(), close=21_000.0),  # +5%
            "EQUAL": _with_last(_bars(), close=20_000.0),  # bằng đỉnh cũ
            "UNDER": _with_last(_bars(), close=19_000.0),
        }
    )
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    for sym in ("OVER", "EQUAL", "UNDER"):
        await _seed_symbol(db_session, sym)

    result = await cap5.san_ma_result(test_user.id, "dinh")
    assert [i["symbol"] for i in result["items"]] == ["OVER"]
    assert result["tong_so_ma"] == 1
    assert "+5,0%" in result["items"][0]["tin_hieu"]


@pytest.mark.asyncio
async def test_bo_loc_tang_can_ca_hai_ve(db_session, test_user):
    """§5.3 📈 ``tang``: tăng ≥3% VÀ KL ≥1,5× TB20 — thiếu một vế là trượt."""
    src = _FakeHuntSource(
        bars={
            "BOTH": _with_last(_bars(), close=20_600.0, volume=150_000.0),  # +3,0% · 1,5×
            "GIA": _with_last(_bars(), close=20_600.0, volume=140_000.0),  # đủ giá, thiếu KL
            "KL": _with_last(_bars(), close=20_500.0, volume=300_000.0),  # đủ KL, thiếu giá
        }
    )
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    for sym in ("BOTH", "GIA", "KL"):
        await _seed_symbol(db_session, sym)

    result = await cap5.san_ma_result(test_user.id, "tang")
    assert [i["symbol"] for i in result["items"]] == ["BOTH"]
    tin_hieu = result["items"][0]["tin_hieu"]
    assert "+3,0%" in tin_hieu and "1,5×" in tin_hieu


@pytest.mark.asyncio
async def test_loc_san_chan_gia_thap_va_thanh_khoan_mong(db_session, test_user):
    """Lọc sàn §5.2 áp cho MỌI bộ lọc: giá ≥3.000đ · GTGD TB ≥1 tỷ/phiên."""
    src = _FakeHuntSource(
        bars={
            "OK": _with_last(_bars(), volume=300_000.0),
            "PENNY": _with_last(
                _bars(close=float(MIN_GIA_VND - 1)), close=2_999.0, volume=300_000.0
            ),
            "THIN": _with_last(
                _bars(gtgd=MIN_GTGD_TB_VND * 0.5), volume=300_000.0
            ),
        }
    )
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    for sym in ("OK", "PENNY", "THIN"):
        await _seed_symbol(db_session, sym)

    result = await cap5.san_ma_result(test_user.id, "kl")
    assert [i["symbol"] for i in result["items"]] == ["OK"]
    # Bị lọc sàn KHÁC bị bỏ vì thiếu dữ liệu — hai con số phải tách nhau.
    assert result["so_ma_xet"] == 1
    assert result["so_ma_bo_qua_thieu_du_lieu"] == 0


@pytest.mark.asyncio
async def test_chi_lay_ma_hose_dang_hoat_dong(db_session, test_user):
    """Rổ mã = HOSE · đang hoạt động · là cổ phiếu (không chỉ số)."""
    src = _FakeHuntSource(
        bars={
            s: _with_last(_bars(), volume=300_000.0)
            for s in ("HOSE1", "HNX1", "OFF1", "IDX1", "FUND")
        }
    )
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    await _seed_symbol(db_session, "HOSE1")
    await _seed_symbol(db_session, "HNX1", exchange="HNX")
    await _seed_symbol(db_session, "OFF1", is_active=False)
    await _seed_symbol(db_session, "IDX1", is_index=True)
    await _seed_symbol(db_session, "FUND", asset_type="fund")

    index = await cap5.san_ma_index(test_user.id)
    assert index["so_ma_trong_ro"] == 1
    result = await cap5.san_ma_result(test_user.id, "kl")
    assert [i["symbol"] for i in result["items"]] == ["HOSE1"]


@pytest.mark.asyncio
async def test_chi_hien_toi_da_10_ma_nhung_dem_du_tong(db_session, test_user):
    """§5.4: tối đa 10 mã trong popup, còn dòng minh bạch nói TỔNG thật."""
    bars = {
        f"S{i:02d}": _with_last(_bars(), volume=200_000.0 + i * 10_000)
        for i in range(12)
    }
    src = _FakeHuntSource(bars=bars)
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    for sym in bars:
        await _seed_symbol(db_session, sym)

    result = await cap5.san_ma_result(test_user.id, "kl")
    assert result["tong_so_ma"] == 12
    assert len(result["items"]) == 10
    assert result["hien_thi_toi_da"] == 10
    assert [i["hang"] for i in result["items"]] == list(range(1, 11))
    # KL cao nhất đứng đầu
    assert result["items"][0]["symbol"] == "S11"


@pytest.mark.asyncio
async def test_bo_loc_dong_tien_chay_ngay_khi_co_nguon(db_session, test_user):
    """Máy lọc ĐÃ biết chạy 2 bộ lọc dòng tiền — chỉ đang thiếu nguồn bulk.

    Cắm nguồn theo phiên vào là ``ngoai``/``tudoanh`` lọc đúng §5.3: mua ròng
    ≥3/5 phiên VÀ tổng 5 phiên > 0, xếp theo tổng giá trị mua ròng.
    """
    ty = 1_000_000_000.0
    src = _FakeHuntSource(
        bars={s: _bars() for s in ("GOM", "NHIEU", "ITPHIEN", "AMTONG")},
        flows={
            "ngoai": {
                "GOM": [ty, ty, ty, -0.5 * ty, -0.5 * ty],  # 3/5 phiên · +2,0 tỷ
                "NHIEU": [2 * ty, ty, ty, ty, -ty],  # 4/5 phiên · +4,0 tỷ
                "ITPHIEN": [5 * ty, 5 * ty, -ty, -ty, -ty],  # chỉ 2/5 phiên
                "AMTONG": [ty, ty, ty, -9 * ty, 0.0],  # 3/5 phiên nhưng tổng âm
            }
        },
    )
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    for sym in ("GOM", "NHIEU", "ITPHIEN", "AMTONG"):
        await _seed_symbol(db_session, sym)

    index = await cap5.san_ma_index(test_user.id)
    assert _by_ma(index["bo_loc"])["ngoai"]["kha_dung"] is True

    result = await cap5.san_ma_result(test_user.id, "ngoai")
    assert result["kha_dung"] is True
    assert result["tong_so_ma"] == 2
    assert [i["symbol"] for i in result["items"]] == ["NHIEU", "GOM"]
    assert result["items"][1]["tin_hieu"] == "+2,0 tỷ ròng · 3/5 phiên"

    # Tự doanh vẫn thiếu nguồn (fake chỉ cắm 'ngoai') ⇒ vẫn phải nói thật.
    tudoanh = await cap5.san_ma_result(test_user.id, "tudoanh")
    assert tudoanh["kha_dung"] is False
    assert tudoanh["tong_so_ma"] is None


@pytest.mark.asyncio
async def test_bo_loc_la_thi_404(db_session, test_user):
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    with pytest.raises(NotFoundError):
        await cap5.san_ma_result(test_user.id, "bo_loc_khong_ton_tai")


@pytest.mark.asyncio
async def test_nguon_that_tra_none_chu_khong_tra_dict_rong():
    """★★ ĐỘT BIẾN TỪNG THOÁT LƯỚI: ``VciHuntDataSource.net_flow`` phải trả
    ``None``, KHÔNG phải ``{}``.

    Mọi test khác tiêm nguồn giả, nên nếu chỉ có chúng thì một ngày nào đó ai đó
    "dọn dẹp" ``return None`` thành ``return {}`` sẽ đi qua suite xanh mượt — và
    máy lọc hiểu ``{}`` là "đã lọc, không mã nào thoả". Test này canh đúng hàm
    thật (nó trả về ngay, không gọi mạng).
    """
    from app.services.cap5.hunt_data import VciHuntDataSource

    src = VciHuntDataSource(use_cache=False, today=date(2026, 8, 19))
    for ben in ("ngoai", "tudoanh"):
        assert await src.net_flow(["AAA", "BBB"], ben=ben, so_phien=5) is None, ben


@pytest.mark.asyncio
async def test_nguon_tra_dict_rong_van_phai_ra_chua_du_du_lieu(db_session, test_user):
    """Lưới thứ hai dưới ``None``: nguồn trả ``{}`` (hoặc thiếu mọi mã) thì máy
    lọc vẫn phải nói "chưa đủ dữ liệu", không được ra "0 mã thoả"."""
    src = _FakeHuntSource(bars={"AAA": _bars(), "BBB": _bars()}, flows={"ngoai": {}})
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    for sym in ("AAA", "BBB"):
        await _seed_symbol(db_session, sym)

    result = await cap5.san_ma_result(test_user.id, "ngoai")
    assert result["kha_dung"] is False
    assert result["tong_so_ma"] is None
    assert result["items"] == []
