"""Tests cho backend Cấp 6 «Bậc thầy» — bảng mâu thuẫn 5 lớp (2 phe + lớp phủ
quyết), ô nhận định 4 mức trên ``order_kehoach``, nút «Không mua lần này»
(``cap6_skip``), khối ⑭/⑮ của Phân tích danh mục, cổng lên cấp THUẦN HÀNH VI,
migration ``c7f1b9d34a80``. Kèm bài Cấp 5 mang sang: ``POST /cap1/ketso`` upsert
``cam_xuc``.

Theo phong cách ``tests/test_cap5.py``. Dùng fixture ``test_user``/``db_session``
của ``tests/conftest.py``.

**Ghi chú chi phí setup.** Điều kiện tiên quyết thật của Cấp 6 chỉ là
``Cap5Progress.graduated_at``. ``test_enter_requires_cap5_graduated`` chạy đúng
cổng Cấp 5 thật (đã vào nhưng chưa tốt nghiệp → 409); mọi bài khác dùng
``_fast_track_cap5`` đóng dấu thẳng các hàng tiến trình (chuỗi tốt nghiệp Cấp
0→5 đã được ``tests/test_cap5.py`` ghim).

═══════════════════════════════════════════════════════════════════
★ BA ĐIỀU BÀI TEST NÀY GHIM CHẶT NHẤT
═══════════════════════════════════════════════════════════════════

① **Cổng THUẦN HÀNH VI, không đo lãi** (spec §2). Một user lỗ nặng vẫn tốt
   nghiệp nếu xử lý mâu thuẫn nhất quán; một user lãi đậm mà đọc "nghiêm trọng"
   rồi vẫn mua lớn thì KHÔNG.

② **Client không tự cấp cho mình điều kiện lên cấp.** ``had_conflict`` /
   ``had_veto`` / ``veto_layers`` do SERVER suy lại từ ``ai_insight_history`` ở
   mọi lần ghi; client gửi kèm cũng bị bỏ. Cấp 5 đã học bài này với
   ``hunt_signal``.

③ **Nhận định chốt tại thời điểm khớp lệnh.** Lệnh đã khớp quá cửa sổ thì MỌI
   lần ghi bị từ chối — **kể cả lần ghi ĐẦU TIÊN**, không chỉ lần sửa. Cấp 7
   từng để khoá nằm nhầm trong nhánh "đã có nhận định" nên nó chỉ chạy từ lần
   POST THỨ HAI, trong khi docstring khẳng định là không thể.
"""

from __future__ import annotations

import uuid as _uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.ai_insight_history import AIInsightHistory
from app.models.cap1 import Cap1Progress
from app.models.cap2 import Cap2Progress
from app.models.cap3 import Cap3Progress
from app.models.cap4 import Cap4Progress
from app.models.cap5 import Cap5Progress
from app.models.cap6 import (
    LOP_DIEM_TRU,
    LOP_PHU_QUYET,
    MUC_NANG_DAN,
    Cap6Progress,
    Cap6Skip,
    MucMauThuan,
)
from app.models.symbol import Symbol
from app.models.virtual_trading import OrderSide, OrderStatus, OrderType, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.cap1.service import Cap1Service
from app.services.cap2.service import Cap2Service
from app.services.cap3.service import Cap3Service
from app.services.cap4.service import Cap4Service
from app.services.cap5.service import Cap5Service
from app.services.cap6 import mau_thuan as mt
from app.services.cap6.service import (
    CUA_SO_CHOT_NHAN_DINH,
    MIN_LENH_TY_LE_THANG,
    MUC_TIEU_NHAT_QUAN,
    MUC_TIEU_VETO,
    NGUONG_MUA_NHO_PCT,
    Cap6Service,
)

_ALL_NEU = {
    "ky_thuat": "neu",
    "dong_tien": "neu",
    "noi_bo": "neu",
    "tin_tuc": "neu",
    "dinh_gia": "neu",
}


def _doc(**overrides: str) -> dict[str, str]:
    return {**_ALL_NEU, **overrides}


# ══════════════════════════════════════════════════════
# Payload AI Insight — nguồn DUY NHẤT của bảng mâu thuẫn
# ══════════════════════════════════════════════════════
#
# ★ Khoá lớp là khoá THẬT của AI Insight v2 (``LOP_TO_AI_LAYER`` của Cấp 5):
#   L1 = 🎯 Kỹ thuật · L3 = 💰 Dòng tiền · L4 = 👤 Nội bộ · L5 = 📰 Tin tức.
#   **KHÔNG có lớp 💎 Định giá** — L2 là Thanh khoản, ánh xạ nó sang Định giá là
#   bịa. Vì thế mọi mã chỉ chấm được tối đa 4/5 lớp.


def _payload(**layers: str) -> dict:
    return {key: {"statusLabel": nhan} for key, nhan in layers.items()}


#: Mâu thuẫn CÓ phủ quyết KÍCH HOẠT: Kỹ thuật rất mạnh (bậc 5) vs Tin tức rất
#: tiêu cực (bậc 1 — bậc thấp nhất của một lớp phủ quyết).
_P_VETO = _payload(L1="Rất mạnh", L5="Rất tiêu cực")

#: Mâu thuẫn KHÔNG có phủ quyết: lớp ngược chiều là 💰 Dòng tiền (điểm trừ).
_P_CONFLICT = _payload(L1="Rất mạnh", L3="Cảnh báo mạnh")

#: Mâu thuẫn mà lớp phủ quyết chỉ "tiêu cực nhẹ" (bậc 2) — spec §5.3 nói thẳng:
#: KHÔNG coi là phủ quyết kích hoạt, chỉ là điểm trừ.
_P_VETO_NHE = _payload(L1="Rất mạnh", L5="Tiêu cực")

#: 5 lớp cùng chiều ⇒ KHÔNG có mâu thuẫn (spec §5.1).
_P_THUAN = _payload(L1="Rất mạnh", L3="Hỗ trợ mạnh")

#: Chỉ có lớp bậc 3 — chấm được nhưng không ai vào phe nào.
_P_TRUNG_TINH = _payload(L1="Trung bình", L3="Trung tính")


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
    row = Symbol(symbol=symbol.upper(), name=symbol, icb_lv1=icb_lv1, icb_lv2=icb_lv2)
    db_session.add(row)
    await db_session.flush()
    return row


async def _seed_insight(
    db_session, symbol: str, payload: dict, *, session_date: date | None = None
) -> AIInsightHistory:
    """Một bản AI Insight đã lưu cho mã — nguồn DUY NHẤT của bảng mâu thuẫn.

    ★ Không có hàng nào ⇒ "chưa đủ dữ liệu", KHÔNG phải "không có mâu thuẫn"
    (spec §11: "KHÔNG chạy cho mã user chưa từng xem").
    """
    row = AIInsightHistory(
        symbol=symbol.upper(),
        session_date=session_date or mt.hom_nay_vn(),
        payload=payload,
    )
    db_session.add(row)
    await db_session.flush()
    return row


async def _fast_track_cap5(db_session, user_id, *, graduated: bool = True):
    """Đóng dấu các hàng tiến trình Cấp 1-5 mà luồng Cấp 6 cần + tài khoản VT."""
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
    """Fast-track Cấp 1-5 rồi vào Cấp 6. Trả ``(services, account)``."""
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
    pct_von: float = 20.0,
    muc_tu_tin: int = 3,
    buy_price: int = 20_000,
    status: OrderStatus = OrderStatus.FILLED,
) -> VirtualOrder:
    """Một lệnh MUA mang đủ khối Cấp 1-4 (hàng mà Cấp 6 cộng dồn lên)."""
    buy = await _make_order(
        db_session, account_id, user_id, symbol=symbol, price=buy_price, status=status
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
        muc_tu_tin=muc_tu_tin,
        cach_khoi_luong="linh_hoat",
        khoi_luong=100,
        pct_von=pct_von,
    )
    await services["cap4"].record_kehoach(
        user_id, buy.id, doc_5_lop=_doc(ky_thuat="ok", tin_tuc="bad"), ai_5_lop=_doc(ky_thuat="ok")
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


async def _lenh_mau_thuan(
    db_session,
    services,
    account_id,
    user_id,
    *,
    symbol: str,
    payload: dict,
    muc: str,
    pct_von: float,
    close: bool | None = None,
    win: bool = True,
):
    """Một vòng Cấp 6 trọn vẹn: seed Insight → mua có kế hoạch → ghi nhận định
    (→ tuỳ chọn bán + kết sổ để nuôi khối ⑮)."""
    await _seed_insight(db_session, symbol, payload)
    buy = await _buy_with_plan(
        db_session, services, account_id, user_id, symbol=symbol, pct_von=pct_von
    )
    kehoach = await services["cap6"].record_kehoach(user_id, buy.id, conflict_level=muc)
    if close:
        await _sell_and_ketso(
            db_session, services, account_id, user_id, symbol=symbol, win=win
        )
    return kehoach


def _age_order(order: VirtualOrder, *, minutes: int) -> None:
    """Đẩy lùi ``created_at`` của lệnh — cột này naive nên lưu naive UTC."""
    order.created_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=minutes)


# ══════════════════════════════════════════════════════
# Máy phát hiện mâu thuẫn — thuần payload, không DB
# ══════════════════════════════════════════════════════


def test_hai_phe_chia_theo_bac_va_bac_3_khong_thuoc_phe_nao():
    """Bậc 4-5 = ủng hộ · bậc 1-2 = ngược chiều · bậc 3 = TRUNG TÍNH.

    ★ Một lớp không ý kiến KHÔNG phải một lớp phản đối — đây đúng là lỗi Cấp 5
    đã phải sửa cho cụm 5 icon của Watchlist.
    """
    r = mt.doc_tu_payload(
        _payload(L1="Rất mạnh", L3="Trung tính", L4="Cảnh báo nhẹ", L5="Tích cực")
    )
    assert [x["lop"] for x in r.ung_ho] == ["ky_thuat", "tin_tuc"]
    assert [x["lop"] for x in r.nguoc] == ["noi_bo"]
    assert [x["lop"] for x in r.trung_tinh] == ["dong_tien"]
    assert r.co_mau_thuan is True
    assert r.so_lop_da_cham == 4


