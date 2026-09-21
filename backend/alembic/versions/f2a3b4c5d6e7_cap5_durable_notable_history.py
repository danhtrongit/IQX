"""Persist the first notable consensus transition for hunted symbols.

Revision ID: f2a3b4c5d6e7
Revises: f1a2b3c4d5e6
"""

import sqlalchemy as sa

from alembic import op

revision = "f2a3b4c5d6e7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "cap5_hunt_log",
        sa.Column("notable_at", sa.DateTime(timezone=True), nullable=True),
    )
    for column in (
        sa.Column("cap5_entry_snapshot_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hunt_signal_at_entry", sa.String(200), nullable=True),
        sa.Column("hunt_first_hunted_at_entry", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hunt_sessions_at_entry", sa.Integer(), nullable=True),
        sa.Column("consensus_at_entry", sa.Integer(), nullable=True),
        sa.Column("consensus_scored_at_entry", sa.Integer(), nullable=True),
        sa.Column("consensus_captured_at_entry", sa.DateTime(timezone=True), nullable=True),
        sa.Column("support_layers", sa.JSON(), nullable=True),
        sa.Column("opposing_layers", sa.JSON(), nullable=True),
        sa.Column("neutral_layers", sa.JSON(), nullable=True),
        sa.Column("conflict_snapshot_session_date", sa.Date(), nullable=True),
        sa.Column("conflict_snapshot_at", sa.DateTime(timezone=True), nullable=True),
    ):
        op.add_column("order_kehoach", column)
    op.create_check_constraint(
        op.f("ck_order_kehoach_consensus_at_entry_range"),
        "order_kehoach",
        "consensus_at_entry IS NULL OR consensus_at_entry BETWEEN 0 AND 5",
    )
    op.create_check_constraint(
        op.f("ck_order_kehoach_consensus_scored_at_entry_range"),
        "order_kehoach",
        "consensus_scored_at_entry IS NULL OR consensus_scored_at_entry BETWEEN 0 AND 5",
    )
    op.create_check_constraint(
        op.f("ck_order_kehoach_consensus_entry_order"),
        "order_kehoach",
        "consensus_at_entry IS NULL OR consensus_scored_at_entry IS NULL "
        "OR consensus_at_entry <= consensus_scored_at_entry",
    )
    # Preserve the evidence that is still reconstructable at rollout. Deleted
    # Watchlist rows cannot be recovered, but current notable rows carry an
    # authoritative server refresh timestamp.
    op.execute(
        """
        UPDATE cap5_hunt_log
           SET notable_at = (
               SELECT watchlist_items.consensus_at
                 FROM watchlist_items
                WHERE watchlist_items.user_id = cap5_hunt_log.user_id
                  AND UPPER(watchlist_items.symbol) = UPPER(cap5_hunt_log.symbol)
                  AND watchlist_items.status = 'notable'
                  AND watchlist_items.consensus_at IS NOT NULL
                LIMIT 1
           )
         WHERE notable_at IS NULL
           AND EXISTS (
               SELECT 1
                 FROM watchlist_items
                WHERE watchlist_items.user_id = cap5_hunt_log.user_id
                  AND UPPER(watchlist_items.symbol) = UPPER(cap5_hunt_log.symbol)
                  AND watchlist_items.status = 'notable'
                  AND watchlist_items.consensus_at IS NOT NULL
           )
        """
    )


def downgrade():
    for name in (
        "consensus_entry_order",
        "consensus_scored_at_entry_range",
        "consensus_at_entry_range",
    ):
        op.drop_constraint(
            op.f(f"ck_order_kehoach_{name}"), "order_kehoach", type_="check"
        )
    for column in (
        "conflict_snapshot_at",
        "conflict_snapshot_session_date",
        "neutral_layers",
        "opposing_layers",
        "support_layers",
        "consensus_captured_at_entry",
        "consensus_scored_at_entry",
        "consensus_at_entry",
        "hunt_sessions_at_entry",
        "hunt_first_hunted_at_entry",
        "hunt_signal_at_entry",
        "cap5_entry_snapshot_at",
    ):
        op.drop_column("order_kehoach", column)
    op.drop_column("cap5_hunt_log", "notable_at")
