"""add cap6 doi chieu + trong so theo kieu co phieu

Revision ID: 1df8155bcd7c
Revises: c81a4d5e93f2
Create Date: 2026-07-31 10:12:44.108317

Adds the Cấp 6 «Đối chiếu» backend (FREE, builds on a graduated Cấp 5):
- ``cap6_progress`` — per-user progress (entered_at, 3 task timestamps, the
  recomputed so_lenh_doi_chieu / so_kieu_da_gap / ty_le_thang_khop /
  ty_le_thang_lech metrics, graduation).
- ``order_kehoach`` += ``kieu_co_phieu`` (1 trong 6 kiểu, hệ suy ra từ ngành —
  ``Symbol.icb_lv2``/``icb_lv1``; NULL = "chưa phân loại"), ``lop_mau_thuan``
  (JSON: lớp nào Ủng hộ / Ngược chiều lúc đặt), ``trong_so_goi_y`` (JSON: bảng
  trọng số của kiểu đó + câu "vì sao", hiện nguyên văn theo §C12c),
  ``lop_quyet_dinh`` (lớp user chọn tin), ``khop_goi_y`` (bool: lop_quyet_dinh
  ∈ nhóm gợi ý; NULL khi chưa phân loại được kiểu — không có gợi ý thì không có
  gì để khớp), ``ly_do_doi_chieu`` (text) — ALL nullable so existing Cấp 1-5
  rows, and every Cấp 6 order whose 5 lớp did NOT conflict, stay valid.

★ ``khop_goi_y = false`` is a NEUTRAL fact, never "sai": the trọng-số table is a
SUGGESTION (spec §5/§10) and the arbiter is real outcomes. Nothing in the schema
or the service penalises it — see ``app.models.cap6`` and
``app.services.cap6.service``.

No new PG enum types: the kiểu / lớp vocabularies live as validated strings
(see ``app.models.cap6``), mirroring Cấp 4's and Cấp 5's migrations — the service
validates them against the StrEnums before persisting, and nothing filters on
them in SQL beyond a NULL check and a DISTINCT count.

Does NOT touch ``ecc202a79e70``/``f809de621bd0``/``ee69ea647b02``/
``b76c7019f77b``/``c81a4d5e93f2`` (Cấp 1/2/3/4/5's migrations) — this is a pure
ADD.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '1df8155bcd7c'
down_revision: Union[str, None] = 'c81a4d5e93f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cap6_progress",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("task_1_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_2_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_3_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("so_lenh_doi_chieu", sa.Integer(), server_default="0", nullable=False),
        sa.Column("so_kieu_da_gap", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ty_le_thang_khop", sa.Float(), server_default="0", nullable=False),
        sa.Column("ty_le_thang_lech", sa.Float(), server_default="0", nullable=False),
        sa.Column("graduated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("time_to_graduate_hours", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cap6_progress")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_cap6_progress_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", name="uq_cap6_progress_user_id"),
    )
    op.create_index(
        op.f("ix_cap6_progress_user_id"), "cap6_progress", ["user_id"], unique=False
    )

    op.add_column(
        "order_kehoach", sa.Column("kieu_co_phieu", sa.String(length=32), nullable=True)
    )
    op.add_column("order_kehoach", sa.Column("lop_mau_thuan", sa.JSON(), nullable=True))
    op.add_column("order_kehoach", sa.Column("trong_so_goi_y", sa.JSON(), nullable=True))
    op.add_column(
        "order_kehoach", sa.Column("lop_quyet_dinh", sa.String(length=32), nullable=True)
    )
    op.add_column("order_kehoach", sa.Column("khop_goi_y", sa.Boolean(), nullable=True))
    op.add_column("order_kehoach", sa.Column("ly_do_doi_chieu", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("order_kehoach", "ly_do_doi_chieu")
    op.drop_column("order_kehoach", "khop_goi_y")
    op.drop_column("order_kehoach", "lop_quyet_dinh")
    op.drop_column("order_kehoach", "trong_so_goi_y")
    op.drop_column("order_kehoach", "lop_mau_thuan")
    op.drop_column("order_kehoach", "kieu_co_phieu")

    op.drop_index(op.f("ix_cap6_progress_user_id"), table_name="cap6_progress")
    op.drop_table("cap6_progress")
