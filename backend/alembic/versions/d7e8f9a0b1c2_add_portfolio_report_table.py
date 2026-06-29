"""add_portfolio_report_table

Revision ID: d7e8f9a0b1c2
Revises: c9d0e1f2a3b4
Create Date: 2026-06-29 00:00:00.000000

Adds the ``portfolio_reports`` table backing the PortfolioReport model.
Keyed by (account_id, session_date) — the day-cache for portfolio manager
AI analysis. FK to virtual_trading_accounts with ondelete=CASCADE.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "portfolio_reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("period_number", sa.Integer(), nullable=False),
        sa.Column("mode", sa.String(length=20), nullable=False),
        sa.Column("analysis_json", sa.JSON(), nullable=False),
        sa.Column("narrative_json", sa.JSON(), nullable=True),
        sa.Column("scores", sa.JSON(), nullable=True),
        sa.Column("recommended_actions", sa.JSON(), nullable=True),
        sa.Column("watch_conditions", sa.JSON(), nullable=True),
        sa.Column("holdings_snapshot", sa.JSON(), nullable=True),
        sa.Column("model_used", sa.String(length=50), nullable=True),
        sa.Column("generation_time_ms", sa.Integer(), nullable=True),
        sa.Column("valid", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_portfolio_reports")),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["virtual_trading_accounts.id"],
            name=op.f("fk_portfolio_reports_account_id_virtual_trading_accounts"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("account_id", "session_date", name="uq_portfolio_reports_account_date"),
    )
    op.create_index(
        op.f("ix_portfolio_reports_account_id"), "portfolio_reports", ["account_id"], unique=False
    )
    op.create_index(
        op.f("ix_portfolio_reports_session_date"), "portfolio_reports", ["session_date"], unique=False
    )
    op.create_index(
        "ix_portfolio_reports_account_date", "portfolio_reports", ["account_id", "session_date"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_portfolio_reports_account_date", table_name="portfolio_reports")
    op.drop_index(op.f("ix_portfolio_reports_session_date"), table_name="portfolio_reports")
    op.drop_index(op.f("ix_portfolio_reports_account_id"), table_name="portfolio_reports")
    op.drop_table("portfolio_reports")
