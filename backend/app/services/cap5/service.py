"""Cấp 5 «Lão luyện — Săn mã» service — màn Săn mã (5 bộ lọc + lọc sàn),
Watchlist có điểm đồng thuận 5 lớp, 2 nhiệm vụ song song, Phân tích danh mục
(khối ⑫ + ⑬), tốt nghiệp.

Bài học một câu (spec §1): *"Không chờ mã đến — chủ động đi săn. Săn nhiều,
chọn kỹ, không mua vội."*

★★ **CẤP 5 CŨ ĐÃ NGHỈ HƯU HOÀN TOÀN.** Verdict hệ gợi ý + phân loại 4 ô
(«đúng/sai × thắng/thua»), nhật ký "đứng ngoài có chủ đích" + chấm né đúng/hụt
sau 5 phiên, và "Thách thức Lão luyện" 3 điều kiện KHÔNG còn ở đây: bảng
``standby_decision``, 5 cột ``verdict_*``/``o_4``/``ly_do_sua`` trên
``order_ketso`` và 4 cột nhiệm vụ cũ trên ``cap5_progress`` bị bỏ ở revision
``b2e6f4a17c93``. Spec §11 đẩy "biết khi nào KHÔNG mua (kỷ luật đứng ngoài)" và
"xử lý mâu thuẫn giữa các lớp" sang Cấp 6+.

★ ``KHAU_VI_TRAN_PCT``/``KHAU_VI_LABELS`` GIỮ NGUYÊN Ở FILE NÀY dù Cấp 5 mới
không còn dùng: ``app.services.cap8.service`` import đúng hai bảng này (và
``tests/test_cap8.py`` khẳng định ``KHAU_VI_TRAN_PCT is CAP5_TRAN`` — cùng MỘT
đối tượng, không phải bản sao). Xoá chúng khỏi đây là bẻ Cấp 8.

═══════════════════════════════════════════════════════════════════
HAI NHIỆM VỤ — SONG SONG, ĐỘC LẬP (mockup ``iqx-cap5-hanhtrinh.html``)
═══════════════════════════════════════════════════════════════════

  ① «Săn 10 mã vào Watchlist» → ``so_ma_da_san >= 10``
  ② «Mua 5 mã từ Watchlist»   → ``so_ma_mua_tu_watchlist >= 5``

② KHÔNG bị gác sau ①. Tốt nghiệp = 2/2. ``task_N_done_at`` một khi đã đóng dấu
thì KHÔNG bao giờ bị rút lại (luật chung Cấp 0-4).

**MÂU THUẪN ĐÃ BIẾT TRONG BỘ SPEC — chốt theo mockup.** ``IQX-Cap5-Spec.md`` §2
mô tả nhiệm vụ ② là "xem hết tour Săn mã", còn §12 lại đòi thêm ngưỡng "tổng lãi
> 3%" mà chính §2 nói KHÔNG đo lãi. Mockup Hành trình (nguồn chuẩn về bố cục +
nhãn, và là thứ FE đã dựng) vẽ hai nhiệm vụ SĂN 10 / MUA 5. Chọn mockup cũng bịt
luôn một lỗ gian lận: tour "Bỏ qua" giữa chừng gọi thẳng ``onComplete`` ở engine
tour của FE, nên lấy tour làm cổng tốt nghiệp là tặng không một nhiệm vụ. Cờ
``da_xem_tour_sanma`` vẫn được ghi (spec §7 cần nó để tour tự bật đúng một lần)
nhưng KHÔNG phải cổng.

**Mọi con số đều được tính lại server-side ở mọi lần đọc.** Client không bao giờ
gửi lên ``so_ma_da_san``/``so_ma_mua_tu_watchlist``/``best_filter``. Nguồn sự
thật:

  · ``so_ma_da_san``            ← đếm hàng ``cap5_hunt_log`` (không đếm trên
    ``watchlist_items``: user xoá mã bất cứ lúc nào, nhiệm vụ đã đạt không được
    tụt lại — xem docstring ``app.models.cap5.Cap5HuntLog``).
  · ``so_ma_mua_tu_watchlist``  ← số MÃ PHÂN BIỆT có lệnh MUA đã khớp (Thực
    chiến) đặt SAU khi mã đó được săn. Đếm trên ``virtual_orders`` chứ không
    trên ``order_kehoach``: kế hoạch Cấp 1 là một form user có thể không điền,
    và nhiệm vụ này đo hành vi MUA, không đo việc điền form.
  · ``best_filter``             ← khối ⑫ (cần ≥3 lệnh đã đóng/bộ lọc mới dám
    kết luận; chưa đủ ⇒ NULL, không bao giờ là "một bộ lọc bất kỳ").

``order_kehoach.from_watchlist``/``hunt_filter`` được service ĐÓNG DẤU (không
nhận từ client) mỗi lần recompute, cho các lệnh mua Cấp-5-era: True = mã đến từ
săn, False = đã kiểm và không phải. Lệnh đặt TRƯỚC khi user vào Cấp 5 để NGUYÊN
NULL — nói "lệnh này không đến từ săn mã" về lịch sử Cấp 1-4 là một câu bịa
(xem revision ``b2e6f4a17c93``).

═══════════════════════════════════════════════════════════════════
★★ LUẬT 1 — "CHƯA BIẾT" ≠ 0, ÁP CHO TỪNG BỘ LỌC
═══════════════════════════════════════════════════════════════════

Bản kiểm dữ liệu đầy đủ của 5 bộ lọc nằm ở đầu ``app.services.cap5.hunt``. Tóm
lại: 3 bộ lọc chạy trên nến ngày (``kl``/``dinh``/``tang``) TÍNH ĐƯỢC; 2 bộ lọc
dòng tiền (``ngoai``/``tudoanh``) **CHƯA CÓ NGUỒN** — backend chỉ lấy được chuỗi
mua ròng theo phiên cho từng mã một, hoặc bảng xếp hạng đã cộng gộp cả kỳ. Hai
bộ đó trả ``kha_dung=False`` + lý do tường minh, ``tong_so_ma=None``, ``items=[]``
— TUYỆT ĐỐI không phải "0 mã thoả". Tiêu chí lọc sàn "loại mã diện cảnh báo /
kiểm soát / hạn chế" cũng thiếu nguồn và tự khai ``ap_dung=False``.

Cùng luật đó áp cho điểm đồng thuận 5 lớp: AI Insight v2 KHÔNG có lớp 💎 Định
giá (xem ``app.services.cap5.consensus``), nên mã nào cũng chỉ chấm được tối đa
4/5 lớp và ``consensus_da_cham`` luôn đi kèm ``consensus_today``. Chưa chấm được
lớp nào ⇒ cả cụm để NULL, không ghi 0/5.

═══════════════════════════════════════════════════════════════════
Điểm đồng thuận: batch 1 lần/ngày, KHÔNG tức thời (spec §6.1/§10)
═══════════════════════════════════════════════════════════════════

``_refresh_consensus`` chấm lại một hàng watchlist **tối đa 1 lần/ngày lịch VN**
(mốc ``consensus_at``), và chỉ ĐỌC LẠI bản AI Insight đã lưu — không gọi AI.
Không có cron riêng: mẻ chấm chạy nhờ chính lần đọc đầu tiên trong ngày của user
(``GET /cap5/watchlist`` hoặc ``GET /cap5/progress``). Cách này giữ đúng hai điều
spec đòi (1 lần/ngày · không tức thời) mà không thêm hạ tầng, và mã của user
không hoạt động thì không tốn gì.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap1 import KhauViRuiRo, OrderKehoach, OrderKetso
from app.models.cap4 import Cap4Progress
from app.models.cap5 import (
    HUNT_FILTER_LABELS,
    Cap5HuntLog,
    Cap5Progress,
    HuntFilter,
    WatchlistStatus,
)
from app.models.symbol import Symbol
from app.models.virtual_trading import OrderSide, OrderStatus, VirtualOrder
from app.models.watchlist import WatchlistItem
from app.services.cap1.service import Cap1Service
from app.services.cap5.consensus import (
    NGUONG_DANG_CHU_Y,
    SO_PHIEN_HIEU_LUC,
    TONG_SO_LOP,
    ConsensusResult,
    InsightConsensusSource,
)
from app.services.cap5.hunt import (
    FILTER_SPECS,
    TOP_N,
    HuntDataSource,
    HuntEngine,
    HuntResult,
    loc_san_tieu_chi,
)
from app.services.cap5.hunt_data import VciHuntDataSource

logger = logging.getLogger(__name__)

_VN_TZ = timezone(timedelta(hours=7))

#: Hai nhiệm vụ (song song). ``PATCH /cap5/task`` chỉ nhận 1 hoặc 2.
_TASK_NOS = (1, 2)

#: ① Săn ≥ 10 mã vào Watchlist (mockup ``.task .prog`` = "n/10 mã").
MUC_TIEU_SO_MA_SAN = 10
#: ② Mua ≥ 5 mã đã săn (mockup ``.task .prog`` = "n/5 mã").
MUC_TIEU_SO_MA_MUA = 5

#: Trần số mã trong Watchlist. ★ PHẢI khớp ``_MAX_ITEMS`` của
#: ``app.api.v1.endpoints.watchlist`` — cùng một bảng vật lý
#: ``watchlist_items``, hai trần khác nhau sẽ cho phép vượt trần bằng cách thêm
#: mã qua đường Cấp 5. ``test_cap5.py`` khẳng định hai hằng số bằng nhau.
MAX_WATCHLIST_ITEMS = 50

#: Khối ⑫ — số lệnh đã đóng tối thiểu cho MỘT bộ lọc trước khi dám xếp hạng
#: (spec §9: "Cần ≥3 lệnh/bộ lọc mới hiện").
MIN_LENH_KHOI_12 = 3

# ── Khẩu vị rủi ro → trần %vốn/lệnh ───────────────────
# ★ Cấp 5 mới KHÔNG dùng hai bảng này, nhưng ``app.services.cap8.service``
# import đúng chúng (và test_cap8 kiểm định danh đối tượng). Đây là NGUỒN DUY
# NHẤT của 10/20/30% trong repo — đừng nhân bản, đừng xoá.
KHAU_VI_TRAN_PCT: dict[str, float] = {
    KhauViRuiRo.THAN_TRONG.value: 10.0,
    KhauViRuiRo.CAN_BANG.value: 20.0,
    KhauViRuiRo.TAN_CONG.value: 30.0,
}
KHAU_VI_LABELS: dict[str, str] = {
    KhauViRuiRo.THAN_TRONG.value: "Thận trọng",
    KhauViRuiRo.CAN_BANG.value: "Cân bằng",
    KhauViRuiRo.TAN_CONG.value: "Tấn công",
}

_HUNT_FILTER_VALUES: tuple[str, ...] = tuple(m.value for m in HuntFilter)

_NHAC_DANG_CHU_Y = (
    f"{NGUONG_DANG_CHU_Y}/{TONG_SO_LOP} lớp đang ủng hộ — đáng để bạn xem kỹ. "
    "Quyết định mua vẫn là của bạn."
)

#: ★ Câu thay thế khi điểm đã lưu KHÔNG còn bản phân tích trong cửa sổ phiên để
#: xác nhận. Câu trên nói "ĐANG ủng hộ" — thì hiện tại — nên dùng nó cho một
#: con số không ai xác nhận lại nhiều tháng là đúng lỗi C3.
_NHAC_DIEM_CU = (
    "Điểm này dựng từ bản phân tích 5 lớp đã cũ — chưa có bản mới nào trong "
    f"{SO_PHIEN_HIEU_LUC} phiên gần nhất, nên đừng đọc nó như tình trạng hôm nay. "
    "Mở AI Phân tích cho mã này để có bản mới."
)

_KHOI_13_GIAI_THICH = (
    "Phễu kỷ luật săn mã: bao nhiêu mã bạn săn về → bao nhiêu mã chờ được đến "
    f"≥{NGUONG_DANG_CHU_Y}/{TONG_SO_LOP} lớp ủng hộ → bao nhiêu mã bạn thực sự "
    "vào lệnh. Săn rộng rồi loại bớt mới là kỷ luật của thợ săn."
)

#: Cảnh báo riêng cho bộ lọc yếu nhất ở khối ⑫ (spec §9 gợi mẫu cho ``kl``).
_KHOI_12_CANH_BAO: dict[str, str] = {
    HuntFilter.NGOAI.value: (
        "Khối ngoại gom là dòng tiền dài hạn — vào theo mà thoát ngắn thì dễ lệch nhịp."
    ),
    HuntFilter.TU_DOANH.value: (
        "Tự doanh có thể gom để phòng hộ chứng quyền, không hẳn là đánh giá tốt về mã."
    ),
    HuntFilter.KL.value: (
        "Khối lượng đột biến dễ là sóng ngắn — cẩn thận mua đúng lúc đội lái ra hàng."
    ),
    HuntFilter.DINH.value: (
        "Vượt đỉnh dễ gặp đỉnh giả: giá vượt rồi tụt lại ngay trong vài phiên."
    ),
    HuntFilter.TANG.value: (
        "Tăng mạnh kèm khối lượng cao thường đã đi được một đoạn — vào muộn là rủi ro chính."
    ),
}


def _now_vn_date() -> date:
    return datetime.now(_VN_TZ).date()


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def _vn_date(dt: datetime | None) -> date | None:
    return _as_utc(dt).astimezone(_VN_TZ).date() if dt is not None else None


#: Đếm phiên (Mon-Fri) — dùng LẠI hàm của Cấp 1 để cả repo chỉ có MỘT quy tắc
#: đếm phiên (``so_phien_giu`` của Kết sổ đếm bằng đúng hàm này).
_count_trading_sessions = Cap1Service._count_trading_sessions


class Cap5Service:
    """Business logic cho Cấp 5 «Săn mã» (FREE, Thực chiến).

    ``hunt_source`` được tiêm vào để test chạy không cần mạng; mặc định là
    ``VciHuntDataSource`` (VCI gap-chart theo lô + cache Redis ngắn).
    """

    def __init__(
        self, session: AsyncSession, *, hunt_source: HuntDataSource | None = None
    ) -> None:
        self._session = session
        self._source: HuntDataSource = hunt_source or VciHuntDataSource()
        self._engine = HuntEngine(self._source)
        self._consensus = InsightConsensusSource(session)

    # ══════════════════════════════════════════════════
    # Progress row
    # ══════════════════════════════════════════════════

    async def _get_progress_row(self, user_id: uuid.UUID) -> Cap5Progress | None:
        result = await self._session.execute(
            select(Cap5Progress).where(Cap5Progress.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def _require_progress(self, user_id: uuid.UUID) -> Cap5Progress:
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 5")
        return progress

    async def get_progress(self, user_id: uuid.UUID) -> dict | None:
        """``GET /cap5/progress`` — hàng tiến trình đã tính lại, hoặc ``None``."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            return None
        return await self._recompute_progress(user_id, progress)

    async def enter(self, user_id: uuid.UUID) -> dict:
        """Vào Cấp 5 (idempotent) — yêu cầu đã tốt nghiệp Cấp 4."""
        progress = await self._get_progress_row(user_id)
        if progress is not None:
            return await self._recompute_progress(user_id, progress)

        cap4 = (
            await self._session.execute(
                select(Cap4Progress).where(Cap4Progress.user_id == user_id)
            )
        ).scalar_one_or_none()
        if cap4 is None:
            raise NotFoundError("tiến trình Cấp 4")
        if cap4.graduated_at is None:
            raise ConflictError("Chưa tốt nghiệp Cấp 4")

        progress = Cap5Progress(user_id=user_id, entered_at=datetime.now(UTC))
        self._session.add(progress)
        await self._session.flush()
        await self._session.refresh(progress)
        return await self._recompute_progress(user_id, progress)

    async def mark_task(self, user_id: uuid.UUID, task_no: int) -> dict:
        """``PATCH /cap5/task`` — cả 2 nhiệm vụ đều suy ra từ ``cap5_hunt_log`` /
        lệnh mua, nên endpoint này chỉ kích hoạt tính lại (idempotent, KHÔNG tự
        đóng dấu nhiệm vụ nào)."""
        if task_no not in _TASK_NOS:
            raise BadRequestError("task_no không hợp lệ")
        progress = await self._require_progress(user_id)
        return await self._recompute_progress(user_id, progress)

    async def mark_tour_sanma(self, user_id: uuid.UUID) -> dict:
        """``POST /cap5/tour-sanma`` — user đã đi HẾT 7 bước tour Săn mã (§7).

        ★ Chỉ được gọi ở bước cuối / nút "Xong". "Bỏ qua" giữa chừng KHÔNG gọi
        endpoint này (spec §2②). Cờ này KHÔNG phải cổng tốt nghiệp — xem
        docstring module — nên gian lận ở đây cũng không mở được Cấp 6; nó chỉ
        quyết định tour có tự bật lại lần sau hay không.
        """
        progress = await self._require_progress(user_id)
        progress.da_xem_tour_sanma = True
        await self._session.flush()
        return await self._recompute_progress(user_id, progress)

    # ══════════════════════════════════════════════════
    # Sổ săn mã + lệnh mua từ săn
    # ══════════════════════════════════════════════════

    async def _hunt_log(self, user_id: uuid.UUID) -> list[Cap5HuntLog]:
        result = await self._session.execute(
            select(Cap5HuntLog)
            .where(Cap5HuntLog.user_id == user_id)
            .order_by(Cap5HuntLog.first_hunted_at.asc())
        )
        return list(result.scalars().all())

    async def _filled_buys(self, user_id: uuid.UUID) -> list[VirtualOrder]:
        """Lệnh MUA đã khớp, chế độ Thực chiến (Cấp 5 là cấp Thực chiến)."""
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

    @staticmethod
    def _hunt_for_order(
        log_by_symbol: dict[str, Cap5HuntLog], order: VirtualOrder
    ) -> Cap5HuntLog | None:
        """Bản ghi săn của mã này NẾU nó được săn TRƯỚC khi lệnh được đặt.

        Săn sau khi mua thì không phải "mua từ Watchlist" — thứ tự thời gian là
        toàn bộ nội dung của nhiệm vụ ② ("săn → chờ chín → mới vào lệnh").
        """
        log = log_by_symbol.get((order.symbol or "").upper())
        if log is None:
            return None
        return log if _as_utc(log.first_hunted_at) <= _as_utc(order.created_at) else None

    async def _stamp_kehoach(
        self,
        user_id: uuid.UUID,
        progress: Cap5Progress,
        log_by_symbol: dict[str, Cap5HuntLog],
        buys: Sequence[VirtualOrder],
    ) -> None:
        """Đóng dấu ``from_watchlist``/``hunt_filter`` lên kế hoạch của các lệnh
        mua Cấp-5-era (spec §10 "Phân biệt rõ mã từ săn với mã user tự nhập").

        ★ Lệnh đặt TRƯỚC ``entered_at`` để nguyên NULL: khẳng định "không đến từ
        săn mã" về lịch sử Cấp 1-4 là bịa (xem revision ``b2e6f4a17c93``).
        """
        entered = _as_utc(progress.entered_at)
        order_ids = [o.id for o in buys if _as_utc(o.created_at) >= entered]
        if not order_ids:
            return
        rows = (
            await self._session.execute(
                select(OrderKehoach).where(OrderKehoach.order_id.in_(order_ids))
            )
        ).scalars().all()
        by_order = {row.order_id: row for row in rows}

        dirty = False
        for order in buys:
            if _as_utc(order.created_at) < entered:
                continue
            kehoach = by_order.get(order.id)
            if kehoach is None:
                continue
            # ★★ ĐÓNG DẤU MỘT LẦN. ``from_watchlist`` khác NULL nghĩa là lệnh
            # này ĐÃ được kiểm — không được kiểm lại. Recompute lại mỗi lần đọc
            # sẽ VIẾT LẠI LỊCH SỬ: user săn lại một mã cũ từ bộ lọc khác thì
            # ``log.hunt_filter`` đổi, và tỷ lệ thắng của các bộ lọc ở khối ⑫ bị
            # gán hồi tố cho những lệnh đã đóng từ lâu.
            if kehoach.from_watchlist is not None:
                continue
            log = self._hunt_for_order(log_by_symbol, order)
            from_watchlist = log is not None
            hunt_filter = log.hunt_filter if log is not None else None
            if kehoach.from_watchlist != from_watchlist or kehoach.hunt_filter != hunt_filter:
                kehoach.from_watchlist = from_watchlist
                kehoach.hunt_filter = hunt_filter
                dirty = True
        if dirty:
            await self._session.flush()

    # ══════════════════════════════════════════════════
    # Điểm đồng thuận 5 lớp (batch 1 lần/ngày)
    # ══════════════════════════════════════════════════

    async def _watchlist_rows(self, user_id: uuid.UUID) -> list[WatchlistItem]:
        result = await self._session.execute(
            select(WatchlistItem)
            .where(WatchlistItem.user_id == user_id)
            .order_by(WatchlistItem.sort_order.asc(), WatchlistItem.created_at.asc())
        )
        return list(result.scalars().all())

    async def _refresh_consensus(
        self, rows: Sequence[WatchlistItem]
    ) -> dict[str, ConsensusResult]:
        """Chấm điểm đồng thuận cho cả rổ, nhưng chỉ GHI cho hàng chưa chấm hôm nay.

        Trả về kết quả chi tiết theo mã (nuôi cụm 5 icon của §6.2). Việc GHI mới
        là thứ bị giới hạn 1 lần/ngày (spec §6.1 — không tức thời): đọc lại một
        payload Insight đã lưu thì không tốn gì và không gọi AI, nên cụm icon
        không phải chờ mẻ hôm sau mới hiện.

        ★ ``_watchlist_out`` vẫn chỉ vẽ cụm icon khi nó KHỚP với con số đã lưu —
        xem chú thích ở đó.
        """
        today = _now_vn_date()
        out = await self._consensus.cham_nhieu([r.symbol for r in rows])
        dirty = False
        for row in rows:
            if _vn_date(row.consensus_at) == today:
                continue
            ket = out.get(row.symbol.upper())
            if ket is None or ket.diem is None:
                # ★ Chưa chấm được lớp nào ⇒ KHÔNG ghi gì (giữ NULL, giữ luôn
                # điểm cũ nếu có). Ghi 0 ở đây là bịa "không lớp nào ủng hộ".
                continue
            if row.consensus_today is not None and row.consensus_today != ket.diem:
                row.consensus_prev = row.consensus_today
            row.consensus_today = ket.diem
            row.consensus_da_cham = ket.so_lop_da_cham
            row.consensus_at = datetime.now(UTC)
            row.status = ket.status
            dirty = True
        if dirty:
            await self._session.flush()
        return out

    # ══════════════════════════════════════════════════
    # Recompute + 2 nhiệm vụ
    # ══════════════════════════════════════════════════

    async def _recompute_progress(self, user_id: uuid.UUID, progress: Cap5Progress) -> dict:
        log = await self._hunt_log(user_id)
        log_by_symbol = {row.symbol.upper(): row for row in log}
        buys = await self._filled_buys(user_id)

        await self._stamp_kehoach(user_id, progress, log_by_symbol, buys)

        watchlist_rows = await self._watchlist_rows(user_id)
        await self._refresh_consensus(watchlist_rows)

        # ① độ rộng: đếm MÃ PHÂN BIỆT đã săn (bảng đã unique theo user+symbol).
        so_ma_da_san = len(log)
        # ② số mã đã săn rồi thực sự mua (phân biệt theo mã, không theo lệnh).
        mua_tu_san = {
            (o.symbol or "").upper()
            for o in buys
            if self._hunt_for_order(log_by_symbol, o) is not None
        }
        so_ma_mua = len(mua_tu_san)

        progress.so_ma_da_san = so_ma_da_san
        progress.so_ma_mua_tu_watchlist = so_ma_mua

        khoi_12 = await self._khoi_12(user_id)
        progress.best_filter = khoi_12["best_filter"]

        now = datetime.now(UTC)
        # Hai nhiệm vụ SONG SONG — không cái nào gác cái nào.
        if progress.task_1_done_at is None and so_ma_da_san >= MUC_TIEU_SO_MA_SAN:
            progress.task_1_done_at = now
        if progress.task_2_done_at is None and so_ma_mua >= MUC_TIEU_SO_MA_MUA:
            progress.task_2_done_at = now

        await self._session.flush()
        await self._session.refresh(progress)

        so_ma_cho_du_lop, so_ma_da_cham_diem = self._tang_giua_phieu(
            log_by_symbol, watchlist_rows
        )
        return self._progress_out(
            progress,
            so_ma_cho_du_lop=so_ma_cho_du_lop,
            so_ma_da_cham_diem=so_ma_da_cham_diem,
        )

    @staticmethod
    def _tang_giua_phieu(
        log_by_symbol: dict[str, Cap5HuntLog], rows: Sequence[WatchlistItem]
    ) -> tuple[int | None, int]:
        """Tầng giữa của phễu ⑬ **kèm mẫu số thật**: ``(so_ma, so_ma_da_cham)``.

        ``so_ma`` = số mã ĐÃ SĂN đang/vừa ở ≥4/5 lớp ủng hộ; ``so_ma_da_cham`` =
        số mã đã săn mà hệ THỰC SỰ có điểm đồng thuận để đếm.

        ★ ``so_ma is None`` = "chưa đo được", KHÔNG phải 0: khi CHƯA có mã săn
        nào được chấm (mẻ chấm chưa chạy, hoặc mã chưa từng có bản AI Insight)
        thì hệ không biết gì về tầng này. Vẽ tầng giữa = 0 sẽ nói "không mã nào
        chín" — một kết luận chưa ai tính.

        ★★ **VÌ SAO PHẢI TRẢ CẢ MẪU SỐ.** Cờ "đã chấm" là ANY chứ không thể là
        ALL: chấm được 1/10 mã cũng là một thông tin thật về mã đó. Nhưng nếu
        chỉ đưa con số đếm lên wire thì "1 mã chấm được, 9 mã chưa" và "10 mã
        chấm hết" trông y như nhau, và câu "N mã của bạn từng chín" thành một
        khẳng định về 9 mã chưa ai tính. Có hai lý do độc lập khiến con số này
        là CẬN DƯỚI, và mẫu số bắt được cả hai:
          · lược sử điểm đồng thuận không được lưu ⇒ chỉ nhìn được 2 lần chấm
            gần nhất (``consensus_today`` + ``consensus_prev``);
          · mã đã bị xoá khỏi Watchlist (mua rồi xoá — phễu ngược) thì không còn
            hàng nào để đọc điểm, dù nó ĐÃ từng chín.
        Mẫu số đo trên ``so_ma_da_san`` (tổng đã săn) chứ không trên số hàng
        Watchlist còn sống, nên nó bắt luôn cả trường hợp thứ hai.
        """
        if not log_by_symbol:
            return None, 0
        da_cham = 0
        dem = 0
        for row in rows:
            if row.symbol.upper() not in log_by_symbol:
                continue
            diem = [d for d in (row.consensus_today, row.consensus_prev) if d is not None]
            if not diem:
                continue
            da_cham += 1
            if max(diem) >= NGUONG_DANG_CHU_Y:
                dem += 1
        return (dem if da_cham else None), da_cham

    @staticmethod
    def _tang_giua_day_du(progress: Cap5Progress, so_ma_da_cham_diem: int) -> bool:
        """Con số tầng giữa có phải con số ĐỦ (≠ cận dưới) hay không.

        Đủ ⇔ mọi mã đã săn đều chấm được điểm. Chưa săn gì ⇒ ``False`` (không có
        gì để đo, và ``so_ma_cho_du_lop`` khi đó là ``None``).
        """
        return progress.so_ma_da_san > 0 and so_ma_da_cham_diem >= progress.so_ma_da_san

    @classmethod
    def _progress_out(
        cls,
        progress: Cap5Progress,
        *,
        so_ma_cho_du_lop: int | None,
        so_ma_da_cham_diem: int,
    ) -> dict:
        return {
            "id": progress.id,
            "user_id": progress.user_id,
            "entered_at": progress.entered_at,
            "task_1_done_at": progress.task_1_done_at,
            "task_2_done_at": progress.task_2_done_at,
            "so_ma_da_san": progress.so_ma_da_san,
            "so_ma_mua_tu_watchlist": progress.so_ma_mua_tu_watchlist,
            "so_ma_cho_du_lop": so_ma_cho_du_lop,
            # Mẫu số thật của tầng giữa — xem ``_tang_giua_phieu``.
            "so_ma_da_cham_diem": so_ma_da_cham_diem,
            "so_ma_cho_du_lop_day_du": cls._tang_giua_day_du(progress, so_ma_da_cham_diem),
            "muc_tieu_so_ma_san": MUC_TIEU_SO_MA_SAN,
            "muc_tieu_so_ma_mua": MUC_TIEU_SO_MA_MUA,
            "da_xem_tour_sanma": progress.da_xem_tour_sanma,
            "best_filter": progress.best_filter,
            "best_filter_ten": HUNT_FILTER_LABELS.get(progress.best_filter or "") or None,
            "graduated_at": progress.graduated_at,
            "time_to_graduate_hours": progress.time_to_graduate_hours,
        }

    # ══════════════════════════════════════════════════
    # Màn Săn mã (spec §5)
    # ══════════════════════════════════════════════════

    async def _universe(self) -> list[str]:
        """Rổ mã HOSE đang hoạt động — tiêu chí "chỉ HOSE" của lọc sàn (§5.2).

        Nguồn: bảng ``symbols`` nội bộ (``exchange``/``asset_type``/``is_index``/
        ``is_active``). Rổ rỗng ⇒ mọi bộ lọc báo "chưa đủ dữ liệu", KHÔNG báo
        "0 mã thoả".
        """
        result = await self._session.execute(
            select(Symbol.symbol)
            .where(
                func.upper(Symbol.exchange) == "HOSE",
                Symbol.is_active.is_(True),
                Symbol.is_index.is_(False),
                func.lower(func.coalesce(Symbol.asset_type, "stock")) == "stock",
            )
            .order_by(Symbol.symbol.asc())
        )
        return [row[0].upper() for row in result.all()]

    @staticmethod
    def _result_out(result: HuntResult) -> dict:
        """Một ``HuntResult`` → wire shape của FE (``sanMaTypes.HuntResult``).

        ``kha_dung`` là bản dịch trực tiếp của ``trang_thai``; bất biến
        "``tong_so_ma is None`` ⇔ chưa lọc được" được giữ nguyên qua tầng này.
        """
        kha_dung = result.trang_thai == "ok"
        return {
            "ma": result.bo_loc.ma,
            "icon": result.bo_loc.icon,
            "ten": result.bo_loc.ten,
            "mo_ta": result.bo_loc.mo_ta,
            "dieu_kien": result.bo_loc.dieu_kien,
            "xep_hang_theo": result.bo_loc.xep_hang_theo,
            "nguon_du_lieu": result.bo_loc.nguon_du_lieu,
            "kha_dung": kha_dung,
            "ly_do_chua_kha_dung": result.ly_do_thieu_du_lieu,
            "tong_so_ma": result.so_ma_thoa,
            "so_ma_trong_ro": result.so_ma_trong_ro,
            "so_ma_xet": result.so_ma_xet,
            "so_ma_truot_loc_san": result.so_ma_truot_loc_san,
            "so_ma_bo_qua_thieu_du_lieu": result.so_ma_bo_qua_thieu_du_lieu,
            # ★ Cờ "kết quả không đầy đủ" — FE không phải tự suy từ 3 con số
            # (và không được suy sai: nhánh "chưa lọc được" chỉ nổ khi TOÀN BỘ
            # rổ bị bỏ qua, một lô 40 mã lỗi thì vẫn ra "N mã thoả").
            "ket_qua_day_du": result.ket_qua_day_du,
            "canh_bao_thieu_du_lieu": result.canh_bao_thieu_du_lieu,
            "hien_thi_toi_da": TOP_N,
            "loc_san": loc_san_tieu_chi(),
            "items": result.items,
        }

    async def san_ma_index(self, user_id: uuid.UUID) -> dict:
        """``GET /cap5/san-ma`` — điều kiện lọc sàn + tình trạng 5 bộ lọc.

        KHÔNG quét cả sàn ở đây: chỉ hỏi từng bộ lọc "mày có nguồn dữ liệu
        không". Bộ lọc dòng tiền tự trả lời là KHÔNG (xem bản kiểm dữ liệu ở
        ``app.services.cap5.hunt``), nên user thấy dòng "chưa đủ dữ liệu" ngay
        trên màn, không phải bấm vào rồi mới nhận popup rỗng.
        """
        await self._require_progress(user_id)
        universe = await self._universe()
        bo_loc = [
            {
                "ma": spec.ma,
                "icon": spec.icon,
                "ten": spec.ten,
                "mo_ta": spec.mo_ta,
                "dieu_kien": spec.dieu_kien,
                "xep_hang_theo": spec.xep_hang_theo,
                "nguon_du_lieu": spec.nguon_du_lieu,
                **await self._kha_dung(ma, universe),
            }
            for ma, spec in FILTER_SPECS.items()
        ]
        return {
            "loc_san": loc_san_tieu_chi(),
            "so_ma_trong_ro": len(universe),
            "bo_loc": bo_loc,
            "hien_thi_toi_da": TOP_N,
        }

    async def _kha_dung(self, bo_loc: str, universe: Sequence[str]) -> dict:
        """Bộ lọc này có chạy được không — không quét sàn."""
        if not universe:
            return {
                "kha_dung": False,
                "ly_do_chua_kha_dung": (
                    "Chưa có danh sách mã HOSE trong dữ liệu nội bộ (bảng mã chưa "
                    "được nạp) — chưa lọc được, KHÔNG phải là không có mã nào thoả."
                ),
            }
        ket = await self._engine.probe(bo_loc, universe)
        return {"kha_dung": ket[0], "ly_do_chua_kha_dung": ket[1]}

    async def san_ma_result(self, user_id: uuid.UUID, bo_loc: str) -> dict:
        """``GET /cap5/san-ma/{bo_loc}`` — top 10 mã + dòng minh bạch (§5.4)."""
        await self._require_progress(user_id)
        if bo_loc not in FILTER_SPECS:
            raise NotFoundError(f"bộ lọc săn mã '{bo_loc}'")
        universe = await self._universe()
        result = await self._engine.run(bo_loc, universe)
        return self._result_out(result)

    # ══════════════════════════════════════════════════
    # Watchlist (spec §6)
    # ══════════════════════════════════════════════════

    async def _validate_symbol(self, symbol: str) -> str:
        """Cùng luật với ``POST /watchlist``: mã phải tồn tại, đang hoạt động,
        là cổ phiếu (không phải chỉ số)."""
        clean = (symbol or "").strip().upper()
        if not clean:
            raise BadRequestError("Thiếu mã cổ phiếu")
        row = (
            await self._session.execute(select(Symbol).where(Symbol.symbol == clean))
        ).scalar_one_or_none()
        if row is None or not row.is_active:
            raise BadRequestError(f"Mã {clean} không tồn tại")
        if row.is_index or (row.asset_type or "").lower() != "stock":
            raise BadRequestError(f"Mã {clean} không phải là cổ phiếu")
        return clean

    async def _tin_hieu_san(self, bo_loc: str, symbol: str) -> str | None:
        """Tín hiệu thô lúc săn — **server tự tính**, không nhận từ client.

        Chạy đúng bộ lọc đó trên rổ MỘT mã: nếu mã còn thoả điều kiện thì lấy
        chuỗi tín hiệu thật (VD "+45,2 tỷ ròng · 4/5 phiên"); không thoả, hoặc
        bộ lọc chưa đủ dữ liệu ⇒ ``None`` (để trống còn hơn in một dòng số bịa
        — xem docstring ``app.models.cap5.Cap5HuntLog``).
        """
        try:
            result = await self._engine.run(bo_loc, [symbol])
        except Exception as exc:  # noqa: BLE001 — nguồn hỏng ⇒ không có tín hiệu
            logger.warning("Cấp 5: không lấy được tín hiệu săn %s/%s: %s", bo_loc, symbol, exc)
            return None
        for item in result.items:
            if item.get("symbol", "").upper() == symbol.upper():
                tin_hieu = item.get("tin_hieu")
                return tin_hieu if isinstance(tin_hieu, str) else None
        return None

    async def add_watchlist(
        self,
        user_id: uuid.UUID,
        symbol: str,
        hunt_filter: str,
        *,
        hunt_signal: str | None = None,  # noqa: ARG002 — advisory, xem docstring
    ) -> dict:
        """``POST /cap5/watchlist`` — thêm mã KÈM nguồn săn (§5.4/§10).

        ``hunt_filter`` là do user khai (họ bấm "+ Watchlist" trong popup của
        chính bộ lọc đó) nên được nhận; ``hunt_signal`` thì **KHÔNG** — client
        gửi lên bao nhiêu cũng bị bỏ, server tự tính lại từ dữ liệu thị trường.
        Nhận chuỗi tín hiệu từ client là mở cửa cho một dòng số không ai kiểm.

        Mã ĐÃ có trong Watchlist (VD user tự thêm tay từ Cấp 0) thì được CẬP
        NHẬT nguồn săn thay vì 409: săn ra một mã mình đang theo dõi vẫn là săn.
        """
        progress = await self._require_progress(user_id)
        clean = await self._validate_symbol(symbol)
        if hunt_filter not in _HUNT_FILTER_VALUES:
            raise BadRequestError("Bộ lọc săn mã không hợp lệ")

        existing = (
            await self._session.execute(
                select(WatchlistItem).where(
                    WatchlistItem.user_id == user_id, WatchlistItem.symbol == clean
                )
            )
        ).scalar_one_or_none()

        if existing is None:
            count = (
                await self._session.execute(
                    select(func.count())
                    .select_from(WatchlistItem)
                    .where(WatchlistItem.user_id == user_id)
                )
            ).scalar() or 0
            if count >= MAX_WATCHLIST_ITEMS:
                raise BadRequestError(
                    f"Danh sách theo dõi tối đa {MAX_WATCHLIST_ITEMS} mã — "
                    "bỏ vài mã đã nguội trước khi săn thêm."
                )

        tin_hieu = await self._tin_hieu_san(hunt_filter, clean)
        now = datetime.now(UTC)

        if existing is None:
            max_order = (
                await self._session.execute(
                    select(func.coalesce(func.max(WatchlistItem.sort_order), -1)).where(
                        WatchlistItem.user_id == user_id
                    )
                )
            ).scalar() or 0
            existing = WatchlistItem(
                user_id=user_id, symbol=clean, sort_order=int(max_order) + 1
            )
            self._session.add(existing)
        existing.hunt_filter = hunt_filter
        existing.hunt_signal = tin_hieu
        existing.hunt_at = now

        log = (
            await self._session.execute(
                select(Cap5HuntLog).where(
                    Cap5HuntLog.user_id == user_id, Cap5HuntLog.symbol == clean
                )
            )
        ).scalar_one_or_none()
        if log is None:
            log = Cap5HuntLog(
                user_id=user_id,
                symbol=clean,
                hunt_filter=hunt_filter,
                hunt_signal=tin_hieu,
                first_hunted_at=now,
                last_hunted_at=now,
            )
            self._session.add(log)
        else:
            # Săn lại cùng mã từ bộ lọc khác: cập nhật nguồn MỚI NHẤT, giữ
            # ``first_hunted_at`` (nhiệm vụ ② so mốc săn ĐẦU với lúc mua).
            log.hunt_filter = hunt_filter
            log.hunt_signal = tin_hieu
            log.last_hunted_at = now
        await self._session.flush()

        await self._recompute_progress(user_id, progress)
        rows = await self._watchlist_rows(user_id)
        lop = await self._refresh_consensus(rows)
        item = next((r for r in rows if r.symbol == clean), existing)
        return self._watchlist_out(item, lop.get(clean))

    async def remove_watchlist(self, user_id: uuid.UUID, symbol: str) -> None:
        """``DELETE /cap5/watchlist/{symbol}``.

        ★ Sổ ``cap5_hunt_log`` KHÔNG bị xoá theo: "số mã đã săn" là một việc
        user ĐÃ LÀM; bỏ theo dõi một mã không xoá được việc đã săn nó (và
        ``task_1_done_at`` thì không bao giờ un-set).
        """
        progress = await self._require_progress(user_id)
        clean = (symbol or "").strip().upper()
        row = (
            await self._session.execute(
                select(WatchlistItem).where(
                    WatchlistItem.user_id == user_id, WatchlistItem.symbol == clean
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError(f"mã {clean} trong danh sách theo dõi")
        await self._session.delete(row)
        await self._session.flush()
        await self._recompute_progress(user_id, progress)

    def _watchlist_out(self, row: WatchlistItem, ket: ConsensusResult | None) -> dict:
        khop = (
            ket is not None
            and ket.diem is not None
            and ket.diem == row.consensus_today
            and ket.so_lop_da_cham == row.consensus_da_cham
        )
        # ★ Mã CHƯA từng chấm được (không có bản phân tích, hoặc bản duy nhất đã
        # quá cũ): vẫn vẽ 5 lớp trống kèm LÝ DO. Nó không mâu thuẫn với con số
        # nào cả (chẳng có số nào), và đây là chỗ duy nhất user đọc được "vì sao
        # mã này chưa có điểm".
        chua_ai_cham = (
            ket is not None and ket.diem is None and row.consensus_today is None
        )
        co_chi_tiet = khop or chua_ai_cham
        hunt_date = _vn_date(row.hunt_at)
        so_phien = (
            _count_trading_sessions(hunt_date, _now_vn_date()) if hunt_date is not None else None
        )
        diem = row.consensus_today
        # ★★ C3: điểm ĐÃ LƯU mà hôm nay không còn bản phân tích nào trong cửa sổ
        # hiệu lực để xác nhận ⇒ nó là SỐ CŨ. Không xoá (nó là lịch sử thật),
        # nhưng phải đánh dấu — nếu không, thẻ cứ nói "4/5 lớp đang ủng hộ" mãi.
        het_han = diem is not None and (ket is None or ket.diem is None)
        return {
            "symbol": row.symbol,
            "added_at": row.created_at,
            "hunt_filter": row.hunt_filter,
            "hunt_filter_ten": HUNT_FILTER_LABELS.get(row.hunt_filter or "") or None,
            "hunt_signal": row.hunt_signal,
            "hunt_at": row.hunt_at,
            "so_phien_tu_khi_san": so_phien,
            "consensus_today": diem,
            "consensus_prev": row.consensus_prev,
            "consensus_da_cham": row.consensus_da_cham,
            "consensus_at": row.consensus_at,
            # Phiên của bản phân tích đã dùng để chấm — cùng cổng ``khop`` với
            # cụm icon: gán ngày của một lần chấm khác cho con số đang hiện là
            # tự tạo một mâu thuẫn ngay trên mặt thẻ.
            "consensus_session_date": ket.session_date if khop else None,
            # Có bản phân tích nhưng ĐÃ QUÁ CŨ (bị từ chối) — khác hẳn "chưa có
            # bản nào", và là câu trả lời cho "vì sao mã này không có điểm".
            "consensus_session_date_qua_han": (
                ket.session_date_qua_han if ket is not None else None
            ),
            "consensus_het_han": het_han,
            "so_phien_hieu_luc": SO_PHIEN_HIEU_LUC,
            "status": row.status,
            "tong_so_lop": TONG_SO_LOP,
            "nguong_dang_chu_y": NGUONG_DANG_CHU_Y,
            "nhac": (
                None
                if row.status != WatchlistStatus.NOTABLE.value
                else (_NHAC_DIEM_CU if het_han else _NHAC_DANG_CHU_Y)
            ),
            # Chi tiết từng lớp chỉ được vẽ khi nó KHỚP con số đã lưu. Mẻ chấm
            # ghi 1 lần/ngày, nên giữa ngày có thể xuất hiện bản Insight mới cho
            # ra điểm khác — vẽ 4 icon ✅ cạnh con số "3/5" là một mâu thuẫn
            # ngay trên mặt thẻ. Lệch thì để trống (FE hiện "–"), mẻ hôm sau tự
            # đồng bộ lại.
            "lop": {r["lop"]: r["muc"] for r in ket.lop} if co_chi_tiet else None,
            "lop_chi_tiet": ket.lop if co_chi_tiet else None,
        }

    async def watchlist(self, user_id: uuid.UUID) -> dict:
        """``GET /cap5/watchlist`` — Watchlist + điểm đồng thuận 5 lớp (§6.2)."""
        await self._require_progress(user_id)
        rows = await self._watchlist_rows(user_id)
        lop = await self._refresh_consensus(rows)
        items = [self._watchlist_out(row, lop.get(row.symbol.upper())) for row in rows]
        so_dang_chu_y = sum(
            1 for row in rows if row.status == WatchlistStatus.NOTABLE.value
        )
        return {
            "items": items,
            "so_luong": len(items),
            "so_dang_chu_y": so_dang_chu_y,
            "toi_da": MAX_WATCHLIST_ITEMS,
            # Cửa sổ hiệu lực của bản phân tích 5 lớp — FE cần con số này để nói
            # đúng câu "chưa có bản phân tích nào trong N phiên gần nhất".
            "so_phien_hieu_luc": SO_PHIEN_HIEU_LUC,
        }

    async def nguon_san(
        self, user_id: uuid.UUID, symbol: str, *, order_id: uuid.UUID | None = None
    ) -> dict:
        """``GET /cap5/nguon-san/{symbol}[?order_id=]`` — nguồn săn cho Kết sổ (§8).

        ★★ **``order_id`` là thứ làm câu trả lời này ĐÚNG.** Sổ ``cap5_hunt_log``
        nói "bạn đã từng săn mã này", KHÔNG nói "lệnh kia đến từ săn mã". Không
        có mốc lệnh thì một mã user tự gõ mua thứ Hai, rồi thứ Sáu mới bấm
        "+ Watchlist" từ bộ lọc «Vượt đỉnh», vẫn được Kết sổ khai là "săn từ bộ
        lọc «Vượt đỉnh» · đưa vào Watchlist 4 phiên trước" — đúng thứ tự thời
        gian bị đảo. Có ``order_id``, hàm so đúng mốc bằng ``_hunt_for_order``
        (cùng luật nhiệm vụ ② dùng: săn TRƯỚC, mua SAU) và đếm số phiên chờ TỚI
        LÚC ĐẶT LỆNH, không tới hôm nay.

        Bộ lọc trả về ưu tiên **dấu đã đóng trên chính lệnh đó**
        (``order_kehoach.hunt_filter``, chép một lần lúc đặt lệnh) chứ không đọc
        lại ``cap5_hunt_log`` — săn lại mã đó từ bộ lọc khác không được sửa lịch
        sử của lệnh cũ.

        ``so_lop_luc_vao`` LUÔN ``None`` kèm lý do: điểm đồng thuận tại thời điểm
        đặt lệnh chưa từng được lưu (chỉ có điểm hôm nay + lần chấm trước), nên
        câu "vào lệnh khi lên 4/5 lớp" của spec §8 KHÔNG được dựng từ điểm hiện
        tại — đó sẽ là gán một con số của hôm nay cho một quyết định quá khứ.
        """
        await self._require_progress(user_id)
        clean = (symbol or "").strip().upper()

        order: VirtualOrder | None = None
        if order_id is not None:
            order = (
                await self._session.execute(
                    select(VirtualOrder).where(
                        VirtualOrder.id == order_id, VirtualOrder.user_id == user_id
                    )
                )
            ).scalar_one_or_none()
            if order is None:
                raise NotFoundError("lệnh")
            if (order.symbol or "").upper() != clean:
                raise BadRequestError(
                    f"Lệnh này là mã {order.symbol}, không phải {clean}"
                )

        log = (
            await self._session.execute(
                select(Cap5HuntLog).where(
                    Cap5HuntLog.user_id == user_id, Cap5HuntLog.symbol == clean
                )
            )
        ).scalar_one_or_none()

        # Săn SAU khi mua thì lệnh này không đến từ săn mã — chỉ trả lời được
        # khi biết mốc lệnh, nên nhánh dưới chỉ chạy khi có ``order``.
        log_cho_lenh = (
            self._hunt_for_order({log.symbol.upper(): log}, order)
            if log is not None and order is not None
            else log
        )
        moc = "luc_dat_lenh" if order is not None else "hom_nay"
        canh_bao_thieu_order = (
            None
            if order is not None
            else (
                "Dòng này đọc từ SỔ SĂN của bạn, không gắn với lệnh nào: nó nói "
                "\"bạn đã từng săn mã này\", KHÔNG nói \"lệnh đó đến từ săn mã\" "
                "(một mã có thể được săn SAU khi đã mua). Truyền order_id để có "
                "câu trả lời đúng cho một lệnh cụ thể."
            )
        )
        chung = {
            "symbol": clean,
            "order_id": order_id,
            "moc_tinh_phien": moc,
            "canh_bao_thieu_order_id": canh_bao_thieu_order,
            "canh_bao_nguon_moi_hon": None,
            "so_lop_luc_vao": None,
        }

        if log_cho_lenh is None:
            giai_thich = (
                f"Mã {clean} không đến từ săn mã — bạn tự nhập mã này, "
                "không qua bộ lọc nào."
            )
            if log is not None and order is not None:
                # Có săn, nhưng SAU khi đặt lệnh — nói thẳng, đừng gộp vào
                # "bạn tự nhập" một cách im lặng.
                giai_thich = (
                    f"Lệnh này KHÔNG đến từ săn mã: bạn săn {clean} sau khi đã "
                    "đặt lệnh (mốc săn đầu tiên muộn hơn mốc đặt lệnh)."
                )
            return {
                **chung,
                "tu_san_ma": False,
                "hunt_filter": None,
                "hunt_filter_ten": None,
                "hunt_signal": None,
                "first_hunted_at": log.first_hunted_at if log is not None else None,
                "so_phien_trong_watchlist": None,
                "giai_thich": giai_thich,
                "ly_do_thieu_so_lop": None,
            }

        hunt_date = _vn_date(log_cho_lenh.first_hunted_at)
        den = _vn_date(order.created_at) if order is not None else _now_vn_date()
        so_phien = (
            _count_trading_sessions(hunt_date, den)
            if hunt_date is not None and den is not None
            else None
        )

        bo_loc = log_cho_lenh.hunt_filter
        canh_bao_moi_hon = None
        if order is not None:
            kehoach = (
                await self._session.execute(
                    select(OrderKehoach).where(OrderKehoach.order_id == order.id)
                )
            ).scalar_one_or_none()
            dau = (
                kehoach.hunt_filter
                if kehoach is not None and kehoach.from_watchlist and kehoach.hunt_filter
                else None
            )
            if dau is not None:
                bo_loc = dau
            elif _as_utc(log_cho_lenh.last_hunted_at) > _as_utc(order.created_at):
                # Không có dấu trên lệnh VÀ sổ săn đã được cập nhật sau lúc mua:
                # bộ lọc dưới đây là bộ lọc MỚI NHẤT, không chắc là bộ lọc lúc mua.
                canh_bao_moi_hon = (
                    f"Bạn đã săn lại {clean} sau khi đặt lệnh này, nên "
                    f"«{HUNT_FILTER_LABELS.get(bo_loc, bo_loc)}» là bộ lọc mới "
                    "nhất — hệ không lưu bộ lọc tại đúng thời điểm mua cho lệnh này."
                )

        ten = HUNT_FILTER_LABELS.get(bo_loc, bo_loc)
        giai_thich = f"Mã này bạn săn từ bộ lọc {ten}"
        if log_cho_lenh.hunt_signal:
            giai_thich += f" ({log_cho_lenh.hunt_signal})"
        if so_phien is not None:
            giai_thich += (
                f" · đưa vào Watchlist {so_phien} phiên trước khi đặt lệnh"
                if order is not None
                else f" · đưa vào Watchlist {so_phien} phiên trước"
            )
        giai_thich += "."
        return {
            **chung,
            "tu_san_ma": True,
            "hunt_filter": bo_loc,
            "hunt_filter_ten": ten,
            "hunt_signal": log_cho_lenh.hunt_signal,
            "first_hunted_at": log_cho_lenh.first_hunted_at,
            "so_phien_trong_watchlist": so_phien,
            "canh_bao_nguon_moi_hon": canh_bao_moi_hon,
            "giai_thich": giai_thich,
            "ly_do_thieu_so_lop": (
                "Hệ không lưu điểm đồng thuận tại thời điểm đặt lệnh (chỉ có điểm "
                "hôm nay và lần chấm trước), nên không nói được lúc vào lệnh mã "
                "đang ở mấy lớp ủng hộ."
            ),
        }

    # ══════════════════════════════════════════════════
    # Phân tích danh mục — khối ⑫ + ⑬ (spec §9)
    # ══════════════════════════════════════════════════

    async def _closed_round_trips(self, user_id: uuid.UUID) -> list[tuple[float, str | None]]:
        """Mọi lượt đã đóng của user: ``(pnl_pct, hunt_filter | None)``.

        Ghép lệnh BÁN với lệnh MUA bằng ĐÚNG luật của Cấp 1
        (``Cap1Service._find_matching_buy``: lệnh mua đã khớp GẦN NHẤT cùng tài
        khoản + mã, tại/trước lệnh bán) — cùng luật đã sinh ra ``pnl_pct`` của
        chính hàng ``order_ketso`` đó. Ghép trong bộ nhớ (2 truy vấn) thay vì 1
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
            await self._session.execute(
                select(OrderKehoach).where(
                    OrderKehoach.order_id.in_([o.id for o in buys])
                )
            )
        ).scalars().all() if buys else []
        kehoach_by_order = {row.order_id: row for row in kehoach_rows}

        out: list[tuple[float, str | None]] = []
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
            kehoach = kehoach_by_order.get(buy.id)
            hunt_filter = (
                kehoach.hunt_filter
                if kehoach is not None and kehoach.from_watchlist
                else None
            )
            out.append((float(ketso.pnl_pct), hunt_filter))
        return out

    async def _khoi_12(self, user_id: uuid.UUID) -> dict:
        """Khối ⑫ — bộ lọc nào ra mã thắng nhiều nhất (spec §9/§10).

        Chỉ đếm lệnh đã đóng có nguồn săn (``from_watchlist=True``). ``ty_le_thang``
        để ``None`` khi bộ lọc chưa đủ ``MIN_LENH_KHOI_12`` lệnh — "chưa đủ dữ
        liệu để kết luận", KHÔNG phải 0%. ``best_filter`` vì thế cũng chỉ được
        chọn trong các bộ lọc đã đủ mẫu.
        """
        trips = await self._closed_round_trips(user_id)
        rows: list[dict] = []
        so_lenh_khong_tu_san = sum(1 for _pnl, f in trips if f is None)

        for ma in _HUNT_FILTER_VALUES:
            cua_bo_loc = [pnl for pnl, f in trips if f == ma]
            n = len(cua_bo_loc)
            so_thang = sum(1 for pnl in cua_bo_loc if pnl > 0)
            du_mau = n >= MIN_LENH_KHOI_12
            rows.append(
                {
                    "ma": ma,
                    "ten": HUNT_FILTER_LABELS[ma],
                    "so_lenh": n,
                    "so_lenh_thang": so_thang,
                    # ★ None = chưa đủ lệnh để kết luận (≠ 0%).
                    "ty_le_thang": round(so_thang / n * 100.0, 1) if du_mau else None,
                    "du_mau": du_mau,
                    "giai_thich": (
                        f"{so_thang}/{n} lệnh đã đóng từ bộ lọc này có lãi."
                        if du_mau
                        else (
                            f"Mới {n}/{MIN_LENH_KHOI_12} lệnh đã đóng từ bộ lọc này — "
                            "chưa đủ để nói bộ lọc này hợp với bạn hay không."
                        )
                    ),
                }
            )

        du_mau = [r for r in rows if r["du_mau"]]
        # Hoà tỷ lệ thắng ⇒ bộ lọc đứng trước trong bảng spec §5.3 thắng (chọn
        # tất định, không phụ thuộc thứ tự dòng trong DB).
        best = (
            max(
                du_mau,
                key=lambda r: (r["ty_le_thang"], -_HUNT_FILTER_VALUES.index(r["ma"])),
            )
            if du_mau
            else None
        )
        worst = (
            min(
                du_mau,
                key=lambda r: (r["ty_le_thang"], _HUNT_FILTER_VALUES.index(r["ma"])),
            )
            if len(du_mau) >= 2
            else None
        )
        for row in rows:
            row["nhan"] = None
            row["canh_bao"] = None
        if best is not None:
            best["nhan"] = "hợp với bạn nhất"
        if worst is not None and worst is not best:
            worst["canh_bao"] = _KHOI_12_CANH_BAO[worst["ma"]]

        # Sắp giảm dần theo tỷ lệ thắng; bộ lọc chưa đủ mẫu xuống cuối (theo
        # thứ tự bảng spec §5.3) để không ai đọc "—" như hạng bét.
        rows.sort(
            key=lambda r: (
                0 if r["du_mau"] else 1,
                -(r["ty_le_thang"] or 0.0),
                _HUNT_FILTER_VALUES.index(r["ma"]),
            )
        )
        return {
            "items": rows,
            "best_filter": best["ma"] if best is not None else None,
            "so_lenh_toi_thieu": MIN_LENH_KHOI_12,
            "so_lenh_khong_tu_san": so_lenh_khong_tu_san,
            "du_de_ket_luan": bool(du_mau),
            "giai_thich": (
                "Chỉ tính lệnh ĐÃ ĐÓNG của mã đến từ săn mã. Mỗi bộ lọc cần ít nhất "
                f"{MIN_LENH_KHOI_12} lệnh đã đóng mới được xếp hạng — dưới ngưỡng đó "
                "hệ để trống chứ không hiện 0%."
            ),
        }

    async def phan_tich(self, user_id: uuid.UUID) -> dict:
        """``GET /cap5/phan-tich`` — khối ⑫ + khối ⑬ (spec §9)."""
        progress = await self._require_progress(user_id)
        out = await self._recompute_progress(user_id, progress)
        khoi_12 = await self._khoi_12(user_id)

        da_san = out["so_ma_da_san"]
        cho_du_lop = out["so_ma_cho_du_lop"]
        da_cham = out["so_ma_da_cham_diem"]
        day_du = out["so_ma_cho_du_lop_day_du"]
        vao_lenh = out["so_ma_mua_tu_watchlist"]
        if da_san == 0:
            phieu_copy = "Bạn chưa săn mã nào — mở màn Săn mã và thử một bộ lọc."
        elif cho_du_lop is None:
            phieu_copy = (
                f"Bạn săn {da_san} mã và vào lệnh {vao_lenh} mã. Tầng giữa (số mã chờ "
                f"đến ≥{NGUONG_DANG_CHU_Y}/{TONG_SO_LOP} lớp) chưa đo được: hệ chưa "
                f"chấm được điểm đồng thuận cho mã nào bạn săn (0/{da_san} mã)."
            )
        elif day_du:
            phieu_copy = (
                f"Bạn săn {da_san} mã, {cho_du_lop} mã lên được "
                f"≥{NGUONG_DANG_CHU_Y}/{TONG_SO_LOP} lớp ủng hộ, và bạn vào lệnh "
                f"{vao_lenh} mã — biết chờ và loại mã chưa chín chính là kỷ luật của "
                "thợ săn."
            )
        else:
            # ★ Cận dưới — nói ngay mẫu số, đừng để con số nghe như đã đếm hết.
            phieu_copy = (
                f"Bạn săn {da_san} mã và vào lệnh {vao_lenh} mã. Hệ chỉ chấm được "
                f"điểm đồng thuận cho {da_cham}/{da_san} mã bạn săn, và trong số đó "
                f"{cho_du_lop} mã lên được ≥{NGUONG_DANG_CHU_Y}/{TONG_SO_LOP} lớp ủng "
                f"hộ — nên {cho_du_lop} là CẬN DƯỚI: "
                f"{da_san - da_cham} mã còn lại hệ chưa chấm được (chưa có bản phân "
                "tích 5 lớp, hoặc bạn đã bỏ mã khỏi Watchlist)."
            )
        return {
            "khoi_12": khoi_12,
            "khoi_13": {
                "so_ma_da_san": da_san,
                # ★ None = chưa đo được (xem ``_tang_giua_phieu``).
                "so_ma_cho_du_lop": cho_du_lop,
                # Mẫu số thật + cờ "con số này đã đếm hết hay là cận dưới".
                "so_ma_da_cham_diem": da_cham,
                "so_ma_cho_du_lop_day_du": day_du,
                "so_ma_vao_lenh": vao_lenh,
                "giai_thich": _KHOI_13_GIAI_THICH,
                "loi_ket": phieu_copy,
            },
        }

    # ══════════════════════════════════════════════════
    # Tốt nghiệp
    # ══════════════════════════════════════════════════

    async def graduate(self, user_id: uuid.UUID) -> dict:
        """Tốt nghiệp Cấp 5 — chỉ khi đủ 2/2 nhiệm vụ (spec §3)."""
        progress = await self._require_progress(user_id)
        await self._recompute_progress(user_id, progress)

        if any(getattr(progress, f"task_{n}_done_at") is None for n in _TASK_NOS):
            raise ConflictError("Chưa hoàn thành đủ 2 nhiệm vụ Cấp 5")

        if progress.graduated_at is None:
            now = datetime.now(UTC)
            progress.graduated_at = now
            progress.time_to_graduate_hours = (
                now - _as_utc(progress.entered_at)
            ).total_seconds() / 3600.0
            await self._session.flush()
            await self._session.refresh(progress)

        return await self._recompute_progress(user_id, progress)
