"""add sector_median_cache

Revision ID: 3f9a1c7be204
Revises: f2b7b5c064a3
Create Date: 2026-07-15 00:00:00.000000

Adds sector_median_cache table: one row per (icb_lv2, asof_date) holding the
sector-relative ratio medians (JSONB) computed by the peer-median service,
with a unique constraint on (icb_lv2, asof_date).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "3f9a1c7be204"
down_revision: Union[str, None] = "f2b7b5c064a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sector_median_cache",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("icb_lv2", sa.String(length=100), nullable=False),
        sa.Column("asof_date", sa.Date(), nullable=False),
        sa.Column("medians", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("peer_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sector_median_cache")),
        sa.UniqueConstraint("icb_lv2", "asof_date", name="uq_sector_median_icb_asof"),
    )
    op.create_index(
        op.f("ix_sector_median_cache_icb_lv2"),
        "sector_median_cache",
        ["icb_lv2"],
        unique=False,
    )
    op.create_index(
        op.f("ix_sector_median_cache_asof_date"),
        "sector_median_cache",
        ["asof_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_sector_median_cache_asof_date"), table_name="sector_median_cache"
    )
    op.drop_index(
        op.f("ix_sector_median_cache_icb_lv2"), table_name="sector_median_cache"
    )
    op.drop_table("sector_median_cache")
