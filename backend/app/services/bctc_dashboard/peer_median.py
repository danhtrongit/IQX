"""Peer-median service for the BCTC dashboard (B2 benchmark layer).

Given a target sector (ICB level-2), compute sector-relative medians of the key
valuation / profitability ratios over a **bounded top-K** set of peers ranked by
market cap. Results are cached per ``(icb_lv2, asof_date)`` in
``sector_median_cache`` so peers are fetched at most once per sector per day.

Concurrency & safety
---------------------
- On a cache miss the compute path runs under a **transaction-scoped** advisory
  lock (``pg_advisory_xact_lock``) so concurrent requests for the same sector
  serialize and only one performs the fetch. The lock auto-releases when the
  caller's transaction commits / rolls back. We deliberately never use a
  session-level lock (``pg_try_advisory_lock``) — those leaked across the pool
  and broke prod for 8 days.
- Per-peer ratio fetches run under an ``asyncio.Semaphore(5)`` with small random
  jitter; one peer failing never fails the batch.
- Degrade: fewer than 3 peers with usable data → all-``None`` medians, no raise.

ICB filtering
-------------
The screening ``filter`` schema for an ICB criterion (name + value/code) is not
reliably known, and the caller passes a sector *name* (``Symbol.icb_lv2``) which
does not match the screening ``icbCodeLv2`` *code*. So we take the robust route:
fetch broad pages sorted by market cap DESC and match each row in Python against
the target on any of ``icb_code_lv2`` / ``vi_sector`` / ``en_sector``.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import random
import statistics
from datetime import date
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sector_median_cache import SectorMedianCache
from app.services.market_data.sources.vietcap import fetch_financial_report
from app.services.market_data.sources.vietcap_screening import fetch_screening_paging

logger = logging.getLogger(__name__)

# Output metric keys — the union the B3 threshold layer consumes. Each maps to
# the candidate field names to read from a peer's newest ratio row (first match
# wins). Metrics absent from ratio rows (gross_margin / net_debt_ebitda / dso)
# degrade to None rather than being computed from statements per-peer.
_METRIC_FIELDS: dict[str, list[str]] = {
    "pe": ["pe"],
    "pb": ["pb"],
    "roe": ["roe"],
    "gross_margin": ["gross_margin", "gross_profit_margin"],
    "revenue_growth": ["revenue_growth", "revenue_yoy"],
    # NOTE: no "dividend" fallback — that field is a cash-dividend AMOUNT, not a
    # yield; medianing it would be a unit mismatch. Leave None when no true yield.
    "dividend_yield": ["dividend_yield"],
    "net_debt_ebitda": ["net_debt_ebitda", "net_debt_to_ebitda"],
    "dso": ["dso", "days_sales_outstanding"],
}

_MIN_PEERS = 3
_CONCURRENCY = 5
_SCREEN_PAGE_SIZE = 100
_SCREEN_MAX_PAGES = 15


# ── helpers ──────────────────────────────────────────


def _empty_medians() -> dict[str, float | None]:
    return {k: None for k in _METRIC_FIELDS}


def _norm(s: Any) -> str:
    return str(s or "").strip().casefold()


def _to_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    return f


def _lock_key(icb_lv2: str, asof: date) -> int:
    """Stable signed 64-bit key for pg_advisory_xact_lock(bigint)."""
    digest = hashlib.sha256(f"{icb_lv2}|{asof.isoformat()}".encode()).digest()
    return int.from_bytes(digest[:8], "big", signed=True)


def _is_postgres(db: AsyncSession) -> bool:
    try:
        return db.bind.dialect.name == "postgresql"
    except Exception:
        return False


def _sector_matches(row: dict[str, Any], target: str) -> bool:
    return target in {
        _norm(row.get("icb_code_lv2")),
        _norm(row.get("vi_sector")),
        _norm(row.get("en_sector")),
    }


# ── fetch: peers + per-peer metrics ──────────────────


async def _fetch_sector_peers(icb_lv2: str, top_k: int) -> list[dict[str, Any]]:
    """Fetch top-K sector peers by market cap (broad page + Python filter)."""
    target = _norm(icb_lv2)
    if not target:
        return []

    matches: dict[str, dict[str, Any]] = {}
    for page in range(_SCREEN_MAX_PAGES):
        try:
            data, _url = await fetch_screening_paging(
                page=page,
                page_size=_SCREEN_PAGE_SIZE,
                sort_fields=["marketCap"],
                sort_orders=["DESC"],
            )
        except Exception as exc:
            logger.warning("peer_median: screening page %s failed: %s", page, exc)
            break

        content = data.get("content") or []
        for row in content:
            ticker = (row.get("ticker") or "").upper()
            if ticker and _sector_matches(row, target):
                matches.setdefault(ticker, row)

        if len(matches) >= top_k:
            break
        if data.get("last") or not content:
            break

    peers = sorted(
        matches.values(),
        key=lambda r: _to_float(r.get("market_cap")) or 0.0,
        reverse=True,
    )
    return peers[:top_k]


async def _fetch_peer_metrics(
    ticker: str, sem: asyncio.Semaphore
) -> dict[str, float] | None:
    """Fetch one peer's newest yearly ratio row → usable metric values."""
    async with sem:
        await asyncio.sleep(random.uniform(0.1, 0.2))  # jitter to avoid bursts
        try:
            rows, _url = await fetch_financial_report(
                ticker, report_type="ratio", period="Y"
            )
        except Exception as exc:
            logger.debug("peer_median: ratio fetch failed for %s: %s", ticker, exc)
            return None

    if not rows:
        return None
    newest = rows[0]  # ratio rows are newest-first
    out: dict[str, float] = {}
    for metric, candidates in _METRIC_FIELDS.items():
        for cand in candidates:
            v = _to_float(newest.get(cand))
            if v is not None:
                out[metric] = v
                break
    return out or None


