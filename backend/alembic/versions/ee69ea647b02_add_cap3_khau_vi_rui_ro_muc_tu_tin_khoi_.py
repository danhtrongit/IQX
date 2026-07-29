"""add cap3 khau vi rui ro + muc tu tin + khoi luong

Revision ID: ee69ea647b02
Revises: f809de621bd0
Create Date: 2026-07-29 23:43:20.530123

Adds the Cấp 3 «Bản lĩnh» backend (FREE, builds on a graduated Cấp 2):
- ``cap3_progress`` — per-user progress (entered_at, khẩu vị rủi ro hồ sơ +
  vốn ban đầu, 3 task timestamps, recomputed so_lenh/lai_pct/diem_ky_luat_tb,
  graduation).
- ``order_kehoach`` += ``khau_vi`` (per-order snapshot of the khẩu vị active
  at order time — 'than_trong'/'can_bang'/'tan_cong'), ``muc_tu_tin``
  (1/2/3), ``cach_khoi_luong`` ('linh_hoat'/'ky_luat'), ``khoi_luong``,
  ``pct_von`` — all nullable so existing Cấp 1/2 rows (which never had a
  quản lý vốn commitment) stay valid.

Does NOT touch ``ecc202a79e70``/``f809de621bd0`` (Cấp 1/2's migrations) —
this is a pure ADD.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'ee69ea647b02'
down_revision: Union[str, None] = 'f809de621bd0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# create_type=False → we create each enum exactly once below (avoids "type
# already exists" since ``cap3_khau_vi_rui_ro`` is referenced by TWO tables:
# the new ``cap3_progress`` and the existing ``order_kehoach``).
_KHAU_VI_RUI_RO = postgresql.ENUM(
    "than_trong", "can_bang", "tan_cong", name="cap3_khau_vi_rui_ro", create_type=False
)
_CACH_KHOI_LUONG = postgresql.ENUM(
    "linh_hoat", "ky_luat", name="cap3_cach_khoi_luong", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    _KHAU_VI_RUI_RO.create(bind, checkfirst=True)
    _CACH_KHOI_LUONG.create(bind, checkfirst=True)

    op.create_table(
        "cap3_progress",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("khau_vi_da_dat", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("khau_vi", _KHAU_VI_RUI_RO, nullable=True),
        sa.Column("von_ban_dau", sa.BigInteger(), server_default="100000000", nullable=False),
        sa.Column("task_1_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_2_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_3_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("so_lenh_cap3", sa.Integer(), server_default="0", nullable=False),
        sa.Column("lai_pct_cap3", sa.Float(), server_default="0", nullable=False),
        sa.Column("diem_ky_luat_tb_cap3", sa.Float(), server_default="0", nullable=False),
        sa.Column("graduated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("time_to_graduate_hours", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cap3_progress")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_cap3_progress_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", name="uq_cap3_progress_user_id"),
    )
    op.create_index(
        op.f("ix_cap3_progress_user_id"), "cap3_progress", ["user_id"], unique=False
    )

    op.add_column("order_kehoach", sa.Column("khau_vi", _KHAU_VI_RUI_RO, nullable=True))
    op.add_column("order_kehoach", sa.Column("muc_tu_tin", sa.Integer(), nullable=True))
    op.add_column(
        "order_kehoach", sa.Column("cach_khoi_luong", _CACH_KHOI_LUONG, nullable=True)
    )
    op.add_column("order_kehoach", sa.Column("khoi_luong", sa.Integer(), nullable=True))
    op.add_column("order_kehoach", sa.Column("pct_von", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("order_kehoach", "pct_von")
    op.drop_column("order_kehoach", "khoi_luong")
    op.drop_column("order_kehoach", "cach_khoi_luong")
    op.drop_column("order_kehoach", "muc_tu_tin")
    op.drop_column("order_kehoach", "khau_vi")

    op.drop_index(op.f("ix_cap3_progress_user_id"), table_name="cap3_progress")
    op.drop_table("cap3_progress")

    _CACH_KHOI_LUONG.drop(op.get_bind(), checkfirst=True)
    _KHAU_VI_RUI_RO.drop(op.get_bind(), checkfirst=True)
