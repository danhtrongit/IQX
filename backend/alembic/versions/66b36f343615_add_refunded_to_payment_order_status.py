"""add_refunded_to_payment_order_status

Revision ID: 66b36f343615
Revises: 8095374275be
Create Date: 2026-05-21 15:12:39.901586

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '66b36f343615'
down_revision: Union[str, None] = '8095374275be'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction on Postgres.
    op.execute("COMMIT")
    op.execute("ALTER TYPE payment_order_status ADD VALUE IF NOT EXISTS 'refunded'")


def downgrade() -> None:
    # Postgres does not support removing enum values.
    pass
