"""Pre-market brief prompt + user-prompt builder (3rd daily AI brief).

Mirrors the structure and voice of midday_prompts.py, but framed as a
morning-session opening brief oriented to the full trading day ahead.

PREMARKET_SYSTEM_PROMPT:  contract constants + output schema
build_premarket_user_prompt(payload, session_type) → str
_PREMARKET_SAMPLE: one-shot conforming example (machine-validated in B4)
"""

from __future__ import annotations

import json
from typing import Any

PREMARKET_SYSTEM_PROMPT = """Bạn là chuyên gia phân tích thị trường chứng khoán Việt Nam của IQX, viết bản tin trước phiên (pre-market brief) cho nhà đầu tư cá nhân và bán chuyên. Đây là BẢN TIN KHAI MẠC — tổng hợp thông tin quốc tế qua đêm, tin tức nổi bật, sự kiện trong ngày và định hướng kịch bản phiên sáng nay.

QUY TẮC TUYỆT ĐỐI:
1. KHÔNG dự đoán xu hướng tương lai chắc chắn. Kịch bản chỉ dùng điều kiện ("nếu X thì có thể Y"), không khẳng định.
2. KHÔNG khuyến nghị mua/bán. Phần "đáng quan sát" chỉ nêu lý do quan sát dựa trên data, không gợi ý hành động.
3. KHÔNG dùng từ rỗng: "tích cực", "cần theo dõi thêm", "có thể tăng/giảm" mà không kèm điều kiện, "thể hiện sự", "trong bối cảnh hiện tại", "thị trường giao dịch sôi động".
4. MỌI nhận định phải có SỐ kèm.
5. MỌI số phải có SO SÁNH với ngưỡng/MA/hôm qua khi khả thi.
6. CÓ CONVICTION. Nếu tín hiệu quốc tế tiêu cực, nói thẳng tác động cụ thể.
7. THỪA NHẬN GIỚI HẠN. Nếu thiếu data, viết quanh chỗ thiếu, KHÔNG bịa.
8. THAM CHIẾU EOD HÔM QUA. Nếu eod_previous_summary có headline/tagline/scenarios, BẮT BUỘC nêu ngắn gọn xem kịch bản nào đang ứng nghiệm khi viết bản tin.
9. EX-DIVIDEND CẢNH BÁO: Khi sự kiện loại ex_dividend xuất hiện, cần ghi chú giá tham chiếu sẽ giảm kỹ thuật — KHÔNG phải áp lực bán thực.
10. is_post_weekend=true: Điều chỉnh mở đầu nêu "sau kỳ nghỉ cuối tuần, nhà đầu tư cân nhắc tích lũy tâm lý 2 ngày...".
11. is_post_holiday=true: Điều chỉnh mở đầu nêu "sau kỳ nghỉ lễ kéo dài, thanh khoản mở đầu thường thấp...".
12. GIỌNG VĂN: tiếng Việt tự nhiên, chuyên nghiệp nhưng không hàn lâm. Câu ngắn, chủ động. Tránh cụm Anh hóa.
13. OUTPUT: JSON theo schema. KHÔNG kèm markdown code fence.

CẤU TRÚC OUTPUT PRE-MARKET (6 trường bắt buộc):
1. headline: 1 câu tóm bức tranh thị trường quốc tế qua đêm + tâm lý mở cửa, 60–90 ký tự, bắt buộc có em-dash "—", KHÔNG kết thúc bằng dấu chấm.
2. tagline: chuỗi theo đúng format "{TÂM LÝ VIẾT HOA} · {N tin tích cực} · {N sự kiện cao} · {1 lưu ý ngắn}".
3. world_paragraph: đoạn HTML-inline 70–130 từ (tính văn bản hiển thị), tóm tắt thị trường quốc tế qua đêm. Số bọc <span class='num'>…</span>; % tăng bọc <span class='up-text num'>+X%</span>; % giảm bọc <span class='down-text num'>−X%</span>. U+2212 (−) cho số âm, KHÔNG dấu trừ ASCII (-). Dùng global_markets.cells + global_markets.context.
4. hot_news: danh sách min(5, len(news_pool)) tin hàng đầu. Mỗi mục: {"id": "<VERBATIM từ news_pool>", "rank_order": <1..n>, "insight": "<BẮTĐẦU BẰNG EXACTLY: <strong>Tác động phiên sáng nay:</strong> rồi 30–55 từ nội dung>"}.
   — id phải copy VERBATIM từ news_pool, KHÔNG tự đặt.
5. events_filtered: 5–8 sự kiện (hard bounds 2–10) từ events_pool, sắp xếp theo time tăng dần. Mỗi mục: {"id": "<verbatim từ events_pool>", "note": "<8–20 từ>", "impact": "high"|"medium"|"low"}.
6. watch_today: 5–6 mục quan sát. Mỗi mục: {"level": "normal"|"alert"|"warn", "content": "<20–50 từ, mã cổ phiếu bọc <span class='tkr'>XXX</span>>"}. MỤC ĐẦU TIÊN (index 0) BẮT BUỘC đề cập "VN-Index" kèm ngưỡng hỗ trợ/kháng cự từ eod_previous_summary.

KHI KHÔNG ĐỦ DỮ LIỆU (meta.missing_fields):
— Viết quanh dữ liệu thiếu dựa trên những gì có, KHÔNG bịa số.
— Nếu eod_previous_summary = null: bỏ qua tham chiếu EOD, watch_today[0] nêu "VN-Index" dựa trên thông tin global_markets hiện có.

QUY TRÌNH SUY NGHĨ (không xuất ra): 1) Thị trường Mỹ/Nhật/châu Á đêm qua tăng hay giảm? Biên độ? 2) Hàng hóa: dầu/vàng thay đổi gì? 3) USD/VND: sentiment = precomputed, KHÔNG tự tính lại. 4) Tin nổi bật nào tác động trực tiếp phiên sáng nay? 5) Sự kiện ex-dividend/ĐHCĐ nào cần cảnh báo? 6) VN-Index hôm qua đóng cửa ở đâu, kịch bản nào ứng nghiệm? Sau đó viết theo schema.

=== QUY TẮC NGÔN NGỮ (v1.4) ===
- U+2212 (−) cho số âm trong HTML-inline, KHÔNG dùng dấu trừ ASCII (-).
- Số trong đoạn văn bọc <span class='num'>…</span>; % tăng bọc <span class='up-text num'>+X%</span>; % giảm bọc <span class='down-text num'>−X%</span>.
- Mã cổ phiếu trong watch_today bọc <span class='tkr'>XXX</span>.
- CẤM Anh hóa: catalyst/rotation/breakout/momentum/smart money/sell-off/streak/midcap/rally/bullish/bearish → dùng tiếng Việt tương đương.
- KHÔNG lộ data thiếu trực tiếp. Viết quanh nó.
- USD/VND sentiment đã được tính sẵn trong payload — KHÔNG tự suy từ tỷ giá.

=== ĐỊNH DẠNG OUTPUT JSON (BẮT BUỘC) ===
Các khóa bắt buộc và CHỈ 6 khóa: headline, tagline, world_paragraph, hot_news, events_filtered, watch_today.

Ví dụ cấu trúc:
{
  "headline": "...",
  "tagline": "...",
  "world_paragraph": "...",
  "hot_news": [
    {"id": "...", "rank_order": 1, "insight": "<strong>Tác động phiên sáng nay:</strong> ..."},
    ...
  ],
  "events_filtered": [
    {"id": "...", "note": "...", "impact": "high"},
    ...
  ],
  "watch_today": [
    {"level": "normal", "content": "VN-Index ..."},
    ...
  ]
}
KHÔNG kèm markdown fence."""


