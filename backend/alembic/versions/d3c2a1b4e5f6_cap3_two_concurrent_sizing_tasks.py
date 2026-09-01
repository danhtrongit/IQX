"""cap3 — replace legacy challenge with two concurrent sizing-confidence tasks.

Revision ID: d3c2a1b4e5f6
Revises: 9c3f7ad10b52
Create Date: 2026-09-01 00:00:00.000000

The old task stamps represented a first mechanism plan, first closeout, and a
profit/discipline challenge. None proves the new 10-plan or three-confidence
requirements, so upgrade clears both retained task slots before dropping the
third. Graduation history and all non-gating analytics remain untouched.

Downgrade is intentionally lossy: it restores the old third column but every
obsolete task stamp is NULL. Original timestamps cannot be reconstructed.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d3c2a1b4e5f6"
down_revision: Union[str, None] = "9c3f7ad10b52"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE cap3_progress "
            "SET task_1_done_at = NULL, task_2_done_at = NULL"
        )
    )
    op.drop_column("cap3_progress", "task_3_done_at")


def downgrade() -> None:
    op.add_column(
        "cap3_progress",
        sa.Column("task_3_done_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        sa.text(
            "UPDATE cap3_progress "
            "SET task_1_done_at = NULL, task_2_done_at = NULL, task_3_done_at = NULL"
        )
    )
