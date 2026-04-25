"""Settlement engine — T0/T2 settlement logic and trading calendar.

Trading calendar: Mon-Fri excluding configured holidays (Vietnam market).
T2: buy quantity becomes sellable after T+2 trading days.
T2: sell cash becomes available after T+2 trading days.
"""

from __future__ import annotations

from datetime import date, timedelta


def parse_holidays(holidays_json: str | None) -> set[str]:
    """Parse holidays JSON string to set of date strings."""
    if not holidays_json:
        return set()
    import json

    try:
        data = json.loads(holidays_json)
        return set(data) if isinstance(data, list) else set()
    except (json.JSONDecodeError, TypeError):
        return set()


def is_trading_day(d: date, holidays: set[str]) -> bool:
    """Check if a date is a trading day (weekday and not a holiday)."""
    return d.weekday() < 5 and d.isoformat() not in holidays


def next_trading_day(d: date, holidays: set[str]) -> date:
    """Get the next trading day after d."""
    d = d + timedelta(days=1)
    while not is_trading_day(d, holidays):
        d += timedelta(days=1)
    return d


def add_trading_days(d: date, n: int, holidays: set[str]) -> date:
    """Add n trading days to date d."""
    for _ in range(n):
        d = next_trading_day(d, holidays)
    return d


def get_current_trading_date(today: date, holidays: set[str]) -> date:
    """Get the current or most recent trading date.

    If today is a trading day, return today.
    Otherwise, return the most recent past trading day.
    """
    if is_trading_day(today, holidays):
        return today
    d = today - timedelta(days=1)
    while not is_trading_day(d, holidays):
        d -= timedelta(days=1)
    return d