# ---------------------------------------------------------------------------
# One-shot pre-market example (teaches style AND conforms to full contract)
# ---------------------------------------------------------------------------

_PREMARKET_SAMPLE = """=== MẪU PRE-MARKET BRIEF (ONE-SHOT — học giọng văn VÀ cấu trúc schema) ===

Ngày: 2026-07-03  |  Loại: premarket  |  Thứ Năm

{
  "headline": "Phố Wall tăng nhẹ qua đêm — tâm lý thận trọng trước số liệu việc làm Mỹ",
  "tagline": "THẬN TRỌNG · 3 tin tích cực · 2 sự kiện cao · Theo dõi thanh khoản mở cửa",
  "world_paragraph": "S&P 500 đóng cửa tại <span class='num'>5.482</span> (<span class='up-text num'>+0,31%</span>); NASDAQ tăng <span class='up-text num'>+0,18%</span> trong phiên giao dịch thưa. Nikkei 225 tại <span class='num'>38.950</span> (<span class='up-text num'>+0,55%</span>) nhờ JPY yếu. Dầu Brent tại <span class='num'>84,2</span> USD/thùng, giảm nhẹ <span class='down-text num'>−0,4%</span> sau tuần tăng liên tiếp. Vàng tại <span class='num'>2.338</span> USD/oz, ổn định quanh đỉnh ngắn hạn. USD/VND: sentiment trung tính theo dữ liệu tỷ giá VCB — không tạo áp lực đặc biệt lên khối ngoại. Tổng thể thị trường quốc tế tích cực nhẹ, không có cú sốc qua đêm, tạo nền tâm lý thuận cho phiên khai mạc.",
  "hot_news": [
    {
      "id": "news-001",
      "rank_order": 1,
      "insight": "<strong>Tác động phiên sáng nay:</strong> Kết quả kinh doanh quý II vượt kỳ vọng có thể tạo lực mua chủ động nhóm ngân hàng trong phiên sáng, đặc biệt nếu thanh khoản mở cửa đạt trên 1.200 tỷ trong 15 phút đầu."
    },
    {
      "id": "news-002",
      "rank_order": 2,
      "insight": "<strong>Tác động phiên sáng nay:</strong> Thông tin FDI tăng mạnh hỗ trợ tâm lý tích cực cho nhóm khu công nghiệp; tuy nhiên cần quan sát biến động thực tế thay vì phản ứng theo kỳ vọng."
    },
    {
      "id": "news-003",
      "rank_order": 3,
      "insight": "<strong>Tác động phiên sáng nay:</strong> Thông tin tăng lãi suất từ một ngân hàng thương mại lớn có thể tạo áp lực nhẹ lên nhóm bất động sản vốn nhạy cảm với chi phí vốn, theo dõi phản ứng trong 30 phút đầu phiên."
    },
    {
      "id": "news-004",
      "rank_order": 4,
      "insight": "<strong>Tác động phiên sáng nay:</strong> Tin xuất khẩu thủy sản tăng 12% so cùng kỳ hỗ trợ tâm lý nhóm thủy sản vốn hóa nhỏ; tác động lên điểm số toàn thị trường hạn chế do trọng số thấp."
    },
    {
      "id": "news-005",
      "rank_order": 5,
      "insight": "<strong>Tác động phiên sáng nay:</strong> Thông tin nới room ngoại cho một doanh nghiệp bảo hiểm có thể thu hút dòng tiền đặc thù phiên sáng, không đại diện cho xu hướng toàn thị trường."
    }
  ],
  "events_filtered": [
    {
      "id": "evt-001",
      "note": "Ngày giao dịch không hưởng quyền — giá tham chiếu giảm kỹ thuật, không phải bán thực",
      "impact": "high"
    },
    {
      "id": "evt-002",
      "note": "ĐHCĐ thường niên quyết định kế hoạch lợi nhuận và cổ tức năm nay",
      "impact": "high"
    },
    {
      "id": "evt-003",
      "note": "Niêm yết thêm cổ phiếu có thể pha loãng nhẹ trong ngắn hạn",
      "impact": "medium"
    },
    {
      "id": "evt-004",
      "note": "Báo cáo tài chính bán niên công bố, nhà đầu tư chú ý dòng tiền hoạt động",
      "impact": "medium"
    },
    {
      "id": "evt-005",
      "note": "Giao dịch nội bộ cổ đông lớn — theo dõi chiều mua hay bán",
      "impact": "low"
    }
  ],
  "watch_today": [
    {
      "level": "normal",
      "content": "VN-Index: ngưỡng hỗ trợ <span class='num'>1.290</span>–<span class='num'>1.295</span> là vùng giữ chính phiên sáng; nếu mở cửa trên <span class='num'>1.300</span> và giữ được, tâm lý cải thiện rõ."
    },
    {
      "level": "alert",
      "content": "<span class='tkr'>VCB</span>: ngày giao dịch không hưởng quyền cổ tức — giá tham chiếu giảm kỹ thuật; áp lực bán thực tế cần phân biệt khỏi điều chỉnh tham chiếu."
    },
    {
      "level": "normal",
      "content": "<span class='tkr'>HPG</span>: nhóm thép theo dõi giá dầu và quặng sắt qua đêm; HPG chiếm trọng số lớn trong nhóm công nghiệp cơ bản."
    },
    {
      "level": "warn",
      "content": "<span class='tkr'>VIC</span>: nhạy cảm với thông tin lãi suất; nếu nhóm bất động sản mở cửa giảm trên <span class='num'>1%</span> có thể kéo độ rộng toàn sàn."
    },
    {
      "level": "normal",
      "content": "<span class='tkr'>FPT</span>: nằm trong nhóm công nghệ hưởng lợi từ tâm lý Phố Wall tích cực; theo dõi thanh khoản có xác nhận dòng tiền thực hay không."
    }
  ]
}"""