def test_khong_mau_thuan_khi_5_lop_cung_chieu():
    """``co_mau_thuan`` ⇔ có ≥1 lớp ủng hộ VÀ ≥1 lớp ngược (spec §5.1)."""
    r = mt.doc_tu_payload(_P_THUAN)
    assert r.co_mau_thuan is False
    assert r.canh_bao is None  # không có mâu thuẫn thì không có gì để cảnh báo
    assert r.chua_du_du_lieu is False  # ★ "không mâu thuẫn" ≠ "chưa đủ dữ liệu"

    # Toàn bậc 3 cũng KHÔNG phải mâu thuẫn — và vẫn là dữ liệu đã chấm được.
    r2 = mt.doc_tu_payload(_P_TRUNG_TINH)
    assert r2.co_mau_thuan is False
    assert r2.so_lop_da_cham == 2
    assert r2.chua_du_du_lieu is False


def test_phu_quyet_thuoc_nhom_khac_han_phu_quyet_dang_kich_hoat():
    """★★ ``la_phu_quyet`` (thuộc NHÓM) ≠ ``phu_quyet_kich_hoat`` (ĐANG ở bậc 1).

    Spec §5.3: ở mức chỉ "tiêu cực nhẹ" (bậc 2) thì KHÔNG coi là phủ quyết kích
    hoạt — nó chỉ là điểm trừ. Nhưng tag đỏ "PHỦ QUYẾT" trong mockup vẫn phải
    hiện, vì lớp đó vẫn thuộc nhóm có quyền phủ quyết. Gộp hai khái niệm này là
    hoặc mất cái tag, hoặc mở toang cổng ≥2 lần.
    """
    nhe = mt.doc_tu_payload(_P_VETO_NHE)
    (dong_nguoc,) = nhe.nguoc
    assert dong_nguoc["lop"] == "tin_tuc"
    assert dong_nguoc["bac"] == 2
    assert dong_nguoc["la_phu_quyet"] is True  # tag đỏ vẫn hiện…
    assert nhe.phu_quyet_kich_hoat is False  # …nhưng cổng KHÔNG mở
    assert nhe.lop_phu_quyet_xau == []

    nang = mt.doc_tu_payload(_P_VETO)
    (dong_nang,) = nang.nguoc
    assert dong_nang["bac"] == mt.BAC_PHU_QUYET_KICH_HOAT == 1
    assert nang.phu_quyet_kich_hoat is True
    assert nang.lop_phu_quyet_xau == ["tin_tuc"]


def test_lop_diem_tru_o_bac_thap_nhat_van_khong_phai_phu_quyet():
    """💰 Dòng tiền «Cảnh báo mạnh» là bậc 1 — nhưng nó thuộc nhóm ĐIỂM TRỪ."""
    r = mt.doc_tu_payload(_P_CONFLICT)
    (dong,) = r.nguoc
    assert dong["lop"] == "dong_tien"
    assert dong["bac"] == 1
    assert dong["la_phu_quyet"] is False
    assert r.phu_quyet_kich_hoat is False
    assert r.co_mau_thuan is True


def test_dinh_gia_khong_co_nguon_nen_khong_bao_gio_vao_phe_nao():
    """AI Insight v2 KHÔNG có lớp 💎 Định giá (L2 là Thanh khoản).

    Mọi mã vì thế chỉ chấm được tối đa **4/5** lớp, và ``so_lop_da_cham`` đi kèm
    kết quả để người đọc biết mẫu số thật. Một payload cố tình mang cả L2 lẫn
    khoá "dinh_gia" cũng không kéo được lớp đó vào bảng.
    """
    r = mt.doc_tu_payload(
        {
            **_payload(
                L1="Rất mạnh", L3="Hỗ trợ mạnh", L4="Cảnh báo mạnh", L5="Rất tiêu cực"
            ),
            "L2": {"statusLabel": "Rất mạnh"},
            "dinh_gia": {"statusLabel": "Rất mạnh"},
        }
    )
    assert r.so_lop_da_cham == 4
    moi_lop = [x["lop"] for x in (*r.ung_ho, *r.nguoc, *r.trung_tinh)]
    assert "dinh_gia" not in moi_lop
    assert len(moi_lop) == 4


def test_chua_du_du_lieu_la_trang_thai_that_khong_phai_bang_rong():
    """Không nhãn nào hợp lệ ⇒ ``chua_du_du_lieu`` + lý do nguyên văn.

    ★ Đây là một TRẠNG THÁI THẬT, không phải "0 mâu thuẫn": mọi phe rỗng,
    ``co_mau_thuan``/``phu_quyet_kich_hoat`` đều False, ``canh_bao`` là None.
    """
    r = mt.doc_tu_payload({"L1": {"statusLabel": "—"}, "L9": {"statusLabel": "Rất mạnh"}})
    assert r.chua_du_du_lieu is True
    assert r.so_lop_da_cham == 0
    assert r.co_mau_thuan is False
    assert r.canh_bao is None
    assert r.ly_do_chua_du and "chưa dựng được bảng mâu thuẫn" in r.ly_do_chua_du


def test_canh_bao_do_server_dung_va_khong_bao_gio_phan_mua_hay_khong():
    """SERVER dựng câu, FE in nguyên văn (§C12c) — và câu đó chỉ MÔ TẢ.

    Spec §4.1/§13: IQX chỉ ra mâu thuẫn, KHÔNG BAO GIỜ phán mua/không mua.
    """
    co_veto = mt.doc_tu_payload(_P_VETO).canh_bao
    assert co_veto is not None
    assert "phủ quyết" in co_veto and "rất xấu" in co_veto

    khong_veto = mt.doc_tu_payload(_P_CONFLICT).canh_bao
    assert khong_veto is not None
    assert "điểm trừ" in khong_veto
    assert "phủ quyết" not in khong_veto

    for cau in (co_veto, khong_veto):
        for cam in ("nên mua", "không nên mua", "khuyến nghị", "hãy mua", "đừng mua"):
            assert cam not in cau.lower(), cam


def test_thang_bac_bi_khoa_vao_bang_nhan_cua_cap5():
    """★ Hàng rào import-time ``_assert_thang_bac`` CẮN THẬT.

    Không có nó, đổi một nhãn ở ``app.services.cap5.consensus`` sẽ âm thầm biến
    một lớp xấu thành "chưa chấm được" ở đây — và một lệnh có phủ quyết sẽ không
    còn được đếm vào cổng ≥2 lần.
    """
    goc = dict(mt.THANG_BAC)
    goc_bac = dict(mt._BAC)
    try:
        # Đảo thang L5: "Rất tiêu cực" (bậc 1) tụt xuống thành bậc 5.
        mt.THANG_BAC["L5"] = tuple(reversed(goc["L5"]))
        mt._BAC["L5"] = {n: i + 1 for i, n in enumerate(mt.THANG_BAC["L5"])}
        with pytest.raises(RuntimeError, match="lệch bảng"):
            mt._assert_thang_bac()
    finally:
        mt.THANG_BAC.clear()
        mt.THANG_BAC.update(goc)
        mt._BAC.clear()
        mt._BAC.update(goc_bac)
    mt._assert_thang_bac()  # neo dương tính: bảng thật vẫn qua được


def test_phan_loai_lop_phu_quyet_phu_dung_5_lop():
    """Phủ quyet ∪ điểm trừ = đúng 5 lớp, không chồng nhau (spec §1/§5.3)."""
    from app.models.cap4 import LOP_KEYS
    from app.models.cap6 import _assert_phan_loai_lop

    assert set(LOP_PHU_QUYET) == {"tin_tuc", "noi_bo"}
    assert set(LOP_KEYS) == LOP_PHU_QUYET | LOP_DIEM_TRU
    assert not (LOP_PHU_QUYET & LOP_DIEM_TRU)

    import app.models.cap6 as m6

    goc = m6.LOP_PHU_QUYET
    try:
        m6.LOP_PHU_QUYET = frozenset({"tin_tuc"})  # bỏ rơi 👤 Nội bộ
        with pytest.raises(RuntimeError, match="chưa được phân loại"):
            _assert_phan_loai_lop()
    finally:
        m6.LOP_PHU_QUYET = goc
    _assert_phan_loai_lop()  # neo dương tính


# ══════════════════════════════════════════════════════
# Nguồn bảng mâu thuẫn — cửa sổ hiệu lực
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_mau_thuan_ma_chua_tung_xem_tra_ve_chua_du_du_lieu(db_session, test_user):
    """Spec §11: "KHÔNG chạy cho mã user chưa từng xem" — và nói thẳng là chưa
    có dữ liệu, chứ không dựng một bảng mâu thuẫn trống."""
    services, _ = await _enter_cap6(db_session, test_user.id)
    out = await services["cap6"].mau_thuan(test_user.id, "zzz")
    assert out["symbol"] == "ZZZ"
    assert out["chua_du_du_lieu"] is True
    assert out["co_mau_thuan"] is False
    assert "chưa có bản phân tích" in out["ly_do_chua_du"]


@pytest.mark.asyncio
async def test_mau_thuan_ban_qua_han_khong_duoc_gan_cho_phien_hom_nay(
    db_session, test_user
):
    """★ Một bản 5 tháng tuổi cạnh nút «Đặt lệnh» là gán tình trạng tháng Ba cho
    hôm nay. Cửa sổ hiệu lực dùng LẠI luật của Cấp 5 (cả repo một luật)."""
    services, _ = await _enter_cap6(db_session, test_user.id)
    cu = mt.ngay_som_nhat_con_hieu_luc(mt.hom_nay_vn()) - timedelta(days=1)
    await _seed_insight(db_session, "OLD", _P_VETO, session_date=cu)

    out = await services["cap6"].mau_thuan(test_user.id, "OLD")
    assert out["chua_du_du_lieu"] is True
    assert out["phu_quyet_kich_hoat"] is False
    assert "quá hạn" in out["ly_do_chua_du"]
    assert cu.strftime("%d/%m/%Y") in out["ly_do_chua_du"]


@pytest.mark.asyncio
async def test_mau_thuan_wire_shape_day_du(db_session, test_user):
    """Hình dạng wire mà FE dựng bảng 2 phe + chú thích khung phân loại."""
    services, _ = await _enter_cap6(db_session, test_user.id)
    await _seed_insight(db_session, "VCB", _P_VETO)

    out = await services["cap6"].mau_thuan(test_user.id, "VCB")
    assert out["co_mau_thuan"] is True
    assert out["ung_ho"] == [
        {"lop": "ky_thuat", "ten": "Kỹ thuật", "nhan": "Rất mạnh", "bac": 5}
    ]
    assert out["nguoc"][0]["la_phu_quyet"] is True
    assert out["phu_quyet_kich_hoat"] is True
    assert out["lop_phu_quyet_xau"] == ["tin_tuc"]
    assert out["lop_phu_quyet_xau_ten"] == ["Tin tức"]
    assert out["so_lop_da_cham"] == 2
    assert out["session_date"] == mt.hom_nay_vn()
    # Khung phân loại (spec §5.2 chú thích) — "khung tham khảo, không bắt buộc".
    assert out["lop_phu_quyet"] == sorted(LOP_PHU_QUYET)
    assert out["lop_diem_tru"] == sorted(LOP_DIEM_TRU)


