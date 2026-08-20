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
import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.ai_insight_history import AIInsightHistory
from app.models.cap1 import Cap1Progress, OrderKehoach
from app.models.cap2 import Cap2Progress
from app.models.cap3 import Cap3Progress
from app.models.cap4 import Cap4Progress
from app.models.cap5 import Cap5HuntLog
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


def _phien(n: int = 0) -> date:
    """Ngày phiên cách hôm nay ``n`` ngày lịch.

    ★ Mốc phải TƯƠNG ĐỐI, không được là ngày cố định: điểm đồng thuận chỉ nhận
    bản phân tích trong cửa sổ ``SO_PHIEN_HIEU_LUC`` phiên gần nhất (xem
    ``app.services.cap5.consensus``), nên một ``date(2026, 8, 19)`` cứng sẽ tự
    rơi ra ngoài cửa sổ khi lịch chạy tiếp và làm cả cụm test đỏ vô cớ.
    """
    return date.today() - timedelta(days=n)


async def _seed_insight(db_session, symbol: str, payload: dict, *, day: date | None = None):
    row = AIInsightHistory(
        symbol=symbol.upper(),
        session_date=day or _phien(),
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

    src = VciHuntDataSource(use_cache=False, today=_phien(2))
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


# ══════════════════════════════════════════════════════
# Watchlist + điểm đồng thuận 5 lớp (§6)
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_them_watchlist_ghi_nguon_san_va_tin_hieu_do_server_tinh(
    db_session, test_user
):
    """★ ``hunt_signal`` client gửi lên BỊ BỎ QUA — server tự tính từ dữ liệu thật.

    Tin một chuỗi số do client gửi là mở cửa cho dòng "+45,2 tỷ ròng" không ai
    kiểm được.
    """
    src = _FakeHuntSource(bars={"AAA": _with_last(_bars(), volume=400_000.0)})
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    await _seed_symbol(db_session, "AAA")

    item = await cap5.add_watchlist(
        test_user.id, "aaa", "kl", hunt_signal="+999,9 tỷ ròng · 5/5 phiên"
    )
    assert item["symbol"] == "AAA"
    assert item["hunt_filter"] == "kl"
    assert item["hunt_signal"] == "KL 4,0× TB20 phiên"
    assert "999" not in (item["hunt_signal"] or "")
    assert item["hunt_at"] is not None
    assert item["so_phien_tu_khi_san"] == 0

    log = (
        await db_session.execute(select(Cap5HuntLog).where(Cap5HuntLog.symbol == "AAA"))
    ).scalar_one()
    assert log.hunt_signal == "KL 4,0× TB20 phiên"


@pytest.mark.asyncio
async def test_tin_hieu_de_trong_khi_khong_xac_minh_duoc(db_session, test_user):
    """Mã không (còn) thoả bộ lọc, hoặc bộ lọc thiếu nguồn ⇒ ``hunt_signal=None``.

    Thà để trống còn hơn bịa một dòng số — nhưng mã VẪN được vào Watchlist và
    VẪN tính vào "số mã đã săn" (user đã làm động tác săn thật).
    """
    src = _FakeHuntSource(bars={"FLAT": _bars()})  # KL 1,0× — không thoả 'kl'
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    await _seed_symbol(db_session, "FLAT")
    await _seed_symbol(db_session, "NOSRC")

    item = await cap5.add_watchlist(test_user.id, "FLAT", "kl", hunt_signal="bịa")
    assert item["hunt_signal"] is None
    assert item["hunt_filter"] == "kl"

    # Bộ lọc dòng tiền thiếu nguồn: vẫn thêm được, tín hiệu để trống.
    item2 = await cap5.add_watchlist(test_user.id, "NOSRC", "ngoai")
    assert item2["hunt_signal"] is None
    assert item2["hunt_filter"] == "ngoai"

    p = await cap5.get_progress(test_user.id)
    assert p["so_ma_da_san"] == 2


@pytest.mark.asyncio
async def test_them_watchlist_kiem_ma_va_bo_loc(db_session, test_user):
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "OK1")
    await _seed_symbol(db_session, "IDX", is_index=True)
    await _seed_symbol(db_session, "DEAD", is_active=False)

    for symbol in ("", "   ", "KHONGCO", "IDX", "DEAD"):
        with pytest.raises(BadRequestError):
            await cap5.add_watchlist(test_user.id, symbol, "kl")
    for bo_loc in ("", "khong_co_bo_loc_nay", "KL"):
        with pytest.raises(BadRequestError):
            await cap5.add_watchlist(test_user.id, "OK1", bo_loc)


@pytest.mark.asyncio
async def test_san_ma_da_theo_doi_tay_thi_cap_nhat_nguon_san(db_session, test_user):
    """Mã đã nằm trong Watchlist (thêm tay từ Cấp 0) được CẬP NHẬT nguồn săn.

    409 ở đây sẽ chặn user săn chính mã họ đang theo dõi — mà đó vẫn là săn.
    """
    src = _FakeHuntSource(bars={"OLD": _with_last(_bars(), close=21_000.0)})
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    await _seed_symbol(db_session, "OLD")
    db_session.add(WatchlistItem(user_id=test_user.id, symbol="OLD", sort_order=0))
    await db_session.flush()

    item = await cap5.add_watchlist(test_user.id, "OLD", "dinh")
    assert item["hunt_filter"] == "dinh"
    assert item["hunt_signal"] == "Vượt đỉnh 20 phiên +5,0%"

    wl = await cap5.watchlist(test_user.id)
    assert wl["so_luong"] == 1  # KHÔNG tạo hàng thứ hai


@pytest.mark.asyncio
async def test_watchlist_ton_trong_tran_50_ma(db_session, test_user):
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    for i in range(MAX_WATCHLIST_ITEMS):
        sym = f"F{i:03d}"
        await _seed_symbol(db_session, sym)
        db_session.add(WatchlistItem(user_id=test_user.id, symbol=sym, sort_order=i))
    await db_session.flush()
    await _seed_symbol(db_session, "OVER")

    with pytest.raises(BadRequestError):
        await cap5.add_watchlist(test_user.id, "OVER", "kl")

    # Nhưng mã ĐÃ có trong danh sách vẫn săn lại được (không tạo hàng mới).
    item = await cap5.add_watchlist(test_user.id, "F000", "kl")
    assert item["symbol"] == "F000"


@pytest.mark.asyncio
async def test_bo_theo_doi_ma_khong_co_thi_404(db_session, test_user):
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    with pytest.raises(NotFoundError):
        await cap5.remove_watchlist(test_user.id, "NOPE")


@pytest.mark.asyncio
async def test_chua_co_ban_insight_thi_khong_cham_diem_0_tren_5(db_session, test_user):
    """★★ Mã chưa từng có bản phân tích 5 lớp ⇒ mọi ô điểm đồng thuận để NULL.

    Ghi 0 ở đây là nói "không lớp nào ủng hộ" — một kết luận chưa ai tính.
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "NEW")
    await _hunt(cap5, test_user.id, "NEW")

    wl = await cap5.watchlist(test_user.id)
    item = wl["items"][0]
    assert item["consensus_today"] is None
    assert item["consensus_prev"] is None
    assert item["consensus_da_cham"] is None
    assert item["consensus_at"] is None
    assert item["status"] is None
    assert item["nhac"] is None
    assert wl["so_dang_chu_y"] == 0

    row = (
        await db_session.execute(
            select(WatchlistItem).where(WatchlistItem.symbol == "NEW")
        )
    ).scalar_one()
    assert row.consensus_today is None
    assert row.status is None


@pytest.mark.asyncio
async def test_dang_chu_y_khi_da_xac_nhan_4_lop_ung_ho(db_session, test_user):
    """§6.1: ≥4/5 lớp ủng hộ ⇒ "★ Đáng chú ý" + câu nhắc "Quyết định mua vẫn là
    của bạn"."""
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "HOT")
    await _seed_insight(db_session, "HOT", _AI_4_UNG_HO)
    await _hunt(cap5, test_user.id, "HOT")

    wl = await cap5.watchlist(test_user.id)
    item = wl["items"][0]
    assert item["consensus_today"] == 4
    assert item["consensus_da_cham"] == 4
    assert item["status"] == "notable"
    assert item["nhac"] and "Quyết định mua vẫn là của bạn" in item["nhac"]
    assert wl["so_dang_chu_y"] == 1
    assert item["tong_so_lop"] == 5
    assert item["nguong_dang_chu_y"] == 4


