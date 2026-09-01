"""Cấp 6 «Bậc thầy» models — xử lý mâu thuẫn giữa 5 lớp: lớp nào có quyền PHỦ
QUYẾT, lớp nào chỉ là ĐIỂM TRỪ, và hành động có khớp nhận định không.

Bài học một câu (spec §1): *"Các lớp hiếm khi cùng chiều. Biết lớp nào có quyền
phủ quyết, lớp nào chỉ là điểm trừ — và để hành động khớp với nhận định."*

★★ **CẤP 6 CŨ («Đối chiếu» — hệ gợi ý lớp ưu tiên theo 6 «kiểu cổ phiếu») ĐÃ
NGHỈ HƯU HOÀN TOÀN.** Bảng trọng số ``KIEU_CO_PHIEU``, enum ``KieuCoPhieu``, 6
cột ``kieu_co_phieu``/``lop_mau_thuan``/``trong_so_goi_y``/``lop_quyet_dinh``/
``khop_goi_y``/``ly_do_doi_chieu`` trên ``order_kehoach`` và 6 cột nhiệm vụ cũ
trên ``cap6_progress`` bị bỏ hẳn ở revision ``c7f1b9d34a80``. Bộ spec bàn giao
đợt 7 (``demo-trading/LEVEL 6/IQX-Cap6-Spec.md``) định nghĩa lại toàn bộ Cấp 6.
Thứ DUY NHẤT sống sót về mặt ý tưởng là "máy phát hiện mâu thuẫn lớp", và nó
được viết lại trên NGUỒN KHÁC (xem ngay dưới).

★ **Bảng ``cap6_progress`` GIỮ NGUYÊN TÊN và cột ``graduated_at``** —
``app.services.cap7.service`` gác cổng vào Cấp 7 trên đúng
``cap6_progress.graduated_at``; đổi tên bảng sẽ khoá vĩnh viễn Cấp 7.

═══════════════════════════════════════════════════════════════════
NGUỒN MÂU THUẪN ĐỔI: từ «user tự chấm» sang «AI Insight 5 bậc»
═══════════════════════════════════════════════════════════════════

Cấp 6 CŨ suy mâu thuẫn từ ``order_kehoach.doc_5_lop`` — 5 lớp do CHÍNH USER
chấm ở Cấp 4. Cấp 6 MỚI không thể dùng nguồn đó: bảng mâu thuẫn phải hiện
**TRƯỚC** khi user đặt lệnh (spec §5 — nó nằm trong panel, ở mã user đang soi),
lúc chưa có ``order_kehoach`` nào. Nên nguồn là bản AI Insight đã lưu của mã đó
(``ai_insight_history``), đọc qua **đúng bộ nhãn 5 bậc** mà Cấp 5 đã kiểm
(``app.services.cap5.consensus``) — xem ``app.services.cap6.mau_thuan``.

Hệ quả bắt buộc: **AI Insight v2 KHÔNG có lớp 💎 Định giá** (L2 là Thanh khoản,
không phải Định giá). Mọi mã vì thế chỉ chấm được tối đa 4/5 lớp, và lớp Định
giá LUÔN nằm ở "chưa biết" — không bao giờ được vẽ vào phe nào.

═══════════════════════════════════════════════════════════════════
★ PHỦ QUYẾT vs ĐIỂM TRỪ (spec §1/§5.3, "CẦN FOUNDER DUYỆT" §12.1)
═══════════════════════════════════════════════════════════════════

  · **Phủ quyết:** 📰 Tin tức · 👤 Nội bộ — khi ở BẬC THẤP NHẤT có thể phủ định
    mọi lớp khác.
  · **Điểm trừ:** 🎯 Kỹ thuật · 💰 Dòng tiền · 💎 Định giá — xấu thì bớt hấp
    dẫn, KHÔNG phủ định.

Đây là **khung tham khảo của IQX, không phải quy tắc bắt buộc** — spec §4.1 và
§12.1 nói thẳng thế, và §12.1 để ngỏ câu hỏi có nên nâng 💰 Dòng tiền lên nhóm
phủ quyết cho thị trường VN không. Hệ CHỈ RA mâu thuẫn + phân loại; hệ KHÔNG
BAO GIỜ phán mua/không mua (spec §4.1, §13).

═══════════════════════════════════════════════════════════════════
★★ "CHƯA TÍNH ĐƯỢC" KHÔNG BAO GIỜ LÀ 0 (luật repo)
═══════════════════════════════════════════════════════════════════

``tong_lai_lenh_cap6_pct`` là **NULLABLE**: NULL = chưa có lệnh Cấp-6 nào đóng.
``0.0`` là một câu KHÁC HẲN ("đã đóng lệnh, hoà vốn"). Repo này đã phải viết
riêng một migration (``7b3c1e5a9d24``) vì một cột tỷ lệ ``NOT NULL DEFAULT 0``
khiến user ngày đầu đọc "0%" ngay dưới một thẻ nói "chưa có dữ liệu".

Ngược lại ``so_lan_xu_ly_nhat_quan``/``so_lan_xu_ly_veto_nhat_quan`` là
``NOT NULL DEFAULT 0``: 0 ở đó là số THẬT (đếm lệnh trong bảng ta sở hữu, tính
lại ở mọi lần đọc), không phải "chưa biết".

**Storage decision — ``conflict_level`` là ``String(8)``, ``veto_layers`` là
JSON**, y hệt lựa chọn của Cấp 4/5: service validate theo ``StrEnum`` dưới đây
trước khi ghi, không truy vấn nào lọc trên chúng trong SQL ngoài ``GROUP BY``
làm trong Python, và PG enum thì mỗi lần đổi mức lại phải ALTER TYPE.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin
from app.models.cap1 import LyDo
from app.models.cap4 import LOP_KEYS, LOP_LABELS


class MucMauThuan(enum.StrEnum):
    """4 mức nhận định user tự đọc về mức độ mâu thuẫn (spec §6).

    ★ Đây THUẦN là nhận định — nó KHÔNG khoá nút, KHÔNG chỉnh khối lượng hộ
    (spec §4.2). Giá trị của nó đến sau, khi Kết sổ và Phân tích danh mục đối
    chiếu nó với hành động thật.
    """

    NHE = "nhe"
    NGAI = "ngai"
    NGHIEM = "nghiem"
    CHUA_RO = "chua_ro"


#: Nhãn hiển thị — lấy verbatim từ mockup ``iqx-cap6-datlenh.html``.
MUC_LABELS: dict[str, str] = {
    MucMauThuan.NHE.value: "Mâu thuẫn nhẹ",
    MucMauThuan.NGAI.value: "Đáng ngại",
    MucMauThuan.NGHIEM.value: "Nghiêm trọng",
    MucMauThuan.CHUA_RO.value: "Chưa rõ",
}

#: ★ Thứ tự NẶNG DẦN của 3 mức CÓ thứ tự. ``chua_ro`` cố tình ĐỨNG NGOÀI: nó
#: không nằm giữa "nhẹ" và "nghiêm trọng" — nó là "chưa đánh giá được", nên xếp
#: nó vào thang là bịa ra một thứ tự user không hề nói. Khối ⑭ vì thế không bao
#: giờ chấm khớp/lệch cho ``chua_ro`` (xem ``app.services.cap6.service``).
MUC_NANG_DAN: tuple[str, ...] = (
    MucMauThuan.NHE.value,
    MucMauThuan.NGAI.value,
    MucMauThuan.NGHIEM.value,
)

MUC_VALUES: frozenset[str] = frozenset(m.value for m in MucMauThuan)

#: 📰 Tin tức · 👤 Nội bộ — nhóm có quyền PHỦ QUYẾT (spec §1/§5.3).
LOP_PHU_QUYET: frozenset[str] = frozenset({LyDo.TIN_TUC.value, LyDo.NOI_BO.value})

#: 🎯 Kỹ thuật · 💰 Dòng tiền · 💎 Định giá — nhóm ĐIỂM TRỪ (xấu thì trừ điểm,
#: không phủ định).
LOP_DIEM_TRU: frozenset[str] = frozenset(
    {LyDo.KY_THUAT.value, LyDo.DONG_TIEN.value, LyDo.DINH_GIA.value}
)


def _assert_phan_loai_lop() -> None:
    """Fail loudly at import time nếu bảng phân loại lớp lệch khỏi 5 lớp thật.

    Cả hai nhóm phải phủ ĐÚNG ``LOP_KEYS`` và không chồng nhau: một lớp rơi ra
    ngoài sẽ âm thầm biến mất khỏi bảng mâu thuẫn, còn một lớp nằm ở cả hai
    nhóm sẽ vừa phủ quyết vừa chỉ là điểm trừ.
    """
    ca_hai = LOP_PHU_QUYET | LOP_DIEM_TRU
    thieu = set(LOP_KEYS) - ca_hai
    if thieu:
        raise RuntimeError(f"cap6: lớp chưa được phân loại phủ quyết/điểm trừ: {thieu}")
    la = ca_hai - set(LOP_KEYS)
    if la:
        raise RuntimeError(f"cap6: phân loại nhắc lớp không tồn tại: {la}")
    trung = LOP_PHU_QUYET & LOP_DIEM_TRU
    if trung:
        raise RuntimeError(f"cap6: lớp vừa phủ quyết vừa điểm trừ: {trung}")


_assert_phan_loai_lop()


def lop_ten(lop: str) -> str:
    """Nhãn tiếng Việt của một lớp (dùng LẠI bảng của Cấp 4)."""
    return LOP_LABELS.get(lop, lop)


class Cap6Progress(UUIDMixin, TimestampMixin, Base):
    """Tiến trình Cấp 6 «Bậc thầy» của một user. Một hàng mỗi user.

    **1 NHIỆM VỤ, THUẦN HÀNH VI — KHÔNG ĐO LÃI** (spec §2, mockup
    ``iqx-cap6-hanhtrinh.html``: header ``0/1``):

        ① «Xử lý mâu thuẫn nhất quán» →
             ``so_lan_xu_ly_nhat_quan >= 3``

    ★ **Vì sao bỏ lãi khỏi cổng** (spec §2, nguyên văn): quyết định đúng vẫn có
    thể lỗ và ngược lại; lãi phụ thuộc thị trường chứ không phải kỹ năng. Giữ
    lãi trong cổng sẽ kéo user về phía "mua để đạt %". ``tong_lai_lenh_cap6_pct``
    vẫn được tính và hiển thị ở Kết sổ / Phân tích danh mục để user tự học —
    nhưng ``graduate()`` KHÔNG BAO GIỜ đọc nó.

    Các số hành vi được **tính lại server-side ở mọi lần đọc** từ
    ``order_kehoach`` + ``cap6_skip``; client không bao giờ gửi lên.
    ``so_lan_xu_ly_veto_nhat_quan`` là thống kê mô tả, không phải điều kiện.
    Chúng là ``NOT NULL DEFAULT 0`` vì 0 ở đây là số THẬT (đếm hàng trong bảng
    ta sở hữu), không phải "chưa biết".
    """

    __tablename__ = "cap6_progress"
    __table_args__ = (UniqueConstraint("user_id", name="uq_cap6_progress_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    #: Số lần gặp lệnh CÓ MÂU THUẪN và xử lý nhất quán (nhận định khớp hành
    #: động). Nguồn: ``order_kehoach`` (had_conflict + conflict_level + pct_von)
    #: và ``cap6_skip``. Cần ≥3 để tốt nghiệp.
    so_lan_xu_ly_nhat_quan: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    #: Ô thống kê mô tả: trong các lần nhất quán ở trên, bao nhiêu lần mã còn
    #: có lớp phủ quyết (Tin tức / Nội bộ) ở bậc THẤP NHẤT. Không phải điều
    #: kiện tốt nghiệp.
    so_lan_xu_ly_veto_nhat_quan: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    #: Σ(lãi/lỗ VND mọi lệnh đã đóng SAU khi vào Cấp 6) ÷ Σ(vốn các lệnh đó),
    #: tính bằng %. Không phân biệt lệnh có mâu thuẫn hay không (spec §11).
    #:
    #: ★★ **NULLABLE, và NULL KHÔNG BAO GIỜ thành 0.** NULL = "chưa có lệnh
    #: Cấp-6 nào đóng"; ``0.0`` là một câu khác hẳn ("đã đóng lệnh, hoà vốn").
    #: Chỉ để HIỂN THỊ — tuyệt đối không phải cổng lên cấp (spec §2).
    tong_lai_lenh_cap6_pct: Mapped[float | None] = mapped_column(Float, nullable=True)

    #: Cờ tour «Xử lý mâu thuẫn» (tour thứ 5 — spec §10). KHÔNG phải nhiệm vụ:
    #: tour có nút "Bỏ qua", lấy nó làm cổng là tặng không một nhiệm vụ (bài
    #: học từ ``da_xem_tour_sanma`` của Cấp 5).
    da_xem_tour_mauthuan: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_to_graduate_hours: Mapped[float | None] = mapped_column(Float, nullable=True)


class Cap6Skip(UUIDMixin, TimestampMixin, Base):
    """«Không mua lần này» — quyết định đứng ngoài, ghi nhận như một hành động
    CÓ KỶ LUẬT (spec §7/§11).

    Một hàng mỗi lần bấm — cố ý KHÔNG unique theo (user, symbol): user đứng
    ngoài cùng một mã ở hai phiên khác nhau là HAI quyết định, và khối ⑮ đếm
    "N lần đứng ngoài" chứ không đếm "N mã".

    ★★ Nhưng "một hàng mỗi lần bấm" KHÔNG có nghĩa "một lần đếm mỗi hàng": cổng
    lên cấp gộp các hàng cùng ``(symbol, phiên)`` — xem
    ``Cap6Service._dem_nhat_quan``. Bấm nút này miễn phí (không lệnh, không vị
    thế, không rủi ro) nên ba cú bấm liên tiếp trong cùng một phiên là MỘT tình
    huống đứng ngoài. Khối ⑮ vẫn đọc bảng này THÔ vì ở đó con số là nhật ký hành
    vi để user nhìn lại, không phải điều kiện lên cấp.

    ★ **Cách nhẹ, đúng spec §7:** chỉ ghi nhận, KHÔNG theo dõi giá mã sau đó.
    Không có cột kết quả, không có cron chấm "né đúng/né hụt" — đó chính là thứ
    Cấp 5 cũ làm và đã nghỉ hưu, và spec §13 xếp nó ra NGOÀI phạm vi Cấp 6
    ("tránh phức tạp + tránh dạy tiếc nuối").
    """

    __tablename__ = "cap6_skip"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    #: 1 trong ``MucMauThuan`` — mức nhận định user đã chọn, dùng LÀM LÝ DO
    #: (spec §7: "không hỏi thêm").
    conflict_level: Mapped[str] = mapped_column(String(8), nullable=False)
    #: ★★ **CỘT NÀY KHÔNG CÓ TRONG DANH SÁCH §11 CỦA SPEC — nó bắt buộc phải
    #: có.** Luật đếm ở chính §11 mở đầu bằng "đếm +1 khi một lệnh **CÓ MÂU
    #: THUẪN** mà nhận định user đọc khớp hành động", và "nghiêm trọng → không
    #: mua" là một trong hai mẫu ✓. Không lưu cờ này thì lúc đếm không còn cách
    #: nào biết mã đó CÓ mâu thuẫn hay không (bản AI Insight đổi mỗi phiên, suy
    #: lại về sau là suy trên dữ liệu khác) ⇒ ba cú bấm «Không mua» trên một mã
    #: chỉ có tin xấu mà KHÔNG mâu thuẫn cũng mở được cổng tốt nghiệp. Đã dựng
    #: được lỗ đó bằng một bài test thật trước khi thêm cột này.
    #:
    #: Cùng luật NULLABLE ba trạng thái như ``had_veto`` bên dưới.
    had_conflict: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    #: ★ **NULLABLE ba trạng thái**, do SERVER tự tính lại từ AI Insight — không
    #: bao giờ nhận từ client. True = mã có lớp phủ quyết ở bậc thấp nhất ·
    #: False = đã kiểm và không có · NULL = **chưa chấm được** (mã chưa có bản
    #: AI Insight còn hiệu lực). NULL gộp vào False sẽ biến "chưa biết" thành
    #: một khẳng định, và ở đây nó còn nuôi cổng tốt nghiệp.
    had_veto: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