@pytest.mark.asyncio
async def test_mau_thuan_requires_progress_and_a_symbol(db_session, test_user):
    cap6 = Cap6Service(db_session)
    with pytest.raises(NotFoundError):
        await cap6.mau_thuan(test_user.id, "VCB")

    services, _ = await _enter_cap6(db_session, test_user.id)
    with pytest.raises(BadRequestError):
        await services["cap6"].mau_thuan(test_user.id, "   ")


# ══════════════════════════════════════════════════════
# Enter / progress
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_enter_requires_cap5_graduated(db_session, test_user):
    cap6 = Cap6Service(db_session)

    with pytest.raises(NotFoundError):
        await cap6.enter(test_user.id)

    await _fast_track_cap5(db_session, test_user.id, graduated=False)
    with pytest.raises(ConflictError):
        await cap6.enter(test_user.id)

    row = (
        await db_session.execute(
            select(Cap5Progress).where(Cap5Progress.user_id == test_user.id)
        )
    ).scalar_one()
    row.graduated_at = datetime.now(UTC)
    await db_session.flush()

    out = await cap6.enter(test_user.id)
    assert out["entered_at"] is not None
    again = await cap6.enter(test_user.id)  # idempotent
    assert again["id"] == out["id"]


@pytest.mark.asyncio
async def test_get_progress_none_before_enter(db_session, test_user):
    assert await Cap6Service(db_session).get_progress(test_user.id) is None


@pytest.mark.asyncio
async def test_progress_wire_shape_and_tong_lai_null_not_zero(db_session, test_user):
    """★★ ``tong_lai_lenh_cap6_pct = null`` nghĩa là CHƯA có lệnh đóng.

    ``0.0`` là một câu KHÁC HẲN ("đã đóng lệnh, hoà vốn"). Đây đúng lớp lỗi đã
    đánh codebase này 5 lần.
    """
    services, account = await _enter_cap6(db_session, test_user.id)
    out = await services["cap6"].get_progress(test_user.id)

    assert out["so_lan_xu_ly_nhat_quan"] == 0
    assert out["so_lan_xu_ly_veto_nhat_quan"] == 0
    assert out["muc_tieu_nhat_quan"] == MUC_TIEU_NHAT_QUAN == 3
    assert out["muc_tieu_veto"] == MUC_TIEU_VETO == 2
    assert out["tong_lai_lenh_cap6_pct"] is None  # ★ KHÔNG phải 0.0
    assert out["da_xem_tour_mauthuan"] is False
    assert out["dat_nhiem_vu"] is False
    assert out["graduated_at"] is None

    # Đóng một lệnh ⇒ ô đó mới có số, và số đó là số THẬT.
    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="AAA", payload=_P_VETO, muc="nghiem", pct_von=8.0, close=True, win=True,
    )
    sau = await services["cap6"].get_progress(test_user.id)
    assert sau["tong_lai_lenh_cap6_pct"] == pytest.approx(10.0)


@pytest.mark.asyncio
async def test_tour_mauthuan_flag_is_not_a_graduation_gate(db_session, test_user):
    """Tour có nút "Bỏ qua" — lấy nó làm cổng là tặng không một nhiệm vụ."""
    services, _ = await _enter_cap6(db_session, test_user.id)
    out = await services["cap6"].mark_tour_mauthuan(test_user.id)
    assert out["da_xem_tour_mauthuan"] is True
    assert out["dat_nhiem_vu"] is False
    with pytest.raises(ConflictError):
        await services["cap6"].graduate(test_user.id)


# ══════════════════════════════════════════════════════
# POST /cap6/kehoach — server tính lại 3 cờ
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_kehoach_ghi_nhan_dinh_va_server_tu_suy_3_co(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)
    await _seed_insight(db_session, "VCB", _P_VETO)
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="VCB", pct_von=8.0
    )

    kehoach = await services["cap6"].record_kehoach(
        test_user.id, buy.id, conflict_level="nghiem"
    )
    assert kehoach.conflict_level == "nghiem"
    assert kehoach.had_conflict is True
    assert kehoach.had_veto is True
    assert kehoach.veto_layers == ["tin_tuc"]
    # Cộng dồn: Cấp 6 THÊM một khối, không thay khối nào của Cấp 1-4.
    assert kehoach.vung_mua == 20_000
    assert kehoach.cat_lo == 18_000
    assert kehoach.pct_von == 8.0

    out = services["cap6"].kehoach_out(kehoach)
    assert out["conflict_level_ten"] == "Nghiêm trọng"
    assert out["veto_layers_ten"] == ["Tin tức"]
    assert out["khoi_luong_pct_von"] == 8.0
    assert out["muc_tu_tin"] == 3
    assert out["nhat_quan"] is True


@pytest.mark.asyncio
async def test_kehoach_ma_chua_cham_duoc_de_3_co_o_NULL_khong_phai_False(
    db_session, test_user
):
    """★ "hệ chưa có dữ liệu về mã này" và "hệ đã kiểm, mã này không mâu thuẫn"
    là hai câu khác hẳn — và cái sau là câu ta chưa có quyền nói."""
    services, account = await _enter_cap6(db_session, test_user.id)
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="NOAI"
    )
    kehoach = await services["cap6"].record_kehoach(
        test_user.id, buy.id, conflict_level="nghiem"
    )
    assert kehoach.had_conflict is None
    assert kehoach.had_veto is None
    assert kehoach.veto_layers is None
    assert services["cap6"].kehoach_out(kehoach)["nhat_quan"] is None


@pytest.mark.asyncio
async def test_kehoach_khong_mau_thuan_van_ghi_duoc_nhung_khong_duoc_dem(
    db_session, test_user
):
    """Điều kiện hiện bảng là luật GIAO DIỆN (spec §5.1); 4xx ở đây chỉ biến một
    lần tự soi vô hại thành luồng gãy. Lệnh đó đơn giản không vào cổng."""
    services, account = await _enter_cap6(db_session, test_user.id)
    await _seed_insight(db_session, "THUAN", _P_THUAN)
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="THUAN", pct_von=5.0
    )
    kehoach = await services["cap6"].record_kehoach(
        test_user.id, buy.id, conflict_level="nghiem"
    )
    assert kehoach.had_conflict is False
    assert services["cap6"].kehoach_out(kehoach)["nhat_quan"] is None

    prog = await services["cap6"].get_progress(test_user.id)
    assert prog["so_lan_xu_ly_nhat_quan"] == 0


@pytest.mark.asyncio
async def test_kehoach_validates_and_requires_a_buy_with_a_cap1_plan(
    db_session, test_user
):
    services, account = await _enter_cap6(db_session, test_user.id)

    buy = await _buy_with_plan(db_session, services, account.id, test_user.id, symbol="AAA")
    with pytest.raises(BadRequestError):
        await services["cap6"].record_kehoach(test_user.id, buy.id, conflict_level="rat_nghiem")
    with pytest.raises(BadRequestError):
        await services["cap6"].record_kehoach(test_user.id, buy.id, conflict_level=None)

    with pytest.raises(NotFoundError):
        await services["cap6"].record_kehoach(
            test_user.id, _uuid.uuid4(), conflict_level="nhe"
        )

    sell = await _make_order(
        db_session, account.id, test_user.id, symbol="AAA", side=OrderSide.SELL
    )
    with pytest.raises(BadRequestError):
        await services["cap6"].record_kehoach(test_user.id, sell.id, conflict_level="nhe")

    # Lệnh mua chưa có kế hoạch Cấp 1 nào ⇒ 404 (không tự dựng hàng rỗng).
    tron = await _make_order(db_session, account.id, test_user.id, symbol="BBB")
    with pytest.raises(NotFoundError):
        await services["cap6"].record_kehoach(test_user.id, tron.id, conflict_level="nhe")


@pytest.mark.asyncio
async def test_kehoach_404_cho_lenh_cua_nguoi_khac(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)
    other, other_account = await _second_user(db_session)
    other_buy = await _make_order(db_session, other_account.id, other.id, symbol="AAA")
    with pytest.raises(NotFoundError):
        await services["cap6"].record_kehoach(
            test_user.id, other_buy.id, conflict_level="nhe"
        )


