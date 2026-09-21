from copy import deepcopy
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.models.bot_run import (
    BotAccount,
    BotCashLedger,
    BotDecision,
    BotExecution,
    BotInstance,
    BotMarketSnapshot,
    BotNavDaily,
    BotPosition,
    BotRunReceipt,
)
from app.models.cap6 import Cap6Progress
from app.services.bot.service import (
    BotService,
    initialize,
    run_account_session,
    run_scheduled_session,
)
from tests.conftest import TestSessionLocal

NOW = datetime(2026, 9, 15, 12, tzinfo=UTC)


@pytest.fixture(autouse=True)
def fixed_bot_clock(monkeypatch):
    """Scenario dates stay deterministic as the real calendar moves forward."""
    class ScenarioDateTime(datetime):
        tick = 0

        @classmethod
        def now(cls, tz=None):
            cls.tick += 1
            instant = NOW + timedelta(microseconds=cls.tick)
            return instant.astimezone(tz) if tz else instant.replace(tzinfo=None)

    monkeypatch.setattr("app.services.bot.service.datetime", ScenarioDateTime)
T = date(2026, 9, 15)


class FixtureProvider:
    def __init__(self, payload):
        self.payload = payload
        self.calls = 0

    async def build_snapshot(self, trading_date, *, open_symbols):
        self.calls += 1
        payload = deepcopy(self.payload)
        payload["trading_date"] = trading_date.isoformat()
        payload.setdefault("data_version", f"fixture:{trading_date}")
        payload.setdefault("snapshot_hash", f"{trading_date:%Y%m%d}".ljust(64, "0"))
        return payload


def layer_payload(ok=5):
    names = ("ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia")
    return {
        name: {
            "verdict": "ok" if index < ok else "bad",
            "raw_level": "fixture",
            "is_very_negative": False,
            "source_ref": f"fixture:{name}",
        }
        for index, name in enumerate(names)
    }


def symbol(close=20_000, *, amplitude="500", ok=5, filters=None):
    return {
        "close_vnd": close,
        "close_is_official": True,
        "trading_value_avg20_vnd": 2_000_000_000,
        "security_status_verified": True,
        "tradable_security_status": True,
        "filter_ids": filters or ["kl_dot_bien"],
        "layers": layer_payload(ok),
        "l1_amplitude_vnd": amplitude,
        "l1_amplitude_source_ref": "fixture:l1",
        "source_refs": {"provider": "fixture"},
    }


def payload(symbols, *, complete=True, issues=None):
    return {
        "close_is_official": True,
        "buy_inputs_complete": complete,
        "fee_rules": {
            "buy_fee_rate_bps": 10,
            "sell_fee_rate_bps": 10,
            "sell_tax_rate_bps": 10,
            "board_lot_size": 100,
            "source_ref": "fixture:fees",
        },
        "filters": {},
        "symbols": symbols,
        "vnindex": "1800.5",
        "issues": issues or [],
    }


async def graduate(db, user_id):
    db.add(
        Cap6Progress(
            user_id=user_id,
            entered_at=NOW - timedelta(days=5),
            graduated_at=NOW,
        )
    )
    await db.flush()


@pytest.mark.asyncio
async def test_initialization_requires_graduation_and_funds_exactly_once(db_session, test_user):
    assert await initialize(db_session, test_user) is None
    await graduate(db_session, test_user.id)
    first = await initialize(db_session, test_user.id)
    second = await initialize(db_session, test_user.id)
    assert first.id == second.id
    assert (
        await db_session.execute(select(func.count(BotAccount.id)))
    ).scalar_one() == 1
    assert (
        await db_session.execute(select(func.count(BotInstance.id)))
    ).scalar_one() == 1
    entries = (await db_session.execute(select(BotCashLedger))).scalars().all()
    assert len(entries) == 1
    assert entries[0].amount_vnd == entries[0].balance_after_vnd == 100_000_000


