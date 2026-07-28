"""add cap1 onboarding tables (cap1_progress, order_kehoach, order_ketso)

Revision ID: ecc202a79e70
Revises: b3d5f0a1c2e4
Create Date: 2026-07-28 00:00:00.000000

Adds the Cấp 1 «Học việc» backend (FREE, builds on a graduated Cấp 0):
- ``cap1_progress`` — per-user progress (entered_at, da_xem_tour, 6 task
  timestamps, recomputed counters, graduation).
- ``order_kehoach``  — Form Kế hoạch recorded at BUY time (lyDo,
  trangThai_luc_dat, vung_mua, co_bam_doc_chi_tiet, snapshot_lop_du_lieu).
  One row per ``virtual_orders`` row (unique).
- ``order_ketso``    — Kết sổ reconciliation recorded at SELL time (gia_ra,
  so_phien_giu, so_ngay_lich, pnl_pct, pnl_vnd, cam_xuc, closed_at). One row
  per ``virtual_orders`` row (unique).

NO cắt lỗ/chốt lời columns anywhere — that's Cấp 2 scope (spec §9/§10).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ecc202a79e70"
down_revision: Union[str, None] = "b3d5f0a1c2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LY_DO = sa.Enum(
    "ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia", name="cap1_ly_do"
)
_TRANG_THAI_LUC_DAT = sa.Enum(
    "ung_ho", "trung_tinh", "can_chu_y", "nguoc_chieu", name="cap1_trang_thai_luc_dat"
)
_CAM_XUC = sa.Enum(
    "binh_tinh", "so", "hoi_tiec", "khong_ro", name="cap1_cam_xuc"
)


def upgrade() -> None:
    op.create_table(
        "cap1_progress",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("da_xem_tour", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("task_1_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_2_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_3_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_4_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_5_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_6_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("so_ly_do_da_dung", sa.Integer(), server_default="0", nullable=False),
        sa.Column("so_lenh_ly_do_ung_ho", sa.Integer(), server_default="0", nullable=False),
        sa.Column("so_lan_xem_danh_muc", sa.Integer(), server_default="0", nullable=False),
        sa.Column("so_lenh_thuc_chien", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_danh_muc_view_date", sa.Date(), nullable=True),
        sa.Column("graduated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("time_to_graduate_hours", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cap1_progress")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_cap1_progress_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", name="uq_cap1_progress_user_id"),
    )
    op.create_index(
        op.f("ix_cap1_progress_user_id"), "cap1_progress", ["user_id"], unique=False
    )

    op.create_table(
        "order_kehoach",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("lyDo", _LY_DO, nullable=False),
        sa.Column("trangThai_luc_dat", _TRANG_THAI_LUC_DAT, nullable=False),
        sa.Column("vung_mua", sa.BigInteger(), nullable=False),
        sa.Column("co_bam_doc_chi_tiet", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("snapshot_lop_du_lieu", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_kehoach")),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["virtual_orders.id"],
            name=op.f("fk_order_kehoach_order_id_virtual_orders"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        op.f("ix_order_kehoach_order_id"), "order_kehoach", ["order_id"], unique=True
    )

    op.create_table(
        "order_ketso",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("gia_ra", sa.BigInteger(), nullable=False),
        sa.Column("so_phien_giu", sa.Integer(), nullable=False),
        sa.Column("so_ngay_lich", sa.Integer(), nullable=False),
        sa.Column("pnl_pct", sa.Float(), nullable=False),
        sa.Column("pnl_vnd", sa.BigInteger(), nullable=False),
        sa.Column("cam_xuc", _CAM_XUC, nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_ketso")),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["virtual_orders.id"],
            name=op.f("fk_order_ketso_order_id_virtual_orders"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        op.f("ix_order_ketso_order_id"), "order_ketso", ["order_id"], unique=True
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_order_ketso_order_id"), table_name="order_ketso")
    op.drop_table("order_ketso")
    op.drop_index(op.f("ix_order_kehoach_order_id"), table_name="order_kehoach")
    op.drop_table("order_kehoach")
    op.drop_index(op.f("ix_cap1_progress_user_id"), table_name="cap1_progress")
    op.drop_table("cap1_progress")

    bind = op.get_bind()
    _CAM_XUC.drop(bind, checkfirst=True)
    _TRANG_THAI_LUC_DAT.drop(bind, checkfirst=True)
    _LY_DO.drop(bind, checkfirst=True)
