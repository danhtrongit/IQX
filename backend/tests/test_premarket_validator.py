"""Tests for the pre-market brief output validator.

Covers:
- Cross-guard: _PREMARKET_SAMPLE must pass its own validator.
- Every hard rule trips correctly.
- Soft rule (BUG16 number repetition) fires and is prefixed.
"""

from __future__ import annotations

import copy
import json

import pytest

from app.services.ai.market_analysis.premarket_validator import validate_premarket
from app.services.ai.market_analysis.premarket_prompts import _PREMARKET_SAMPLE


# ── helpers ────────────────────────────────────────────────────────────────────

def _load_sample() -> dict:
    """Parse _PREMARKET_SAMPLE into a dict."""
    return json.loads(_PREMARKET_SAMPLE[_PREMARKET_SAMPLE.index("{"):])


def _ok() -> dict:
    """Return a valid output dict derived from the sample."""
    return _load_sample()


def _pool(sample: dict) -> dict:
    """Construct a minimal payload from a sample dict (matching pool ids)."""
    return {
        "news_pool": [{"id": h["id"]} for h in sample["hot_news"]],
        "events_pool": [{"id": e["id"]} for e in sample["events_filtered"]],
    }


# ── cross-guard ────────────────────────────────────────────────────────────────

def test_sample_passes_validator():
    sample = json.loads(_PREMARKET_SAMPLE[_PREMARKET_SAMPLE.index("{"):])
    payload = {"news_pool": [{"id": h["id"]} for h in sample["hot_news"]],
               "events_pool": [{"id": e["id"]} for e in sample["events_filtered"]]}
    assert validate_premarket(sample, payload) == []


# ── hard: headline ─────────────────────────────────────────────────────────────

def test_headline_too_short():
    s = _ok()
    s["headline"] = "Phố Wall — ngắn"  # < 60 chars
    assert len(s["headline"]) < 60
    errs = validate_premarket(s, _pool(s))
    assert any("ký tự" in e for e in errs)


def test_headline_too_long():
    s = _ok()
    s["headline"] = "A" * 91  # > 90 chars, no em-dash will also fire but length fires
    errs = validate_premarket(s, _pool(s))
    assert any("ký tự" in e for e in errs)


def test_headline_missing_em_dash():
    s = _ok()
    # 60–90 chars but no em-dash
    s["headline"] = "Phố Wall tăng nhẹ qua đêm tâm lý thận trọng trước số liệu"
    errs = validate_premarket(s, _pool(s))
    assert any("em-dash" in e or "—" in e for e in errs)


# ── hard: tagline ─────────────────────────────────────────────────────────────

def test_tagline_empty_fails():
    s = _ok()
    s["tagline"] = ""
    errs = validate_premarket(s, _pool(s))
    assert any("tagline" in e.lower() for e in errs)


def test_tagline_none_fails():
    s = _ok()
    s["tagline"] = None
    errs = validate_premarket(s, _pool(s))
    assert any("tagline" in e.lower() for e in errs)


# ── hard: world_paragraph word count ──────────────────────────────────────────

def test_world_paragraph_too_short():
    s = _ok()
    s["world_paragraph"] = "Thị trường tăng nhẹ."  # < 70 words
    errs = validate_premarket(s, _pool(s))
    assert any("world_paragraph" in e for e in errs)


def test_world_paragraph_too_long():
    s = _ok()
    s["world_paragraph"] = " ".join(["từ"] * 131)  # > 130 words
    errs = validate_premarket(s, _pool(s))
    assert any("world_paragraph" in e for e in errs)


# ── hard: hot_news count (exact = min(5, len(news_pool))) ─────────────────────

def test_hot_news_exact_count_small_pool():
    """Pool has 3 items — output must have exactly 3 hot_news."""
    s = _ok()
    # Trim to 3 items
    s["hot_news"] = s["hot_news"][:3]
    # Pool also has 3 items — count matches → no error
    payload = {
        "news_pool": [{"id": h["id"]} for h in s["hot_news"]],
        "events_pool": [{"id": e["id"]} for e in s["events_filtered"]],
    }
    assert validate_premarket(s, payload) == []


def test_hot_news_count_mismatch_small_pool():
    """Pool has 3 items but output has 5 → error (5 != min(5, 3) = 3)."""
    s = _ok()
    payload = {
        "news_pool": [{"id": h["id"]} for h in s["hot_news"][:3]],
        "events_pool": [{"id": e["id"]} for e in s["events_filtered"]],
    }
    errs = validate_premarket(s, payload)
    assert any("hot_news" in e for e in errs)


# ── hard: hot_news id must be in pool ─────────────────────────────────────────

