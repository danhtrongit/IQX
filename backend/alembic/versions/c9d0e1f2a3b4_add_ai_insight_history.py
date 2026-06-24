"""add_ai_insight_history

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-06-24 00:00:00.000000

Adds ai_insight_history table: per-symbol per-session-date AI insight
payload stored as JSONB, with a unique constraint on (symbol, session_date).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_insight_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("symbol", sa.String(length=10), nullable=False),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_insight_history")),
        sa.UniqueConstraint("symbol", "session_date", name="uq_ai_insight_symbol_date"),
    )
    op.create_index(
        op.f("ix_ai_insight_history_symbol"), "ai_insight_history", ["symbol"], unique=False,
    )
    op.create_index(
        op.f("ix_ai_insight_history_session_date"), "ai_insight_history", ["session_date"], unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_ai_insight_history_session_date"), table_name="ai_insight_history")
    op.drop_index(op.f("ix_ai_insight_history_symbol"), table_name="ai_insight_history")
    op.drop_table("ai_insight_history")
