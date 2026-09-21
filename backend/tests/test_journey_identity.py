"""Evidence, ownership, freeze window, ordered reveal, and presentation receipts."""

import uuid
from copy import deepcopy
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.core.exceptions import ConflictError
from app.core.security import create_access_token
from app.models.bot_run import BotRunReceipt
from app.models.cap4 import LOP_KEYS, Cap4Progress
from app.models.cap6 import Cap6Progress
from app.models.journey_identity import BotMascotProfile, JourneyAssessment, JourneyReadingDataset
from app.models.virtual_trading import VirtualCashLedger
from app.services.journey_identity.classification import choose_mascot, classify, digest, utc
from app.services.journey_identity.datasets import snapshot, valuation_verdict
from app.services.journey_identity.service import JourneyIdentityService

NOW = datetime(2026, 9, 11, 8, tzinfo=UTC)
ANSWERS = dict.fromkeys(LOP_KEYS, "ok")


def counts(values):
    return dict(zip(LOP_KEYS, values, strict=True))


@pytest.mark.parametrize(
    "values,mascot,basis",
    [
        ([9, 7, 5, 8, 6], "bach_ho", "ai_match_count"),
        ([4, 10, 5, 10, 6], "thanh_long", "stable_tie_break"),
        ([4, 6, 11, 8, 7], "loc_huou", "ai_match_count"),
        ([4, 6, 7, 11, 8], "phung_hoang", "ai_match_count"),
        ([4, 6, 7, 8, 11], "kim_quy", "ai_match_count"),
        ([0, 0, 0, 0, 0], "bach_ho", "zero_match_tie_break"),
    ],
)
def test_assignment_examples(values, mascot, basis):
    result = choose_mascot(counts(values), 12)
    assert result["mascot_id"] == mascot
    assert result["assignment_basis"] == basis


def test_zero_pairs_is_not_zero_matches():
    assert choose_mascot(counts([0] * 5), 0)["mascot_id"] is None
    assert choose_mascot(counts([0] * 5), 1)["mascot_id"] == "bach_ho"


@pytest.mark.parametrize(
    "values,n",
    [
        ([-1, 0, 0, 0, 0], 1),
        ([2, 0, 0, 0, 0], 1),
        ([0.5, 0, 0, 0, 0], 1),
        ([True, 0, 0, 0, 0], 1),
        ([0] * 4, 1),
        ([0] * 5, -1),
    ],
)
def test_invalid_counts_fail_explicitly(values, n):
    with pytest.raises(ValueError):
        choose_mascot(dict(zip(LOP_KEYS, values, strict=False)), n)


def record(**changes):
    return {
        "id": "first",
        "user_id": "u",
        "symbol": "VNM",
        "trading_date": "2026-09-11",
        "completed_at": NOW,
        "revealed_at": NOW,
        "answers": ANSWERS.copy(),
        "ai_answers": ANSWERS.copy(),
        "source": "learning",
        "mode": "thuc_chien",
        "record_status": "valid",
        "proof_version": "commit_then_reveal_v1",
        "snapshot_matches": True,
        "dataset_id": "d",
        "dataset_hash": "hash",
        **changes,
    }


def result(rows):
    return classify(rows, "u", NOW - timedelta(days=1), NOW)


@pytest.mark.parametrize(
    "changes",
    [
        {"source": "seed"},
        {"source": "bot"},
        {"source": "admin"},
        {"mode": "san_tap"},
        {"record_status": "invalid"},
        {"user_id": "other"},
        {"completed_at": NOW + timedelta(microseconds=1)},
        {"completed_at": NOW - timedelta(days=2)},
        {"proof_version": "client_timestamp"},
        {"answers": {"ky_thuat": "ok"}},
        {"ai_answers": {"ky_thuat": "ok"}},
        {"snapshot_matches": False},
        {"revealed_at": NOW - timedelta(microseconds=1)},
    ],
)
def test_invalid_evidence_is_excluded(changes):
    assert result([record(**changes)])["valid_pair_count"] == 0


@pytest.mark.parametrize("value", ["ok", "neu", "bad"])
def test_every_matching_level_contributes_equally(value):
    row = record(answers=dict.fromkeys(LOP_KEYS, value), ai_answers=dict.fromkeys(LOP_KEYS, value))
    assert result([row])["match_counts"] == dict.fromkeys(LOP_KEYS, 1)


