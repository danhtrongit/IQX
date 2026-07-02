from app.services.ai.market_analysis.midday_validator import validate_midday


def _ok():
    return {
        "headline": "VN-Index giảm 0,4% phiên sáng — thanh khoản dưới trung bình 20 phiên",
        "tagline": {"text": "THẬN TRỌNG · Thanh khoản thấp · Khối ngoại bán", "color": "neutral"},
        "paragraphs": {
            "session_structure": {"status": "published", "content": "Chỉ số <span class='num'>1.234</span> ..."},
            "money_flow": {"status": "published", "content": "Khối ngoại bán <span class='down-text num'>−120</span> tỷ ..."},
            "market_health": {"status": "pending", "pending_message": "Cập nhật 16:30", "pending_until": "2026-07-01T16:30:00+07:00"},
        },
        "unexplained": {"title": "Điểm cần xác nhận trong phiên chiều", "content": "Nếu VN-Index giữ trên <strong>1.230</strong> ..."},
        "scenarios": [
            {"type": "up", "condition": "Nếu ...", "outcome": "...", "scope": "afternoon_session"},
            {"type": "down", "condition": "Nếu ...", "outcome": "...", "scope": "afternoon_session"},
            {"type": "down", "condition": "Khi thanh khoản ...", "outcome": "...", "scope": "afternoon_session"},
        ],
        "watchlist": [
            {"key": "VN-Index", "alert_level": "alert", "reason": "— vùng ..."},
            {"key": "Giao dịch chiều", "alert_level": "alert", "reason": "— ..."},
            {"key": "VHM", "alert_level": "normal", "reason": "— ..."},
            {"key": "Ngân hàng", "alert_level": "normal", "reason": "— ..."},
            {"key": "Thanh khoản", "alert_level": "warn", "reason": "— ..."},
        ],
    }


def test_valid_midday_passes():
    assert validate_midday(_ok(), {}) == []


def test_watchlist_item1_must_be_giao_dich_chieu():
    o = _ok(); o["watchlist"][1]["key"] = "FPT"
    errs = validate_midday(o, {})
    assert any("Giao dịch chiều" in e for e in errs)


def test_scenarios_must_be_three():
    o = _ok(); o["scenarios"] = o["scenarios"][:2]
    assert any("kịch bản" in e.lower() or "scenario" in e.lower() for e in validate_midday(o, {}))


def test_ascii_hyphen_before_digit_flagged():
    o = _ok(); o["paragraphs"]["money_flow"]["content"] = "bán -120 tỷ"
    assert any("−" in e or "U+2212" in e or "hyphen" in e.lower() for e in validate_midday(o, {}))
