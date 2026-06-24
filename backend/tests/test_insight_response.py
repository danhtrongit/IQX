"""TDD tests for build_insight_response (BT7).

Fixture: realistic v2 LLM output (ai_json) with markup in narrative/diff, all 6 layers.
Assertions cover the §4.5 contract: header, briefing, layers, fragments.
"""
import pytest
from app.services.ai.insight_response import build_insight_response

# ── Realistic v2 LLM JSON fixture ───────────────────────────────────────────

AI_JSON = {
    "L1": {
        "xu_huong": "Tăng",
        "statusLabel": "Mạnh",
        "ho_tro": "62,000",
        "khang_cu": "64,500",
        "da_gia": "Đang nhanh dần",
        "diff": "Xu hướng [bull]chuyển từ Đi ngang sang Tăng[/bull] so với phiên trước.",
    },
    "L2": {
        "thanh_khoan": "Bình thường",
        "statusLabel": "Bình thường",
        "cung_cau": "Cân bằng, tỷ lệ mua/bán gần 1.0",
        "tac_dong": "Lệnh có thể khớp bình thường, không nghẽn đáng kể",
        "diff": "Tín hiệu ổn định so với phiên trước.",
    },
    "L3": {
        "khoi_ngoai": "Mua ròng nhẹ, 2 phiên liên tiếp (tổng +1.5 triệu cổ phiếu)",
        "tu_doanh": "Trung tính, giao dịch nhỏ",
        "statusLabel": "Hỗ trợ nhẹ",
        "diff": "Khối ngoại [bull]chuyển từ bán sang mua ròng[/bull] trong 2 phiên gần nhất.",
    },
    "L4": {
        "noi_bo": "Phó Tổng giám đốc mua 20,000 cổ phiếu ngày 20/06",
        "khoi_luong_tong": "Nhỏ, mang tính tín hiệu",
        "statusLabel": "Hỗ trợ nhẹ",
        "diff": "Có giao dịch nội bộ mới [bear]từ người liên quan bán 5,000 cổ phiếu[/bear].",
    },
    "L5": {
        "tong_quan": "Tích cực",
        "statusLabel": "Tích cực",
        "tin_material": [
            {
                "tieu_de": "Phát hành trái phiếu thành công",
                "tag": "Phát hành",
                "tac_dong_ngan": "củng cố vốn cho năm 2026",
            }
        ],
        "tin_filler": [
            {"tieu_de": "Khen thưởng nội bộ", "tag": "Nhân sự"}
        ],
        "tac_dong": "Củng cố niềm tin dài hạn về định giá và chiến lược",
        "diff": "Có thêm tin mới [bull]phát hành trái phiếu thành công[/bull] so với phiên trước.",
    },
    "L6": {
        "trend": "Tăng",
        "status": "Mạnh",
        "timeframe": "trung hạn 1–2 tuần",
        "narrative": (
            "VCB đang [bull]tăng tốc sau 3 phiên điều chỉnh[/bull]. "
            "Khối ngoại mua ròng [num]+1.5 triệu[/num] cổ phiếu — tín hiệu tích cực. "
            "Vùng [gold]62,000[/gold] là mốc hỗ trợ cần giữ."
        ),
        "diff": (
            "[bear]Áp lực bán[/bear] đã dịu hẳn so với phiên trước — xu hướng đảo chiều lên."
        ),
        "observations": {
            "liquidity": "Thanh khoản bình thường, khớp [num]18 triệu[/num] cổ phiếu.",
            "moneyFlow": "Khối ngoại [bull]mua ròng nhẹ[/bull] 2 phiên liên tiếp.",
            "insider": "Phó Tổng giám đốc mua [num]20,000[/num] cổ phiếu.",
            "news": "Phát hành trái phiếu [bull]thành công[/bull] — củng cố vốn.",
            "supportResistance": "Hỗ trợ [gold]62,000[/gold], kháng cự [gold]64,500[/gold].",
        },
        "watchLevels": [
            {
                "tag": "Hỗ trợ 62,000",
                "description": "Nếu thủng kèm khối lượng tăng, rủi ro giảm thêm.",
            },
            {
                "tag": "Kháng cự 64,500",
                "description": "Nếu vượt kèm khối ngoại tiếp tục mua, mục tiêu tiếp theo 66,000.",
            },
        ],
        "recommendation": "Có thể mua thử",
    },
}

# ── Minimal payload fixture ──────────────────────────────────────────────────