def test_equal_timestamps_use_committed_protocol_proof():
    assert result([record()])["valid_pair_count"] == 1


def test_first_invalid_ai_is_not_replaced_by_later_answers():
    rows = [record(ai_answers={}, completed_at=NOW - timedelta(seconds=1)), record(id="later")]
    assert result(rows)["valid_pair_count"] == 0


def test_same_symbol_two_sessions_counts_twice_but_duplicate_does_not():
    rows = [
        record(completed_at=NOW - timedelta(seconds=1)),
        record(id="duplicate"),
        record(id="other_day", trading_date="2026-09-10"),
    ]
    assert result(rows)["valid_pair_count"] == 2


@pytest.mark.parametrize("ids", [("a", "z"), ("z", "a")])
def test_equal_submission_timestamps_without_order_never_choose_by_random_id(ids):
    rows = [record(id=ids[0], ai_answers={}), record(id=ids[1])]
    outcome = result(rows)
    assert outcome["valid_pair_count"] == 0
    assert outcome["excluded_records_summary"] == {"ambiguous_first_submission_order": 2}
    assert outcome["assignment_status"] == "pending_data_repair"


def test_pnl_and_future_records_cannot_change_identity():
    before = result([record(pnl=-999999)])
    after = result([record(pnl=999999), record(id="future", completed_at=NOW + timedelta(days=1))])
    assert before["match_counts"] == after["match_counts"]
    assert before["dataset_hash"] == after["dataset_hash"]


@pytest.mark.parametrize(
    "price,expected",
    [
        (79, "ok"),
        (90, "ok"),
        (95, "neu"),
        (100, "neu"),
        (105, "neu"),
        (106, "bad"),
        (121, "bad"),
        (0, None),
        (float("nan"), None),
    ],
)
def test_valuation_matches_existing_five_layer_mapping(price, expected):
    assert valuation_verdict({"fair_median": 100, "methods": [{"bear": 80, "bull": 120}]}, price) == expected


def test_masked_snapshot_retains_raw_proof_without_degraded_neutral():
    insight = {
        "symbol": "VNM",
        "updatedAt": NOW.isoformat(),
        "header": {"price": 90},
        "layers": {
            "L1": {
                "layerNum": "L1",
                "statusLabel": "Mạnh",
                "statusLevel": 4,
                "fields": [
                    {"label": "Trạng thái", "value": [{"content": "Mạnh"}]},
                    {"label": "Hỗ trợ", "value": [{"content": "80"}]},
                ],
            },
            "L3": {"statusLabel": "—", "statusLevel": 3},
        },
        "rawInput": {"trend": {"ohlcv": [{"date": "2026-09-11"}]}},
    }
    payload = snapshot(
        insight,
        {
            "hero": {"ticker": "VNM"},
            "blocks": {"valuation": {"fair_median": 100, "methods": [{"bear": 80, "bull": 120}]}},
        },
        NOW,
        symbol="vnm",
    )
    assert payload["symbol"] == "VNM"
    assert payload["source_symbol"] == "VNM"
    assert payload["valuation_source_symbol"] == "VNM"
    assert payload["readings"]["ky_thuat"]["lines"] == ["Hỗ trợ: 80"]
    assert "dong_tien" not in payload["ai_answers"]
    assert payload["ai_answers"]["dinh_gia"] == "ok"
    assert payload["trading_date"] == "2026-09-11"


@pytest.mark.parametrize("fields", [[], [{"label": "Hỗ trợ", "value": [{"content": "  "}]}]])
def test_ai_label_without_visible_reading_is_not_valid_evidence(fields):
    payload = snapshot({"layers": {"L1": {"statusLabel": "Mạnh", "fields": fields}}}, None, NOW)
    assert payload["readings"]["ky_thuat"] == {"lines": [], "degraded": True}
    assert "ky_thuat" not in payload["ai_answers"]
    assert "ky_thuat" in payload["unavailable_layers"]
    assert payload["source_snapshot"]["insight"]["layers"]["L1"]["statusLabel"] == "Mạnh"


def test_valuation_without_methods_preserves_existing_median_fallback():
    payload = snapshot(None, {"blocks": {"valuation": {"fair_median": 100, "current_price": 90, "methods": None}}}, NOW)
    assert payload["ai_answers"]["dinh_gia"] == "ok"
    assert not payload["readings"]["dinh_gia"]["degraded"]


