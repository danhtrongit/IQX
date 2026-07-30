"""add cap4 doc 5 lop + vu khi diem mu

Revision ID: b76c7019f77b
Revises: ee69ea647b02
Create Date: 2026-07-30 09:12:44.118207

Adds the Cấp 4 «Thuần thục» backend (FREE, builds on a graduated Cấp 3):
- ``cap4_progress`` — per-user progress (entered_at, 3 task timestamps, the
  recomputed so_lenh_doc_du_5lop / vu_khi_lop / diem_mu_lop /
  ty_le_thang_dong_thuan_cao metrics, graduation).
- ``order_kehoach`` += ``doc_5_lop`` (JSON {lop: 'ok'|'neu'|'bad'} — user's own
  reading of all 5 lớp), ``ai_5_lop`` (JSON — AI's 5-bậc verdict reduced to the
  same 3 levels at order time), ``so_lop_dong_thuan`` (số lớp AI đánh giá Ủng
  hộ, 0-5), ``so_lop_khac_ai`` (số lớp user đọc khác AI — a NEUTRAL count, never
  scored đúng/sai per spec §4/§9) — all nullable so existing Cấp 1/2/3 rows
  (which never had a 5-lớp reading) stay valid.

No new PG enum types: the 3 mức tự chấm live as validated JSON values (see
``app.models.cap4``), and ``vu_khi_lop``/``diem_mu_lop`` are derived strings.

Does NOT touch ``ecc202a79e70``/``f809de621bd0``/``ee69ea647b02`` (Cấp 1/2/3's
migrations) — this is a pure ADD.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b76c7019f77b'
down_revision: Union[str, None] = 'ee69ea647b02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cap4_progress",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("task_1_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_2_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_3_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("so_lenh_doc_du_5lop", sa.Integer(), server_default="0", nullable=False),
        sa.Column("vu_khi_lop", sa.String(length=32), nullable=True),
        sa.Column("diem_mu_lop", sa.String(length=32), nullable=True),
        sa.Column(
            "ty_le_thang_dong_thuan_cao", sa.Float(), server_default="0", nullable=False
        ),
        sa.Column("graduated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("time_to_graduate_hours", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cap4_progress")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_cap4_progress_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", name="uq_cap4_progress_user_id"),
    )
    op.create_index(
        op.f("ix_cap4_progress_user_id"), "cap4_progress", ["user_id"], unique=False
    )

    op.add_column("order_kehoach", sa.Column("doc_5_lop", sa.JSON(), nullable=True))
    op.add_column("order_kehoach", sa.Column("ai_5_lop", sa.JSON(), nullable=True))
    op.add_column("order_kehoach", sa.Column("so_lop_dong_thuan", sa.Integer(), nullable=True))
    op.add_column("order_kehoach", sa.Column("so_lop_khac_ai", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("order_kehoach", "so_lop_khac_ai")
    op.drop_column("order_kehoach", "so_lop_dong_thuan")
    op.drop_column("order_kehoach", "ai_5_lop")
    op.drop_column("order_kehoach", "doc_5_lop")

    op.drop_index(op.f("ix_cap4_progress_user_id"), table_name="cap4_progress")
    op.drop_table("cap4_progress")
