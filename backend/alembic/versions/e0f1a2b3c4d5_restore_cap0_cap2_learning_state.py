"""Restore the documented Cấp 0 journey and Cấp 2 learning-tool state.

Revision ID: e0f1a2b3c4d5
Revises: d9e0f1a2b3c4

The four-task Cấp-0 experiment collapsed three product tours into tab-open
tasks. This revision restores the five-task contract without retrograding
users who already graduated. Non-graduates keep only evidence that maps
unambiguously: old ①+②+③ jointly become new ① and old ④ becomes new ⑤.
New tour tasks start empty because opening a tab is not evidence of a tour.
"""

import sqlalchemy as sa

from alembic import op

revision = "e0f1a2b3c4d5"
down_revision = "d9e0f1a2b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # PostgreSQL enum values must exist before rows can be canonicalized.
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE cap3_cach_khoi_luong ADD VALUE IF NOT EXISTS 'khau_vi_tu_tin'")
            op.execute("ALTER TYPE cap3_cach_khoi_luong ADD VALUE IF NOT EXISTS 'chia_deu'")
    op.execute(
        sa.text(
            """UPDATE order_kehoach
               SET cach_khoi_luong = CASE cach_khoi_luong
                 WHEN 'linh_hoat' THEN 'khau_vi_tu_tin'
                 WHEN 'ky_luat' THEN 'chia_deu'
                 ELSE cach_khoi_luong END
               WHERE cach_khoi_luong IN ('linh_hoat', 'ky_luat')"""
        )
    )
    with op.batch_alter_table("cap0_progress") as batch:
        batch.add_column(sa.Column("task_5_done_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(
            sa.Column("task1_star_clicked", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch.add_column(
            sa.Column("task5_debrief_done", sa.Boolean(), nullable=False, server_default=sa.false())
        )

    # Preserve old facts before task ②-④ get their documented meanings back.
    op.execute(
        sa.text(
            """
            UPDATE cap0_progress
            SET
              task1_star_clicked = CASE
                WHEN graduated_at IS NOT NULL OR task_3_done_at IS NOT NULL THEN true
                ELSE false
              END,
              task_1_done_at = CASE
                WHEN graduated_at IS NOT NULL THEN COALESCE(task_1_done_at, entered_at)
                WHEN task_1_done_at IS NOT NULL
                 AND task_2_done_at IS NOT NULL
                 AND task_3_done_at IS NOT NULL THEN task_3_done_at
                ELSE NULL
              END,
              task_2_done_at = CASE WHEN graduated_at IS NOT NULL
                THEN COALESCE(task_2_done_at, entered_at) ELSE NULL END,
              task_3_done_at = CASE WHEN graduated_at IS NOT NULL
                THEN COALESCE(task_3_done_at, entered_at) ELSE NULL END,
              task_4_done_at = CASE WHEN graduated_at IS NOT NULL
                THEN COALESCE(task_4_done_at, entered_at) ELSE NULL END,
              task_5_done_at = CASE
                WHEN graduated_at IS NOT NULL THEN COALESCE(task_4_done_at, entered_at)
                ELSE task_4_done_at
              END,
              task5_debrief_done = CASE
                WHEN graduated_at IS NOT NULL THEN true ELSE task4_debrief_done
              END
            """
        )
    )
    with op.batch_alter_table("cap0_progress") as batch:
        batch.drop_column("task4_debrief_done")

    with op.batch_alter_table("user_placement") as batch:
        batch.add_column(
            sa.Column("experience", sa.String(16), nullable=False, server_default="never")
        )
        batch.add_column(
            sa.Column("da_xem_tour", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch.add_column(sa.Column("tour_bantin_done_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("tour_phantich_done_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("tour_bctc_done_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE user_placement
            SET experience = CASE
              WHEN placed_level = 1 THEN 'unsure'
              WHEN placed_level >= 2 THEN 'regular'
              ELSE 'never'
            END
            """
        )
    )

    with op.batch_alter_table("cap2_progress") as batch:
        batch.add_column(sa.Column("chuoi_current", sa.Integer(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("chuoi_record", sa.Integer(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("last_chuoi_reset_at", sa.DateTime(timezone=True), nullable=True))

    with op.batch_alter_table("order_ketso") as batch:
        batch.add_column(sa.Column("ghi_chu_nhin_lai", sa.String(2000), nullable=True))


def downgrade() -> None:
    op.execute(
        sa.text(
            """UPDATE order_kehoach
               SET cach_khoi_luong = CASE cach_khoi_luong
                 WHEN 'khau_vi_tu_tin' THEN 'linh_hoat'
                 WHEN 'chia_deu' THEN 'ky_luat'
                 ELSE cach_khoi_luong END
               WHERE cach_khoi_luong IN ('khau_vi_tu_tin', 'chia_deu')"""
        )
    )
    with op.batch_alter_table("order_ketso") as batch:
        batch.drop_column("ghi_chu_nhin_lai")
    with op.batch_alter_table("cap2_progress") as batch:
        batch.drop_column("last_chuoi_reset_at")
        batch.drop_column("chuoi_record")
        batch.drop_column("chuoi_current")
    with op.batch_alter_table("user_placement") as batch:
        batch.drop_column("tour_bctc_done_at")
        batch.drop_column("tour_phantich_done_at")
        batch.drop_column("tour_bantin_done_at")
        batch.drop_column("da_xem_tour")
        batch.drop_column("experience")

    with op.batch_alter_table("cap0_progress") as batch:
        batch.add_column(
            sa.Column("task4_debrief_done", sa.Boolean(), nullable=False, server_default=sa.false())
        )
    op.execute(
        sa.text(
            """
            UPDATE cap0_progress
            SET
              task_2_done_at = task_1_done_at,
              task_3_done_at = task_1_done_at,
              task_4_done_at = task_5_done_at,
              task4_debrief_done = task5_debrief_done
            """
        )
    )
    with op.batch_alter_table("cap0_progress") as batch:
        batch.drop_column("task5_debrief_done")
        batch.drop_column("task1_star_clicked")
        batch.drop_column("task_5_done_at")