@pytest.mark.parametrize(
    "insight,bctc",
    [
        ({"layers": []}, {"blocks": []}),
        ({"layers": {"L1": [], "L5": {"layerNum": "L5", "news": []}}}, None),
        ({"rawInput": {"trend": {"ohlcv": [None, "bad"]}}}, {"blocks": {"valuation": []}}),
        ({"layers": {"L1": {"fields": [None, {"label": "Hỗ trợ", "value": None}]}}}, {}),
    ],
)
def test_malformed_provider_shapes_degrade_without_fabricating_neutral(insight, bctc):
    payload = snapshot(insight, bctc, NOW, symbol="VNM")
    assert payload["ai_answers"] == {}
    assert payload["unavailable_layers"] == list(LOP_KEYS)
    assert all(reading["degraded"] for reading in payload["readings"].values())


def headers(user):
    return {"Authorization": f"Bearer {create_access_token(subject=user.id, extra_claims={'role': user.role.value})}"}


async def graduated(db, user, evidence=True):
    now = datetime.now(UTC)
    db.add(Cap4Progress(user_id=user.id, entered_at=now - timedelta(days=2)))
    db.add(Cap6Progress(user_id=user.id, entered_at=now - timedelta(days=1), graduated_at=now))
    if evidence:
        payload = {
            "symbol": "VNM",
            "source_symbol": "VNM",
            "valuation_source_symbol": "VNM",
            "ai_answers": ANSWERS,
            "trading_date": str(now.date()),
            "readings": {},
            "price": 100,
        }
        dataset = JourneyReadingDataset(
            user_id=user.id,
            symbol="VNM",
            trading_date=now.date(),
            created_at=now - timedelta(hours=2),
            payload=payload,
            dataset_hash=digest(payload),
        )
        db.add(dataset)
        await db.flush()
        db.add(
            JourneyAssessment(
                user_id=user.id,
                dataset_id=dataset.id,
                symbol="VNM",
                trading_date=now.date(),
                completed_at=now - timedelta(hours=1),
                answers=ANSWERS,
                revealed_at=now - timedelta(minutes=59),
            )
        )
    await db.commit()
    return now


@pytest.mark.asyncio
async def test_get_never_initializes_or_funds(client, db_session, test_user):
    await graduated(db_session, test_user)
    response = await client.get("/api/v1/bot/mascot", headers=headers(test_user))
    assert response.status_code == 200
    assert response.json()["lifecycle"] == "pending_data_repair"
    assert (await db_session.scalar(select(func.count()).select_from(BotMascotProfile))) == 0
    assert (await db_session.scalar(select(func.count()).select_from(VirtualCashLedger))) == 0


@pytest.mark.asyncio
async def test_profile_is_frozen_and_initialization_idempotent(db_session, test_user):
    await graduated(db_session, test_user)
    service = JourneyIdentityService(db_session)
    first = await service.initialize(test_user.id)
    await db_session.commit()
    original = (first.id, first.assigned_at, deepcopy(first.match_counts), first.window_end)
    again = await service.initialize(test_user.id)
    assert (again.id, again.assigned_at, again.match_counts, again.window_end) == original
    assert (await service.get(test_user.id))["lifecycle"] == "reveal_pending"
    assert (await db_session.scalar(select(func.count()).select_from(VirtualCashLedger))) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("corruption", ["hash", "contribution", "missing_ref", "species"])
