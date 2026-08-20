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
