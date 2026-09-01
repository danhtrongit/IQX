"""cap8 — replace pre-buy risk state with server-derived exit evidence.

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-09-01 00:00:00.000000

Old task stamps and pre-buy risk metrics cannot prove plan-compliant exits.  The
upgrade preserves entry/graduation history, resets the new counter, and removes
obsolete evidence.  Downgrade only restores the physical shape; it cannot
recreate removed risk evidence or infer old task credit.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f5a6b7c8d9e0"
down_revision: Union[str, None] = "e4f5a6b7c8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PROGRESS_OLD_COLUMNS = (
    "task_1_done_at", "task_2_done_at", "task_3_done_at", "so_lenh_kiem_tra",
    "so_lan_mua_bat_chap_canh_bao", "don_nganh_max_pct", "tong_rui_ro_pct",
)
_ORDER_OLD_COLUMNS = (
    "don_nganh_pct", "tuong_quan_cao_voi", "tong_rui_ro_pct",
    "danh_muc_canh_bao", "hanh_vi_canh_bao",
)


def upgrade() -> None:
    op.add_column(
        "virtual_positions",
        sa.Column("active_plan_buy_order_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_virtual_positions_active_plan_buy_order",
        "virtual_positions", "virtual_orders", ["active_plan_buy_order_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_virtual_positions_active_plan_buy_order_id", "virtual_positions", ["active_plan_buy_order_id"])
    op.add_column("virtual_positions", sa.Column("active_original_stop_vnd", sa.BigInteger(), nullable=True))
    op.add_column("virtual_positions", sa.Column("active_original_take_profit_vnd", sa.BigInteger(), nullable=True))
    op.add_column("virtual_positions", sa.Column("active_dynamic_stop_vnd", sa.BigInteger(), nullable=True))
    op.add_column(
        "virtual_positions", sa.Column("active_dynamic_stop_set_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_table(
        "cap8_exits",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("symbol", sa.String(length=10), nullable=False),
        sa.Column("matched_buy_order_id", sa.Uuid(), nullable=True),
        sa.Column("sell_order_id", sa.Uuid(), nullable=False),
        sa.Column("exited_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("filled_price_vnd", sa.BigInteger(), nullable=False),
        sa.Column("remaining_position_pct", sa.Float(), nullable=False),
        sa.Column("exit_method", sa.String(length=16), nullable=False),
        sa.Column("original_stop_vnd", sa.BigInteger(), nullable=True),
        sa.Column("original_take_profit_vnd", sa.BigInteger(), nullable=True),
        sa.Column("effective_stop_vnd", sa.BigInteger(), nullable=True),
        sa.Column("dung_ke_hoach", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ban_cam_xuc", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("classification_reason", sa.String(length=128), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["account_id"], ["virtual_trading_accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["matched_buy_order_id"], ["virtual_orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["sell_order_id"], ["virtual_orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sell_order_id", name="uq_cap8_exits_sell_order_id"),
    )
    op.create_index("ix_cap8_exits_user_id", "cap8_exits", ["user_id"])
    op.create_index("ix_cap8_exits_account_id", "cap8_exits", ["account_id"])
    op.create_index("ix_cap8_exits_symbol", "cap8_exits", ["symbol"])

    for column in _PROGRESS_OLD_COLUMNS:
        op.drop_column("cap8_progress", column)
    op.add_column(
        "cap8_progress",
        sa.Column("so_lenh_thoat_dung_ke_hoach", sa.Integer(), nullable=False, server_default="0"),
    )
    for column in _ORDER_OLD_COLUMNS:
        op.drop_column("order_kehoach", column)


def downgrade() -> None:
    # Explicitly lossy: restore blank obsolete state, never inferred achievement.
    op.add_column("order_kehoach", sa.Column("hanh_vi_canh_bao", sa.String(length=16), nullable=True))
    op.add_column("order_kehoach", sa.Column("danh_muc_canh_bao", sa.JSON(), nullable=True))
    op.add_column("order_kehoach", sa.Column("tong_rui_ro_pct", sa.Numeric(precision=9, scale=4), nullable=True))
    op.add_column("order_kehoach", sa.Column("tuong_quan_cao_voi", sa.JSON(), nullable=True))
    op.add_column("order_kehoach", sa.Column("don_nganh_pct", sa.Numeric(precision=9, scale=4), nullable=True))
    op.drop_column("cap8_progress", "so_lenh_thoat_dung_ke_hoach")
    for column in ("task_1_done_at", "task_2_done_at", "task_3_done_at"):
        op.add_column("cap8_progress", sa.Column(column, sa.DateTime(timezone=True), nullable=True))
    op.add_column("cap8_progress", sa.Column("so_lenh_kiem_tra", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("cap8_progress", sa.Column("so_lan_mua_bat_chap_canh_bao", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("cap8_progress", sa.Column("don_nganh_max_pct", sa.Float(), nullable=True))
    op.add_column("cap8_progress", sa.Column("tong_rui_ro_pct", sa.Float(), nullable=True))

    op.drop_table("cap8_exits")
    op.drop_index("ix_virtual_positions_active_plan_buy_order_id", table_name="virtual_positions")
    op.drop_constraint("fk_virtual_positions_active_plan_buy_order", "virtual_positions", type_="foreignkey")
    op.drop_column("virtual_positions", "active_dynamic_stop_set_at")
    op.drop_column("virtual_positions", "active_dynamic_stop_vnd")
    op.drop_column("virtual_positions", "active_original_take_profit_vnd")
    op.drop_column("virtual_positions", "active_original_stop_vnd")
    op.drop_column("virtual_positions", "active_plan_buy_order_id")
