"""Durable recovery for the post-graduation Linh thú branch."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.core.security import create_access_token
from app.models.cap4 import LOP_KEYS, Cap4Progress
from app.models.cap6 import Cap6Progress
from app.models.journey_identity import (
    BotMascotProfile,
    JourneyAssessment,
    JourneyReadingDataset,
)
from app.services.jobs.journey_identity_recovery import (
    run_journey_identity_recovery,
)
from app.services.journey_identity.classification import digest
from tests.conftest import TestSessionLocal


async def test_worker_recovers_transient_fanout_failure_once_without_second_post(
    production_client,
    db_session,
    fresh_session,
    test_user,
    monkeypatch,
):
    from app.api.v1.endpoints import cap6

    graduated_at = datetime.now(UTC) - timedelta(days=1)
    db_session.add(
        Cap6Progress(
            user_id=test_user.id,
            entered_at=graduated_at - timedelta(days=10),
            graduated_at=graduated_at,
        )
    )
    await db_session.commit()

    async def unavailable(*args, **kwargs):
        raise RuntimeError("test-only transient identity failure")

    auth = {
        "Authorization": f"Bearer {create_access_token(subject=test_user.id)}"
    }
    with monkeypatch.context() as scoped:
        scoped.setattr(cap6.JourneyIdentityService, "initialize", unavailable)
        response = await production_client.post(
            "/api/v1/cap6/graduate", headers=auth
        )
    assert response.status_code == 200, response.text
    assert (
        await fresh_session.scalar(select(func.count()).select_from(BotMascotProfile))
        == 0
    )

    first = await run_journey_identity_recovery(session_factory=TestSessionLocal)
    await fresh_session.rollback()
    profile = await fresh_session.scalar(
        select(BotMascotProfile).where(BotMascotProfile.user_id == test_user.id)
    )
    assert profile is not None
    assert profile.assignment_status == "pending_data_repair"
    original = (profile.id, profile.updated_at)
    assert first == {
        "examined": 1,
        "recovered": 1,
        "assigned": 0,
        "pending_data_repair": 1,
        "skipped_unchanged_pending": 0,
        "failed": 0,
    }

    second = await run_journey_identity_recovery(session_factory=TestSessionLocal)
    await fresh_session.rollback()
    same = await fresh_session.get(BotMascotProfile, original[0])
    assert (same.id, same.updated_at) == original
    assert second == {
        "examined": 1,
        "recovered": 0,
        "assigned": 0,
        "pending_data_repair": 0,
        "skipped_unchanged_pending": 1,
        "failed": 0,
    }


async def test_worker_retries_pending_only_after_valid_window_evidence_is_repaired(
    db_session,
    fresh_session,
    test_user,
):
    now = datetime.now(UTC)
    cap4_start = now - timedelta(days=5)
    graduated_at = now - timedelta(days=1)
    db_session.add(Cap4Progress(user_id=test_user.id, entered_at=cap4_start))
    db_session.add(
        Cap6Progress(
            user_id=test_user.id,
            entered_at=now - timedelta(days=2),
            graduated_at=graduated_at,
        )
    )
    await db_session.commit()

    first = await run_journey_identity_recovery(session_factory=TestSessionLocal)
    assert first["pending_data_repair"] == 1
    second = await run_journey_identity_recovery(session_factory=TestSessionLocal)
    assert second["skipped_unchanged_pending"] == 1

    repaired_at = now - timedelta(days=2)
    session_date = repaired_at.date()
    ai_answers = dict.fromkeys(LOP_KEYS, "ok")
    payload = {
        "symbol": "VNM",
        "source_symbol": "VNM",
        "valuation_source_symbol": "VNM",
        "trading_date": str(session_date),
        "ai_answers": ai_answers,
        "readings": {},
        "price": 100,
    }
    dataset = JourneyReadingDataset(
        user_id=test_user.id,
        symbol="VNM",
        trading_date=session_date,
        created_at=repaired_at,
        dataset_hash=digest(payload),
        payload=payload,
    )
    db_session.add(dataset)
    await db_session.flush()
    db_session.add(
        JourneyAssessment(
            user_id=test_user.id,
            dataset_id=dataset.id,
            symbol="VNM",
            trading_date=session_date,
            completed_at=repaired_at,
            answers=ai_answers,
            source="learning",
            mode="thuc_chien",
            record_status="valid",
            proof_version="commit_then_reveal_v1",
        )
    )
    await db_session.commit()

    repaired = await run_journey_identity_recovery(
        session_factory=TestSessionLocal
    )
    assert repaired["assigned"] == repaired["recovered"] == 1
    await fresh_session.rollback()
    profile = await fresh_session.scalar(
        select(BotMascotProfile).where(BotMascotProfile.user_id == test_user.id)
    )
    assert profile.assignment_status == "assigned"
    assert profile.valid_pair_count == 1
