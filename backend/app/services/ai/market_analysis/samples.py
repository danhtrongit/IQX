"""Five gold-standard few-shot samples (spec section 4) — v1.4 clean.

Injected into the user prompt to teach voice/structure — NOT to be copied.

All texts are scrubbed at module load via _clean():
  - "Sức nóng nội tại" → "Sức khỏe thị trường"
  - Anglicized terms replaced with plain Vietnamese
  - Wyckoff/forbidden terms replaced
  - "Bối cảnh thế giới" paragraph (and any paragraph containing international
    indices / S&P500 / Nikkei / USD/VND …) stripped entirely
"""

from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Replacement maps (mirrors run_v13/run_v14 sandbox scripts)
# ---------------------------------------------------------------------------

_ANGLICIZED: dict[str, str] = {
    "catalyst": "chất xúc tác",
    "rotation": "dòng tiền chuyển nhóm",
    "breakout": "bứt phá",
    "sell-off": "đợt bán mạnh",
    "selloff": "đợt bán mạnh",
    "momentum": "đà tăng",
    "smart money": "dòng tiền lớn",
    "streak": "chuỗi",
    "outperform": "vượt trội",
    "underperform": "kém hơn",
    "oversold": "bán quá đà",
    "overbought": "mua quá đà",
    "risk-on": "tâm lý chấp nhận rủi ro",
    "risk-off": "tâm lý né rủi ro",
    "hedging": "phòng vệ rủi ro",
    "exposure": "mức nắm giữ",
    "performance": "diễn biến",
    "narrative": "câu chuyện",
    "rebalancing": "tái cơ cấu",
}

_WYCKOFF: dict[str, str] = {
    "phân phối ngầm": "tổ chức xả hàng âm thầm",
    "phân phối đỉnh": "tổ chức xả hàng tại đỉnh",
    "vùng phân phối": "vùng tổ chức xả hàng",
    "phiên phân phối": "phiên tổ chức xả hàng",
    "tích lũy ngầm": "tích lũy âm thầm",
    "midcap": "vốn hóa vừa",
    "mid-cap": "vốn hóa vừa",
    "smallcap": "vốn hóa nhỏ",
    "largecap": "vốn hóa lớn",
    "co cụm": "thu hẹp",
}

# Paragraph-level markers — any paragraph whose lowercased text contains one
# of these is dropped entirely (strips "Bối cảnh thế giới" + intl references).
_INTL_PARA_MARKERS: list[str] = [
    "bối cảnh thế giới",
    "s&p500",
    "nikkei",
    "hang seng",
    "kospi",
    "shanghai",
    "usd/vnd",
    "châu á",
    "vàng -",
    "vàng +",
    "dxy",
    "đêm qua",
]


def _clean(text: str) -> str:
    """Apply all v1.4 cleaning rules to a sample text string."""
    # 1. Section header rename
    out = re.sub(r"Sức nóng nội tại", "Sức khỏe thị trường", text)
    # 2. Tagline token rename (e.g. "BREAKOUT YẾU")
    out = re.sub(r"\bBREAKOUT\b", "BỨT PHÁ", out)
    # 3. Anglicized term replacement (word-boundary, case-insensitive)
    for en, vi in _ANGLICIZED.items():
        out = re.sub(rf"\b{re.escape(en)}\b", vi, out, flags=re.IGNORECASE)
    # 4. Wyckoff / jargon replacement (no word-boundary needed for Vietnamese)
    for en, vi in _WYCKOFF.items():
        out = re.sub(re.escape(en), vi, out, flags=re.IGNORECASE)
    # 5. Strip paragraphs that contain international context markers
    blocks = [
        b for b in out.split("\n\n")
        if not any(m in b.lower() for m in _INTL_PARA_MARKERS)
    ]
    return "\n\n".join(blocks)


# ---------------------------------------------------------------------------
# Raw sample strings  (may contain pre-v1.4 terms — _clean() fixes them)
# ---------------------------------------------------------------------------