# ══════════════════════════════════════════════════════
# ★★ Khoá chống bịa tiến độ (spec §11 + luật repo #3)
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_khoa_chan_ca_lan_ghi_DAU_TIEN_sau_khi_da_biet_gia(db_session, test_user):
    """★★★ ĐÂY LÀ CHỖ CẤP 7 TỪNG SAI.

    Khoá chống back-fill nằm nhầm TRONG nhánh ``if ... is not None`` nên chỉ
    chạy khi POST LẦN HAI. Không ghi nhận định lúc mua là hợp lệ (bảng chỉ hiện
    khi 5 lớp thật sự mâu thuẫn) ⇒ khoá chỉ chặn "sửa" để hở nguyên lỗ: đặt
    lệnh, đợi hết phiên, nhìn giá rồi mới POST mức khớp ý.

    Lệnh dưới đây CHƯA TỪNG có ``conflict_level``.
    """
    services, account = await _enter_cap6(db_session, test_user.id)
    await _seed_insight(db_session, "VCB", _P_VETO)
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="VCB", pct_von=8.0
    )
    _age_order(buy, minutes=int(CUA_SO_CHOT_NHAN_DINH.total_seconds() // 60) + 5)
    await db_session.flush()

    kehoach = await services["cap6"]._get_kehoach_by_order(buy.id)
    assert kehoach.conflict_level is None  # chưa ghi lần nào

    with pytest.raises(ConflictError, match="chốt TRƯỚC khi bạn biết giá"):
        await services["cap6"].record_kehoach(test_user.id, buy.id, conflict_level="nhe")

    await db_session.refresh(kehoach)
    assert kehoach.conflict_level is None
    assert kehoach.had_conflict is None


@pytest.mark.asyncio
async def test_khoa_cung_chan_viec_SUA_nhan_dinh_sau_cua_so(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)
    await _seed_insight(db_session, "VCB", _P_VETO)
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="VCB", pct_von=8.0
    )
    await services["cap6"].record_kehoach(test_user.id, buy.id, conflict_level="nghiem")

    _age_order(buy, minutes=int(CUA_SO_CHOT_NHAN_DINH.total_seconds() // 60) + 5)
    await db_session.flush()

    with pytest.raises(ConflictError):
        await services["cap6"].record_kehoach(test_user.id, buy.id, conflict_level="nhe")

    kehoach = await services["cap6"]._get_kehoach_by_order(buy.id)
    assert kehoach.conflict_level == "nghiem"


@pytest.mark.asyncio
async def test_post_y_het_lan_truoc_la_no_op_ke_ca_sau_cua_so(db_session, test_user):
    """Một cú gọi lại do mạng KHÔNG BAO GIỜ được thành 409."""
    services, account = await _enter_cap6(db_session, test_user.id)
    await _seed_insight(db_session, "VCB", _P_VETO)
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="VCB", pct_von=8.0
    )
    await services["cap6"].record_kehoach(test_user.id, buy.id, conflict_level="nghiem")

    lai = await services["cap6"].record_kehoach(
        test_user.id, buy.id, conflict_level="nghiem"
    )
    assert lai.conflict_level == "nghiem"

    _age_order(buy, minutes=int(CUA_SO_CHOT_NHAN_DINH.total_seconds() // 60) + 5)
    await db_session.flush()
    sau = await services["cap6"].record_kehoach(
        test_user.id, buy.id, conflict_level="nghiem"
    )
    assert sau.conflict_level == "nghiem"


@pytest.mark.asyncio
async def test_lenh_chua_khop_van_sua_nhan_dinh_thoai_mai(db_session, test_user):
    """Panel là cái form user quay lại được, và lệnh chưa khớp thì chưa có vị thế
    nào để nhìn giá mà bịa."""
    services, account = await _enter_cap6(db_session, test_user.id)
    await _seed_insight(db_session, "VCB", _P_VETO)
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="VCB",
        pct_von=8.0, status=OrderStatus.PENDING,
    )
    _age_order(buy, minutes=60 * 24 * 7)
    await db_session.flush()

    kehoach = await services["cap6"].record_kehoach(
        test_user.id, buy.id, conflict_level="nghiem"
    )
    assert kehoach.conflict_level == "nghiem"
    kehoach = await services["cap6"].record_kehoach(
        test_user.id, buy.id, conflict_level="nhe"
    )
    assert kehoach.conflict_level == "nhe"


# ══════════════════════════════════════════════════════
# POST /cap6/skip — «Không mua lần này»
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_skip_ghi_nhan_dung_ngoai_va_lay_nhan_dinh_lam_ly_do(db_session, test_user):
    services, _ = await _enter_cap6(db_session, test_user.id)
    await _seed_insight(db_session, "VCB", _P_VETO)

    out = await services["cap6"].skip(test_user.id, "vcb", conflict_level="nghiem")
    assert out["symbol"] == "VCB"
    assert out["conflict_level"] == "nghiem"
    assert out["conflict_level_ten"] == "Nghiêm trọng"
    assert out["had_conflict"] is True  # ★ SERVER tính, không hỏi client
    assert out["had_veto"] is True

    rows = (
        (await db_session.execute(select(Cap6Skip).where(Cap6Skip.user_id == test_user.id)))
        .scalars()
        .all()
    )
    assert len(rows) == 1
    # ★ Cách nhẹ (spec §7/§13): KHÔNG có cột kết quả, không theo dõi giá sau đó.
    assert not hasattr(rows[0], "ket_qua")
    assert not hasattr(rows[0], "gia_luc_dung_ngoai")


@pytest.mark.asyncio
async def test_skip_cung_ma_hai_lan_la_HAI_quyet_dinh(db_session, test_user):
    """Khối ⑮ đếm "N lần đứng ngoài", không đếm "N mã"."""
    services, _ = await _enter_cap6(db_session, test_user.id)
    await services["cap6"].skip(test_user.id, "VCB", conflict_level="nghiem")
    await services["cap6"].skip(test_user.id, "VCB", conflict_level="nghiem")

    pt = await services["cap6"].phan_tich(test_user.id)
    assert pt["khoi_15"]["so_lan_khong_mua"] == 2
    assert pt["khoi_15"]["so_lan_nghiem_khong_mua"] == 2


@pytest.mark.asyncio
async def test_ba_cu_bam_khong_mua_tren_ma_KHONG_mau_thuan_khong_mo_duoc_cong(
    db_session, test_user
):
    """★★★ LỖ CỔNG THẬT — đã dựng lại được trước khi vá.

    Mã dưới đây CHỈ có 📰 Tin tức «Rất tiêu cực»: phủ quyết ĐANG kích hoạt,
    nhưng KHÔNG có lớp ủng hộ nào ⇒ **không có mâu thuẫn** (spec §5.1), nên
    không có bảng mâu thuẫn, không có ô nhận định, không có nút «Không mua».

    Trước khi vá: 3 cú bấm (miễn phí — không lệnh, không vị thế, không rủi ro)
    cho ``nhat_quan=3``, ``veto=3`` và tốt nghiệp ngay. Luật đếm của spec §11 mở
    đầu bằng "đếm +1 khi một lệnh **CÓ MÂU THUẪN**" — nên ``cap6_skip`` phải lưu
    ``had_conflict`` (cột này KHÔNG có trong danh sách §11) và cổng phải đòi nó.
    """
    services, _ = await _enter_cap6(db_session, test_user.id)
    await _seed_insight(db_session, "BAD", _payload(L5="Rất tiêu cực"))

    bang = await services["cap6"].mau_thuan(test_user.id, "BAD")
    assert bang["co_mau_thuan"] is False  # …
    assert bang["phu_quyet_kich_hoat"] is True  # …nhưng phủ quyết VẪN kích hoạt

    for _ in range(3):
        out = await services["cap6"].skip(test_user.id, "BAD", conflict_level="nghiem")
    assert out["had_conflict"] is False
    assert out["had_veto"] is True  # ★ cờ veto một mình KHÔNG đủ để đếm

    prog = await services["cap6"].get_progress(test_user.id)
    assert prog["so_lan_xu_ly_nhat_quan"] == 0
    assert prog["so_lan_xu_ly_veto_nhat_quan"] == 0
    assert prog["dat_nhiem_vu"] is False
    with pytest.raises(ConflictError):
        await services["cap6"].graduate(test_user.id)

    # Nhật ký vẫn ghi đủ 3 lần — khối ⑮ là nhật ký hành vi, không phải cổng.
    assert (await services["cap6"].phan_tich(test_user.id))["khoi_15"][
        "so_lan_khong_mua"
    ] == 3


@pytest.mark.asyncio
async def test_bam_lai_cung_ma_cung_phien_chi_dem_MOT_lan_cho_cong(
    db_session, test_user
):
    """★★ Bấm «Không mua» là miễn phí ⇒ ba cú bấm cùng mã cùng phiên là MỘT
    tình huống đứng ngoài, không phải ba.

    Nếu không gộp, cổng ≥3 lần mở bằng đúng một mã có mâu thuẫn + ba cú bấm.
    Nhật ký (khối ⑮) vẫn đếm THÔ — ở đó con số là hành vi để user nhìn lại.
    """
    services, _ = await _enter_cap6(db_session, test_user.id)
    await _seed_insight(db_session, "VCB", _P_VETO)
    for _ in range(3):
        await services["cap6"].skip(test_user.id, "VCB", conflict_level="nghiem")

    prog = await services["cap6"].get_progress(test_user.id)
    assert prog["so_lan_xu_ly_nhat_quan"] == 1
    assert prog["so_lan_xu_ly_veto_nhat_quan"] == 1
    assert (await services["cap6"].phan_tich(test_user.id))["khoi_15"][
        "so_lan_khong_mua"
    ] == 3

    # ★ NEO DƯƠNG TÍNH: cùng mã nhưng PHIÊN KHÁC thì đúng là hai tình huống.
    rows = (
        (await db_session.execute(select(Cap6Skip).where(Cap6Skip.user_id == test_user.id)))
        .scalars()
        .all()
    )
    rows[0].at = datetime.now(UTC) - timedelta(days=3)
    await db_session.flush()
    prog = await services["cap6"].get_progress(test_user.id)
    assert prog["so_lan_xu_ly_nhat_quan"] == 2
    assert prog["so_lan_xu_ly_veto_nhat_quan"] == 2

    # …và mã KHÁC trong cùng phiên cũng vậy.
    await _seed_insight(db_session, "HPG", _P_VETO)
    await services["cap6"].skip(test_user.id, "HPG", conflict_level="nghiem")
    prog = await services["cap6"].get_progress(test_user.id)
    assert prog["so_lan_xu_ly_nhat_quan"] == 3


@pytest.mark.asyncio
async def test_skip_ma_chua_cham_duoc_de_had_veto_NULL(db_session, test_user):
    services, _ = await _enter_cap6(db_session, test_user.id)
    out = await services["cap6"].skip(test_user.id, "ZZZ", conflict_level="nghiem")
    assert out["had_veto"] is None  # ★ ≠ "đã kiểm và không có phủ quyết"
    assert out["had_conflict"] is None  # ★ ≠ "đã kiểm, mã này không mâu thuẫn"
    prog = await services["cap6"].get_progress(test_user.id)
    assert prog["so_lan_xu_ly_nhat_quan"] == 0  # None không bao giờ đếm


@pytest.mark.asyncio
async def test_skip_validates(db_session, test_user):
    cap6 = Cap6Service(db_session)
    with pytest.raises(NotFoundError):
        await cap6.skip(test_user.id, "VCB", conflict_level="nghiem")

    services, _ = await _enter_cap6(db_session, test_user.id)
    with pytest.raises(BadRequestError):
        await services["cap6"].skip(test_user.id, "VCB", conflict_level="rat_nghiem")
    with pytest.raises(BadRequestError):
        await services["cap6"].skip(test_user.id, "  ", conflict_level="nghiem")


# ══════════════════════════════════════════════════════
# ★ Luật đếm "xử lý nhất quán" (spec §2/§11)
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_nghiem_mua_nho_duoc_dem_nghiem_mua_lon_thi_KHONG(db_session, test_user):
    """★★ ĐÂY LÀ CÁI BẪY CẤP 6 DẠY.

    "Đắn đo trong đầu mà tay vẫn mua lớn" = nhận định thành vô nghĩa. Ngưỡng
    "mua nhỏ" dùng LẠI trần khẩu vị Thận trọng của Cấp 3 — cả repo một con số.
    """
    services, account = await _enter_cap6(db_session, test_user.id)

    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="NHO", payload=_P_VETO, muc="nghiem", pct_von=NGUONG_MUA_NHO_PCT,
    )
    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="LON", payload=_P_VETO, muc="nghiem", pct_von=NGUONG_MUA_NHO_PCT + 0.1,
    )

    prog = await services["cap6"].get_progress(test_user.id)
    assert prog["so_lan_xu_ly_nhat_quan"] == 1  # chỉ lệnh NHO
    assert prog["so_lan_xu_ly_veto_nhat_quan"] == 1


@pytest.mark.asyncio
async def test_nhe_vao_binh_thuong_duoc_dem_con_ngai_va_chua_ro_thi_khong(
    db_session, test_user
):
    """Spec §11 liệt kê ĐÚNG hai mẫu ✓. ``ngai``/``chua_ro`` không được đếm theo
    chiều nào — bịa thêm một luật cho hai mức spec để ngỏ sẽ vừa nới cổng vừa
    nói với user một chuẩn mực founder chưa duyệt."""
    services, account = await _enter_cap6(db_session, test_user.id)

    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="NHE", payload=_P_CONFLICT, muc="nhe", pct_von=25.0,
    )
    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="NGAI", payload=_P_CONFLICT, muc="ngai", pct_von=5.0,
    )
    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="CHUARO", payload=_P_CONFLICT, muc="chua_ro", pct_von=5.0,
    )

    prog = await services["cap6"].get_progress(test_user.id)
    assert prog["so_lan_xu_ly_nhat_quan"] == 1  # chỉ NHE


