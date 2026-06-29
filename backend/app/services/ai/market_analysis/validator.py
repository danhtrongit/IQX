"""Output validation — v1.4 rules (spec BUG 1-21, HTML-stripped).

validate_output(out, payload) -> list[str]

Checks (HTML-stripped text):
- BUG16: number duplication across paragraphs (excl. scenario technical levels)
- BUG17: tagline.text must not contain a marker character
- BUG18: market_health ≥4/6 indicators & ≥70 words
- %  >100 forbidden
- No anglicized / Wyckoff / data-leak / international terms
- BUG20: scenario levels within scenario_realistic_range (skip flow tỷ numbers)
- BUG21: contradiction → unexplained required
- headline ≤80 chars
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

# ── forbidden term lists ─────────────────────────────────────────────────────

FORBIDDEN_ANGLICIZED = [
    "catalyst", "rotation", "concentration", "breakout", "momentum", "smart money",
    "sell-off", "selloff", "outperform", "oversold", "overbought", "risk-on", "risk-off",
    "exposure", "performance", "narrative", "rebalancing", "midcap", "smallcap",
]
FORBIDDEN_BUG11 = ["phân phối ngầm", "phân phối đỉnh", "vùng phân phối", "co cụm"]
FORBIDDEN_LEAK = [
    "không có sẵn", "không có dữ liệu", "thiếu thông tin", "chưa cập nhật",
    "dữ liệu không đầy đủ", "không đủ thông tin", "không khả dụng", "không thể truy cập",
]
FORBIDDEN_INTL = [
    "s&p", "nasdaq", "nikkei", "kospi", "shanghai", "hang seng", "usd/vnd", "dxy",
    "vàng thế giới", "brent", "us10y", "fomc", "powell", "cpi mỹ", "chứng khoán mỹ",
    "chứng khoán thế giới", "bối cảnh thế giới", "châu á", r"\bfed\b", r"\bvix\b",
]

# kept for callers that may import it
DERIV_WHITELIST: set[str] = set()

# Cosmetic/style rules. They are still surfaced by validate_output() (so the retry loop
# tries to produce a fully-clean article), but they must NEVER block publication on their
# own — otherwise a single stylistic nit can take the daily article offline for days.
# Everything NOT in this set (forbidden EN/leak/intl terms, BUG20/BUG21, headline length,
# required market_health terms) is a hard/blocking error.
SOFT_ERROR_PREFIXES: tuple[str, ...] = ("BUG15", "BUG16", "BUG17", "BUG18")


def hard_errors(errors: list[str]) -> list[str]:
    """Return only the blocking errors — the cosmetic SOFT_ERROR_PREFIXES are excluded."""
    return [e for e in errors if not e.startswith(SOFT_ERROR_PREFIXES)]


# ── helpers ──────────────────────────────────────────────────────────────────

def _strip(s: str | None) -> str:
    """Strip HTML tags from a string."""
    return re.sub(r"<[^>]+>", "", s or "")


def _text_blocks(out: dict[str, Any]) -> dict[str, str]:
    p = out.get("paragraphs") or {}
    return {k: _strip(p.get(k, "")) for k in ("structure", "smart_money", "market_health")}


def _collect_valid_tickers(payload: dict[str, Any]) -> set[str]:
    tickers: set[str] = set()
    pc = payload.get("point_contribution") or {}
    for k in ("top_positive", "top_negative"):
        for it in pc.get(k, []) or []:
            tickers.add(it.get("ticker", ""))
    ff = payload.get("foreign_flow") or {}
    for k in ("top_buy", "top_sell"):
        for it in ff.get(k, []) or []:
            tickers.add(it.get("ticker", ""))
    pt = payload.get("prop_trading") or {}
    for k in ("top_buy", "top_sell"):
        for it in pt.get(k, []) or []:
            tickers.add(it.get("ticker", ""))
    for s in payload.get("sectors", []) or []:
        for k in ("top_movers_up", "top_movers_down"):
            tickers.update(s.get(k, []) or [])
    for n in payload.get("top_news_24h", []) or []:
        tickers.update(n.get("tickers", []) or [])
    return {t.upper() for t in tickers if t}


# ── main validator ───────────────────────────────────────────────────────────

def validate_output(out: dict[str, Any], payload: dict[str, Any]) -> list[str]:
    """Validate AI output against v1.4 rules. Returns list of error strings."""
    e: list[str] = []
    tb = _text_blocks(out)
    full = " ".join(tb.values())
    low = full.lower()
    tag = out.get("tagline") or {}

    # BUG17: tagline.text must not contain a marker character
    if any(m in (tag.get("text") or "") for m in "◆▲▼▬"):
        e.append("BUG17: tagline.text còn chứa marker")

    # BUG16: number duplication across paragraphs (excl. scenario technical levels)
    nums = re.findall(r"(\d+[.,]?\d*)\s*(tỷ|%|điểm|đ)\b", full)
    tech: set[str] = set()
    for s in out.get("scenarios", []):
        tech.update(re.findall(
            r"\d+[.,]?\d*",
            _strip(s.get("condition_html", "")) + _strip(s.get("outcome_html", "")),
        ))
    # A figure repeated exactly twice across a multi-paragraph editorial is normal and
    # readable; only flag genuinely redundant repetition (3+). BUG16 is cosmetic anyway
    # (see SOFT_ERROR_PREFIXES / hard_errors) so it never blocks publication on its own.
    for num, cnt in Counter(f"{n} {u}" for n, u in nums).items():
        if cnt >= 3 and num.split()[0] not in tech:
            e.append(f"BUG16: số '{num}' lặp {cnt} lần")

    # BUG15: memory placement (warn only — not a hard error for new contract)
    claims = (payload.get("memory_context") or {}).get("verifiable_claims_from_recent_analyses") or []
    if claims:
        markers = ["bài hôm trước", "bài 18/06", "bài hôm qua", "kịch bản từ bài", "kịch bản hôm qua", "phiên 18/06"]
        st = tb["structure"]
        sents = st.split(".")
        idx = next((i for i, sent in enumerate(sents) if any(m in sent.lower() for m in markers)), -1)
        if idx >= 0 and idx < len(sents) * 0.7:
            e.append("BUG15: memory reference nằm giữa đoạn cấu trúc (phải ở cuối hoặc đầu đoạn dòng tiền)")

    # BUG18: market_health depth — ≥4/6 indicators & ≥70 words
    mh = tb["market_health"].lower()
    mh_raw = tb["market_health"]
    wc = len(mh_raw.split())
    if wc < 70:
        e.append(f"BUG18: market_health chỉ {wc} từ (cần ≥70)")
    inds = {
        "ma20pct": any(k in mh for k in ["mã trên ma20", "% mã", "trên ma20"]),
        "liq": "thanh khoản" in mh,
        "idx_ma": any(k in mh_raw for k in ["MA50", "MA200", "MA20"]),
        "sector_lead": any(k in mh for k in ["dẫn", "phiên thứ", "liên tiếp"]),
        "rot": any(k in mh for k in ["chuyển nhóm", "rời", "gia nhập", "thu hẹp"]),
        "cap": any(k in mh for k in ["vốn hóa", "hnx", "vừa", "nhỏ"]),
    }
    if sum(inds.values()) < 4:
        e.append(f"BUG18: market_health chỉ {sum(inds.values())}/6 chỉ báo (cần ≥4)")

    # BUG20: scenario levels within scenario_realistic_range
    rng = (payload.get("technical_levels") or {}).get("scenario_realistic_range") or {}
    fs = rng.get("far_support")
    for s in out.get("scenarios", []):
        txt = _strip(s.get("condition_html", "")) + " " + _strip(s.get("outcome_html", ""))
        for n in re.findall(r"1[.,]?\d{3}", txt):
            val = float(n.replace(".", "").replace(",", ""))
            if 1000 < val < 2000 and fs and val < fs - 5 and "cực đoan" not in txt.lower() and "extreme" not in txt.lower():
                e.append(f"BUG20: mốc {n} xa hơn far_support ({fs}) mà không gắn nhãn cực đoan")

    # BUG21: contradiction → unexplained required
    contradiction = False
    pos_tickers = {x["ticker"] for x in (payload.get("point_contribution") or {}).get("top_positive", [])}
    for x in (payload.get("foreign_flow") or {}).get("top_sell", []):
        if x["ticker"] in pos_tickers and abs(x.get("value_vnd_billion") or 0) > 100:
            contradiction = True
    if (payload.get("prop_trading") or {}).get("buy_concentration_flag", {}).get("concentrated"):
        contradiction = True
    if contradiction and not out.get("unexplained"):
        e.append("BUG21: có mâu thuẫn/flow bất thường nhưng thiếu đoạn 'Chưa giải thích được'")

    # Forbidden term checks
    for t in FORBIDDEN_ANGLICIZED:
        if re.search(rf"\b{re.escape(t)}\b", low):
            e.append(f"Anh hóa: '{t}'")
    for t in FORBIDDEN_BUG11 + FORBIDDEN_LEAK:
        if t in low:
            e.append(f"Cấm: '{t}'")
    for t in FORBIDDEN_INTL:
        if re.search(t, low) if t.startswith(r"\b") else t in low:
            e.append(f"Quốc tế: '{t}'")

    # Headline length
    if len(_strip(out.get("headline", ""))) > 80:
        e.append(f"Headline {len(_strip(out.get('headline', '')))} ký tự (max 80)")

    # market_health must contain these required terms
    for t in ("ma20", "thanh khoản"):
        if t not in mh:
            e.append(f"market_health thiếu '{t}'")

    return e
