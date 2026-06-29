from app.services.ai.market_analysis import payload as P


def test_contribution_pct_by_side_never_exceeds_100():
    up = [{"symbol":"VHM","impact":2.0},{"symbol":"LPB","impact":1.0}]
    down = [{"symbol":"THD","impact":-5.0},{"symbol":"BID","impact":-1.0}]
    r = P._contribution_pct(up, down, change_points=-5.94)
    assert r["total_negative_points"] == 6.0
    assert r["top_negative"][0]["ticker"] == "THD"
    assert r["top_negative"][0]["pct_of_negative_side"] == 83.3  # 5/6
    assert all(0 <= x["pct_of_negative_side"] <= 100 for x in r["top_negative"])
    assert r["is_offsetting_session"] is True


def test_conc_flag_detects_dominant_ticker():
    rows = [{"ticker":"MSB","value_vnd_billion":372.5},{"ticker":"BSR","value_vnd_billion":24.8}]
    f = P._conc_flag(rows)
    assert f["concentrated"] is True and f["ticker"] == "MSB" and f["pct_of_same_side"] >= 50


def test_ma_label_small_diff_is_tuong_duong():
    assert P._ma_label(18804, 18901) == "thanh khoản tương đương MA20"
    assert "thấp hơn" in P._ma_label(7000, 18901)


def test_scenario_range_bounds():
    r = P._scenario_range(1824.5)
    assert r["far_support"] < 1824.5 < r["far_resistance"]


def test_contribution_pct_missing_when_empty():
    assert P._contribution_pct([], [], -5.0) == {"_missing": True}


from app.services.ai.market_analysis.classifier import classify_session


def test_classifier_hidden_distribution():
    p = {"meta":{"generated_for_date":"2026-06-19"},
         "vnindex":{"change_pct":-0.32,"intraday_range_pct":2.0,"last_30min_change_pct":0},
         "breadth":{"advances":81,"declines":203},
         "point_contribution":{"concentration":{}},
         "foreign_flow":{"net_value_vnd_billion":-1868,"streak_count":3},
         "volume":{"ratio_vs_ma20":0.99}}
    assert classify_session(p) == "hidden_distribution"


from app.services.ai.market_analysis import samples as S


def test_samples_v14_clean():
    blob = "\n".join(S.SAMPLES.values()).lower()
    for bad in ["sức nóng nội tại","catalyst","rotation","breakout","sell-off","phân phối ngầm","bối cảnh thế giới","s&p500"]:
        assert bad not in blob, bad
    assert "hidden_distribution" in S.SAMPLES
    assert "sức khỏe thị trường" in blob


from app.services.ai.market_analysis.prompts import SYSTEM_PROMPT


def test_prompt_has_v14_rules():
    for must in ["market_health","condition_html","watchlist","marker","Rút tiền ngầm",
                 "TỔNG PHÍA GIẢM","tương đương MA20","Chưa giải thích được",
                 "KHÔNG đoạn","HTML-inline"]:
        assert must in SYSTEM_PROMPT or must.lower() in SYSTEM_PROMPT.lower(), must


def test_prompt_no_legacy_contradictions():
    """Assert that OLD contradicting schema/rules are absent from SYSTEM_PROMPT."""
    assert '"internal_heat"' not in SYSTEM_PROMPT, 'legacy key "internal_heat" still present'
    assert '"global_context"' not in SYSTEM_PROMPT, 'legacy key "global_context" still present'
    assert '7 phần' not in SYSTEM_PROMPT, 'legacy "7 phần" count still present'
    assert '"condition": "..."' not in SYSTEM_PROMPT, 'old scenario schema with "condition" key still present'


# ── v1.4 validator tests (Task 5) ───────────────────────────────────────────

from app.services.ai.market_analysis.validator import validate_output

