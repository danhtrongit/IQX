"""cap2 — 2 nhiệm vụ song song: 10 lệnh có CL/CL + thực hiện đúng khi chạm mốc

Revision ID: 8f1a5c7d2e64
Revises: 4d8e6b2a1c93
Create Date: 2026-08-14 10:00:00.000000

Cấp 2 goes from **5 nhiệm vụ + a discipline apparatus to 2 nhiệm vụ làm song
song** (mockup ``iqx-cap2-hanhtrinh.html``):

  ① «10 lệnh Thực chiến có đặt cắt lỗ / chốt lời»  → ``so_lenh_co_cl_tp``
  ② «Thực hiện đúng khi giá chạm mốc» — 2 lần      → ``so_lan_thuc_hien_dung``

The level now teaches the MECHANISM (đặt mốc, rồi làm theo mốc). The chuỗi
lệnh kỷ luật and the old ③④⑤ measured *sustained* discipline, which is the job
of the levels above — so their columns go.

★ ① AND ② KEEP THEIR SLOTS. Unlike Cấp 1's 6→5 reshuffle, nothing is renumbered
here: the new ① and ② are written into ``task_1_done_at``/``task_2_done_at``
directly, and ③④⑤ are dropped.

  · Old ② ("≥5 lần cắt lỗ đúng phiên / 15 lệnh gần nhất") strictly IMPLIES the
    new ② ("2 lần thực hiện đúng") — 5 ≥ 2, and cắt lỗ đúng phiên is one of the
    two executions the new task counts. Keeping that stamp is sound.
  · Old ① was "chuỗi 5 lệnh liên tiếp không vi phạm", which does NOT imply the
    new ① ("10 lệnh có cắt lỗ + chốt lời") — a 5-lệnh user could hold a stamp
    they have not earned under the new bar. This is accepted deliberately:
    ``cap2_progress`` is empty in production (Cấp 2 has been unreachable in the
    FE since 2026-08-08, routing stops at Cấp 1), and revoking ① would be the
    harsher error if any mid-flight row did exist. The visible effect on such a
    row would be a ticked ① sitting next to an honest "n/10 lệnh" counter, since
    ``so_lenh_co_cl_tp`` is re-derived from ``order_kehoach`` on the next
    recompute and is never trusted from this table.

★ The new counters are created at 0 rather than back-filled by SQL. Both are
pure functions of ``order_kehoach``/``order_ketso`` and the service recomputes
them on every ``record_kehoach``/``record_ketso``/``PATCH /cap2/task`` — a
hand-written back-fill here would be a second, drifting implementation of the
same rule. The first write after deploy makes them correct.

★ This migration deliberately does NOT touch ``graduated_at``. Reaching 2/2 is
not graduating — graduation is a user action (``POST /cap2/graduate``) with its
own "tốt nghiệp" moment and its own ``time_to_graduate_hours``.

DOWNGRADE IS LOSSY — say it plainly. ``task_3_done_at``/``task_4_done_at``/
``task_5_done_at`` and ``chuoi_current``/``chuoi_record``/
``last_chuoi_reset_at`` are deleted here and CANNOT be reconstructed on the way
back: the downgrade recreates them at their NULL/0 defaults, so every user
returns looking as though they never completed ③④⑤ and never held a chuỗi. (The
pre-change service did recompute chuỗi from ``order_ketso`` on the next Kết sổ,
so a downgraded deployment would heal the streak on its own — but the exact
completion TIMESTAMPS are gone for good.) ``task_1_done_at``/``task_2_done_at``
survive both directions untouched, which makes upgrade → downgrade → upgrade a
stable round trip.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8f1a5c7d2e64"
down_revision: Union[str, None] = "4d8e6b2a1c93"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

#: ①/② counters. Created NOT NULL DEFAULT 0 — see the docstring on why they are
#: not back-filled by SQL.
_NEW_COUNTERS = (
    "so_lenh_co_cl_tp",
    "so_lan_cat_lo_dung",
    "so_lan_chot_loi_dung",
    "so_lan_thuc_hien_dung",
)

#: The 5-task numbering's tail, dropped wholesale (no target slot to keep them).
_DROPPED_TASKS = ("task_3_done_at", "task_4_done_at", "task_5_done_at")


def upgrade() -> None:
    for name in _NEW_COUNTERS:
        op.add_column(
            "cap2_progress",
            sa.Column(name, sa.Integer(), server_default="0", nullable=False),
        )

    # ③④⑤ have no successor task — the level is 2 nhiệm vụ now.
    for name in _DROPPED_TASKS:
        op.drop_column("cap2_progress", name)

    # Chuỗi lệnh kỷ luật leaves Cấp 2 with the tasks that measured it.
    op.drop_column("cap2_progress", "chuoi_current")
    op.drop_column("cap2_progress", "chuoi_record")
    op.drop_column("cap2_progress", "last_chuoi_reset_at")


def downgrade() -> None:
    op.add_column(
        "cap2_progress",
        sa.Column("chuoi_current", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "cap2_progress",
        sa.Column("chuoi_record", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "cap2_progress",
        sa.Column("last_chuoi_reset_at", sa.DateTime(timezone=True), nullable=True),
    )
    for name in _DROPPED_TASKS:
        op.add_column(
            "cap2_progress", sa.Column(name, sa.DateTime(timezone=True), nullable=True)
        )

    for name in _NEW_COUNTERS:
        op.drop_column("cap2_progress", name)