@pytest.mark.asyncio
async def test_dang_quan_sat_chi_khi_chac_chan_khong_the_toi_4(db_session, test_user):
    """"Đang quan sát" là một KẾT LUẬN ("<4 lớp ủng hộ"), không phải chỗ chứa
    dữ liệu thiếu.

    Lớp 💎 Định giá không có nguồn ⇒ luôn còn 1 lớp chưa biết. Chỉ khi
    ``điểm + số lớp chưa biết < 4`` thì mới chắc chắn không tới được 4.
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "COLD")
    await _seed_insight(db_session, "COLD", _AI_0_UNG_HO)
    await _hunt(cap5, test_user.id, "COLD")

    item = (await cap5.watchlist(test_user.id))["items"][0]
    assert item["consensus_today"] == 0
    assert item["consensus_da_cham"] == 4
    assert item["status"] == "watching"


@pytest.mark.asyncio
async def test_vung_giua_de_trang_thai_none_chu_khong_doan(db_session, test_user):
    """3 lớp ủng hộ + 1 lớp CHƯA BIẾT ⇒ vẫn có thể chạm 4 ⇒ chưa kết luận.

    Gọi nó là "Đang quan sát" là khẳng định mã đã bị chấm và không đủ 4 lớp.
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "MID")
    await _seed_insight(db_session, "MID", _AI_3_UNG_HO)
    await _hunt(cap5, test_user.id, "MID")

    item = (await cap5.watchlist(test_user.id))["items"][0]
    assert item["consensus_today"] == 3
    assert item["consensus_da_cham"] == 4
    assert item["status"] is None
    assert item["nhac"] is None


@pytest.mark.asyncio
async def test_lop_dinh_gia_luon_la_chua_biet(db_session, test_user):
    """★★ AI Insight v2 KHÔNG có lớp Định giá (L2 là Thanh khoản).

    Nên mọi mã chỉ chấm được tối đa 4/5 lớp, và ``consensus_da_cham`` phải đi
    kèm để người đọc biết mẫu số thật. Ánh xạ L2 → định giá sẽ là bịa.
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "VAL")
    await _seed_insight(
        db_session, "VAL", {**_AI_4_UNG_HO, "L2": {"statusLabel": "Rất mạnh"}}
    )
    await _hunt(cap5, test_user.id, "VAL")

    item = (await cap5.watchlist(test_user.id))["items"][0]
    assert item["consensus_today"] == 4  # KHÔNG phải 5
    assert item["consensus_da_cham"] == 4
    lop = item["lop"]
    assert lop["dinh_gia"] is None
    assert lop["ky_thuat"] == "ok"
    chi_tiet = {r["lop"]: r for r in item["lop_chi_tiet"]}
    assert chi_tiet["dinh_gia"]["ung_ho"] is None
    assert "Chưa có nguồn chấm lớp Định giá" in chi_tiet["dinh_gia"]["giai_thich"]


@pytest.mark.asyncio
async def test_lop_trung_tinh_khong_bi_ve_thanh_nguoc_chieu(db_session, test_user):
    """Cụm 5 icon: "Trung tính" là ⚪, "Cảnh báo" mới là ⚠.

    Quy mọi lớp "không ủng hộ" về ⚠ là biến một lớp không ý kiến thành một lớp
    phản đối.
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "MIX")
    await _seed_insight(
        db_session,
        "MIX",
        _insight(L1="Mạnh", L3="Trung tính", L4="Cảnh báo mạnh", L5="Trung tính"),
    )
    await _hunt(cap5, test_user.id, "MIX")

    lop = (await cap5.watchlist(test_user.id))["items"][0]["lop"]
    assert lop["ky_thuat"] == "ok"
    assert lop["dong_tien"] == "neu"
    assert lop["noi_bo"] == "bad"
    assert lop["tin_tuc"] == "neu"
    assert lop["dinh_gia"] is None


@pytest.mark.asyncio
async def test_me_cham_chay_toi_da_1_lan_moi_ngay(db_session, test_user):
    """§6.1/§10: chấm 5 lớp là mẻ 1 lần/ngày, KHÔNG tức thời.

    Bản Insight mới xuất hiện trong cùng ngày cũng không làm điểm nhảy — nếu
    không, chi phí và hành vi "hối thúc mua theo thời gian thực" cùng quay lại.
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "DAY")
    await _seed_insight(db_session, "DAY", _AI_3_UNG_HO, day=_phien(3))
    await _hunt(cap5, test_user.id, "DAY")

    first = (await cap5.watchlist(test_user.id))["items"][0]
    assert first["consensus_today"] == 3
    cham_at = first["consensus_at"]

    # Bản mới hơn, cùng NGÀY đọc ⇒ không chấm lại.
    await _seed_insight(db_session, "DAY", _AI_4_UNG_HO, day=_phien(2))
    again = (await cap5.watchlist(test_user.id))["items"][0]
    assert again["consensus_today"] == 3
    assert again["consensus_at"] == cham_at
    assert again["lop"] is None  # không chấm lại ⇒ không nạp chi tiết


@pytest.mark.asyncio
async def test_consensus_prev_luu_lan_cham_truoc(db_session, test_user):
    """§6.2 "dòng thay đổi" cần điểm của lần chấm TRƯỚC.

    ``consensus_prev`` chỉ có sau lần chấm thứ hai — lần đầu phải là ``None`` để
    FE không vẽ mũi tên "cải thiện" từ hư không.
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "TREND")
    await _seed_insight(db_session, "TREND", _AI_3_UNG_HO, day=_phien(3))
    await _hunt(cap5, test_user.id, "TREND")

    item = (await cap5.watchlist(test_user.id))["items"][0]
    assert item["consensus_today"] == 3
    assert item["consensus_prev"] is None

    # Lùi mốc chấm về hôm qua rồi thêm bản Insight tốt hơn ⇒ mẻ hôm nay chạy.
    row = (
        await db_session.execute(
            select(WatchlistItem).where(WatchlistItem.symbol == "TREND")
        )
    ).scalar_one()
    row.consensus_at = datetime.now(UTC) - timedelta(days=1)
    await db_session.flush()
    await _seed_insight(db_session, "TREND", _AI_4_UNG_HO, day=_phien(2))

    item = (await cap5.watchlist(test_user.id))["items"][0]
    assert item["consensus_today"] == 4
    assert item["consensus_prev"] == 3
    assert item["status"] == "notable"


@pytest.mark.asyncio
async def test_ban_phan_tich_qua_cu_khong_duoc_dung_de_cham(db_session, test_user):
    """★★ C3: bản AI Insight ngoài cửa sổ phiên KHÔNG được dùng để chấm 5 lớp.

    ``ai_insight_history`` chỉ được ghi khi có người bấm "AI Phân tích" (không
    cron), nên một mã có thể chỉ có bản phân tích 5,5 tháng tuổi. Chấm 4/5 lớp
    từ nó rồi hiện "★ Đáng chú ý · Đặt lệnh →" là gán tình trạng của tháng Ba
    cho phiên hôm nay — và chính ``consensus.py`` tự khai là "phiên gần nhất".
    """
    from app.services.cap5.consensus import SO_PHIEN_HIEU_LUC

    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "OLD")
    qua_cu = _phien(170)
    await _seed_insight(db_session, "OLD", _AI_4_UNG_HO, day=qua_cu)
    await _hunt(cap5, test_user.id, "OLD")

    item = (await cap5.watchlist(test_user.id))["items"][0]
    assert item["consensus_today"] is None
    assert item["consensus_da_cham"] is None
    assert item["status"] is None
    assert item["nhac"] is None
    assert item["consensus_session_date"] is None
    # Nói RÕ vì sao chưa chấm: có bản phân tích, nhưng nó quá cũ.
    assert item["consensus_session_date_qua_han"] == qua_cu
    chi_tiet = {r["lop"]: r for r in item["lop_chi_tiet"]}
    ly_do = chi_tiet["ky_thuat"]["giai_thich"]
    assert str(SO_PHIEN_HIEU_LUC) in ly_do
    assert qua_cu.strftime("%d/%m/%Y") in ly_do

    # Và hàng DB cũng không được ghi điểm nào.
    row = (
        await db_session.execute(
            select(WatchlistItem).where(WatchlistItem.symbol == "OLD")
        )
    ).scalar_one()
    assert (row.consensus_today, row.consensus_da_cham, row.status) == (None, None, None)