@pytest.mark.asyncio
async def test_batch_skips_invalid_first_candidate_and_buys_next_two(db_session, test_user):
    await graduate(db_session, test_user.id)
    await initialize(db_session, test_user.id)
    bad = symbol(amplitude=None)
    bad["l1_amplitude_source_ref"] = None
    provider = FixtureProvider(
        payload({"AAA": bad, "BBB": symbol(), "CCC": symbol(filters=["kl_dot_bien", "vuot_dinh_20"])})
    )
    run = await run_account_session(db_session, test_user, T, provider=provider)
    assert run.status == "succeeded"
    assert run.nav_basis_vnd == 100_000_000
    assert run.buy_count == 2
    executions = (
        await db_session.execute(select(BotExecution).order_by(BotExecution.symbol))
    ).scalars().all()
    assert [(row.symbol, row.side, row.qty) for row in executions] == [
        ("BBB", "buy", 500),
        ("CCC", "buy", 500),
    ]
    assert all(row.signal_session == row.price_session == row.trading_date == T for row in executions)
    decisions = (await db_session.execute(select(BotDecision))).scalars().all()
    assert any(row.symbol == "AAA" and row.reason_code == "invalid_or_missing_l1_amplitude" for row in decisions)
    positions = (await db_session.execute(select(BotPosition))).scalars().all()
    assert all(row.stop_loss_vnd == 19_000 and row.take_profit_vnd == 22_000 for row in positions)
    account = (await db_session.execute(select(BotAccount))).scalar_one()
    assert account.cash_vnd == 79_980_000


@pytest.mark.asyncio
async def test_close_trigger_sells_at_close_and_does_not_rebuy_same_session(db_session, test_user):
    await graduate(db_session, test_user.id)
    await initialize(db_session, test_user.id)
    await BotService(db_session).run(test_user.id, T, provider=FixtureProvider(payload({"AAA": symbol()})))
    next_day = T + timedelta(days=1)
    second = await BotService(db_session).run(
        test_user.id,
        next_day,
        provider=FixtureProvider(payload({"AAA": symbol(close=22_100)})),
    )
    assert second.status == "succeeded"
    assert second.sell_count == 1
    assert second.buy_count == 0
    sells = (
        await db_session.execute(select(BotExecution).where(BotExecution.side == "sell"))
    ).scalars().all()
    assert len(sells) == 1
    assert sells[0].price_vnd == 22_100
    assert sells[0].trading_date == next_day
    decisions = (
        await db_session.execute(select(BotDecision).where(BotDecision.bot_run_id == second.id))
    ).scalars().all()
    assert any(row.symbol == "AAA" and row.reason_code == "blocked_at_start" for row in decisions)


@pytest.mark.asyncio
async def test_retry_success_is_idempotent(db_session, test_user):
    await graduate(db_session, test_user.id)
    await initialize(db_session, test_user.id)
    provider = FixtureProvider(payload({"AAA": symbol()}))
    first = await BotService(db_session).run(test_user.id, T, provider=provider)
    second = await BotService(db_session).run(test_user.id, T, provider=provider)
    assert first.id == second.id
    assert provider.calls == 1
    assert (await db_session.execute(select(func.count(BotExecution.id)))).scalar_one() == 1
    assert (await db_session.execute(select(func.count(BotMarketSnapshot.id)))).scalar_one() == 1
    assert (await db_session.execute(select(func.count(BotCashLedger.id)))).scalar_one() == 2


