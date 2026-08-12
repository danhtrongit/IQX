"""cap1 — 5 nhiệm vụ: bỏ «Xem lại danh mục», ⑥ «10 lệnh Thực chiến» thành ⑤

Revision ID: 4d8e6b2a1c93
Revises: 5c7d2e9a4f18
Create Date: 2026-08-12 09:00:00.000000

Cấp 1 goes from **6 nhiệm vụ to 5**. The old ⑤ — "Xem lại danh mục: mở Phân
tích danh mục 3 lần khác ngày" — is deleted, and the old ⑥ ("10 lệnh Thực
chiến") becomes the new ⑤. The other four are unchanged. Phân tích danh mục
remains a TOOL of the level; it is simply no longer a scored task, which is why
its counter and its per-day dedupe column go with it.

★ THE ORDER OF THE FIRST TWO STATEMENTS IS THE WHOLE POINT — and so is the fact
that statement ① is an ASSIGNMENT, not a merge.

``task_5_done_at`` currently holds the deleted task's timestamp. Copying column
6 ONTO column 5 before dropping column 6 does two things at once, and both are
required:

  · A user who did the old ⑥ (10+ lệnh Thực chiến) but never the old ⑤ — which
    is exactly the shape of the one real prod row that has any progress — comes
    out at **5/5**, ready to graduate.
  · A user who did the reverse (3 lượt xem, but fewer than 10 lệnh) has their ⑤
    **revoked** — ``task_6_done_at`` was NULL for them, so the assignment NULLs
    slot 5. That is correct: the task they finished no longer exists, and the
    one now numbered ⑤ is a bar they have not cleared. A ``COALESCE``-style
    merge would hand them a free graduation.

★ This migration deliberately does NOT touch ``graduated_at``. Reaching 5/5 is
not the same as graduating — graduation is a user action (``POST
/cap1/graduate``) with its own "tốt nghiệp" moment and its own
``time_to_graduate_hours`` measurement. Stamping it here would teleport a
mid-flight user into Cấp 2 and forge a completion time they never spent.

DOWNGRADE IS LOSSY — say it plainly: ``so_lan_xem_danh_muc`` and
``last_danh_muc_view_date`` recorded how many distinct days a user opened Phân
tích danh mục, and those facts are deleted here with no way to reconstruct them
(nothing else logs the views). The downgrade recreates the columns at their
``0``/NULL defaults, so every user comes back looking as though they never
opened the panel. It does move the ⑤ timestamp back to ``task_6_done_at`` (and
NULLs ``task_5_done_at``) so the old 6-task numbering reads correctly, which
makes upgrade → downgrade → upgrade a stable round trip.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4d8e6b2a1c93"
down_revision: Union[str, None] = "5c7d2e9a4f18"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ① Carry the old ⑥ ("10 lệnh Thực chiến") forward onto the new ⑤ BEFORE
    #    the source column disappears. Unconditional on purpose — see the
    #    module docstring on why this must also REVOKE the deleted task.
    op.execute("UPDATE cap1_progress SET task_5_done_at = task_6_done_at")

    # ② Drop the 6th slot and everything that existed only to score the
    #    removed «Xem lại danh mục».
    op.drop_column("cap1_progress", "task_6_done_at")
    op.drop_column("cap1_progress", "so_lan_xem_danh_muc")
    op.drop_column("cap1_progress", "last_danh_muc_view_date")


def downgrade() -> None:
    """Restore the 6-task shape. LOSSY: the Phân tích danh mục view history is
    unrecoverable — the counters come back at 0/NULL (see module docstring)."""
    op.add_column(
        "cap1_progress",
        sa.Column("task_6_done_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "cap1_progress",
        sa.Column(
            "so_lan_xem_danh_muc", sa.Integer(), server_default="0", nullable=False
        ),
    )
    op.add_column(
        "cap1_progress",
        sa.Column("last_danh_muc_view_date", sa.Date(), nullable=True),
    )
    # Move the ⑤ timestamp back to the old ⑥ slot so the 6-task numbering is
    # coherent again; the old ⑤ ("xem danh mục 3 lần") never happened under the
    # 5-task model, and its data is gone, so slot 5 is vacated rather than
    # left claiming a streak with nothing behind it.
    op.execute(
        "UPDATE cap1_progress SET task_6_done_at = task_5_done_at, task_5_done_at = NULL"
    )
