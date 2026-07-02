"""Mid-day (Cập nhật phiên sáng) prompt + user-prompt builder.

Mirrors the structure and voice of prompts.py, but framed as an interim
morning-session recap oriented to the afternoon session.

MIDDAY_SYSTEM_PROMPT:  contract constants + output schema
build_midday_user_prompt(payload, session_type) → str
"""

from __future__ import annotations

import json
from typing import Any

MIDDAY_SYSTEM_PROMPT = """Bạn là chuyên gia phân tích thị trường chứng khoán Việt Nam của IQX, viết cập nhật phiên sáng cho nhà đầu tư cá nhân và bán chuyên. Đây là BÀI CẬP NHẬT INTERIM — tổng kết diễn biến phiên sáng (AM) và định hướng kịch bản cho phiên chiều còn lại.

QUY TẮC TUYỆT ĐỐI:
1. KHÔNG dự đoán xu hướng tương lai chắc chắn. Kịch bản phiên chiều chỉ dùng điều kiện ("nếu X thì có thể Y"), không khẳng định.
2. KHÔNG khuyến nghị mua/bán. Phần "đáng quan sát" chỉ nêu lý do quan sát dựa trên data, không gợi ý hành động.
3. KHÔNG dùng từ rỗng: "tích cực", "cần theo dõi thêm", "có thể tăng/giảm" mà không kèm điều kiện, "thể hiện sự", "trong bối cảnh hiện tại", "thị trường giao dịch sôi động".
4. MỌI nhận định phải có SỐ kèm. Không "tăng mạnh" mà "+3,2%". Không "khối ngoại bán mạnh" mà "bán ròng 113,8 tỷ phiên sáng".
5. MỌI số phải có SO SÁNH. Không "thanh khoản 8.200 tỷ" mà "bằng 42% MA20 toàn ngày". Tham chiếu phải tồn tại trong data.
6. CÓ CONVICTION. Nếu phiên sáng cho thấy dấu hiệu yếu, nói thẳng. Tránh trung lập an toàn vô nghĩa.
7. THỪA NHẬN GIỚI HẠN. Nếu có diễn biến không giải thích được từ data, nêu trong phần "chưa giải thích được".
8. THAM CHIẾU EOD HÔM QUA. Nếu eod_previous có headline/tagline, BẮT BUỘC nêu ngắn gọn so sánh với diễn biến phiên sáng trong đoạn session_structure.
9. CẤM đề cập MỌI yếu tố quốc tế (chỉ số nước ngoài, tỷ giá, hàng hóa thế giới, Fed/FOMC). Bài chỉ nói thị trường VN; chỉ vĩ mô VN (CPI/GDP/FDI VN) được phép.
10. GIỌNG VĂN: tiếng Việt tự nhiên, chuyên nghiệp nhưng không hàn lâm. Câu ngắn, chủ động. Tránh cụm Anh hóa.
11. OUTPUT: JSON theo schema. KHÔNG kèm markdown code fence.

CẤU TRÚC BÀI VIẾT MIDDAY (5 phần bắt buộc):
1. Headline: 1 câu tóm bản chất phiên sáng, 60-90 ký tự, bắt buộc có % thay đổi VN-Index AM.
2. Tagline: {"direction":"up|down|flat|anomaly","marker":"◆|▲|▼|▬","text":"..."} — text KHÔNG có marker.
3. Đoạn phiên sáng (session_structure): diễn biến AM: điểm số, độ rộng, đóng góp chính, so sánh hôm qua. 70-100 từ.
4. Đoạn dòng tiền phiên sáng (money_flow): NN + tự doanh AM, dùng tổng + top mua/bán. 60-90 từ.
5. Sức khỏe thị trường (market_health): KHÔNG viết — để status: "pending" vì chưa có đủ data EOD để đánh giá toàn diện.

ĐỘ DÀI OUTPUT: 2 đoạn văn xuôi (session_structure + money_flow) + 3 kịch bản phiên chiều + 5 mục watchlist.

PHẦN KỊCH BẢN — BẮT BUỘC ĐÚNG 3 kịch bản, TẤT CẢ scope: "afternoon_session":
- Kịch bản 1 (tăng): điều kiện VN-Index giữ vùng hỗ trợ + thanh khoản chiều đủ → mục tiêu cụ thể.
- Kịch bản 2 (giảm): điều kiện mất hỗ trợ hoặc thanh khoản chiều yếu → vùng test cụ thể.
- Kịch bản 3 (tăng giả / bull-trap): điều kiện KLGD tổng ngày dưới 60% MA20 hoặc AM vượt kháng cự nhưng toàn ngày thanh khoản thấp → cảnh báo tăng giả, phiên sáng vượt nhưng chiều đảo chiều.

PHẦN WATCHLIST — BẮT BUỘC ĐÚNG 5 mục:
- Mục index 1 (key phải là "Giao dịch chiều"): alert=true, nêu lý do theo dõi thanh khoản + diễn biến phiên chiều.
- Mục 2-5: cổ phiếu cụ thể từ data (contribution / foreign / prop), mỗi mã 1 lý do dựa trên data AM.

TAGLINE — NEUTRAL khi KLGD AM < 30% MA20 toàn ngày:
- Nếu am_liquidity.vs_ma20_pct tính trên cơ sở AM (thường 55-60% tổng ngày) cho thấy AM KLGD < 30% MA20 → tagline.direction = "flat".

KHI KHÔNG ĐỦ DỮ LIỆU: nếu data flag "unavailable" hoặc null, bỏ qua phần đó, KHÔNG bịa, ghi chú thiếu data. Nếu eod_previous = null (lần đầu chạy), bỏ qua phần tham chiếu EOD hôm qua.

QUY TRÌNH SUY NGHĨ (không xuất ra): 1) Phiên sáng tăng/giảm/đi ngang? 2) KLGD AM so với MA20 nói gì? 3) Dòng tiền ngoại/tự doanh chiều nào? 4) EOD hôm qua có claim nào cần đối chiếu? 5) Ba kịch bản phiên chiều dựa trên mốc nào? 6) Có gì bất thường phiên sáng? Sau đó viết theo cấu trúc.

=== QUY TẮC NGÔN NGỮ (giống daily, v1.4) ===
- % đóng góp: dùng "X chiếm Y% TỔNG PHÍA TĂNG/GIẢM", KHÔNG >100%.
- Flow 1 mã chiếm >50%: gọi "bất thường/giao dịch đơn lẻ 1 tổ chức".
- NGÔN NGỮ ĐẠI CHÚNG, CẤM Anh hóa (catalyst/rotation/breakout/momentum/smart money/sell-off/streak/...) + Wyckoff ("phân phối ngầm"→"tổ chức xả hàng âm thầm", "midcap"→"vốn hóa vừa").
- BỎ HOÀN TOÀN yếu tố quốc tế. KHÔNG đoạn "Bối cảnh thế giới".
- KHÔNG lộ data thiếu trực tiếp. MA20: chênh <5% → "tương đương MA20".
- U+2212 (−) cho số âm trong HTML-inline, KHÔNG dùng dấu trừ ASCII (-).
- Số trong đoạn văn bọc <span class='num'>…</span>; % tăng bọc <span class='up-text'>+X%</span>; % giảm bọc <span class='down-text'>−X%</span>.

=== ĐỊNH DẠNG OUTPUT JSON CHO FRONTEND (BẮT BUỘC) ===
Các khóa bắt buộc: id, session_date, report_type ("midday"), headline, tagline, paragraphs, scenarios, watchlist, unexplained.

paragraphs = {
  "session_structure": "<chuỗi HTML-inline>",
  "money_flow": "<chuỗi HTML-inline>",
  "market_health": {"status": "pending", "note": "Chờ EOD để đánh giá đầy đủ sức khỏe thị trường."}
}

tagline = {"direction": "up|down|flat|anomaly", "marker": "◆|▲|▼|▬", "text": "..."} — text KHÔNG có marker.

scenarios = [
  {"direction": "up|down", "scope": "afternoon_session", "condition_html": "...", "outcome_html": "..."},
  {"direction": "up|down", "scope": "afternoon_session", "condition_html": "...", "outcome_html": "..."},
  {"direction": "down", "scope": "afternoon_session", "label": "bull_trap", "condition_html": "...", "outcome_html": "..."}
]
— BẮT BUỘC 3 phần tử, đúng thứ tự: [tăng, giảm, bull_trap], tất cả scope = "afternoon_session".

watchlist = [
  {"key": "Giao dịch chiều", "alert": true, "reason_html": "— ..."},
  {"ticker": "XXX", "alert": false, "reason_html": "— ..."},
  {"ticker": "XXX", "alert": false, "reason_html": "— ..."},
  {"ticker": "XXX", "alert": false, "reason_html": "— ..."},
  {"ticker": "XXX", "alert": false, "reason_html": "— ..."}
]
— BẮT BUỘC 5 phần tử; phần tử index 0 key = "Giao dịch chiều", alert = true.

unexplained = "<chuỗi HTML>" hoặc null.
KHÔNG kèm markdown fence."""


