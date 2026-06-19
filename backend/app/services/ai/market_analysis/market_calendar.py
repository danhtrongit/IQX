"""Hardcoded reference calendar for VN market AI analysis.

Per spec section 13: no data feed needed — everything is computed from the date.
Covers: futures expiry (3rd Thursday), TCTK macro publish (~29th),
earnings seasons, and 2026 VN holidays.
"""

from __future__ import annotations

from datetime import date, timedelta


def third_thursday(year: int, month: int) -> date:
    """Thứ 5 tuần thứ 3 = ngày 15-21 rơi vào thứ Năm."""
    for d in range(15, 22):
        candidate = date(year, month, d)
        if candidate.weekday() == 3:  # Thursday
            return candidate
    raise ValueError("unreachable")


def _next_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def get_next_futures_expiry(today: date) -> tuple[date, str]:
    """Đáo hạn phái sinh kế tiếp + mã hợp đồng (VN30Fyymm)."""
    year, month = today.year, today.month
    expiry = third_thursday(year, month)
    if expiry < today:
        year, month = _next_month(year, month)
        expiry = third_thursday(year, month)
    code = f"VN30F{year % 100:02d}{month:02d}"
    return expiry, code


def is_futures_expiry_date(d: date | str) -> bool:
    """True nếu d là ngày đáo hạn phái sinh (thứ 5 tuần 3)."""
    if isinstance(d, str):
        d = date.fromisoformat(d)
    return d == third_thursday(d.year, d.month)


def get_next_macro_publish(today: date) -> dict:
    """TCTK công bố CPI/IIP/XNK ngày 29 hàng tháng."""
    year, month = today.year, today.month
    nxt = date(year, month, 29)
    if nxt < today:
        year, month = _next_month(year, month)
        nxt = date(year, month, 29)
    return {
        "type": f"CPI/IIP/XNK tháng {month}",
        "date": nxt.isoformat(),
        "days_until": (nxt - today).days,
    }


EARNINGS_SEASONS = {
    "Q1": ((4, 1), (4, 30)),
    "Q2": ((7, 1), (7, 30)),
    "Q3": ((10, 1), (10, 30)),
    "Q4_FY": ((1, 1), (1, 31)),
}


def get_earnings_context(today: date) -> dict:
    """Đang trong mùa KQKD nào, hoặc còn bao xa mùa kế tiếp."""
    y = today.year
    windows = []
    for name, ((sm, sd), (em, ed)) in EARNINGS_SEASONS.items():
        windows.append((name, date(y, sm, sd), date(y, em, ed)))
        windows.append((name, date(y + 1, sm, sd), date(y + 1, em, ed)))
    for name, start, end in windows:
        if start <= today <= end:
            return {"current": name, "current_until": end.isoformat(), "next": None}
    upcoming = sorted([w for w in windows if w[1] > today], key=lambda w: w[1])
    nxt = upcoming[0]
    return {
        "current": None,
        "next": {"name": nxt[0], "starts": nxt[1].isoformat(),
                 "days_until": (nxt[1] - today).days},
    }


VN_HOLIDAYS_2026 = {
    date(2026, 1, 1), date(2026, 2, 16), date(2026, 2, 17), date(2026, 2, 18),
    date(2026, 2, 19), date(2026, 2, 20), date(2026, 4, 6), date(2026, 4, 30),
    date(2026, 5, 1), date(2026, 9, 2),
}


def is_trading_day(d: date) -> bool:
    return d.weekday() < 5 and d not in VN_HOLIDAYS_2026


def build_calendar_block(today: date) -> dict:
    """Assemble the `calendar_hardcoded` payload block."""
    expiry, code = get_next_futures_expiry(today)
    earnings = get_earnings_context(today)
    return {
        "next_futures_expiry": {
            "date": expiry.isoformat(),
            "code": code,
            "days_until": (expiry - today).days,
            "is_expiry_today": expiry == today,
        },
        "current_earnings_season": earnings["current"],
        "next_earnings_season": earnings["next"],
        "next_macro_publish": get_next_macro_publish(today),
    }