_PAYLOAD = {"point_contribution":{"top_positive":[{"ticker":"VHM"}]},
            "foreign_flow":{"top_sell":[{"ticker":"VHM","value_vnd_billion":-817}]},
            "prop_trading":{"buy_concentration_flag":{"concentrated":True}},
            "technical_levels":{"scenario_realistic_range":{"far_support":1715.1}},
            "memory_context":{"verifiable_claims_from_recent_analyses":[]}}

def _ok_out():
    return {"headline":"Bề mặt giảm nhẹ — HNX lao dốc","session_type":"hidden_distribution",
            "tagline":{"direction":"down","marker":"▼","text":"RÚT TIỀN NGẦM · ngoại bán"},
            "paragraphs":{"structure":"<span class='num'>1.824</span> điểm.",
                          "smart_money":"Khối ngoại bán ròng <span class='num'>1.868 tỷ</span>.",
                          "market_health":"Tỷ lệ mã trên MA20 còn 43%, giảm so với phiên trước, thanh khoản tương đương MA20, VN30 dưới MA50 và MA200 cho thấy xu hướng yếu, ngành dẫn dắt như bất động sản và ngân hàng đều giảm liên tiếp hai phiên, vốn hóa nhỏ và vừa giảm mạnh hơn bluechip, dòng tiền thu hẹp rõ rệt khiến sức khỏe thị trường suy yếu rõ nét trên diện rộng toàn phiên giao dịch."},
            "scenarios":[{"direction":"down","condition_html":"Mất <strong>1.815</strong>","outcome_html":"test <strong>1.795</strong>"}],
            "watchlist":[{"ticker":"VHM","alert":True,"reason_html":"— mâu thuẫn"}],
            "unexplained":"VHM tăng nhưng KN bán mạnh."}

def test_validator_passes_good_output():
    assert validate_output(_ok_out(), _PAYLOAD) == []

def test_validator_flags_marker_in_tagline():
    o = _ok_out(); o["tagline"]["text"] = "◆ RÚT TIỀN NGẦM"
    assert any("BUG17" in e for e in validate_output(o, _PAYLOAD))

def test_validator_flags_missing_unexplained_on_contradiction():
    o = _ok_out(); o["unexplained"] = None
    assert any("BUG21" in e for e in validate_output(o, _PAYLOAD))

def test_validator_bug16_allows_number_repeated_twice():
    # A figure appearing exactly twice across paragraphs is normal editorial — must NOT flag.
    o = _ok_out()
    o["paragraphs"]["structure"] = "VN-Index giảm 1,08 điểm so với tham chiếu."
    o["paragraphs"]["smart_money"] = "Nhóm dẫn dắt mất 1,08 điểm, kéo chỉ số đi xuống."
    assert not any("BUG16" in e for e in validate_output(o, _PAYLOAD))

def test_validator_bug16_flags_triple_repeat():
    o = _ok_out()
    o["paragraphs"]["structure"] = "Mức 2,15 điểm xuất hiện ở đây."
    o["paragraphs"]["smart_money"] = "Lại 2,15 điểm một lần nữa."
    o["paragraphs"]["market_health"] = o["paragraphs"]["market_health"] + " Thêm 2,15 điểm lần thứ ba."
    assert any("BUG16" in e for e in validate_output(o, _PAYLOAD))

def test_hard_errors_excludes_cosmetic_rules():
    from app.services.ai.market_analysis.validator import hard_errors
    errs = [
        "BUG16: số '1,08 điểm' lặp 3 lần", "BUG17: tagline.text còn chứa marker",
        "BUG18: market_health chỉ 50 từ (cần ≥70)", "BUG15: memory reference giữa đoạn",
        "Anh hóa: 'momentum'", "BUG21: có mâu thuẫn nhưng thiếu 'Chưa giải thích được'",
        "Quốc tế: 'fed'",
    ]
    hard = hard_errors(errs)
    assert "Anh hóa: 'momentum'" in hard
    assert any(x.startswith("BUG21") for x in hard)
    assert any(x.startswith("Quốc tế") for x in hard)
    assert not any(x.startswith(("BUG15", "BUG16", "BUG17", "BUG18")) for x in hard)


# ── v1.4 generator / memory tests (Task 6) ──────────────────────────────────

