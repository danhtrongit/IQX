"""merge first_name + last_name into single full_name column

Revision ID: 3819c1575feb
Revises: bce6d181d7bd
Create Date: 2026-05-27 14:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3819c1575feb"
down_revision: Union[str, None] = "bce6d181d7bd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add full_name nullable so we can backfill before enforcing NOT NULL.
    op.add_column("users", sa.Column("full_name", sa.String(length=200), nullable=True))

    # 2. Backfill from the existing two columns.
    op.execute(
        "UPDATE users "
        "SET full_name = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))"
    )
    # Anyone left blank (e.g. legacy rows with both empty) becomes "Unknown" so
    # the NOT NULL constraint below doesn't fail.
    op.execute("UPDATE users SET full_name = 'Unknown' WHERE full_name IS NULL OR full_name = ''")

    # 3. Enforce NOT NULL on full_name now that everyone is populated.
    op.alter_column("users", "full_name", nullable=False)

    # 4. Drop the legacy columns.
    op.drop_column("users", "first_name")
    op.drop_column("users", "last_name")


def downgrade() -> None:
    # Restore the two-column shape. Best-effort split: everything before the
    # last space becomes first_name, the rest is last_name. Empty rows get
    # "Unknown"/"" so the NOT NULL constraint holds.
    op.add_column(
        "users",
        sa.Column("first_name", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("last_name", sa.String(length=100), nullable=True),
    )

    op.execute(
        """
        UPDATE users
        SET
          first_name = CASE
            WHEN POSITION(' ' IN COALESCE(full_name, '')) > 0
              THEN TRIM(SUBSTRING(full_name FROM 1 FOR POSITION(' ' IN full_name) - 1))
            ELSE COALESCE(NULLIF(TRIM(full_name), ''), 'Unknown')
          END,
          last_name = CASE
            WHEN POSITION(' ' IN COALESCE(full_name, '')) > 0
              THEN TRIM(SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1))
            ELSE ''
          END
        """
    )

    op.alter_column("users", "first_name", nullable=False)
    op.alter_column("users", "last_name", nullable=False)
    op.drop_column("users", "full_name")
