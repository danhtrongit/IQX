"""Symbol seed & search service — business logic layer."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.symbol import SymbolRepository
from app.schemas.symbol import SymbolSearchItem, SymbolSearchParams, SymbolSeedSummary

logger = logging.getLogger(__name__)


def _icb_to_str(value: Any) -> str | None:
    """Convert ICB field to string — upstream may return dict with 'name' key."""
    if value is None:
        return None
    if isinstance(value, dict):
        return value.get("name") or value.get("code") or str(value)
    return str(value)

# ── Simplize logo CDN ───────────────────────────────
_SIMPLIZE_LOGO_BASE = "https://cdn.simplize.vn/simplizevn/logo"


def get_simplize_logo_base_url() -> str:
    """Return Simplize logo CDN base URL, respecting env/settings override."""
    import os
    try:
        from app.core.config import get_settings
        return get_settings().SIMPLIZE_LOGO_BASE_URL
    except Exception:
        return os.environ.get("SIMPLIZE_LOGO_BASE_URL", _SIMPLIZE_LOGO_BASE)


def build_simplize_logo_url(symbol: str) -> str:
    """Build Simplize CDN logo URL for a given symbol."""
    base = get_simplize_logo_base_url()
    return f"{base}/{symbol.upper()}.jpeg"


# ── Search service ──────────────────────────────────


async def search_symbols(
    session: AsyncSession,
    params: SymbolSearchParams,
) -> tuple[list[SymbolSearchItem], int]:
    """Search symbols with DB-backed ranked query."""
    repo = SymbolRepository(session)
    symbols, total = await repo.search(
        q=params.q,
        exchange=params.exchange,
        asset_type=params.asset_type,
        include_indices=params.include_indices,
        page=params.page,
        page_size=params.page_size,
    )
    items = [SymbolSearchItem.model_validate(s) for s in symbols]
    return items, total


async def get_symbol_detail(
    session: AsyncSession,
    symbol: str,
) -> Any:
    """Get a single symbol by code, or None."""
    repo = SymbolRepository(session)
    return await repo.get_by_symbol(symbol)


# ── Seed service ────────────────────────────────────


async def _fetch_search_bar_data(language: int = 1) -> tuple[list[dict[str, Any]], str]:
    """Fetch rich symbol data from Vietcap search bar."""
    from app.services.market_data.sources.vietcap_market_overview import fetch_search_bar
    return await fetch_search_bar(language=language)


async def _fetch_listing_data() -> tuple[list[dict[str, Any]], str] | None:
    """Fetch listing data from VCI, fallback to VND."""
    try:
        from app.services.market_data.sources.vietcap import fetch_symbols_by_exchange
        data, url = await fetch_symbols_by_exchange()
        return data, url
    except Exception as exc:
        logger.warning("VCI listing failed (%s), trying VND fallback", exc)

    try:
        from app.services.market_data.sources.vndirect import fetch_symbols
        data, url = await fetch_symbols()
        return data, url
    except Exception as exc:
        logger.warning("VND listing fallback also failed: %s", exc)
        return None


async def _validate_logo_url(url: str) -> bool:
    """HEAD request to check if a logo URL is valid (returns image/*)."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            resp = await client.head(url)
            if resp.status_code == 200:
                ct = resp.headers.get("content-type", "")
                return ct.startswith("image/")
    except Exception:
        pass
    return False


async def seed_symbols(
    session: AsyncSession,
    *,
    language: int = 1,
    validate_logos: bool = False,
    deactivate_missing: bool = False,
    dry_run: bool = False,
    limit: int | None = None,
) -> SymbolSeedSummary:
    """Seed symbols from upstream sources into the database.

    Idempotent: safe to run multiple times, upserts by symbol key.
    """
    summary = SymbolSeedSummary(dry_run=dry_run)

    # 1. Fetch primary data from search bar
    try:
        search_data, _url = await _fetch_search_bar_data(language=language)
    except Exception as exc:
        summary.errors.append(f"fetch_search_bar failed: {exc}")
        return summary

    # 2. Fetch listing data for merge
    listing_map: dict[str, dict[str, Any]] = {}
    listing_result = await _fetch_listing_data()
    if listing_result:
        listing_data, _ = listing_result
        for item in listing_data:
            code = (item.get("symbol") or "").upper()
            if code:
                listing_map[code] = item

    # 3. Build merged records
    now = datetime.now(UTC)
    records: list[dict[str, Any]] = []

    items_to_process = search_data[:limit] if limit else search_data

    for item in items_to_process:
        code = (item.get("code") or "").strip().upper()
        if not code or len(code) > 10 or " " in code:
            continue

        # Merge listing data
        listing = listing_map.get(code, {})

        # Determine exchange: search_bar uses 'floor', listing uses 'exchange'
        exchange = item.get("floor") or listing.get("exchange") or None

        # Logo: default to Simplize
        simplize_url = build_simplize_logo_url(code)
        logo_url = simplize_url
        logo_source = "SIMPLIZE"

        if validate_logos:
            is_valid = await _validate_logo_url(simplize_url)
            if is_valid:
                summary.logo_simplize_count += 1
            else:
                # Fallback to Vietcap logo
                vci_logo = item.get("logo_url") or None
                if vci_logo:
                    logo_url = vci_logo
                    logo_source = "VIETCAP"
                    summary.logo_fallback_count += 1
                else:
                    logo_url = None
                    logo_source = None
                    summary.logo_fallback_count += 1
        else:
            summary.logo_simplize_count += 1

        record = {
            "symbol": code,
            "name": item.get("name") or listing.get("name") or None,
            "short_name": item.get("short_name") or None,
            "exchange": exchange,
            "asset_type": listing.get("asset_type") or "stock",
            "is_index": bool(item.get("is_index", False)),
            "current_price_vnd": item.get("current_price"),
            "target_price_vnd": item.get("target_price"),
            "upside_pct": item.get("upside_pct"),
            "logo_url": logo_url,
            "logo_source": logo_source,
            "icb_lv1": _icb_to_str(item.get("icb_lv1")),
            "icb_lv2": _icb_to_str(item.get("icb_lv2")),
            "source": "VIETCAP_SEARCH_BAR",
            "last_synced_at": now,
            "is_active": True,
        }
        records.append(record)

    summary.fetched = len(records)

    if dry_run:
        return summary

    # 4. Upsert
    repo = SymbolRepository(session)
    try:
        inserted, updated = await repo.upsert_many(records)
        summary.inserted = inserted
        summary.updated = updated
    except Exception as exc:
        summary.errors.append(f"upsert_many failed: {exc}")
        return summary

    # 5. Optionally deactivate missing symbols
    if deactivate_missing:
        active_symbols = {r["symbol"] for r in records}
        try:
            deactivated = await repo.deactivate_missing(active_symbols)
            summary.deactivated = deactivated
        except Exception as exc:
            summary.errors.append(f"deactivate_missing failed: {exc}")

    await session.commit()
    return summary
