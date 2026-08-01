"""add cap7 doc so lenh — chi so Luc + co canh giac + cham doc luc

Revision ID: a4e21c0f9b73
Revises: 1df8155bcd7c
Create Date: 2026-08-01 09:41:12.663204

Adds the Cấp 7 «Đọc sổ lệnh» backend (FREE, builds on a graduated Cấp 6):
- ``cap7_progress`` — per-user progress (entered_at, 3 task timestamps, the
  recomputed so_lenh_doc_luc / so_lan_khong_duoi_theo_co / ty_le_doc_luc_dung
  metrics, graduation).
- ``order_kehoach`` += ``luc_chi_so`` (Numeric(18,6): tổng dư MUA / tổng dư BÁN
  3 mức lúc mua), ``luc_doc_user`` ('manh'/'can'/'yeu' — user tự đoán, hệ KHÔNG
  quyết thay), ``doc_luc_dung`` (bool, điền SAU khi server chấm),
  ``dien_bien_pct`` (% giá đóng cửa phiên chấm so với giá khớp),
  ``co_canh_giac_lenh_gia`` (bool: cờ heuristic đã hiện hay chưa) và
  ``hanh_vi_co`` ('cho_xac_nhan'/'mua_duoi_theo') — ALL nullable so every
  existing Cấp 1-6 row, and every Cấp 7 lệnh đặt NGOÀI giờ giao dịch (sổ lệnh
  đứng yên, không đọc được lực), stays valid. Đọc lực là SOFT: không bao giờ là
  cổng cứng chặn nút MUA (spec §9).

★ ``doc_luc_dung IS NULL`` means UNSCORED, never "đọc sai": the chấm deadline
has not arrived, the buy never filled, or the price for that session is
unavailable. Those rows are excluded from ``ty_le_doc_luc_dung``'s denominator
and reported separately as ``so_lenh_chua_cham`` — see
``app.services.cap7.service._score_due_orders``.

★ ``co_canh_giac_lenh_gia`` records that a HEURISTIC flag was shown (one book
level's volume abnormally large vs the others), NOT that IQX detected a fake
order — accurate detection needs continuous tick data and is out of scope
(spec §9). ``hanh_vi_co = 'mua_duoi_theo'`` is recorded but NEVER penalised.

``luc_chi_so`` is ``Numeric(18, 6)`` (``asdecimal=False`` in the model) rather
than ``Float``: an explicit, platform-independent precision on the column while
plain ``float`` keeps flowing through the service and pydantic layers. 6 decimal
places is far more than a dư-mua/dư-bán ratio needs and costs nothing; the
service's idempotent-repost check compares at exactly that 1e-6 tolerance.

No new PG enum types: the lực / hành vi vocabularies live as validated strings
(see ``app.models.cap7``), mirroring Cấp 4/5/6's migrations — the service
validates them against the StrEnums before persisting, and nothing filters on
them in SQL beyond a NULL check and one equality test.

Does NOT touch ``ecc202a79e70``/``f809de621bd0``/``ee69ea647b02``/
``b76c7019f77b``/``c81a4d5e93f2``/``1df8155bcd7c`` (Cấp 1-6's migrations) —
this is a pure ADD.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a4e21c0f9b73'
down_revision: Union[str, None] = '1df8155bcd7c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cap7_progress",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("task_1_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_2_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_3_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("so_lenh_doc_luc", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "so_lan_khong_duoi_theo_co", sa.Integer(), server_default="0", nullable=False
        ),
        sa.Column("ty_le_doc_luc_dung", sa.Float(), server_default="0", nullable=False),
        sa.Column("graduated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("time_to_graduate_hours", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cap7_progress")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_cap7_progress_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", name="uq_cap7_progress_user_id"),
    )
    op.create_index(
        op.f("ix_cap7_progress_user_id"), "cap7_progress", ["user_id"], unique=False
    )

    op.add_column(
        "order_kehoach", sa.Column("luc_chi_so", sa.Numeric(precision=18, scale=6), nullable=True)
    )
    op.add_column(
        "order_kehoach", sa.Column("luc_doc_user", sa.String(length=8), nullable=True)
    )
    op.add_column("order_kehoach", sa.Column("doc_luc_dung", sa.Boolean(), nullable=True))
    op.add_column("order_kehoach", sa.Column("dien_bien_pct", sa.Float(), nullable=True))
    op.add_column(
        "order_kehoach", sa.Column("co_canh_giac_lenh_gia", sa.Boolean(), nullable=True)
    )
    op.add_column(
        "order_kehoach", sa.Column("hanh_vi_co", sa.String(length=16), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("order_kehoach", "hanh_vi_co")
    op.drop_column("order_kehoach", "co_canh_giac_lenh_gia")
    op.drop_column("order_kehoach", "dien_bien_pct")
    op.drop_column("order_kehoach", "doc_luc_dung")
    op.drop_column("order_kehoach", "luc_doc_user")
    op.drop_column("order_kehoach", "luc_chi_so")

    op.drop_index(op.f("ix_cap7_progress_user_id"), table_name="cap7_progress")
    op.drop_table("cap7_progress")
