"""Centralized data-source registry.

Ported from the IQX-TS ``datasources/registry.ts`` pattern: every logical
operation is keyed by ``<domain>.<method>`` and maps to a primary (``default``)
source plus an ordered ``fallback`` list. Endpoints no longer hardcode their
source chains inline — they ask the registry for the ordered chain and let the
orchestrator try each source in turn.

Source names are upper-case tokens (``VCI``, ``VND``, ``KBS`` ...) matching the
keys used by ``http.get_headers`` and the per-source modules under ``sources/``.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class SourceChain:
    """A primary source plus ordered fallbacks for one registry key."""

    default: str
    fallback: tuple[str, ...] = field(default_factory=tuple)

    @property
    def chain(self) -> list[str]:
        return [self.default, *self.fallback]


# Keyed by ``domain.method``. ``default`` is the primary source; ``fallback``
# is tried in order. Mirrors the upstream coverage of the IQX-TS registry but
# scoped to the sources actually implemented in this backend.
REGISTRY: dict[str, SourceChain] = {
    # ── Reference data ──
    "reference.symbols": SourceChain("VCI", ("VND",)),
    "reference.industries": SourceChain("VCI"),
    "reference.groups": SourceChain("VCI"),
    # ── Quotes ──
    "quote.ohlcv": SourceChain("VND", ("VCI",)),
    "quote.intraday": SourceChain("VCI"),
    "quote.price_depth": SourceChain("VCI"),
    # ── Trading ──
    "trading.price_board": SourceChain("VCI"),
    "trading.foreign_trade": SourceChain("VCI"),
    "trading.insider_deals": SourceChain("VCI"),
    "trading.history": SourceChain("VCI"),
    "trading.summary": SourceChain("VCI"),
    "trading.proprietary": SourceChain("VCI"),
    # ── Company ──
    "company.profile": SourceChain("KBS", ("VCI",)),
    "company.shareholders": SourceChain("KBS"),
    "company.officers": SourceChain("KBS"),
    "company.subsidiaries": SourceChain("KBS"),
    "company.news": SourceChain("KBS"),
    "company.details": SourceChain("VCI"),
    "company.price_chart": SourceChain("VCI"),
    # ── Fundamentals ──
    "financial.statement": SourceChain("VCI"),
    "financial.bctc": SourceChain("VCI"),
    # ── Insights / analytics ──
    "insights.ranking": SourceChain("VND"),
    # ── Events ──
    "events.calendar": SourceChain("VCI"),
    # ── Macro / commodities / gold / fx ──
    "macro.economy": SourceChain("MBK", ("ASEAN",)),
    "macro.gold": SourceChain("SJC", ("SIMPLIZE",)),
    "macro.fx": SourceChain("VCB", ("MBK", "ASEAN")),
    "macro.commodities": SourceChain("SPL", ("ASEAN",)),
    # ── Funds (FMARKET only) ──
    "fund.list": SourceChain("FMARKET"),
    "fund.detail": SourceChain("FMARKET"),
    "fund.nav": SourceChain("FMARKET"),
    # ── International (world index / forex / crypto) ──
    "intl.world_index": SourceChain("MSN"),
    "intl.forex": SourceChain("MSN"),
    "intl.crypto_ohlc": SourceChain("BINANCE", ("MSN",)),
    "intl.crypto_ticker": SourceChain("BINANCE"),
    "intl.crypto_depth": SourceChain("BINANCE"),
    # ── News ──
    "news.latest": SourceChain("RSS"),
}


def sources_for(key: str, override: str | None = None) -> list[str]:
    """Return the ordered source chain for a registry key.

    If ``override`` is provided and is part of the configured chain, only that
    single source is returned (force a specific upstream via ``?source=``).
    An unknown override is ignored and the full chain is returned.
    """
    entry = REGISTRY.get(key)
    if entry is None:
        raise KeyError(f"Unknown registry key: {key}")
    chain = entry.chain
    if override:
        up = override.upper()
        if up in chain:
            return [up]
    return chain