@pytest.mark.asyncio
async def test_skip_o_muc_nghiem_duoc_dem_o_muc_nhe_thi_khong(db_session, test_user):
    """«Không mua» ở mức nghiêm trọng là mẫu ✓ của spec §2. Đứng ngoài ở mức nhẹ
    KHÔNG bị tính là lệch — nó chỉ không phải mẫu spec đếm."""
    services, _ = await _enter_cap6(db_session, test_user.id)
    await _seed_insight(db_session, "AAA", _P_VETO)
    await _seed_insight(db_session, "BBB", _P_VETO)

    await services["cap6"].skip(test_user.id, "AAA", conflict_level="nghiem")
    await services["cap6"].skip(test_user.id, "BBB", conflict_level="nhe")

    prog = await services["cap6"].get_progress(test_user.id)
    assert prog["so_lan_xu_ly_nhat_quan"] == 1
    assert prog["so_lan_xu_ly_veto_nhat_quan"] == 1


@pytest.mark.asyncio
async def test_o_veto_la_TAP_CON_cua_o_nhat_quan(db_session, test_user):
    """Một lần chỉ vào ô veto khi CHÍNH NÓ đã được tính là nhất quán.

    Lệnh dưới đây có phủ quyết kích hoạt nhưng user đọc "nghiêm trọng" rồi mua
    lớn ⇒ không nhất quán ⇒ không được tính vào ô nào cả.
    """
    services, account = await _enter_cap6(db_session, test_user.id)
    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="BAY", payload=_P_VETO, muc="nghiem", pct_von=40.0,
    )
    prog = await services["cap6"].get_progress(test_user.id)
    assert prog["so_lan_xu_ly_nhat_quan"] == 0
    assert prog["so_lan_xu_ly_veto_nhat_quan"] == 0


@pytest.mark.asyncio
async def test_phu_quyet_bac_2_khong_nuoi_o_veto(db_session, test_user):
    """Spec §5.3: "tiêu cực nhẹ" (bậc 2) KHÔNG phải phủ quyết kích hoạt.

    Lệnh vẫn được tính nhất quán, nhưng KHÔNG được tính vào ô ≥2 lần.
    """
    services, account = await _enter_cap6(db_session, test_user.id)
    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="MILD", payload=_P_VETO_NHE, muc="nghiem", pct_von=5.0,
    )
    prog = await services["cap6"].get_progress(test_user.id)
    assert prog["so_lan_xu_ly_nhat_quan"] == 1
    assert prog["so_lan_xu_ly_veto_nhat_quan"] == 0


# ══════════════════════════════════════════════════════
# Cổng tốt nghiệp — THUẦN HÀNH VI
# ══════════════════════════════════════════════════════


async def _dat_cong(db_session, services, account, user_id, *, win: bool = True):
    """3 lần nhất quán, trong đó 2 lần có phủ quyết kích hoạt."""
    await _lenh_mau_thuan(
        db_session, services, account.id, user_id,
        symbol="VET1", payload=_P_VETO, muc="nghiem", pct_von=5.0, close=True, win=win,
    )
    await _lenh_mau_thuan(
        db_session, services, account.id, user_id,
        symbol="VET2", payload=_P_VETO, muc="nghiem", pct_von=5.0, close=True, win=win,
    )
    await _lenh_mau_thuan(
        db_session, services, account.id, user_id,
        symbol="NHE1", payload=_P_CONFLICT, muc="nhe", pct_von=20.0, close=True, win=win,
    )


@pytest.mark.asyncio
async def test_graduate_can_du_ca_hai_nguong(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)

    # 3 lần nhất quán nhưng CHỈ 1 lần có phủ quyết ⇒ chưa đủ.
    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="V1", payload=_P_VETO, muc="nghiem", pct_von=5.0,
    )
    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="N1", payload=_P_CONFLICT, muc="nhe", pct_von=20.0,
    )
    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="N2", payload=_P_CONFLICT, muc="nhe", pct_von=20.0,
    )
    prog = await services["cap6"].get_progress(test_user.id)
    assert (prog["so_lan_xu_ly_nhat_quan"], prog["so_lan_xu_ly_veto_nhat_quan"]) == (3, 1)
    with pytest.raises(ConflictError, match="phủ quyết"):
        await services["cap6"].graduate(test_user.id)

    # Thêm một lần có phủ quyết ⇒ đủ 3 và 2.
    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="V2", payload=_P_VETO, muc="nghiem", pct_von=5.0,
    )
    out = await services["cap6"].graduate(test_user.id)
    assert out["dat_nhiem_vu"] is True
    assert out["graduated_at"] is not None
    assert out["time_to_graduate_hours"] is not None


@pytest.mark.asyncio
async def test_graduate_khong_bao_gio_doc_lai(db_session, test_user):
    """★★★ Cổng THUẦN HÀNH VI (spec §2): "quyết định đúng vẫn có thể lỗ, và
    ngược lại; lãi phụ thuộc thị trường chứ không phải kỹ năng".

    User dưới đây LỖ mọi lệnh — và vẫn tốt nghiệp.
    """
    services, account = await _enter_cap6(db_session, test_user.id)
    await _dat_cong(db_session, services, account, test_user.id, win=False)

    prog = await services["cap6"].get_progress(test_user.id)
    assert prog["tong_lai_lenh_cap6_pct"] < 0  # lỗ thật, không phải None

    out = await services["cap6"].graduate(test_user.id)
    assert out["graduated_at"] is not None


@pytest.mark.asyncio
async def test_graduate_idempotent_giu_nguyen_moc(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)
    await _dat_cong(db_session, services, account, test_user.id)
    lan_1 = await services["cap6"].graduate(test_user.id)
    lan_2 = await services["cap6"].graduate(test_user.id)
    assert lan_1["graduated_at"] == lan_2["graduated_at"]


@pytest.mark.asyncio
async def test_graduate_requires_progress(db_session, test_user):
    with pytest.raises(NotFoundError):
        await Cap6Service(db_session).graduate(test_user.id)


# ══════════════════════════════════════════════════════
# Khối ⑭ — nhận định vs khối lượng (spec §9)
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_khoi_14_khop_ba_trang_thai_va_kl_null_khac_0(db_session, test_user):
    """★ ``kl_tb_pct_von = null`` ⇔ mức chưa có lệnh nào (≠ "mua 0% vốn").
    ★ ``khop = null`` = chưa so được — trả ``True`` ở đó là một lời khen user
    chưa kiếm được.
    """
    services, account = await _enter_cap6(db_session, test_user.id)
    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="A1", payload=_P_CONFLICT, muc="nhe", pct_von=20.0,
    )
    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="A2", payload=_P_VETO, muc="nghiem", pct_von=40.0,
    )

    khoi = (await services["cap6"].phan_tich(test_user.id))["khoi_14"]
    rows = {r["muc"]: r for r in khoi["rows"]}
    assert [r["muc"] for r in khoi["rows"]] == [*MUC_NANG_DAN, "chua_ro"]

    assert rows["nhe"]["kl_tb_pct_von"] == 20.0
    assert rows["nhe"]["khop"] is None  # mức nhẹ nhất — chưa có gì nhẹ hơn để so
    assert rows["nghiem"]["kl_tb_pct_von"] == 40.0
    assert rows["nghiem"]["khop"] is False  # ★ đọc nặng hơn mà mua NHIỀU hơn
    assert rows["ngai"]["so_lenh"] == 0
    assert rows["ngai"]["kl_tb_pct_von"] is None  # ★ KHÔNG phải 0.0
    assert rows["ngai"]["khop"] is None
    assert rows["chua_ro"]["khop"] is None  # không nằm trên thang nặng dần

    assert khoi["du_mau"] is True
    assert "đắn đo" in khoi["nhan_xet"]


@pytest.mark.asyncio
async def test_khoi_14_khen_khi_khoi_luong_giam_dan(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)
    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="B1", payload=_P_CONFLICT, muc="nhe", pct_von=25.0,
    )
    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="B2", payload=_P_VETO, muc="nghiem", pct_von=5.0,
    )
    khoi = (await services["cap6"].phan_tich(test_user.id))["khoi_14"]
    rows = {r["muc"]: r for r in khoi["rows"]}
    assert rows["nghiem"]["khop"] is True
    assert "khớp với nhận định" in khoi["nhan_xet"]


@pytest.mark.asyncio
async def test_khoi_14_mot_muc_thi_chua_du_mau_va_khong_noi_gi(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)
    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="C1", payload=_P_CONFLICT, muc="nhe", pct_von=20.0,
    )
    khoi = (await services["cap6"].phan_tich(test_user.id))["khoi_14"]
    assert khoi["du_mau"] is False
    assert khoi["nhan_xet"] is None  # ★ chưa đủ dữ liệu thì im, không bịa câu


