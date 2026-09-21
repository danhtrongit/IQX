from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.core.security import create_access_token
from app.models.bot_run import BotAccount, BotDecision, BotInstance
from app.models.cap6 import Cap6Progress
from app.services.bot.service import BotService, initialize
from tests.test_bot_service import FixtureProvider, payload, symbol

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


def headers(user):
    return {"Authorization": f"Bearer {create_access_token(subject=user.id)}"}


async def graduated(db, user):
    db.add(
        Cap6Progress(
            user_id=user.id,
            entered_at=NOW - timedelta(days=3),
            graduated_at=NOW,
        )
    )
    await db.flush()


@pytest.mark.asyncio
async def test_get_overview_never_creates_or_funds_bot(client, db_session, test_user):
    await graduated(db_session, test_user)
    response = await client.get("/api/v1/bot", headers=headers(test_user))
    assert response.status_code == 200
    body = response.json()
    assert body["eligible"] is True
    assert body["bot"] is None
    assert body["account"] is None
    assert body["bot_run"]["issues"][0]["code"] == "not_initialized"
    assert (await db_session.execute(select(func.count(BotAccount.id)))).scalar_one() == 0
    assert (await db_session.execute(select(func.count(BotInstance.id)))).scalar_one() == 0


@pytest.mark.asyncio
async def test_read_contract_uses_strings_and_read_only_journal(client, db_session, test_user):
    await graduated(db_session, test_user)
    await initialize(db_session, test_user)
    await BotService(db_session).run(
        test_user.id,
        date(2026, 9, 15),
        provider=FixtureProvider(payload({"AAA": symbol()})),
    )
    overview = (await client.get("/api/v1/bot", headers=headers(test_user))).json()
    assert overview["bot"]["strategy_id"] == "iqx_standard"
    assert overview["bot"]["execution_model"] == "same_session_close"
    assert overview["account"]["nav_vnd"] == "99990000"
    assert isinstance(overview["account"]["return_total"], str)
    assert overview["bot_run"]["status"] == "succeeded"
    assert "mô phỏng" in overview["disclosure"].lower()

    positions = (await client.get("/api/v1/bot/positions", headers=headers(test_user))).json()
    assert positions["valuation_complete"] is True
    assert positions["items"][0]["qty"] == 500
    assert positions["items"][0]["current_close_vnd"] == "20000"
    assert isinstance(positions["items"][0]["weight_pct"], str)

    journal = (await client.get("/api/v1/bot/journal?limit=1", headers=headers(test_user))).json()
    assert journal["items"][0]["action"] == "buy"
    assert journal["items"][0]["execution"]["price_vnd"] == "20000"
    assert journal["issues"] == []

    performance = (
        await client.get(
            "/api/v1/bot/performance?from=2026-09-01&to=2026-09-30",
            headers=headers(test_user),
        )
    ).json()
    assert performance["base"] == {
        "trading_date": "2026-09-15",
        "bot_nav_vnd": "99990000",
        "vnindex_value": "1800.500000",
    }
    assert performance["series"][0]["bot_return_since_base"] == "0"
    assert performance["comparison_available"] is True


@pytest.mark.asyncio
async def test_user_cannot_read_another_users_bot_rows(client, db_session, test_user, admin_user):
    await graduated(db_session, test_user)
    await initialize(db_session, test_user)
    await BotService(db_session).run(
        test_user.id,
        date(2026, 9, 15),
        provider=FixtureProvider(payload({"AAA": symbol()})),
    )
    own_decision = (await db_session.execute(select(BotDecision))).scalar_one()
    other = (await client.get("/api/v1/bot", headers=headers(admin_user))).json()
    assert other["bot"] is None
    assert other["account"] is None
    assert (
        await client.get(
            f"/api/v1/bot/journal?cursor={own_decision.id}", headers=headers(admin_user)
        )
    ).status_code == 200  # no account means an empty owned collection, no existence leak
    assert (await client.get("/api/v1/bot/positions", headers=headers(admin_user))).json()["items"] == []


@pytest.mark.asyncio
async def test_performance_rejects_reversed_range(client, test_user):
    response = await client.get(
        "/api/v1/bot/performance?from=2026-09-30&to=2026-09-01",
        headers=headers(test_user),
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_incomplete_valuation_is_nullable_in_overview_and_performance(
    client, db_session, test_user
):
    await graduated(db_session, test_user)
    await initialize(db_session, test_user)
    first_day = date(2026, 9, 15)
    await BotService(db_session).run(
        test_user.id,
        first_day,
        provider=FixtureProvider(payload({"AAA": symbol()})),
    )
    missing = symbol()
    missing.update({"close_vnd": None, "close_is_official": False, "filter_ids": []})
    await BotService(db_session).run(
        test_user.id,
        first_day + timedelta(days=1),
        provider=FixtureProvider(payload({"AAA": missing})),
    )

    overview = (await client.get("/api/v1/bot", headers=headers(test_user))).json()
    assert overview["account"]["valuation_complete"] is False
    assert overview["account"]["market_value_vnd"] is None
    assert overview["account"]["nav_vnd"] is None
    assert overview["account"]["pnl_total_net_vnd"] is None
    assert overview["account"]["return_total"] is None

    performance = (
        await client.get("/api/v1/bot/performance", headers=headers(test_user))
    ).json()
    incomplete = performance["series"][-1]
    assert incomplete["valuation_complete"] is False
    assert incomplete["market_value_vnd"] is None
    assert incomplete["nav_vnd"] is None
    assert incomplete["bot_return_since_base"] is None


@pytest.mark.asyncio
async def test_missing_vnindex_keeps_bot_performance_without_fake_comparison(
    client, db_session, test_user
):
    await graduated(db_session, test_user)
    await initialize(db_session, test_user)
    no_index = payload({})
    no_index["vnindex"] = None
    await BotService(db_session).run(
        test_user.id,
        date(2026, 9, 15),
        provider=FixtureProvider(no_index),
    )
    performance = (
        await client.get("/api/v1/bot/performance", headers=headers(test_user))
    ).json()
    assert performance["comparison_available"] is False
    assert performance["base"]["vnindex_value"] is None
    assert performance["series"][0]["bot_return_since_base"] == "0"
    assert performance["series"][0]["vnindex_return_since_base"] is None
