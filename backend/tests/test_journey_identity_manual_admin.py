"""Regression coverage for manual five-layer learning by admin accounts."""

from __future__ import annotations

import uuid
from copy import deepcopy
from datetime import UTC, datetime, timedelta

import pytest

from app.core.security import create_access_token
from app.models.cap4 import LOP_KEYS, Cap4Progress
from app.models.journey_identity import JourneyAssessment, JourneyReadingDataset
from app.services.journey_identity.classification import classify, digest
from app.services.journey_identity.service import evidence_records

ANSWERS = dict.fromkeys(LOP_KEYS, "ok")


def _headers(user) -> dict[str, str]:
    token = create_access_token(subject=user.id, extra_claims={"role": user.role.value})
    return {"Authorization": f"Bearer {token}"}


def _payload(symbol: str, trading_date) -> dict:
    return {
        "symbol": symbol,
        "source_symbol": symbol,
        "valuation_source_symbol": symbol,
        "ai_answers": ANSWERS.copy(),
        "trading_date": str(trading_date),
        "readings": {key: {"lines": ["data"], "degraded": False} for key in LOP_KEYS},
        "price": 100,
    }


@pytest.mark.asyncio
async def test_user_facing_submit_is_learning_evidence_for_admin_and_user(
    production_client,
    db_session,
    fresh_session,
    test_user,
    admin_user,
    monkeypatch,
):
    """Account role must not relabel an ordinary learning submission as seeded data."""
    now = datetime.now(UTC)
    db_session.add_all(
        [
            Cap4Progress(user_id=test_user.id, entered_at=now - timedelta(days=1)),
            Cap4Progress(user_id=admin_user.id, entered_at=now - timedelta(days=1)),
        ]
    )
    await db_session.commit()

    async def load_dataset(symbol, _now):
        return deepcopy(_payload(symbol, now.date()))

    from app.services.journey_identity import service as service_module

    monkeypatch.setattr(service_module, "load_dataset", load_dataset)

    submissions = {}
    for user, symbol in ((test_user, "VNM"), (admin_user, "FPT")):
        dataset_response = await production_client.post(
            "/api/v1/journey/reading-datasets",
            headers=_headers(user),
            json={"symbol": symbol},
        )
        assert dataset_response.status_code == 200
        assert "ai_answers" not in dataset_response.json()

        dataset_id = dataset_response.json()["id"]
        submit_response = await production_client.post(
            "/api/v1/journey/assessments",
            headers=_headers(user),
            json={"dataset_id": dataset_id, "answers": ANSWERS},
        )
        assert submit_response.status_code == 200
        assert "ai_answers" not in submit_response.json()

        assessment_id = uuid.UUID(submit_response.json()["id"])
        assessment = await fresh_session.get(JourneyAssessment, assessment_id)
        dataset = await fresh_session.get(JourneyReadingDataset, uuid.UUID(dataset_id))
        assert assessment.source == "learning"
        assert assessment.revealed_at is None

        pre_reveal = classify(
            evidence_records([(assessment, dataset)], user.id),
            str(user.id),
            now - timedelta(days=1),
            now + timedelta(days=1),
        )
        assert pre_reveal["valid_pair_count"] == 1
        assert pre_reveal["excluded_records_summary"] == {}
        submissions[user.id] = assessment_id

    # A privileged account still cannot read or reveal another user's evidence.
    user_assessment_id = submissions[test_user.id]
    admin_assessment_id = submissions[admin_user.id]
    assert (
        await production_client.post(
            f"/api/v1/journey/assessments/{user_assessment_id}/reveal",
            headers=_headers(admin_user),
        )
    ).status_code == 404
    assert (
        await production_client.post(
            f"/api/v1/journey/assessments/{admin_assessment_id}/reveal",
            headers=_headers(test_user),
        )
    ).status_code == 404

    for user, assessment_id in ((test_user, user_assessment_id), (admin_user, admin_assessment_id)):
        reveal_response = await production_client.post(
            f"/api/v1/journey/assessments/{assessment_id}/reveal",
            headers=_headers(user),
        )
        assert reveal_response.status_code == 200
        assert reveal_response.json()["first_answers"] == ANSWERS
        assert reveal_response.json()["ai_answers"] == ANSWERS


def test_classifier_still_excludes_explicit_admin_seed_records():
    completed_at = datetime(2026, 9, 21, 4, tzinfo=UTC)
    user_id = uuid.uuid4()
    record = {
        "id": str(uuid.uuid4()),
        "user_id": str(user_id),
        "symbol": "VNM",
        "trading_date": "2026-09-21",
        "completed_at": completed_at,
        "revealed_at": completed_at,
        "answers": ANSWERS.copy(),
        "ai_answers": ANSWERS.copy(),
        "source": "admin",
        "mode": "thuc_chien",
        "record_status": "valid",
        "proof_version": "commit_then_reveal_v1",
        "snapshot_matches": True,
        "dataset_id": str(uuid.uuid4()),
        "dataset_hash": digest({"seed": True}),
    }

    outcome = classify(
        [record],
        str(user_id),
        completed_at - timedelta(minutes=1),
        completed_at + timedelta(minutes=1),
    )

    assert outcome["valid_pair_count"] == 0
    assert outcome["assignment_status"] == "pending_data_repair"
    assert outcome["excluded_records_summary"] == {"not_learning_evidence": 1}
