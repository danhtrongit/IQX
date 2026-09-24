#!/usr/bin/env python3
"""Compile the legacy SQLAlchemy model metadata into the v2 initial schema.

This script is deliberately offline: it disables pydantic's dotenv source,
installs a fail-closed settings accessor, and uses SQLAlchemy's mock PostgreSQL
engine. It never creates an engine capable of opening a network connection.
"""

from __future__ import annotations

import argparse
import importlib
import json
import sys
import uuid
from pathlib import Path

from sqlalchemy import Boolean, DefaultClause, Enum, text
from sqlalchemy.dialects.postgresql import CreateEnumType, JSONB, dialect as postgresql_dialect
from sqlalchemy.schema import CreateIndex, CreateTable

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
OUTPUT = PROJECT_ROOT / "backend-v2" / "migrations" / "0001_initial_schema.sql"

# Keep this explicit. A newly-added model must be consciously reviewed before
# it can become part of the standalone v2 schema.
MODEL_MODULES = (
    "admin_audit",
    "ai_insight_history",
    "alert",
    "backtest_strategy",
    "bot_run",
    "cap0",
    "cap1",
    "cap2",
    "cap2_alert",
    "cap3",
    "cap4",
    "cap5",
    "cap6",
    "cap7",
    "cap8",
    "chart_drawing",
    "ipn_log",
    "journey_event",
    "journey_identity",
    "lesson",
    "login_history",
    "market_analysis",
    "market_data_snapshot",
    "portfolio_report",
    "premium",
    "refresh_token",
    "sector_median_cache",
    "symbol",
    "user",
    "virtual_trading",
    "watchlist",
)
EXPECTED_TABLES = frozenset(
    {
        "admin_audit_log",
        "ai_insight_history",
        "alert_events",
        "alert_signals",
        "analysis_claims",
        "analysis_history",
        "backtest_strategies",
        "bot_accounts",
        "bot_cash_ledger",
        "bot_decisions",
        "bot_executions",
        "bot_instances",
        "bot_market_snapshots",
        "bot_mascot_profiles",
        "bot_nav_daily",
        "bot_positions",
        "bot_run_receipts",
        "cap0_order_kehoach",
        "cap0_progress",
        "cap1_progress",
        "cap2_alert_events",
        "cap2_alert_impressions",
        "cap2_alert_session_state",
        "cap2_alert_type_state",
        "cap2_progress",
        "cap3_progress",
        "cap4_progress",
        "cap5_hunt_log",
        "cap5_progress",
        "cap6_progress",
        "cap6_skip",
        "cap7_progress",
        "cap8_exits",
        "cap8_progress",
        "chart_drawings",
        "courses",
        "episode_progress",
        "episodes",
        "journey_assessments",
        "journey_events",
        "journey_identity_ui",
        "journey_reading_datasets",
        "market_data_snapshot",
        "order_kehoach",
        "order_ketso",
        "portfolio_reports",
        "premium_payment_orders",
        "premium_plans",
        "premium_subscriptions",
        "refresh_tokens",
        "sector_median_cache",
        "sepay_ipn_logs",
        "symbols",
        "user_alert_rules",
        "user_login_history",
        "user_placement",
        "users",
        "virtual_cash_ledger",
        "virtual_orders",
        "virtual_positions",
        "virtual_settlements",
        "virtual_trades",
        "virtual_trading_accounts",
        "virtual_trading_configs",
        "watchlist_items",
    }
)
EXPECTED_TABLE_COUNT = len(EXPECTED_TABLES)