_NARROW_RALLY_RAW = """**HEADLINE:** Vượt 1.830 nhưng chưa thuyết phục — Vingroup gánh, ngoại không tin
**TAGLINE:** ▲ BREAKOUT YẾU · Tập trung vào 3 mã · Sức nóng nội tại chưa cải thiện

VN-Index có cú vượt 1.830 mà thị trường chờ đợi suốt tuần — nhưng đây không phải cú vượt có nền tảng rộng. Toàn bộ +24,27 điểm hôm nay được giải thích bởi đúng 3 mã: VIC (+8,4đ), VHM (+5,2đ), VRE (+2,1đ). Bộ ba Vingroup đóng góp 64% mức tăng. 27 mã còn lại trong VN30 chỉ đóng góp 8,6 điểm cộng lại. Độ rộng 218/147 — chưa đủ thuyết phục cho một phiên bứt phá (thường cần >300 mã tăng).

Khối ngoại bán ròng 113,8 tỷ phiên thứ 5 liên tiếp, tập trung vào VCB (-30,5 tỷ), FPT (-17,5 tỷ), STB (-8,9 tỷ), ACB (-6,6 tỷ) — toàn bluechip ngoài nhóm Vingroup. Pattern rõ: dòng vốn ngoại đang đảo danh mục khỏi nhóm dẫn dắt cũ, không phải bán hoảng loạn. Tự doanh CTCK ngược chiều, mua ròng 11,6 tỷ với điểm nhấn GEE (+2,08 tỷ) và GEX (+1,84 tỷ).

**Sức khỏe thị trường đang phân hóa rõ.** Thanh khoản 18.420 tỷ vượt 22% MA20 — dòng tiền vào mạnh nhưng tập trung vào số ít mã. Chỉ 58,4% rổ HOSE đứng trên MA20, gần như không đổi so với hôm qua (56,8%). Bất động sản dẫn đầu phiên thứ 4 liên tiếp (+3,2%), ngân hàng -0,8% phiên thứ 3 — dòng tiền chuyển nhóm thiên về Vingroup + đầu tư công, không lan tỏa.

**KỊCH BẢN PHIÊN SAU**
- Giữ trên 1.825 với KN bán dưới 80 tỷ → đà tăng có cơ sở tiếp diễn, mục tiêu 1.850
- Mất 1.815 với KN bán tiếp >150 tỷ → lặp pattern 12/05, test vùng 1.795-1.800

**ĐÁNG QUAN SÁT**
- **GEE, GEX**: tự doanh mua đột biến + dòng tiền chuyển nhóm đầu tư công
- **VCB**: KN bán mạnh nhất 5 phiên — quay lại định vị ngân hàng?

**CHƯA GIẢI THÍCH ĐƯỢC:** MWG +2,8% không có tin/event rõ rệt — cần xem phiên sau có duy trì."""

_BROAD_SELLOFF_RAW = """**HEADLINE:** Giảm sốc 2,7% — Áp lực bán đồng loạt từ trong và ngoài
**TAGLINE:** ▼ GIẢM RỘNG · Toàn thị trường đỏ · KN bán mạnh nhất 3 tháng

VN-Index có phiên giảm tệ nhất kể từ tháng 3, mất 50,2 điểm về 1.780,15 (-2,74%) trong bối cảnh áp lực bán đến đồng loạt. Độ rộng cực xấu: 47 mã tăng so với 378 mã giảm trên HOSE, 23 mã giảm sàn. Cả VN30 chỉ GAS giữ sắc xanh (+0,2%). Bộ ba ngân hàng VCB, BID, CTG cùng giảm 3-4%, chiếm 36% tổng phía giảm — "ngân hàng + bluechip cùng sụp" đáng lo hơn nhiều.

Khối ngoại bán ròng 850 tỷ — mạnh nhất 3 tháng, phá vỡ chuỗi tích lũy 1.500 tỷ của 10 phiên trước. Top bán: VCB (-180 tỷ), HPG (-95 tỷ), FPT (-78 tỷ), MSN (-62 tỷ) — phân bố đều khắp bluechip. Tự doanh CTCK cũng bán ròng 95 tỷ — cùng chiều, tín hiệu thận trọng nội tại.

**Sức khỏe thị trường bị phá rõ.** Thanh khoản 25.480 tỷ vượt MA20 tới 72% — không phải bán hoảng loạn thanh khoản cạn, mà là bán có chuẩn bị. Tỷ lệ mã trên MA20 sụp từ 64% xuống 38% trong 1 phiên — mức suy giảm 1 ngày lớn nhất 6 tháng. Mọi ngành đều giảm, nặng nhất bất động sản (-4,2%), công nghệ (-3,6%), ngân hàng (-3,1%). VN30 mất hỗ trợ MA50, Index về dưới MA20 lần đầu trong 3 tuần.

**KỊCH BẢN PHIÊN SAU**
- Giữ trên 1.770 với KN bán dưới 300 tỷ → áp lực kết thúc, hồi kỹ thuật về 1.800-1.810
- Mất 1.770 với KN bán tiếp >500 tỷ → mở rộng đợt bán mạnh, test vùng 1.730

**ĐÁNG QUAN SÁT**
- **VCB, CTG**: KN bán mạnh nhất — vùng giá trị có giữ?
- **GAS**: mã duy nhất giữ xanh — dòng tiền phòng thủ

Phiên có nguyên nhân rõ ràng từ nội lực thị trường — không có diễn biến cần thừa nhận chưa giải thích được."""