@pytest.mark.asyncio
async def test_failed_run_reuses_frozen_snapshot_instead_of_new_provider_data(db_session, test_user):
    await graduate(db_session, test_user.id)
    await initialize(db_session, test_user.id)
    failed_provider = FixtureProvider(
        payload(
            {"AAA": symbol()},
            complete=False,
            issues=[{"code": "missing_security_status", "symbol": None, "detail": "missing"}],
        )
    )
    first = await BotService(db_session).run(test_user.id, T, provider=failed_provider)
    replacement = FixtureProvider(payload({"AAA": symbol()}))
    second = await BotService(db_session).run(test_user.id, T, provider=replacement)
    assert first.id == second.id
    assert second.status == "failed"
    assert replacement.calls == 0
    assert (await db_session.execute(select(func.count(BotExecution.id)))).scalar_one() == 0
    assert (await db_session.execute(select(func.count(BotMarketSnapshot.id)))).scalar_one() == 1


@pytest.mark.asyncio
async def test_legacy_success_receipt_is_claimed_and_does_not_suppress_bot(db_session, test_user):
    await graduate(db_session, test_user.id)
    db_session.add(
        BotRunReceipt(
            user_id=test_user.id,
            trading_date=T,
            status="succeeded",
            started_at=NOW,
            completed_at=NOW,
            issues=[],
        )
    )
    await db_session.flush()
    await initialize(db_session, test_user.id)
    run = await BotService(db_session).run(
        test_user.id, T, provider=FixtureProvider(payload({"AAA": symbol()}))
    )
    assert run.bot_account_id is not None
    assert run.rule_hash is not None
    assert run.status == "succeeded"
    assert (await db_session.execute(select(func.count(BotExecution.id)))).scalar_one() == 1


@pytest.mark.asyncio
async def test_snapshot_tampering_fails_before_any_retry_execution(db_session, test_user):
    await graduate(db_session, test_user.id)
    await initialize(db_session, test_user.id)
    first = await BotService(db_session).run(
        test_user.id,
        T,
        provider=FixtureProvider(
            payload(
                {"AAA": symbol()},
                complete=False,
                issues=[{"code": "missing_security_status", "detail": "fixture"}],
            )
        ),
    )
    snapshot = (
        await db_session.execute(
            select(BotMarketSnapshot).where(BotMarketSnapshot.bot_run_id == first.id)
        )
    ).scalar_one()
    snapshot.payload = {**snapshot.payload, "symbols": {}}
    await db_session.flush()
    retry = await BotService(db_session).run(test_user.id, T, provider=FixtureProvider(payload({})))
    assert retry.status == "failed"
    assert retry.issues[0]["code"] == "snapshot_hash_mismatch"
    assert (await db_session.execute(select(func.count(BotExecution.id)))).scalar_one() == 0


@pytest.mark.asyncio
async def test_successful_run_still_verifies_frozen_snapshot_on_read_retry(db_session, test_user):
    await graduate(db_session, test_user.id)
    await initialize(db_session, test_user.id)
    first = await BotService(db_session).run(
        test_user.id, T, provider=FixtureProvider(payload({"AAA": symbol()}))
    )
    snapshot = (
        await db_session.execute(
            select(BotMarketSnapshot).where(BotMarketSnapshot.bot_run_id == first.id)
        )
    ).scalar_one()
    snapshot.payload = {**snapshot.payload, "symbols": {}}
    await db_session.flush()
    retry = await BotService(db_session).run(test_user.id, T, provider=FixtureProvider(payload({})))
    assert retry.status == "failed"
    assert retry.issues[0]["code"] == "snapshot_hash_mismatch"


@pytest.mark.asyncio
async def test_corrupt_cash_ledger_is_rejected_before_snapshot_or_trade(db_session, test_user):
    await graduate(db_session, test_user.id)
    await initialize(db_session, test_user.id)
    account = (await db_session.execute(select(BotAccount))).scalar_one()
    account.cash_vnd -= 1
    run = await BotService(db_session).run(
        test_user.id, T, provider=FixtureProvider(payload({"AAA": symbol()}))
    )
    assert run.status == "failed"
    assert run.issues[0]["code"] == "reconciliation_failed"
    assert (await db_session.execute(select(func.count(BotMarketSnapshot.id)))).scalar_one() == 0
    assert (await db_session.execute(select(func.count(BotExecution.id)))).scalar_one() == 0


