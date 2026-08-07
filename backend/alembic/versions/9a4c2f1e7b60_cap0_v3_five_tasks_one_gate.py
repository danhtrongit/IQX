"""cap0 v3.0 — 5 nhiệm vụ / 1 cổng hành vi + cap0_order_kehoach (chip lý do)

Revision ID: 9a4c2f1e7b60
Revises: 7b3c1e5a9d24
Create Date: 2026-08-07 09:00:00.000000

Spec v3.0 cuts Cấp 0 from 6 nhiệm vụ + 2 cổng down to **5 nhiệm vụ + 1 cổng**
and removes cắt lỗ/chốt lời from the level entirely. The old ⑤ ("mua lần 2 có
gõ ngưỡng cắt lỗ") is deleted; the old ⑥ ("bán + Kết sổ") becomes the new ⑤.

★ THE ORDER OF THE FIRST TWO STATEMENTS IS THE WHOLE POINT.
``task_5_done_at`` already holds a timestamp from the deleted SL flow. If the
new ⑤ were simply re-pointed at that column, a mid-flight user would read 5/5
nhiệm vụ while ``task5_debrief_done`` stayed ``false``, so ``graduate()`` would
409 forever — and the FE's retro-debrief (``Gbar.tsx``: ``if (!progress ||
task5Done) return``) would be suppressed too, leaving no path out. Copying
column 6's data ONTO column 5 before dropping column 6 is what prevents that:
after this migration the new ⑤ is driven by the old ⑥'s data, and a user who
finished ①-⑤ under the OLD numbering (``task5_sl_typed = true``,
``task_6_done_at`` NULL) correctly reads **4/5 with ⑤ outstanding**.

Also adds ``cap0_order_kehoach`` — spec §10's "mỗi lệnh Cấp 0, tối giản"
(``order_id`` + ``ly_do_doi_thuong``). It is a NEW table, not a reuse of Cấp 1's
``order_kehoach``: that table's ``lyDo``/``trangThai_luc_dat``/``vung_mua`` are
NOT NULL and belong to Cấp 1's analytical vocabulary, its ``order_id`` is UNIQUE
(so a Cấp 0 row would 409 the later Cấp 1 kế hoạch for the same order), and
Cấp 1's nhiệm vụ ③ counts DISTINCT ``order_kehoach.lyDo``. See
``Cap0Service.record_kehoach``'s docstring for the full reasoning.

DOWNGRADE IS LOSSY — say it plainly: ``task5_sl_typed`` recorded whether a user
typed a stop-loss, and that fact is deleted here with no way to reconstruct it.
The downgrade recreates the column with its ``false`` default, so every user
comes back looking as though they never typed one. It does move the ⑤ timestamp
back to ``task_6_done_at`` (and NULLs ``task_5_done_at``) so the old 6-task
numbering reads correctly, which makes upgrade → downgrade → upgrade a stable
round trip.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9a4c2f1e7b60"
down_revision: Union[str, None] = "7b3c1e5a9d24"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LY_DO_DOI_THUONG = sa.Enum(
    "cong_ty_toi_biet",
    "nguoi_quen_gioi_thieu",
    "thay_tren_mang",
    "gia_dang_tang",
    "thu_cho_biet",
    name="cap0_ly_do_doi_thuong",
)


def upgrade() -> None:
    # ① Carry the old ⑥ ("bán + Kết sổ") forward onto the new ⑤ BEFORE the
    #    source column disappears. See the module docstring.
    op.execute("UPDATE cap0_progress SET task_5_done_at = task_6_done_at")

    # ② Drop what v3.0 removed.
    op.drop_column("cap0_progress", "task_6_done_at")
    op.drop_column("cap0_progress", "task5_sl_typed")

    # ③ Rename the surviving gate so no column name contradicts the spec.
    op.alter_column(
        "cap0_progress", "task6_debrief_done", new_column_name="task5_debrief_done"
    )

    # ④ Chip lý do đời thường của khối Kế hoạch (§4/§10). ``create_table`` emits
    #    the CREATE TYPE itself (repo convention — see ecc202a79e70); the
    #    downgrade drops the type explicitly since ``drop_table`` does not.
    op.create_table(
        "cap0_order_kehoach",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column(
            "ly_do_doi_thuong",
            _LY_DO_DOI_THUONG,
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cap0_order_kehoach")),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["virtual_orders.id"],
            name=op.f("fk_cap0_order_kehoach_order_id_virtual_orders"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        op.f("ix_cap0_order_kehoach_order_id"),
        "cap0_order_kehoach",
        ["order_id"],
        unique=True,
    )


def downgrade() -> None:
    """Restore the v2.2 shape. LOSSY: ``task5_sl_typed`` data is unrecoverable —
    the column comes back with every row ``false`` (see module docstring)."""
    op.drop_index(op.f("ix_cap0_order_kehoach_order_id"), table_name="cap0_order_kehoach")
    op.drop_table("cap0_order_kehoach")
    _LY_DO_DOI_THUONG.drop(op.get_bind(), checkfirst=True)

    op.alter_column(
        "cap0_progress", "task5_debrief_done", new_column_name="task6_debrief_done"
    )
    op.add_column(
        "cap0_progress",
        sa.Column("task5_sl_typed", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "cap0_progress",
        sa.Column("task_6_done_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Move the ⑤ timestamp back to the old ⑥ slot so the 6-task numbering is
    # coherent again; the old ⑤ ("mua lần 2 có cắt lỗ") never happened under v3.0.
    op.execute(
        "UPDATE cap0_progress SET task_6_done_at = task_5_done_at, task_5_done_at = NULL"
    )
