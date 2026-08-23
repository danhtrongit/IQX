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

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone

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

#: Trong "không ủng hộ", tách riêng nhãn NGƯỢC CHIỀU (bậc 1-2) khỏi nhãn TRUNG
#: TÍNH (bậc 3). ★ Cần thiết cho cụm 5 icon của thẻ Watchlist (§6.2): vẽ ⚠ cho
#: một lớp "Trung tính" là đổi một lớp không ý kiến thành một lớp phản đối.
_NHAN_NGUOC_CHIEU: dict[str, frozenset[str]] = {
    "L1": frozenset({"Rất yếu", "Yếu"}),
    "L3": frozenset({"Cảnh báo mạnh", "Cảnh báo nhẹ"}),
    "L4": frozenset({"Cảnh báo mạnh", "Cảnh báo nhẹ"}),
    "L5": frozenset({"Rất tiêu cực", "Tiêu cực"}),
}

#: ★ **Bí danh CÔNG KHAI của 3 bảng nhãn trên — Cấp 6 đọc CHÍNH các đối tượng
#: này** (``app.services.cap6.mau_thuan`` dựng thang 5 bậc rồi assert lại theo
#: chúng ở import time). Là bí danh chứ KHÔNG phải bản sao: thêm/bớt một nhãn ở
#: đây là thay đổi cả hai cấp cùng lúc, nên hai bộ nhãn không thể trôi khỏi
#: nhau. Đừng thay bằng ``dict(...)``.
NHAN_UNG_HO = _NHAN_UNG_HO
NHAN_KHONG_UNG_HO = _NHAN_KHONG_UNG_HO
NHAN_NGUOC_CHIEU = _NHAN_NGUOC_CHIEU

#: Ba mức hiển thị của một lớp (khớp ``NhanDinhLop`` của FE Cấp 4).
MUC_UNG_HO = "ok"
MUC_TRUNG_TINH = "neu"
MUC_NGUOC_CHIEU = "bad"

#: Ngưỡng "★ Đáng chú ý" (spec §6.1).
NGUONG_DANG_CHU_Y = 4
TONG_SO_LOP = len(LOP_KEYS)

_VN_TZ = timezone(timedelta(hours=7))

#: ★★ **CỬA SỔ HIỆU LỰC của một bản AI Insight khi dùng để chấm đồng thuận.**
#:
#: Bảng ``ai_insight_history`` chỉ được ghi khi CÓ NGƯỜI bấm "AI Phân tích" cho
#: mã đó — không có cron nào rót đầy nó. Không chặn ngày (chỉ ``ORDER BY
#: session_date DESC``) nghĩa là một bản phân tích 5,5 tháng tuổi vẫn chấm ra
#: "4/5 lớp · ★ Đáng chú ý" cho phiên hôm nay, cạnh một nút "Đặt lệnh →". Cả 4
#: lớp chấm được (xu hướng · dòng tiền · nội bộ · tin tức) đều là những thứ
#: ĐỌC THEO PHIÊN, nên đó là gán tình trạng tháng Ba cho hôm nay.
#:
#: Chọn **5 phiên** (≈ một tuần giao dịch) chứ không phải "đúng phiên gần nhất":
#: một bản đọc trong tuần vẫn còn mô tả bức tranh hiện tại, còn đòi đúng phiên
#: hôm nay sẽ khiến gần như mọi mã trả về "chưa chấm được" (vì không có cron) —
#: đúng nhưng vô dụng. Cửa sổ này đi kèm hai điều BẮT BUỘC: ``session_date``
#: phải lên wire để user thấy dữ liệu của phiên nào, và điểm ĐÃ LƯU mà không
#: còn bản phân tích trong cửa sổ thì phải bị đánh dấu là số cũ (xem
#: ``Cap5Service._watchlist_out``).
SO_PHIEN_HIEU_LUC = 5


def hom_nay_vn() -> date:
    return datetime.now(_VN_TZ).date()


