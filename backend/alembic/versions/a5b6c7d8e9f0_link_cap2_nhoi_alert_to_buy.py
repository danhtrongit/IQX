"""Link an averaging-down alert to the exact accepted BUY draft.

Revision ID: a5b6c7d8e9f0
Revises: a4b5c6d7e8f9
"""

import sqlalchemy as sa

from alembic import op

revision = "a5b6c7d8e9f0"
down_revision = "a4b5c6d7e8f9"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "cap2_alert_events", sa.Column("intended_quantity", sa.Integer(), nullable=True)
    )
    op.add_column(
        "cap2_alert_events",
        sa.Column("intended_order_type", sa.String(length=10), nullable=True),
    )
    op.add_column(
        "cap2_alert_events",
        sa.Column("intended_limit_price_vnd", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "cap2_alert_events",
        sa.Column("violation_confirmed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "cap2_alert_event_draft_shape",
        "cap2_alert_events",
        "(intended_quantity IS NULL AND intended_order_type IS NULL "
        "AND intended_limit_price_vnd IS NULL) OR "
        "(intended_quantity IS NOT NULL AND intended_quantity > 0 "
        "AND intended_order_type IS NOT NULL AND "
        "((intended_order_type = 'market' AND intended_limit_price_vnd IS NULL) OR "
        "(intended_order_type = 'limit' AND intended_limit_price_vnd IS NOT NULL "
        "AND intended_limit_price_vnd > 0)))",
    )


def downgrade():
    op.drop_constraint(
        "cap2_alert_event_draft_shape", "cap2_alert_events", type_="check"
    )
    op.drop_column("cap2_alert_events", "violation_confirmed_at")
    op.drop_column("cap2_alert_events", "intended_limit_price_vnd")
    op.drop_column("cap2_alert_events", "intended_order_type")
    op.drop_column("cap2_alert_events", "intended_quantity")
