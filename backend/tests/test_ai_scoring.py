"""Tests for app.services.ai.scoring — Layer 6 deterministic scoring."""
from __future__ import annotations

import pytest

from app.services.ai.scoring import (
    L1_SCORES, L2_SCORES, L3_SCORES, L4_SCORES, L5_SCORES,
    compute_layer6, score_all_layers, score_layer,
)


# ── compute_layer6 ────────────────────────────────────────────────────────


def test_compute_layer6_all_max_positive():
    """All bullish: total power → high positive, reversal → high (because
    L1 alone is +1.0 → |L1|/1 = 100; L2..L5 sum = 2.4 → |.|/2.4 = 100; avg = 100)."""
    scores = {"trend": 1.0, "liquidity": 0.8, "moneyFlow": 0.7, "insider": 0.4, "news": 0.5}
    res = compute_layer6(scores)
    assert res["totalPower"] == pytest.approx(50.0, abs=0.1)
    # Both |L1|=1 and |sum L2..L5|=2.4 → reversal = (100 + 100) / 2 = 100
    assert res["reversalProbability"] == 100.0
    assert res["confidence"] == 0.0


def test_compute_layer6_all_zero():
    scores = {"trend": 0, "liquidity": 0, "moneyFlow": 0, "insider": 0, "news": 0}
    res = compute_layer6(scores)
    assert res["totalPower"] == 0.0
    assert res["reversalProbability"] == 0.0
    assert res["confidence"] == 100.0


def test_compute_layer6_all_max_negative():
    """All bearish: total power → −50%, reversal → 100%, confidence → 0%."""
    scores = {"trend": -1.0, "liquidity": -0.8, "moneyFlow": -0.7, "insider": -0.4, "news": -0.5}
    res = compute_layer6(scores)
    assert res["totalPower"] == pytest.approx(-50.0, abs=0.1)
    assert res["reversalProbability"] == 100.0
    assert res["confidence"] == 0.0


def test_compute_layer6_mixed_neutral():
    scores = {"trend": 0.6, "liquidity": 0.0, "moneyFlow": 0.0, "insider": 0.0, "news": 0.2}
    res = compute_layer6(scores)
    # total = 0.8 / 6.8 * 100 = 11.76 → rounded 11.8
    assert res["totalPower"] == pytest.approx(11.8, abs=0.1)
    # reversal = (|0.6|/1 + |0.2|/2.4) / 2 * 100 = (60 + 8.33) / 2 = 34.17 → 34.2
    assert res["reversalProbability"] == pytest.approx(34.2, abs=0.2)
    assert res["confidence"] == pytest.approx(100 - 34.2, abs=0.2)


def test_compute_layer6_missing_keys_default_zero():
    """Missing layer keys default to 0 (does not crash)."""
    res = compute_layer6({"trend": 1.0})
    # total = 1.0 / 6.8 * 100 = 14.7
    assert res["totalPower"] == pytest.approx(14.7, abs=0.1)


# ── score_layer extractors ───────────────────────────────────────────────


@pytest.mark.parametrize(
    "trend,state,expected",
    [
        ("Tăng", "Mạnh", "Tăng + Mạnh"),
        ("Tăng", "Giằng co", "Tăng + Giằng co"),
        ("Tăng", "Yếu", "Tăng + Yếu"),
        ("Đi ngang", "Yếu", "Đi ngang"),
        ("Giảm", "Mạnh", "Giảm + Mạnh"),
        ("Giảm", "Giằng co", "Giảm + Giằng co"),
        ("Giảm", "Yếu", "Giảm + Yếu"),
    ],
)
def test_l1_status_combinations(trend, state, expected):
    status, score = score_layer("trend", {"Xu hướng": trend, "Trạng thái": state})
    assert status == expected
    assert score == L1_SCORES[expected]


def test_l2_extracts_keyword_blends():
    """L2 status pulls from liquidity + impact fields."""
    cases = [
        ({"Thanh khoản": "cải thiện", "Tác động": "cơ hội vào/ra"},        "Cơ hội vào/ra thuận lợi",     0.8),
        ({"Thanh khoản": "suy yếu",   "Tác động": ""},                     "Thanh khoản yếu",             -0.5),
        ({"Thanh khoản": "bình thường","Tác động": "kẹt lệnh"},            "Kẹt lệnh",                    -0.8),
        ({"Thanh khoản": "cải thiện", "Tác động": "quan tâm thị trường"},  "Quan tâm nhưng chưa thành GD", 0.5),
        ({"Thanh khoản": "bình thường","Tác động": ""},                    "Trung tính",                  0.0),
    ]
    for output, expected_status, expected_score in cases:
        status, score = score_layer("liquidity", output)
        assert status == expected_status, output
        assert score == expected_score