@pytest.mark.asyncio
async def test_phien_cua_ban_phan_tich_len_wire(db_session, test_user):
    """★ C3: ``session_date`` được tính rồi BỊ BỎ trên wire ⇒ không ký tự nào cho
    biết điểm đồng thuận dựng từ dữ liệu phiên nào."""
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "FRESH")
    hom_qua = _phien(1)
    await _seed_insight(db_session, "FRESH", _AI_4_UNG_HO, day=hom_qua)
    await _hunt(cap5, test_user.id, "FRESH")

    wl = await cap5.watchlist(test_user.id)
    item = wl["items"][0]
    assert item["consensus_today"] == 4
    assert item["consensus_session_date"] == hom_qua
    assert item["consensus_session_date_qua_han"] is None
    assert item["consensus_het_han"] is False
    # FE cần biết cửa sổ hiệu lực để nói đúng câu "trong N phiên gần nhất".
    from app.services.cap5.consensus import SO_PHIEN_HIEU_LUC

    assert wl["so_phien_hieu_luc"] == SO_PHIEN_HIEU_LUC


@pytest.mark.asyncio
async def test_diem_da_luu_het_hieu_luc_thi_noi_ra_chu_khong_hoi_thuc(
    db_session, test_user
):
    """★★ C3 (mặt còn lại): điểm ĐÃ LƯU không được tự già đi trong im lặng.

    Mã được chấm 4/5 hôm nay, rồi nhiều tháng không ai chạy lại AI Phân tích:
    con số 4/5 vẫn nằm trong DB. Thẻ không được tiếp tục nói "4/5 lớp ĐANG ủng
    hộ" — câu nhắc phải chuyển sang "đây là số cũ".
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "AGED")
    row_insight = await _seed_insight(db_session, "AGED", _AI_4_UNG_HO)
    await _hunt(cap5, test_user.id, "AGED")

    item = (await cap5.watchlist(test_user.id))["items"][0]
    assert (item["consensus_today"], item["status"]) == (4, "notable")
    assert item["consensus_het_han"] is False
    assert "Quyết định mua vẫn là của bạn" in item["nhac"]

    # Thời gian trôi: bản phân tích duy nhất rơi ra ngoài cửa sổ hiệu lực.
    row_insight.session_date = _phien(170)
    await db_session.flush()

    item = (await cap5.watchlist(test_user.id))["items"][0]
    assert item["consensus_today"] == 4  # số đã lưu KHÔNG bị xoá
    assert item["consensus_het_han"] is True
    assert item["consensus_session_date"] is None
    assert "cũ" in item["nhac"]
    assert "Quyết định mua vẫn là của bạn" not in item["nhac"]


@pytest.mark.asyncio
async def test_cum_5_icon_hien_o_moi_lan_doc_khong_chi_lan_dau(db_session, test_user):
    """§6.2 đòi cụm 5 icon trên MỌI thẻ mã — không phải chỉ ở lần đọc đầu.

    Mẻ chấm ghi 1 lần/ngày, nhưng đọc lại payload Insight đã lưu thì không tốn
    gì; nếu cụm icon chỉ hiện ngay sau lúc ghi thì gần như không bao giờ user
    thấy nó.
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "ICON")
    await _seed_insight(db_session, "ICON", _AI_4_UNG_HO)
    await _hunt(cap5, test_user.id, "ICON")

    for lan in range(3):
        item = (await cap5.watchlist(test_user.id))["items"][0]
        assert item["lop"] is not None, f"lần đọc {lan + 1} mất cụm icon"
        assert item["lop"]["ky_thuat"] == "ok"
        assert item["consensus_today"] == 4


# ══════════════════════════════════════════════════════
# Phân tích danh mục — khối ⑫ + ⑬ (§9) · nguồn săn (§8)
# ══════════════════════════════════════════════════════


async def _lenh_da_dong(
    db_session,
    cap5,
    cap1,
    account,
    user_id,
    *,
    symbol: str,
    bo_loc: str | None = "kl",
    win: bool = True,
    phut: int = 5,
):
    """Một lượt đã đóng ĐÚNG đường Cấp 1: (săn →) mua → kế hoạch → bán → kết sổ.

    ``bo_loc=None`` = mã user tự nhập (KHÔNG săn) — khối ⑫ phải đếm riêng.
    """
    await _seed_symbol(db_session, symbol)
    if bo_loc is not None:
        await _hunt(cap5, user_id, symbol, bo_loc=bo_loc)
    buy = await _make_order(
        db_session, account.id, user_id, symbol=symbol, price=20_000,
        created_at=_sau(phut),
    )
    await cap1.record_kehoach(
        user_id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000
    )
    sell = await _make_order(
        db_session, account.id, user_id, symbol=symbol, side=OrderSide.SELL,
        price=22_000 if win else 18_000, created_at=_sau(phut + 5),
    )
    await cap1.record_ketso(user_id, sell.id)
    return sell


