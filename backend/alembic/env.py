"""Alembic async environment configuration.

The database URL is loaded from app settings (not hardcoded in alembic.ini).
"""

import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import create_engine, pool
from sqlalchemy.engine import Connection

from alembic import context

# Add the project root (backend/) to sys.path so `import app` works
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings  # noqa: E402
from app.core.database import Base  # noqa: E402
from app.models.premium import PremiumPaymentOrder, PremiumPlan, PremiumSubscription  # noqa: F401, E402
from app.models.refresh_token import RefreshToken  # noqa: F401, E402
from app.models.symbol import Symbol  # noqa: F401, E402

# Import all models so Alembic can detect them
from app.models.user import User  # noqa: F401, E402
from app.models.virtual_trading import (  # noqa: F401, E402
    VirtualCashLedger,
    VirtualOrder,
    VirtualPosition,
    VirtualSettlement,
    VirtualTrade,
    VirtualTradingAccount,
    VirtualTradingConfig,
)

# Alembic Config object
config = context.config

# Logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Target metadata for autogenerate
target_metadata = Base.metadata

# ── Tables managed by this Alembic instance ──────────
# Only these tables will be tracked by autogenerate.
# Existing legacy tables (from Prisma/old project) are ignored.
MANAGED_TABLES = {t.name for t in Base.metadata.sorted_tables}


def include_name(name, type_, parent_names):
    """Filter to only include tables managed by our SQLAlchemy models."""
    if type_ == "table":
        return name in MANAGED_TABLES
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    settings = get_settings()
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_name=include_name,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_name=include_name,
    )

    with context.begin_transaction():
        context.run_migrations()


def _sync_db_url() -> str:
    """Convert the runtime async URL to a sync psycopg URL for Alembic.

    asyncpg's prepared-statement protocol mis-handles raw DDL like
    ``CREATE TYPE`` (the statement gets executed twice). Migrations
    use the sync ``psycopg`` driver instead; the runtime app still uses
    ``asyncpg`` unchanged.
    """
    settings = get_settings()
    return settings.DATABASE_URL.replace("+asyncpg", "+psycopg")


def run_migrations_online() -> None:
    """Run migrations in 'online' mode using a sync psycopg engine."""
    connectable = create_engine(_sync_db_url(), poolclass=pool.NullPool)
    with connectable.connect() as connection:
        do_run_migrations(connection)
        connection.commit()
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