async def _compute_medians(
    icb_lv2: str, top_k: int
) -> tuple[dict[str, float | None], int]:
    peers = await _fetch_sector_peers(icb_lv2, top_k)
    if not peers:
        return _empty_medians(), 0

    sem = asyncio.Semaphore(_CONCURRENCY)
    results = await asyncio.gather(
        *[
            _fetch_peer_metrics((p.get("ticker") or "").upper(), sem)
            for p in peers
        ],
        return_exceptions=True,
    )
    collected = [r for r in results if isinstance(r, dict)]
    peer_count = len(collected)

    if peer_count < _MIN_PEERS:
        return _empty_medians(), peer_count

    medians: dict[str, float | None] = {}
    for metric in _METRIC_FIELDS:
        vals = [c[metric] for c in collected if metric in c]
        medians[metric] = float(statistics.median(vals)) if vals else None
    return medians, peer_count


# ── cache read / upsert ──────────────────────────────


async def _read_cache(
    db: AsyncSession, icb_lv2: str, asof: date
) -> dict[str, float | None] | None:
    row = (
        await db.execute(
            select(SectorMedianCache).where(
                SectorMedianCache.icb_lv2 == icb_lv2,
                SectorMedianCache.asof_date == asof,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    stored = row.medians if isinstance(row.medians, dict) else {}
    # Always expose the full union of keys, backed by whatever was stored.
    return {**_empty_medians(), **stored}


async def _upsert_cache(
    db: AsyncSession,
    icb_lv2: str,
    asof: date,
    medians: dict[str, float | None],
    peer_count: int,
) -> None:
    # Best-effort cache write inside a SAVEPOINT so a flush failure (e.g. a
    # concurrent-insert race) rolls back ONLY this cache row, never the
    # caller's surrounding transaction.
    try:
        async with db.begin_nested():
            existing = (
                await db.execute(
                    select(SectorMedianCache).where(
                        SectorMedianCache.icb_lv2 == icb_lv2,
                        SectorMedianCache.asof_date == asof,
                    )
                )
            ).scalar_one_or_none()
            if existing is not None:
                existing.medians = medians
                existing.peer_count = peer_count
            else:
                db.add(
                    SectorMedianCache(
                        icb_lv2=icb_lv2,
                        asof_date=asof,
                        medians=medians,
                        peer_count=peer_count,
                    )
                )
    except Exception as exc:  # concurrent insert race — cache is best-effort
        logger.warning("peer_median: cache upsert failed: %s", exc)


# ── public API ───────────────────────────────────────


async def get_sector_medians(
    db: AsyncSession,
    icb_lv2: str,
    *,
    asof: date,
    top_k: int = 20,
) -> dict[str, float | None]:
    """Return sector-relative ratio medians for ``icb_lv2`` on ``asof``.

    Cache hit → stored medians. Miss → compute the top-K peer medians under a
    transaction-scoped advisory lock and upsert the cache row. Degrades to
    all-``None`` medians (never raises) when fewer than 3 peers have data.
    """
    cached = await _read_cache(db, icb_lv2, asof)
    if cached is not None:
        return cached

    # Miss: serialize compute for this sector under a txn-scoped advisory lock
    # (Postgres only; sqlite tests skip it). Re-check the cache once acquired.
    if _is_postgres(db):
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:k)"),
            {"k": _lock_key(icb_lv2, asof)},
        )
        cached = await _read_cache(db, icb_lv2, asof)
        if cached is not None:
            return cached

    medians, peer_count = await _compute_medians(icb_lv2, top_k)
    await _upsert_cache(db, icb_lv2, asof, medians, peer_count)
    return {**_empty_medians(), **medians}
