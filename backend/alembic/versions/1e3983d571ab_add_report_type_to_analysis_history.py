"""add report_type to analysis_history

Revision ID: 1e3983d571ab
Revises: d7e8f9a0b1c2
Create Date: 2026-07-02 06:38:38.843808

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1e3983d571ab'
down_revision: Union[str, None] = 'd7e8f9a0b1c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("analysis_history", sa.Column("report_type", sa.String(16), nullable=False, server_default="daily"))
    op.create_index(op.f("ix_analysis_history_report_type"), "analysis_history", ["report_type"])
    # align the DB schema with the model's generated_at server_default (closes model/DB drift)
    op.alter_column("analysis_history", "generated_at", server_default=sa.text("now()"))
    # swap the session_date-only unique for a composite unique
    # The original constraint was created as op.f("uq_analysis_history_session_date") in b8c9d0e1f2a3
    op.drop_constraint("uq_analysis_history_session_date", "analysis_history", type_="unique")
    op.create_unique_constraint("uq_analysis_session_date_report_type", "analysis_history", ["session_date", "report_type"])


def downgrade() -> None:
    op.drop_constraint("uq_analysis_session_date_report_type", "analysis_history", type_="unique")
    op.create_unique_constraint("uq_analysis_history_session_date", "analysis_history", ["session_date"])
    op.alter_column("analysis_history", "generated_at", server_default=None)
    op.drop_index(op.f("ix_analysis_history_report_type"), table_name="analysis_history")
    op.drop_column("analysis_history", "report_type")
