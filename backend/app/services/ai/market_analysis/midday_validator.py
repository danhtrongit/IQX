"""Mid-day brief output validator.

validate_midday(out, payload) -> list[str]

HARD rules (block publish):
- headline 60–90 chars
- paragraphs: session_structure + money_flow with status=='published';
  market_health with status=='pending'
- len(scenarios)==3, 3rd type=='down', ALL scope=='afternoon_session'
- len(watchlist)==5 and watchlist[1]['key']=='Giao dịch chiều'
- banned-word scan (reuses daily forbidden lists)
- U+2212 check: no ASCII '-' immediately before a digit in content fields
- no buy/sell recommendation phrasing

SOFT rules (BUG16-prefix, never block):
- number-repetition across paragraphs
- minor span-wrap gaps
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

# ── helpers ───────────────────────────────────────────────────────────────────


def _strip(s: str | None) -> str:
    """Strip HTML tags from a string."""
    return re.sub(r"<[^>]+>", "", s or "")


def _para_text_blocks(out: dict[str, Any]) -> dict[str, str]:
    """Return plain-text for each published paragraph (stripped of HTML)."""
    p = out.get("paragraphs") or {}
    result: dict[str, str] = {}
    for key, para in p.items():
        if isinstance(para, dict):
            result[key] = _strip(para.get("content") or "")
    return result


def _all_content_texts(out: dict[str, Any]) -> list[str]:
    """Collect all user-visible text strings for banned-word / hyphen scanning."""
    texts: list[str] = []
    p = out.get("paragraphs") or {}
    for para in p.values():
        if isinstance(para, dict):
            texts.append(para.get("content") or "")
    unex = out.get("unexplained") or {}
    texts.append(unex.get("content") or "")
    texts.append(unex.get("title") or "")
    for s in out.get("scenarios") or []:
        texts.append(s.get("condition") or "")
        texts.append(s.get("outcome") or "")
        texts.append(s.get("condition_html") or "")
        texts.append(s.get("outcome_html") or "")
    for w in out.get("watchlist") or []:
        texts.append(w.get("reason") or "")
    tag = out.get("tagline") or {}
    texts.append(tag.get("text") or "")
    return [t for t in texts if t]


# ── main validator ─────────────────────────────────────────────────────────────


def validate_midday(out: dict[str, Any], payload: dict[str, Any]) -> list[str]:
    """Validate mid-day brief LLM output. Returns list of error strings.

    Hard errors (block publish): no SOFT_ERROR_PREFIXES prefix.
    Soft errors (cosmetic, never block): prefixed with e.g. 'BUG16'.
    """
    e: list[str] = []

    # ── HARD: headline 60–90 chars ────────────────────────────────────────────
    headline = _strip(out.get("headline") or "")
    hl = len(headline)
    if not (60 <= hl <= 90):
        e.append(f"Headline {hl} ký tự (phải 60–90 ký tự)")

    # ── HARD: paragraphs structure ────────────────────────────────────────────
    paragraphs = out.get("paragraphs") or {}

    for required_published in ("session_structure", "money_flow"):
        para = paragraphs.get(required_published)
        if not isinstance(para, dict):
            e.append(f"paragraphs.{required_published}: thiếu hoặc không hợp lệ")
        elif para.get("status") != "published":
            e.append(f"paragraphs.{required_published}: status phải là 'published' (hiện tại: '{para.get('status')}')")

    mh_para = paragraphs.get("market_health")
    if not isinstance(mh_para, dict):
        e.append("paragraphs.market_health: thiếu hoặc không hợp lệ")
    elif mh_para.get("status") != "pending":
        e.append(f"paragraphs.market_health: status phải là 'pending' (hiện tại: '{mh_para.get('status')}')")

    # ── HARD: scenarios ────────────────────────────────────────────────────────
    scenarios = out.get("scenarios") or []
    if len(scenarios) != 3:
        e.append(f"Số kịch bản (scenarios) phải là 3, hiện tại {len(scenarios)}")
    else:
        # 3rd scenario must be type=='down'
        if scenarios[2].get("type") != "down":
            e.append(f"scenario[2].type phải là 'down' (hiện tại: '{scenarios[2].get('type')}')")
        # ALL must have scope=='afternoon_session'
        for i, s in enumerate(scenarios):
            if s.get("scope") != "afternoon_session":
                e.append(f"scenario[{i}].scope phải là 'afternoon_session' (hiện tại: '{s.get('scope')}')")

    # ── HARD: watchlist ────────────────────────────────────────────────────────
    watchlist = out.get("watchlist") or []
    if len(watchlist) != 5:
        e.append(f"watchlist phải có đúng 5 mục (hiện tại {len(watchlist)})")
    else:
        if watchlist[1].get("key") != "Giao dịch chiều":
            e.append(
                f"watchlist[1].key phải là 'Giao dịch chiều' (hiện tại: '{watchlist[1].get('key')}')"
            )

    # ── Collect all content texts for scanning ─────────────────────────────────
    all_texts = _all_content_texts(out)
    full_text = " ".join(_strip(t) for t in all_texts)
    low = full_text.lower()

    # ── HARD: ASCII hyphen before digit (must use U+2212 '−') ─────────────────
    # Check visible text only (stripped of HTML tags) to avoid false-positives on attributes
    for text in all_texts:
        if re.search(r"-\d", _strip(text)):
            e.append(
                "U+2212: dùng '−' (U+2212) cho số âm, không dùng ASCII hyphen '-' trước chữ số"
            )
            break  # report once

    # ── HARD: banned-word scan ─────────────────────────────────────────────────
    for t in FORBIDDEN_ANGLICIZED:
        if re.search(rf"\b{re.escape(t)}\b", low):
            e.append(f"Anh hóa: '{t}'")
    for t in FORBIDDEN_BUG11 + FORBIDDEN_LEAK:
        if t in low:
            e.append(f"Cấm: '{t}'")
    for t in FORBIDDEN_INTL:
        if re.search(t, low) if t.startswith(r"\b") else t in low:
            e.append(f"Quốc tế: '{t}'")

    # ── HARD: no buy/sell recommendation phrasing ─────────────────────────────
    buy_sell_patterns = [
        r"nên mua", r"nên bán", r"khuyến nghị mua", r"khuyến nghị bán",
        r"recommend.*buy", r"recommend.*sell",
        r"\bbuy\b", r"\bsell\b",
    ]
    for pattern in buy_sell_patterns:
        if re.search(pattern, low):
            e.append(f"Cấm khuyến nghị mua/bán: khớp '{pattern}'")
            break

    # ── SOFT (BUG16): number-repetition across paragraphs ─────────────────────
    para_texts = _para_text_blocks(out)
    para_full = " ".join(para_texts.values())
    nums = re.findall(r"(\d+[.,]?\d*)\s*(tỷ|%|điểm|đ)\b", _strip(para_full))
    for num_unit, cnt in Counter(f"{n} {u}" for n, u in nums).items():
        if cnt >= 3:
            e.append(f"BUG16: số '{num_unit}' lặp {cnt} lần")

    return e
