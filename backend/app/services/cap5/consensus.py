"""Điểm đồng thuận 5 lớp cho mã trong Watchlist (spec §6.1).

Chạy **1 lần/ngày sau phiên** (batch), KHÔNG tức thời — spec §10 "Chi phí AI".
Ở đây không gọi AI: hàm dưới đây chỉ ĐỌC LẠI bản AI Insight đã lưu cho mã đó
(``ai_insight_history``) và quy các nhãn trạng thái về "lớp này có ủng hộ
không". Mã chưa từng chạy Insight ⇒ chưa chấm được, không phải 0/5.

═══════════════════════════════════════════════════════════════════
BẢN KIỂM DỮ LIỆU — 5 lớp của chương trình vs 5 lớp của AI Insight
═══════════════════════════════════════════════════════════════════

5 lớp chương trình (``app.models.cap4.LOP_KEYS``) ↔ AI Insight v2 (L1-L5):

  · 🎯 ``ky_thuat``  ← **L1** (Xu hướng) ..... thang Rất yếu…Rất mạnh  ✅
  · 💰 ``dong_tien`` ← **L3** (Dòng tiền) .... thang Cảnh báo…Hỗ trợ   ✅
  · 👤 ``noi_bo``    ← **L4** (Nội bộ) ....... thang Cảnh báo…Hỗ trợ   ✅
  · 📰 ``tin_tuc``   ← **L5** (Tin tức) ...... thang Rất tiêu…Rất tích ✅
  · 💎 ``dinh_gia``  ← **KHÔNG CÓ LỚP TƯƠNG ỨNG** ................... ❌

★ **AI Insight v2 không có lớp Định giá** (L2 là Thanh khoản, không phải Định
giá — ánh xạ L2 → ``dinh_gia`` sẽ là bịa). Định giá nằm ở tuyến BCTC/premium,
không phải trong payload này. Vì vậy mã nào cũng chỉ chấm được **tối đa 4/5
lớp**, và ``so_lop_chua_biet ≥ 1`` luôn luôn.

Hệ quả bắt buộc (luật 1):
  · ``diem`` = số lớp XÁC NHẬN ủng hộ — một CẬN DƯỚI thật, không phải "X/5".
  · ``so_lop_da_cham`` đi kèm để người đọc biết mẫu số thật là bao nhiêu.
  · Trạng thái "★ Đáng chú ý" chỉ bật khi ĐÃ xác nhận ≥4 lớp ủng hộ; trạng thái
    "Đang quan sát" chỉ bật khi CHẮC CHẮN không thể tới 4 (``diem +
    so_lop_chua_biet < 4``). Vùng ở giữa (có thể tới 4 nếu lớp chưa biết ủng
    hộ) để ``status = None`` — FE hiện "chưa đủ dữ liệu", không đoán về phía nào.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_insight_history import AIInsightHistory
from app.models.cap4 import LOP_KEYS, LOP_LABELS
from app.models.cap5 import WatchlistStatus

#: Lớp chương trình → khoá lớp trong payload AI Insight v2.
LOP_TO_AI_LAYER: dict[str, str | None] = {
    "ky_thuat": "L1",
    "dong_tien": "L3",
    "noi_bo": "L4",
    "tin_tuc": "L5",
    # ★ Không có nguồn — xem docstring module. KHÔNG được trỏ vào L2.
    "dinh_gia": None,
}

#: Nhãn được coi là "lớp này ỦNG HỘ" (bậc 4-5 của thang 5 bậc §2.2).
_NHAN_UNG_HO: dict[str, frozenset[str]] = {
    "L1": frozenset({"Mạnh", "Rất mạnh"}),
    "L3": frozenset({"Hỗ trợ nhẹ", "Hỗ trợ mạnh"}),
    "L4": frozenset({"Hỗ trợ nhẹ", "Hỗ trợ mạnh"}),
    "L5": frozenset({"Tích cực", "Rất tích cực"}),
}

#: Nhãn hợp lệ nhưng KHÔNG ủng hộ (bậc 1-3). Nhãn ngoài hai tập này (kể cả "—"
#: của bản fallback khi AI trả JSON hỏng) là CHƯA CHẤM ĐƯỢC, không phải "không
#: ủng hộ" — đó là chỗ ``status_level()`` mặc định về 3 và ta không dùng nó.
_NHAN_KHONG_UNG_HO: dict[str, frozenset[str]] = {
    "L1": frozenset({"Rất yếu", "Yếu", "Trung bình", "Bình thường"}),
    "L3": frozenset({"Cảnh báo mạnh", "Cảnh báo nhẹ", "Trung tính"}),
    "L4": frozenset({"Cảnh báo mạnh", "Cảnh báo nhẹ", "Trung tính"}),
    "L5": frozenset({"Rất tiêu cực", "Tiêu cực", "Trung tính"}),
}

#: Ngưỡng "★ Đáng chú ý" (spec §6.1).
NGUONG_DANG_CHU_Y = 4
TONG_SO_LOP = len(LOP_KEYS)


@dataclass(frozen=True)
class ConsensusResult:
    """Điểm đồng thuận của một mã tại một phiên.

    ``diem is None`` ⇔ không chấm được lớp nào (không có bản Insight) ⇒ mọi thứ
    để trống, tuyệt đối không ghi 0.
    """

    diem: int | None
    so_lop_da_cham: int | None
    status: str | None
    lop: list[dict]
    session_date: date | None


def _ung_ho(layer_key: str, status_label: object) -> bool | None:
    """``True/False`` = lớp ủng hộ / không ủng hộ; ``None`` = chưa chấm được."""
    if not isinstance(status_label, str):
        return None
    nhan = status_label.strip()
    if nhan in _NHAN_UNG_HO.get(layer_key, frozenset()):
        return True
    if nhan in _NHAN_KHONG_UNG_HO.get(layer_key, frozenset()):
        return False
    return None


def _status(diem: int, so_lop_da_cham: int) -> str | None:
    so_chua_biet = TONG_SO_LOP - so_lop_da_cham
    if diem >= NGUONG_DANG_CHU_Y:
        return WatchlistStatus.NOTABLE.value
    if diem + so_chua_biet < NGUONG_DANG_CHU_Y:
        return WatchlistStatus.WATCHING.value
    # Có thể chạm 4 nếu các lớp chưa biết ủng hộ ⇒ chưa kết luận được.
    return None


def cham_tu_payload(payload: object, *, session_date: date | None = None) -> ConsensusResult:
    """Quy một payload AI Insight (raw ``ai_json``) về điểm đồng thuận 5 lớp."""
    lop_rows: list[dict] = []
    diem = 0
    da_cham = 0

    layers = payload if isinstance(payload, dict) else {}
    for lop in LOP_KEYS:
        layer_key = LOP_TO_AI_LAYER.get(lop)
        nhan_raw: object = None
        ket = None
        if layer_key is not None:
            layer = layers.get(layer_key)
            if isinstance(layer, dict):
                nhan_raw = layer.get("statusLabel")
                ket = _ung_ho(layer_key, nhan_raw)
        if ket is True:
            diem += 1
            da_cham += 1
        elif ket is False:
            da_cham += 1
        lop_rows.append(
            {
                "lop": lop,
                "ten": LOP_LABELS[lop],
                # None = chưa chấm được lớp này (FE hiện "⚪ chưa rõ", không phải ⚠).
                "ung_ho": ket,
                "nhan": nhan_raw if isinstance(nhan_raw, str) and ket is not None else None,
                "giai_thich": (
                    "Chưa có nguồn chấm lớp Định giá cho mã này."
                    if layer_key is None
                    else (
                        "Chưa có bản phân tích 5 lớp cho phiên gần nhất."
                        if ket is None
                        else f"AI Insight {layer_key}: {nhan_raw}"
                    )
                ),
            }
        )

    if da_cham == 0:
        return ConsensusResult(
            diem=None, so_lop_da_cham=None, status=None, lop=lop_rows, session_date=None
        )
    return ConsensusResult(
        diem=diem,
        so_lop_da_cham=da_cham,
        status=_status(diem, da_cham),
        lop=lop_rows,
        session_date=session_date,
    )


class InsightConsensusSource:
    """Nguồn điểm đồng thuận đọc từ ``ai_insight_history`` (không gọi AI)."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def cham(self, symbol: str) -> ConsensusResult:
        row = (
            await self._session.execute(
                select(AIInsightHistory)
                .where(AIInsightHistory.symbol == symbol.upper())
                .order_by(AIInsightHistory.session_date.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if row is None:
            return ConsensusResult(
                diem=None,
                so_lop_da_cham=None,
                status=None,
                lop=cham_tu_payload(None).lop,
                session_date=None,
            )
        return cham_tu_payload(row.payload, session_date=row.session_date)