async def test_corrupt_frozen_assignment_is_reported_without_reassigning(db_session, test_user, corruption):
    await graduated(db_session, test_user)
    service = JourneyIdentityService(db_session)
    profile = await service.initialize(test_user.id)
    original_species = profile.mascot_id
    if corruption == "hash":
        profile.dataset_hash = "invalid"
    elif corruption == "contribution":
        refs = deepcopy(profile.selected_assessment_refs)
        refs[0]["contribution"]["ky_thuat"] = 0
        profile.selected_assessment_refs = refs
        profile.dataset_hash = digest(refs)
    elif corruption == "missing_ref":
        profile.selected_assessment_refs = []
        profile.dataset_hash = digest([])
    else:
        profile.mascot_id = "kim_quy"
    await db_session.flush()
    with pytest.raises(ConflictError):
        await service.get(test_user.id)
    with pytest.raises(ConflictError):
        await service.initialize(test_user.id)
    assert profile.mascot_id == ("kim_quy" if corruption == "species" else original_species)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "corruption", ["window_start", "window_end", "answers", "commit_time", "payload", "dataset_ref"]
)
async def test_frozen_assignment_rejects_changed_original_evidence(db_session, test_user, corruption):
    await graduated(db_session, test_user)
    service = JourneyIdentityService(db_session)
    profile = await service.initialize(test_user.id)
    original = (profile.mascot_id, profile.assigned_at, deepcopy(profile.match_counts))
    assessment = await db_session.scalar(select(JourneyAssessment).where(JourneyAssessment.user_id == test_user.id))
    dataset = await db_session.get(JourneyReadingDataset, assessment.dataset_id)
    if corruption == "window_start":
        profile.window_start -= timedelta(minutes=1)
    elif corruption == "window_end":
        profile.window_end -= timedelta(minutes=1)
    elif corruption == "answers":
        assessment.answers = dict.fromkeys(LOP_KEYS, "bad")
    elif corruption == "commit_time":
        assessment.completed_at += timedelta(minutes=1)
    elif corruption == "payload":
        payload = deepcopy(dataset.payload)
        payload["price"] = 777
        dataset.payload = payload
        dataset.dataset_hash = digest(payload)
    else:
        refs = deepcopy(profile.selected_assessment_refs)
        refs[0]["dataset_id"] = str(uuid.uuid4())
        profile.selected_assessment_refs = refs
        profile.dataset_hash = digest(refs)
    await db_session.flush()
    with pytest.raises(ConflictError):
        await service.get(test_user.id)
    with pytest.raises(ConflictError):
        await service.initialize(test_user.id)
    assert (profile.mascot_id, profile.assigned_at, profile.match_counts) == original


@pytest.mark.asyncio
async def test_later_reveal_does_not_invalidate_committed_assessment_receipt(db_session, test_user):
    await graduated(db_session, test_user)
    assessment = await db_session.scalar(select(JourneyAssessment).where(JourneyAssessment.user_id == test_user.id))
    assessment.revealed_at = None
    service = JourneyIdentityService(db_session)
    profile = await service.initialize(test_user.id)
    frozen_hash = profile.dataset_hash
    await service.reveal(test_user.id, assessment.id)
    assert (await service.get(test_user.id))["lifecycle"] == "reveal_pending"
    assert profile.dataset_hash == frozen_hash


@pytest.mark.asyncio
async def test_pending_recovery_cannot_extend_frozen_graduation_window(db_session, test_user):
    await graduated(db_session, test_user, evidence=False)
    service = JourneyIdentityService(db_session)
    profile = await service.initialize(test_user.id)
    original_end = profile.window_end
    progress = await db_session.scalar(select(Cap6Progress).where(Cap6Progress.user_id == test_user.id))
    progress.graduated_at += timedelta(days=1)
    with pytest.raises(ConflictError):
        await service.initialize(test_user.id)
    assert profile.window_end == original_end
    assert profile.assignment_status == "pending_data_repair"


@pytest.mark.asyncio
async def test_pending_profile_recovers_authoritative_missing_cap4_boundary(db_session, test_user):
    now = datetime.now(UTC)
    db_session.add(Cap6Progress(user_id=test_user.id, entered_at=now - timedelta(days=1), graduated_at=now))
    await db_session.commit()
    service = JourneyIdentityService(db_session)
    profile = await service.initialize(test_user.id)
    assert profile.window_start is None
    cap4_start = now - timedelta(days=2)
    db_session.add(Cap4Progress(user_id=test_user.id, entered_at=cap4_start))
    await db_session.flush()
    recovered = await service.initialize(test_user.id)
    assert recovered.id == profile.id
    assert utc(recovered.window_start) == utc(cap4_start)
    assert utc(recovered.window_end) == utc(now)


