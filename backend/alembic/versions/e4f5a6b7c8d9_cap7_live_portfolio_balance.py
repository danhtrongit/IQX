"""cap7 — replace order-book tasks with live portfolio balance.

Revision ID: e4f5a6b7c8d9
Revises: d3c2a1b4e5f6
Create Date: 2026-09-01 00:00:00.000000

Old order-book timestamps and counters cannot prove a current diversified
portfolio. Upgrade removes them without changing entry or graduation history and
starts the persisted live boolean as false. Downgrade deliberately restores the
old physical shape with empty obsolete state; removed reading evidence is not
reconstructable.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e4f5a6b7c8d9"
down_revision: Union[str, None] = "d3c2a1b4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PROGRESS_OLD_COLUMNS = (
    "task_1_done_at",
    "task_2_done_at",
    "task_3_done_at",
    "so_lenh_doc_luc",
    "so_lan_khong_duoi_theo_co",
    "ty_le_doc_luc_dung",
)
_ORDER_BOOK_COLUMNS = (
    "hanh_vi_co",
    "co_canh_giac_lenh_gia",
    "dien_bien_pct",
    "doc_luc_dung",
    "luc_doc_user",
    "luc_chi_so",
)


def upgrade() -> None:
    for column in _PROGRESS_OLD_COLUMNS:
        op.drop_column("cap7_progress", column)
    op.add_column(
        "cap7_progress",
        sa.Column("can_doi_ok", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    for column in _ORDER_BOOK_COLUMNS:
        op.drop_column("order_kehoach", column)


def downgrade() -> None:
    # Explicitly lossy: restore the previous table shape, never false old credit.
    op.add_column(
        "order_kehoach", sa.Column("luc_chi_so", sa.Numeric(precision=18, scale=6), nullable=True)
    )
    op.add_column("order_kehoach", sa.Column("luc_doc_user", sa.String(length=8), nullable=True))
    op.add_column("order_kehoach", sa.Column("doc_luc_dung", sa.Boolean(), nullable=True))
    op.add_column("order_kehoach", sa.Column("dien_bien_pct", sa.Float(), nullable=True))
    op.add_column(
        "order_kehoach", sa.Column("co_canh_giac_lenh_gia", sa.Boolean(), nullable=True)
    )
    op.add_column("order_kehoach", sa.Column("hanh_vi_co", sa.String(length=16), nullable=True))
    op.drop_column("cap7_progress", "can_doi_ok")
    op.add_column("cap7_progress", sa.Column("task_1_done_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("cap7_progress", sa.Column("task_2_done_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("cap7_progress", sa.Column("task_3_done_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "cap7_progress", sa.Column("so_lenh_doc_luc", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column(
        "cap7_progress",
        sa.Column("so_lan_khong_duoi_theo_co", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "cap7_progress", sa.Column("ty_le_doc_luc_dung", sa.Float(), nullable=False, server_default="0")
    )
