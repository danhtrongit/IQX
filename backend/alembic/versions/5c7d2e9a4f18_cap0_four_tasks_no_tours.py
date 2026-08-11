"""cap0 — 4 nhiệm vụ: tách Chặng 1 làm 3, bỏ 3 tour khỏi Cấp 0

Revision ID: 5c7d2e9a4f18
Revises: 9a4c2f1e7b60
Create Date: 2026-08-12 09:00:00.000000

Cấp 0 goes from **5 nhiệm vụ** (① lệnh đầu + Nắm giữ + Theo dõi · ②③④ ba tour
sản phẩm · ⑤ bán + Kết sổ) to **4 nhiệm vụ**, with no chặng grouping:

    ① Đặt lệnh mua đầu tiên   ② Xem tab Nắm giữ
    ③ Xem tab Theo dõi        ④ Bán một lệnh — kết sổ đầu tiên

The three product tours leave Cấp 0 entirely, so the columns that held their
timestamps are re-purposed rather than kept.

★ THE ORDER OF THE FIRST TWO STATEMENTS IS THE WHOLE POINT.

``task_2_done_at``/``task_3_done_at`` currently hold TOUR timestamps whose
meaning is being deleted. The new ②③ are different facts ("đã xem tab Nắm giữ",
"đã xem tab Theo dõi"), and the one thing we know for sure is that **anybody who
completed the old ① has done both**: the old ① required buying a stock AND
starring one, which is only reachable through those two tabs. So the new ②③ are
derived FROM THE OLD ①, and the tour data is discarded:

    UPDATE cap0_progress SET task_2_done_at = task_1_done_at,
                             task_3_done_at = task_1_done_at

Copying rather than keeping matters in both directions. A user who had done the
tours but never bought would otherwise read "2/4 — đã xem tab Nắm giữ" without
ever having owned a share; and a user who had finished old ① but skipped the
tours would be dragged back to 1/4 for two things they demonstrably did. Because
②③ are copies of ①, a NULL ① yields NULL ②③ — no migrated row can violate the
ordering rule ``Cap0Service.complete_task`` now enforces (②③ refused before ①).

Then ⑤ ("bán + Kết sổ", the single behaviour gate) slides down to ④:

    UPDATE cap0_progress SET task_4_done_at = task_5_done_at

which must run BEFORE ``task_5_done_at`` is dropped, and AFTER nothing else
reads the old ④ tour timestamp it overwrites.

**Production check this must survive** (verified against prod data): one row is
fully graduated — all five old task columns set, ``task5_debrief_done`` true,
``graduated_at`` set. It comes out **4/4 + gate + still graduated**. The other
three rows entered Cấp 0 and did nothing; they stay completely empty, because
copying NULL into ②③ is still NULL. ``tests/test_cap0.py::
test_migration_carries_the_graduated_prod_row_to_4_of_4`` and
``::test_migration_leaves_the_three_empty_prod_rows_empty`` seed exactly those
four rows and pin both outcomes.

``task1_star_clicked`` is dropped: the ★ is no longer any task's requirement —
the new ③ completes by opening the Theo dõi tab — so keeping the column would
leave a flag nothing writes and nothing reads.

DOWNGRADE IS LOSSY — say it plainly. Two kinds of data are destroyed on the way
up and **cannot be reconstructed**:

1. the three TOUR timestamps (old ②③④), overwritten by the copies above;
2. ``task1_star_clicked``, dropped outright.

The downgrade restores the SHAPE and the facts that still exist: ④ moves back to
the ⑤ slot with its gate, and the ②③ copies are WITHDRAWN (set NULL) rather than
left behind — under the old numbering those columns mean "đã xem tour bảng
điện / bản tin", which is not what they now contain, and inventing two tours a
user never took is worse than showing them as outstanding. ``task1_star_clicked``
comes back with its ``false`` default, so everyone looks as though they never
clicked ★. ``graduated_at`` is never touched, so a graduated user stays
graduated in both directions (Cấp 1 entry only reads that column).

upgrade → downgrade → upgrade is a stable round trip
(``::test_migration_round_trips_up_down_up``).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5c7d2e9a4f18"
down_revision: Union[str, None] = "9a4c2f1e7b60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ① The new ②③ ("xem tab Nắm giữ / Theo dõi") are DERIVED FROM THE OLD ①,
    #    discarding the tour timestamps those columns held. See the docstring —
    #    this must happen before anything drops or renames a column.
    op.execute(
        "UPDATE cap0_progress "
        "SET task_2_done_at = task_1_done_at, task_3_done_at = task_1_done_at"
    )

    # ② "Bán một lệnh — kết sổ đầu tiên" moves ⑤ → ④, overwriting the old ④
    #    tour timestamp (already meaningless after step ①).
    op.execute("UPDATE cap0_progress SET task_4_done_at = task_5_done_at")

    # ③ Now the 5th slot has no owner.
    op.drop_column("cap0_progress", "task_5_done_at")

    # ④ The single behaviour gate follows its task number.
    op.alter_column(
        "cap0_progress", "task5_debrief_done", new_column_name="task4_debrief_done"
    )

    # ⑤ The ★ is no longer any task's requirement — drop the flag rather than
    #    leave a column nothing writes. UNRECOVERABLE (see the docstring).
    op.drop_column("cap0_progress", "task1_star_clicked")


def downgrade() -> None:
    """Restore the 5-task shape. LOSSY: the three tour timestamps and
    ``task1_star_clicked`` are unrecoverable — see the module docstring."""
    op.add_column(
        "cap0_progress",
        sa.Column("task1_star_clicked", sa.Boolean(), server_default="false", nullable=False),
    )
    op.alter_column(
        "cap0_progress", "task4_debrief_done", new_column_name="task5_debrief_done"
    )
    op.add_column(
        "cap0_progress",
        sa.Column("task_5_done_at", sa.DateTime(timezone=True), nullable=True),
    )

    # "Bán + Kết sổ" goes back to the ⑤ slot, and the ②③ copies are withdrawn:
    # under the old numbering those columns claim two product tours, which is
    # not the fact they now hold.
    op.execute(
        "UPDATE cap0_progress SET "
        "task_5_done_at = task_4_done_at, "
        "task_4_done_at = NULL, "
        "task_3_done_at = NULL, "
        "task_2_done_at = NULL"
    )
