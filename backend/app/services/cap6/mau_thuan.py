"""Máy phát hiện MÂU THUẪN giữa 5 lớp cho một mã (Cấp 6 «Bậc thầy», spec §5).

Ở đây KHÔNG gọi AI: hàm dưới đây chỉ ĐỌC LẠI bản AI Insight đã lưu cho mã đó
(``ai_insight_history``) — đúng nguồn, đúng cửa sổ hiệu lực và đúng bộ nhãn 5
bậc mà Cấp 5 đã kiểm (``app.services.cap5.consensus``). Spec §11 nói thẳng:
"KHÔNG chạy cho mã user chưa từng xem" — mã chưa có bản Insight ⇒ **"chưa đủ dữ
liệu"**, KHÔNG phải một bảng mâu thuẫn rỗng.

═══════════════════════════════════════════════════════════════════
★ HAI PHE + THANG 5 BẬC (spec §5.1/§5.3)
═══════════════════════════════════════════════════════════════════

  · **Ủng hộ** = lớp ở bậc **4-5** (Mạnh/Rất mạnh · Hỗ trợ nhẹ/mạnh · Tích
    cực/Rất tích cực).
  · **Ngược chiều** = lớp ở bậc **1-2**.
  · **Trung tính** = bậc **3** — KHÔNG được vẽ vào phe nào (một lớp không ý
    kiến không phải một lớp phản đối; đây đúng là lỗi Cấp 5 đã sửa).
  · **Chưa chấm được** = không có nhãn hợp lệ ⇒ không vào phe nào, và cũng
    KHÔNG bị đếm là trung tính.

``co_mau_thuan`` ⇔ có ≥1 lớp ủng hộ VÀ ≥1 lớp ngược chiều (spec §5.1).

═══════════════════════════════════════════════════════════════════
★★ PHỦ QUYẾT: "thuộc nhóm phủ quyết" ≠ "đang kích hoạt"
═══════════════════════════════════════════════════════════════════

Hai khái niệm khác nhau, và wire mang CẢ HAI vì chúng KHÔNG thay thế được nhau:

  · ``la_phu_quyet`` (trên từng dòng phe ngược) = lớp này **thuộc nhóm có quyền
    phủ quyết** (📰 Tin tức · 👤 Nội bộ). Đây là thuộc tính của LỚP, không phụ
    thuộc bậc — nó quyết định cái tag đỏ "PHỦ QUYẾT" trong mockup.
  · ``lop_phu_quyet_xau`` / ``phu_quyet_kich_hoat`` = trong số đó, lớp nào đang
    ở **BẬC THẤP NHẤT (bậc 1)**. Spec §5.3: ở mức chỉ "tiêu cực nhẹ" (bậc 2)
    thì **KHÔNG** coi là phủ quyết kích hoạt — nó chỉ là điểm trừ.

Chỉ ``phu_quyet_kich_hoat`` mới nuôi ``had_veto`` và cổng ≥2 lần của spec §2.

═══════════════════════════════════════════════════════════════════
BẢN KIỂM DỮ LIỆU — 💎 Định giá KHÔNG CÓ NGUỒN
═══════════════════════════════════════════════════════════════════

AI Insight v2 không có lớp Định giá (L2 là Thanh khoản — ánh xạ L2 → định giá
là bịa). Xem bản kiểm đầy đủ ở đầu ``app.services.cap5.consensus``. Hệ quả:
lớp 💎 Định giá LUÔN ở trạng thái "chưa chấm được", không bao giờ vào phe nào,
và mọi mã chỉ chấm được tối đa 4/5 lớp. ``so_lop_da_cham`` vì thế luôn đi kèm
kết quả để người đọc biết mẫu số thật.

★ Ngưỡng "chưa đủ dữ liệu" là ``so_lop_da_cham == 0`` (không phải "< 5"): đòi
đủ 5 lớp thì mọi mã đều "chưa đủ" vĩnh viễn vì lớp Định giá không có nguồn.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_insight_history import AIInsightHistory
from app.models.cap4 import LOP_KEYS
from app.models.cap6 import LOP_PHU_QUYET, lop_ten
from app.services.cap5.consensus import (
    LOP_TO_AI_LAYER,
    NHAN_KHONG_UNG_HO,
    NHAN_NGUOC_CHIEU,
    NHAN_UNG_HO,
    hom_nay_vn,
    ngay_som_nhat_con_hieu_luc,
)

#: Thang 5 bậc của từng lớp AI Insight, **xếp từ XẤU NHẤT (bậc 1) đến TỐT NHẤT
#: (bậc 5)**. Nguồn nhãn: AI-Insight-v2-tech-spec §2.2, đã được Cấp 5 kiểm.
#:
#: ★ Thứ tự ở đây là thứ TỰ THẬT chứ không phải trang trí: ``bac == 1`` là điều
#: kiện kích hoạt phủ quyết (spec §5.3 "bậc thấp nhất"), nên đảo hai phần tử là
#: đổi hẳn cổng tốt nghiệp. ``_assert_thang_bac`` dưới đây khoá nó vào đúng 3
#: bảng nhãn của ``app.services.cap5.consensus``.
THANG_BAC: dict[str, tuple[str, ...]] = {
    "L1": ("Rất yếu", "Yếu", "Trung bình", "Mạnh", "Rất mạnh"),
    "L3": ("Cảnh báo mạnh", "Cảnh báo nhẹ", "Trung tính", "Hỗ trợ nhẹ", "Hỗ trợ mạnh"),
    "L4": ("Cảnh báo mạnh", "Cảnh báo nhẹ", "Trung tính", "Hỗ trợ nhẹ", "Hỗ trợ mạnh"),
    "L5": ("Rất tiêu cực", "Tiêu cực", "Trung tính", "Tích cực", "Rất tích cực"),
}

#: Nhãn ĐỒNG NGHĨA ở cùng một bậc (AI trả cả hai chữ cho bậc giữa của L1).
BAC_DONG_NGHIA: dict[str, dict[str, int]] = {"L1": {"Bình thường": 3}}

#: Bậc coi là "ủng hộ" / "ngược chiều" (spec §5.1).
BAC_UNG_HO = (4, 5)
BAC_NGUOC_CHIEU = (1, 2)
#: Bậc kích hoạt phủ quyết — **bậc thấp nhất** (spec §5.3, "CẦN FOUNDER DUYỆT"
#: §12.3).
BAC_PHU_QUYET_KICH_HOAT = 1

PHE_UNG_HO = "ung_ho"
PHE_NGUOC = "nguoc"
PHE_TRUNG_TINH = "trung_tinh"


def _bac_map(layer_key: str) -> dict[str, int]:
    out = {nhan: i + 1 for i, nhan in enumerate(THANG_BAC[layer_key])}
    out.update(BAC_DONG_NGHIA.get(layer_key, {}))
    return out


_BAC: dict[str, dict[str, int]] = {k: _bac_map(k) for k in THANG_BAC}


def _assert_thang_bac() -> None:
    """Khoá ``THANG_BAC`` vào 3 bảng nhãn của Cấp 5 — fail ngay lúc import.

    Ba chiều kiểm, mỗi chiều bắt một kiểu trôi khác nhau:
      · bậc 4-5 phải ĐÚNG BẰNG tập "ủng hộ" của Cấp 5;
      · bậc 1-2 phải ĐÚNG BẰNG tập "ngược chiều";
      · bậc 1-3 (kể cả nhãn đồng nghĩa) phải ĐÚNG BẰNG tập "không ủng hộ".
    Không có nó, đổi một nhãn ở ``consensus`` sẽ âm thầm biến một lớp xấu thành
    "chưa chấm được" ở đây — và một lệnh có phủ quyết sẽ không còn được đếm.
    """
    for layer_key, thang in THANG_BAC.items():
        if len(thang) != 5 or len(set(thang)) != 5:
            raise RuntimeError(f"cap6: thang bậc {layer_key} phải có đúng 5 bậc phân biệt")
        bac = _BAC[layer_key]
        ung_ho = {n for n, b in bac.items() if b in BAC_UNG_HO}
        nguoc = {n for n, b in bac.items() if b in BAC_NGUOC_CHIEU}
        khong_ung_ho = {n for n, b in bac.items() if b not in BAC_UNG_HO}
        if ung_ho != set(NHAN_UNG_HO.get(layer_key, frozenset())):
            raise RuntimeError(f"cap6: bậc 4-5 của {layer_key} lệch bảng ủng hộ Cấp 5")
        if nguoc != set(NHAN_NGUOC_CHIEU.get(layer_key, frozenset())):
            raise RuntimeError(f"cap6: bậc 1-2 của {layer_key} lệch bảng ngược chiều Cấp 5")
        if khong_ung_ho != set(NHAN_KHONG_UNG_HO.get(layer_key, frozenset())):
            raise RuntimeError(f"cap6: bậc 1-3 của {layer_key} lệch bảng không-ủng-hộ Cấp 5")
    co_nguon = {lop for lop, k in LOP_TO_AI_LAYER.items() if k is not None}
    thieu = {LOP_TO_AI_LAYER[lop] for lop in co_nguon} - set(THANG_BAC)
    if thieu:
        raise RuntimeError(f"cap6: thiếu thang bậc cho lớp AI: {thieu}")


_assert_thang_bac()


def bac_cua_nhan(layer_key: str | None, nhan: object) -> int | None:
    """Bậc 1-5 của một nhãn trạng thái; ``None`` = chưa chấm được."""
    if layer_key is None or not isinstance(nhan, str):
        return None
    return _BAC.get(layer_key, {}).get(nhan.strip())


def _phe(bac: int | None) -> str | None:
    if bac is None:
        return None
    if bac in BAC_UNG_HO:
        return PHE_UNG_HO
    if bac in BAC_NGUOC_CHIEU:
        return PHE_NGUOC
    return PHE_TRUNG_TINH


@dataclass(frozen=True)
class MauThuanResult:
    """Bảng mâu thuẫn của một mã tại một phiên.

    ``chua_du_du_lieu is True`` ⇔ không chấm được lớp nào ⇒ mọi phe rỗng,
    ``co_mau_thuan``/``phu_quyet_kich_hoat`` đều False và ``canh_bao is None``.
    ★ Đó là một TRẠNG THÁI THẬT, không phải "0 mâu thuẫn".
    """

    co_mau_thuan: bool
    ung_ho: list[dict]
    nguoc: list[dict]
    trung_tinh: list[dict]
    phu_quyet_kich_hoat: bool
    lop_phu_quyet_xau: list[str]
    canh_bao: str | None
    chua_du_du_lieu: bool
    ly_do_chua_du: str | None
    so_lop_da_cham: int
    session_date: date | None = None


_LY_DO_CHUA_CO_BAN = (
    "Mã này chưa có bản phân tích 5 lớp nào, nên IQX chưa dựng được bảng mâu "
    "thuẫn. Mở «AI Phân tích» cho mã để có dữ liệu, rồi quay lại."
)


def _ly_do_qua_han(qua_han: date) -> str:
    return (
        f"Bản phân tích 5 lớp gần nhất của mã này là phiên "
        f"{qua_han.strftime('%d/%m/%Y')} — đã quá hạn dùng cho hôm nay, nên IQX "
        "chưa dựng được bảng mâu thuẫn cho phiên này."
    )


_LY_DO_KHONG_NHAN = (
    "Bản phân tích 5 lớp của mã này không có nhãn hợp lệ ở lớp nào, nên IQX "
    "chưa dựng được bảng mâu thuẫn."
)


def _canh_bao(
    ung_ho: list[dict], nguoc: list[dict], lop_phu_quyet_xau: list[str]
) -> str | None:
    """Câu cảnh báo SERVER dựng, FE in NGUYÊN VĂN (§C12c: không hiện số trơ).

    ★ Nó MÔ TẢ mâu thuẫn, không bao giờ phán mua/không mua (spec §4.1/§13).
    """
    if not (ung_ho and nguoc):
        return None
    ten_nguoc = " và ".join(f"{r['ten']} ({r['nhan']})" for r in nguoc)
    ten_ung_ho = " và ".join(f"{r['ten']} ({r['nhan']})" for r in ung_ho)
    if lop_phu_quyet_xau:
        so = len(lop_phu_quyet_xau)
        ten_veto = " và ".join(lop_ten(lop) for lop in lop_phu_quyet_xau)
        dau = (
            f"Có {so} lớp phủ quyết đang ở mức rất xấu."
            if so > 1
            else "Có 1 lớp phủ quyết đang ở mức rất xấu."
        )
        return (
            f"{dau} {ten_veto} đang ở bậc thấp nhất — nhóm lớp này khi rất xấu "
            f"có thể phủ định cả tín hiệu đẹp của {ten_ung_ho}. Đây là loại mâu "
            "thuẫn cần cân nhắc rất kỹ."
        )
    return (
        f"{len(ung_ho)} lớp đang ủng hộ ({ten_ung_ho}) nhưng {len(nguoc)} lớp "
        f"đang ngược chiều ({ten_nguoc}). Các lớp ngược chiều lần này đều thuộc "
        "nhóm điểm trừ — xấu thì bớt hấp dẫn, không phủ định các lớp còn lại."
    )


def _chua_du(ly_do: str) -> MauThuanResult:
    return MauThuanResult(
        co_mau_thuan=False,
        ung_ho=[],
        nguoc=[],
        trung_tinh=[],
        phu_quyet_kich_hoat=False,
        lop_phu_quyet_xau=[],
        canh_bao=None,
        chua_du_du_lieu=True,
        ly_do_chua_du=ly_do,
        so_lop_da_cham=0,
        session_date=None,
    )


def doc_tu_payload(payload: object, *, session_date: date | None = None) -> MauThuanResult:
    """Quy một payload AI Insight (raw ``ai_json``) về bảng mâu thuẫn 2 phe."""
    layers = payload if isinstance(payload, dict) else {}
    ung_ho: list[dict] = []
    nguoc: list[dict] = []
    trung_tinh: list[dict] = []
    lop_phu_quyet_xau: list[str] = []
    da_cham = 0

    for lop in LOP_KEYS:
        layer_key = LOP_TO_AI_LAYER.get(lop)
        nhan: object = None
        if layer_key is not None:
            layer = layers.get(layer_key)
            if isinstance(layer, dict):
                nhan = layer.get("statusLabel")
        bac = bac_cua_nhan(layer_key, nhan)
        phe = _phe(bac)
        if phe is None:
            # ★ Chưa chấm được — KHÔNG rơi vào trung tính (xem docstring module).
            continue
        da_cham += 1
        nhan_txt = str(nhan).strip()
        if phe == PHE_UNG_HO:
            ung_ho.append({"lop": lop, "ten": lop_ten(lop), "nhan": nhan_txt, "bac": bac})
        elif phe == PHE_NGUOC:
            la_phu_quyet = lop in LOP_PHU_QUYET
            nguoc.append(
                {
                    "lop": lop,
                    "ten": lop_ten(lop),
                    "nhan": nhan_txt,
                    "bac": bac,
                    # ★ Thuộc NHÓM phủ quyết — không phải "đang kích hoạt".
                    "la_phu_quyet": la_phu_quyet,
                }
            )
            if la_phu_quyet and bac == BAC_PHU_QUYET_KICH_HOAT:
                lop_phu_quyet_xau.append(lop)
        else:
            trung_tinh.append({"lop": lop, "ten": lop_ten(lop), "nhan": nhan_txt})

    if da_cham == 0:
        return _chua_du(_LY_DO_KHONG_NHAN)

    return MauThuanResult(
        co_mau_thuan=bool(ung_ho and nguoc),
        ung_ho=ung_ho,
        nguoc=nguoc,
        trung_tinh=trung_tinh,
        phu_quyet_kich_hoat=bool(lop_phu_quyet_xau),
        lop_phu_quyet_xau=lop_phu_quyet_xau,
        canh_bao=_canh_bao(ung_ho, nguoc, lop_phu_quyet_xau),
        chua_du_du_lieu=False,
        ly_do_chua_du=None,
        so_lop_da_cham=da_cham,
        session_date=session_date,
    )


class MauThuanSource:
    """Nguồn bảng mâu thuẫn đọc từ ``ai_insight_history`` (không gọi AI).

    Cửa sổ hiệu lực dùng LẠI ``SO_PHIEN_HIEU_LUC`` của Cấp 5 (qua
    ``ngay_som_nhat_con_hieu_luc``) — cả repo chỉ có MỘT luật "bản phân tích còn
    dùng được đến khi nào". Một bản 5 tháng tuổi mà vẫn dựng bảng mâu thuẫn cho
    hôm nay, cạnh một nút "Đặt lệnh", là gán tình trạng tháng Ba cho phiên này.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def doc(self, symbol: str, *, today: date | None = None) -> MauThuanResult:
        row = (
            await self._session.execute(
                select(AIInsightHistory)
                .where(AIInsightHistory.symbol == symbol.upper())
                .order_by(AIInsightHistory.session_date.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if row is None:
            return _chua_du(_LY_DO_CHUA_CO_BAN)
        som_nhat = ngay_som_nhat_con_hieu_luc(today or hom_nay_vn())
        if row.session_date is None:
            return _chua_du(_LY_DO_CHUA_CO_BAN)
        if row.session_date < som_nhat:
            return _chua_du(_ly_do_qua_han(row.session_date))
        return doc_tu_payload(row.payload, session_date=row.session_date)
