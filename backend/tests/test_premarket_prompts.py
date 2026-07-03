"""Tests for premarket_prompts.py — TDD from task-B3-brief.md."""

import json
from app.services.ai.market_analysis.premarket_prompts import (
    PREMARKET_SYSTEM_PROMPT, build_premarket_user_prompt, _PREMARKET_SAMPLE)


def test_system_prompt_encodes_contract():
    s = PREMARKET_SYSTEM_PROMPT
    for token in ["Tác động phiên sáng nay", "VN-Index", "hot_news", "events_filtered", "watch_today", "60", "90"]:
        assert token in s


def test_system_prompt_contains_intl_containment_rule():
    """A live generation burned all 4 attempts on FORBIDDEN_INTL leaks (kospi,
    'châu á', 'vàng thế giới') outside the international-summary fields — the
    validator rejects them, so the system prompt must state the containment
    rule explicitly: international market content is ONLY allowed inside the
    headline and world_paragraph (headline is an intl-summary field by
    contract; the 2026-07-03 prod burn proved banning it there fails 4/4).
    """
    s = PREMARKET_SYSTEM_PROMPT
    # The containment phrasing itself
    assert "CHỈ được phép xuất hiện trong headline và world_paragraph" in s
    # Concrete forbidden-outside-world examples must be named in the rule
    for token in ["Kospi", "vàng/dầu thế giới", "chỉ số ngoại", "tỷ giá"]:
        assert token in s, f"missing token in containment rule: {token}"
    # Domestic scoping of the other fields must be spelled out
    assert "tác động lên thị trường Việt Nam" in s
    assert "KHÔNG nêu tên chỉ số ngoại" in s


def test_user_prompt_embeds_payload():
    p = {"meta": {"generated_for_date": "2026-07-03"}, "global_markets": {"cells": []},
         "news_pool": [], "events_pool": [], "eod_previous_summary": None,
         "config": {"is_post_weekend": False, "is_post_holiday": False, "weekday_vi": "Thứ Năm"}}
    out = build_premarket_user_prompt(p, "premarket")
    assert "2026-07-03" in out and "watch_today" in out


def test_sample_parses_as_json():
    data = json.loads(_PREMARKET_SAMPLE[_PREMARKET_SAMPLE.index("{"):])
    assert set(data) == {"headline", "tagline", "world_paragraph", "hot_news", "events_filtered", "watch_today"}
