"""Pre-market brief output validator.

validate_premarket(out, payload) -> list[str]

HARD rules (block publish):
- headline 60–90 chars + contains em-dash "—"
- tagline non-empty
- world_paragraph 70–130 words (HTML-stripped word count)
- len(hot_news) == min(5, len(payload["news_pool"]))
- every hot_news[].id ∈ pool ids
- every hot_news[].insight starts with exact prefix <strong>Tác động phiên sáng nay:</strong>
  and is 30–55 words (stripped, after prefix)
- events_filtered count 2–10 (skipped when both pool and output empty)
- every events_filtered[].id ∈ pool ids
- events_filtered[].impact ∈ {"high", "medium", "low"}
- watch_today 5–6 items
- watch_today[0]["content"] contains "VN-Index"
- watch_today[].level ∈ {"normal", "alert", "warn"}
- ASCII '-' before digit on stripped text → error (use U+2212 '−' for negatives)
- banned words (reuses FORBIDDEN_* from validator.py, applied to non-world_paragraph fields)

SOFT rules (BUG16-prefix, never block):
- number-repetition across content fields
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from app.services.ai.market_analysis.validator import (
    FORBIDDEN_ANGLICIZED,
    FORBIDDEN_BUG11,
    FORBIDDEN_INTL,
    FORBIDDEN_LEAK,
    SOFT_ERROR_PREFIXES,  # noqa: F401 — re-exported for callers
    hard_errors,  # noqa: F401 — re-exported for callers
)

# ── constants ──────────────────────────────────────────────────────────────────

_INSIGHT_PREFIX = "<strong>Tác động phiên sáng nay:</strong> "
_INSIGHT_PREFIX_STRIPPED = "Tác động phiên sáng nay: "

_IMPACT_ENUM = {"high", "medium", "low"}
_LEVEL_ENUM = {"normal", "alert", "warn"}


# ── helpers ────────────────────────────────────────────────────────────────────


def _strip(s: str | None) -> str:
    """Strip HTML tags from a string."""
    return re.sub(r"<[^>]+>", "", s or "")


def _wc(s: str) -> int:
    """Word count of a string."""
    return len(s.split())


def _all_content_texts(out: dict[str, Any]) -> list[str]:
    """Collect the DOMESTIC-focused text strings for the FORBIDDEN_INTL scan.

    world_paragraph AND headline are intentionally excluded: both are
    international-summary fields per the pre-market contract (the headline
    must "tóm bức tranh thị trường quốc tế", so S&P/Nikkei/Brent are its
    required content — banning them there made generation fail 4/4 attempts
    in prod). Both are still scanned for hyphen issues and
    FORBIDDEN_ANGLICIZED / FORBIDDEN_BUG11 / FORBIDDEN_LEAK terms.
    """
    texts: list[str] = []
    texts.append(out.get("tagline") or "")
    for item in out.get("hot_news") or []:
        texts.append(item.get("insight") or "")
    for item in out.get("events_filtered") or []:
        texts.append(item.get("note") or "")
    for item in out.get("watch_today") or []:
        texts.append(item.get("content") or "")
    return [t for t in texts if t]


def _all_texts_including_world(out: dict[str, Any]) -> list[str]:
    """All texts including headline + world_paragraph (hyphen + ANGLICIZED/BUG11/LEAK)."""
    texts = _all_content_texts(out)
    texts.append(out.get("headline") or "")
    wp = out.get("world_paragraph")
    if wp:
        texts.append(wp)
    return [t for t in texts if t]


# ── main validator ─────────────────────────────────────────────────────────────


def validate_premarket(out: dict[str, Any], payload: dict[str, Any]) -> list[str]:
    """Validate pre-market brief LLM output. Returns list of error strings.

    Hard errors (block publish): no SOFT_ERROR_PREFIXES prefix.
    Soft errors (cosmetic, never block): prefixed with e.g. 'BUG16'.
    """
    e: list[str] = []

    # ── HARD: headline 60–90 chars + em-dash ──────────────────────────────────
    headline = _strip(out.get("headline") or "")
    hl = len(headline)
    if not (60 <= hl <= 90):
        e.append(f"Headline {hl} ký tự (phải 60–90 ký tự)")
    if "—" not in headline:
        e.append("Headline thiếu em-dash '—' (bắt buộc theo contract)")

    # ── HARD: tagline non-empty ────────────────────────────────────────────────
    tagline = out.get("tagline") or ""
    if not tagline or not tagline.strip():
        e.append("tagline: không được để trống")

    # ── HARD: world_paragraph 70–130 words ────────────────────────────────────
    wp = _strip(out.get("world_paragraph") or "")
    wp_wc = _wc(wp) if wp else 0
    if not (70 <= wp_wc <= 130):
        e.append(f"world_paragraph {wp_wc} từ (phải 70–130 từ, sau khi strip HTML)")

    # ── HARD: hot_news count = min(5, len(news_pool)) ─────────────────────────
    news_pool = payload.get("news_pool") or []
    expected_hot = min(5, len(news_pool))
    hot_news = out.get("hot_news") or []
    if len(hot_news) != expected_hot:
        e.append(
            f"hot_news: phải có đúng {expected_hot} mục (min(5, {len(news_pool)})), "
            f"hiện tại {len(hot_news)}"
        )

    # ── HARD: hot_news ids must be in pool ────────────────────────────────────
    pool_news_ids = {item.get("id") for item in news_pool if item.get("id")}
    for i, item in enumerate(hot_news):
        nid = item.get("id")
        if nid not in pool_news_ids:
            e.append(
                f"hot_news[{i}].id '{nid}' không có trong news_pool "
                f"(id bịa / hallucinated)"
            )

    # ── HARD: hot_news insight prefix + word count ────────────────────────────
    for i, item in enumerate(hot_news):
        insight_raw = item.get("insight") or ""
        if not insight_raw.startswith(_INSIGHT_PREFIX):
            e.append(
                f"hot_news[{i}].insight phải bắt đầu đúng bằng "
                f"'<strong>Tác động phiên sáng nay:</strong> '"
            )
            continue  # can't meaningfully count words without the prefix
        insight_stripped = _strip(insight_raw)
        # after stripping HTML, prefix becomes "Tác động phiên sáng nay: "
        body = insight_stripped[len(_INSIGHT_PREFIX_STRIPPED):]
        body_wc = _wc(body) if body.strip() else 0
        if not (30 <= body_wc <= 55):
            e.append(
                f"hot_news[{i}].insight: {body_wc} từ (phải 30–55 từ sau prefix, "
                f"sau khi strip HTML)"
            )

    # ── HARD: events_filtered count + skip when both empty ────────────────────
    events_pool = payload.get("events_pool") or []
    events_filtered = out.get("events_filtered") or []
    # Skip count check only when BOTH pool and output are empty (no-events day)
    if not (len(events_pool) == 0 and len(events_filtered) == 0):
        if not (2 <= len(events_filtered) <= 10):
            e.append(
                f"events_filtered: phải có 2–10 mục (hard bounds), "
                f"hiện tại {len(events_filtered)}"
            )

    # ── HARD: events_filtered ids must be in pool ─────────────────────────────
    pool_event_ids = {item.get("id") for item in events_pool if item.get("id")}
    for i, item in enumerate(events_filtered):
        eid = item.get("id")
        if eid not in pool_event_ids:
            e.append(
                f"events_filtered[{i}].id '{eid}' không có trong events_pool "
                f"(id bịa / hallucinated)"
            )

    # ── HARD: events_filtered impact enum ────────────────────────────────────
    for i, item in enumerate(events_filtered):
        impact = item.get("impact")
        if impact not in _IMPACT_ENUM:
            e.append(
                f"events_filtered[{i}].impact '{impact}' không hợp lệ "
                f"(phải là 'high'|'medium'|'low')"
            )

    # ── HARD: watch_today count (5–6) ────────────────────────────────────────
    watch_today = out.get("watch_today") or []
    if not (5 <= len(watch_today) <= 6):
        e.append(
            f"watch_today: phải có 5–6 mục, hiện tại {len(watch_today)}"
        )

    # ── HARD: watch_today[0] must contain "VN-Index" ─────────────────────────
    if watch_today:
        w0_content = watch_today[0].get("content") or ""
        if "VN-Index" not in w0_content:
            e.append(
                "watch_today[0].content phải đề cập 'VN-Index' (ngưỡng hỗ trợ/kháng cự)"
            )

    # ── HARD: watch_today level enum ─────────────────────────────────────────
    for i, item in enumerate(watch_today):
        level = item.get("level")
        if level not in _LEVEL_ENUM:
            e.append(
                f"watch_today[{i}].level '{level}' không hợp lệ "
                f"(phải là 'normal'|'alert'|'warn')"
            )

    # ── Collect all content texts for scanning ────────────────────────────────
    # All texts (including world_paragraph) for hyphen + FORBIDDEN_ANGLICIZED/BUG11/LEAK
    all_texts_full = _all_texts_including_world(out)
    # Texts excluding world_paragraph for FORBIDDEN_INTL scan
    all_texts_no_world = _all_content_texts(out)

    # ── HARD: ASCII hyphen before digit on stripped text ─────────────────────
    for text in all_texts_full:
        if re.search(r"-\d", _strip(text)):
            e.append(
                "U+2212: dùng '−' (U+2212) cho số âm, không dùng ASCII hyphen '-' trước chữ số"
            )
            break  # report once

    # ── HARD: banned-word scan (FORBIDDEN_ANGLICIZED / BUG11 / LEAK — all fields) ──
    full_text = " ".join(_strip(t) for t in all_texts_full)
    low = full_text.lower()

    for t in FORBIDDEN_ANGLICIZED:
        if re.search(rf"\b{re.escape(t)}\b", low):
            e.append(f"Anh hóa: '{t}'")
    for t in FORBIDDEN_BUG11 + FORBIDDEN_LEAK:
        if t in low:
            e.append(f"Cấm: '{t}'")

    # ── HARD: FORBIDDEN_INTL — domestic-focused fields only ──────────────────
    # headline + world_paragraph explicitly discuss global markets (S&P, Nikkei,
    # Brent, etc.) by contract, so FORBIDDEN_INTL is scoped to the rest.
    no_world_text = " ".join(_strip(t) for t in all_texts_no_world)
    no_world_low = no_world_text.lower()

    for t in FORBIDDEN_INTL:
        if re.search(t, no_world_low) if t.startswith(r"\b") else t in no_world_low:
            e.append(f"Quốc tế: '{t}'")

    # ── SOFT (BUG16): number-repetition across content fields ─────────────────
    nums = re.findall(r"(\d+[.,]?\d*)\s*(tỷ|%|điểm|đ)\b", _strip(full_text))
    for num_unit, cnt in Counter(f"{n} {u}" for n, u in nums).items():
        if cnt >= 3:
            e.append(f"BUG16: số '{num_unit}' lặp {cnt} lần")

    return e