def test_hallucinated_news_id_is_hard_error():
    sample = json.loads(_PREMARKET_SAMPLE[_PREMARKET_SAMPLE.index("{"):])
    payload = {"news_pool": [{"id": "khac"}], "events_pool": [{"id": e["id"]} for e in sample["events_filtered"]]}
    errs = validate_premarket(sample, payload)
    assert any("id" in e.lower() for e in errs)


def test_valid_news_ids_pass():
    s = _ok()
    errs = validate_premarket(s, _pool(s))
    assert not any("hot_news" in e and "id" in e.lower() for e in errs)


def test_news_pool_empty_zero_hot_news_passes():
    s = _ok()
    s["hot_news"] = []
    payload = _pool(s)
    payload["news_pool"] = []
    errs = validate_premarket(s, payload)
    assert not any("hot_news" in e for e in errs)


# ── hard: events_filtered count (2–10) ───────────────────────────────────────

def test_events_filtered_too_few():
    s = _ok()
    s["events_filtered"] = s["events_filtered"][:1]  # only 1 — below minimum 2
    payload = {
        "news_pool": [{"id": h["id"]} for h in s["hot_news"]],
        "events_pool": [{"id": e["id"]} for e in s["events_filtered"]],
    }
    errs = validate_premarket(s, payload)
    assert any("events_filtered" in e for e in errs)


def test_events_filtered_too_many():
    s = _ok()
    # Build 11 events
    extra = [{"id": f"evt-{i:03d}", "note": "Báo cáo tài chính công bố kết quả", "impact": "low"}
             for i in range(1, 12)]
    s["events_filtered"] = extra
    pool_ids = [{"id": f"evt-{i:03d}"} for i in range(1, 12)]
    payload = {
        "news_pool": [{"id": h["id"]} for h in s["hot_news"]],
        "events_pool": pool_ids,
    }
    errs = validate_premarket(s, payload)
    assert any("events_filtered" in e for e in errs)


def test_events_both_empty_no_error():
    """No-events day: both pool and output empty — must not hard-fail."""
    s = _ok()
    s["events_filtered"] = []
    payload = {
        "news_pool": [{"id": h["id"]} for h in s["hot_news"]],
        "events_pool": [],
    }
    errs = validate_premarket(s, payload)
    assert not any("events_filtered" in e for e in errs)


# ── hard: events_filtered id must be in pool ─────────────────────────────────

def test_hallucinated_event_id_is_hard_error():
    s = _ok()
    payload = {
        "news_pool": [{"id": h["id"]} for h in s["hot_news"]],
        "events_pool": [{"id": "real-001"}],  # only one real id
    }
    # output has 5 events with different ids
    errs = validate_premarket(s, payload)
    assert any("id" in e.lower() for e in errs)


# ── hard: events_filtered impact enum ────────────────────────────────────────

def test_invalid_event_impact():
    s = _ok()
    s["events_filtered"][0]["impact"] = "critical"  # not in enum
    errs = validate_premarket(s, _pool(s))
    assert any("impact" in e for e in errs)


# ── hard: insight prefix ──────────────────────────────────────────────────────

def test_insight_wrong_prefix():
    s = _ok()
    s["hot_news"][0]["insight"] = "Không có prefix đúng, nội dung bình thường đây là thêm từ."
    errs = validate_premarket(s, _pool(s))
    assert any("insight" in e.lower() or "prefix" in e.lower() or "Tác động" in e for e in errs)


def test_insight_correct_prefix_passes():
    s = _ok()
    # Validate existing sample insights all have correct prefix
    errs = validate_premarket(s, _pool(s))
    assert not any("Tác động" in e for e in errs)


# ── hard: insight word count (30–55 stripped words after prefix) ──────────────

def test_insight_too_short():
    s = _ok()
    s["hot_news"][0]["insight"] = "<strong>Tác động phiên sáng nay:</strong> Ngắn quá chỉ vài từ đây."
    errs = validate_premarket(s, _pool(s))
    assert any("insight" in e.lower() or "từ" in e for e in errs)


def test_insight_too_long():
    s = _ok()
    long_body = " ".join(["từ"] * 56)  # 56 words > 55 limit
    s["hot_news"][0]["insight"] = f"<strong>Tác động phiên sáng nay:</strong> {long_body}"
    errs = validate_premarket(s, _pool(s))
    assert any("insight" in e.lower() or "từ" in e for e in errs)


# ── hard: watch_today count (5–6) ────────────────────────────────────────────

def test_watch_today_too_few():
    s = _ok()
    s["watch_today"] = s["watch_today"][:4]  # only 4
    errs = validate_premarket(s, _pool(s))
    assert any("watch_today" in e for e in errs)


