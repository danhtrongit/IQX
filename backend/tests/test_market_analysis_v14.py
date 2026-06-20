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
