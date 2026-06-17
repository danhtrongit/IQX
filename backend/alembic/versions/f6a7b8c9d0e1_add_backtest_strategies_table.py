"""add_backtest_strategies_table

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-17 09:00:00.000000

Creates the ``backtest_strategies`` table — one row per (user, name) holding a
saved backtester configuration (buy/sell factor selections + risk config).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "backtest_strategies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("symbol", sa.String(length=20), nullable=True),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_backtest_strategies")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_backtest_strategies_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", "name", name="uq_backtest_strategies_user_name"),
    )
    op.create_index(
        op.f("ix_backtest_strategies_user_id"), "backtest_strategies", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_backtest_strategies_symbol"), "backtest_strategies", ["symbol"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_backtest_strategies_symbol"), table_name="backtest_strategies")
    op.drop_index(op.f("ix_backtest_strategies_user_id"), table_name="backtest_strategies")
    op.drop_table("backtest_strategies")