def test_watch_today_too_many():
    s = _ok()
    s["watch_today"].append({"level": "normal", "content": "Thêm mục quan sát bổ sung hôm nay cần theo dõi thêm vài điểm nữa."})
    s["watch_today"].append({"level": "normal", "content": "Thêm mục quan sát thứ bảy không được phép theo quy tắc contract."})
    errs = validate_premarket(s, _pool(s))
    assert any("watch_today" in e for e in errs)


# ── hard: watch_today[0] must contain "VN-Index" ─────────────────────────────

def test_watch_today_zero_must_be_vnindex():
    sample = json.loads(_PREMARKET_SAMPLE[_PREMARKET_SAMPLE.index("{"):])
    sample["watch_today"][0]["content"] = "HPG cần chú ý vùng 28.000"
    payload = {"news_pool": [{"id": h["id"]} for h in sample["hot_news"]],
               "events_pool": [{"id": e["id"]} for e in sample["events_filtered"]]}
    assert any("VN-Index" in e for e in validate_premarket(sample, payload))


# ── hard: watch_today level enum ─────────────────────────────────────────────

def test_watch_today_invalid_level():
    s = _ok()
    s["watch_today"][1]["level"] = "critical"  # not in enum
    errs = validate_premarket(s, _pool(s))
    assert any("level" in e for e in errs)


# ── hard: ASCII hyphen before digit in stripped text ─────────────────────────

def test_ascii_hyphen_before_digit_triggers():
    s = _ok()
    # Inject an ASCII hyphen before digit into an insight
    s["hot_news"][0]["insight"] = (
        "<strong>Tác động phiên sáng nay:</strong> "
        "Giá dầu giảm -0.5% gây áp lực nhẹ lên nhóm vận tải và logistics trong phiên sáng nay."
    )
    errs = validate_premarket(s, _pool(s))
    assert any("U+2212" in e or "hyphen" in e.lower() or "ASCII" in e for e in errs)


def test_negative_number_with_u2212_passes():
    s = _ok()
    # U+2212 (−) should NOT trigger the ASCII hyphen rule
    s["hot_news"][0]["insight"] = (
        "<strong>Tác động phiên sáng nay:</strong> "
        "Giá dầu giảm <span class='down-text num'>−0,5%</span> gây áp lực nhẹ lên nhóm vận tải và logistics đặc biệt trong phiên sáng nay."
    )
    errs = validate_premarket(s, _pool(s))
    assert not any("U+2212" in e or "ASCII" in e for e in errs)


# ── soft: BUG16 number repetition ────────────────────────────────────────────

def test_bug16_number_repetition_is_soft():
    """BUG16 errors must be prefixed — they never block hard."""
    s = _ok()
    # Inject repeated number into insights
    repeated = (
        "<strong>Tác động phiên sáng nay:</strong> "
        "Thanh khoản đạt 1.200 tỷ trong phiên sáng hôm qua, 1.200 tỷ trong phiên chiều, "
        "và tiếp tục duy trì 1.200 tỷ trong hôm nay nhờ lực mua lan rộng."
    )
    s["hot_news"][0]["insight"] = repeated
    errs = validate_premarket(s, _pool(s))
    soft_errs = [e for e in errs if e.startswith("BUG16")]
    assert soft_errs  # BUG16 must fire
    from app.services.ai.market_analysis.validator import hard_errors
    hard = hard_errors(errs)
    assert not any("BUG16" in e for e in hard)


# ── hard: FORBIDDEN_INTL scope (headline is an international-summary field) ───

def test_headline_may_name_international_indices():
    """The headline contract REQUIRES summarizing the overnight world picture —
    specific index/commodity names there must NOT trip FORBIDDEN_INTL.
    (Prod burn 2026-07-03: 4/4 attempts died on s&p/brent in the headline.)"""
    s = _ok()
    s["headline"] = "S&P 500 lập đỉnh, dầu Brent hạ nhiệt — VN-Index chờ tín hiệu quanh 1.280"
    assert 60 <= len(s["headline"]) <= 90
    errs = validate_premarket(s, _pool(s))
    assert not any("Quốc tế" in e for e in errs), errs


def test_watch_today_still_bans_international_terms():
    s = _ok()
    s["watch_today"][1]["content"] = (
        "Chỉ số s&p tăng mạnh nên nhóm xuất khẩu có thể hưởng lợi trong "
        "phiên sáng nay, chú ý vùng giá mở cửa và thanh khoản khớp lệnh"
    )
    errs = validate_premarket(s, _pool(s))
    assert any("Quốc tế" in e for e in errs)
