"""Tests for premarket_prompts.py — TDD from task-B3-brief.md."""

import json
from app.services.ai.market_analysis.premarket_prompts import (
    PREMARKET_SYSTEM_PROMPT, build_premarket_user_prompt, _PREMARKET_SAMPLE)


def test_system_prompt_encodes_contract():
    s = PREMARKET_SYSTEM_PROMPT
    for token in ["Tác động phiên sáng nay", "VN-Index", "hot_news", "events_filtered", "watch_today", "60", "90"]:
        assert token in s


def test_user_prompt_embeds_payload():
    p = {"meta": {"generated_for_date": "2026-07-03"}, "global_markets": {"cells": []},
         "news_pool": [], "events_pool": [], "eod_previous_summary": None,
         "config": {"is_post_weekend": False, "is_post_holiday": False, "weekday_vi": "Thứ Năm"}}
    out = build_premarket_user_prompt(p, "premarket")
    assert "2026-07-03" in out and "watch_today" in out


def test_sample_parses_as_json():
    data = json.loads(_PREMARKET_SAMPLE[_PREMARKET_SAMPLE.index("{"):])
    assert set(data) == {"headline", "tagline", "world_paragraph", "hot_news", "events_filtered", "watch_today"}
