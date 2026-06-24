from app.services.ai.insight_levels import status_level, briefing_variant


def test_levels():
    assert status_level("L1", "Rất mạnh") == 5
    assert status_level("L1", "Yếu") == 2
    assert status_level("L3", "Cảnh báo mạnh") == 1
    assert status_level("L3", "Hỗ trợ mạnh") == 5
    assert status_level("L5", "Rất tích cực") == 5
    assert status_level("L2", "Bình thường") == 3
    assert status_level("L4", "không-rõ") == 3


def test_variant():
    assert briefing_variant("Giảm", "Yếu") == "bear"
    assert briefing_variant("Tăng", "Mạnh") == "bull"
    assert briefing_variant("Đi ngang", "Yếu") in ("warn", "neutral")