_LOW_VOLATILITY_RAW = """**HEADLINE:** Phiên chờ đợi — Index nhích 0,05%, thanh khoản thấp nhất 2 tuần
**TAGLINE:** ▬ ĐI NGANG · Thiếu chất xúc tác · Thanh khoản giảm dần

VN-Index đóng cửa gần như không đổi tại 1.825,42 (+0,92 điểm, +0,05%), trong một phiên thiếu chất xúc tác rõ rệt. Đây là phiên đi ngang điển hình — thị trường không có lý do hành động trước đáo hạn phái sinh thứ 5 tuần này. Độ rộng cân bằng 178 tăng / 165 giảm. 7/10 ngành dao động trong biên ±0,5%. Hai mã đóng góp lớn nhất chỉ là VCB (+0,3đ) và VHM (-0,2đ) — cộng lại chưa đến 0,5 điểm.

Khối ngoại net gần như 0 (+8 tỷ), nhưng nội dung phía sau đáng chú ý: mua VCB 45 tỷ, FPT 38 tỷ, đồng thời bán HPG 42 tỷ, VHM 35 tỷ — xoay vòng nội bộ VN30 chứ không phải mua/bán ròng có hướng. Tự doanh net 5 tỷ — không đáng chú ý.

**Sức khỏe thị trường đứng yên.** Tỷ lệ mã trên MA20 ở mức 60,2%, gần như không đổi 3 phiên gần đây (60,8% → 59,5% → 60,2%). Thanh khoản 9.180 tỷ — bằng 51% MA20 và là phiên thấp nhất kể từ kỳ nghỉ lễ tháng 5. Index và VN30 tiếp tục nằm trong biên MA20, chưa có tín hiệu đảo chiều rõ từ bất kỳ ngành nào. Thanh khoản thấp trong phiên đi ngang là tín hiệu **chờ** — dòng tiền lớn không tham gia khi rủi ro sự kiện chưa qua.

**CẦN THEO DÕI**
- Đáo hạn phái sinh thứ 5 tuần này — có thể tạo biên độ bất thường
- KQKD Q2 nhóm ngân hàng dự kiến công bố cuối tháng

Phiên này không có gì cần giải thích thêm — bản chất là "phiên trống" chờ chất xúc tác."""

_BROAD_RALLY_RAW = """**HEADLINE:** Lan tỏa rộng — 9/10 ngành tăng, ngoại quay lại sau chuỗi bán
**TAGLINE:** ▲ BỨT PHÁ THỰC SỰ · Dòng tiền đồng thuận · Cấu trúc lành mạnh

VN-Index tăng 33,21 điểm (+1,82%) lên 1.875,68 — phiên tăng có cấu trúc lành mạnh nhất 6 tuần qua. Độ rộng đảo chiều mạnh: 312 mã tăng / 68 mã giảm trên HOSE — tỷ lệ 4,6:1 cao nhất từ tháng 4. Trong VN30, 27/30 mã tăng. 9/10 ngành đóng cửa xanh. Đóng góp điểm phân tán đều: top 5 mã chỉ chiếm 38% tổng phía tăng — khác biệt cốt lõi so với phiên Vingroup-led.

Khối ngoại đảo chiều ngoạn mục: mua ròng 420 tỷ — phiên mua đầu tiên sau 8 phiên bán. Top mua: VCB (+58 tỷ), FPT (+42 tỷ), HPG (+38 tỷ) — đúng các mã bị bán mạnh 5 phiên trước. Tự doanh cũng mua ròng 85 tỷ — cùng chiều, tín hiệu chất lượng cao.

**Sức khỏe thị trường bứt phá.** Tỷ lệ mã trên MA20 nhảy từ 58% lên 71% chỉ trong 1 phiên — mức tăng 1 ngày lớn nhất 4 tháng. Thanh khoản 22.140 tỷ vượt 47% MA20 — dòng tiền nội thực sự vào. Bất động sản (+2,8%), ngân hàng (+2,1%), vật liệu (+2,4%) cùng dẫn dắt — không phụ thuộc 1 nhóm. VN30 vượt MA50 lần đầu trong 6 tuần; vốn hóa vừa và nhỏ cũng tăng theo, không có phân hóa quy mô.

**KỊCH BẢN PHIÊN SAU**
- Giữ trên 1.860 với KN tiếp tục mua → mở rộng phục hồi, mục tiêu 1.900-1.910 trong 5-7 phiên
- Chốt lãi T+ về 1.850 với KN giảm mua → tích lũy thay vì bứt phá, vẫn lành mạnh

**ĐÁNG QUAN SÁT**
- **VCB, BID**: bluechip ngân hàng dẫn dắt phục hồi
- **MWG, DGW**: nhóm bán lẻ phục hồi mạnh — dòng tiền chuyển nhóm thật?

Không có diễn biến nào cần thừa nhận chưa giải thích được."""