@pytest.mark.asyncio
async def test_incomplete_position_valuation_persists_unknown_not_partial_nav(db_session, test_user):
    await graduate(db_session, test_user.id)
    await initialize(db_session, test_user.id)
    await BotService(db_session).run(
        test_user.id, T, provider=FixtureProvider(payload({"AAA": symbol()}))
    )
    missing = symbol()
    missing.update({"close_vnd": None, "close_is_official": False, "filter_ids": []})
    run = await BotService(db_session).run(
        test_user.id,
        T + timedelta(days=1),
        provider=FixtureProvider(payload({"AAA": missing})),
    )
    assert run.status == "failed"
    nav = (
        await db_session.execute(
            select(BotNavDaily).where(BotNavDaily.trading_date == T + timedelta(days=1))
        )
    ).scalar_one()
    assert nav.valuation_complete is False
    assert nav.market_value_vnd is None
    assert nav.nav_vnd is None


@pytest.mark.asyncio
async def test_complete_empty_candidate_set_is_logged_as_business_outcome(db_session, test_user):
    await graduate(db_session, test_user.id)
    await initialize(db_session, test_user.id)
    run = await BotService(db_session).run(
        test_user.id, T, provider=FixtureProvider(payload({}))
    )
    assert run.status == "succeeded"
    decision = (
        await db_session.execute(
            select(BotDecision).where(BotDecision.bot_run_id == run.id)
        )
    ).scalar_one()
    assert decision.reason_code == "no_eligible_candidates"


@pytest.mark.asyncio
async def test_scheduler_recovers_old_graduate_without_backdating(db_session, test_user):
    await graduate(db_session, test_user.id)
    await db_session.commit()
    result = await run_scheduled_session(
        T,
        session_factory=TestSessionLocal,
        provider_factory=lambda _session: FixtureProvider(payload({})),
    )
    assert result == {
        "initialized": 1,
        "processed": 1,
        "succeeded": 1,
        "failed": 0,
        "skipped_not_session": 0,
    }
    async with TestSessionLocal() as session:
        instance = (await session.execute(select(BotInstance))).scalar_one()
        run = (await session.execute(select(BotRunReceipt))).scalar_one()
        assert instance.activated_at.date() == T
        assert run.trading_date == T


@pytest.mark.asyncio
async def test_scheduler_recovers_account_but_does_not_create_holiday_run(
    db_session, test_user, monkeypatch
):
    await graduate(db_session, test_user.id)
    await db_session.commit()

    async def not_a_session(_trading_date):
        return False

    monkeypatch.setattr("app.services.bot.service.live_session_ready", not_a_session)
    result = await run_scheduled_session(T, session_factory=TestSessionLocal)
    assert result["initialized"] == 1
    assert result["skipped_not_session"] == 1
    async with TestSessionLocal() as session:
        assert (await session.execute(select(func.count(BotInstance.id)))).scalar_one() == 1
        assert (await session.execute(select(func.count(BotRunReceipt.id)))).scalar_one() == 0


@pytest.mark.asyncio
async def test_missing_buy_feed_does_not_block_valid_threshold_sell(db_session, test_user):
    await graduate(db_session, test_user.id)
    await initialize(db_session, test_user.id)
    await BotService(db_session).run(
        test_user.id, T, provider=FixtureProvider(payload({"AAA": symbol()}))
    )
    next_day = T + timedelta(days=1)
    second = await BotService(db_session).run(
        test_user.id,
        next_day,
        provider=FixtureProvider(
            payload(
                {"AAA": symbol(close=19_000)},
                complete=False,
                issues=[{"code": "filter_data_incomplete", "detail": "fixture"}],
            )
        ),
    )
    assert second.status == "failed"
    assert second.sell_count == 1
    sell = (
        await db_session.execute(
            select(BotExecution).where(BotExecution.side == "sell")
        )
    ).scalar_one()
    assert sell.price_vnd == 19_000


