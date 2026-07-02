# backend/tests/test_midday_prompts.py
from app.services.ai.market_analysis.midday_prompts import MIDDAY_SYSTEM_PROMPT, build_midday_user_prompt


def test_system_prompt_encodes_midday_contract():
    s = MIDDAY_SYSTEM_PROMPT
    assert "Giao dịch chiều" in s
    assert "phiên sáng" in s.lower()
    for k in ["2 đoạn", "3 kịch bản", "5"]:  # 2 paragraphs, 3 scenarios, 5 watchlist (phrasing may vary — keep these tokens)
        assert k in s


def test_user_prompt_embeds_payload_and_schema():
    p = {"meta": {"generated_for_date": "2026-07-01"}, "charts": {}, "eod_previous": {"headline": "hôm qua"}}
    out = build_midday_user_prompt(p, "low_volatility")
    assert "2026-07-01" in out and "session_structure" in out and "afternoon_session" in out