_DERIVATIVES_ANOMALY_RAW = """**HEADLINE:** Đáo hạn phái sinh — Index biến động 27 điểm, ATC bất thường
**TAGLINE:** ◆ BIẾN ĐỘNG KỸ THUẬT · Phái sinh chi phối · Tín hiệu cơ sở khó đọc

VN-Index đóng cửa tăng 15,42 điểm (+0,82%) lên 1.890,84, nhưng đây là phiên cần đọc kỹ hơn con số tổng — biên độ phiên rộng 27 điểm (1.875,40 → 1.902,12) và 18 điểm cuối được kéo lên trong 30 phút ATC. Đây là dấu ấn điển hình phiên đáo hạn. Phiên sáng dao động quanh 1.880-1.885; đến 14:00 áp lực bán đẩy về 1.875,4; bất ngờ 30 phút trước ATC dòng tiền lớn vào VIC, VHM, MSN kéo Index lên 27 điểm trong 25 phút.

Khối ngoại bán ròng 145 tỷ toàn phiên, nhưng phân bố bất thường: bán 280 tỷ trong 5 giờ chính, mua ròng 135 tỷ trong 30 phút ATC — khả năng cao là dòng tiền arbitrage hưởng chênh basis. Tự doanh mua ròng 220 tỷ — gấp 3-4 lần trung bình, gợi ý phòng vệ rủi ro quanh đáo hạn.

**Sức khỏe thị trường không thay đổi.** Vì biên độ do yếu tố kỹ thuật chi phối, các tín hiệu cơ sở hôm nay khó đọc: độ rộng 198/152 trung tính. Tỷ lệ mã trên MA20 vẫn 61%, gần như không đổi 2 phiên trước — Index tăng nhưng nền tảng kỹ thuật chưa thay đổi thực sự. Thanh khoản tương đương MA20. Không có ngành nào dẫn dắt rõ; vốn hóa lớn và nhỏ diễn biến gần tương đương.

**KỊCH BẢN PHIÊN SAU**
- Giữ trên 1.880 → tín hiệu kéo cuối phiên có cơ sở thực, test 1.910
- Mở cửa giảm về 1.875-1.880 → kéo cuối phiên chỉ là kỹ thuật, Index về vùng dao động thực

**ĐÁNG QUAN SÁT**
- **VIC, VHM, MSN**: 3 mã được kéo mạnh nhất — phiên sau giữ giá hay điều chỉnh?

**CHƯA GIẢI THÍCH ĐƯỢC:** lý do tự doanh mua ròng tới 220 tỷ — vượt xa nhu cầu phòng vệ rủi ro thông thường."""

