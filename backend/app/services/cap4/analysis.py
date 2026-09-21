"""Authoritative Cấp 4 portfolio analysis blocks ⑩ and ⑪.

The frontend used to rebuild these blocks from browser-local history.  That
lost closed trades on another device and could disagree with the server-owned
block ⑨.  This module derives every number from ``order_kehoach`` paired with
the real ``order_ketso`` outcome through :class:`Cap4Service`'s existing
pairing rule.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.cap1 import OrderKehoach, OrderKetso
from app.services.cap4.service import Cap4Service
from app.services.journey_events import record_journey_event

MIN_LENH_MOI_NHOM = 3
MIN_LENH_KHAC_AI = 5
CHENH_LECH_RO_PCT = 15.0

_BANDS: tuple[tuple[str, str, range], ...] = (
    ("cao", "4-5 lớp ủng hộ", range(4, 6)),
    ("vua", "2-3 lớp ủng hộ", range(2, 4)),
    ("thap", "0-1 lớp ủng hộ", range(0, 2)),
)

_KHOI_10_GIAI_THICH = (
    "Độ đồng thuận = số lớp AI đánh giá Ủng hộ lúc bạn đặt lệnh (0-5), đúng "
    "bằng dòng \"Đồng thuận: X/5\" ở panel đặt lệnh. Tỷ lệ thắng là KẾT QUẢ "
    "THẬT của các lệnh đã đóng trong nhóm đó. Đây là số liệu để tự nhìn lại, "
    "không phải điều kiện tốt nghiệp Cấp 4."
)
_KHOI_11_GIAI_THICH = (
    "Đếm theo LỆNH (không theo lớp): một lệnh có ít nhất 1 lớp bạn đọc khác "
    "AI được tính 1 lần, rồi phân loại bằng kết quả thật — lệnh thắng là "
    "\"bạn đúng\", lệnh thua là \"AI đúng\". Lệnh hòa vốn không được gán cho "
    "bên nào; lệnh chưa lộ đối chiếu AI không được tính vào đâu cả."
)


def _win(ketso: OrderKetso) -> bool:
    return float(ketso.pnl_pct) > 0


def _khoi_10(pairs: Sequence[tuple[OrderKehoach, OrderKetso]]) -> dict:
    grouped: dict[str, list[OrderKetso]] = {ma: [] for ma, _label, _range in _BANDS}
    excluded = 0
    for kehoach, ketso in pairs:
        diem = kehoach.so_lop_dong_thuan
        if diem is None:
            excluded += 1
            continue
        for ma, _label, values in _BANDS:
            if diem in values:
                grouped[ma].append(ketso)
                break

    rows: list[dict] = []
    for ma, label, _values in _BANDS:
        outcomes = grouped[ma]
        count = len(outcomes)
        wins = sum(1 for row in outcomes if _win(row))
        rows.append(
            {
                "band": ma,
                "label": label,
                "count": count,
                "wins": wins,
                "win_rate": round(wins / count * 100.0) if count else None,
                "insufficient": count < MIN_LENH_MOI_NHOM,
            }
        )

    total = sum(row["count"] for row in rows)
    cao, _vua, thap = rows
    hieu_qua: bool | None = None
    phat_hien: str | None = None
    note: str | None = None
    if total == 0:
        note = (
            "Chưa có lệnh Cấp 4 nào đã đóng có đối chiếu AI — chưa thể so tỷ "
            "lệ thắng giữa các mức đồng thuận."
        )
    elif cao["insufficient"] or thap["insufficient"]:
        note = (
            f"Cần ít nhất {MIN_LENH_MOI_NHOM} lệnh ở CẢ nhóm "
            f"«{cao['label']}» và «{thap['label']}» để so sánh "
            f"(hiện: {cao['count']} và {thap['count']})."
        )
    else:
        gap = float(cao["win_rate"]) - float(thap["win_rate"])
        if gap >= CHENH_LECH_RO_PCT:
            hieu_qua = True
            phat_hien = (
                f"Đọc toàn cảnh có hiệu quả — lệnh {cao['label']} thắng "
                f"{cao['win_rate']}% ({cao['wins']}/{cao['count']} lệnh), so với "
                f"{thap['win_rate']}% ở lệnh {thap['label']} "
                f"({thap['wins']}/{thap['count']}). Ưu tiên lệnh có nhiều lớp "
                "cùng ủng hộ."
            )
        elif gap <= -CHENH_LECH_RO_PCT:
            hieu_qua = False
            phat_hien = (
                f"Dữ liệu của bạn đang ngược giả thuyết: lệnh {cao['label']} "
                f"thắng {cao['win_rate']}% ({cao['wins']}/{cao['count']}), thấp "
                f"hơn lệnh {thap['label']} ({thap['win_rate']}%, "
                f"{thap['wins']}/{thap['count']}). Chưa có cơ sở ưu tiên lệnh "
                "đồng thuận cao — xem lại cách bạn đọc từng lớp ở khối ⑨."
            )
        else:
            hieu_qua = False
            phat_hien = (
                f"Tỷ lệ thắng của lệnh {cao['label']} ({cao['win_rate']}%, "
                f"{cao['wins']}/{cao['count']}) chưa khác biệt rõ so với lệnh "
                f"{thap['label']} ({thap['win_rate']}%, "
                f"{thap['wins']}/{thap['count']}) — chưa đủ chênh lệch để nói "
                "đọc toàn cảnh đã giúp chọn lệnh tốt hơn."
            )

    return {
        "rows": rows,
        "total_trades": total,
        "excluded_no_ai": excluded,
        "hieu_qua": hieu_qua,
        "phat_hien": phat_hien,
        "insufficient_note": note,
        "giai_thich": _KHOI_10_GIAI_THICH,
    }


def _khoi_11(pairs: Sequence[tuple[OrderKehoach, OrderKetso]]) -> dict:
    differing = [
        ketso
        for kehoach, ketso in pairs
        if kehoach.so_lop_khac_ai is not None and kehoach.so_lop_khac_ai > 0
        and float(ketso.pnl_pct) != 0
    ]
    total = len(differing)
    user_right = sum(1 for row in differing if _win(row))
    ai_right = sum(1 for row in differing if float(row.pnl_pct) < 0)
    phat_hien: str | None = None
    note: str | None = None
    if total == 0:
        note = (
            "Chưa có lệnh nào bạn đọc khác AI (trong số lệnh đã đóng có đối "
            "chiếu) — chưa có gì để đo về góc nhìn riêng."
        )
    elif total < MIN_LENH_KHAC_AI:
        note = (
            f"Cần ít nhất {MIN_LENH_KHAC_AI} lệnh bạn đọc khác AI để nói được "
            f"điều gì về trực giác riêng (hiện: {total}). Vài lệnh đầu chưa "
            "phân biệt được trực giác với may mắn."
        )
    elif user_right > ai_right:
        phat_hien = (
            f"Trực giác riêng của bạn đang có cơ sở — khi đọc khác AI, bạn đúng "
            f"{user_right}/{total} lần. Tiếp tục rèn góc nhìn riêng, nhưng vẫn "
            "cân nhắc kỹ khi AI cảnh báo mạnh."
        )
    elif ai_right > user_right:
        phat_hien = (
            f"Khi bạn đọc khác AI, phần lớn AI đúng (AI đúng {ai_right}/{total} "
            "lần). Giai đoạn này nên tin AI nhiều hơn ở các lớp bạn chưa chắc, "
            "và xem khối ⑨ để biết lớp nào."
        )
    else:
        phat_hien = (
            f"Khi bạn đọc khác AI, kết quả chia đều (bạn đúng {user_right}/{total}, "
            f"AI đúng {ai_right}/{total}) — chưa đủ căn cứ để nói góc nhìn riêng "
            "của bạn tốt hơn hay kém hơn AI."
        )
    return {
        "so_lan_khac_ai": total,
        "so_lan_ban_dung": user_right,
        "so_lan_ai_dung": ai_right,
        "phat_hien": phat_hien,
        "insufficient_note": note,
        "giai_thich": _KHOI_11_GIAI_THICH,
    }


class Cap4AnalysisService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._cap4 = Cap4Service(session)

    async def get(self, user_id: uuid.UUID) -> dict:
        progress = await self._cap4.get_progress(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 4")
        pairs = await self._cap4._closed_pairs(user_id)
        await record_journey_event(
            self._session,
            user_id,
            "cap4_phantich_view",
            dedup_key=f"progress:{progress.id}",
        )
        return {"khoi_10": _khoi_10(pairs), "khoi_11": _khoi_11(pairs)}
