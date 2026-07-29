"""add cap2 discipline tracking (cap2_progress + SL/TP + kỷ luật columns)

Revision ID: f809de621bd0
Revises: ecc202a79e70
Create Date: 2026-07-29 18:08:00.115980

Adds the Cấp 2 «Kỷ luật» backend (FREE, builds on a graduated Cấp 1):
- ``cap2_progress`` — per-user progress (entered_at, 5 task timestamps,
  chuỗi lệnh kỷ luật current/record/last-reset, graduation).
- ``order_kehoach`` += ``phuong_phap_sl_tp`` (2 cách chọn 1 — 'ho_tro_khang_cu'
  / 'bien_do_dao_dong'), ``cat_lo``, ``chot_loi`` — all nullable so existing
  Cấp 1 rows (which never had a cắt lỗ/chốt lời commitment) stay valid.
- ``order_ketso`` += the 7 discipline flags/measures used to detect the 4
  vi phạm kỷ luật (spec §1/§8/§9/§13) — all boolean flags default false and
  the phiên counter defaults 0, so existing Cấp 1 rows stay valid.

Does NOT touch ``ecc202a79e70`` (Cấp 1's migration) — this is a pure ADD.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f809de621bd0'
down_revision: Union[str, None] = 'ecc202a79e70'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PHUONG_PHAP_SL_TP = sa.Enum(
    "ho_tro_khang_cu", "bien_do_dao_dong", name="cap2_phuong_phap_sl_tp"
)


def upgrade() -> None:
    op.create_table(
        "cap2_progress",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("task_1_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_2_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_3_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_4_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_5_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("chuoi_current", sa.Integer(), server_default="0", nullable=False),
        sa.Column("chuoi_record", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_chuoi_reset_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("graduated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("time_to_graduate_hours", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cap2_progress")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_cap2_progress_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", name="uq_cap2_progress_user_id"),
    )
    op.create_index(
        op.f("ix_cap2_progress_user_id"), "cap2_progress", ["user_id"], unique=False
    )

    _PHUONG_PHAP_SL_TP.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "order_kehoach",
        sa.Column("phuong_phap_sl_tp", _PHUONG_PHAP_SL_TP, nullable=True),
    )
    op.add_column("order_kehoach", sa.Column("cat_lo", sa.BigInteger(), nullable=True))
    op.add_column("order_kehoach", sa.Column("chot_loi", sa.BigInteger(), nullable=True))

    op.add_column(
        "order_ketso",
        sa.Column(
            "cham_SL_cuoi_phien", sa.Boolean(), server_default="false", nullable=False
        ),
    )
    op.add_column(
        "order_ketso",
        sa.Column(
            "cham_SL_cat_dung_phien_ke",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
    )
    op.add_column(
        "order_ketso",
        sa.Column(
            "cham_SL_khong_cat", sa.Boolean(), server_default="false", nullable=False
        ),
    )
    op.add_column(
        "order_ketso",
        sa.Column(
            "giu_cham_SL_bao_nhieu_phien", sa.Integer(), server_default="0", nullable=True
        ),
    )
    op.add_column(
        "order_ketso",
        sa.Column(
            "cham_TP_giu_lam_hut", sa.Boolean(), server_default="false", nullable=False
        ),
    )
    op.add_column(
        "order_ketso",
        sa.Column(
            "ban_som_khi_lo_nhe", sa.Boolean(), server_default="false", nullable=False
        ),
    )
    op.add_column(
        "order_ketso",
        sa.Column(
            "nhoi_lenh_khi_lo", sa.Boolean(), server_default="false", nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_column("order_ketso", "nhoi_lenh_khi_lo")
    op.drop_column("order_ketso", "ban_som_khi_lo_nhe")
    op.drop_column("order_ketso", "cham_TP_giu_lam_hut")
    op.drop_column("order_ketso", "giu_cham_SL_bao_nhieu_phien")
    op.drop_column("order_ketso", "cham_SL_khong_cat")
    op.drop_column("order_ketso", "cham_SL_cat_dung_phien_ke")
    op.drop_column("order_ketso", "cham_SL_cuoi_phien")

    op.drop_column("order_kehoach", "chot_loi")
    op.drop_column("order_kehoach", "cat_lo")
    op.drop_column("order_kehoach", "phuong_phap_sl_tp")
    _PHUONG_PHAP_SL_TP.drop(op.get_bind(), checkfirst=True)

    op.drop_index(op.f("ix_cap2_progress_user_id"), table_name="cap2_progress")
    op.drop_table("cap2_progress")
