"""Seed symbols from upstream sources into the database.

Usage:
    cd backend && uv run python -m app.scripts.seed_symbols
    cd backend && uv run python -m app.scripts.seed_symbols --validate-logos --deactivate-missing
    cd backend && uv run python -m app.scripts.seed_symbols --dry-run --limit 10
"""

from __future__ import annotations

import argparse
import asyncio
import sys


async def _run(args: argparse.Namespace) -> None:
    """Execute the seed process."""
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.core.config import get_settings
    from app.services.symbols import seed_symbols

    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        summary = await seed_symbols(
            session,
            language=args.language,
            validate_logos=args.validate_logos,
            deactivate_missing=args.deactivate_missing,
            dry_run=args.dry_run,
            limit=args.limit,
        )

    await engine.dispose()

    # Print summary
    print("\n" + "=" * 50)
    print("SEED SYMBOLS SUMMARY")
    print("=" * 50)
    print(f"  Dry run:              {summary.dry_run}")
    print(f"  Fetched:              {summary.fetched}")
    print(f"  Inserted:             {summary.inserted}")
    print(f"  Updated:              {summary.updated}")
    print(f"  Deactivated:          {summary.deactivated}")
    print(f"  Logo (Simplize):      {summary.logo_simplize_count}")
    print(f"  Logo (fallback):      {summary.logo_fallback_count}")
    if summary.errors:
        print(f"  Errors ({len(summary.errors)}):")
        for err in summary.errors:
            print(f"    - {err}")
    else:
        print("  Errors:               0")
    print("=" * 50)

    if summary.errors:
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed symbol data from upstream sources into the database.",
    )
    parser.add_argument(
        "--language", type=int, default=1,
        help="Ngôn ngữ: 1=Tiếng Việt, 2=Tiếng Anh (default: 1)",
    )
    parser.add_argument(
        "--validate-logos", action="store_true",
        help="HEAD-check Simplize logo URLs, fallback nếu 404",
    )
    parser.add_argument(
        "--deactivate-missing", action="store_true",
        help="Đánh dấu is_active=false cho symbols không còn upstream",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Chỉ fetch & hiển thị summary, không ghi DB",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Giới hạn số symbol xử lý (cho dev/test)",
    )
    args = parser.parse_args()
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
