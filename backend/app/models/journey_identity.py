"""Immutable learning evidence and presentation milestones, separate from trading."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import JSON, CheckConstraint, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDMixin


class JourneyReadingDataset(UUIDMixin, Base):
    __tablename__ = "journey_reading_datasets"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    symbol: Mapped[str] = mapped_column(String(10))
    trading_date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    dataset_hash: Mapped[str] = mapped_column(String(64))
    # Never return this wholesale: it contains the unrevealed AI snapshot.
    payload: Mapped[dict] = mapped_column(JSON)


class JourneyAssessment(UUIDMixin, Base):
    __tablename__ = "journey_assessments"
    __table_args__ = (UniqueConstraint("user_id", "symbol", "trading_date"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("journey_reading_datasets.id"))
    symbol: Mapped[str] = mapped_column(String(10))
    trading_date: Mapped[date] = mapped_column(Date)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    answers: Mapped[dict] = mapped_column(JSON)
    source: Mapped[str] = mapped_column(String(24), default="learning")
    mode: Mapped[str] = mapped_column(String(24), default="thuc_chien")
    record_status: Mapped[str] = mapped_column(String(24), default="valid")
    # Separate HTTP transaction reads a committed submission before returning AI.
    # This protocol is the ordering proof even when clock timestamps are equal.
    proof_version: Mapped[str] = mapped_column(String(32), default="commit_then_reveal_v1")
    revealed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BotMascotProfile(UUIDMixin, Base):
    __tablename__ = "bot_mascot_profiles"
    __table_args__ = (
        UniqueConstraint("user_id", "mascot_rules_version"),
        CheckConstraint("valid_pair_count >= 0", name="valid_pair_count"),
        CheckConstraint("mascot_rules_version > 0", name="rules_version"),
        CheckConstraint("assignment_status IN ('assigned', 'pending_data_repair')", name="assignment_status"),
        CheckConstraint(
            "mascot_id IS NULL OR mascot_id IN "
            "('bach_ho', 'thanh_long', 'loc_huou', 'phung_hoang', 'kim_quy')",
            name="mascot_id",
        ),
        CheckConstraint(
            "dominant_layer IS NULL OR dominant_layer IN "
            "('ky_thuat', 'dong_tien', 'noi_bo', 'tin_tuc', 'dinh_gia')",
            name="dominant_layer",
        ),
        CheckConstraint(
            "assignment_basis IS NULL OR assignment_basis IN "
            "('ai_match_count', 'stable_tie_break', 'zero_match_tie_break')",
            name="assignment_basis",
        ),
        CheckConstraint("window_start IS NULL OR window_start <= window_end", name="window_order"),
        CheckConstraint(
            "(assignment_status = 'assigned' AND valid_pair_count > 0 "
            "AND mascot_id IS NOT NULL AND dominant_layer IS NOT NULL "
            "AND assignment_basis IS NOT NULL AND window_start IS NOT NULL AND assigned_at IS NOT NULL) "
            "OR (assignment_status = 'pending_data_repair' AND valid_pair_count = 0 "
            "AND mascot_id IS NULL AND dominant_layer IS NULL "
            "AND assignment_basis IS NULL AND assigned_at IS NULL)",
            name="assignment_shape",
        ),
        CheckConstraint("assigned_at IS NULL OR assigned_at >= window_end", name="assigned_after_window"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    mascot_rules_version: Mapped[int] = mapped_column(Integer, default=1)
    assignment_status: Mapped[str] = mapped_column(String(32))
    mascot_id: Mapped[str | None] = mapped_column(String(24))
    dominant_layer: Mapped[str | None] = mapped_column(String(24))
    assignment_basis: Mapped[str | None] = mapped_column(String(32))
    window_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    window_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    valid_pair_count: Mapped[int] = mapped_column(Integer, default=0)
    match_counts: Mapped[dict] = mapped_column(JSON)
    tied_layers: Mapped[list] = mapped_column(JSON)
    selected_assessment_refs: Mapped[list] = mapped_column(JSON)
    dataset_hash: Mapped[str] = mapped_column(String(64))
    excluded_records_summary: Mapped[dict] = mapped_column(JSON)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class JourneyIdentityUI(Base):
    __tablename__ = "journey_identity_ui"
    __table_args__ = (
        CheckConstraint("last_seen_egg_level IS NULL OR last_seen_egg_level BETWEEN 0 AND 6", name="egg_level"),
        CheckConstraint("mascot_reveal_seen_at IS NULL OR egg_hatch_seen_at IS NOT NULL", name="hatch_before_reveal"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    last_seen_egg_level: Mapped[int | None] = mapped_column(Integer)
    last_seen_egg_level_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    egg_hatch_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    mascot_reveal_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    mascot_greeted_local_date: Mapped[date | None] = mapped_column(Date)
    last_animated_bot_run_id: Mapped[uuid.UUID | None] = mapped_column()
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
