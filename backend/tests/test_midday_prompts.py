# backend/tests/test_midday_prompts.py
import json
from app.services.ai.market_analysis.midday_prompts import MIDDAY_SYSTEM_PROMPT, build_midday_user_prompt, _MIDDAY_SAMPLE


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


def test_one_shot_watchlist_index1_is_giao_dich_chieu():
    """Verify that the one-shot example has 'Giao dịch chiều' at watchlist index 1 (second position)."""
    # Extract JSON from _MIDDAY_SAMPLE (it starts after the === line and {)
    json_start = _MIDDAY_SAMPLE.index("{")
    json_str = _MIDDAY_SAMPLE[json_start:]
    data = json.loads(json_str)
    assert data["watchlist"][1]["key"] == "Giao dịch chiều"
    assert data["watchlist"][1]["alert"] is True


def test_system_prompt_schema_encodes_index1():
    """Verify that the system prompt's watchlist schema comment specifies index 1, not index 0."""
    s = MIDDAY_SYSTEM_PROMPT
    assert "index 1" in s
    assert "phần tử thứ hai" in s
