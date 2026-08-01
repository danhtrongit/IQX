"""cap6 ty_le_thang_khop/lech nullable — "chưa có lệnh đã đóng" ≠ "thắng 0%"

Revision ID: 7b3c1e5a9d24
Revises: 3c9f4a2b8d51
Create Date: 2026-08-01 17:05:00.000000

``cap6_progress.ty_le_thang_khop`` / ``ty_le_thang_lech`` were created NOT NULL
with a ``0`` default, so a group that has no closed lệnh at all was stored — and
served by ``GET /cap6/progress`` — as ``0.0``: indistinguishable from a group
that HAS closed lệnh and won none of them. Those are opposite statements, and
the second is the one that reads as a verdict on the user.

This makes both columns nullable so ``NULL`` can mean exactly "nhóm này chưa có
lệnh đã đóng nào", matching:
  · Cấp 8's ``cap8_progress.don_nganh_max_pct`` / ``tong_rui_ro_pct``, which are
    nullable for this precise reason (0% is a *passing* value there);
  · ``GET /cap6/thach-thuc``, which has always returned a nullable
    ``nhom_khop.ty_le_thang`` beside ``du_du_lieu``.

Existing rows are left as they are: every one of them is recomputed from
``order_kehoach`` ⋈ ``order_ketso`` on the next read (``_recompute_progress``
runs on every Cấp 6 read and write), so any stale ``0`` becomes ``NULL`` by
itself the first time the user opens the level. Backfilling here would have to
re-derive the same join in SQL to tell a real 0% from a placeholder one, and
would be wrong the moment a lệnh closes afterwards.

The downgrade restores NOT NULL, filling any NULL with ``0`` first — the only
value the old schema could represent.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7b3c1e5a9d24"
down_revision: Union[str, None] = "3c9f4a2b8d51"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for col in ("ty_le_thang_khop", "ty_le_thang_lech"):
        op.alter_column(
            "cap6_progress",
            col,
            existing_type=sa.Float(),
            nullable=True,
            existing_server_default=sa.text("0"),
            server_default=None,
        )


def downgrade() -> None:
    for col in ("ty_le_thang_khop", "ty_le_thang_lech"):
        # NULL is not representable in the old schema; 0 is the value it used.
        op.execute(f"UPDATE cap6_progress SET {col} = 0 WHERE {col} IS NULL")
        op.alter_column(
            "cap6_progress",
            col,
            existing_type=sa.Float(),
            nullable=False,
            server_default=sa.text("0"),
        )
