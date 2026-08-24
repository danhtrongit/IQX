"""cap2 — 2 nhiệm vụ → ĐÚNG MỘT: bỏ nhiệm vụ ② «Thực hiện đúng khi giá chạm mốc»

Revision ID: 9c3f7ad10b52
Revises: b2e6f4a17c93
Create Date: 2026-08-24 10:00:00.000000

Cấp 2 «Kỷ luật» goes from **2 nhiệm vụ làm song song to ĐÚNG MỘT** — source of
truth is the mockup ``demo-trading/LEVEL 2/iqx-cap2-hanhtrinh.html``, which
draws ``CẤP 2 · 0/1``, a ``.ck-head`` reading ``Trước khi lên Cấp 3 · 0/1`` and
a single ``.task`` row:

  ① «10 lệnh Thực chiến có đặt cắt lỗ / chốt lời»  → ``so_lenh_co_cl_tp``

Nhiệm vụ ② («Thực hiện đúng khi giá chạm mốc», 2 lần) is gone, so its
completion stamp ``task_2_done_at`` goes with it. The level gated graduation on
the market happening to touch one of the user's marks — something the user does
not control — and now gates only on PLACING the marks.

★ **① KEEPS ITS SLOT.** Nothing is renumbered: ``task_1_done_at`` is the same
column, meaning the same thing, before and after. Only the ② slot is removed.
Nobody who had earned ① loses it, and nobody gains ① they had not earned.

★ **NO COLUMN IS ADDED** and, in particular, the three counters
``so_lan_cat_lo_dung`` / ``so_lan_chot_loi_dung`` / ``so_lan_thuc_hien_dung``
are **deliberately NOT dropped**, even though no nhiệm vụ reads them any more.
Checked before writing this revision, and they DO still have readers:

  · ``dashboard/src/features/cap2/portfolioAnalysisCap2.ts#computeSlTpUsageCap2``
    reads all three for khối ④ «Bạn đã dùng cơ chế cắt lỗ / chốt lời thế nào»
    (🛑 / 🎯 / ✅) plus the «Thực hiện đúng» stat in khối ①.
  · That block is drawn by the UNCHANGED mockup
    ``iqx-cap2-phantich-danhmuc.html`` (byte-identical through this change),
    and Cấp 3-8's own Phân tích pages re-render the very same component with
    this row as its source (``Cap2PortfolioAnalysis`` + its ``host`` prop).

They are therefore reclassified, not deleted: DESCRIPTIVE analytics, never a
checklist item, never an ``x/2``. ``Cap2Service._dem_thuc_hien_dung`` keeps
computing them on every write.

★ This migration deliberately does NOT touch ``graduated_at`` /
``time_to_graduate_hours``. Users who already graduated Cấp 2 under the 2/2
rule stay graduated. Users mid-flight with ① stamped and ② not become eligible
to graduate the moment this ships — which is exactly right: the level is one
nhiệm vụ now, and they have done it.

DOWNGRADE IS LOSSY — say it plainly. ``task_2_done_at`` is deleted here and
CANNOT be reconstructed on the way back: the downgrade recreates it NULL, so
every user returns looking as though they never completed ②. (The pre-change
service DID re-stamp ② from ``order_ketso`` history on the next
``record_kehoach``/``record_ketso``/``PATCH /cap2/task``, so a downgraded
deployment would heal the stamp on its own for anyone still trading — but the
exact original completion TIMESTAMP is gone for good.) Every other column
survives both directions untouched, which makes upgrade → downgrade → upgrade a
stable round trip: the second upgrade lands on byte-identical rows.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9c3f7ad10b52"
down_revision: Union[str, None] = "b2e6f4a17c93"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

#: The one and only column this revision touches.
_TASK_2_COLUMN = "task_2_done_at"


def upgrade() -> None:
    op.drop_column("cap2_progress", _TASK_2_COLUMN)


def downgrade() -> None:
    # Nullable from the start — "chưa xong nhiệm vụ ②" must read as unknown,
    # never as a stamped-at-epoch completion.
    op.add_column(
        "cap2_progress",
        sa.Column(_TASK_2_COLUMN, sa.DateTime(timezone=True), nullable=True),
    )
