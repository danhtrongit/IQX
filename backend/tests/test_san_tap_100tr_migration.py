"""Contract tests for the Sân tập 100tr migration on a database that predates it.

The point of the migration is a database that ALREADY has an active
``virtual_trading_configs`` row at the old 1-tỷ figure: ``account/activate`` and
the admin reset read that row, so the new code default alone would leave such a
database seeding 1 tỷ. Accounts already opened must keep their balances.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import sqlalchemy as sa

MIGRATION = Path(__file__).parents[1] / "alembic" / "versions" / "b7c8d9e0f1a2_san_tap_100tr.py"

_PRE_CUTOVER_DDL = (
    """
    CREATE TABLE cap0_progress (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        entered_at TIMESTAMP NOT NULL,
        virtual_balance_init BIGINT NOT NULL DEFAULT 250000000
    )
    """,
    """
    CREATE TABLE virtual_trading_configs (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        initial_cash_vnd BIGINT NOT NULL,
        is_active BOOLEAN NOT NULL
    )
    """,
    """
    CREATE TABLE virtual_trading_accounts (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        initial_cash_vnd BIGINT NOT NULL,
        cash_available_vnd BIGINT NOT NULL
    )
    """,
)


def _load_migration():
    spec = importlib.util.spec_from_file_location("san_tap_100tr_migration", MIGRATION)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_migration(conn, direction: str) -> None:
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    with Operations.context(MigrationContext.configure(conn)):
        getattr(_load_migration(), direction)()


def _seed(conn) -> None:
    for ddl in _PRE_CUTOVER_DDL:
        conn.exec_driver_sql(ddl)
    conn.exec_driver_sql(
        "INSERT INTO virtual_trading_configs (id, initial_cash_vnd, is_active) VALUES "
        "('active-old', 1000000000, 1), ('retired', 500000000, 0)"
    )
    # A user mid-journey: opened at 1 tỷ, already traded down to 900tr.
    conn.exec_driver_sql(
        "INSERT INTO virtual_trading_accounts (id, initial_cash_vnd, cash_available_vnd) VALUES "
        "('traded', 1000000000, 900000000)"
    )


def _config(conn, row_id: str) -> int:
    return conn.exec_driver_sql(
        f"SELECT initial_cash_vnd FROM virtual_trading_configs WHERE id = '{row_id}'"
    ).scalar_one()


def _cap0_default(conn) -> str:
    cols = conn.exec_driver_sql("PRAGMA table_info(cap0_progress)").fetchall()
    return next(str(c[4]).strip("'") for c in cols if c[1] == "virtual_balance_init")


def test_upgrade_moves_active_config_to_100tr_and_leaves_accounts_alone():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed(conn)
        _run_migration(conn, "upgrade")

        assert _config(conn, "active-old") == 100_000_000
        assert _config(conn, "retired") == 500_000_000  # inactive rows untouched
        assert _cap0_default(conn) == "100000000"

        traded = conn.exec_driver_sql(
            "SELECT initial_cash_vnd, cash_available_vnd FROM virtual_trading_accounts WHERE id = 'traded'"
        ).one()
        assert tuple(traded) == (1_000_000_000, 900_000_000)


def test_downgrade_restores_old_figures_only_where_the_upgrade_wrote_them():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed(conn)
        _run_migration(conn, "upgrade")
        _run_migration(conn, "downgrade")

        assert _config(conn, "active-old") == 1_000_000_000
        assert _config(conn, "retired") == 500_000_000
        assert _cap0_default(conn) == "250000000"
