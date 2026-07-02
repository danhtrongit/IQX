# backend/tests/test_midday_prompts.py
import json
from app.services.ai.market_analysis.midday_prompts import MIDDAY_SYSTEM_PROMPT, build_midday_user_prompt, _MIDDAY_SAMPLE
from app.services.ai.market_analysis.midday_validator import validate_midday


def _parse_sample() -> dict:
    """Extract the JSON object embedded in the _MIDDAY_SAMPLE few-shot string."""
    json_start = _MIDDAY_SAMPLE.index("{")
    return json.loads(_MIDDAY_SAMPLE[json_start:])


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
    data = _parse_sample()
    assert data["watchlist"][1]["key"] == "Giao dịch chiều"
    assert data["watchlist"][1]["alert_level"] == "alert"


def test_midday_sample_passes_validator():
    """CROSS-BOUNDARY GUARD (C1): the prompt's few-shot MUST satisfy the same
    validator the live LLM output is checked against. If this fails, every real
    generation will re-fail the identical rules and the feature is dead on
    arrival. Parses the JSON out of _MIDDAY_SAMPLE and asserts zero errors."""
    sample = _parse_sample()
    assert validate_midday(sample, {}) == []


def test_system_prompt_schema_encodes_index1():
    """Verify that the system prompt's watchlist schema comment specifies index 1, not index 0."""
    s = MIDDAY_SYSTEM_PROMPT
    assert "index 1" in s
    assert "phần tử thứ hai" in s
