"""add_chart_drawings_table

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-16 14:40:00.000000

Creates the ``chart_drawings`` table backing the ChartDrawing model — one row
per (user, symbol) holding the serialized TradingView line-tool state so chart
drawings survive a page refresh and sync across the user's devices.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chart_drawings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("state", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chart_drawings")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_chart_drawings_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", "symbol", name="uq_chart_drawings_user_symbol"),
    )
    op.create_index(
        op.f("ix_chart_drawings_user_id"), "chart_drawings", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_chart_drawings_symbol"), "chart_drawings", ["symbol"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_chart_drawings_symbol"), table_name="chart_drawings")
    op.drop_index(op.f("ix_chart_drawings_user_id"), table_name="chart_drawings")
    op.drop_table("chart_drawings")