def _load_metadata():
    sys.path.insert(0, str(BACKEND_ROOT))

    # Import configuration first and make any later settings access fail closed.
    # Model import should need metadata only, never secrets or a database URL.
    config = importlib.import_module("app.core.config")
    config.Settings.model_config["env_file"] = None
    config.get_settings.cache_clear()

    def offline_settings_guard():
        raise RuntimeError("settings access is forbidden during offline schema generation")

    config.get_settings = offline_settings_guard

    # Load the package aggregate, then every model module explicitly so omitted
    # optional imports (premium, refresh token, symbol) cannot reduce coverage.
    importlib.import_module("app.models")
    for module in MODEL_MODULES:
        importlib.import_module(f"app.models.{module}")

    database = importlib.import_module("app.core.database")
    metadata = database.Base.metadata
    actual_tables = frozenset(metadata.tables)
    if actual_tables != EXPECTED_TABLES:
        missing = ", ".join(sorted(EXPECTED_TABLES - actual_tables)) or "none"
        unexpected = ", ".join(sorted(actual_tables - EXPECTED_TABLES)) or "none"
        raise RuntimeError(
            f"schema coverage mismatch; missing: {missing}; unexpected: {unexpected}"
        )
    return metadata


def _literal_default(value: object, *, is_boolean: bool) -> str | None:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    if isinstance(value, str):
        escaped = value.replace("'", "''")
        return f"'{escaped}'"
    if is_boolean and value in (0, 1):
        return "true" if value else "false"
    return None


def _prepare_v2_metadata(metadata) -> None:
    """Apply server-safe v2 defaults and PostgreSQL-native JSON semantics."""

    for table in metadata.tables.values():
        for column in table.columns:
            if column.type.__class__.__name__ == "JSON":
                column.type = JSONB()

            if column.server_default is not None or column.default is None:
                continue

            default = column.default.arg
            default_name = getattr(default, "__name__", "")
            if default is uuid.uuid4 or default_name == "uuid4":
                column.server_default = DefaultClause(text("gen_random_uuid()"))
                continue
            if default_name in {"list", "dict"}:
                empty = [] if default_name == "list" else {}
                payload = json.dumps(empty, separators=(",", ":"))
                column.server_default = DefaultClause(text(f"'{payload}'::jsonb"))
                continue

            literal = _literal_default(default, is_boolean=isinstance(column.type, Boolean))
            if literal is not None:
                column.server_default = DefaultClause(text(literal))

            if column.server_default is None:
                raise RuntimeError(
                    f"unsupported application-only default: {table.name}.{column.name}"
                )


def _compile_schema() -> str:
    metadata = _load_metadata()
    _prepare_v2_metadata(metadata)
    dialect = postgresql_dialect()
    enum_types = {}
    for table in metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, Enum) and column.type.native_enum:
                key = (column.type.schema or "", column.type.name)
                previous = enum_types.setdefault(key, column.type)
                if previous.enums != column.type.enums:
                    raise RuntimeError(f"conflicting enum definitions for {column.type.name}")

    statements = [
        str(CreateEnumType(enum_type).compile(dialect=dialect)).strip().rstrip(";")
        for _, enum_type in sorted(enum_types.items())
    ]
    for table in metadata.sorted_tables:
        statements.append(str(CreateTable(table).compile(dialect=dialect)).strip().rstrip(";"))
        statements.extend(
            str(CreateIndex(index).compile(dialect=dialect)).strip().rstrip(";")
            for index in sorted(table.indexes, key=lambda value: value.name or "")
        )

    comments = [
        "-- Generated by scripts/generate-v2-schema.py; do not edit by hand.",
        "-- Standalone IQX backend-v2 schema: 65 tables, no legacy data migration.",
    ]
    statements.insert(0, "CREATE EXTENSION IF NOT EXISTS pgcrypto")
    return "\n".join(comments) + "\n\n" + ";\n\n".join(statements) + ";\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail when output is stale")
    args = parser.parse_args()
    generated = _compile_schema()

    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != generated:
            print(f"{OUTPUT.relative_to(PROJECT_ROOT)} is stale", file=sys.stderr)
            return 1
        print(f"schema is current: {EXPECTED_TABLE_COUNT} tables")
        return 0

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(generated, encoding="utf-8")
    print(f"generated {OUTPUT.relative_to(PROJECT_ROOT)} ({EXPECTED_TABLE_COUNT} tables)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