# ---------------------------------------------------------------------------
# User-prompt builder
# ---------------------------------------------------------------------------

_PREMARKET_USER_TEMPLATE = """Sinh bản tin trước phiên (pre-market brief) cho ngày {session_date} — {weekday_vi}.

=== LOẠI PHIÊN: {session_type} ===

{post_context}

Tham khảo bài mẫu bên dưới để học style. KHÔNG copy nội dung, chỉ học giọng văn và cấu trúc.

{premarket_sample}

=== EOD HÔM QUA (continuity) ===

{eod_block}

=== DỮ LIỆU PRE-MARKET (JSON) ===

{payload_json}

=== YÊU CẦU ===

Sinh bản tin pre-market theo JSON schema trong system prompt. Tuân thủ toàn bộ rules:
- Đúng 6 khóa: headline, tagline, world_paragraph, hot_news, events_filtered, watch_today.
- headline: 60–90 ký tự, có em-dash "—", KHÔNG kết thúc bằng dấu chấm.
- tagline: format "{{TÂM LÝ VIẾT HOA}} · {{N tin tích cực}} · {{N sự kiện cao}} · {{1 lưu ý}}".
- world_paragraph: 70–130 từ (văn bản hiển thị), số bọc span class='num', % tăng/giảm bọc span class='up-text num'/'down-text num'.
- hot_news: đúng min(5, len(news_pool)) mục; id VERBATIM từ news_pool; insight BẮT ĐẦU CHÍNH XÁC "<strong>Tác động phiên sáng nay:</strong> " rồi 30–55 từ.
- events_filtered: 5–8 mục từ events_pool, sắp xếp theo time tăng dần; note 8–20 từ; impact "high"/"medium"/"low".
- watch_today: 5–6 mục; mục [0] BẮT BUỘC đề cập "VN-Index"; content 20–50 từ; mã cổ phiếu bọc <span class='tkr'>.
- KHÔNG bịa id. Nếu pools rỗng, điều chỉnh count theo quy tắc (hot_news = min(5,0) = 0).
- Output chỉ JSON thuần, KHÔNG markdown fence."""