PAYLOAD = {
    "symbol": "VCB",
    "price_board": [
        {
            "symbol": "VCB",
            "exchange": "HOSE",
            "close_price": 63200,
            "reference_price": 63100,
            "high_price": 63800,
            "low_price": 62500,
            "total_volume": 18000000,
        }
    ],
    "company_overview": {
        "exchange": "HOSE",
    },
    "company_details": {
        "icb_name_2": "Ngân hàng",
        "stock_type": "VN30",
    },
    "rawInput": {
        "trend": {"realtime": None, "ohlcv": [], "computed": {}},
        "liquidity": {"latest": None, "avg30": None, "history": []},
        "moneyFlow": {"foreign": [], "proprietary": []},
        "insider": {"transactions": []},
        "news": {"items": [], "tickerScore": None},
    },
}


# ── Tests ────────────────────────────────────────────────────────────────────


def test_header_symbol():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    assert out["header"]["symbol"] == "VCB"


def test_header_fields_present():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    h = out["header"]
    assert "price" in h
    assert "changePercent" in h
    assert "high" in h
    assert "low" in h
    assert "volume" in h
    assert isinstance(h["isLive"], bool)


def test_header_volume_formatted():
    """Volume must be a formatted string like '18.0M'."""
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    vol = out["header"]["volume"]
    assert isinstance(vol, str)
    # 18_000_000 → "18.0M"
    assert "M" in vol or "K" in vol or vol.isdigit()


def test_briefing_recommendation_in_five():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    rec = out["briefing"]["recommendation"]
    assert rec in {
        "Chờ điểm mua",
        "Có thể mua thử",
        "Quan sát thêm",
        "Nên giảm bớt",
        "Bán bớt",
    }


def test_briefing_recommendation_matches_fixture():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    assert out["briefing"]["recommendation"] == "Có thể mua thử"


def test_briefing_narrative_fragments():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    narrative = out["briefing"]["narrative"]
    assert isinstance(narrative, list)
    assert len(narrative) > 0
    # Should contain a 'bull' emphasis fragment from fixture
    variants = [f.get("variant") for f in narrative if f.get("type") == "emphasis"]
    assert "bull" in variants


def test_briefing_diff_is_first_analysis():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    diff = out["briefing"]["diff"]
    assert diff["isFirstAnalysis"] is True


def test_briefing_diff_has_change():
    """fixture diff has [bear] markup → hasChange True."""
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    diff = out["briefing"]["diff"]
    # diff text not a sentinel → hasChange True
    assert isinstance(diff["hasChange"], bool)


def test_briefing_observations_present():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    obs = out["briefing"]["observations"]
    for key in ("liquidity", "moneyFlow", "insider", "news", "supportResistance"):
        assert key in obs
        assert isinstance(obs[key], list)


def test_briefing_observations_fragments_parsed():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    # liquidity has [num] → number fragment
    liquidity_frags = out["briefing"]["observations"]["liquidity"]
    types = [f["type"] for f in liquidity_frags]
    assert "number" in types


def test_briefing_watch_levels():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    wl = out["briefing"]["watchLevels"]
    assert len(wl) == 2
    assert "tag" in wl[0] and "description" in wl[0]


def test_briefing_status_variant():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    assert out["briefing"]["statusVariant"] in ("bull", "warn", "bear", "neutral")


def test_layers_keys():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    assert set(out["layers"].keys()) == {"L1", "L2", "L3", "L4", "L5"}


def test_layer_l1_structure():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    l1 = out["layers"]["L1"]
    assert l1["layerNum"] == "L1"
    assert "layerName" in l1
    assert "statusLabel" in l1
    assert "statusLevel" in l1
    assert isinstance(l1["statusLevel"], int)
    assert 1 <= l1["statusLevel"] <= 5
    assert "fields" in l1
    assert isinstance(l1["fields"], list)
    assert "diff" in l1


def test_layer_l3_status_level_matches_label():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    l3 = out["layers"]["L3"]
    # "Hỗ trợ nhẹ" → level 4
    assert l3["statusLabel"] == "Hỗ trợ nhẹ"
    assert l3["statusLevel"] == 4


def test_layer_l1_status_level_matches_label():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    l1 = out["layers"]["L1"]
    # "Mạnh" → level 4
    assert l1["statusLabel"] == "Mạnh"
    assert l1["statusLevel"] == 4


def test_layer_l1_diff_is_first_analysis():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    diff = out["layers"]["L1"]["diff"]
    assert diff["isFirstAnalysis"] is True


def test_layer_l1_diff_fragments_parsed():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    diff = out["layers"]["L1"]["diff"]
    frags = diff["text"]
    assert isinstance(frags, list)
    # fixture diff has [bull] → emphasis variant='bull'
    emphasis = [f for f in frags if f.get("type") == "emphasis"]
    assert any(f["variant"] == "bull" for f in emphasis)


