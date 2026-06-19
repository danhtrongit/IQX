"""add_market_analysis_tables

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-06-19 12:00:00.000000

Adds the daily VN-Index market-analysis persistence + memory tables:
analysis_history (one published article per session_date) and analysis_claims
(verifiable scenario claims tracked across sessions for continuity).

The spec's embedding VECTOR(1536) column is intentionally omitted in v1
(pgvector not installed; pattern search disabled).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "analysis_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("public_id", sa.String(length=50), nullable=False),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("session_type", sa.String(length=30), nullable=False),
        sa.Column("headline", sa.Text(), nullable=False),
        sa.Column("tagline", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("paragraphs", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("scenarios", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("watchlist", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("unexplained", sa.Text(), nullable=True),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_published", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_analysis_history")),
        sa.UniqueConstraint("public_id", name=op.f("uq_analysis_history_public_id")),
        sa.UniqueConstraint("session_date", name=op.f("uq_analysis_history_session_date")),
    )
    op.create_index(
        op.f("ix_analysis_history_session_date"), "analysis_history", ["session_date"], unique=False,
    )
    op.create_index(
        op.f("ix_analysis_history_session_type"), "analysis_history", ["session_type"], unique=False,
    )

    op.create_table(
        "analysis_claims",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("analysis_id", sa.Uuid(), nullable=False),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("claim_text", sa.Text(), nullable=False),
        sa.Column("claim_type", sa.String(length=30), nullable=False),
        sa.Column("conditions", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("predicted_outcome", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verification_note", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_analysis_claims")),
        sa.ForeignKeyConstraint(
            ["analysis_id"], ["analysis_history.id"],
            name=op.f("fk_analysis_claims_analysis_id_analysis_history"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        op.f("ix_analysis_claims_analysis_id"), "analysis_claims", ["analysis_id"], unique=False,
    )
    op.create_index(
        op.f("ix_analysis_claims_session_date"), "analysis_claims", ["session_date"], unique=False,
    )
    op.create_index(
        "ix_analysis_claims_status_date", "analysis_claims", ["status", "session_date"], unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_analysis_claims_status_date", table_name="analysis_claims")
    op.drop_index(op.f("ix_analysis_claims_session_date"), table_name="analysis_claims")
    op.drop_index(op.f("ix_analysis_claims_analysis_id"), table_name="analysis_claims")
    op.drop_table("analysis_claims")
    op.drop_index(op.f("ix_analysis_history_session_type"), table_name="analysis_history")
    op.drop_index(op.f("ix_analysis_history_session_date"), table_name="analysis_history")
    op.drop_table("analysis_history")