@pytest.mark.asyncio
async def test_khoi_12_an_ty_le_thang_khi_chua_du_3_lenh(db_session, test_user):
    """★ §9: cần ≥3 lệnh/bộ lọc mới xếp hạng. Dưới ngưỡng ⇒ ``ty_le_thang=None``.

    0% ở đây sẽ đọc như "bộ lọc này toàn thua", trong khi thật ra chưa đủ mẫu.
    """
    cap5, account, _src = await _enter_cap5(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    for i in range(2):
        await _lenh_da_dong(
            db_session, cap5, cap1, account, test_user.id,
            symbol=f"K{i}", bo_loc="kl", win=True, phut=5 + i * 20,
        )

    out = await cap5.phan_tich(test_user.id)
    kl = _by_ma(out["khoi_12"]["items"])["kl"]
    assert kl["so_lenh"] == 2
    assert kl["so_lenh_thang"] == 2
    assert kl["ty_le_thang"] is None
    assert kl["du_mau"] is False
    assert f"2/{MIN_LENH_KHOI_12}" in kl["giai_thich"]
    assert out["khoi_12"]["best_filter"] is None
    assert out["khoi_12"]["du_de_ket_luan"] is False

    p = await cap5.get_progress(test_user.id)
    assert p["best_filter"] is None
    assert p["best_filter_ten"] is None


@pytest.mark.asyncio
async def test_khoi_12_xep_hang_va_chon_bo_loc_hop_nhat(db_session, test_user):
    """§9: thanh ngang sắp giảm dần; cao nhất "hợp với bạn nhất", thấp nhất có
    cảnh báo. Đo bằng KẾT QUẢ THẬT (lãi/lỗ của lệnh đã đóng)."""
    cap5, account, _src = await _enter_cap5(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    phut = 5
    for i in range(3):  # kl: 3/3 thắng
        await _lenh_da_dong(
            db_session, cap5, cap1, account, test_user.id,
            symbol=f"W{i}", bo_loc="kl", win=True, phut=phut,
        )
        phut += 20
    for i in range(3):  # dinh: 1/3 thắng
        await _lenh_da_dong(
            db_session, cap5, cap1, account, test_user.id,
            symbol=f"L{i}", bo_loc="dinh", win=(i == 0), phut=phut,
        )
        phut += 20

    out = await cap5.phan_tich(test_user.id)
    items = out["khoi_12"]["items"]
    rows = _by_ma(items)
    assert rows["kl"]["ty_le_thang"] == 100.0
    assert rows["kl"]["nhan"] == "hợp với bạn nhất"
    assert rows["kl"]["canh_bao"] is None
    assert rows["dinh"]["ty_le_thang"] == 33.3
    assert rows["dinh"]["nhan"] is None
    assert rows["dinh"]["canh_bao"]
    # Sắp giảm dần, bộ lọc chưa đủ mẫu xuống cuối (không đọc như hạng bét).
    assert [i["ma"] for i in items[:2]] == ["kl", "dinh"]
    assert all(not i["du_mau"] for i in items[2:])
    assert out["khoi_12"]["best_filter"] == "kl"

    p = await cap5.get_progress(test_user.id)
    assert p["best_filter"] == "kl"
    assert p["best_filter_ten"] == "Khối lượng đột biến"


@pytest.mark.asyncio
async def test_khoi_12_khong_gan_lenh_tu_nhap_vao_bo_loc_nao(db_session, test_user):
    """Mã user tự nhập KHÔNG được gán vào bộ lọc nào — đếm riêng.

    Gán bừa là bịa nguồn săn, đúng thứ dòng nguồn săn ở Kết sổ §8 cấm.
    """
    cap5, account, _src = await _enter_cap5(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    await _lenh_da_dong(
        db_session, cap5, cap1, account, test_user.id,
        symbol="TAY1", bo_loc=None, win=True, phut=5,
    )
    await _lenh_da_dong(
        db_session, cap5, cap1, account, test_user.id,
        symbol="TAY2", bo_loc=None, win=False, phut=30,
    )

    out = await cap5.phan_tich(test_user.id)
    assert out["khoi_12"]["so_lenh_khong_tu_san"] == 2
    for row in out["khoi_12"]["items"]:
        assert row["so_lenh"] == 0, row["ma"]
        assert row["ty_le_thang"] is None, row["ma"]
    assert out["khoi_12"]["best_filter"] is None


@pytest.mark.asyncio
async def test_lenh_cu_giu_from_watchlist_null_lenh_moi_duoc_kiem(db_session, test_user):
    """★ ``order_kehoach.from_watchlist`` có BA trạng thái.

    True = đến từ săn · False = đã kiểm và không phải · NULL = lệnh Cấp 1-4 cũ
    chưa ai kiểm. Để NOT NULL DEFAULT false thì mọi lệnh lịch sử tự nhiên khẳng
    định "không đến từ săn mã" — một câu bịa về hàng triệu dòng.
    """
    cap5, account, _src = await _enter_cap5(db_session, test_user.id)
    cap1 = Cap1Service(db_session)

    # Lệnh đặt TRƯỚC khi vào Cấp 5.
    await _seed_symbol(db_session, "CU")
    cu = await _make_order(
        db_session, account.id, test_user.id, symbol="CU",
        created_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=3),
    )
    await cap1.record_kehoach(
        test_user.id, cu.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000
    )
    # Lệnh Cấp-5-era: một mã đã săn, một mã tự nhập.
    await _seed_symbol(db_session, "SAN")
    await _hunt(cap5, test_user.id, "SAN")
    san = await _make_order(
        db_session, account.id, test_user.id, symbol="SAN", created_at=_sau(10)
    )
    await cap1.record_kehoach(
        test_user.id, san.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000
    )
    await _seed_symbol(db_session, "TAY")
    tay = await _make_order(
        db_session, account.id, test_user.id, symbol="TAY", created_at=_sau(11)
    )
    await cap1.record_kehoach(
        test_user.id, tay.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000
    )

    await cap5.get_progress(test_user.id)
    rows = {
        r.order_id: r
        for r in (
            await db_session.execute(
                select(OrderKehoach).where(
                    OrderKehoach.order_id.in_([cu.id, san.id, tay.id])
                )
            )
        ).scalars().all()
    }
    assert rows[cu.id].from_watchlist is None
    assert rows[cu.id].hunt_filter is None
    assert rows[san.id].from_watchlist is True
    assert rows[san.id].hunt_filter == "kl"
    assert rows[tay.id].from_watchlist is False
    assert rows[tay.id].hunt_filter is None


@pytest.mark.asyncio
async def test_khoi_13_noi_that_khi_tang_giua_chua_do_duoc(db_session, test_user):
    """★★ Phễu ⑬: tầng giữa CHƯA ĐO ĐƯỢC phải là ``None`` + câu nói rõ.

    Vẽ tầng giữa = 0 là khẳng định "không mã nào chín" — trong khi mẻ chấm 5 lớp
    chưa có kết quả cho mã nào (rất nhiều mã sẽ không bao giờ đủ 5 lớp).
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _hunt_n(db_session, cap5, test_user.id, 3)

    out = await cap5.phan_tich(test_user.id)
    khoi_13 = out["khoi_13"]
    assert khoi_13["so_ma_da_san"] == 3
    assert khoi_13["so_ma_cho_du_lop"] is None
    assert khoi_13["so_ma_vao_lenh"] == 0
    assert "chưa đo được" in khoi_13["loi_ket"]


@pytest.mark.asyncio
async def test_khoi_13_dem_dung_ba_tang_khi_da_cham_duoc(db_session, test_user):
    """3 tầng phễu: săn → chờ đến ≥4/5 lớp → thực sự vào lệnh."""
    cap5, account, _src = await _enter_cap5(db_session, test_user.id)
    for sym in ("CHIN1", "CHIN2", "XANH"):
        await _seed_symbol(db_session, sym)
    await _seed_insight(db_session, "CHIN1", _AI_4_UNG_HO)
    await _seed_insight(db_session, "CHIN2", _AI_4_UNG_HO)
    await _seed_insight(db_session, "XANH", _AI_0_UNG_HO)
    for sym in ("CHIN1", "CHIN2", "XANH"):
        await _hunt(cap5, test_user.id, sym)
    await _mua(db_session, account, test_user.id, "CHIN1")

    out = await cap5.phan_tich(test_user.id)
    khoi_13 = out["khoi_13"]
    assert khoi_13["so_ma_da_san"] == 3
    assert khoi_13["so_ma_cho_du_lop"] == 2
    assert khoi_13["so_ma_vao_lenh"] == 1
    assert "kỷ luật" in khoi_13["loi_ket"]
    # Chấm ĐỦ cả 3 mã săn ⇒ con số tầng giữa là con số đủ, không phải cận dưới.
    assert khoi_13["so_ma_da_cham_diem"] == 3
    assert khoi_13["so_ma_cho_du_lop_day_du"] is True

    p = await cap5.get_progress(test_user.id)
    assert p["so_ma_cho_du_lop"] == 2
    assert p["so_ma_da_cham_diem"] == 3
    assert p["so_ma_cho_du_lop_day_du"] is True


@pytest.mark.asyncio
async def test_khoi_13_tang_giua_mang_mau_so_khi_chua_cham_het(db_session, test_user):
    """★★ C1: chấm được 1/10 mã ⇒ TUYỆT ĐỐI không khai một con số như đã chấm hết.

    Reviewer chạy thẳng ``_so_ma_cho_du_lop``: 1 mã chấm được (0 lớp ủng hộ), 9
    mã chưa từng chấm ⇒ hàm cũ trả ``0``. Vì là ``0`` chứ không phải ``None``,
    FE không vào nhánh "chưa đo được" và câu "0 mã của bạn từng chín" trở thành
    một kết luận chưa ai tính. Mẫu số ("đã chấm / đã săn") PHẢI có trên wire.
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    syms = await _hunt_n(db_session, cap5, test_user.id, 10)
    # Đúng MỘT mã có bản phân tích, và nó KHÔNG chín (0 lớp ủng hộ).
    await _seed_insight(db_session, syms[0], _AI_0_UNG_HO)
    await cap5.get_progress(test_user.id)

    out = await cap5.phan_tich(test_user.id)
    khoi_13 = out["khoi_13"]
    assert khoi_13["so_ma_da_san"] == 10
    assert khoi_13["so_ma_da_cham_diem"] == 1
    assert khoi_13["so_ma_cho_du_lop"] == 0
    assert khoi_13["so_ma_cho_du_lop_day_du"] is False
    # Câu chốt phải nói rõ mẫu số + rằng đây là cận dưới.
    loi_ket = khoi_13["loi_ket"]
    assert "1/10" in loi_ket
    assert "cận dưới" in loi_ket.lower()

    p = await cap5.get_progress(test_user.id)
    assert (p["so_ma_da_cham_diem"], p["so_ma_cho_du_lop_day_du"]) == (1, False)


@pytest.mark.asyncio
async def test_khoi_13_phieu_nguoc_ma_da_xoa_khoi_watchlist_van_la_can_duoi(
    db_session, test_user
):
    """★★ C1 (phễu ngược): mã đã chín → mua → XOÁ khỏi Watchlist.

    Tầng giữa đọc ``watchlist_items`` còn sống nên nó tụt về 0 trong khi tầng
    đáy vẫn 1 ⇒ phễu "🔍 3 · 👀 0 · ✅ 1". Con số 0 đó là CẬN DƯỚI, và wire phải
    nói ra được điều đó (3 mã săn, chỉ 1 mã còn chấm được).
    """
    cap5, account, _src = await _enter_cap5(db_session, test_user.id)
    for sym in ("CHIN", "XANH", "TRONG"):
        await _seed_symbol(db_session, sym)
    await _seed_insight(db_session, "CHIN", _AI_4_UNG_HO)
    await _seed_insight(db_session, "XANH", _AI_0_UNG_HO)
    for sym in ("CHIN", "XANH", "TRONG"):
        await _hunt(cap5, test_user.id, sym)
    await _mua(db_session, account, test_user.id, "CHIN")
    await cap5.remove_watchlist(test_user.id, "CHIN")

    khoi_13 = (await cap5.phan_tich(test_user.id))["khoi_13"]
    assert khoi_13["so_ma_da_san"] == 3
    assert khoi_13["so_ma_vao_lenh"] == 1
    # Mã đã chín nhưng đã bị xoá khỏi Watchlist ⇒ không đếm được nữa.
    assert khoi_13["so_ma_cho_du_lop"] == 0
    assert khoi_13["so_ma_da_cham_diem"] == 1
    assert khoi_13["so_ma_cho_du_lop_day_du"] is False
    assert "1/3" in khoi_13["loi_ket"]
    assert "cận dưới" in khoi_13["loi_ket"].lower()


@pytest.mark.asyncio
async def test_nguon_san_dung_cho_dong_ket_so(db_session, test_user):
    """§8 dòng nguồn săn: "săn từ bộ lọc [X] · đưa vào Watchlist N phiên trước".

    ★ ``so_lop_luc_vao`` LUÔN ``None`` kèm lý do: điểm đồng thuận tại thời điểm
    đặt lệnh chưa từng được lưu, nên không được lấy điểm HÔM NAY gán cho một
    quyết định trong quá khứ.
    """
    src = _FakeHuntSource(bars={"SAN": _with_last(_bars(), volume=300_000.0)})
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    await _seed_symbol(db_session, "SAN")
    await _hunt(cap5, test_user.id, "SAN", bo_loc="kl")

    out = await cap5.nguon_san(test_user.id, "san")
    assert out["symbol"] == "SAN"
    assert out["tu_san_ma"] is True
    assert out["hunt_filter"] == "kl"
    assert out["hunt_filter_ten"] == "Khối lượng đột biến"
    assert out["hunt_signal"] == "KL 3,0× TB20 phiên"
    assert out["so_phien_trong_watchlist"] == 0
    assert out["so_lop_luc_vao"] is None
    assert out["ly_do_thieu_so_lop"]
    assert "Khối lượng đột biến" in out["giai_thich"]


@pytest.mark.asyncio
async def test_nguon_san_theo_order_id_dem_phien_toi_luc_dat_lenh(db_session, test_user):
    """★★ I5: có ``order_id`` ⇒ đếm số phiên chờ TỚI LÚC ĐẶT LỆNH.

    Đếm tới HÔM NAY là nói về một quãng thời gian sau khi quyết định đã xảy ra —
    và với lệnh đóng từ tháng trước thì con số đó vô nghĩa.
    """
    src = _FakeHuntSource(bars={"SAN": _with_last(_bars(), volume=300_000.0)})
    cap5, account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    await _seed_symbol(db_session, "SAN")
    await _hunt(cap5, test_user.id, "SAN")

    log = (
        await db_session.execute(
            select(Cap5HuntLog).where(Cap5HuntLog.symbol == "SAN")
        )
    ).scalar_one()
    log.first_hunted_at = datetime(2026, 6, 1, 3, 0, tzinfo=UTC)  # thứ Hai
    log.last_hunted_at = log.first_hunted_at
    await db_session.flush()
    order = await _make_order(
        db_session, account.id, test_user.id, symbol="SAN",
        created_at=datetime(2026, 6, 5, 3, 0),  # thứ Sáu cùng tuần
    )

    out = await cap5.nguon_san(test_user.id, "san", order_id=order.id)
    assert out["tu_san_ma"] is True
    assert out["order_id"] == order.id
    assert out["so_phien_trong_watchlist"] == 4
    assert out["moc_tinh_phien"] == "luc_dat_lenh"
    assert out["canh_bao_thieu_order_id"] is None
    assert "trước khi đặt lệnh" in out["giai_thich"]

    # Không truyền order_id: vẫn trả lời được, nhưng ĐẾM TỚI HÔM NAY và phải
    # kèm cảnh báo — nó chỉ nói về sổ săn, không nói về lệnh nào.
    khong_moc = await cap5.nguon_san(test_user.id, "san")
    assert khong_moc["moc_tinh_phien"] == "hom_nay"
    assert khong_moc["canh_bao_thieu_order_id"]
    assert khong_moc["so_phien_trong_watchlist"] > 4


@pytest.mark.asyncio
async def test_nguon_san_khong_khai_san_sau_khi_mua(db_session, test_user):
    """★★ I5 kịch bản A: tự gõ mã mua thứ Hai, thứ Sáu mới bấm "+ Watchlist".

    Hàm cũ nhận ``symbol`` nên trả ``tu_san_ma=True`` ngay khi có hàng
    ``cap5_hunt_log`` ⇒ Kết sổ khai "săn từ bộ lọc «Vượt đỉnh» · đưa vào
    Watchlist 4 phiên trước" cho một lệnh KHÔNG hề đến từ săn mã.
    """
    src = _FakeHuntSource(bars={"VNM": _with_last(_bars(), close=21_000.0)})
    cap5, account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    await _seed_symbol(db_session, "VNM")
    order = await _make_order(
        db_session, account.id, test_user.id, symbol="VNM",
        created_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=4),
    )
    await _hunt(cap5, test_user.id, "VNM", bo_loc="dinh")

    out = await cap5.nguon_san(test_user.id, "VNM", order_id=order.id)
    assert out["tu_san_ma"] is False
    assert out["hunt_filter"] is None
    assert out["so_phien_trong_watchlist"] is None
    assert "sau khi đã đặt lệnh" in out["giai_thich"]
    # Và mốc săn vẫn được trả về (dữ kiện thật), chỉ là không gán cho lệnh này.
    assert out["first_hunted_at"] is not None


@pytest.mark.asyncio
async def test_nguon_san_order_id_la_hoac_lech_ma(db_session, test_user):
    """``order_id`` không tồn tại/của người khác ⇒ 404; lệnh khác mã ⇒ 400."""
    cap5, account, _src = await _enter_cap5(db_session, test_user.id)
    for sym in ("AAA", "BBB"):
        await _seed_symbol(db_session, sym)
    order = await _mua(db_session, account, test_user.id, "AAA")

    with pytest.raises(NotFoundError):
        await cap5.nguon_san(test_user.id, "AAA", order_id=uuid.uuid4())
    with pytest.raises(BadRequestError):
        await cap5.nguon_san(test_user.id, "BBB", order_id=order.id)


@pytest.mark.asyncio
async def test_stamp_kehoach_khong_viet_lai_lich_su_khi_san_lai(db_session, test_user):
    """★★ I5 kịch bản B: ``_stamp_kehoach`` ghi đè ở MỌI lần recompute.

    User săn lại một mã cũ từ bộ lọc khác (chuyện bình thường) thì
    ``log.hunt_filter`` đổi — và vì dấu được ghi lại mỗi lần đọc, tỷ lệ thắng
    của các bộ lọc ở khối ⑫ bị gán HỒI TỐ cho những lệnh đã đóng từ lâu.
    """
    src = _FakeHuntSource(
        bars={"HPG": _with_last(_bars(), close=21_000.0, volume=300_000.0)}
    )
    cap5, account, _src = await _enter_cap5(db_session, test_user.id, source=src)
    await _seed_symbol(db_session, "HPG")
    await _hunt(cap5, test_user.id, "HPG", bo_loc="dinh")
    order = await _mua(db_session, account, test_user.id, "HPG")
    cap1 = Cap1Service(db_session)
    await cap1.record_kehoach(
        test_user.id, order.id, ly_do="ky_thuat",
        trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )
    await cap5.get_progress(test_user.id)

    row = (
        await db_session.execute(
            select(OrderKehoach).where(OrderKehoach.order_id == order.id)
        )
    ).scalar_one()
    assert (row.from_watchlist, row.hunt_filter) == (True, "dinh")

    # Săn lại HPG từ bộ lọc KHÁC rồi đọc lại nhiều lần.
    await _hunt(cap5, test_user.id, "HPG", bo_loc="tang")
    await cap5.get_progress(test_user.id)
    await cap5.phan_tich(test_user.id)
    await db_session.refresh(row)
    assert row.hunt_filter == "dinh", "dấu bộ lọc của lệnh cũ bị viết lại hồi tố"
    assert row.from_watchlist is True

    # Nguồn săn của CHÍNH lệnh đó cũng phải nói bộ lọc lúc mua.
    out = await cap5.nguon_san(test_user.id, "HPG", order_id=order.id)
    assert out["hunt_filter"] == "dinh"
    assert out["canh_bao_nguon_moi_hon"] is None


@pytest.mark.asyncio
async def test_nguon_san_ma_tu_nhap_noi_thang_la_khong_qua_bo_loc(db_session, test_user):
    """Mã không đến từ săn: nói thẳng, KHÔNG đoán một bộ lọc."""
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    out = await cap5.nguon_san(test_user.id, "TAY")
    assert out["tu_san_ma"] is False
    assert out["hunt_filter"] is None
    assert out["hunt_filter_ten"] is None
    assert out["so_phien_trong_watchlist"] is None
    assert "không đến từ săn mã" in out["giai_thich"]


# ══════════════════════════════════════════════════════
# HTTP wiring
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_cap5_endpoints_wired_and_free(client, db_session, test_user, monkeypatch):
    """Router mount ở /api/v1/cap5, gác bằng ``CurrentUser`` (KHÔNG premium).

    Cũng canh đường khởi tạo THẬT: endpoint dựng ``Cap5Service(db)`` (không tiêm
    nguồn), nên ``VciHuntDataSource`` bị thay ở đây — nếu ai đó đổi tên/đường
    dẫn nguồn dữ liệu mặc định, test này đỏ chứ không âm thầm gọi mạng.
    """
    from app.core.security import create_access_token

    src = _FakeHuntSource(bars={"HTTP1": _with_last(_bars(), volume=300_000.0)})
    monkeypatch.setattr(
        "app.services.cap5.service.VciHuntDataSource", lambda *a, **kw: src
    )

    await _fast_track_cap4(db_session, test_user.id)
    await _seed_symbol(db_session, "HTTP1")
    await _seed_insight(db_session, "HTTP1", _AI_4_UNG_HO)
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
    assert body["so_ma_da_san"] == 0
    assert body["so_ma_cho_du_lop"] is None
    assert body["muc_tieu_so_ma_san"] == 10
    assert body["best_filter"] is None

    r = await client.post("/api/v1/cap5/graduate", headers=headers)
    assert r.status_code == 409

    # Màn Săn mã — 2 bộ lọc dòng tiền nói thẳng là chưa đủ dữ liệu.
    r = await client.get("/api/v1/cap5/san-ma", headers=headers)
    assert r.status_code == 200, r.text
    index = r.json()
    bo_loc = _by_ma(index["bo_loc"])
    assert bo_loc["ngoai"]["kha_dung"] is False
    assert bo_loc["ngoai"]["ly_do_chua_kha_dung"]
    assert bo_loc["kl"]["kha_dung"] is True
    assert _by_ma(index["loc_san"])["canh_bao"]["ap_dung"] is False

    r = await client.get("/api/v1/cap5/san-ma/kl", headers=headers)
    assert r.status_code == 200, r.text
    assert [i["symbol"] for i in r.json()["items"]] == ["HTTP1"]

    r = await client.get("/api/v1/cap5/san-ma/ngoai", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["tong_so_ma"] is None  # ★ KHÔNG phải 0

    r = await client.get("/api/v1/cap5/san-ma/khong-co", headers=headers)
    assert r.status_code == 404

    # Watchlist
    r = await client.post(
        "/api/v1/cap5/watchlist",
        headers=headers,
        json={"symbol": "HTTP1", "hunt_filter": "kl", "hunt_signal": "bịa"},
    )
    assert r.status_code == 201, r.text
    item = r.json()
    assert item["hunt_signal"] == "KL 3,0× TB20 phiên"
    assert item["consensus_today"] == 4
    assert item["status"] == "notable"

    r = await client.post(
        "/api/v1/cap5/watchlist",
        headers=headers,
        json={"symbol": "HTTP1", "hunt_filter": "khong_co"},
    )
    assert r.status_code == 422, r.text  # literal bộ lọc chặn ở tầng schema

    r = await client.get("/api/v1/cap5/watchlist", headers=headers)
    assert r.status_code == 200, r.text
    wl = r.json()
    assert wl["so_luong"] == 1
    assert wl["so_dang_chu_y"] == 1
    assert wl["items"][0]["lop"]["dinh_gia"] is None

    r = await client.get("/api/v1/cap5/nguon-san/HTTP1", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["hunt_filter"] == "kl"
    assert r.json()["so_lop_luc_vao"] is None

    r = await client.get("/api/v1/cap5/phan-tich", headers=headers)
    assert r.status_code == 200, r.text
    pt = r.json()
    assert pt["khoi_12"]["best_filter"] is None
    assert pt["khoi_13"]["so_ma_da_san"] == 1

    r = await client.post("/api/v1/cap5/tour-sanma", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["da_xem_tour_sanma"] is True

    r = await client.patch("/api/v1/cap5/task", headers=headers, json={"task_no": 1})
    assert r.status_code == 200, r.text
    assert r.json()["task_1_done_at"] is None
    r = await client.patch("/api/v1/cap5/task", headers=headers, json={"task_no": 9})
    assert r.status_code == 400, r.text

    r = await client.delete("/api/v1/cap5/watchlist/HTTP1", headers=headers)
    assert r.status_code == 204, r.text
    r = await client.delete("/api/v1/cap5/watchlist/HTTP1", headers=headers)
    assert r.status_code == 404

    # Sổ săn mã KHÔNG bị xoá theo watchlist.
    r = await client.get("/api/v1/cap5/progress", headers=headers)
    assert r.json()["so_ma_da_san"] == 1

    # Chưa đăng nhập thì bị chặn.
    for path in ("/api/v1/cap5/progress", "/api/v1/cap5/san-ma", "/api/v1/cap5/watchlist"):
        r = await client.get(path)
        assert r.status_code == 401, path


# ══════════════════════════════════════════════════════
# Migration b2e6f4a17c93 — «4 ô + đứng ngoài» → «Săn mã»
# ══════════════════════════════════════════════════════

#: Hình dạng PROD hôm nay (revision ``a3f7c1d9e2b8``), viết tay để test ghim
#: migration vào các cột THẬT CÓ trên prod, không phải vào cái ORM nói sau khi
#: đã đổi. Chỉ giữ những cột revision này chạm tới + đủ cột định danh để chứng
#: minh dữ liệu còn sống.
_PROD_DDL = [
    """
    CREATE TABLE users (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        email VARCHAR(255) NOT NULL
    )
    """,
    """
    CREATE TABLE cap5_progress (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        entered_at TIMESTAMP NOT NULL,
        task_1_done_at TIMESTAMP,
        task_2_done_at TIMESTAMP,
        task_3_done_at TIMESTAMP,
        so_lenh_phan_loai INTEGER NOT NULL DEFAULT 0,
        so_lan_dung_ngoai_da_cham INTEGER NOT NULL DEFAULT 0,
        ty_le_quyet_dinh_dung FLOAT NOT NULL DEFAULT 0,
        graduated_at TIMESTAMP,
        time_to_graduate_hours FLOAT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX ix_cap5_progress_user_id ON cap5_progress (user_id)",
    """
    CREATE TABLE standby_decision (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        decided_at TIMESTAMP NOT NULL,
        reason VARCHAR(32) NOT NULL,
        gia_luc_dung_ngoai NUMERIC(18, 4) NOT NULL,
        cham_at TIMESTAMP,
        gia_sau_5_phien NUMERIC(18, 4),
        ket_qua VARCHAR(16),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX ix_standby_decision_user_id ON standby_decision (user_id)",
    "CREATE INDEX ix_standby_decision_user_decided ON standby_decision (user_id, decided_at)",
    """
    CREATE TABLE order_ketso (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        order_id VARCHAR(36) NOT NULL,
        pnl_pct FLOAT NOT NULL,
        cham_SL_khong_cat BOOLEAN NOT NULL DEFAULT 0,
        nhoi_lenh_khi_lo BOOLEAN NOT NULL DEFAULT 0,
        verdict_he VARCHAR(8),
        verdict_user VARCHAR(8),
        verdict_provenance JSON,
        o_4 VARCHAR(16),
        ly_do_sua TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE order_kehoach (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        order_id VARCHAR(36) NOT NULL,
        vung_mua INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE watchlist_items (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
]


def _load_migration():
    """Nạp module revision theo đường dẫn — ``alembic/versions`` không phải package."""
    import importlib.util
    from pathlib import Path

    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "b2e6f4a17c93_cap5_san_ma_nghi_huu_4_o_dung_ngoai.py"
    )
    spec = importlib.util.spec_from_file_location("_cap5_sanma_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_migration(conn, direction: str) -> None:
    """Chạy đúng thân ``upgrade()``/``downgrade()`` thật trên ``conn``."""
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    module = _load_migration()
    with Operations.context(MigrationContext.configure(conn)):
        getattr(module, direction)()


def _cols(conn, table: str) -> list[str]:
    return [r[1] for r in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()]


def _rows(conn, table: str) -> dict[str, dict]:
    cols = _cols(conn, table)
    out = {}
    for row in conn.exec_driver_sql(f"SELECT {', '.join(cols)} FROM {table}").fetchall():
        record = dict(zip(cols, row, strict=True))
        out[record["id"]] = record
    return out


def _tables(conn) -> set[str]:
    return {
        r[0]
        for r in conn.exec_driver_sql(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }


def _seed_prod_shape(conn) -> None:
    """Dữ liệu KIỂU PROD dưới luật cũ.

    ★ PROD kỳ vọng **0 dòng** ``cap5_progress`` và **0 dòng** ``standby_decision``
    (trần cấp ``CAP_MAX_ENABLED`` mới lên 4, chưa ai vào được Cấp 5). Nhưng "kỳ
    vọng" KHÔNG phải "chứng minh" — nên ánh xạ vẫn được kiểm trên hàng kiểu-prod
    thật, mỗi ô nhiệm vụ mang một mốc KHÁC NHAU để phân biệt "ánh xạ đúng ô" với
    "bị xáo".
    """
    for stmt in _PROD_DDL:
        conn.exec_driver_sql(stmt)
    conn.exec_driver_sql("INSERT INTO users (id, email) VALUES ('u-tn1', 'a@x.vn')")
    # ① Người đã xong cả 3 nhiệm vụ CŨ và đã tốt nghiệp Cấp 5 cũ.
    conn.exec_driver_sql(
        """
        INSERT INTO cap5_progress (
            id, user_id, entered_at, task_1_done_at, task_2_done_at, task_3_done_at,
            so_lenh_phan_loai, so_lan_dung_ngoai_da_cham, ty_le_quyet_dinh_dung,
            graduated_at, time_to_graduate_hours
        ) VALUES (
            'tn1', 'u-tn1', '2026-01-01 00:00:00',
            '2026-01-01 01:00:00',  -- ① cũ: lệnh đầu ĐÃ PHÂN LOẠI 4 ô
            '2026-01-01 02:00:00',  -- ② cũ: nước ĐỨNG NGOÀI đầu tiên
            '2026-01-01 03:00:00',  -- ③ cũ: Thách thức Lão luyện
            24, 7, 79.2,
            '2026-01-01 04:00:00', 4.0
        )
        """
    )
    # ② Người đang làm dở: ① cũ xong, ② ③ chưa.
    conn.exec_driver_sql(
        """
        INSERT INTO cap5_progress (
            id, user_id, entered_at, task_1_done_at, so_lenh_phan_loai,
            so_lan_dung_ngoai_da_cham, ty_le_quyet_dinh_dung
        ) VALUES ('dd1', 'u-tn1', '2026-02-01 00:00:00', '2026-02-01 01:00:00', 6, 0, 50.0)
        """
    )
    # ③ Người vừa vào cấp.
    conn.exec_driver_sql(
        """
        INSERT INTO cap5_progress (id, user_id, entered_at)
        VALUES ('tr1', 'u-tn1', '2026-03-01 00:00:00')
        """
    )
    conn.exec_driver_sql(
        """
        INSERT INTO standby_decision (
            id, user_id, symbol, decided_at, reason, gia_luc_dung_ngoai,
            cham_at, gia_sau_5_phien, ket_qua
        ) VALUES (
            'sb1', 'u-tn1', 'VCB', '2026-01-02 00:00:00', 'dinh_gia_dat', 90000,
            '2026-01-09 00:00:00', 88000, 'ne_dung'
        )
        """
    )
    conn.exec_driver_sql(
        """
        INSERT INTO order_ketso (
            id, order_id, pnl_pct, verdict_he, verdict_user, verdict_provenance,
            o_4, ly_do_sua
        ) VALUES (
            'ks1', 'o1', 12.5, 'dung', 'sai', '{"verdict_he": "dung"}',
            'sai_thang', 'Tôi vào theo tin đồn.'
        )
        """
    )
    conn.exec_driver_sql(
        "INSERT INTO order_kehoach (id, order_id, vung_mua) VALUES ('kh1', 'o1', 20000)"
    )
    conn.exec_driver_sql(
        """
        INSERT INTO watchlist_items (id, user_id, symbol, sort_order)
        VALUES ('wl1', 'u-tn1', 'VCB', 0)
        """
    )


def test_migration_nghi_huu_4_o_dung_ngoai_va_tra_2_o_nhiem_vu_ve_null():
    """★★ ÁNH XẠ: cả ``task_1_done_at`` lẫn ``task_2_done_at`` về NULL.

    Nhiệm vụ cũ ① là "lệnh đầu tiên đã phân loại 4 ô", ② là "ghi nước đứng ngoài
    đầu tiên" — KHÔNG cái nào bao hàm "săn 10 mã vào Watchlist" hay "mua 5 mã từ
    Watchlist". Giữ mốc cũ trong ô mới là ghi công việc user chưa từng làm, và
    ``graduate()`` mới chỉ nhìn đúng hai ô đó ⇒ tốt nghiệp gian lận.
    """
    import sqlalchemy as sa

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_prod_shape(conn)
        _run_migration(conn, "upgrade")

        # Bảng đứng ngoài + 5 cột 4 ô đã đi hẳn.
        assert "standby_decision" not in _tables(conn)
        assert "cap5_hunt_log" in _tables(conn)
        for gone in ("verdict_he", "verdict_user", "verdict_provenance", "o_4", "ly_do_sua"):
            assert gone not in _cols(conn, "order_ketso"), gone
        assert _rows(conn, "order_ketso")["ks1"]["pnl_pct"] == 12.5

        cap5_cols = _cols(conn, "cap5_progress")
        for gone in ("task_3_done_at", "so_lenh_phan_loai",
                     "so_lan_dung_ngoai_da_cham", "ty_le_quyet_dinh_dung"):
            assert gone not in cap5_cols, gone
        for moi in ("so_ma_da_san", "so_ma_mua_tu_watchlist",
                    "da_xem_tour_sanma", "best_filter"):
            assert moi in cap5_cols, moi

        rows = _rows(conn, "cap5_progress")
        # ★ Hai ô nhiệm vụ về NULL — KHÔNG ánh xạ mốc cũ vào nghĩa mới.
        for key in ("tn1", "dd1", "tr1"):
            assert rows[key]["task_1_done_at"] is None, key
            assert rows[key]["task_2_done_at"] is None, key
        # Mốc tốt nghiệp + entered_at thì GIỮ NGUYÊN (Cấp 6 gác trên đúng nó).
        assert rows["tn1"]["graduated_at"] == "2026-01-01 04:00:00"
        assert rows["tn1"]["entered_at"] == "2026-01-01 00:00:00"
        assert rows["tn1"]["time_to_graduate_hours"] == 4.0
        # Hai ô đếm mới: 0 là số THẬT (tính lại ở mọi lần đọc)…
        assert rows["tn1"]["so_ma_da_san"] == 0
        assert rows["tn1"]["so_ma_mua_tu_watchlist"] == 0
        # ('false' là artifact của SQLite: nó lưu nguyên văn server_default cho
        # hàng đã tồn tại vì không có literal boolean. Prod là Postgres ⇒ false.)
        assert rows["tn1"]["da_xem_tour_sanma"] in (0, False, "false")
        # …còn best_filter thì NULLABLE: "chưa đủ lệnh để kết luận" ≠ một bộ lọc.
        assert rows["tn1"]["best_filter"] is None

        # Watchlist + order_kehoach nhận cột mới, TẤT CẢ đều NULL cho hàng cũ.
        wl = _rows(conn, "watchlist_items")["wl1"]
        for col in ("hunt_filter", "hunt_signal", "hunt_at", "consensus_today",
                    "consensus_prev", "consensus_da_cham", "consensus_at", "status"):
            assert col in wl, col
            assert wl[col] is None, col
        kh = _rows(conn, "order_kehoach")["kh1"]
        # ★ from_watchlist NULLABLE ba trạng thái: NULL = lệnh cũ chưa ai kiểm.
        assert kh["from_watchlist"] is None
        assert kh["hunt_filter"] is None
        assert kh["vung_mua"] == 20000


def test_migration_moi_cot_diem_ty_le_moi_deu_nullable():
    """★ Luật repo: mọi cột ĐIỂM/TỶ LỆ mới phải nullable từ đầu.

    Repo đã phải viết một migration riêng chỉ vì một cột điểm ``NOT NULL DEFAULT
    0`` khiến user ngày đầu đọc "0%" như thể tệ nhất có thể. Test này đọc thẳng
    ``PRAGMA table_info`` (cột 3 = notnull) nên không thể lách bằng docstring.
    """
    import sqlalchemy as sa

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_prod_shape(conn)
        _run_migration(conn, "upgrade")

        def notnull(table: str) -> dict[str, int]:
            return {
                r[1]: r[3]
                for r in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
            }

        wl = notnull("watchlist_items")
        for col in ("consensus_today", "consensus_prev", "consensus_da_cham",
                    "consensus_at", "status"):
            assert wl[col] == 0, f"watchlist_items.{col} phải nullable"
        assert notnull("cap5_progress")["best_filter"] == 0
        assert notnull("order_kehoach")["from_watchlist"] == 0
        # Hai ô ĐẾM thì NOT NULL DEFAULT 0 là ĐÚNG: 0 ở đó là số thật.
        assert notnull("cap5_progress")["so_ma_da_san"] == 1
        assert notnull("cap5_progress")["so_ma_mua_tu_watchlist"] == 1


def test_migration_round_trip_len_xuong_len_hai_vong():
    """upgrade → downgrade → upgrade → downgrade → upgrade là BẤT ĐỘNG.

    Downgrade LOSSY theo thiết kế (xem docstring revision): dòng đứng ngoài và
    dữ liệu 4 ô mất hẳn, các ô đếm quay về 0, hai ô nhiệm vụ về NULL. Nhờ mọi ô
    hai chiều đều về NULL hoặc 0 xác định nên vòng thứ hai không trôi thêm.
    """
    import sqlalchemy as sa

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_prod_shape(conn)

        _run_migration(conn, "upgrade")
        # ★ Giả lập một user ĐÃ tiến bộ dưới luật MỚI (đúng thứ
        # ``_recompute_progress`` ghi): săn 12 mã, mua 6 mã, hai ô nhiệm vụ mới
        # được đóng dấu. Không có bước này thì dòng reset trong ``downgrade`` là
        # no-op và test không nói được gì về nó.
        conn.exec_driver_sql(
            """
            UPDATE cap5_progress
               SET task_1_done_at = '2026-08-20 10:00:00',
                   task_2_done_at = '2026-08-20 11:00:00',
                   so_ma_da_san = 12,
                   so_ma_mua_tu_watchlist = 6,
                   best_filter = 'kl',
                   da_xem_tour_sanma = 1
             WHERE id = 'tn1'
            """
        )
        sau_lan_1 = _rows(conn, "cap5_progress")
        wl_lan_1 = _rows(conn, "watchlist_items")
        ks_lan_1 = _rows(conn, "order_ketso")
        # ★ Snapshot CỘT của mọi bảng migration này chạm tới. Không có nó thì
        # một ``downgrade()`` để sót cột (hoặc ``upgrade()`` thêm cột hai lần)
        # vẫn xanh — bài test mang tên "BẤT ĐỘNG" mà không kiểm cột nào cả.
        _BANG_MIGRATION = (
            "cap5_progress",
            "cap5_hunt_log",
            "watchlist_items",
            "order_kehoach",
            "order_ketso",
        )
        cols_lan_1 = {t: _cols(conn, t) for t in _BANG_MIGRATION}
        # ★ Và cột phải khớp MODEL: ``_rows`` chỉ bắt được lệch cột ở bảng CÓ
        # hàng, nên ``cap5_hunt_log`` (rỗng sau upgrade) cần lưới riêng này —
        # bỏ một cột trong ``create_table`` sẽ đi qua mọi assert khác.
        from app.models.cap5 import Cap5HuntLog as _HL
        from app.models.cap5 import Cap5Progress as _CP
        from app.models.watchlist import WatchlistItem as _WL

        for table, model in (
            ("cap5_hunt_log", _HL),
            ("cap5_progress", _CP),
            ("watchlist_items", _WL),
        ):
            assert set(cols_lan_1[table]) == {
                c.name for c in model.__table__.columns
            }, table
        # (``order_kehoach`` chỉ được seed ở dạng tối giản trong DDL kiểu-prod
        # của test này, nên chỉ kiểm 2 cột Cấp 5 mà migration thêm vào.)
        for cot in ("from_watchlist", "hunt_filter"):
            assert cot in cols_lan_1["order_kehoach"], cot
        assert sau_lan_1["tn1"]["task_1_done_at"] == "2026-08-20 10:00:00"

        _run_migration(conn, "downgrade")
        assert "standby_decision" in _tables(conn)
        assert "cap5_hunt_log" not in _tables(conn)
        down = _rows(conn, "cap5_progress")
        for back in ("task_3_done_at", "so_lenh_phan_loai",
                     "so_lan_dung_ngoai_da_cham", "ty_le_quyet_dinh_dung"):
            assert back in _cols(conn, "cap5_progress"), back
        # ★ Hai ô nhiệm vụ mang nghĩa MỚI ("săn 10 mã"/"mua 5 mã"); dưới luật
        # cũ chúng nói chuyện khác hẳn ("đã phân loại 4 ô"/"đã ghi nước đứng
        # ngoài"), nên downgrade phải TRẢ VỀ NULL chứ không giữ lại. Giữ lại là
        # gán bừa — và service Cấp 5 CŨ sẽ tự đóng dấu lại từ dữ liệu thật.
        assert down["tn1"]["task_1_done_at"] is None
        assert down["tn1"]["task_2_done_at"] is None
        # LOSSY, và nói thẳng là lossy: mốc + số cũ KHÔNG dựng lại được.
        assert down["tn1"]["task_3_done_at"] is None
        assert down["tn1"]["so_lenh_phan_loai"] == 0
        assert down["tn1"]["ty_le_quyet_dinh_dung"] == 0
        # Nhưng mốc tốt nghiệp thì sống qua cả hai chiều.
        assert down["tn1"]["graduated_at"] == "2026-01-01 04:00:00"
        assert _rows(conn, "standby_decision") == {}

        _run_migration(conn, "upgrade")
        # Vòng lên lại: hai ô nhiệm vụ mới KHÔNG tự sống lại (đúng — chúng phải
        # được tính lại từ cap5_hunt_log), nên hàng này khác lần 1 đúng ở đó.
        lan_2 = _rows(conn, "cap5_progress")
        assert lan_2["tn1"]["task_1_done_at"] is None
        assert lan_2["tn1"]["task_2_done_at"] is None
        assert lan_2["tn1"]["so_ma_da_san"] == 0
        assert lan_2["tn1"]["graduated_at"] == "2026-01-01 04:00:00"
        assert _rows(conn, "watchlist_items") == wl_lan_1
        assert _rows(conn, "order_ketso") == ks_lan_1
        sau_lan_1 = lan_2

        # ★ VÒNG THỨ HAI
        _run_migration(conn, "downgrade")
        _run_migration(conn, "upgrade")
        assert _rows(conn, "cap5_progress") == sau_lan_1
        assert _rows(conn, "watchlist_items") == wl_lan_1
        assert _rows(conn, "order_ketso") == ks_lan_1
        assert {t: _cols(conn, t) for t in _BANG_MIGRATION} == cols_lan_1
        assert "cap5_hunt_log" in _tables(conn)


@pytest.mark.asyncio
async def test_consensus_prev_giu_diem_khac_gan_nhat_chu_khong_ghi_de_moi_ngay(
    db_session, test_user
):
    """★ Ghim đúng nghĩa ``consensus_prev``: **điểm KHÁC gần nhất trước đó**.

    Mockup §6.2 vẽ "2/5 → 4/5 (3 phiên)" — một BƯỚC CHUYỂN đã xảy ra N phiên
    trước. Nếu mẻ chấm ghi đè ``consensus_prev`` mỗi ngày thì một mã đứng yên sẽ
    mãi hiện "4/5 → 4/5" và bước chuyển biến mất khỏi thẻ. Đánh đổi (đã ghi
    trong model): FE không biết bước chuyển xảy ra bao lâu rồi nên KHÔNG được in
    "(N phiên)".

    Test này canh cả hai chiều — nó đỏ dù ai đó đổi sang "ghi đè mỗi ngày" hay
    "không bao giờ ghi".
    """
    cap5, _account, _src = await _enter_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "STEP")
    await _seed_insight(db_session, "STEP", _AI_3_UNG_HO, day=_phien(4))
    await _hunt(cap5, test_user.id, "STEP")

    row = (
        await db_session.execute(
            select(WatchlistItem).where(WatchlistItem.symbol == "STEP")
        )
    ).scalar_one()

    async def _cham_lai_ngay_moi() -> dict:
        """Lùi mốc chấm về hôm qua để mẻ hôm nay chạy lại."""
        row.consensus_at = datetime.now(UTC) - timedelta(days=1)
        await db_session.flush()
        return (await cap5.watchlist(test_user.id))["items"][0]

    assert row.consensus_today == 3
    assert row.consensus_prev is None

    # Phiên sau: 3 → 4 (bước chuyển).
    await _seed_insight(db_session, "STEP", _AI_4_UNG_HO, day=_phien(3))
    item = await _cham_lai_ngay_moi()
    assert (item["consensus_prev"], item["consensus_today"]) == (3, 4)

    # Hai phiên tiếp: vẫn 4/5 — bước chuyển 3 → 4 PHẢI còn trên thẻ.
    for day in (_phien(2), _phien(1)):
        await _seed_insight(db_session, "STEP", _AI_4_UNG_HO, day=day)
        item = await _cham_lai_ngay_moi()
        assert (item["consensus_prev"], item["consensus_today"]) == (3, 4), day

    # Đổi lần nữa: 4 → 0, và điểm cũ 3 bị thay bằng 4.
    await _seed_insight(db_session, "STEP", _AI_0_UNG_HO, day=_phien(0))
    item = await _cham_lai_ngay_moi()
    assert (item["consensus_prev"], item["consensus_today"]) == (4, 0)
    assert item["status"] == "watching"