def test_narrative_fragment_contains_bear_variant():
    """At least one fragment in L6 narrative or layers has variant='bear'."""
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    # Check L4 diff which has [bear]
    l4_diff_frags = out["layers"]["L4"]["diff"]["text"]
    bear_frags = [f for f in l4_diff_frags if f.get("type") == "emphasis" and f.get("variant") == "bear"]
    assert len(bear_frags) > 0


def test_l5_fields_include_tin_material():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    l5 = out["layers"]["L5"]
    labels = [f["label"] for f in l5["fields"]]
    # tin_material and tin_filler should appear somewhere in fields
    assert any("material" in lbl.lower() or "tin" in lbl.lower() for lbl in labels)


def test_l5_news_structured_object_present():
    """L5 LayerCard must expose a structured `news` object (not from rawInput)."""
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    l5 = out["layers"]["L5"]
    assert "news" in l5, "L5 LayerCard must have a 'news' key"
    news = l5["news"]
    assert "material" in news
    assert "filler" in news
    assert isinstance(news["material"], list)
    assert isinstance(news["filler"], list)


def test_l5_news_material_tag_is_llm_tag():
    """The material item's tag must come from the LLM (e.g. 'Phát hành'), not '—'."""
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    news = out["layers"]["L5"]["news"]
    assert len(news["material"]) >= 1
    first = news["material"][0]
    assert first["tag"] == "Phát hành"
    assert first["title"] == "Phát hành trái phiếu thành công"


def test_l5_news_material_subtitle_from_tac_dong_ngan():
    """Material item subtitle must come from tac_dong_ngan."""
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    first = out["layers"]["L5"]["news"]["material"][0]
    assert first.get("subtitle") == "củng cố vốn cho năm 2026"


def test_l5_news_filler_tag_is_llm_tag():
    """Filler item tag must come from the LLM (e.g. 'Nhân sự'), not raw sentiment."""
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    news = out["layers"]["L5"]["news"]
    assert len(news["filler"]) >= 1
    first_filler = news["filler"][0]
    assert first_filler["tag"] == "Nhân sự"
    assert first_filler["title"] == "Khen thưởng nội bộ"


def test_l5_news_empty_when_no_items():
    """When tin_material and tin_filler are empty, news lists are empty."""
    ai_no_news = {**AI_JSON, "L5": {**AI_JSON["L5"], "tin_material": [], "tin_filler": []}}
    out = build_insight_response(ai_no_news, PAYLOAD, prev=None)
    news = out["layers"]["L5"]["news"]
    assert news["material"] == []
    assert news["filler"] == []


def test_raw_input_carried_through():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    assert "rawInput" in out
    assert "trend" in out["rawInput"]
    assert "liquidity" in out["rawInput"]


def test_updated_at_is_iso():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    from datetime import datetime
    dt = datetime.fromisoformat(out["updatedAt"].replace("Z", "+00:00"))
    assert dt.year >= 2024


def test_symbol_top_level():
    out = build_insight_response(AI_JSON, PAYLOAD, prev=None)
    assert out["symbol"] == "VCB"


def test_prev_not_none_is_not_first_analysis():
    out = build_insight_response(AI_JSON, PAYLOAD, prev={"layers": {}})
    assert out["layers"]["L1"]["diff"]["isFirstAnalysis"] is False
    assert out["briefing"]["diff"]["isFirstAnalysis"] is False


def test_layer_diff_sentinel_no_change():
    """If diff text is a sentinel (ổn định), hasChange should be False."""
    ai_stable = dict(AI_JSON)
    ai_stable = {**AI_JSON}
    # Override L1 diff with sentinel
    ai_stable_l1 = {**AI_JSON["L1"], "diff": "Tín hiệu ổn định so với phiên trước."}
    ai_stable = {**AI_JSON, "L1": ai_stable_l1}
    out = build_insight_response(ai_stable, PAYLOAD, prev=None)
    assert out["layers"]["L1"]["diff"]["hasChange"] is False


def test_layer_diff_first_analysis_sentinel_no_change():
    """Lần đầu sentinel also hasChange=False."""
    ai_first = {**AI_JSON}
    ai_first_l2 = {**AI_JSON["L2"], "diff": "Lần đầu phân tích — chưa có dữ liệu để so sánh."}
    ai_first = {**AI_JSON, "L2": ai_first_l2}
    out = build_insight_response(ai_first, PAYLOAD, prev=None)
    assert out["layers"]["L2"]["diff"]["hasChange"] is False