@pytest.mark.asyncio
async def test_khoi_14_chi_soi_khoi_luong_khong_bao_gio_soi_cat_lo(db_session, test_user):
    """Spec §4.3/§9: cắt lỗ chỉ là chọn CÁCH TÍNH, không phản ánh mức thận trọng."""
    services, account = await _enter_cap6(db_session, test_user.id)
    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="D1", payload=_P_CONFLICT, muc="nhe", pct_von=20.0,
    )
    khoi = (await services["cap6"].phan_tich(test_user.id))["khoi_14"]
    van_ban = repr(khoi)
    for cam in ("cat_lo", "chot_loi", "cắt lỗ", "chốt lời"):
        assert cam not in van_ban, cam
    assert set(khoi["rows"][0]) == {"muc", "muc_ten", "so_lenh", "kl_tb_pct_von", "khop"}


# ══════════════════════════════════════════════════════
# Khối ⑮ — kết quả theo mức nhận định (spec §9)
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_khoi_15_ty_le_thang_can_du_mau_moi_duoc_noi(db_session, test_user):
    """★ Luật repo: dưới ``MIN_LENH_TY_LE_THANG`` lệnh đã đóng ⇒ ``null`` +
    ``du_mau=false``, KHÔNG phải 0%."""
    services, account = await _enter_cap6(db_session, test_user.id)

    for i in range(MIN_LENH_TY_LE_THANG - 1):
        await _lenh_mau_thuan(
            db_session, services, account.id, test_user.id,
            symbol=f"E{i}", payload=_P_CONFLICT, muc="nhe", pct_von=20.0,
            close=True, win=True,
        )
    rows = {
        r["muc"]: r
        for r in (await services["cap6"].phan_tich(test_user.id))["khoi_15"]["rows"]
    }
    assert rows["nhe"]["so_lenh"] == MIN_LENH_TY_LE_THANG - 1
    assert rows["nhe"]["du_mau"] is False
    assert rows["nhe"]["ty_le_thang_pct"] is None  # ★ KHÔNG phải 0.0 hay 100.0

    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="EZ", payload=_P_CONFLICT, muc="nhe", pct_von=20.0, close=True, win=False,
    )
    rows = {
        r["muc"]: r
        for r in (await services["cap6"].phan_tich(test_user.id))["khoi_15"]["rows"]
    }
    assert rows["nhe"]["du_mau"] is True
    assert rows["nhe"]["so_lenh"] == MIN_LENH_TY_LE_THANG
    assert rows["nhe"]["so_lenh_thang"] == MIN_LENH_TY_LE_THANG - 1
    assert rows["nhe"]["ty_le_thang_pct"] == pytest.approx(66.7)


@pytest.mark.asyncio
async def test_khoi_15_dem_so_lan_nghiem_khong_mua(db_session, test_user):
    """Dòng "Nghiêm trọng → không mua: N lần" của mockup + mẫu số thật."""
    services, _ = await _enter_cap6(db_session, test_user.id)
    await services["cap6"].skip(test_user.id, "AAA", conflict_level="nghiem")
    await services["cap6"].skip(test_user.id, "BBB", conflict_level="nghiem")
    await services["cap6"].skip(test_user.id, "CCC", conflict_level="ngai")

    khoi = (await services["cap6"].phan_tich(test_user.id))["khoi_15"]
    assert khoi["so_lan_nghiem_khong_mua"] == 2
    assert khoi["so_lan_khong_mua"] == 3
    assert khoi["so_lenh_toi_thieu"] == MIN_LENH_TY_LE_THANG
    assert "Đáng khen" in khoi["nhan_xet"]


@pytest.mark.asyncio
async def test_khoi_15_lenh_khong_mau_thuan_khong_vao_nhom_nao(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)
    await _lenh_mau_thuan(
        db_session, services, account.id, test_user.id,
        symbol="THUAN", payload=_P_THUAN, muc="nhe", pct_von=20.0, close=True, win=True,
    )
    khoi = (await services["cap6"].phan_tich(test_user.id))["khoi_15"]
    assert all(r["so_lenh"] == 0 for r in khoi["rows"])
    assert khoi["nhan_xet"] is None


@pytest.mark.asyncio
async def test_phan_tich_requires_progress(db_session, test_user):
    with pytest.raises(NotFoundError):
        await Cap6Service(db_session).phan_tich(test_user.id)


# ══════════════════════════════════════════════════════
# GET /cap6/kehoach/{order_id} — Kết sổ đọc lại (spec §8)
# ══════════════════════════════════════════════════════


async def _second_user(db_session, email: str = "other-cap6@example.com"):
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
async def test_get_kehoach_doc_lai_dung_thu_da_ghi(db_session, test_user):
    """★ Đọc THUẦN cột đã lưu — KHÔNG suy lại bảng mâu thuẫn theo phiên hiện tại.

    Bản AI Insight của mã đổi mỗi phiên; tính lại ở đây sẽ khiến Kết sổ kể một
    câu khác với câu đã chốt lúc mua.
    """
    services, account = await _enter_cap6(db_session, test_user.id)
    await _seed_insight(db_session, "VCB", _P_VETO)
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="VCB", pct_von=8.0
    )
    await services["cap6"].record_kehoach(test_user.id, buy.id, conflict_level="nghiem")

    # Phiên sau bản Insight đổi hẳn — Kết sổ vẫn phải kể câu đã chốt.
    row = (
        await db_session.execute(
            select(AIInsightHistory).where(AIInsightHistory.symbol == "VCB")
        )
    ).scalar_one()
    row.payload = _P_THUAN
    await db_session.flush()

    out = await services["cap6"].get_kehoach(test_user.id, buy.id)
    assert out["had_conflict"] is True
    assert out["had_veto"] is True
    assert out["veto_layers"] == ["tin_tuc"]
    assert out["conflict_level"] == "nghiem"
    assert out["nhat_quan"] is True
    # ★ Kết sổ CHỈ soi khối lượng + tự tin, KHÔNG nhắc cắt lỗ (§4.3).
    assert out["khoi_luong_pct_von"] == 8.0
    assert out["muc_tu_tin"] == 3
    assert "cat_lo" not in out and "chot_loi" not in out


@pytest.mark.asyncio
async def test_get_kehoach_404_cho_lenh_nguoi_khac_va_lenh_khong_co(db_session, test_user):
    services, account = await _enter_cap6(db_session, test_user.id)
    other, other_account = await _second_user(db_session)
    other_buy = await _make_order(db_session, other_account.id, other.id, symbol="AAA")

    with pytest.raises(NotFoundError):
        await services["cap6"].get_kehoach(test_user.id, other_buy.id)
    with pytest.raises(NotFoundError):
        await services["cap6"].get_kehoach(test_user.id, _uuid.uuid4())

    tron = await _make_order(db_session, account.id, test_user.id, symbol="BBB")
    with pytest.raises(NotFoundError):
        await services["cap6"].get_kehoach(test_user.id, tron.id)


# ══════════════════════════════════════════════════════
# BÀI MANG SANG — POST /cap1/ketso upsert cam_xuc
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_cap1_ketso_upserts_cam_xuc(db_session, test_user):
    """FE POST ``/cap1/ketso`` TRƯỚC khi mở modal Kết sổ (nên ``cam_xuc`` null),
    rồi POST lại kèm cảm xúc thật. Lần hai phải CẬP NHẬT đúng hàng đó."""
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

    first = await cap1.record_ketso(test_user.id, sell.id)
    assert first.cam_xuc is None
    assert first.pnl_vnd == 200_000

    second = await cap1.record_ketso(test_user.id, sell.id, cam_xuc="so")
    assert second.id == first.id
    assert second.cam_xuc.value == "so"
    assert second.pnl_vnd == 200_000
    assert second.gia_ra == 22_000

    with pytest.raises(ConflictError):
        await cap1.record_ketso(test_user.id, sell.id)
    await db_session.refresh(second)
    assert second.cam_xuc.value == "so"

    with pytest.raises(BadRequestError):
        await cap1.record_ketso(test_user.id, sell.id, cam_xuc="hoang_mang")


