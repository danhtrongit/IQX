"""add_account_freeze_and_login_history

Revision ID: 97f9d297c95e
Revises: d390a8737111
Create Date: 2026-05-21 15:13:20.253891

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '97f9d297c95e'
down_revision: Union[str, None] = 'd390a8737111'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. virtual_trading_accounts: freeze fields
    op.add_column(
        "virtual_trading_accounts",
        sa.Column("frozen_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "virtual_trading_accounts",
        sa.Column("frozen_by_user_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "virtual_trading_accounts",
        sa.Column("freeze_reason", sa.String(length=1000), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_virtual_trading_accounts_frozen_by_user_id_users"),
        "virtual_trading_accounts",
        "users",
        ["frozen_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # 2. user_login_history table
    op.create_table(
        "user_login_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("failure_reason", sa.String(length=200), nullable=True),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column(
            "login_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_user_login_history_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_login_history")),
    )
    op.create_index(op.f("ix_user_login_history_user_id"), "user_login_history", ["user_id"])
    op.create_index(op.f("ix_user_login_history_email"), "user_login_history", ["email"])
    op.create_index(op.f("ix_user_login_history_success"), "user_login_history", ["success"])
    op.create_index(op.f("ix_user_login_history_login_at"), "user_login_history", ["login_at"])
    op.create_index("ix_user_login_history_user_login", "user_login_history", ["user_id", "login_at"])


def downgrade() -> None:
    op.drop_index("ix_user_login_history_user_login", table_name="user_login_history")
    op.drop_index(op.f("ix_user_login_history_login_at"), table_name="user_login_history")
    op.drop_index(op.f("ix_user_login_history_success"), table_name="user_login_history")
    op.drop_index(op.f("ix_user_login_history_email"), table_name="user_login_history")
    op.drop_index(op.f("ix_user_login_history_user_id"), table_name="user_login_history")
    op.drop_table("user_login_history")

    op.drop_constraint(
        op.f("fk_virtual_trading_accounts_frozen_by_user_id_users"),
        "virtual_trading_accounts",
        type_="foreignkey",
    )
    op.drop_column("virtual_trading_accounts", "freeze_reason")
    op.drop_column("virtual_trading_accounts", "frozen_by_user_id")
    op.drop_column("virtual_trading_accounts", "frozen_at")