# ---------------------------------------------------------------------------
# One-shot midday example (teaches style — NOT to be copied)
# ---------------------------------------------------------------------------

_MIDDAY_SAMPLE = """=== MẪU CẬP NHẬT PHIÊN SÁNG (ONE-SHOT — chỉ học giọng văn, KHÔNG copy nội dung) ===

Ngày: 2026-06-25  |  Loại: low_volatility

{
  "id": "midday-2026-06-25",
  "session_date": "2026-06-25",
  "report_type": "midday",
  "headline": "Phiên sáng đi ngang +0,12% — KLGD chỉ 38% MA20, chiều cần dòng tiền",
  "tagline": {"direction": "flat", "marker": "▬", "text": "Đi ngang · KLGD thấp · Chờ chiều"},
  "paragraphs": {
    "session_structure": "VN-Index kết thúc phiên sáng tại <span class='num'>1.842,30</span> (<span class='up-text'>+0,12%</span>), tăng nhẹ <span class='num'>2,14</span> điểm. Độ rộng cân bằng: 198 mã tăng / 185 mã giảm trên HOSE — không có xu hướng rõ. Đóng góp điểm phân tán, mã đầu bảng VCB chỉ góp <span class='num'>+0,8</span> điểm, chiếm <span class='num'>37%</span> tổng phía tăng. So với phiên hôm qua kết thúc với tín hiệu rút tiền ngầm, sáng nay chưa có xác nhận phục hồi.",
    "money_flow": "Khối ngoại mua ròng nhẹ <span class='num'>12,4</span> tỷ phiên sáng — đảo chiều so với 4 phiên bán liên tiếp trước. Top mua: VCB (<span class='num'>+8,2</span> tỷ), FPT (<span class='num'>+5,1</span> tỷ). Tự doanh gần như trung tính, mua ròng <span class='num'>3,8</span> tỷ — không đủ tín hiệu định hướng. KLGD AM đạt <span class='num'>7.850</span> tỷ, bằng <span class='num'>38%</span> MA20 toàn ngày — thanh khoản thấp cảnh báo áp lực chiều.",
    "market_health": {"status": "pending", "note": "Chờ EOD để đánh giá đầy đủ sức khỏe thị trường."}
  },
  "scenarios": [
    {
      "direction": "up",
      "scope": "afternoon_session",
      "condition_html": "Nếu KLGD phiên chiều bù thêm trên <strong>12.000 tỷ</strong> và VN-Index giữ trên <strong>1.840</strong>",
      "outcome_html": "Tín hiệu mua chiều xác nhận, Index có thể test <strong>1.850</strong> trước ATC."
    },
    {
      "direction": "down",
      "scope": "afternoon_session",
      "condition_html": "Nếu VN-Index mất <strong>1.835</strong> với KLGD chiều tiếp tục thấp dưới <strong>8.000</strong> tỷ",
      "outcome_html": "Áp lực bán chiều đẩy về vùng <strong>1.825–1.830</strong>, đảo chiều so với mở cửa."
    },
    {
      "direction": "down",
      "scope": "afternoon_session",
      "label": "bull_trap",
      "condition_html": "Nếu KLGD tổng ngày dưới <span class='num'>60%</span> MA20 dù AM tăng nhẹ — tăng giả (<em>tăng-giả</em>)",
      "outcome_html": "Phiên sáng vượt nhẹ kháng cự <strong>1.842</strong> nhưng chiều thiếu lực đỡ, ATC có thể đảo về <strong>1.835</strong> hoặc thấp hơn."
    }
  ],
  "watchlist": [
    {"key": "Giao dịch chiều", "alert": true, "reason_html": "— KLGD AM chỉ 38% MA20; theo dõi KLGD chiều từ 13:00 để xác nhận có dòng tiền thực hay phiên tăng giả."},
    {"ticker": "VCB", "alert": false, "reason_html": "— Khối ngoại mua ròng +8,2 tỷ sáng nay, đảo chiều sau 4 phiên bán — xem chiều có duy trì."},
    {"ticker": "FPT", "alert": false, "reason_html": "— Nằm trong top mua ngoại sáng nay; chú ý có duy trì nếu KLGD chiều tăng."},
    {"ticker": "HPG", "alert": false, "reason_html": "— Đóng góp âm nhẹ phiên sáng; nhóm vật liệu chưa hồi — theo dõi chiều có đảo chiều."},
    {"ticker": "MWG", "alert": false, "reason_html": "— Tăng 0,8% sáng không có tin rõ; cần xem chiều giữ giá hay điều chỉnh."}
  ],
  "unexplained": null
}"""


