"""Database-backed contract tests for the lossy Cấp 7 balance migration."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import sqlalchemy as sa

MIGRATION = Path(__file__).parents[1] / "alembic" / "versions" / "e4f5a6b7c8d9_cap7_live_portfolio_balance.py"

_PROGRESS_DDL = """
CREATE TABLE cap7_progress (
 id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36), entered_at TIMESTAMP,
 task_1_done_at TIMESTAMP, task_2_done_at TIMESTAMP, task_3_done_at TIMESTAMP,
 so_lenh_doc_luc INTEGER NOT NULL DEFAULT 0, so_lan_khong_duoi_theo_co INTEGER NOT NULL DEFAULT 0,
 ty_le_doc_luc_dung FLOAT NOT NULL DEFAULT 0, graduated_at TIMESTAMP, time_to_graduate_hours FLOAT
)
"""
_ORDER_DDL = """
CREATE TABLE order_kehoach (
 id VARCHAR(36) PRIMARY KEY, luc_chi_so NUMERIC, luc_doc_user VARCHAR(8), doc_luc_dung BOOLEAN,
 dien_bien_pct FLOAT, co_canh_giac_lenh_gia BOOLEAN, hanh_vi_co VARCHAR(16)
)
"""


def migration():
    spec = importlib.util.spec_from_file_location("cap7_balance_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def run(conn, direction: str) -> None:
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    context = MigrationContext.configure(conn)
    with Operations.context(context):
        getattr(migration(), direction)()


def columns(conn, table: str) -> list[str]:
    return [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()]


def test_upgrade_removes_legacy_credit_but_preserves_graduation_history():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.exec_driver_sql(_PROGRESS_DDL)
        conn.exec_driver_sql(_ORDER_DDL)
        conn.exec_driver_sql(
            "INSERT INTO cap7_progress VALUES ('p', 'u', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', 15, 3, 80, '2026-01-05', 96)"
        )
        conn.exec_driver_sql("INSERT INTO order_kehoach VALUES ('o', 1.9, 'manh', 1, 2.0, 1, 'cho_xac_nhan')")
        run(conn, "upgrade")
        row = conn.exec_driver_sql("SELECT can_doi_ok, graduated_at, time_to_graduate_hours FROM cap7_progress").one()
        assert row == (0, "2026-01-05", 96.0)
        assert "task_1_done_at" not in columns(conn, "cap7_progress")
        assert "luc_doc_user" not in columns(conn, "order_kehoach")


def test_downgrade_restores_empty_legacy_shape_without_losing_graduation_history():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.exec_driver_sql(_PROGRESS_DDL)
        conn.exec_driver_sql(_ORDER_DDL)
        conn.exec_driver_sql("INSERT INTO cap7_progress VALUES ('p', 'u', '2026-01-01', NULL, NULL, NULL, 0, 0, 0, '2026-01-05', 96)")
        run(conn, "upgrade")
        run(conn, "downgrade")
        row = conn.exec_driver_sql("SELECT task_1_done_at, task_2_done_at, task_3_done_at, graduated_at FROM cap7_progress").one()
        assert row == (None, None, None, "2026-01-05")
        assert "luc_doc_user" in columns(conn, "order_kehoach")
