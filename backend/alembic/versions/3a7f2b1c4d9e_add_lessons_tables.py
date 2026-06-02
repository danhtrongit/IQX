"""add_lessons_tables

Revision ID: 3a7f2b1c4d9e
Revises: 97f9d297c95e
Create Date: 2026-05-23 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3a7f2b1c4d9e"
down_revision: Union[str, None] = "97f9d297c95e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── courses ─────────────────────────────────────────────────────────────
    op.create_table(
        "courses",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("thumbnail_url", sa.String(500), nullable=True),
        sa.Column("level", sa.String(20), nullable=False),
        sa.Column("category", sa.String(60), nullable=False),
        sa.Column("is_premium", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("total_episodes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("total_duration_seconds", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_courses_slug", "courses", ["slug"], unique=True)
    op.create_index("ix_courses_category", "courses", ["category"])
    op.create_index("ix_courses_catalog", "courses", ["is_published", "is_premium", "category"])
    op.create_index("ix_courses_created_at", "courses", ["created_at"])

    # ── episodes ─────────────────────────────────────────────────────────────
    op.create_table(
        "episodes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("course_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("content_type", sa.String(20), nullable=False),
        sa.Column("file_url", sa.String(500), nullable=True),
        sa.Column("markdown_body", sa.Text(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(content_type = 'text' AND markdown_body IS NOT NULL AND file_url IS NULL) "
            "OR (content_type IN ('pdf','video') AND file_url IS NOT NULL AND markdown_body IS NULL)",
            name="ck_episodes_content_type_payload",
        ),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["courses.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("course_id", "sort_order", name="uq_episodes_course_sort"),
    )
    op.create_index("ix_episodes_course_id", "episodes", ["course_id"])
    op.create_index("ix_episodes_course_sort", "episodes", ["course_id", "sort_order"])

    # ── episode_progress ─────────────────────────────────────────────────────
    op.create_table(
        "episode_progress",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("episode_id", sa.UUID(), nullable=False),
        sa.Column("course_id", sa.UUID(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_position_seconds", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["episode_id"], ["episodes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "episode_id"),
    )
    op.create_index("ix_ep_progress_course_id", "episode_progress", ["course_id"])
    op.create_index(
        "ix_ep_progress_user_course",
        "episode_progress",
        ["user_id", "course_id", "completed_at"],
    )


def downgrade() -> None:
    op.drop_table("episode_progress")
    op.drop_table("episodes")
    op.drop_table("courses")
