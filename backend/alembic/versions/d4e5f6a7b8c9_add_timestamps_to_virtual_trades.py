"""add_timestamps_to_virtual_trades

Revision ID: d4e5f6a7b8c9
Revises: c1d2e3f4a5b6
Create Date: 2026-06-10 20:44:00.000000

The VirtualTrade model uses TimestampMixin (created_at / updated_at), but the
table-creation migration (218cd5d6ac36) omitted both columns. Inserting a trade
during order placement therefore failed with ``column does not exist`` → 500 on
POST /api/v1/virtual-trading/orders. This adds the two missing columns to match
the model and the sibling virtual_settlements table.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "virtual_trades",
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.add_column(
        "virtual_trades",
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("virtual_trades", "updated_at")
    op.drop_column("virtual_trades", "created_at")
