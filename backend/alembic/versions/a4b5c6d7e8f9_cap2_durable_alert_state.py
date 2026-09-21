"""Persist the Cấp 2 discipline-alert lifecycle.

Revision ID: a4b5c6d7e8f9
Revises: f3b4c5d6e7f8
"""

import sqlalchemy as sa

from alembic import op

revision = "a4b5c6d7e8f9"
down_revision = "f3b4c5d6e7f8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "cap2_alert_events",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("alert_type", sa.String(length=20), nullable=False),
        sa.Column("symbol", sa.String(length=10), nullable=False),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("trigger_key", sa.String(length=180), nullable=False),
        sa.Column("source_order_id", sa.Uuid(), nullable=True),
        sa.Column("source_plan_order_id", sa.Uuid(), nullable=True),
        sa.Column("observed_price_vnd", sa.BigInteger(), nullable=False),
        sa.Column("threshold_price_vnd", sa.BigInteger(), nullable=True),
        sa.Column("loss_pct", sa.Float(), nullable=True),
        sa.Column("position_quantity", sa.Integer(), nullable=True),
        sa.Column("position_avg_cost_vnd", sa.BigInteger(), nullable=True),
        sa.Column("plan_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("official_close_session_date", sa.Date(), nullable=True),
        sa.Column("official_close_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("official_close_source", sa.String(length=80), nullable=True),
        sa.Column("breach_session_no", sa.Integer(), server_default="1", nullable=False),
        sa.Column("status", sa.String(length=16), server_default="pending", nullable=False),
        sa.Column("suppression_reason", sa.String(length=40), nullable=True),
        sa.Column("escalation", sa.String(length=20), nullable=True),
        sa.Column("impression_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("first_shown_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_shown_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("action", sa.String(length=20), nullable=True),
        sa.Column("acted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "alert_type IN ('nhoi_lenh', 'cham_cat_lo')",
            name="cap2_alert_event_type",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'shown', 'suppressed', 'acted')",
            name="cap2_alert_event_status",
        ),
        sa.CheckConstraint(
            "escalation IS NULL OR escalation IN ('normal', 'delay_5s', 'type_phrase')",
            name="cap2_alert_event_escalation",
        ),
        sa.CheckConstraint(
            "action IS NULL OR action IN "
            "('cancel_buy', 'proceed_buy', 'sell_ato', 'hold', 'position_closed')",
            name="cap2_alert_event_action",
        ),
        sa.CheckConstraint(
            "impression_count >= 0", name="cap2_alert_event_impressions_nonnegative"
        ),
        sa.CheckConstraint(
            "breach_session_no >= 1", name="cap2_alert_event_breach_session_positive"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["source_order_id"], ["virtual_orders.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["source_plan_order_id"], ["virtual_orders.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "alert_type",
            "trigger_key",
            name="uq_cap2_alert_events_user_type_trigger",
        ),
    )
    op.create_index("ix_cap2_alert_events_user_id", "cap2_alert_events", ["user_id"])
    op.create_index("ix_cap2_alert_events_symbol", "cap2_alert_events", ["symbol"])
    op.create_index(
        "ix_cap2_alert_events_session_date", "cap2_alert_events", ["session_date"]
    )
    op.create_index(
        "ix_cap2_alert_events_user_session_status",
        "cap2_alert_events",
        ["user_id", "session_date", "status"],
    )
    op.create_index(
        "ix_cap2_alert_events_user_type_acted",
        "cap2_alert_events",
        ["user_id", "alert_type", "acted_at"],
    )

    op.create_table(
        "cap2_alert_type_state",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("alert_type", sa.String(length=20), nullable=False),
        sa.Column("ignored_streak", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_ignored_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_respected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "alert_type IN ('nhoi_lenh', 'cham_cat_lo')",
            name="cap2_alert_type_state_type",
        ),
        sa.CheckConstraint(
            "ignored_streak >= 0", name="cap2_alert_type_state_streak_nonnegative"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "alert_type", name="uq_cap2_alert_type_state_user_type"
        ),
    )
    op.create_index(
        "ix_cap2_alert_type_state_user_id", "cap2_alert_type_state", ["user_id"]
    )

    op.create_table(
        "cap2_alert_session_state",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column(
            "important_shown_count", sa.Integer(), server_default="0", nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "important_shown_count >= 0 AND important_shown_count <= 2",
            name="cap2_alert_session_state_count_range",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "session_date", name="uq_cap2_alert_session_state_user_date"
        ),
    )
    op.create_index(
        "ix_cap2_alert_session_state_user_id",
        "cap2_alert_session_state",
        ["user_id"],
    )
    op.create_index(
        "ix_cap2_alert_session_state_session_date",
        "cap2_alert_session_state",
        ["session_date"],
    )

    op.create_table(
        "cap2_alert_impressions",
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("escalation", sa.String(length=20), nullable=False),
        sa.Column("shown_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "escalation IN ('normal', 'delay_5s', 'type_phrase')",
            name="cap2_alert_impression_escalation",
        ),
        sa.ForeignKeyConstraint(
            ["event_id"], ["cap2_alert_events.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "event_id",
            "session_date",
            name="uq_cap2_alert_impressions_event_date",
        ),
    )
    op.create_index(
        "ix_cap2_alert_impressions_event_id", "cap2_alert_impressions", ["event_id"]
    )
    op.create_index(
        "ix_cap2_alert_impressions_user_id", "cap2_alert_impressions", ["user_id"]
    )
    op.create_index(
        "ix_cap2_alert_impressions_user_session",
        "cap2_alert_impressions",
        ["user_id", "session_date"],
    )


def downgrade():
    op.drop_index(
        "ix_cap2_alert_impressions_user_session",
        table_name="cap2_alert_impressions",
    )
    op.drop_index(
        "ix_cap2_alert_impressions_user_id", table_name="cap2_alert_impressions"
    )
    op.drop_index(
        "ix_cap2_alert_impressions_event_id", table_name="cap2_alert_impressions"
    )
    op.drop_table("cap2_alert_impressions")

    op.drop_index(
        "ix_cap2_alert_session_state_session_date",
        table_name="cap2_alert_session_state",
    )
    op.drop_index(
        "ix_cap2_alert_session_state_user_id",
        table_name="cap2_alert_session_state",
    )
    op.drop_table("cap2_alert_session_state")

    op.drop_index(
        "ix_cap2_alert_type_state_user_id", table_name="cap2_alert_type_state"
    )
    op.drop_table("cap2_alert_type_state")

    op.drop_index(
        "ix_cap2_alert_events_user_type_acted", table_name="cap2_alert_events"
    )
    op.drop_index(
        "ix_cap2_alert_events_user_session_status", table_name="cap2_alert_events"
    )
    op.drop_index("ix_cap2_alert_events_session_date", table_name="cap2_alert_events")
    op.drop_index("ix_cap2_alert_events_symbol", table_name="cap2_alert_events")
    op.drop_index("ix_cap2_alert_events_user_id", table_name="cap2_alert_events")
    op.drop_table("cap2_alert_events")