@pytest.mark.asyncio
async def test_new_amplitude_or_negative_news_does_not_move_exit_or_force_sell(
    db_session, test_user
):
    await graduate(db_session, test_user.id)
    await initialize(db_session, test_user.id)
    await BotService(db_session).run(
        test_user.id, T, provider=FixtureProvider(payload({"AAA": symbol()}))
    )
    changed = symbol(close=20_000, amplitude="9999")
    changed["layers"]["tin_tuc"]["is_very_negative"] = True
    second = await BotService(db_session).run(
        test_user.id,
        T + timedelta(days=1),
        provider=FixtureProvider(payload({"AAA": changed})),
    )
    assert second.sell_count == 0
    position = (await db_session.execute(select(BotPosition))).scalar_one()
    assert position.status == "open"
    assert position.amplitude_at_entry_vnd == 500
    assert position.stop_loss_vnd == 19_000
    assert position.take_profit_vnd == 22_000


@pytest.mark.asyncio
async def test_scheduler_crash_after_sell_rolls_back_effects_and_reuses_durable_checkpoint(
    db_session, test_user, monkeypatch
):
    await graduate(db_session, test_user.id)
    await initialize(db_session, test_user.id)
    await BotService(db_session).run(
        test_user.id, T, provider=FixtureProvider(payload({"AAA": symbol()}))
    )
    await db_session.commit()

    next_day = T + timedelta(days=1)
    frozen_payload = payload({"AAA": symbol(close=19_000), "BBB": symbol(close=20_000)})
    original_buy = BotService._buy

    async def crash_before_buy(*_args, **_kwargs):
        raise RuntimeError("fault injection after sell")

    monkeypatch.setattr(BotService, "_buy", crash_before_buy)
    failed = await run_scheduled_session(
        next_day,
        session_factory=TestSessionLocal,
        provider_factory=lambda _session: FixtureProvider(frozen_payload),
    )
    assert failed["failed"] == 1

    async with TestSessionLocal() as session:
        day_run = (
            await session.execute(
                select(BotRunReceipt).where(BotRunReceipt.trading_date == next_day)
            )
        ).scalar_one()
        assert day_run.status == "running"
        assert day_run.nav_basis_vnd == 99_490_000
        assert (
            await session.execute(
                select(func.count(BotExecution.id)).where(BotExecution.trading_date == next_day)
            )
        ).scalar_one() == 0

    monkeypatch.setattr(BotService, "_buy", original_buy)
    changed = payload({"AAA": symbol(close=30_000), "BBB": symbol(close=30_000)})
    changed_provider = FixtureProvider(changed)
    recovered = await run_scheduled_session(
        next_day,
        session_factory=TestSessionLocal,
        provider_factory=lambda _session: changed_provider,
    )
    assert recovered["succeeded"] == 1
    assert changed_provider.calls == 0

    async with TestSessionLocal() as session:
        snapshot = (
            await session.execute(
                select(BotMarketSnapshot)
                .join(BotRunReceipt, BotRunReceipt.id == BotMarketSnapshot.bot_run_id)
                .where(BotRunReceipt.trading_date == next_day)
            )
        ).scalar_one()
        assert snapshot.payload["symbols"]["AAA"]["close_vnd"] == 19_000
        sells = (
            await session.execute(
                select(BotExecution).where(
                    BotExecution.trading_date == next_day,
                    BotExecution.side == "sell",
                )
            )
        ).scalars().all()
        assert len(sells) == 1
        assert sells[0].price_vnd == 19_000
        sell_cash = (
            await session.execute(
                select(BotCashLedger).where(BotCashLedger.execution_id == sells[0].id)
            )
        ).scalars().all()
        assert len(sell_cash) == 1
