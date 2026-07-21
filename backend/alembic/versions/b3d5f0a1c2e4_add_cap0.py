"""add cap0 onboarding tables + virtual_orders.mode

Revision ID: b3d5f0a1c2e4
Revises: 3f9a1c7be204
Create Date: 2026-07-21 00:00:00.000000

Adds the Cấp 0 (free onboarding) backend:
- ``cap0_progress``  — per-user progress (entered_at, 6 task timestamps,
  3 gates, graduation).
- ``user_placement`` — per-user placement result (has_traded_before ->
  placed_level 0/1/2).
- ``virtual_orders.mode`` — tags an order as ``san_tap`` (practice) vs
  ``thuc_chien`` (live); server_default ``'thuc_chien'`` for existing rows.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3d5f0a1c2e4"
down_revision: Union[str, None] = "3f9a1c7be204"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cap0_progress",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "virtual_balance_init",
            sa.BigInteger(),
            server_default="250000000",
            nullable=False,
        ),
        sa.Column("task_1_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_2_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_3_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_4_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_5_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_6_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task1_star_clicked", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("task5_sl_typed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("task6_debrief_done", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("graduated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("time_to_graduate_hours", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cap0_progress")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_cap0_progress_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", name="uq_cap0_progress_user_id"),
    )
    op.create_index(
        op.f("ix_cap0_progress_user_id"), "cap0_progress", ["user_id"], unique=False
    )

    op.create_table(
        "user_placement",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("has_traded_before", sa.Boolean(), nullable=False),
        sa.Column("placed_level", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_placement")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_user_placement_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", name="uq_user_placement_user_id"),
    )
    op.create_index(
        op.f("ix_user_placement_user_id"), "user_placement", ["user_id"], unique=False
    )

    op.add_column(
        "virtual_orders",
        sa.Column("mode", sa.String(), nullable=False, server_default="thuc_chien"),
    )


def downgrade() -> None:
    op.drop_column("virtual_orders", "mode")
    op.drop_index(op.f("ix_user_placement_user_id"), table_name="user_placement")
    op.drop_table("user_placement")
    op.drop_index(op.f("ix_cap0_progress_user_id"), table_name="cap0_progress")
    op.drop_table("cap0_progress")
