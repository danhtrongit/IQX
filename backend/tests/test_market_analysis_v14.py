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