@pytest.mark.asyncio
async def test_repair_dry_run_does_not_write_and_apply_preserves_frozen_window(db_session, test_user, monkeypatch):
    from app.services.journey_identity import repair as module
    from tests.conftest import TestSessionLocal

    await graduated(db_session, test_user, evidence=False)
    monkeypatch.setattr(module, "get_session_factory", lambda: TestSessionLocal)
    assert await module.repair(False) == {"examined": 1, "assigned": 0, "pending_data_repair": 1, "failed": 0}
    assert await db_session.scalar(select(func.count()).select_from(BotMascotProfile)) == 0
    assert (await module.repair(True))["pending_data_repair"] == 1
    first = await JourneyIdentityService(db_session).profile(test_user.id)
    original = (first.id, first.window_start, first.window_end)
    assert (await module.repair(True))["pending_data_repair"] == 1
    await db_session.refresh(first)
    assert (first.id, first.window_start, first.window_end) == original
    assert await db_session.scalar(select(func.count()).select_from(VirtualCashLedger)) == 0


@pytest.mark.asyncio
async def test_pending_remains_pre_hatch_and_rejects_ui_override(client, db_session, test_user):
    await graduated(db_session, test_user, evidence=False)
    await JourneyIdentityService(db_session).initialize(test_user.id)
    response = await client.post(
        "/api/v1/bot/mascot/ui-events", headers=headers(test_user), json={"event": "hatch_seen"}
    )
    assert response.status_code == 409
    response = await client.post(
        "/api/v1/bot/mascot/ui-events", headers=headers(test_user), json={"event": "hatch_seen", "mascot_id": "bach_ho"}
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_hatch_and_welcome_are_separate_ordered_idempotent_milestones(client, db_session, test_user):
    await graduated(db_session, test_user)
    await JourneyIdentityService(db_session).initialize(test_user.id)
    endpoint = "/api/v1/bot/mascot/ui-events"
    assert (await client.post(endpoint, headers=headers(test_user), json={"event": "reveal_seen"})).status_code == 409
    first = (await client.post(endpoint, headers=headers(test_user), json={"event": "hatch_seen"})).json()
    again = (await client.post(endpoint, headers=headers(test_user), json={"event": "hatch_seen"})).json()
    assert first["ui_state"]["egg_hatch_seen_at"] == again["ui_state"]["egg_hatch_seen_at"]
    assert again["lifecycle"] == "reveal_pending"
    done = (await client.post(endpoint, headers=headers(test_user), json={"event": "reveal_seen"})).json()
    assert done["lifecycle"] == "mascot"
    assert done["ui_state"]["greeted_local_date"] == done["today_local"]


@pytest.mark.asyncio
async def test_run_cursor_never_regresses_and_failed_or_foreign_runs_rejected(
    client, db_session, test_user, admin_user
):
    await graduated(db_session, test_user)
    service = JourneyIdentityService(db_session)
    await service.initialize(test_user.id)
    await service.ui_event(test_user.id, "hatch_seen")
    await service.ui_event(test_user.id, "reveal_seen")
    runs = []
    for index in range(4):
        row = BotRunReceipt(
            user_id=admin_user.id if index == 3 else test_user.id,
            trading_date=date(2026, 9, index + 7),
            status="failed" if index == 2 else "succeeded",
            started_at=NOW,
            completed_at=NOW,
            issues=[],
        )
        db_session.add(row)
        runs.append(row)
    await db_session.flush()
    endpoint = "/api/v1/bot/mascot/ui-events"
    for row in runs[2:]:
        response = await client.post(
            endpoint, headers=headers(test_user), json={"event": "bot_run_updated_seen", "run_id": str(row.id)}
        )
        assert response.status_code == 400
    for row in (runs[1], runs[0]):
        await service.ui_event(test_user.id, "bot_run_updated_seen", run_id=row.id)
    state = await service.get(test_user.id)
    assert state["ui_state"]["last_animated_bot_run_id"] == runs[1].id
    assert state["bot_run"]["status"] == "failed"
    assert state["bot_run"]["latest_run_id"] == runs[2].id


@pytest.mark.asyncio
async def test_real_http_commit_precedes_reveal_and_retry_keeps_first_answers(
    production_client, db_session, test_user, admin_user, monkeypatch
):
    from app.services.journey_identity import service as module

    now = datetime.now(UTC)
    db_session.add(Cap4Progress(user_id=test_user.id, entered_at=now - timedelta(days=1)))
    await db_session.commit()
    payload = {
        "symbol": "VNM",
        "source_symbol": "VNM",
        "valuation_source_symbol": "VNM",
        "ai_answers": ANSWERS,
        "trading_date": str(now.date()),
        "readings": {key: {"lines": ["data"], "degraded": False} for key in LOP_KEYS},
        "price": 100,
    }

    async def source(*args):
        return deepcopy(payload)

    monkeypatch.setattr(module, "load_dataset", source)
    response = await production_client.post(
        "/api/v1/journey/reading-datasets", headers=headers(test_user), json={"symbol": "VNM"}
    )
    assert response.status_code == 200
    assert "ai_answers" not in response.json()
    dataset_id = response.json()["id"]
    posted = await production_client.post(
        "/api/v1/journey/assessments", headers=headers(test_user), json={"dataset_id": dataset_id, "answers": ANSWERS}
    )
    assert posted.status_code == 200
    assert "ai_answers" not in posted.json()
    assessment_id = posted.json()["id"]
    # Another database session can now observe the committed first answers.
    stored = await db_session.get(JourneyAssessment, uuid.UUID(assessment_id))
    assert stored.answers == ANSWERS
    assert stored.revealed_at is None
    assert (
        await production_client.post(f"/api/v1/journey/assessments/{assessment_id}/reveal", headers=headers(admin_user))
    ).status_code == 404
    revealed = await production_client.post(
        f"/api/v1/journey/assessments/{assessment_id}/reveal", headers=headers(test_user)
    )
    assert revealed.json()["ai_answers"] == ANSWERS
    again = await production_client.post(
        "/api/v1/journey/assessments",
        headers=headers(test_user),
        json={"dataset_id": dataset_id, "answers": dict.fromkeys(LOP_KEYS, "bad")},
    )
    assert again.json()["id"] == assessment_id
    await db_session.refresh(stored)
    assert stored.answers == ANSWERS
    assert utc(stored.revealed_at) >= utc(stored.completed_at)
    assert (
        await production_client.post(
            "/api/v1/journey/assessments",
            headers=headers(admin_user),
            json={"dataset_id": dataset_id, "answers": ANSWERS},
        )
    ).status_code == 404


@pytest.mark.asyncio
async def test_dataset_endpoint_rejects_mismatched_provider_symbol(client, db_session, test_user, monkeypatch):
    from app.services.journey_identity import service as module

    db_session.add(Cap4Progress(user_id=test_user.id, entered_at=datetime.now(UTC)))
    await db_session.commit()

    async def mismatched_source(*args):
        return {
            "symbol": "VNM",
            "source_symbol": "FPT",
            "valuation_source_symbol": "VNM",
            "ai_answers": ANSWERS,
            "trading_date": str(datetime.now(UTC).date()),
            "readings": {},
            "price": 100,
        }

    monkeypatch.setattr(module, "load_dataset", mismatched_source)
    response = await client.post(
        "/api/v1/journey/reading-datasets", headers=headers(test_user), json={"symbol": "VNM"}
    )
    assert response.status_code == 409
    assert await db_session.scalar(select(func.count()).select_from(JourneyReadingDataset)) == 0


@pytest.mark.asyncio
async def test_snapshot_provider_symbol_mismatch_never_assigns(db_session, test_user):
    await graduated(db_session, test_user)
    dataset = await db_session.scalar(
        select(JourneyReadingDataset).where(JourneyReadingDataset.user_id == test_user.id)
    )
    payload = deepcopy(dataset.payload)
    payload["source_symbol"] = "FPT"
    dataset.payload = payload
    dataset.dataset_hash = digest(payload)
    await db_session.flush()
    profile = await JourneyIdentityService(db_session).initialize(test_user.id)
    assert profile.assignment_status == "pending_data_repair"
    assert profile.valid_pair_count == 0
    assert profile.excluded_records_summary == {"missing_or_invalid_ai_snapshot": 1}


@pytest.mark.asyncio
async def test_valuation_provider_symbol_mismatch_never_assigns(db_session, test_user):
    await graduated(db_session, test_user)
    dataset = await db_session.scalar(
        select(JourneyReadingDataset).where(JourneyReadingDataset.user_id == test_user.id)
    )
    payload = deepcopy(dataset.payload)
    payload["valuation_source_symbol"] = "FPT"
    dataset.payload = payload
    dataset.dataset_hash = digest(payload)
    await db_session.flush()
    profile = await JourneyIdentityService(db_session).initialize(test_user.id)
    assert profile.assignment_status == "pending_data_repair"
    assert profile.valid_pair_count == 0
