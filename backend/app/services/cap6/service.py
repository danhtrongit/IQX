"""Cấp 6 «Bậc thầy» service — bảng mâu thuẫn 5 lớp, ô nhận định 4 mức, nút
«Không mua lần này», khối ⑭/⑮, cổng lên cấp THUẦN HÀNH VI.

Bài học một câu (spec §1): *"Các lớp hiếm khi cùng chiều. Biết lớp nào có quyền
phủ quyết, lớp nào chỉ là điểm trừ — và để hành động khớp với nhận định."*

★★ **CẤP 6 CŨ («Đối chiếu») ĐÃ NGHỈ HƯU HOÀN TOÀN.** Bảng trọng số 6 «kiểu cổ
phiếu» + gợi ý lớp ưu tiên + ``khop_goi_y`` + «Thách thức Đối chiếu» 3 điều
kiện KHÔNG còn ở đây: 6 cột ``kieu_co_phieu``/``lop_mau_thuan``/
``trong_so_goi_y``/``lop_quyet_dinh``/``khop_goi_y``/``ly_do_doi_chieu`` trên
``order_kehoach`` và 6 cột nhiệm vụ cũ trên ``cap6_progress`` bị bỏ ở revision
``c7f1b9d34a80``. Bộ spec bàn giao đợt 7 định nghĩa lại toàn bộ Cấp 6.

═══════════════════════════════════════════════════════════════════
MỘT NHIỆM VỤ — THUẦN HÀNH VI, KHÔNG ĐO LÃI (spec §2/§3)
═══════════════════════════════════════════════════════════════════

    ① «Xử lý mâu thuẫn nhất quán» →
         ``so_lan_xu_ly_nhat_quan >= 3`` VÀ ``so_lan_xu_ly_veto_nhat_quan >= 2``

"Xử lý nhất quán" = nhận định user tự đọc KHỚP hành động thật (spec §2/§11):

  · đọc **nghiêm trọng** → «Không mua» HOẶC mua NHỎ (khối lượng thận trọng) ✓
  · đọc **nhẹ** → vào bình thường ✓
  · đọc **nghiêm trọng** nhưng mua LỚN → **KHÔNG tính** (bẫy "đắn đo trong đầu
    mà tay vẫn mua lớn")

★ ``ngai``/``chua_ro`` KHÔNG được đếm theo chiều nào — spec §11 liệt kê đúng
hai mẫu ✓ ở trên, và bịa thêm một luật cho hai mức spec để ngỏ sẽ vừa nới cổng
vừa nói với user một chuẩn mực founder chưa duyệt. Chúng vẫn hiện đầy đủ ở khối
⑭/⑮ để user tự nhìn lại.

★★ **"MUA NHỎ" = ``pct_von <= KHAU_VI_TRAN_PCT['than_trong']`` (10%).** Repo đã
có đúng một định nghĩa "thận trọng" — trần khẩu vị Thận trọng của Cấp 3 — và
Cấp 6 dùng LẠI chính hằng số đó thay vì đặt ngưỡng riêng, để hai màn không bao
giờ nói hai con số khác nhau về cùng một chữ.

★★★ **CỔNG KHÔNG BAO GIỜ ĐỌC LÃI.** ``tong_lai_lenh_cap6_pct`` được tính và
đưa lên wire cho Kết sổ / Phân tích danh mục, nhưng ``graduate()`` chỉ nhìn hai
bộ đếm hành vi (spec §2: "quyết định đúng vẫn có thể lỗ, và ngược lại").

═══════════════════════════════════════════════════════════════════
★ SERVER TÍNH LẠI, CLIENT CHỈ GỬI NHẬN ĐỊNH CỦA CHÍNH MÌNH
═══════════════════════════════════════════════════════════════════

``had_conflict`` / ``had_veto`` / ``veto_layers`` do SERVER suy lại từ
``ai_insight_history`` (``app.services.cap6.mau_thuan``) ở mọi lần ghi — TUYỆT
ĐỐI không nhận từ client. Chúng nuôi thẳng cổng tốt nghiệp: client khai được
"lệnh này có phủ quyết" là client tự cấp cho mình điều kiện lên cấp. Cấp 5 đã
học đúng bài này với ``hunt_signal``.

Cột DUY NHẤT lấy từ client là ``conflict_level`` — chỉ user mới biết mình đọc
mâu thuẫn ở mức nào.

═══════════════════════════════════════════════════════════════════
★★ CHỐNG BỊA TIẾN ĐỘ — NHẬN ĐỊNH CHỐT TẠI THỜI ĐIỂM KHỚP LỆNH
═══════════════════════════════════════════════════════════════════

Nhận định là một CAM KẾT TRƯỚC. Đặt lệnh xong, ngồi xem giá chạy rồi mới POST
``conflict_level`` là gian lận hai lần: nó bịa ra một lần "xử lý nhất quán" cho
cổng lên cấp, và nó bơm khối ⑮ ("bản năng đọc của bạn có chuẩn không") bằng
cách xếp lệnh thắng vào "nhẹ", lệnh thua vào "nghiêm trọng".

``record_kehoach`` vì thế khoá ghi theo luật dưới đây, và **khoá nằm NGOÀI mọi
nhánh "đã có nhận định"** — đây đúng là chỗ Cấp 7 từng sai (khoá nằm trong
``if kehoach.luc_doc_user is not None`` nên chỉ chạy từ lần POST THỨ HAI, trong
khi docstring khẳng định là không thể):

  · lệnh CHƯA khớp → ghi thoải mái (panel là cái form user quay lại được, và
    lệnh chưa khớp thì chưa có vị thế nào để nhìn giá mà bịa);
  · lệnh ĐÃ khớp → chỉ còn ``CUA_SO_CHOT_NHAN_DINH`` phút kể từ lúc đặt lệnh.
    Hết cửa sổ thì MỌI lần ghi bị từ chối — kể cả lần ghi ĐẦU TIÊN, không chỉ
    lần sửa. Không ghi nhận định lúc mua là hợp lệ (bảng mâu thuẫn chỉ hiện khi
    5 lớp thật sự mâu thuẫn), nên khoá chỉ chặn "sửa" sẽ để hở nguyên lỗ: đặt
    lệnh, đợi hết phiên, nhìn giá rồi mới POST mức khớp ý.
  · POST y hệt lần trước luôn là no-op idempotent, trước và sau cửa sổ (một cú
    gọi lại do mạng không bao giờ thành 409).

``POST /cap6/skip`` không cần khoá: không có lệnh, không có vị thế, không có
kết quả nào để nhìn — bản thân nó là bằng chứng đứng ngoài.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap1 import KhauViRuiRo, OrderKehoach, OrderKetso
from app.models.cap5 import Cap5Progress
from app.models.cap6 import (
    LOP_DIEM_TRU,
    LOP_PHU_QUYET,
    MUC_LABELS,
    MUC_NANG_DAN,
    MUC_VALUES,
    Cap6Progress,
    Cap6Skip,
    MucMauThuan,
    lop_ten,
)
from app.models.virtual_trading import OrderSide, OrderStatus, VirtualOrder
from app.services.cap5.service import KHAU_VI_TRAN_PCT
from app.services.cap6.mau_thuan import MauThuanResult, MauThuanSource

# ══════════════════════════════════════════════════════
# Hằng số của cấp
# ══════════════════════════════════════════════════════

#: Cổng tốt nghiệp (spec §2/§3) — THUẦN HÀNH VI. Lên wire ở ``/cap6/progress``
#: để FE không phải hard-code lại hai con số này.
MUC_TIEU_NHAT_QUAN = 3
MUC_TIEU_VETO = 2

#: "Mua nhỏ (khối lượng thận trọng)" — dùng LẠI trần khẩu vị Thận trọng của Cấp
#: 3 (xem docstring module). ``is`` với chính bảng của Cấp 5, không phải bản sao.
NGUONG_MUA_NHO_PCT: float = KHAU_VI_TRAN_PCT[KhauViRuiRo.THAN_TRONG.value]

#: Số lệnh đã đóng TỐI THIỂU trong một mức trước khi khối ⑮ dám nói tỷ lệ thắng
#: (luật repo, giống ``MIN_LENH_KHOI_12`` của Cấp 5). Dưới ngưỡng ⇒ ``None`` +
#: ``du_mau=False``, KHÔNG phải 0%.
MIN_LENH_TY_LE_THANG = 3

#: Cửa sổ còn ghi được nhận định sau khi lệnh ĐÃ KHỚP (xem docstring module).
CUA_SO_CHOT_NHAN_DINH = timedelta(minutes=15)

_COPY_KHOA_NHAN_DINH = (
    "Lệnh này đã khớp quá lâu — không ghi hay sửa mức nhận định mâu thuẫn được "
    "nữa. Nhận định phải được chốt TRƯỚC khi bạn biết giá đi đâu, đó là điều "
    "làm phần «nhận định có khớp hành động không» còn nghĩa."
)

_KHOI_14_GIAI_THICH = (
    "Chỉ tính lệnh CÓ mâu thuẫn lớp. Với mỗi mức bạn đọc, đây là khối lượng "
    "trung bình (theo % vốn) bạn đã thực sự mua. Đọc càng nghiêm trọng thì "
    "khối lượng càng phải nhỏ đi — cột «Khớp?» so mức này với các mức nhẹ hơn."
)

_KHOI_15_GIAI_THICH = (
    "Chỉ tính lệnh CÓ mâu thuẫn đã ĐÓNG. Mỗi mức cần ít nhất "
    f"{MIN_LENH_TY_LE_THANG} lệnh đã đóng mới được tính tỷ lệ thắng — dưới "
    "ngưỡng đó hệ để trống chứ không hiện 0%."
)


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


class Cap6Service:
    """Business logic cho Cấp 6 «Bậc thầy» (FREE, Thực chiến).

    ``mau_thuan_source`` được tiêm vào để test không phụ thuộc bảng
    ``ai_insight_history`` thật; mặc định đọc thẳng bảng đó (không gọi AI).
    """

    def __init__(
        self, session: AsyncSession, *, mau_thuan_source: MauThuanSource | None = None
    ) -> None:
        self._session = session
        self._mau_thuan = mau_thuan_source or MauThuanSource(session)

    # ══════════════════════════════════════════════════
    # Progress row
    # ══════════════════════════════════════════════════

    async def _get_progress_row(self, user_id: uuid.UUID) -> Cap6Progress | None:
        result = await self._session.execute(
            select(Cap6Progress).where(Cap6Progress.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def _require_progress(self, user_id: uuid.UUID) -> Cap6Progress:
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 6")
        return progress

    async def get_progress(self, user_id: uuid.UUID) -> dict | None:
        """``GET /cap6/progress`` — hàng tiến trình đã tính lại, hoặc ``None``."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            return None
        return await self._recompute_progress(user_id, progress)

    async def enter(self, user_id: uuid.UUID) -> dict:
        """Vào Cấp 6 (idempotent) — yêu cầu đã tốt nghiệp Cấp 5."""
        progress = await self._get_progress_row(user_id)
        if progress is not None:
            return await self._recompute_progress(user_id, progress)

        cap5 = (
            await self._session.execute(
                select(Cap5Progress).where(Cap5Progress.user_id == user_id)
            )
        ).scalar_one_or_none()
        if cap5 is None:
            raise NotFoundError("tiến trình Cấp 5")
        if cap5.graduated_at is None:
            raise ConflictError("Chưa tốt nghiệp Cấp 5")

        progress = Cap6Progress(user_id=user_id, entered_at=datetime.now(UTC))
        self._session.add(progress)
        await self._session.flush()
        await self._session.refresh(progress)
        return await self._recompute_progress(user_id, progress)

    async def mark_tour_mauthuan(self, user_id: uuid.UUID) -> dict:
        """``POST /cap6/tour-mauthuan`` — user đã đi HẾT 7 bước tour (§10).

        ★ Chỉ gọi ở bước cuối / nút "Xong"; "Bỏ qua" giữa chừng KHÔNG gọi. Cờ
        này KHÔNG phải cổng tốt nghiệp (spec §11: "tour là công cụ học"), nên
        gian lận ở đây cũng không mở được Cấp 7 — nó chỉ quyết định tour có tự
        bật lại lần sau hay không.
        """
        progress = await self._require_progress(user_id)
        progress.da_xem_tour_mauthuan = True
        await self._session.flush()
        return await self._recompute_progress(user_id, progress)

    # ══════════════════════════════════════════════════
    # Bảng mâu thuẫn (spec §5)
    # ══════════════════════════════════════════════════

    @staticmethod
    def _mau_thuan_out(result: MauThuanResult) -> dict:
        """``MauThuanResult`` → wire shape của ``GET /cap6/mau-thuan/{symbol}``."""
        return {
            "co_mau_thuan": result.co_mau_thuan,
            "ung_ho": [
                {"lop": r["lop"], "ten": r["ten"], "nhan": r["nhan"], "bac": r["bac"]}
                for r in result.ung_ho
            ],
            "nguoc": [
                {
                    "lop": r["lop"],
                    "ten": r["ten"],
                    "nhan": r["nhan"],
                    "bac": r["bac"],
                    "la_phu_quyet": r["la_phu_quyet"],
                }
                for r in result.nguoc
            ],
            "trung_tinh": [
                {"lop": r["lop"], "ten": r["ten"], "nhan": r["nhan"]}
                for r in result.trung_tinh
            ],
            "phu_quyet_kich_hoat": result.phu_quyet_kich_hoat,
            "lop_phu_quyet_xau": list(result.lop_phu_quyet_xau),
            "lop_phu_quyet_xau_ten": [lop_ten(lop) for lop in result.lop_phu_quyet_xau],
            # ★ SERVER dựng câu, FE in NGUYÊN VĂN (§C12c).
            "canh_bao": result.canh_bao,
            "chua_du_du_lieu": result.chua_du_du_lieu,
            "ly_do_chua_du": result.ly_do_chua_du,
            # Mẫu số thật — lớp 💎 Định giá không có nguồn nên tối đa là 4/5.
            "so_lop_da_cham": result.so_lop_da_cham,
            "session_date": result.session_date,
            # Khung phân loại — FE hiện ở phần chú thích (spec §5.2).
            "lop_phu_quyet": sorted(LOP_PHU_QUYET),
            "lop_diem_tru": sorted(LOP_DIEM_TRU),
        }

    async def mau_thuan(self, user_id: uuid.UUID, symbol: str) -> dict:
        """``GET /cap6/mau-thuan/{symbol}`` — bảng mâu thuẫn 2 phe của một mã."""
        await self._require_progress(user_id)
        ma = (symbol or "").strip().upper()
        if not ma:
            raise BadRequestError("Thiếu mã cổ phiếu")
        result = await self._mau_thuan.doc(ma)
        return {"symbol": ma, **self._mau_thuan_out(result)}

    # ══════════════════════════════════════════════════
    # Ô nhận định trên lệnh mua (spec §6) + nút Không mua (spec §7)
    # ══════════════════════════════════════════════════

    @staticmethod
    def _validate_muc(conflict_level: str | None) -> str:
        if conflict_level is None or conflict_level not in MUC_VALUES:
            raise BadRequestError(
                "conflict_level phải là 1 trong: " + ", ".join(sorted(MUC_VALUES))
            )
        return conflict_level

    async def _get_kehoach_by_order(self, order_id: uuid.UUID) -> OrderKehoach | None:
        result = await self._session.execute(
            select(OrderKehoach).where(OrderKehoach.order_id == order_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    def _con_ghi_duoc(order: VirtualOrder, now: datetime) -> bool:
        """Nhận định của lệnh này còn ghi được không (xem docstring module)."""
        if order.status != OrderStatus.FILLED:
            return True
        return now - _as_utc(order.created_at) <= CUA_SO_CHOT_NHAN_DINH

    async def record_kehoach(
        self, user_id: uuid.UUID, order_id: uuid.UUID, *, conflict_level: str
    ) -> OrderKehoach:
        """``POST /cap6/kehoach`` — ghi mức nhận định mâu thuẫn cho 1 lệnh MUA.

        Cộng dồn lên kế hoạch Cấp 1-5 của chính lệnh đó (404 nếu chưa có kế
        hoạch Cấp 1). ``had_conflict``/``had_veto``/``veto_layers`` do SERVER
        suy lại từ AI Insight của mã — client không gửi lên.

        ★ Ghi nhận định cho một lệnh KHÔNG mâu thuẫn không phải lỗi: điều kiện
        hiện bảng là luật GIAO DIỆN (spec §5.1), và 4xx ở đây chỉ biến một lần
        tự soi vô hại thành luồng gãy. Lệnh đó đơn giản không được đếm vào cổng
        (``had_conflict=False``).
        """
        await self._require_progress(user_id)
        muc = self._validate_muc(conflict_level)

        order = (
            await self._session.execute(
                select(VirtualOrder).where(VirtualOrder.id == order_id)
            )
        ).scalar_one_or_none()
        if order is None or order.user_id != user_id:
            raise NotFoundError("lệnh")
        if order.side != OrderSide.BUY:
            raise BadRequestError("Nhận định mâu thuẫn chỉ ghi cho lệnh MUA")

        kehoach = await self._get_kehoach_by_order(order_id)
        if kehoach is None:
            raise NotFoundError("kế hoạch Cấp 1 — cần ghi vùng mua trước")

        result = await self._mau_thuan.doc(order.symbol or "")
        had_conflict, had_veto, veto_layers = self._suy_co(result)

        # ★★ KHOÁ CHỐNG BỊA TIẾN ĐỘ — cố ý NẰM NGOÀI mọi nhánh "đã có nhận
        # định": lần ghi ĐẦU TIÊN sau khi biết giá cũng phải bị chặn, không chỉ
        # lần sửa (xem docstring module — đây là chỗ Cấp 7 từng sai).
        giong_het = (
            kehoach.conflict_level == muc
            and kehoach.had_conflict == had_conflict
            and kehoach.had_veto == had_veto
            and (kehoach.veto_layers or []) == veto_layers
        )
        if giong_het:
            return kehoach  # gọi lại do mạng là no-op, không bao giờ 409
        if not self._con_ghi_duoc(order, datetime.now(UTC)):
            raise ConflictError(_COPY_KHOA_NHAN_DINH)

        kehoach.conflict_level = muc
        kehoach.had_conflict = had_conflict
        kehoach.had_veto = had_veto
        kehoach.veto_layers = veto_layers
        await self._session.flush()
        await self._session.refresh(kehoach)
        return kehoach

    @staticmethod
    def _suy_co(result: MauThuanResult) -> tuple[bool | None, bool | None, list | None]:
        """3 cờ SERVER ghi lên ``order_kehoach`` / ``cap6_skip``.

        ★ Chưa chấm được lớp nào ⇒ cả ba để **NULL**, không phải False: "hệ chưa
        có dữ liệu về mã này" và "hệ đã kiểm, mã này không có mâu thuẫn" là hai
        câu khác hẳn, và cái sau là câu ta chưa có quyền nói.
        """
        if result.chua_du_du_lieu:
            return None, None, None
        return (
            result.co_mau_thuan,
            result.phu_quyet_kich_hoat,
            list(result.lop_phu_quyet_xau),
        )

    def kehoach_out(self, kehoach: OrderKehoach) -> dict:
        """Khối Cấp 6 đã ghi trên 1 lệnh — cho panel/Kết sổ đọc lại."""
        muc = kehoach.conflict_level
        return {
            "id": kehoach.id,
            "order_id": kehoach.order_id,
            "had_conflict": kehoach.had_conflict,
            "conflict_level": muc,
            "conflict_level_ten": MUC_LABELS.get(muc or "") or None,
            "had_veto": kehoach.had_veto,
            "veto_layers": list(kehoach.veto_layers or []) if kehoach.veto_layers is not None else None,
            "veto_layers_ten": (
                [lop_ten(lop) for lop in kehoach.veto_layers]
                if kehoach.veto_layers is not None
                else None
            ),
            "khoi_luong_pct_von": kehoach.pct_von,
            "muc_tu_tin": kehoach.muc_tu_tin,
            "nhat_quan": self._nhat_quan_lenh(kehoach),
        }

    async def skip(self, user_id: uuid.UUID, symbol: str, *, conflict_level: str) -> dict:
        """``POST /cap6/skip`` — nút «Không mua lần này» (spec §7).

        Ghi nhận quyết định đứng ngoài, lấy mức nhận định đã chọn LÀM LÝ DO
        (không hỏi thêm). ★ Cách nhẹ: KHÔNG theo dõi giá mã sau đó (spec §7/§13
        — tránh phức tạp và tránh dạy tiếc nuối).
        """
        await self._require_progress(user_id)
        muc = self._validate_muc(conflict_level)
        ma = (symbol or "").strip().upper()
        if not ma:
            raise BadRequestError("Thiếu mã cổ phiếu")

        result = await self._mau_thuan.doc(ma)
        _had_conflict, had_veto, _veto_layers = self._suy_co(result)

        row = Cap6Skip(
            user_id=user_id,
            symbol=ma,
            at=datetime.now(UTC),
            conflict_level=muc,
            had_veto=had_veto,
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return {
            "id": row.id,
            "symbol": row.symbol,
            "at": row.at,
            "conflict_level": row.conflict_level,
            "conflict_level_ten": MUC_LABELS[row.conflict_level],
            "had_veto": row.had_veto,
        }

    # ══════════════════════════════════════════════════
    # Nguồn dữ liệu để tính lại
    # ══════════════════════════════════════════════════

    async def _filled_buys(self, user_id: uuid.UUID) -> list[VirtualOrder]:
        result = await self._session.execute(
            select(VirtualOrder)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.mode == "thuc_chien",
                VirtualOrder.side == OrderSide.BUY,
                VirtualOrder.status == OrderStatus.FILLED,
            )
            .order_by(VirtualOrder.created_at.asc())
        )
        return list(result.scalars().all())

    async def _kehoach_mau_thuan(self, user_id: uuid.UUID) -> list[OrderKehoach]:
        """Kế hoạch của các lệnh mua ĐÃ KHỚP có ghi mức nhận định Cấp 6.

        ★ KHÔNG lọc theo ``entered_at``: ``conflict_level`` chỉ có thể do
        ``record_kehoach`` ở trên ghi, mà hàm đó đòi một hàng ``Cap6Progress``
        — nên hàng nào mang nó thì đương nhiên là hàng Cấp-6-era (cùng lý lẽ
        Cấp 4/5 dùng).
        """
        buys = await self._filled_buys(user_id)
        if not buys:
            return []
        rows = (
            await self._session.execute(
                select(OrderKehoach).where(
                    OrderKehoach.order_id.in_([o.id for o in buys]),
                    OrderKehoach.conflict_level.is_not(None),
                )
            )
        ).scalars().all()
        return list(rows)

    async def _skips(self, user_id: uuid.UUID) -> list[Cap6Skip]:
        result = await self._session.execute(
            select(Cap6Skip)
            .where(Cap6Skip.user_id == user_id)
            .order_by(Cap6Skip.at.asc())
        )
        return list(result.scalars().all())

    async def _closed_pairs(
        self, user_id: uuid.UUID
    ) -> list[tuple[OrderKehoach | None, OrderKetso]]:
        """Mọi lượt đã đóng: ``(kế hoạch của lệnh MUA khớp cặp, kết sổ)``.

        Ghép lệnh BÁN với lệnh MUA bằng ĐÚNG luật của Cấp 1
        (``Cap1Service._find_matching_buy``: lệnh mua đã khớp GẦN NHẤT cùng tài
        khoản + mã, tại/trước lệnh bán) — cùng luật đã sinh ra ``pnl_pct`` của
        chính hàng ``order_ketso`` đó. Ghép trong bộ nhớ (3 truy vấn) thay vì 1
        truy vấn/lệnh bán.
        """
        ketso_rows = (
            await self._session.execute(
                select(OrderKetso, VirtualOrder)
                .join(VirtualOrder, VirtualOrder.id == OrderKetso.order_id)
                .where(
                    VirtualOrder.user_id == user_id,
                    VirtualOrder.mode == "thuc_chien",
                    VirtualOrder.side == OrderSide.SELL,
                )
            )
        ).all()
        if not ketso_rows:
            return []

        buys = await self._filled_buys(user_id)
        kehoach_rows = (
            (
                await self._session.execute(
                    select(OrderKehoach).where(
                        OrderKehoach.order_id.in_([o.id for o in buys])
                    )
                )
            )
            .scalars()
            .all()
            if buys
            else []
        )
        kehoach_by_order = {row.order_id: row for row in kehoach_rows}

        out: list[tuple[OrderKehoach | None, OrderKetso]] = []
        for ketso, sell in ketso_rows:
            candidates = [
                o
                for o in buys
                if o.account_id == sell.account_id
                and o.symbol == sell.symbol
                and _as_utc(o.created_at) <= _as_utc(sell.created_at)
            ]
            if not candidates:
                continue
            buy = max(candidates, key=lambda o: _as_utc(o.created_at))
            out.append((kehoach_by_order.get(buy.id), ketso))
        return out

    # ══════════════════════════════════════════════════
    # "Xử lý nhất quán" — luật đếm (spec §2/§11)
    # ══════════════════════════════════════════════════

    @staticmethod
    def _nhat_quan_lenh(kehoach: OrderKehoach) -> bool | None:
        """Lệnh MUA này có "xử lý nhất quán" không.

        ``None`` = không xét được (không có mâu thuẫn, chưa chấm được mã, mức
        nằm ngoài hai mẫu spec liệt kê, hoặc chưa biết khối lượng). ★ ``None``
        KHÔNG BAO GIỜ bị tính là ``False``: nó không trừ, không cộng.
        """
        if not kehoach.had_conflict:
            return None
        muc = kehoach.conflict_level
        if muc == MucMauThuan.NHE.value:
            # "Nhẹ → vào bình thường": đã mua là đã nhất quán.
            return True
        if muc != MucMauThuan.NGHIEM.value:
            # ``ngai``/``chua_ro`` — spec không định nghĩa mẫu ✓ nào.
            return None
        pct = kehoach.pct_von
        if pct is None:
            # Chưa biết khối lượng ⇒ chưa xét được "mua nhỏ hay mua lớn".
            return None
        return float(pct) <= NGUONG_MUA_NHO_PCT

    @staticmethod
    def _nhat_quan_skip(skip: Cap6Skip) -> bool:
        """«Không mua» ở mức nghiêm trọng là mẫu ✓ của spec §2.

        Đứng ngoài ở mức nhẹ/đáng ngại/chưa rõ KHÔNG bị tính là lệch — nó chỉ
        không phải mẫu spec đếm.
        """
        return skip.conflict_level == MucMauThuan.NGHIEM.value

    def _dem_nhat_quan(
        self, kehoach_rows: Sequence[OrderKehoach], skips: Sequence[Cap6Skip]
    ) -> tuple[int, int]:
        """``(so_lan_xu_ly_nhat_quan, so_lan_xu_ly_veto_nhat_quan)``.

        Ô thứ hai là TẬP CON của ô thứ nhất: một lần chỉ được tính vào veto khi
        chính nó đã được tính là nhất quán.
        """
        nhat_quan = 0
        veto = 0
        for kehoach in kehoach_rows:
            if self._nhat_quan_lenh(kehoach) is not True:
                continue
            nhat_quan += 1
            if kehoach.had_veto:
                veto += 1
        for skip in skips:
            if not self._nhat_quan_skip(skip):
                continue
            nhat_quan += 1
            if skip.had_veto:
                veto += 1
        return nhat_quan, veto

    # ══════════════════════════════════════════════════
    # Tổng lãi lệnh Cấp 6 — CHỈ hiển thị, KHÔNG phải cổng
    # ══════════════════════════════════════════════════

    async def _tong_lai_pct(
        self, progress: Cap6Progress, pairs: Sequence[tuple[OrderKehoach | None, OrderKetso]]
    ) -> float | None:
        """Σ(lãi/lỗ VND) ÷ Σ(vốn) của mọi lệnh ĐÃ ĐÓNG sau khi vào Cấp 6, tính %.

        ★ ``None`` = chưa có lệnh Cấp-6 nào đóng — KHÔNG phải 0. Vốn của một
        lượt suy ngược từ chính ``pnl_vnd``/``pnl_pct`` của hàng kết sổ (cùng
        một nguồn, nên không thể lệch với con số Kết sổ đang hiện); lượt có
        ``pnl_pct == 0`` không cho suy ra vốn nên bị loại khỏi CẢ tử số lẫn mẫu
        số thay vì bị gán vốn 0.
        """
        entered = _as_utc(progress.entered_at)
        tong_lai = 0.0
        tong_von = 0.0
        for _kehoach, ketso in pairs:
            if _as_utc(ketso.closed_at) < entered:
                continue
            pnl_pct = float(ketso.pnl_pct)
            pnl_vnd = float(ketso.pnl_vnd)
            if pnl_pct == 0.0:
                continue
            von = pnl_vnd / (pnl_pct / 100.0)
            if von <= 0:
                continue
            tong_lai += pnl_vnd
            tong_von += von
        if tong_von <= 0:
            return None
        return round(tong_lai / tong_von * 100.0, 2)

    # ══════════════════════════════════════════════════
    # Recompute + nhiệm vụ
    # ══════════════════════════════════════════════════

    async def _recompute_progress(self, user_id: uuid.UUID, progress: Cap6Progress) -> dict:
        kehoach_rows = await self._kehoach_mau_thuan(user_id)
        skips = await self._skips(user_id)
        pairs = await self._closed_pairs(user_id)

        nhat_quan, veto = self._dem_nhat_quan(kehoach_rows, skips)
        progress.so_lan_xu_ly_nhat_quan = nhat_quan
        progress.so_lan_xu_ly_veto_nhat_quan = veto
        progress.tong_lai_lenh_cap6_pct = await self._tong_lai_pct(progress, pairs)

        await self._session.flush()
        await self._session.refresh(progress)
        return self._progress_out(progress)

    @staticmethod
    def _dat_nhiem_vu(progress: Cap6Progress) -> bool:
        """Cổng lên cấp — THUẦN HÀNH VI, không đọc lãi (spec §2/§3)."""
        return (
            progress.so_lan_xu_ly_nhat_quan >= MUC_TIEU_NHAT_QUAN
            and progress.so_lan_xu_ly_veto_nhat_quan >= MUC_TIEU_VETO
        )

    @classmethod
    def _progress_out(cls, progress: Cap6Progress) -> dict:
        return {
            "id": progress.id,
            "user_id": progress.user_id,
            "entered_at": progress.entered_at,
            "so_lan_xu_ly_nhat_quan": progress.so_lan_xu_ly_nhat_quan,
            "so_lan_xu_ly_veto_nhat_quan": progress.so_lan_xu_ly_veto_nhat_quan,
            # Lên wire để FE không hard-code hai ngưỡng này.
            "muc_tieu_nhat_quan": MUC_TIEU_NHAT_QUAN,
            "muc_tieu_veto": MUC_TIEU_VETO,
            # ★ null = CHƯA có lệnh đã đóng. KHÔNG phải 0.
            "tong_lai_lenh_cap6_pct": progress.tong_lai_lenh_cap6_pct,
            "da_xem_tour_mauthuan": progress.da_xem_tour_mauthuan,
            "dat_nhiem_vu": cls._dat_nhiem_vu(progress),
            "graduated_at": progress.graduated_at,
            "time_to_graduate_hours": progress.time_to_graduate_hours,
        }

    # ══════════════════════════════════════════════════
    # Phân tích danh mục — khối ⑭ + ⑮ (spec §9)
    # ══════════════════════════════════════════════════

    @staticmethod
    def _khoi_14(kehoach_rows: Sequence[OrderKehoach]) -> dict:
        """Khối ⑭ — nhận định có khớp hành động không (CHỈ soi khối lượng).

        Spec §4.3/§9: **KHÔNG soi cắt lỗ** (cắt lỗ chỉ là chọn cách tính, không
        phản ánh mức thận trọng).

        ★ ``khop`` ba trạng thái: ``True``/``False`` khi so được, ``None`` khi
        KHÔNG so được — mức chưa có lệnh nào, mức ``chua_ro`` (không nằm trên
        thang nặng dần), hoặc mức nhẹ nhất đang có dữ liệu (chưa có mức nào nhẹ
        hơn để so). Trả ``True`` cho hàng chưa so được sẽ là một lời khen user
        chưa kiếm được.
        """
        kl_theo_muc: dict[str, list[float]] = {m: [] for m in MUC_LABELS}
        for kehoach in kehoach_rows:
            if not kehoach.had_conflict:
                continue
            muc = kehoach.conflict_level
            if muc not in kl_theo_muc or kehoach.pct_von is None:
                continue
            kl_theo_muc[muc].append(float(kehoach.pct_von))

        tb: dict[str, float | None] = {
            muc: (round(sum(vals) / len(vals), 1) if vals else None)
            for muc, vals in kl_theo_muc.items()
        }

        rows: list[dict] = []
        for muc in (*MUC_NANG_DAN, MucMauThuan.CHUA_RO.value):
            n = len(kl_theo_muc[muc])
            khop: bool | None = None
            if muc in MUC_NANG_DAN and tb[muc] is not None:
                nhe_hon = [
                    tb[m]
                    for m in MUC_NANG_DAN[: MUC_NANG_DAN.index(muc)]
                    if tb[m] is not None
                ]
                if nhe_hon:
                    khop = all(tb[muc] <= x for x in nhe_hon)  # type: ignore[operator]
            rows.append(
                {
                    "muc": muc,
                    "muc_ten": MUC_LABELS[muc],
                    "so_lenh": n,
                    # ★ None = mức này chưa có lệnh nào (≠ mua 0% vốn).
                    "kl_tb_pct_von": tb[muc],
                    "khop": khop,
                }
            )

        co_du_lieu = [m for m in MUC_NANG_DAN if tb[m] is not None]
        du_mau = len(co_du_lieu) >= 2
        return {
            "rows": rows,
            "du_mau": du_mau,
            "giai_thich": _KHOI_14_GIAI_THICH,
            "nhan_xet": Cap6Service._khoi_14_nhan_xet(tb, du_mau),
        }

    @staticmethod
    def _khoi_14_nhan_xet(tb: dict[str, float | None], du_mau: bool) -> str | None:
        """Câu nhận xét SERVER dựng cho khối ⑭ (§C12c: không hiện số trơ)."""
        if not du_mau:
            return None
        co = [(m, tb[m]) for m in MUC_NANG_DAN if tb[m] is not None]
        nang_nhat, kl_nang_nhat = co[-1]
        cao_nhat = max(co, key=lambda x: (x[1], MUC_NANG_DAN.index(x[0])))
        if cao_nhat[0] == nang_nhat and len(co) >= 2 and kl_nang_nhat > min(x[1] for x in co):
            return (
                f'Khi bạn đọc mâu thuẫn "{MUC_LABELS[nang_nhat].lower()}", đáng lẽ '
                f"phải mua ít nhất — nhưng bạn lại mua nhiều nhất ({kl_nang_nhat}% "
                'vốn). Đây là bẫy "đắn đo trong đầu nhưng tay vẫn mua lớn": nhận '
                "định nghiêm túc mà hành động không đổi thì nhận định thành vô nghĩa."
            )
        return (
            "Khối lượng của bạn giảm dần khi mâu thuẫn nặng dần — hành động đang "
            "khớp với nhận định."
        )

    def _khoi_15(
        self,
        pairs: Sequence[tuple[OrderKehoach | None, OrderKetso]],
        skips: Sequence[Cap6Skip],
    ) -> dict:
        """Khối ⑮ — kết quả theo mức nhận định + số lần đứng ngoài (spec §9)."""
        theo_muc: dict[str, list[float]] = {m: [] for m in MUC_LABELS}
        for kehoach, ketso in pairs:
            if kehoach is None or not kehoach.had_conflict:
                continue
            muc = kehoach.conflict_level
            if muc not in theo_muc:
                continue
            theo_muc[muc].append(float(ketso.pnl_pct))

        rows: list[dict] = []
        for muc in (*MUC_NANG_DAN, MucMauThuan.CHUA_RO.value):
            pnls = theo_muc[muc]
            n = len(pnls)
            so_thang = sum(1 for p in pnls if p > 0)
            du_mau = n >= MIN_LENH_TY_LE_THANG
            rows.append(
                {
                    "muc": muc,
                    "muc_ten": MUC_LABELS[muc],
                    "so_lenh": n,
                    "so_lenh_thang": so_thang,
                    # ★ None = chưa đủ lệnh để kết luận (≠ 0%).
                    "ty_le_thang_pct": round(so_thang / n * 100.0, 1) if du_mau else None,
                    "du_mau": du_mau,
                }
            )

        so_lan_nghiem_khong_mua = sum(
            1 for s in skips if s.conflict_level == MucMauThuan.NGHIEM.value
        )
        return {
            "rows": rows,
            "so_lan_nghiem_khong_mua": so_lan_nghiem_khong_mua,
            "so_lan_khong_mua": len(skips),
            "so_lenh_toi_thieu": MIN_LENH_TY_LE_THANG,
            "giai_thich": _KHOI_15_GIAI_THICH,
            "nhan_xet": self._khoi_15_nhan_xet(rows, so_lan_nghiem_khong_mua),
        }

    @staticmethod
    def _khoi_15_nhan_xet(rows: Sequence[dict], so_lan_nghiem_khong_mua: int) -> str | None:
        """Câu nhận xét SERVER dựng cho khối ⑮ (§C12c)."""
        by_muc = {r["muc"]: r for r in rows}
        nhe = by_muc[MucMauThuan.NHE.value]
        nghiem = by_muc[MucMauThuan.NGHIEM.value]
        khen = (
            f" Đáng khen: {so_lan_nghiem_khong_mua} lần đọc \"nghiêm trọng\" bạn đã "
            "đứng ngoài — đó là kỷ luật đúng."
            if so_lan_nghiem_khong_mua > 0
            else ""
        )
        if nhe["du_mau"] and nghiem["du_mau"]:
            if nhe["ty_le_thang_pct"] > nghiem["ty_le_thang_pct"]:
                return (
                    "Bản năng đọc mâu thuẫn của bạn khá chuẩn: thấy \"nhẹ\" thì thắng "
                    f"{nhe['ty_le_thang_pct']}%, thấy \"nghiêm trọng\" mà vẫn vào thì "
                    f"chỉ {nghiem['ty_le_thang_pct']}%.{khen}"
                )
            return (
                f"Lệnh bạn đọc \"nhẹ\" thắng {nhe['ty_le_thang_pct']}%, còn lệnh đọc "
                f"\"nghiêm trọng\" mà vẫn vào thắng {nghiem['ty_le_thang_pct']}% — "
                "lần này kết quả chưa xếp theo nhận định của bạn. Đây là mẫu nhỏ, "
                f"đừng vội kết luận về bản năng đọc của mình.{khen}"
            )
        if khen:
            return khen.strip()
        return None

    async def phan_tich(self, user_id: uuid.UUID) -> dict:
        """``GET /cap6/phan-tich`` — khối ⑭ + khối ⑮ (spec §9)."""
        progress = await self._require_progress(user_id)
        await self._recompute_progress(user_id, progress)

        kehoach_rows = await self._kehoach_mau_thuan(user_id)
        skips = await self._skips(user_id)
        pairs = await self._closed_pairs(user_id)
        return {
            "khoi_14": self._khoi_14(kehoach_rows),
            "khoi_15": self._khoi_15(pairs, skips),
        }

    # ══════════════════════════════════════════════════
    # Tốt nghiệp
    # ══════════════════════════════════════════════════

    async def graduate(self, user_id: uuid.UUID) -> dict:
        """Tốt nghiệp Cấp 6 — 1/1 nhiệm vụ, THUẦN HÀNH VI (spec §3).

        ★ Không có bất kỳ điều kiện lãi nào ở đây, kể cả điều kiện mềm.
        """
        progress = await self._require_progress(user_id)
        await self._recompute_progress(user_id, progress)

        if not self._dat_nhiem_vu(progress):
            raise ConflictError(
                "Chưa hoàn thành nhiệm vụ Cấp 6: cần "
                f"{MUC_TIEU_NHAT_QUAN} lần xử lý mâu thuẫn nhất quán, trong đó "
                f"{MUC_TIEU_VETO} lần gặp lớp phủ quyết rất xấu"
            )

        if progress.graduated_at is None:
            now = datetime.now(UTC)
            progress.graduated_at = now
            progress.time_to_graduate_hours = (
                now - _as_utc(progress.entered_at)
            ).total_seconds() / 3600.0
            await self._session.flush()
            await self._session.refresh(progress)

        return await self._recompute_progress(user_id, progress)