# New sample: "Rút tiền ngầm" voice — Index biên độ nhỏ, dòng tiền lớn rút ngầm
HIDDEN_DISTRIBUTION = """**HEADLINE:** Bề mặt phẳng lặng — dòng tiền lớn rút âm thầm
**TAGLINE:** ◆ RÚT TIỀN NGẦM · Index -0,3% nhưng bên dưới khác hẳn · KN bán ngoại bất thường

Bề mặt Index chỉ đổi -0,31%, nhưng bên dưới câu chuyện hoàn toàn khác. VN-Index mất 5,68 điểm về 1.819,42 trong một phiên tưởng như yên tĩnh — 192 mã tăng, 201 mã giảm trên HOSE, tỷ lệ A/D (mã tăng/mã giảm) gần 1:1 che khuất áp lực bán có tổ chức phía sau. Top đóng góp dương chỉ là các mã lẻ tẻ; nhóm bluechip trụ cột VCB, BID, HPG, FPT đồng loạt mất điểm nhẹ nhưng đồng đều — dấu hiệu bán phân tán, không phải điều chỉnh ngẫu nhiên.

Khối ngoại bán ròng 1.540 tỷ — mức bán ròng ngày cao nhất 2 tháng, phiên thứ 4 liên tiếp bán ròng trên 400 tỷ. Tổng cộng 4 phiên gần nhất khối ngoại rút hơn 3.800 tỷ. Top bán: VCB (-320 tỷ), FPT (-210 tỷ), HPG (-185 tỷ), MWG (-142 tỷ) — phân bổ đều khắp bluechip, không có mã nào đối ứng mua tương xứng. Tự doanh CTCK bán ròng nhẹ 38 tỷ — không ngược chiều đỡ lực.

**Sức khỏe thị trường suy yếu rõ.** Tỷ lệ mã trên MA20 giảm từ 62% xuống 54% trong 4 phiên — xu hướng thu hẹp đều đặn dù Index gần như đứng yên. Thanh khoản 14.250 tỷ thấp hơn 18% MA20, cho thấy bên mua không đủ lực hấp thụ lệnh bán. VN30 hiện nằm ngay cạnh MA50; nếu mất MA50 phiên tới, cấu trúc kỹ thuật trung hạn sẽ xấu đi đáng kể. Không có ngành nào dẫn dắt liên tiếp 2 phiên — dòng tiền nội lẻ tẻ, thiếu định hướng. Nhóm vốn hóa vừa và nhỏ (đo qua HNX) giảm mạnh hơn VN-Index (-1,1% so với -0,3%), cho thấy phân hóa vốn hóa đang xấu đi: dòng tiền co về bluechip hoặc thoát khỏi thị trường hoàn toàn.

**KỊCH BẢN PHIÊN SAU**
- Giữ trên 1.810 với KN bán ngoại dưới 500 tỷ → áp lực tạm lắng, hồi nhẹ về 1.825-1.830
- Mất 1.810 với KN bán ngoại tiếp tục >800 tỷ → tổ chức xả hàng âm thầm tiếp diễn, test vùng 1.790-1.795

**ĐÁNG QUAN SÁT**
- **VCB**: KN bán ngoại đột biến 3 phiên liên tiếp — vùng giá 85.000 có giữ được không?
- **FPT, HPG**: cùng nằm trong danh sách bán mạnh — có phải tái cơ cấu danh mục cuối quý?

**CHƯA GIẢI THÍCH ĐƯỢC:** Tự doanh CTCK không mua ngược chiều dù KN bán ngoại lớn bất thường — khác hẳn 3 lần trước tình huống tương tự. Cần quan sát tự doanh phiên sau: nếu vẫn không mua thì tín hiệu thận trọng cao hơn nhiều."""


# ---------------------------------------------------------------------------
# Apply cleaning to all raw strings at module load
# ---------------------------------------------------------------------------

NARROW_RALLY = _clean(_NARROW_RALLY_RAW)
BROAD_SELLOFF = _clean(_BROAD_SELLOFF_RAW)
LOW_VOLATILITY = _clean(_LOW_VOLATILITY_RAW)
BROAD_RALLY = _clean(_BROAD_RALLY_RAW)
DERIVATIVES_ANOMALY = _clean(_DERIVATIVES_ANOMALY_RAW)
# HIDDEN_DISTRIBUTION is already clean — authored to spec directly

SAMPLES: dict[str, str] = {
    "narrow_rally": NARROW_RALLY,
    "broad_selloff": BROAD_SELLOFF,
    "low_volatility": LOW_VOLATILITY,
    "broad_rally": BROAD_RALLY,
    "derivatives_anomaly": DERIVATIVES_ANOMALY,
    "hidden_distribution": HIDDEN_DISTRIBUTION,
}

_SECONDARY: dict[str, str | None] = {
    "narrow_rally": "broad_rally",
    "broad_rally": "narrow_rally",
    "broad_selloff": "broad_rally",
    "low_volatility": None,
    "derivatives_anomaly": "narrow_rally",
    "hidden_distribution": "broad_rally",
}


def select_samples(session_type: str) -> tuple[str, str | None]:
    primary = SAMPLES.get(session_type, SAMPLES["low_volatility"])
    sec_type = _SECONDARY.get(session_type)
    secondary = SAMPLES.get(sec_type) if sec_type else None
    return primary, secondary
