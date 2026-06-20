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
