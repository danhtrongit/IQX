"""Contract tests for the lossy Cấp 3 two-task migration."""

from __future__ import annotations

import importlib.util
from pathlib import Path


MIGRATION = Path(__file__).parents[1] / "alembic" / "versions" / "d3c2a1b4e5f6_cap3_two_concurrent_sizing_tasks.py"


class RecordingOp:
    def __init__(self) -> None:
        self.executed: list[str] = []
        self.dropped: list[tuple[str, str]] = []
        self.added: list[tuple[str, object]] = []

    def execute(self, statement) -> None:
        self.executed.append(str(statement))

    def drop_column(self, table: str, column: str) -> None:
        self.dropped.append((table, column))

    def add_column(self, table: str, column) -> None:
        self.added.append((table, column))


def _migration_module():
    spec = importlib.util.spec_from_file_location("cap3_two_tasks_migration", MIGRATION)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_upgrade_clears_obsolete_task_stamps_and_only_drops_third_task(monkeypatch):
    migration = _migration_module()
    op = RecordingOp()
    monkeypatch.setattr(migration, "op", op)

    migration.upgrade()

    assert op.dropped == [("cap3_progress", "task_3_done_at")]
    assert len(op.executed) == 1
    statement = op.executed[0]
    assert "task_1_done_at = NULL" in statement
    assert "task_2_done_at = NULL" in statement
    assert "graduated_at" not in statement
    assert "time_to_graduate_hours" not in statement


def test_downgrade_recreates_empty_obsolete_task_shape(monkeypatch):
    migration = _migration_module()
    op = RecordingOp()
    monkeypatch.setattr(migration, "op", op)

    migration.downgrade()

    assert [(table, column.name) for table, column in op.added] == [
        ("cap3_progress", "task_3_done_at")
    ]
    assert len(op.executed) == 1
    statement = op.executed[0]
    assert "task_1_done_at = NULL" in statement
    assert "task_2_done_at = NULL" in statement
    assert "task_3_done_at = NULL" in statement
    assert "graduated_at" not in statement
