"""snapshot position quantities on filled SELL orders.

Revision ID: a6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-09-01 00:00:00.000000

Exit evidence can be recorded after later orders settle, so it must use the
position quantities captured under the execution lock rather than live state.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a6b7c8d9e0f1"
down_revision: Union[str, None] = "f5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "virtual_orders",
        sa.Column("position_quantity_before_fill", sa.Integer(), nullable=True),
    )
    op.add_column(
        "virtual_orders",
        sa.Column("position_quantity_after_fill", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("virtual_orders", "position_quantity_after_fill")
    op.drop_column("virtual_orders", "position_quantity_before_fill")