import json
from app.services.ai.market_analysis import generator as G


def test_parse_json_strips_fence():
    assert G._parse_json('```json\n{"a":1}\n```')["a"] == 1


def test_parse_scenario_condition_strips_html():
    from app.services.ai.market_analysis.memory import parse_scenario_condition
    cond = parse_scenario_condition("Giữ trên <strong>1.825</strong> với KN bán dưới 80 tỷ")
    assert cond.get("vnindex_above") == 1825


# ── v1.4 endpoint serializer tests (Task 7) ─────────────────────────────────

from app.api.v1.endpoints.market_analysis import AnalysisOut


def test_analysis_out_accepts_v14_shape():
    o = AnalysisOut(id="x", session_date="2026-06-19", session_type="hidden_distribution",
        session_type_display="Rút tiền ngầm", generated_at="2026-06-19T16:30:00+07:00",
        headline="h", tagline={"direction":"down","marker":"▼","text":"t"},
        paragraphs={"structure":"<span>1</span>","smart_money":"x","market_health":"y"},
        scenarios=[{"direction":"down","condition_html":"a","outcome_html":"b"}],
        watchlist=[{"ticker":"VHM","alert":True,"reason_html":"r"}], unexplained=None)
    assert o.session_type_display == "Rút tiền ngầm"
    assert o.paragraphs["market_health"] == "y"


def test_extract_claims_reads_outcome_html():
    from app.services.ai.market_analysis.memory import extract_claims
    out = {"scenarios":[{"direction":"down","condition_html":"Mất <strong>1.815</strong>","outcome_html":"test <strong>1.795</strong>"}]}
    claims = extract_claims(out)
    assert claims and claims[0]["predicted_outcome"] == "test <strong>1.795</strong>"


# ── v1.4 charts block tests (Task charts-v14) ────────────────────────────────

def test_build_charts_shape():
    """_build_charts returns all required top-level keys with correct sub-structure."""
    breadth_block = {
        "advances": 81, "declines": 203, "unchanged": 62,
        "ceiling_count": 18, "floor_count": 23,
    }
    b20 = [{"percent": 0.434, "trading_date": "2026-06-17"},
           {"percent": 0.486, "trading_date": "2026-06-18"},
           {"percent": 0.434, "trading_date": "2026-06-19"}]
    b50 = [{"percent": 0.387, "trading_date": "2026-06-19"}]
    fser = [
        {"foreign_buy_value_vnd": 1_860_000_000_000, "foreign_sell_value_vnd": 0},
        {"foreign_buy_value_vnd": 186_000_000_000,   "foreign_sell_value_vnd": 1_868_000_000_000},
    ]
    pser = [
        {"total_buy_value_vnd": 400_000_000_000, "total_sell_value_vnd": 100_000_000_000},
        {"total_buy_value_vnd": 372_500_000_000, "total_sell_value_vnd": 50_000_000_000},
    ]
    point_contribution = {
        "top_positive": [{"ticker": "VHM", "points": 2.26, "pct_of_positive_side": 60.0}],
        "top_negative": [{"ticker": "THD", "points": -5.04, "pct_of_negative_side": 83.3}],
    }
    foreign_flow = {
        "buy_value_vnd_billion": 186,
        "sell_value_vnd_billion": -1868,
        "streak_count": 3,
        "streak_direction": "sell",
        "top_sell": [{"ticker": "VHM", "value_vnd_billion": -817.7}],
        "top_buy":  [{"ticker": "VIC", "value_vnd_billion": 73.9}],
    }
    prop_trading = {
        "buy_value_vnd_billion": 400,
        "sell_value_vnd_billion": -100,
        "net_value_vnd_billion": 300,
        "top_buy":  [{"ticker": "MSB", "value_vnd_billion": 372.5}],
        "top_sell": [{"ticker": "BSR", "value_vnd_billion": -24.8}],
        "buy_concentration_flag": {"concentrated": True, "ticker": "MSB", "pct_of_same_side": 94},
    }
    sectors = [
        {"name": "Du lịch", "change_pct": 0.76},
        {"name": "Ngân hàng", "change_pct": -0.45},
    ]

    charts = P._build_charts(
        breadth_block=breadth_block,
        b20=b20, b50=b50,
        fser=fser, pser=pser,
        point_contribution=point_contribution,
        foreign_flow=foreign_flow,
        prop_trading=prop_trading,
        sectors=sectors,
    )

    # All six top-level keys present
    assert set(charts.keys()) == {
        "breadth", "contribution", "foreign_detail",
        "prop_detail", "market_health_detail", "sector_rotation",
    }

    # breadth
    b = charts["breadth"]
    assert b["up"] == 81 and b["down"] == 203 and b["flat"] == 62
    assert b["ceiling"] == 18 and b["floor"] == 23
    assert isinstance(b["classification"], str) and b["classification"]  # non-empty
    assert b["pct_above_ma20"] == 43.4  # 0.434 * 100

    # contribution
    c = charts["contribution"]
    assert c["top_negative"][0]["ticker"] == "THD"
    assert c["top_positive"][0]["ticker"] == "VHM"

    # foreign_detail
    fd = charts["foreign_detail"]
    assert "last_12_sessions" in fd and isinstance(fd["last_12_sessions"], list)
    assert fd["streak"]["count"] == 3 and fd["streak"]["direction"] == "sell"

    # prop_detail — anomaly flag on MSB
    pd = charts["prop_detail"]
    msb_item = next((x for x in pd["top_buy"] if x["ticker"] == "MSB"), None)
    assert msb_item is not None and msb_item.get("anomaly") is True

    # market_health_detail
    mh = charts["market_health_detail"]
    assert mh["pct_above_ma20"] == 43.4
    assert isinstance(mh["trend_20d"], list)
    assert mh["callout"]["type"] in ("warning", "neutral", "positive")

    # sector_rotation — sorted desc by pct
    sr = charts["sector_rotation"]["sectors_today"]
    assert sr[0]["name"] == "Du lịch"  # 0.76 > -0.45


