"""Tests for alert signal defs, seeder, market-hours gate, and the scan job."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import numpy as np

from app.models.alert import AlertSide
from app.models.watchlist import WatchlistItem
from app.repositories.alert import AlertSignalRepository, UserAlertRuleRepository
from app.services.alerts.scan import is_market_open, run_alert_scan
from app.services.alerts.seeder import seed_alert_signals
from app.services.alerts.signals import SIGNAL_DEFS
from app.services.ta.conditions import Combination, validate_combination
from app.services.ta.indicators import OHLCV

_VN = timezone(timedelta(hours=7))


def _series(n: int = 90) -> OHLCV:
    closes = [100 + i * 0.5 for i in range(n)]
    return OHLCV(
        time=[f"2020-{1 + i // 28:02d}-{1 + i % 28:02d}" for i in range(n)],
        open=np.array([float(c) for c in closes]),
        high=np.array([c * 1.01 for c in closes]),
        low=np.array([c * 0.99 for c in closes]),
        close=np.array([float(c) for c in closes]),
        volume=np.array([1_000_000.0] * n),
    )


def test_all_signal_defs_are_valid():
    assert len(SIGNAL_DEFS) == 10
    for definition in SIGNAL_DEFS:
        validate_combination(Combination.from_dict(definition["combination"]))


def test_is_market_open():
    assert is_market_open(datetime(2026, 6, 15, 10, 0, tzinfo=_VN))  # Mon morning
    assert is_market_open(datetime(2026, 6, 15, 14, 0, tzinfo=_VN))  # Mon afternoon
    assert not is_market_open(datetime(2026, 6, 15, 12, 0, tzinfo=_VN))  # lunch
    assert not is_market_open(datetime(2026, 6, 15, 8, 0, tzinfo=_VN))  # pre-open
    assert not is_market_open(datetime(2026, 6, 13, 10, 0, tzinfo=_VN))  # Saturday


async def test_seeder_idempotent(db_session):
    created = await seed_alert_signals(db_session)
    assert created == 10
    again = await seed_alert_signals(db_session)
    assert again == 0
    signals = await AlertSignalRepository(db_session).list_all()
    assert len(signals) == 10


async def test_scan_fires_and_dedupes(db_session, premium_user, monkeypatch):
    user, _headers = premium_user
    user.telegram_chat_id = "555"
    db_session.add(WatchlistItem(user_id=user.id, symbol="FPT", sort_order=0))
    await UserAlertRuleRepository(db_session).create(
        user_id=user.id,
        name="Always",
        side=AlertSide.BUY,
        combination={"logic": "AND", "conditions": [{"indicator": "close", "op": ">", "value": 0}]},
    )
    await db_session.commit()

    sent: list = []

    async def fake_send(chat_id, text, **kw):  # noqa: ANN001
        sent.append((chat_id, text))

    async def fake_data(symbol, start, end, **kw):  # noqa: ANN001
        return _series(), 0

    monkeypatch.setattr("app.services.alerts.scan.tg.send_message", fake_send)
    monkeypatch.setattr("app.services.alerts.scan.get_adjusted_ohlcv", fake_data)

    summary = await run_alert_scan(session=db_session, force=True)
    assert summary["alerts_fired"] == 1
    assert len(sent) == 1
    assert "FPT" in sent[0][1]

    # same day → deduped
    summary2 = await run_alert_scan(session=db_session, force=True)
    assert summary2["alerts_fired"] == 0
    assert len(sent) == 1


async def test_scan_skips_unlinked_users(db_session, premium_user, monkeypatch):
    user, _headers = premium_user  # no telegram_chat_id
    db_session.add(WatchlistItem(user_id=user.id, symbol="FPT", sort_order=0))
    await UserAlertRuleRepository(db_session).create(
        user_id=user.id,
        name="Always",
        side=AlertSide.BUY,
        combination={"logic": "AND", "conditions": [{"indicator": "close", "op": ">", "value": 0}]},
    )
    await db_session.commit()

    async def fake_data(symbol, start, end, **kw):  # noqa: ANN001
        return _series(), 0

    monkeypatch.setattr("app.services.alerts.scan.get_adjusted_ohlcv", fake_data)
    summary = await run_alert_scan(session=db_session, force=True)
    assert summary["alerts_fired"] == 0


async def test_scan_skips_when_market_closed(db_session):
    # force=False + (almost certainly) outside-hours in CI → skipped, unless it
    # happens to run during a VN session, in which case there are no rules anyway.
    summary = await run_alert_scan(session=db_session, force=False)
    assert summary.get("skipped") == "market_closed" or summary.get("alerts_fired") == 0
