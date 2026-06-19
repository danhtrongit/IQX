"""Output validation (spec section 10).

Implements rules 1-6, 8-12. Rule 7 (full numeric cross-check vs source) is a
lightweight presence-check here and flagged as TODO for production hardening.
VALID_TICKERS is derived from the payload itself — the AI must only mention
tickers that appear in today's data.
"""

from __future__ import annotations

import re
from typing import Any

NON_TICKER_ACRONYMS = {
    "CPI", "GDP", "FDI", "IIP", "XNK", "KQKD", "MA", "KN", "NN", "ATC", "ATO",
    "OI", "TCTK", "SBV", "HSBC", "EU", "EUR", "USD", "VND", "ROI", "TG", "HOSE",
    "HNX", "VN", "ETF", "FOMC", "AI", "IQX", "T", "ĐHCĐ",
    # non-ticker acronyms that appear in our own payload / common usage
    "ICB", "VN30", "VN100", "UPCOM", "EPS", "ROE", "ROA", "PE", "PB", "YOY",
    "ADR", "SPX", "DJI", "USDVND", "ATD",
    # gold brand + world-index codes (global_context)
    "SJC", "HSI", "INX", "DXY", "KOSPI", "SHCOMP", "TWII", "FTSE", "KG", "L",
}

FORBIDDEN_EMPTY = [
    "có thể tăng", "có thể giảm", "cần theo dõi thêm", "thể hiện sự",
    "trong bối cảnh hiện tại", "thị trường giao dịch sôi động",
    "nhà đầu tư nên cẩn trọng",
]
FORBIDDEN_RECOMMEND = [
    "nhà đầu tư nên mua", "nhà đầu tư nên bán", "khuyến nghị mua",
    "khuyến nghị bán", "chắc chắn sẽ", "sẽ tăng", "sẽ giảm", "mục tiêu giá",
]
FORBIDDEN_NO_DATA = [
    "DXY", "US10Y", "US2Y", "VIX", "Brent", "copper", "HRC steel",
    "Fed implied", "dot plot", "FOMC probability", "Fubon", "DCVFM",
    "active funds", "ETF flow",
]
COMPARISON_KEYWORDS = [
    "MA20", "MA50", "MA200", "hôm qua", "phiên trước", "tuần trước",
    "liên tiếp", "phiên thứ", "so với",
]
SCENARIO_KEYWORDS = ["nếu", "giữ trên", "mất", "vượt", "trên ", "dưới ", "với kn", "khi"]


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


def _full_text(out: dict[str, Any]) -> str:
    p = out.get("paragraphs") or {}
    parts = [
        out.get("headline"),
        (out.get("tagline") or {}).get("text"),
        p.get("structure"), p.get("smart_money"),
        p.get("internal_heat"), p.get("historical_pattern"),
        p.get("global_context"),
    ]
    return " ".join(s for s in parts if isinstance(s, str))


def validate_output(out: dict[str, Any], payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    # Rule 1: shape sanity (lightweight schema check)
    for key in ("headline", "tagline", "paragraphs", "scenarios", "session_type"):
        if key not in out:
            errors.append(f"Thiếu khóa bắt buộc: {key}")
    if errors:
        return errors
    if not isinstance(out.get("tagline"), dict) or "text" not in out["tagline"]:
        errors.append("tagline sai cấu trúc")
    required_paras = ["structure", "smart_money", "internal_heat"]
    if payload.get("global_context"):  # chỉ bắt buộc khi có data thế giới
        required_paras.append("global_context")
    for k in required_paras:
        if not out["paragraphs"].get(k):
            errors.append(f"paragraphs.{k} rỗng")

    text = _full_text(out)
    low = text.lower()

    # Rule 2: số lượng số cụ thể
    numbers = re.findall(r"\d+[,.]?\d*\s*(?:%|tỷ|đ|điểm)?", text)
    min_numbers = 8 if out.get("session_type") == "low_volatility" else 12
    if len(numbers) < min_numbers:
        errors.append(f"Quá ít số: {len(numbers)} (cần ≥ {min_numbers})")

    # Rule 3 & 4: từ cấm
    for phrase in FORBIDDEN_EMPTY:
        if phrase in low:
            errors.append(f"Chứa cụm rỗng: '{phrase}'")
    for phrase in FORBIDDEN_RECOMMEND:
        if phrase in low:
            errors.append(f"Chứa khuyến nghị/dự đoán: '{phrase}'")

    # Rule 5: cấm chỉ số không có data
    for term in FORBIDDEN_NO_DATA:
        if term.lower() in low:
            errors.append(f"Đề cập chỉ số KHÔNG có data: '{term}'")

    # Rule 6: ticker phải tồn tại trong data hôm nay
    valid = _collect_valid_tickers(payload)
    for tk in set(re.findall(r"\b([A-Z]{2,4})\b", text)):
        if tk in NON_TICKER_ACRONYMS:
            continue
        if tk not in valid:
            errors.append(f"Ticker không có trong data: {tk}")

    # Rule 8: scenarios phải có điều kiện
    for s in out.get("scenarios", []):
        if not any(kw in s.get("condition", "").lower() for kw in SCENARIO_KEYWORDS):
            errors.append(f"Scenario thiếu điều kiện: {s.get('condition')}")

    # Rule 9: watchlist không khuyến nghị
    for w in out.get("watchlist", []) or []:
        if any(x in w.get("reason", "").lower()
               for x in ["nên mua", "nên bán", "khuyến nghị", "mua ngay"]):
            errors.append(f"Watchlist chứa khuyến nghị: {w.get('ticker')}")

    # Rule 10: headline length
    if len(out.get("headline", "")) > 80:
        errors.append(f"Headline {len(out['headline'])} ký tự (max 80)")

    # Rule 11: có ít nhất 1 so sánh
    if not any(kw in text for kw in COMPARISON_KEYWORDS):
        errors.append("Thiếu so sánh (MA, hôm qua, phiên thứ, ...)")

    # Rule 12: internal_heat bắt buộc có cụm sức nóng
    ih = out["paragraphs"].get("internal_heat", "").lower()
    for term in ("ma20", "thanh khoản"):
        if term not in ih:
            errors.append(f"Đoạn 'sức nóng nội tại' thiếu cụm: '{term}'")

    return errors
