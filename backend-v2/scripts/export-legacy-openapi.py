#!/usr/bin/env python3
"""Export the FastAPI v1 OpenAPI document without starting application services.

This is deliberately an offline build tool: it disables dotenv loading, supplies
non-production settings, uses a temporary media directory, and never enters the
application lifespan (so Redis, schedulers, realtime, and HTTP clients do not run).
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path


BACKEND_V2_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = BACKEND_V2_ROOT.parent
LEGACY_BACKEND_ROOT = REPOSITORY_ROOT / "backend"
OUTPUT = BACKEND_V2_ROOT / "contracts" / "legacy-openapi.json"


def export_document() -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="iqx-legacy-openapi-") as media_dir:
        safe_environment = {
            "APP_ENV": "testing",
            "DATABASE_URL": "sqlite:///tmp/iqx-openapi.db",
            "JWT_SECRET_KEY": "iqx-openapi-build-secret-not-for-runtime",
            "JWT_REFRESH_SECRET_KEY": "iqx-openapi-build-refresh-not-for-runtime",
            "ENABLE_API_DOCS": "true",
            "REDIS_ENABLED": "false",
            "JOBS_ENABLED": "false",
            "REALTIME_ENABLED": "false",
            "MARKET_ANALYSIS_ENABLED": "false",
            "MIDDAY_ANALYSIS_ENABLED": "false",
            "PREMARKET_ANALYSIS_ENABLED": "false",
            "INTL_DATA_ENABLED": "false",
            "ALERTS_ENABLED": "false",
            "LESSON_MEDIA_DIR": media_dir,
        }
        os.environ.update(safe_environment)
        sys.path.insert(0, str(LEGACY_BACKEND_ROOT))

        from app.core.config import Settings, get_settings  # noqa: PLC0415

        # The developer machine may contain backend/.env. A generated contract
        # must never depend on it or expose values from it.
        Settings.model_config["env_file"] = None
        get_settings.cache_clear()

        # Importing main constructs a FastAPI object, but does not run lifespan.
        from app.main import create_app  # noqa: PLC0415

        return create_app().openapi()


def render(document: dict[str, object]) -> str:
    return json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def main() -> int:
    expected = render(export_document())
    if "--check" in sys.argv[1:]:
        try:
            actual = OUTPUT.read_text(encoding="utf-8")
        except FileNotFoundError:
            print(f"Legacy OpenAPI snapshot is missing: {OUTPUT}", file=sys.stderr)
            return 1
        if actual != expected:
            print(
                "Legacy OpenAPI snapshot is stale; run "
                "`backend/.venv/bin/python backend-v2/scripts/export-legacy-openapi.py`.",
                file=sys.stderr,
            )
            return 1
        print("Legacy OpenAPI snapshot is current")
        return 0

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(expected, encoding="utf-8")
    print(f"wrote {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
