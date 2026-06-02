"""add_subscription_cancelled_fields

Revision ID: 8095374275be
Revises: 8556b49b7203
Create Date: 2026-05-21 15:12:23.167818

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8095374275be'
down_revision: Union[str, None] = '8556b49b7203'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "premium_subscriptions",
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "premium_subscriptions",
        sa.Column("cancelled_by_user_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "premium_subscriptions",
        sa.Column("cancel_reason", sa.String(length=1000), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_premium_subscriptions_cancelled_by_user_id_users"),
        "premium_subscriptions",
        "users",
        ["cancelled_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_premium_subscriptions_cancelled_by_user_id_users"),
        "premium_subscriptions",
        type_="foreignkey",
    )
    op.drop_column("premium_subscriptions", "cancel_reason")
    op.drop_column("premium_subscriptions", "cancelled_by_user_id")
    op.drop_column("premium_subscriptions", "cancelled_at")