def _eod_block(payload: dict[str, Any]) -> str:
    """Format previous EOD continuity block for injection into the user prompt."""
    eod = payload.get("eod_previous_summary")
    if not eod:
        return "CHƯA CÓ EOD hôm qua (lần đầu chạy hoặc chưa có bài daily). Bỏ qua phần tham chiếu EOD."
    lines = ["EOD hôm qua:"]
    if eod.get("headline"):
        lines.append(f"  Headline: {eod['headline']}")
    if eod.get("tagline"):
        lines.append(f"  Tagline: {eod['tagline']}")
    scenarios = eod.get("scenarios")
    if scenarios:
        lines.append("  Kịch bản EOD:")
        for sc in (scenarios if isinstance(scenarios, list) else []):
            cond = sc.get("condition", "")
            outcome = sc.get("outcome", "")
            lines.append(f"    - {cond} → {outcome}")
    watchlist = eod.get("watchlist")
    if watchlist:
        lines.append("  Watchlist EOD:")
        for w in (watchlist if isinstance(watchlist, list) else []):
            lines.append(f"    - {w.get('key', '')}: {w.get('reason', '')}")
    return "\n".join(lines)


def _post_context_block(payload: dict[str, Any]) -> str:
    """Return a contextual note when session follows a weekend or holiday."""
    config = payload.get("config") or {}
    if config.get("is_post_holiday"):
        return "LƯU Ý: Phiên sau kỳ nghỉ lễ kéo dài — thanh khoản mở đầu thường thấp, tâm lý chờ quan sát đầu phiên."
    if config.get("is_post_weekend"):
        return "LƯU Ý: Phiên sau nghỉ cuối tuần — nhà đầu tư tích lũy tâm lý 2 ngày, mở cửa có thể biến động mạnh hơn bình thường."
    return ""


def build_premarket_user_prompt(payload: dict[str, Any], session_type: str) -> str:
    """Build the user prompt for the pre-market brief.

    Embeds:
    - The pre-market payload JSON (from build_premarket_payload)
    - The previous-EOD continuity block
    - One inline pre-market few-shot example
    - Post-weekend / post-holiday context note
    - The exact output JSON schema (from PREMARKET_SYSTEM_PROMPT)
    """
    session_date = (payload.get("meta") or {}).get("generated_for_date", "")
    config = payload.get("config") or {}
    weekday_vi = config.get("weekday_vi", "")
    return _PREMARKET_USER_TEMPLATE.format(
        session_date=session_date,
        weekday_vi=weekday_vi,
        session_type=session_type,
        post_context=_post_context_block(payload),
        premarket_sample=_PREMARKET_SAMPLE,
        eod_block=_eod_block(payload),
        payload_json=json.dumps(payload, ensure_ascii=False, indent=2),
    )
