"""add_watchlist_items_table

Revision ID: c1d2e3f4a5b6
Revises: 3819c1575feb
Create Date: 2026-06-10 20:38:00.000000

Creates the ``watchlist_items`` table backing the WatchlistItem model. The
feature (model + repository + endpoints) shipped without a matching migration,
so ``GET /api/v1/watchlist`` failed with 500 (relation does not exist) on any
Alembic-migrated database.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "3819c1575feb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "watchlist_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_watchlist_items")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_watchlist_items_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", "symbol", name="uq_watchlist_items_user_symbol"),
    )
    op.create_index(
        op.f("ix_watchlist_items_user_id"), "watchlist_items", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_watchlist_items_symbol"), "watchlist_items", ["symbol"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_watchlist_items_symbol"), table_name="watchlist_items")
    op.drop_index(op.f("ix_watchlist_items_user_id"), table_name="watchlist_items")
    op.drop_table("watchlist_items")
