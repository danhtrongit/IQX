"""add_premium_to_user_role_enum

Revision ID: 83fe4c37a788
Revises: 8823d69d4667
Create Date: 2026-05-21 10:27:03.567405

The ``user_role`` Postgres enum was originally created with only
``('admin', 'user')`` but the ORM model ``UserRole`` (StrEnum) declares
``PREMIUM = 'premium'`` as well. Without this value, UPDATE statements
that set ``users.role = 'premium'`` fail on Postgres. SQLite tests don't
catch this because SQLite stores enums as VARCHAR without constraint.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "83fe4c37a788"
down_revision: Union[str, None] = "8823d69d4667"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block on
    # some Postgres setups; COMMIT first, then issue the change.
    op.execute("COMMIT")
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'premium'")


def downgrade() -> None:
    # Postgres does not support removing a value from an enum.
    pass
