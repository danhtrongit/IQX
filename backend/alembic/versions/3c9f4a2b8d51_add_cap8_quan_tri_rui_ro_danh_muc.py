"""add cap8 quan tri rui ro danh muc — don nganh + tuong quan + tong rui ro

Revision ID: 3c9f4a2b8d51
Revises: a4e21c0f9b73
Create Date: 2026-08-01 14:22:05.118743

Adds the Cấp 8 «Quản trị rủi ro danh mục» backend (FREE, builds on a graduated
Cấp 7, LAST level of the current program — trọn mạch 0-8):
- ``cap8_progress`` — per-user progress (entered_at, 3 task timestamps, the
  recomputed so_lenh_kiem_tra / so_lan_mua_bat_chap_canh_bao counters, the
  don_nganh_max_pct / tong_rui_ro_pct closing-state snapshot, graduation).
- ``order_kehoach`` += ``don_nganh_pct`` (Numeric(9,4): % danh mục ở NGÀNH của
  mã SAU lệnh), ``tuong_quan_cao_voi`` (JSON {symbol, he_so} của vị thế đáng kể
  tương quan cao nhất), ``tong_rui_ro_pct`` (Numeric(9,4): tổng % vốn mất nếu
  MỌI cắt lỗ bị chạm, sau lệnh), ``danh_muc_canh_bao`` (JSON list các cảnh báo
  THẬT SỰ bật lúc mua) và ``hanh_vi_canh_bao`` ('van_mua'/'giam_kl'/
  'chon_ma_khac'/'khong_canh_bao') — ALL nullable so every existing Cấp 1-7 row
  stays valid. Kiểm tra danh mục là CẢNH BÁO MỀM: không bao giờ là cổng cứng
  chặn nút MUA (spec §9, §C8), và ``van_mua`` KHÔNG bị phạt.

★ ``tong_rui_ro_pct`` is the sum over the positions whose cắt lỗ is KNOWN. A
position without one is EXCLUDED from the sum and reported by count instead —
summing 0 for it would understate total risk, which is the exact failure this
level teaches against. NULL here means "chưa tính được", never 0.

★ ``tuong_quan_cao_voi IS NULL`` means "không tính được / không có cặp nào vượt
ngưỡng" — NEVER "hệ số bằng 0". The shared ``correlation()`` answers 0.0 for
degenerate input, so the service only ever writes this column through
``tuong_quan_an_toan``, which returns None below the documented minimum number
of date-aligned sessions.

★ ``danh_muc_canh_bao = []`` means the check ran and NOTHING fired; NULL means
the order never went through the check at all. The two are different states and
the column keeps them apart. All four columns above are written from the
SERVER's own recomputation of the real portfolio, never from the client's
numbers — only ``hanh_vi_canh_bao`` comes from the user.

The two percentages are ``Numeric(9, 4)`` (``asdecimal=False`` in the model)
rather than ``Float``, mirroring Cấp 7's ``luc_chi_so``: an explicit,
platform-independent precision on the column while plain ``float`` keeps flowing
through the service and pydantic layers. 4 decimal places is far more than a
percentage of NAV needs and costs nothing.

No new PG enum types: the cảnh báo / hành vi vocabularies live as validated
strings + JSON (see ``app.models.cap8``), mirroring Cấp 4/5/6/7's migrations —
the service validates them against the StrEnums before persisting, and nothing
filters on them in SQL beyond a NULL check and equality tests.

Does NOT touch ``ecc202a79e70``/``f809de621bd0``/``ee69ea647b02``/
``b76c7019f77b``/``c81a4d5e93f2``/``1df8155bcd7c``/``a4e21c0f9b73`` (Cấp 1-7's
migrations) — this is a pure ADD.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '3c9f4a2b8d51'
down_revision: Union[str, None] = 'a4e21c0f9b73'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cap8_progress",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("task_1_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_2_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_3_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("so_lenh_kiem_tra", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "so_lan_mua_bat_chap_canh_bao",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
        # ★ NULLABLE with NO server_default on purpose: 0.0 is a *passing* value
        # for both, so "chưa tính được" must not be storable as 0.
        sa.Column("don_nganh_max_pct", sa.Float(), nullable=True),
        sa.Column("tong_rui_ro_pct", sa.Float(), nullable=True),
        sa.Column("graduated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("time_to_graduate_hours", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cap8_progress")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_cap8_progress_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", name="uq_cap8_progress_user_id"),
    )
    op.create_index(
        op.f("ix_cap8_progress_user_id"), "cap8_progress", ["user_id"], unique=False
    )

    op.add_column(
        "order_kehoach",
        sa.Column("don_nganh_pct", sa.Numeric(precision=9, scale=4), nullable=True),
    )
    op.add_column(
        "order_kehoach", sa.Column("tuong_quan_cao_voi", sa.JSON(), nullable=True)
    )
    op.add_column(
        "order_kehoach",
        sa.Column("tong_rui_ro_pct", sa.Numeric(precision=9, scale=4), nullable=True),
    )
    op.add_column(
        "order_kehoach", sa.Column("danh_muc_canh_bao", sa.JSON(), nullable=True)
    )
    op.add_column(
        "order_kehoach", sa.Column("hanh_vi_canh_bao", sa.String(length=16), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("order_kehoach", "hanh_vi_canh_bao")
    op.drop_column("order_kehoach", "danh_muc_canh_bao")
    op.drop_column("order_kehoach", "tong_rui_ro_pct")
    op.drop_column("order_kehoach", "tuong_quan_cao_voi")
    op.drop_column("order_kehoach", "don_nganh_pct")

    op.drop_index(op.f("ix_cap8_progress_user_id"), table_name="cap8_progress")
    op.drop_table("cap8_progress")
