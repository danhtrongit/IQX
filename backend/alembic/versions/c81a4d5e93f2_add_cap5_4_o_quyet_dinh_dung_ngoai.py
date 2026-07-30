"""add cap5 4 o quyet dinh + dung ngoai

Revision ID: c81a4d5e93f2
Revises: b76c7019f77b
Create Date: 2026-07-30 11:48:12.554901

Adds the Cấp 5 «Lão luyện» backend (FREE, builds on a graduated Cấp 4):
- ``cap5_progress`` — per-user progress (entered_at, 3 task timestamps, the
  recomputed so_lenh_phan_loai / so_lan_dung_ngoai_da_cham /
  ty_le_quyet_dinh_dung metrics, graduation).
- ``standby_decision`` — "đứng ngoài có chủ đích": a NON-trade decision
  (symbol, decided_at, reason, giá lúc đứng ngoài) scored né đúng / né hụt /
  trung tính once 5 trading sessions have elapsed (cham_at / gia_sau_5_phien /
  ket_qua stay NULL until then, and stay NULL forever if that session's price
  is never available — an unscorable decision is left unscored, never guessed).
- ``order_ketso`` += ``verdict_he`` / ``verdict_user`` (hệ gợi ý vs user chốt —
  hybrid §C12c), ``verdict_provenance`` (JSON: the signals behind the hệ
  verdict, shown verbatim so a verdict is never bare), ``o_4``
  ('dung_thang'|'dung_thua'|'sai_thang'|'sai_thua' = verdict cuối × kết quả),
  ``ly_do_sua`` (text, only when the user overrides) — ALL nullable so existing
  Cấp 1/2/3/4 rows (never classified into a ô) stay valid.

No new PG enum types: the verdict / ô / lý do / kết quả vocabularies live as
validated strings (see ``app.models.cap5``), mirroring Cấp 4's migration — the
service validates them against the StrEnums before persisting, and nothing
filters on them in SQL beyond a ``LIKE 'dung%'`` prefix count.

Does NOT touch ``ecc202a79e70``/``f809de621bd0``/``ee69ea647b02``/
``b76c7019f77b`` (Cấp 1/2/3/4's migrations) — this is a pure ADD.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c81a4d5e93f2'
down_revision: Union[str, None] = 'b76c7019f77b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cap5_progress",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("task_1_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_2_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_3_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("so_lenh_phan_loai", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "so_lan_dung_ngoai_da_cham", sa.Integer(), server_default="0", nullable=False
        ),
        sa.Column("ty_le_quyet_dinh_dung", sa.Float(), server_default="0", nullable=False),
        sa.Column("graduated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("time_to_graduate_hours", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cap5_progress")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_cap5_progress_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", name="uq_cap5_progress_user_id"),
    )
    op.create_index(
        op.f("ix_cap5_progress_user_id"), "cap5_progress", ["user_id"], unique=False
    )

    op.create_table(
        "standby_decision",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.String(length=32), nullable=False),
        sa.Column("gia_luc_dung_ngoai", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("cham_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("gia_sau_5_phien", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("ket_qua", sa.String(length=16), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_standby_decision")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_standby_decision_user_id_users"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        op.f("ix_standby_decision_user_id"), "standby_decision", ["user_id"], unique=False
    )
    op.create_index(
        "ix_standby_decision_user_decided",
        "standby_decision",
        ["user_id", "decided_at"],
        unique=False,
    )

    op.add_column("order_ketso", sa.Column("verdict_he", sa.String(length=8), nullable=True))
    op.add_column("order_ketso", sa.Column("verdict_user", sa.String(length=8), nullable=True))
    op.add_column("order_ketso", sa.Column("verdict_provenance", sa.JSON(), nullable=True))
    op.add_column("order_ketso", sa.Column("o_4", sa.String(length=16), nullable=True))
    op.add_column("order_ketso", sa.Column("ly_do_sua", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("order_ketso", "ly_do_sua")
    op.drop_column("order_ketso", "o_4")
    op.drop_column("order_ketso", "verdict_provenance")
    op.drop_column("order_ketso", "verdict_user")
    op.drop_column("order_ketso", "verdict_he")

    op.drop_index("ix_standby_decision_user_decided", table_name="standby_decision")
    op.drop_index(op.f("ix_standby_decision_user_id"), table_name="standby_decision")
    op.drop_table("standby_decision")

    op.drop_index(op.f("ix_cap5_progress_user_id"), table_name="cap5_progress")
    op.drop_table("cap5_progress")
