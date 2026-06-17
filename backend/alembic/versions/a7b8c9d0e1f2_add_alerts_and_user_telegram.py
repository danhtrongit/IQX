"""add_alerts_and_user_telegram

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-17 10:00:00.000000

Adds the alert system tables (alert_signals, user_alert_rules, alert_events) and
the User.telegram_chat_id / telegram_linked_at columns for Telegram delivery.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_side = sa.Enum("buy", "sell", name="alert_side")


def upgrade() -> None:
    # User telegram columns
    op.add_column("users", sa.Column("telegram_chat_id", sa.String(length=32), nullable=True))
    op.add_column("users", sa.Column("telegram_linked_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f("ix_users_telegram_chat_id"), "users", ["telegram_chat_id"], unique=True)

    bind = op.get_bind()
    _side.create(bind, checkfirst=True)

    # alert_signals
    op.create_table(
        "alert_signals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("key", sa.String(length=40), nullable=False),
        sa.Column("side", _side, nullable=False),
        sa.Column("ta_name", sa.String(length=60), nullable=False),
        sa.Column("message_title", sa.String(length=200), nullable=False),
        sa.Column("combination", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_alert_signals")),
    )
    op.create_index(op.f("ix_alert_signals_key"), "alert_signals", ["key"], unique=True)

    # user_alert_rules
    op.create_table(
        "user_alert_rules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("side", _side, nullable=False),
        sa.Column("base_signal_key", sa.String(length=40), nullable=True),
        sa.Column("combination", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_alert_rules")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_user_alert_rules_user_id_users"), ondelete="CASCADE",
        ),
    )
    op.create_index(op.f("ix_user_alert_rules_user_id"), "user_alert_rules", ["user_id"], unique=False)

    # alert_events
    op.create_table(
        "alert_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("rule_id", sa.Uuid(), nullable=False),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("signal_key", sa.String(length=40), nullable=True),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("fired_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("price", sa.Numeric(18, 4), nullable=True),
        sa.Column("delivered", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("delivery_error", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_alert_events")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_alert_events_user_id_users"), ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["rule_id"], ["user_alert_rules.id"], name=op.f("fk_alert_events_rule_id"), ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "user_id", "rule_id", "symbol", "session_date", name="uq_alert_events_user_rule_symbol_date",
        ),
    )
    op.create_index(op.f("ix_alert_events_user_id"), "alert_events", ["user_id"], unique=False)
    op.create_index(op.f("ix_alert_events_rule_id"), "alert_events", ["rule_id"], unique=False)
    op.create_index(op.f("ix_alert_events_symbol"), "alert_events", ["symbol"], unique=False)


def downgrade() -> None:
    op.drop_table("alert_events")
    op.drop_index(op.f("ix_user_alert_rules_user_id"), table_name="user_alert_rules")
    op.drop_table("user_alert_rules")
    op.drop_index(op.f("ix_alert_signals_key"), table_name="alert_signals")
    op.drop_table("alert_signals")
    op.drop_index(op.f("ix_users_telegram_chat_id"), table_name="users")
    op.drop_column("users", "telegram_linked_at")
    op.drop_column("users", "telegram_chat_id")
    _side.drop(op.get_bind(), checkfirst=True)