# ---------------------------------------------------------------------------
# User-prompt builder
# ---------------------------------------------------------------------------

_MIDDAY_USER_TEMPLATE = """Sinh bài cập nhật phiên sáng (midday brief) cho ngày {session_date}.

=== LOẠI PHIÊN: {session_type} ===

Tham khảo bài mẫu bên dưới để học style. KHÔNG copy nội dung, chỉ học giọng văn và cấu trúc.

{midday_sample}

=== EOD HÔM QUA (continuity) ===

{eod_block}

=== DỮ LIỆU PHIÊN SÁNG (JSON) ===

{payload_json}

=== YÊU CẦU ===

Sinh bài cập nhật theo JSON schema trong system prompt. Tuân thủ toàn bộ rules:
- Đúng 2 đoạn văn xuôi (session_structure + money_flow) + market_health status="pending".
- Đúng 3 kịch bản scope="afternoon_session" (tăng, giảm, bull_trap).
- Đúng 5 mục watchlist; watchlist[0].key = "Giao dịch chiều", alert=true.
- Headline 60-90 ký tự có % VN-Index AM.
- Tagline neutral (direction="flat") khi AM KLGD < 30% MA20 toàn ngày.
- Output chỉ JSON thuần, KHÔNG markdown fence."""


def _eod_block(payload: dict[str, Any]) -> str:
    """Format previous EOD continuity block for injection into the user prompt."""
    eod = payload.get("eod_previous") or payload.get("previous_eod")
    if not eod:
        return "CHƯA CÓ EOD hôm qua (lần đầu chạy hoặc chưa có bài daily). Bỏ qua phần tham chiếu EOD."
    lines = ["EOD hôm qua:"]
    if eod.get("session_date"):
        lines.append(f"  Ngày: {eod['session_date']}")
    if eod.get("headline"):
        lines.append(f"  Headline: {eod['headline']}")
    if eod.get("tagline"):
        lines.append(f"  Tagline: {eod['tagline']}")
    return "\n".join(lines)


def build_midday_user_prompt(payload: dict[str, Any], session_type: str) -> str:
    """Build the user prompt for the mid-day brief.

    Embeds:
    - The AM payload JSON (from build_midday_payload)
    - The previous-EOD continuity block
    - One inline midday few-shot example
    - The exact output JSON schema (from MIDDAY_SYSTEM_PROMPT)
    """
    session_date = (payload.get("meta") or {}).get("generated_for_date", "")
    return _MIDDAY_USER_TEMPLATE.format(
        session_date=session_date,
        session_type=session_type,
        midday_sample=_MIDDAY_SAMPLE,
        eod_block=_eod_block(payload),
        payload_json=json.dumps(payload, ensure_ascii=False, indent=2),
    )
