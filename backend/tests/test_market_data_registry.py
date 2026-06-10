"""Tests for the centralized market-data source registry + orchestrator."""

from __future__ import annotations

import pytest

from app.services.market_data import orchestrator, registry
from app.services.market_data.registry import REGISTRY, SourceChain, sources_for


def test_chain_property_orders_default_first() -> None:
    sc = SourceChain("VCI", ("VND", "KBS"))
    assert sc.chain == ["VCI", "VND", "KBS"]


def test_chain_property_no_fallback() -> None:
    sc = SourceChain("FMARKET")
    assert sc.chain == ["FMARKET"]


def test_sources_for_returns_full_chain() -> None:
    assert sources_for("quote.ohlcv") == ["VND", "VCI"]


def test_sources_for_override_in_chain_returns_single() -> None:
    assert sources_for("quote.ohlcv", "vci") == ["VCI"]


def test_sources_for_override_not_in_chain_is_ignored() -> None:
    # KBS is not a configured source for quote.ohlcv → ignore override.
    assert sources_for("quote.ohlcv", "kbs") == ["VND", "VCI"]


def test_sources_for_unknown_key_raises() -> None:
    with pytest.raises(KeyError):
        sources_for("does.not_exist")


def test_every_registry_entry_has_a_default() -> None:
    for key, entry in REGISTRY.items():
        assert entry.default, f"{key} has empty default"
        assert entry.default == entry.default.upper(), f"{key} default not upper-case"


async def test_fetch_from_registry_uses_default_first() -> None:
    calls: list[str] = []

    async def _vnd() -> tuple[list[int], str]:
        calls.append("VND")
        return [1, 2, 3], "http://vnd"

    async def _vci() -> tuple[list[int], str]:
        calls.append("VCI")
        return [9], "http://vci"

    resp = await orchestrator.fetch_from_registry(
        "quote.ohlcv", {"VND": _vnd, "VCI": _vci}
    )
    assert resp.data == [1, 2, 3]
    assert resp.meta.source == "VND"
    assert resp.meta.fallback_used is False
    assert calls == ["VND"]


async def test_fetch_from_registry_falls_back_on_failure() -> None:
    async def _vnd() -> tuple[list[int], str]:
        raise RuntimeError("vnd down")

    async def _vci() -> tuple[list[int], str]:
        return [9], "http://vci"

    resp = await orchestrator.fetch_from_registry(
        "quote.ohlcv", {"VND": _vnd, "VCI": _vci}
    )
    assert resp.data == [9]
    assert resp.meta.source == "VCI"
    assert resp.meta.fallback_used is True


async def test_fetch_from_registry_honours_override() -> None:
    async def _vci() -> tuple[list[int], str]:
        return [9], "http://vci"

    resp = await orchestrator.fetch_from_registry(
        "quote.ohlcv", {"VND": _vci, "VCI": _vci}, override="VCI"
    )
    assert resp.meta.source == "VCI"


async def test_fetch_from_registry_missing_handler_raises() -> None:
    async def _vnd() -> tuple[list[int], str]:
        return [1], "http://vnd"

    # VCI handler omitted but registry chain includes it as fallback.
    with pytest.raises(ValueError, match="No handler registered"):
        await orchestrator.fetch_from_registry("quote.ohlcv", {"VND": _vnd})
