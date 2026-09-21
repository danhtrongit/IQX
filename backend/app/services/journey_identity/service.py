"""Server-authoritative lifecycle; presentation writes never modify progression."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.bot_run import BotRunReceipt
from app.models.cap0 import Cap0Progress
from app.models.cap1 import Cap1Progress
from app.models.cap2 import Cap2Progress
from app.models.cap3 import Cap3Progress
from app.models.cap4 import Cap4Progress
from app.models.cap5 import Cap5Progress
from app.models.cap6 import Cap6Progress
from app.models.journey_identity import BotMascotProfile, JourneyAssessment, JourneyIdentityUI, JourneyReadingDataset
from app.models.user import User
from app.services.journey_identity.classification import (
    MASCOTS,
    RULES_VERSION,
    choose_mascot,
    classify,
    complete_map,
    digest,
    utc,
)
from app.services.journey_identity.datasets import load_dataset
from app.services.journey_identity.legacy_recovery import read_legacy_mascot

logger = logging.getLogger(__name__)
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
PROGRESS_MODELS = (Cap0Progress, Cap1Progress, Cap2Progress, Cap3Progress, Cap4Progress, Cap5Progress, Cap6Progress)


def utc_fields(value):
    if isinstance(value, datetime):
        return utc(value)
    if isinstance(value, dict):
        return {key: utc_fields(item) for key, item in value.items()}
    return value


def validate_assignment(profile: BotMascotProfile) -> None:
    """Check the frozen audit without silently recalculating an assigned species."""
    try:
        expected = choose_mascot(profile.match_counts, profile.valid_pair_count)
        if any(getattr(profile, key) != value for key, value in expected.items()):
            raise ValueError("assignment mismatch")
        refs = profile.selected_assessment_refs
        if (
            not isinstance(refs, list)
            or len(refs) != profile.valid_pair_count
            or profile.dataset_hash != digest(refs)
            or profile.window_start is None
            or utc(profile.window_start) > utc(profile.window_end)
            or profile.assigned_at is None
            or utc(profile.assigned_at) < utc(profile.window_end)
        ):
            raise ValueError("invalid frozen audit")
        totals = dict.fromkeys(MASCOTS, 0)
        ids = set()
        for ref in refs:
            contribution = ref["contribution"]
            if (
                ref["assessment_id"] in ids
                or set(contribution) != set(MASCOTS)
                or any(type(value) is not int or value not in (0, 1) for value in contribution.values())
            ):
                raise ValueError("invalid assessment contribution")
            ids.add(ref["assessment_id"])
            for key, value in contribution.items():
                totals[key] += value
        if totals != profile.match_counts:
            raise ValueError("contributions do not match counts")
    except (ValueError, TypeError, KeyError, AttributeError) as error:
        logger.error("mascot_assignment_integrity_error", extra={"profile_id": str(profile.id)})
        raise ConflictError("Hồ sơ Linh thú cần được kiểm tra dữ liệu") from error


def evidence_records(pairs: list, user_id: uuid.UUID) -> list[dict]:
    records = []
    for assessment, dataset in pairs:
        payload = dataset.payload if isinstance(dataset.payload, dict) else {}
        records.append(
            {
                "id": str(assessment.id),
                "user_id": str(assessment.user_id),
                "symbol": assessment.symbol,
                "trading_date": str(assessment.trading_date),
                "completed_at": assessment.completed_at,
                "revealed_at": assessment.revealed_at,
                "answers": assessment.answers,
                "source": assessment.source,
                "mode": assessment.mode,
                "record_status": assessment.record_status,
                "proof_version": assessment.proof_version,
                "dataset_id": str(dataset.id),
                "dataset_hash": dataset.dataset_hash,
                "ai_answers": payload.get("ai_answers"),
                "snapshot_matches": (
                    dataset.user_id == user_id
                    and dataset.symbol == assessment.symbol
                    and dataset.trading_date == assessment.trading_date
                    and payload.get("symbol") == assessment.symbol
                    and payload.get("source_symbol") == assessment.symbol
                    and payload.get("valuation_source_symbol") == assessment.symbol
                    and payload.get("trading_date") == str(dataset.trading_date)
                    and digest(payload) == dataset.dataset_hash
                    and utc(dataset.created_at) <= utc(assessment.completed_at)
                ),
            }
        )
    return records


class JourneyIdentityService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def lock_user(self, user_id: uuid.UUID) -> User:
        user = (await self.db.execute(select(User).where(User.id == user_id).with_for_update())).scalar_one_or_none()
        if user is None:
            raise NotFoundError("người dùng")
        return user

    async def progress(self, user_id: uuid.UUID) -> tuple[int, datetime | None]:
        level = 0
        graduated = None
        for index, model in enumerate(PROGRESS_MODELS):
            row = (await self.db.execute(select(model).where(model.user_id == user_id))).scalar_one_or_none()
            if row is not None:
                level = index
                if index == 6:
                    graduated = row.graduated_at
        return level, graduated

    async def profile(self, user_id: uuid.UUID) -> BotMascotProfile | None:
        return (
            await self.db.execute(
                select(BotMascotProfile).where(
                    BotMascotProfile.user_id == user_id,
                    BotMascotProfile.mascot_rules_version == RULES_VERSION,
                )
            )
        ).scalar_one_or_none()

    async def initialize(self, user_id: uuid.UUID) -> BotMascotProfile | None:
        """Idempotent backend initialization/recovery, no UI side effects or funds."""
        await self.lock_user(user_id)
        _, graduated = await self.progress(user_id)
        if graduated is None:
            return None
        profile = await self.profile(user_id)
        if profile is not None and profile.assignment_status == "assigned":
            await self.validate_frozen_profile(profile, graduated)
            return profile
        # A reviewed legacy recovery is already a fixed identity. New or repaired
        # evidence must not silently reroll an identity shown to the learner.
        if await read_legacy_mascot(self.db, user_id, graduated) is not None:
            return profile
        cap4 = (await self.db.execute(select(Cap4Progress).where(Cap4Progress.user_id == user_id))).scalar_one_or_none()
        now = datetime.now(UTC)
        if profile is None:
            profile = BotMascotProfile(
                user_id=user_id,
                window_start=cap4.entered_at if cap4 else None,
                window_end=graduated,
                created_at=now,
                updated_at=now,
            )
        elif profile.window_start is None and cap4 is not None:
            # A pending profile may have been created while the historical
            # Cấp 4 row was unavailable. Restore only the authoritative
            # boundary; never substitute the retry time or widen window_end.
            profile.window_start = cap4.entered_at
            logger.info("mascot_window_start_recovered", extra={"profile_id": str(profile.id)})
        # Recovery always uses the originally frozen window. Never silently
        # legitimize a changed graduation boundary with new evidence.
        self.validate_window(profile, cap4, graduated)
        pairs = (
            await self.db.execute(
                select(JourneyAssessment, JourneyReadingDataset)
                .join(JourneyReadingDataset, JourneyReadingDataset.id == JourneyAssessment.dataset_id)
                .where(JourneyAssessment.user_id == user_id)
            )
        ).all()
        records = evidence_records(pairs, user_id)
        result = classify(records, str(user_id), profile.window_start, profile.window_end)
        for key, value in result.items():
            setattr(profile, key, value)
        self.db.add(profile)
        profile.updated_at = now
        if result["assignment_status"] == "assigned":
            profile.assigned_at = now
            logger.info(
                "mascot_assigned",
                extra={
                    "mascot_id": profile.mascot_id,
                    "dominant_layer": profile.dominant_layer,
                    "assignment_basis": profile.assignment_basis,
                    "mascot_rules_version": profile.mascot_rules_version,
                    "valid_pair_count": profile.valid_pair_count,
                    "matched_count": max(profile.match_counts.values()),
                },
            )
        else:
            logger.info(
                "mascot_pending_data_repair",
                extra={
                    "reason": "no_verified_pairs",
                    "mascot_rules_version": profile.mascot_rules_version,
                    "window_start": profile.window_start,
                    "window_end": profile.window_end,
                    "excluded_records_summary": profile.excluded_records_summary,
                },
            )
        await self.db.flush()
        return profile

    @staticmethod
    def validate_window(profile: BotMascotProfile, cap4: Cap4Progress | None, graduated: datetime) -> None:
        if utc(profile.window_end) != utc(graduated) or (
            profile.window_start is not None
            and (
                cap4 is None
                or utc(profile.window_start) != utc(cap4.entered_at)
                or utc(profile.window_start) > utc(profile.window_end)
            )
        ):
            logger.error("mascot_assignment_window_integrity_error", extra={"profile_id": str(profile.id)})
            raise ConflictError("Mốc dữ liệu Linh thú cần được kiểm tra")

    async def validate_frozen_profile(self, profile: BotMascotProfile, graduated: datetime) -> None:
        """Verify the stored receipt against its original evidence, never reroll.

        Only immutable learning snapshots are read here. New trades, live AI,
        later assessments and their outcomes cannot affect the assigned species.
        """
        validate_assignment(profile)
        cap4 = await self.db.scalar(select(Cap4Progress).where(Cap4Progress.user_id == profile.user_id))
        self.validate_window(profile, cap4, graduated)
        try:
            ids = [uuid.UUID(ref["assessment_id"]) for ref in profile.selected_assessment_refs]
        except (ValueError, TypeError, KeyError, AttributeError) as error:
            raise ConflictError("Chứng cứ Linh thú cần được kiểm tra") from error
        pairs = (
            await self.db.execute(
                select(JourneyAssessment, JourneyReadingDataset)
                .join(JourneyReadingDataset, JourneyReadingDataset.id == JourneyAssessment.dataset_id)
                .where(JourneyAssessment.id.in_(ids), JourneyAssessment.user_id == profile.user_id)
            )
        ).all()
        evidence = classify(
            evidence_records(pairs, profile.user_id), str(profile.user_id), profile.window_start, profile.window_end
        )
        if evidence["selected_assessment_refs"] != profile.selected_assessment_refs:
            logger.error("mascot_assignment_evidence_integrity_error", extra={"profile_id": str(profile.id)})
            raise ConflictError("Chứng cứ Linh thú cần được kiểm tra")

    async def bot_status(self, user_id: uuid.UUID, ui: JourneyIdentityUI | None) -> dict:
        runs = (
            (
                await self.db.execute(
                    select(BotRunReceipt)
                    .where(BotRunReceipt.user_id == user_id)
                    .order_by(BotRunReceipt.trading_date.desc(), BotRunReceipt.started_at.desc())
                )
            )
            .scalars()
            .all()
        )
        cursor = next((r for r in runs if ui and r.id == ui.last_animated_bot_run_id), None)
        latest = runs[0] if runs else None
        unseen = sum(r.status == "succeeded" and (cursor is None or r.trading_date > cursor.trading_date) for r in runs)
        return {
            "status": latest.status if latest else "idle",
            "latest_run_id": latest.id if latest else None,
            "last_updated_at": (latest.completed_at or latest.started_at) if latest else None,
            "processed_unseen_sessions": unseen,
            "issues": latest.issues if latest else [],
            "connected": latest is not None,
        }

    async def get(self, user_id: uuid.UUID) -> dict:
        level, graduated = await self.progress(user_id)
        profile = await self.profile(user_id)
        ui = await self.db.get(JourneyIdentityUI, user_id)
        mascot = None
        lifecycle = "egg"
        if graduated:
            lifecycle = "pending_data_repair"
            if profile and profile.assignment_status == "assigned":
                await self.validate_frozen_profile(profile, graduated)
                mascot = {
                    key: getattr(profile, key)
                    for key in (
                        "dominant_layer",
                        "assignment_basis",
                        "valid_pair_count",
                        "match_counts",
                        "tied_layers",
                        "window_start",
                        "window_end",
                        "assigned_at",
                    )
                }
                mascot.update(id=profile.mascot_id, name=MASCOTS[profile.dominant_layer][1])
            else:
                mascot = await read_legacy_mascot(self.db, user_id, graduated)
            if mascot is not None:
                lifecycle = "mascot" if ui and ui.mascot_reveal_seen_at else "reveal_pending"
        return utc_fields(
            {
                "lifecycle": lifecycle,
                "current_level": level,
                "cap6_graduated_at": graduated,
                "mascot_rules_version": RULES_VERSION,
                "mascot": mascot,
                "today_local": datetime.now(VN_TZ).date(),
                "timezone": str(VN_TZ),
                "ui_state": {
                    "last_seen_egg_level": ui.last_seen_egg_level if ui else None,
                    "egg_hatch_seen_at": ui.egg_hatch_seen_at if ui else None,
                    "reveal_seen_at": ui.mascot_reveal_seen_at if ui else None,
                    "greeted_local_date": ui.mascot_greeted_local_date if ui else None,
                    "last_animated_bot_run_id": ui.last_animated_bot_run_id if ui else None,
                },
                "bot_run": await self.bot_status(user_id, ui),
            }
        )

    async def ui_event(
        self,
        user_id: uuid.UUID,
        event: str,
        *,
        level: int | None = None,
        run_id: uuid.UUID | None = None,
        local_date: date | None = None,
    ) -> dict:
        await self.lock_user(user_id)
        state = await self.get(user_id)
        now = datetime.now(UTC)
        today = now.astimezone(VN_TZ).date()
        if local_date is not None and local_date != today:
            raise BadRequestError("Ngày hiển thị đã thay đổi; vui lòng tải lại")
        ui = await self.db.get(JourneyIdentityUI, user_id)
        if ui is None:
            ui = JourneyIdentityUI(user_id=user_id, updated_at=now)
            self.db.add(ui)
        if event == "level_seen":
            if level is None or not 0 <= level <= state["current_level"] <= 6:
                raise BadRequestError("Cấp hiển thị không hợp lệ")
            if ui.last_seen_egg_level is None or level > ui.last_seen_egg_level:
                ui.last_seen_egg_level, ui.last_seen_egg_level_at = level, now
        else:
            if state["mascot"] is None or not state["cap6_graduated_at"]:
                raise ConflictError("Linh thú chưa được xác định")
            if event == "hatch_seen":
                ui.egg_hatch_seen_at = ui.egg_hatch_seen_at or now
            elif event == "reveal_seen":
                if ui.egg_hatch_seen_at is None:
                    raise ConflictError("Chưa hoàn tất phần nở trứng")
                ui.mascot_reveal_seen_at = ui.mascot_reveal_seen_at or now
                ui.mascot_greeted_local_date = today
            elif event in ("greet_seen", "bot_run_updated_seen"):
                if ui.mascot_reveal_seen_at is None:
                    raise ConflictError("Chưa hoàn tất phần giới thiệu Linh thú")
                if event == "bot_run_updated_seen":
                    run = await self.db.get(BotRunReceipt, run_id) if run_id else None
                    if run is None or run.user_id != user_id or run.status != "succeeded":
                        raise BadRequestError("Phiên Bot chưa xử lý thành công")
                    old = (
                        await self.db.get(BotRunReceipt, ui.last_animated_bot_run_id)
                        if ui.last_animated_bot_run_id
                        else None
                    )
                    if old is None or run.trading_date > old.trading_date:
                        ui.last_animated_bot_run_id = run.id
                ui.mascot_greeted_local_date = today
            else:
                raise BadRequestError("Sự kiện hiển thị không hợp lệ")
        ui.updated_at = now
        await self.db.flush()
        return await self.get(user_id)

    async def create_dataset(self, user_id: uuid.UUID, symbol: str) -> dict:
        cap4 = (await self.db.execute(select(Cap4Progress).where(Cap4Progress.user_id == user_id))).scalar_one_or_none()
        if cap4 is None:
            raise ConflictError("Chưa vào Cấp 4")
        now = datetime.now(UTC)
        payload = await load_dataset(symbol, now.astimezone(VN_TZ))
        if payload.get("symbol") != symbol or any(
            payload.get(key) not in (None, symbol) for key in ("source_symbol", "valuation_source_symbol")
        ):
            logger.error(
                "journey_reading_symbol_mismatch",
                extra={
                    "requested_symbol": symbol,
                    "source_symbol": payload.get("source_symbol"),
                    "valuation_source_symbol": payload.get("valuation_source_symbol"),
                },
            )
            raise ConflictError("Nguồn dữ liệu đối chiếu không khớp mã đang đọc")
        session_date = (
            date.fromisoformat(payload["trading_date"]) if payload["trading_date"] else now.astimezone(VN_TZ).date()
        )
        existing = (
            await self.db.execute(
                select(JourneyReadingDataset)
                .join(JourneyAssessment, JourneyAssessment.dataset_id == JourneyReadingDataset.id)
                .where(
                    JourneyAssessment.user_id == user_id,
                    JourneyReadingDataset.user_id == user_id,
                    JourneyAssessment.symbol == symbol,
                    JourneyAssessment.trading_date == session_date,
                )
            )
        ).scalar_one_or_none()
        if existing:
            if (
                existing.symbol != symbol
                or existing.trading_date != session_date
                or digest(existing.payload) != existing.dataset_hash
            ):
                raise ConflictError("Bộ dữ liệu đối chiếu cần được kiểm tra")
            return {
                "id": existing.id,
                "symbol": symbol,
                "trading_date": session_date,
                "readings": existing.payload["readings"],
                "price": existing.payload["price"],
            }
        dataset = JourneyReadingDataset(
            user_id=user_id,
            symbol=symbol,
            trading_date=session_date,
            created_at=now,
            payload=payload,
            dataset_hash=digest(payload),
        )
        self.db.add(dataset)
        await self.db.flush()
        return {
            "id": dataset.id,
            "symbol": symbol,
            "trading_date": session_date,
            "readings": payload["readings"],
            "price": payload["price"],
        }

    async def submit(self, user_id: uuid.UUID, dataset_id: uuid.UUID, answers: dict) -> dict:
        if not complete_map(answers):
            raise BadRequestError("Cần tự chấm đủ 5 lớp")
        await self.lock_user(user_id)
        dataset = await self.db.get(JourneyReadingDataset, dataset_id)
        if dataset is None or dataset.user_id != user_id:
            raise NotFoundError("bộ dữ liệu")
        if digest(dataset.payload) != dataset.dataset_hash:
            raise ConflictError("Bộ dữ liệu đối chiếu cần được kiểm tra")
        row = (
            await self.db.execute(
                select(JourneyAssessment).where(
                    JourneyAssessment.user_id == user_id,
                    JourneyAssessment.symbol == dataset.symbol,
                    JourneyAssessment.trading_date == dataset.trading_date,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            row = JourneyAssessment(
                user_id=user_id,
                dataset_id=dataset.id,
                symbol=dataset.symbol,
                trading_date=dataset.trading_date,
                completed_at=datetime.now(UTC),
                answers=answers,
                # This endpoint records the signed-in user's own manual answer.
                # Account privileges do not turn an ordinary learning action
                # into an administrative import/seed record.
                source="learning",
            )
            self.db.add(row)
            await self.db.flush()
        # Explicit commit is necessary: no answer bytes leave this transaction.
        await self.db.commit()
        return {"id": row.id, "dataset_id": row.dataset_id}

    async def reveal(self, user_id: uuid.UUID, assessment_id: uuid.UUID) -> dict:
        await self.lock_user(user_id)
        row = await self.db.get(JourneyAssessment, assessment_id)
        if row is None or row.user_id != user_id:
            raise NotFoundError("bản tự chấm")
        dataset = await self.db.get(JourneyReadingDataset, row.dataset_id)
        if (
            dataset is None
            or dataset.user_id != user_id
            or dataset.symbol != row.symbol
            or dataset.trading_date != row.trading_date
            or digest(dataset.payload) != dataset.dataset_hash
        ):
            raise ConflictError("Bộ dữ liệu đối chiếu cần được kiểm tra")
        row.revealed_at = row.revealed_at or datetime.now(UTC)
        await self.db.commit()
        return {
            "id": row.id,
            "dataset_id": row.dataset_id,
            "ai_answers": dataset.payload["ai_answers"],
            "readings": dataset.payload["readings"],
            "first_answers": row.answers,
        }