def test_analysis_out_has_charts():
    """AnalysisOut Pydantic model accepts charts: dict | None."""
    from app.api.v1.endpoints.market_analysis import AnalysisOut
    o = AnalysisOut(
        id="x", session_date="2026-06-19", session_type="hidden_distribution",
        generated_at="2026-06-19T16:30:00+07:00",
        headline="h", tagline={"direction": "down", "marker": "▼", "text": "t"},
        paragraphs={"structure": "s", "smart_money": "m", "market_health": "h"},
        scenarios=[],
        charts={
            "breadth": {"ceiling": 18, "up": 81, "flat": 62, "down": 203, "floor": 23,
                        "ratio_up_down": "1 : 2,5", "classification": "Phân hóa tiêu cực",
                        "pct_above_ma20": 43.4},
            "contribution": {"top_negative": [], "top_positive": []},
            "foreign_detail": {"total_buy_vnd_billion": 186, "total_sell_vnd_billion": -1868,
                               "streak": {"count": 3, "direction": "sell", "last_5d_cumulative": -1743},
                               "last_12_sessions": [], "top_sell": [], "top_buy": []},
            "prop_detail": {"total_buy_vnd_billion": 400, "total_sell_vnd_billion": -100,
                            "net_vnd_billion": 300, "last_12_sessions": [], "top_buy": [], "top_sell": []},
            "market_health_detail": {"pct_above_ma20": 43.4, "pct_above_ma20_change": -5.2,
                                     "pct_above_ma50": 38.7, "pct_above_ma200": None,
                                     "trend_20d": [43.4], "callout": {"type": "warning", "text": "x"}},
            "sector_rotation": {"sectors_today": [{"name": "Du lịch", "pct": 0.76}]},
        },
    )
    assert o.charts is not None
    assert o.charts["breadth"]["classification"] == "Phân hóa tiêu cực"
    assert o.charts.get("sector_rotation") is not None
