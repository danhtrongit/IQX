"""add_sepay_ipn_logs_table

Revision ID: d390a8737111
Revises: 66b36f343615
Create Date: 2026-05-21 15:12:58.495101

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'd390a8737111'
down_revision: Union[str, None] = '66b36f343615'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sepay_ipn_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("secret_key_valid", sa.Boolean(), nullable=False),
        sa.Column("raw_body", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("raw_headers", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("result_status", sa.String(length=60), nullable=True),
        sa.Column("matched_order_id", sa.Uuid(), nullable=True),
        sa.Column("sepay_transaction_id", sa.String(length=200), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["matched_order_id"],
            ["premium_payment_orders.id"],
            name=op.f("fk_sepay_ipn_logs_matched_order_id_premium_payment_orders"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sepay_ipn_logs")),
    )
    op.create_index(op.f("ix_sepay_ipn_logs_received_at"), "sepay_ipn_logs", ["received_at"])
    op.create_index(op.f("ix_sepay_ipn_logs_secret_key_valid"), "sepay_ipn_logs", ["secret_key_valid"])
    op.create_index(op.f("ix_sepay_ipn_logs_result_status"), "sepay_ipn_logs", ["result_status"])
    op.create_index(op.f("ix_sepay_ipn_logs_matched_order_id"), "sepay_ipn_logs", ["matched_order_id"])
    op.create_index(op.f("ix_sepay_ipn_logs_sepay_transaction_id"), "sepay_ipn_logs", ["sepay_transaction_id"])
    op.create_index(
        "ix_sepay_ipn_logs_received_status",
        "sepay_ipn_logs",
        ["received_at", "result_status"],
    )


def downgrade() -> None:
    op.drop_index("ix_sepay_ipn_logs_received_status", table_name="sepay_ipn_logs")
    op.drop_index(op.f("ix_sepay_ipn_logs_sepay_transaction_id"), table_name="sepay_ipn_logs")
    op.drop_index(op.f("ix_sepay_ipn_logs_matched_order_id"), table_name="sepay_ipn_logs")
    op.drop_index(op.f("ix_sepay_ipn_logs_result_status"), table_name="sepay_ipn_logs")
    op.drop_index(op.f("ix_sepay_ipn_logs_secret_key_valid"), table_name="sepay_ipn_logs")
    op.drop_index(op.f("ix_sepay_ipn_logs_received_at"), table_name="sepay_ipn_logs")
    op.drop_table("sepay_ipn_logs")
