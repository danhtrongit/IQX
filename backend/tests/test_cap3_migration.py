"""Database-backed contract tests for the lossy Cấp 3 two-task migration."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import sqlalchemy as sa


MIGRATION = Path(__file__).parents[1] / "alembic" / "versions" / "d3c2a1b4e5f6_cap3_two_concurrent_sizing_tasks.py"

_PRE_CUTOVER_CAP3_PROGRESS_DDL = """
CREATE TABLE cap3_progress (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    entered_at TIMESTAMP NOT NULL,
    khau_vi_da_dat BOOLEAN NOT NULL DEFAULT false,
    khau_vi VARCHAR(32),
    von_ban_dau BIGINT NOT NULL,
    task_1_done_at TIMESTAMP,
    task_2_done_at TIMESTAMP,
    task_3_done_at TIMESTAMP,
    so_lenh_cap3 INTEGER NOT NULL DEFAULT 0,
    lai_pct_cap3 FLOAT NOT NULL DEFAULT 0,
    diem_ky_luat_tb_cap3 FLOAT,
    graduated_at TIMESTAMP,
    time_to_graduate_hours FLOAT
)
"""


def _load_migration():
    spec = importlib.util.spec_from_file_location("cap3_two_tasks_migration", MIGRATION)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_migration(conn, direction: str) -> None:
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    with Operations.context(MigrationContext.configure(conn)):
        getattr(_load_migration(), direction)()


def _columns(conn) -> list[str]:
    return [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(cap3_progress)").fetchall()]


def _rows(conn) -> dict[str, dict]:
    columns = _columns(conn)
    records = conn.exec_driver_sql(
        f"SELECT {', '.join(columns)} FROM cap3_progress"
    ).fetchall()
    return {row[0]: dict(zip(columns, row, strict=True)) for row in records}


def _seed_representative_rows(conn) -> None:
    conn.exec_driver_sql(_PRE_CUTOVER_CAP3_PROGRESS_DDL)
    conn.exec_driver_sql(
        """
        INSERT INTO cap3_progress (
            id, user_id, entered_at, khau_vi_da_dat, khau_vi, von_ban_dau,
            task_1_done_at, task_2_done_at, task_3_done_at,
            so_lenh_cap3, lai_pct_cap3, diem_ky_luat_tb_cap3,
            graduated_at, time_to_graduate_hours
        ) VALUES
            (
                'graduated', 'u-graduated', '2026-01-01 00:00:00', true, 'can_bang', 250000000,
                '2026-01-01 01:00:00', '2026-01-02 02:00:00', '2026-01-03 03:00:00',
                17, 6.5, 84.0, '2026-01-04 04:00:00', 76.5
            ),
            (
                'active', 'u-active', '2026-02-01 00:00:00', true, 'tan_cong', 100000000,
                '2026-02-01 01:00:00', '2026-02-02 02:00:00', '2026-02-03 03:00:00',
                8, -1.25, 66.0, NULL, NULL
            )
        """
    )


def test_upgrade_clears_obsolete_stamps_and_preserves_representative_rows():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_representative_rows(conn)
        _run_migration(conn, "upgrade")

        assert "task_3_done_at" not in _columns(conn)
        rows = _rows(conn)
        for row_id in ("graduated", "active"):
            assert rows[row_id]["task_1_done_at"] is None
            assert rows[row_id]["task_2_done_at"] is None

        graduated = rows["graduated"]
        assert graduated["graduated_at"] == "2026-01-04 04:00:00"
        assert graduated["time_to_graduate_hours"] == 76.5
        assert graduated["khau_vi_da_dat"] in (1, True)
        assert graduated["khau_vi"] == "can_bang"
        assert graduated["von_ban_dau"] == 250000000
        assert graduated["so_lenh_cap3"] == 17
        assert graduated["lai_pct_cap3"] == 6.5
        assert graduated["diem_ky_luat_tb_cap3"] == 84.0

        active = rows["active"]
        assert active["graduated_at"] is None
        assert active["khau_vi"] == "tan_cong"
        assert active["von_ban_dau"] == 100000000
        assert active["so_lenh_cap3"] == 8
        assert active["lai_pct_cap3"] == -1.25
        assert active["diem_ky_luat_tb_cap3"] == 66.0


def test_downgrade_restores_empty_obsolete_shape_without_losing_graduation_metadata():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_representative_rows(conn)
        _run_migration(conn, "upgrade")
        _run_migration(conn, "downgrade")

        assert "task_3_done_at" in _columns(conn)
        rows = _rows(conn)
        for row in rows.values():
            assert row["task_1_done_at"] is None
            assert row["task_2_done_at"] is None
            assert row["task_3_done_at"] is None

        graduated = rows["graduated"]
        assert graduated["graduated_at"] == "2026-01-04 04:00:00"
        assert graduated["time_to_graduate_hours"] == 76.5
        assert graduated["khau_vi"] == "can_bang"
        assert graduated["von_ban_dau"] == 250000000
        assert graduated["so_lenh_cap3"] == 17
        assert graduated["lai_pct_cap3"] == 6.5
        assert graduated["diem_ky_luat_tb_cap3"] == 84.0
