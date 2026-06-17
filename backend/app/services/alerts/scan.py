"""Intraday alert scan — evaluate enabled rules against watchlists, fire Telegram.

Runs on the scheduler (~every 10 min, gated to VN market hours). Insert-before-
send + the ``alert_events`` unique constraint make firing idempotent and safe
under multiple workers (each preset fires at most once per user/symbol/day).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session_factory
from app.models.alert import AlertEvent, UserAlertRule
from app.models.user import User
from app.repositories.alert import (
    AlertEventRepository,
    UserAlertRuleRepository,
    watchlist_symbols_by_user,
)
from app.services.ta.conditions import Combination, build_frame, evaluate_latest
from app.services.ta.data import get_adjusted_ohlcv
from app.services.telegram import client as tg

logger = logging.getLogger(__name__)

_VN_TZ = timezone(timedelta(hours=7))
_WARMUP_DAYS = 420
_MIN_BARS = 60


def _now_vn() -> datetime:
    return datetime.now(tz=_VN_TZ)


def is_market_open(now: datetime) -> bool:
    """VN equities session: Mon–Fri, 09:00–11:30 & 13:00–15:00 ICT."""
    if now.weekday() >= 5:
        return False
    t = now.timetz().replace(tzinfo=None)
    morning = time(9, 0) <= t < time(11, 30)
    afternoon = time(13, 0) <= t < time(15, 0)
    return morning or afternoon


def _format_message(rule: UserAlertRule, symbol: str, price: float) -> str:
    emoji = "🟢" if rule.side.value == "buy" else "🔴"
    return f"{emoji} <b>{rule.name}</b> — <b>{symbol}</b>\nGiá: {price:,.0f}"


async def _frame_for(symbol: str, today) -> tuple[dict, float] | None:  # noqa: ANN001
    try:
        start = today - timedelta(days=_WARMUP_DAYS)
        data, _ = await get_adjusted_ohlcv(symbol, start, today, use_cache=False)
    except Exception as exc:  # noqa: BLE001 - one bad symbol must not abort the scan
        logger.warning("Alert scan: fetch failed for %s: %s", symbol, exc)
        return None
    if len(data) < _MIN_BARS:
        return None
    frame = build_frame(data)
    return frame, float(data.close[-1])


async def _fire(db: AsyncSession, user: User, rule: UserAlertRule, symbol: str, price: float, today) -> bool:  # noqa: ANN001
    events = AlertEventRepository(db)
    if await events.exists(user.id, rule.id, symbol, today):
        return False
    event = AlertEvent(
        user_id=user.id,
        rule_id=rule.id,
        symbol=symbol,
        signal_key=rule.base_signal_key,
        session_date=today,
        fired_at=datetime.now(UTC),
        price=price,
        delivered=False,
    )
    db.add(event)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()  # another worker fired it first
        return False

    if user.telegram_chat_id:
        try:
            await tg.send_message(user.telegram_chat_id, _format_message(rule, symbol, price))
            event.delivered = True
        except Exception as exc:  # noqa: BLE001
            event.delivery_error = str(exc)[:300]
        await db.commit()
    return True


async def run_alert_scan(session: AsyncSession | None = None, *, force: bool = False) -> dict:
    """Scheduler entrypoint. ``force`` bypasses the market-hours gate (tests/manual)."""
    if not force and not is_market_open(_now_vn()):
        return {"skipped": "market_closed"}
    if session is None:
        factory = get_session_factory()
        async with factory() as db:
            return await _do_scan(db)
    return await _do_scan(db=session)


async def _do_scan(db: AsyncSession) -> dict:
    rules = await UserAlertRuleRepository(db).all_enabled()
    if not rules:
        return {"rules": 0, "symbols_scanned": 0, "alerts_fired": 0}

    rules_by_user: dict = {}
    for rule in rules:
        rules_by_user.setdefault(rule.user_id, []).append(rule)

    watchlists = await watchlist_symbols_by_user(db)
    users = (await db.execute(select(User).where(User.id.in_(list(rules_by_user))))).scalars().all()
    user_map = {u.id: u for u in users}

    # Only users who linked Telegram are deliverable.
    universe: set[str] = set()
    for uid in rules_by_user:
        user = user_map.get(uid)
        if user is None or not user.telegram_chat_id:
            continue
        universe |= watchlists.get(uid, set())

    today = _now_vn().date()
    frames: dict[str, tuple[dict, float]] = {}
    for symbol in universe:
        fp = await _frame_for(symbol, today)
        if fp is not None:
            frames[symbol] = fp

    fired = 0
    for uid, user_rules in rules_by_user.items():
        user = user_map.get(uid)
        if user is None or not user.telegram_chat_id:
            continue
        for symbol in watchlists.get(uid, set()):
            fp = frames.get(symbol)
            if fp is None:
                continue
            frame, price = fp
            for rule in user_rules:
                try:
                    hit = evaluate_latest(frame, Combination.from_dict(rule.combination))
                    if hit and await _fire(db, user, rule, symbol, price, today):
                        fired += 1
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Alert eval failed (%s/%s): %s", symbol, rule.id, exc)

    summary = {
        "rules": len(rules),
        "symbols_scanned": len(frames),
        "alerts_fired": fired,
        "ran_at": _now_vn().isoformat(),
    }
    logger.info("Alert scan: %s", summary)
    return summary