def ngay_vn(dt: datetime) -> date:
    """Ngày GIỜ VN của một mốc thời gian (mốc naive coi như UTC).

    ★ Ở đây chứ không ở nơi gọi: ``_VN_TZ`` phải có ĐÚNG MỘT định nghĩa trong
    repo. Cấp 6 dùng hàm này để gộp các cú bấm «Không mua» cùng mã cùng PHIÊN
    lại thành một tình huống khi đếm cổng lên cấp — nếu chỗ đó tự đặt lại múi
    giờ thì hai cấp có thể chia ngày khác nhau cho cùng một mốc.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(_VN_TZ).date()


def ngay_som_nhat_con_hieu_luc(
    today: date, *, so_phien: int = SO_PHIEN_HIEU_LUC
) -> date:
    """Ngày phiên SỚM NHẤT còn được dùng để chấm, tính từ ``today``.

    Đếm lùi ``so_phien`` phiên (Mon-Fri) từ ``today``; bản phân tích của chính
    ``today`` hiển nhiên còn hiệu lực.
    """
    d = today
    con = so_phien
    while con > 0:
        d -= timedelta(days=1)
        if d.weekday() < 5:
            con -= 1
    return d


def _ly_do_chua_cham(session_date: date | None, qua_han: date | None) -> str:
    """Câu nói RÕ vì sao một lớp chưa chấm được (thay câu "phiên gần nhất" cũ,
    câu đó tự nói ngược khi dữ liệu thật ra là của 5 tháng trước)."""
    if qua_han is not None:
        return (
            f"Bản phân tích 5 lớp gần nhất của mã này là phiên "
            f"{qua_han.strftime('%d/%m/%Y')} — đã quá {SO_PHIEN_HIEU_LUC} phiên "
            "nên không dùng để chấm cho hôm nay."
        )
    if session_date is not None:
        return (
            f"Bản phân tích phiên {session_date.strftime('%d/%m/%Y')} không có "
            "nhãn hợp lệ cho lớp này."
        )
    return "Mã này chưa có bản phân tích 5 lớp nào để chấm."


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
    #: Phiên của bản phân tích ĐÃ DÙNG để chấm. ``None`` khi không chấm được.
    session_date: date | None
    #: Phiên của bản phân tích gần nhất mà ta ĐÃ TỪ CHỐI vì quá cũ (ngoài
    #: ``SO_PHIEN_HIEU_LUC`` phiên). ``None`` = không có bản nào, hoặc bản gần
    #: nhất còn hiệu lực. Hai trạng thái này KHÁC nhau trên mặt thẻ.
    session_date_qua_han: date | None = None


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


def _muc(layer_key: str, status_label: object, ung_ho: bool | None) -> str | None:
    """Mức hiển thị của một lớp: ``ok`` / ``neu`` / ``bad``; ``None`` = chưa chấm.

    ★ ``ung_ho is False`` KHÔNG tự động là ``bad``: thang 5 bậc có một bậc giữa
    ("Trung tính" / "Trung bình") nghĩa là lớp đó không nghiêng bên nào.
    """
    if ung_ho is None:
        return None
    if ung_ho:
        return MUC_UNG_HO
    nhan = status_label.strip() if isinstance(status_label, str) else ""
    if nhan in _NHAN_NGUOC_CHIEU.get(layer_key, frozenset()):
        return MUC_NGUOC_CHIEU
    return MUC_TRUNG_TINH


def _status(diem: int, so_lop_da_cham: int) -> str | None:
    so_chua_biet = TONG_SO_LOP - so_lop_da_cham
    if diem >= NGUONG_DANG_CHU_Y:
        return WatchlistStatus.NOTABLE.value
    if diem + so_chua_biet < NGUONG_DANG_CHU_Y:
        return WatchlistStatus.WATCHING.value
    # Có thể chạm 4 nếu các lớp chưa biết ủng hộ ⇒ chưa kết luận được.
    return None


def cham_tu_payload(
    payload: object,
    *,
    session_date: date | None = None,
    session_date_qua_han: date | None = None,
) -> ConsensusResult:
    """Quy một payload AI Insight (raw ``ai_json``) về điểm đồng thuận 5 lớp."""
    lop_rows: list[dict] = []
    diem = 0
    da_cham = 0
    ly_do_thieu = _ly_do_chua_cham(session_date, session_date_qua_han)

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
                # None = chưa chấm được lớp này (FE hiện "– chưa rõ", không phải ⚠).
                "ung_ho": ket,
                # 'ok' | 'neu' | 'bad' | None — xem ``_muc``.
                "muc": _muc(layer_key or "", nhan_raw, ket),
                "nhan": nhan_raw if isinstance(nhan_raw, str) and ket is not None else None,
                "giai_thich": (
                    "Chưa có nguồn chấm lớp Định giá cho mã này."
                    if layer_key is None
                    else (ly_do_thieu if ket is None else f"AI Insight {layer_key}: {nhan_raw}")
                ),
            }
        )

    if da_cham == 0:
        return ConsensusResult(
            diem=None,
            so_lop_da_cham=None,
            status=None,
            lop=lop_rows,
            session_date=None,
            session_date_qua_han=session_date_qua_han,
        )
    return ConsensusResult(
        diem=diem,
        so_lop_da_cham=da_cham,
        status=_status(diem, da_cham),
        lop=lop_rows,
        session_date=session_date,
        session_date_qua_han=session_date_qua_han,
    )


class InsightConsensusSource:
    """Nguồn điểm đồng thuận đọc từ ``ai_insight_history`` (không gọi AI)."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @staticmethod
    def _chua_cham(*, qua_han: date | None = None) -> ConsensusResult:
        """Kết quả "chưa chấm được" — MỘT chỗ dựng, kèm lý do đúng sự thật."""
        goc = cham_tu_payload(None, session_date_qua_han=qua_han)
        return ConsensusResult(
            diem=None,
            so_lop_da_cham=None,
            status=None,
            lop=goc.lop,
            session_date=None,
            session_date_qua_han=qua_han,
        )

    def _cham_row(
        self, row: AIInsightHistory | None, *, som_nhat: date
    ) -> ConsensusResult:
        """Chấm bản phân tích gần nhất của một mã, CHẶN theo cửa sổ phiên.

        ★ Ba trạng thái, không được gộp: không có bản nào · có nhưng quá cũ ·
        chấm được. Trạng thái giữa trước đây bị chấm như thể là dữ liệu hôm nay.
        """
        if row is None:
            return self._chua_cham()
        if row.session_date is None or row.session_date < som_nhat:
            return self._chua_cham(qua_han=row.session_date)
        return cham_tu_payload(row.payload, session_date=row.session_date)

    async def cham_nhieu(
        self, symbols: Sequence[str], *, today: date | None = None
    ) -> dict[str, ConsensusResult]:
        """Chấm cả rổ mã trong MỘT truy vấn (Watchlist có tới 50 mã).

        Mã chưa từng có bản Insight — hoặc chỉ có bản NGOÀI cửa sổ
        ``SO_PHIEN_HIEU_LUC`` phiên — vẫn có mặt trong dict, ở dạng "chưa chấm
        được" (``diem is None``): vắng mặt sẽ khiến chỗ gọi phải tự đoán.
        """
        ups = sorted({s.upper() for s in symbols})
        if not ups:
            return {}
        som_nhat = ngay_som_nhat_con_hieu_luc(today or hom_nay_vn())
        rows = (
            await self._session.execute(
                select(AIInsightHistory)
                .where(AIInsightHistory.symbol.in_(ups))
                .order_by(
                    AIInsightHistory.symbol.asc(), AIInsightHistory.session_date.desc()
                )
            )
        ).scalars().all()
        moi_nhat: dict[str, AIInsightHistory] = {}
        for row in rows:
            moi_nhat.setdefault(row.symbol.upper(), row)
        return {
            ma: self._cham_row(moi_nhat.get(ma), som_nhat=som_nhat) for ma in ups
        }

    async def cham(self, symbol: str, *, today: date | None = None) -> ConsensusResult:
        row = (
            await self._session.execute(
                select(AIInsightHistory)
                .where(AIInsightHistory.symbol == symbol.upper())
                .order_by(AIInsightHistory.session_date.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        return self._cham_row(
            row, som_nhat=ngay_som_nhat_con_hieu_luc(today or hom_nay_vn())
        )