def test_l3_money_flow_impact():
    cases = [
        ("ủng hộ xu hướng",  "Ủng hộ xu hướng",  0.7),
        ("cảnh báo nhiễu",   "Cảnh báo nhiễu",   -0.7),
        ("Trung tính",       "Trung tính",       0.0),
        ("",                 "Trung tính",       0.0),
    ]
    for impact, expected_status, expected_score in cases:
        status, score = score_layer("moneyFlow", {"Tác động": impact})
        assert status == expected_status
        assert score == expected_score


def test_l4_insider_level():
    cases = [
        ("tăng thận trọng", "Tăng thận trọng", -0.4),
        ("hỗ trợ nhẹ",      "Hỗ trợ nhẹ",      0.4),
        ("trung tính",      "Trung tính",      0.0),
    ]
    for level, expected_status, expected_score in cases:
        status, score = score_layer("insider", {"Mức cảnh báo": level})
        assert status == expected_status
        assert score == expected_score


def test_l5_news_impact():
    cases = [
        ("hỗ trợ tâm lý", "Hỗ trợ tâm lý",  0.5),
        ("gây áp lực",    "Gây áp lực",     -0.5),
        ("tăng biến động","Tăng biến động", -0.2),
        ("trung tính",    "Trung tính",     0.2),
    ]
    for impact, expected_status, expected_score in cases:
        status, score = score_layer("news", {"Tác động": impact})
        assert status == expected_status
        assert score == expected_score


# ── Edge cases ───────────────────────────────────────────────────────────


def test_score_layer_handles_non_dict_output():
    """When AI returns plain text fallback, score gracefully → Trung tính 0."""
    status, score = score_layer("trend", "free text not a dict")
    assert status == "Trung tính"
    assert score == 0.0


def test_score_layer_unknown_layer_key():
    status, score = score_layer("unknown_layer", {"x": "y"})
    assert status == "Trung tính"
    assert score == 0.0


def test_score_all_layers_end_to_end():
    layers = {
        "trend":     {"output": {"Xu hướng": "Tăng",   "Trạng thái": "Mạnh"}},
        "liquidity": {"output": {"Thanh khoản": "cải thiện", "Tác động": "cơ hội vào/ra"}},
        "moneyFlow": {"output": {"Tác động": "ủng hộ xu hướng"}},
        "insider":   {"output": {"Mức cảnh báo": "hỗ trợ nhẹ"}},
        "news":      {"output": {"Tác động": "hỗ trợ tâm lý"}},
    }
    layer_scores, agg = score_all_layers(layers)
    assert layer_scores["trend"]["status"] == "Tăng + Mạnh"
    assert layer_scores["trend"]["score"] == 1.0
    assert layer_scores["liquidity"]["score"] == 0.8
    assert layer_scores["moneyFlow"]["score"] == 0.7
    assert layer_scores["insider"]["score"] == 0.4
    assert layer_scores["news"]["score"] == 0.5
    # All max bullish → totalPower 50, reversal 100, confidence 0
    assert agg["totalPower"] == pytest.approx(50.0, abs=0.1)
    assert agg["reversalProbability"] == pytest.approx(100.0, abs=0.1)
    assert agg["confidence"] == 0.0


def test_score_all_layers_missing_layers_fallback():
    """Empty layers dict → all neutral. L5 'Trung tính' = 0.2 by design,
    so totalPower = 0.2/6.8*100 ≈ 2.9, reversal ≈ 4.2.
    """
    layer_scores, agg = score_all_layers({})
    assert all(sc["status"] == "Trung tính" for sc in layer_scores.values())
    assert agg["totalPower"] == pytest.approx(2.9, abs=0.1)
    assert agg["reversalProbability"] == pytest.approx(4.2, abs=0.2)
    assert agg["confidence"] == pytest.approx(95.8, abs=0.2)