# ══════════════════════════════════════════════════════
# HTTP wiring
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_cap6_endpoints_wired_and_free(client, db_session, test_user):
    """Router gắn dưới /api/v1/cap6, gác bằng CurrentUser (KHÔNG phải premium).

    ★★ Bài này cũng ghim điều quan trọng nhất của tầng wire: client gửi kèm
    ``had_conflict``/``had_veto``/``veto_layers`` thì chúng bị BỎ — khai được
    "lệnh này có phủ quyết" là tự cấp cho mình điều kiện tốt nghiệp.
    """
    from app.core.security import create_access_token

    account = await _fast_track_cap5(db_session, test_user.id)
    await _seed_symbol(db_session, "VCB", icb_lv1="Ngân hàng", icb_lv2="Ngân hàng")
    await _seed_insight(db_session, "VCB", _P_VETO)
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
    assert body["so_lan_xu_ly_nhat_quan"] == 0
    assert body["muc_tieu_nhat_quan"] == 3
    assert body["muc_tieu_veto"] == 2
    assert body["tong_lai_lenh_cap6_pct"] is None

    r = await client.post("/api/v1/cap6/graduate", headers=headers)
    assert r.status_code == 409

    r = await client.get("/api/v1/cap6/mau-thuan/VCB", headers=headers)
    assert r.status_code == 200, r.text
    mbody = r.json()
    assert mbody["co_mau_thuan"] is True
    assert mbody["phu_quyet_kich_hoat"] is True
    assert mbody["nguoc"][0]["la_phu_quyet"] is True
    assert mbody["canh_bao"]

    r = await client.get("/api/v1/cap6/mau-thuan/ZZZZ", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["chua_du_du_lieu"] is True

    services = {
        "cap1": Cap1Service(db_session),
        "cap2": Cap2Service(db_session),
        "cap3": Cap3Service(db_session),
        "cap4": Cap4Service(db_session),
        "cap6": Cap6Service(db_session),
    }
    buy = await _buy_with_plan(
        db_session, services, account.id, test_user.id, symbol="VCB", pct_von=8.0
    )
    await db_session.commit()

    # Mức ngoài enum ⇒ 422 ở tầng schema.
    r = await client.post(
        "/api/v1/cap6/kehoach",
        headers=headers,
        json={"order_id": str(buy.id), "conflict_level": "rat_nghiem"},
    )
    assert r.status_code == 422, r.text

    # ★★ Client cố khai 3 cờ của server ⇒ bị BỎ, server tự tính lại.
    r = await client.post(
        "/api/v1/cap6/kehoach",
        headers=headers,
        json={
            "order_id": str(buy.id),
            "conflict_level": "nghiem",
            "had_conflict": True,
            "had_veto": True,
            "veto_layers": ["tin_tuc", "noi_bo"],
        },
    )
    assert r.status_code == 200, r.text
    kbody = r.json()
    assert kbody["had_veto"] is True
    assert kbody["veto_layers"] == ["tin_tuc"]  # ★ KHÔNG phải 2 lớp client khai
    assert kbody["nhat_quan"] is True
    await db_session.commit()

    r = await client.get(f"/api/v1/cap6/kehoach/{buy.id}", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["conflict_level_ten"] == "Nghiêm trọng"

    r = await client.get(f"/api/v1/cap6/kehoach/{_uuid.uuid4()}", headers=headers)
    assert r.status_code == 404, r.text

    r = await client.post(
        "/api/v1/cap6/skip",
        headers=headers,
        json={"symbol": "VCB", "conflict_level": "nghiem", "had_veto": False},
    )
    assert r.status_code == 201, r.text
    assert r.json()["had_veto"] is True  # ★ server tính, không nghe client
    await db_session.commit()

    r = await client.get("/api/v1/cap6/phan-tich", headers=headers)
    assert r.status_code == 200, r.text
    pbody = r.json()
    assert [row["muc"] for row in pbody["khoi_14"]["rows"]] == [*MUC_NANG_DAN, "chua_ro"]
    assert pbody["khoi_15"]["so_lan_nghiem_khong_mua"] == 1

    r = await client.post("/api/v1/cap6/tour-mauthuan", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["da_xem_tour_mauthuan"] is True

    r = await client.get("/api/v1/cap6/progress")
    assert r.status_code == 401


# ══════════════════════════════════════════════════════
# MIGRATION c7f1b9d34a80
# ══════════════════════════════════════════════════════

#: DDL kiểu-PROD dưới luật CŨ (revision ``1df8155bcd7c`` + ``7b3c1e5a9d24``),
#: tối giản đến đúng những cột migration này chạm tới.
_PROD_DDL = [
    """
    CREATE TABLE users (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        email VARCHAR(255) NOT NULL
    )
    """,
    """
    CREATE TABLE cap6_progress (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        entered_at TIMESTAMP NOT NULL,
        task_1_done_at TIMESTAMP,
        task_2_done_at TIMESTAMP,
        task_3_done_at TIMESTAMP,
        so_lenh_doi_chieu INTEGER NOT NULL DEFAULT 0,
        so_kieu_da_gap INTEGER NOT NULL DEFAULT 0,
        ty_le_thang_khop FLOAT,
        ty_le_thang_lech FLOAT,
        graduated_at TIMESTAMP,
        time_to_graduate_hours FLOAT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE order_kehoach (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        order_id VARCHAR(36) NOT NULL,
        vung_mua INTEGER NOT NULL,
        pct_von FLOAT,
        kieu_co_phieu VARCHAR(32),
        lop_mau_thuan JSON,
        trong_so_goi_y JSON,
        lop_quyet_dinh VARCHAR(32),
        khop_goi_y BOOLEAN,
        ly_do_doi_chieu TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
]

#: Mọi bảng revision này chạm tới — dùng cho snapshot cột.
_BANG_MIGRATION = ("cap6_progress", "cap6_skip", "order_kehoach")


def _load_migration():
    """Nạp module revision theo đường dẫn — ``alembic/versions`` không phải package."""
    import importlib.util
    from pathlib import Path

    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "c7f1b9d34a80_cap6_bac_thay_thay_doi_chieu.py"
    )
    spec = importlib.util.spec_from_file_location("_cap6_bacthay_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_migration(conn, direction: str) -> None:
    """Chạy đúng thân ``upgrade()``/``downgrade()`` THẬT trên ``conn``."""
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    module = _load_migration()
    with Operations.context(MigrationContext.configure(conn)):
        getattr(module, direction)()


def _cols(conn, table: str) -> list[str]:
    return [r[1] for r in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()]


def _notnull(conn, table: str) -> dict[str, int]:
    return {
        r[1]: r[3] for r in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
    }


def _rows(conn, table: str) -> dict[str, dict]:
    cols = _cols(conn, table)
    out: dict[str, dict] = {}
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

    ★ PROD kỳ vọng 0 dòng ``cap6_progress`` (trần cấp chưa mở tới Cấp 6). Nhưng
    "kỳ vọng" KHÔNG phải "chứng minh" — nên vẫn kiểm trên hàng kiểu-prod thật.
    """
    for stmt in _PROD_DDL:
        conn.exec_driver_sql(stmt)
    conn.exec_driver_sql("INSERT INTO users (id, email) VALUES ('u-tn1', 'a@x.vn')")
    conn.exec_driver_sql(
        """
        INSERT INTO cap6_progress (
            id, user_id, entered_at, task_1_done_at, task_2_done_at, task_3_done_at,
            so_lenh_doi_chieu, so_kieu_da_gap, ty_le_thang_khop, ty_le_thang_lech,
            graduated_at, time_to_graduate_hours
        ) VALUES (
            'tn1', 'u-tn1', '2026-01-01 00:00:00',
            '2026-01-01 01:00:00', '2026-01-01 02:00:00', '2026-01-01 03:00:00',
            22, 4, 61.5, 48.0,
            '2026-01-01 04:00:00', 4.0
        )
        """
    )
    conn.exec_driver_sql(
        """
        INSERT INTO cap6_progress (id, user_id, entered_at, so_lenh_doi_chieu)
        VALUES ('dd1', 'u-tn1', '2026-02-01 00:00:00', 6)
        """
    )
    conn.exec_driver_sql(
        """
        INSERT INTO order_kehoach (
            id, order_id, vung_mua, pct_von, kieu_co_phieu, lop_mau_thuan,
            trong_so_goi_y, lop_quyet_dinh, khop_goi_y, ly_do_doi_chieu
        ) VALUES (
            'kh1', 'o1', 20000, 20.0, 'ngan_hang', '{"ung_ho": ["ky_thuat"]}',
            '{"dinh_gia": 3}', 'dinh_gia', 1, 'P/B rẻ hơn ngành.'
        )
        """
    )


def test_migration_xoa_han_doi_chieu_va_khong_de_lai_cot_mo_coi():
    """★★ Cấp 6 cũ ra đi HẲN — không ô nào được ánh xạ sang ô mới.

    "Đã đối chiếu 22 lệnh theo bảng trọng số" không nói gì về "đọc mâu thuẫn
    đúng mức rồi hành động tương xứng". Và một cột không ai đọc còn nguy hiểm
    hơn: repo này từng ship một dòng đọc cột đã chết và in số bịa cả đợt deploy.
    """
    import sqlalchemy as sa

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_prod_shape(conn)
        _run_migration(conn, "upgrade")

        kh_cols = _cols(conn, "order_kehoach")
        for gone in ("kieu_co_phieu", "lop_mau_thuan", "trong_so_goi_y",
                     "lop_quyet_dinh", "khop_goi_y", "ly_do_doi_chieu"):
            assert gone not in kh_cols, gone
        for moi in ("had_conflict", "conflict_level", "had_veto", "veto_layers"):
            assert moi in kh_cols, moi

        cap6_cols = _cols(conn, "cap6_progress")
        for gone in ("task_1_done_at", "task_2_done_at", "task_3_done_at",
                     "so_lenh_doi_chieu", "so_kieu_da_gap",
                     "ty_le_thang_khop", "ty_le_thang_lech"):
            assert gone not in cap6_cols, gone
        for moi in ("so_lan_xu_ly_nhat_quan", "so_lan_xu_ly_veto_nhat_quan",
                    "tong_lai_lenh_cap6_pct", "da_xem_tour_mauthuan"):
            assert moi in cap6_cols, moi

        assert "cap6_skip" in _tables(conn)

        rows = _rows(conn, "cap6_progress")
        # ★ Mốc tốt nghiệp SỐNG qua migration: /cap7/enter gác trên đúng nó.
        assert rows["tn1"]["graduated_at"] == "2026-01-01 04:00:00"
        assert rows["tn1"]["entered_at"] == "2026-01-01 00:00:00"
        assert rows["tn1"]["time_to_graduate_hours"] == 4.0
        # Hai ô đếm mới: 0 là số THẬT (tính lại ở mọi lần đọc)…
        assert rows["tn1"]["so_lan_xu_ly_nhat_quan"] == 0
        assert rows["tn1"]["so_lan_xu_ly_veto_nhat_quan"] == 0
        # …còn tổng lãi thì NULL: "chưa có lệnh Cấp-6 nào đóng" ≠ "hoà vốn 0%".
        assert rows["tn1"]["tong_lai_lenh_cap6_pct"] is None
        assert rows["dd1"]["tong_lai_lenh_cap6_pct"] is None
        # ('false' là artifact của SQLite: nó lưu nguyên văn server_default cho
        # hàng đã tồn tại vì không có literal boolean. Prod là Postgres ⇒ false.)
        assert rows["tn1"]["da_xem_tour_mauthuan"] in (0, False, "false")

        kh = _rows(conn, "order_kehoach")["kh1"]
        # ★ Ba cờ server tính đều NULL cho lệnh cũ — KHÔNG phải False.
        assert kh["had_conflict"] is None
        assert kh["had_veto"] is None
        assert kh["veto_layers"] is None
        assert kh["conflict_level"] is None
        # Khối Cấp 1-3 không bị đụng.
        assert kh["vung_mua"] == 20000
        assert kh["pct_von"] == 20.0


def test_migration_moi_cot_diem_ty_le_moi_deu_nullable():
    """★ Luật repo: cột ĐIỂM/TỶ LỆ mới phải NULLABLE từ lúc sinh ra.

    Đọc thẳng ``PRAGMA table_info`` (cột 3 = notnull) nên không lách được bằng
    docstring. Hai ô ĐẾM ở cuối là NEO DƯƠNG TÍNH: nếu mọi cột đều đọc ra
    "nullable" thì bài này vô nghĩa.
    """
    import sqlalchemy as sa

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_prod_shape(conn)
        _run_migration(conn, "upgrade")

        cap6 = _notnull(conn, "cap6_progress")
        assert cap6["tong_lai_lenh_cap6_pct"] == 0, "tổng lãi phải nullable"

        kh = _notnull(conn, "order_kehoach")
        for col in ("had_conflict", "conflict_level", "had_veto", "veto_layers"):
            assert kh[col] == 0, f"order_kehoach.{col} phải nullable"

        skip = _notnull(conn, "cap6_skip")
        assert skip["had_veto"] == 0, "cap6_skip.had_veto phải nullable ba trạng thái"
        assert skip["had_conflict"] == 0, "cap6_skip.had_conflict phải nullable"

        # NEO DƯƠNG TÍNH — hai ô đếm NOT NULL DEFAULT 0 là ĐÚNG: 0 ở đó là số
        # thật, và cột định danh của cap6_skip cũng phải NOT NULL.
        assert cap6["so_lan_xu_ly_nhat_quan"] == 1
        assert cap6["so_lan_xu_ly_veto_nhat_quan"] == 1
        assert cap6["da_xem_tour_mauthuan"] == 1
        assert skip["conflict_level"] == 1
        assert skip["symbol"] == 1


def test_migration_cot_khop_dung_model():
    """``cap6_skip`` rỗng sau upgrade ⇒ ``_rows`` không bắt được lệch cột.

    Thiếu một cột trong ``create_table`` sẽ đi qua mọi assert khác — nên bảng
    mới cần lưới riêng này, so thẳng với model.
    """
    import sqlalchemy as sa

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_prod_shape(conn)
        _run_migration(conn, "upgrade")
        assert set(_cols(conn, "cap6_skip")) == {
            c.name for c in Cap6Skip.__table__.columns
        }
        assert set(_cols(conn, "cap6_progress")) == {
            c.name for c in Cap6Progress.__table__.columns
        }
        # ``order_kehoach`` chỉ được seed tối giản trong DDL kiểu-prod, nên chỉ
        # kiểm 4 cột Cấp 6 mà migration thêm vào — nhưng kiểm ĐỦ 4.
        assert {"had_conflict", "conflict_level", "had_veto", "veto_layers"} <= set(
            _cols(conn, "order_kehoach")
        )


def test_migration_round_trip_len_xuong_len_hai_vong():
    """upgrade → downgrade → upgrade → downgrade → upgrade là BẤT ĐỘNG.

    Downgrade LOSSY theo thiết kế (xem docstring revision): mọi dòng
    ``cap6_skip`` mất hẳn, 4 cột Cấp 6 trên ``order_kehoach`` mất hẳn (kể cả
    ``conflict_level`` — nhận định của chính user, không ai tính lại được), 6
    cột «Đối chiếu» quay lại RỖNG. Nhờ mọi ô hai chiều đều về NULL hoặc 0 xác
    định nên vòng thứ hai không trôi thêm.
    """
    import sqlalchemy as sa

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_prod_shape(conn)
        _run_migration(conn, "upgrade")

        # ★ Giả lập một user ĐÃ tiến bộ dưới luật MỚI (đúng thứ
        # ``_recompute_progress`` và ``record_kehoach`` ghi). Không có bước này
        # thì downgrade chỉ xoá toàn NULL và test không nói được gì.
        conn.exec_driver_sql(
            """
            UPDATE cap6_progress
               SET so_lan_xu_ly_nhat_quan = 3,
                   so_lan_xu_ly_veto_nhat_quan = 2,
                   tong_lai_lenh_cap6_pct = -4.5,
                   da_xem_tour_mauthuan = 1
             WHERE id = 'tn1'
            """
        )
        conn.exec_driver_sql(
            """
            UPDATE order_kehoach
               SET had_conflict = 1, conflict_level = 'nghiem', had_veto = 1,
                   veto_layers = '["tin_tuc"]'
             WHERE id = 'kh1'
            """
        )
        conn.exec_driver_sql(
            """
            INSERT INTO cap6_skip (
                id, user_id, symbol, at, conflict_level, had_conflict, had_veto,
                created_at, updated_at
            ) VALUES (
                'sk1', 'u-tn1', 'VCB', '2026-08-20 10:00:00', 'nghiem', 1, 1,
                '2026-08-20 10:00:00', '2026-08-20 10:00:00'
            )
            """
        )

        sau_lan_1 = _rows(conn, "cap6_progress")
        cols_lan_1 = {t: _cols(conn, t) for t in _BANG_MIGRATION}
        assert sau_lan_1["tn1"]["tong_lai_lenh_cap6_pct"] == -4.5
        assert _rows(conn, "cap6_skip")["sk1"]["conflict_level"] == "nghiem"

        _run_migration(conn, "downgrade")
        assert "cap6_skip" not in _tables(conn)
        down_kh = _rows(conn, "order_kehoach")["kh1"]
        for back in ("kieu_co_phieu", "lop_mau_thuan", "trong_so_goi_y",
                     "lop_quyet_dinh", "khop_goi_y", "ly_do_doi_chieu"):
            assert back in down_kh, back
            # LOSSY, và nói thẳng là lossy: 6 cột cũ quay lại RỖNG.
            assert down_kh[back] is None, back
        for gone in ("had_conflict", "conflict_level", "had_veto", "veto_layers"):
            assert gone not in down_kh, gone

        down = _rows(conn, "cap6_progress")
        assert down["tn1"]["so_lenh_doi_chieu"] == 0
        assert down["tn1"]["so_kieu_da_gap"] == 0
        # ★ Hai ô tỷ lệ quay lại đúng hình dạng của head cũ: FLOAT NULLABLE —
        # revision 7b3c1e5a9d24 đã gỡ NOT NULL DEFAULT 0 vì "chưa có lệnh đã
        # đóng" ≠ "thắng 0%"; downgrade không được lùi xa hơn thế.
        assert down["tn1"]["ty_le_thang_khop"] is None
        assert down["tn1"]["ty_le_thang_lech"] is None
        assert _notnull(conn, "cap6_progress")["ty_le_thang_khop"] == 0
        # Mốc tốt nghiệp sống qua CẢ HAI chiều.
        assert down["tn1"]["graduated_at"] == "2026-01-01 04:00:00"

        _run_migration(conn, "upgrade")
        lan_2 = _rows(conn, "cap6_progress")
        # Vòng lên lại: hai bộ đếm KHÔNG tự sống lại (đúng — chúng phải được
        # tính lại từ order_kehoach/cap6_skip), tổng lãi về NULL chứ không về 0.
        assert lan_2["tn1"]["so_lan_xu_ly_nhat_quan"] == 0
        assert lan_2["tn1"]["tong_lai_lenh_cap6_pct"] is None
        assert lan_2["tn1"]["graduated_at"] == "2026-01-01 04:00:00"
        assert _rows(conn, "cap6_skip") == {}
        sau_lan_1 = lan_2
        kh_lan_1 = _rows(conn, "order_kehoach")

        # ★ VÒNG THỨ HAI
        _run_migration(conn, "downgrade")
        _run_migration(conn, "upgrade")
        assert _rows(conn, "cap6_progress") == sau_lan_1
        assert _rows(conn, "order_kehoach") == kh_lan_1
        assert {t: _cols(conn, t) for t in _BANG_MIGRATION} == cols_lan_1
        assert "cap6_skip" in _tables(conn)


def test_migration_la_head_duy_nhat():
    """Một head duy nhất — hai head là một cây không deploy được."""
    from pathlib import Path

    import sqlalchemy as sa  # noqa: F401  (giữ import lỗi rõ ràng nếu thiếu)
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    root = Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    script = ScriptDirectory.from_config(cfg)

    # ★★ Canh SỐ LƯỢNG head, KHÔNG ghim tên head. Bản trước ghim
    # `== ["c7f1b9d34a80"]`, tức khẳng định "Cấp 6 là migration cuối cùng của
    # repo" — điều chỉ đúng trong lúc nhánh Cấp 6 còn đứng một mình. Cấp 2 rút
    # nhiệm vụ nối vào sau nó là bài đỏ ngay, dù cây hoàn toàn khoẻ. Thứ thật sự
    # đáng canh là "hai head = cây không deploy được", nên canh đúng thứ đó.
    assert len(script.get_heads()) == 1, f"nhiều head: {script.get_heads()}"

    # Migration Cấp 6 vẫn phải nằm TRONG chuỗi và giữ đúng cha của nó.
    rev = script.get_revision("c7f1b9d34a80")
    assert rev.down_revision == "b2e6f4a17c93"


def test_service_khong_con_nhac_ten_cot_nao_cua_cap6_cu():
    """★ Không cột mồ côi, và cũng không CODE mồ côi.

    Lớp lỗi này là "một dòng đọc cột đã chết và in số bịa". Bài này đọc văn bản
    nguồn của cả 3 file Cấp 6 nên nó cắn cả khi cột đã bị drop trong migration
    mà một truy vấn vẫn còn tên đó.
    """
    from pathlib import Path

    root = Path(__file__).resolve().parents[1] / "app"
    files = [
        root / "services" / "cap6" / "service.py",
        root / "services" / "cap6" / "mau_thuan.py",
        root / "api" / "v1" / "endpoints" / "cap6.py",
        root / "schemas" / "cap6.py",
    ]
    cam = ("kieu_co_phieu", "trong_so_goi_y", "lop_quyet_dinh", "khop_goi_y",
           "ly_do_doi_chieu", "so_lenh_doi_chieu", "so_kieu_da_gap",
           "ty_le_thang_khop", "ty_le_thang_lech", "KIEU_CO_PHIEU")
    for path in files:
        src = path.read_text(encoding="utf-8")
        # Docstring được phép NHẮC tên cũ để kể chuyện nghỉ hưu; code thì không.
        code = "\n".join(
            line for line in src.splitlines() if not line.lstrip().startswith(("#", "·"))
        )
        for ten in cam:
            assert f"{ten}=" not in code, f"{path.name} còn dùng {ten}"
            assert f".{ten}" not in code, f"{path.name} còn đọc .{ten}"
    # NEO DƯƠNG TÍNH: tên MỚI thì phải có mặt.
    svc = (root / "services" / "cap6" / "service.py").read_text(encoding="utf-8")
    assert ".conflict_level" in svc and ".had_veto" in svc


def test_muc_mau_thuan_enum_khop_wire():
    """4 mức của spec §6 — và ``chua_ro`` cố ý ĐỨNG NGOÀI thang nặng dần."""
    assert [m.value for m in MucMauThuan] == ["nhe", "ngai", "nghiem", "chua_ro"]
    assert MUC_NANG_DAN == ("nhe", "ngai", "nghiem")
    assert MucMauThuan.CHUA_RO.value not in MUC_NANG_DAN
