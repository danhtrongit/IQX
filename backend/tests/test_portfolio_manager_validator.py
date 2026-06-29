from app.services.ai.portfolio_manager.validator import validate_narrative


def _good():
    return {
        "title": "Danh mục khỏe lên", "verdict": "Một danh mục đang khỏe lên.",
        "lede": "Một câu mở đầu.", "progress_text": "Bạn đã làm đúng.",
        "layers": {k: "Một đoạn phân tích." for k in
                   ("overview", "performance", "allocation", "stress", "risk", "attribution", "quality", "behavior")},
        "insight": {"label": "Điều bạn chưa để ý", "text": "TCB và MBB vận động cùng nhịp."},
        "low_data_note": "Với APG tôi chưa chấm điểm rủi ro.",
        "actions": [{"title": "Dứt điểm VND", "detail": "Mã đang lỗ 15,0% — đặt ngưỡng dừng."}],
        "watch": "Ba mốc.", "closing": "Bạn đang đi đúng hướng.",
    }


def _analysis():
    return {"meta": {"mode": "full_changed"}, "selected_insights": [{"id": "hidden_corr"}],
            "risk": {"excluded": [{"ticker": "APG"}]}}


def test_good_narrative_passes():
    assert validate_narrative(_good(), _analysis()) == []


def test_action_without_number_flagged():
    n = _good()
    n["actions"] = [{"title": "Xem lại", "detail": "Cân nhắc giảm bớt ngân hàng."}]  # no digit
    errs = validate_narrative(n, _analysis())
    assert any(e.startswith("ACTIONS_NUMBER") for e in errs)


def test_forbidden_recommendation_flagged():
    n = _good()
    n["closing"] = "Tôi khuyến nghị mua thêm HPG."
    assert any(e.startswith("FORBIDDEN_RECO") for e in validate_narrative(n, _analysis()))


def test_dot_decimal_flagged():
    n = _good()
    n["verdict"] = "Danh mục tăng 10.7%."
    assert any(e.startswith("DECIMAL_COMMA") for e in validate_narrative(n, _analysis()))
