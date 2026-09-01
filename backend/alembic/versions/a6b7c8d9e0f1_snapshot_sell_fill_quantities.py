"""snapshot immutable SELL execution evidence.

Revision ID: a6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-09-01 00:00:00.000000

Exit evidence can be recorded after later orders settle, so it must use the
quantity, governing plan, and cost captured under the execution lock.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a6b7c8d9e0f1"
down_revision: Union[str, None] = "f5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "virtual_orders",
        sa.Column("position_quantity_before_fill", sa.Integer(), nullable=True),
    )
    op.add_column(
        "virtual_orders",
        sa.Column("position_quantity_after_fill", sa.Integer(), nullable=True),
    )
    op.add_column(
        "virtual_orders",
        sa.Column("exit_snapshot_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "virtual_orders",
        sa.Column("exit_matched_buy_order_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_virtual_orders_exit_matched_buy_order",
        "virtual_orders",
        "virtual_orders",
        ["exit_matched_buy_order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column("virtual_orders", sa.Column("exit_original_stop_vnd", sa.BigInteger(), nullable=True))
    op.add_column("virtual_orders", sa.Column("exit_original_take_profit_vnd", sa.BigInteger(), nullable=True))
    op.add_column("virtual_orders", sa.Column("exit_dynamic_stop_vnd", sa.BigInteger(), nullable=True))
    op.add_column(
        "virtual_orders",
        sa.Column("exit_dynamic_stop_set_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("virtual_orders", sa.Column("exit_avg_cost_vnd", sa.BigInteger(), nullable=True))
    op.add_column(
        "virtual_orders",
        sa.Column("exit_plan_activated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("virtual_orders", "exit_plan_activated_at")
    op.drop_column("virtual_orders", "exit_avg_cost_vnd")
    op.drop_column("virtual_orders", "exit_dynamic_stop_set_at")
    op.drop_column("virtual_orders", "exit_dynamic_stop_vnd")
    op.drop_column("virtual_orders", "exit_original_take_profit_vnd")
    op.drop_column("virtual_orders", "exit_original_stop_vnd")
    op.drop_constraint(
        "fk_virtual_orders_exit_matched_buy_order",
        "virtual_orders",
        type_="foreignkey",
    )
    op.drop_column("virtual_orders", "exit_matched_buy_order_id")
    op.drop_column("virtual_orders", "exit_snapshot_at")
    op.drop_column("virtual_orders", "position_quantity_after_fill")
    op.drop_column("virtual_orders", "position_quantity_before_fill")
