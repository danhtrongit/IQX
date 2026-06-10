"""Tests for new market-data domains: gold (SJC), fx (VCB), crypto (Binance), MSN."""

from __future__ import annotations

from typing import Any

import pytest

from app.services.market_data.sources import msn, sjc, vcb


class _FakeResp:
    def __init__(self, payload: Any) -> None:
        self._payload = payload

    def json(self) -> Any:
        return self._payload

    def raise_for_status(self) -> None:
        return None


async def test_sjc_fetch_gold_normalizes(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    async def fake_fetch_json(url: str, **kwargs: Any) -> Any:
        captured.update(kwargs)
        captured["url"] = url
        return {
            "success": True,
            "data": [
                {"TypeName": "SJC", "BranchName": "HCM", "BuyValue": 8000000, "SellValue": 8200000},
            ],
        }

    monkeypatch.setattr("app.services.market_data.sources.sjc.fetch_json", fake_fetch_json)
    rows, url = await sjc.fetch_gold("2026-06-10")

    assert url.endswith("PriceService.ashx")
    assert rows[0]["buy_price"] == 8000000
    assert rows[0]["sell_price"] == 8200000
    assert rows[0]["name"] == "SJC"
    # date must be converted to DD/MM/YYYY inside the form body
    assert "10%2F06%2F2026" in captured["form_data"]


async def test_vcb_fetch_fx_parses_values(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_fetch_json(url: str, **kwargs: Any) -> Any:
        return {
            "Date": "2026-06-10T00:00:00",
            "Data": [
                {"currencyCode": "USD", "currencyName": "Dollar", "cash": "25,000", "transfer": "25,100", "sell": "25,400"},
                {"currencyCode": "EUR", "currencyName": "Euro", "cash": "-", "transfer": "27,000", "sell": "27,500"},
            ],
        }

    monkeypatch.setattr("app.services.market_data.sources.vcb.fetch_json", fake_fetch_json)
    rows, _ = await vcb.fetch_fx("2026-06-10")

    assert rows[0]["currency_code"] == "USD"
    assert rows[0]["buy_cash"] == 25000.0
    assert rows[1]["buy_cash"] is None  # "-" → None
    assert rows[0]["date"] == "2026-06-10"


def test_msn_resolve_secid() -> None:
    assert msn.resolve_secid("btc") == "c2111"
    assert msn.resolve_secid("USDVND") == "avyufr"
    assert msn.resolve_secid("UNKNOWN") is None


def test_msn_norm_series_drops_sentinel() -> None:
    series = {
        "timeStamps": ["2026-06-09T00:00:00Z", "2026-06-10T00:00:00Z"],
        "openPrices": [100.0, -99999901.0],
        "pricesHigh": [110.0, 5.0],
        "pricesLow": [90.0, 5.0],
        "prices": [105.0, 5.0],
        "volumes": [1000, 2000],
    }
    rows = msn._norm_series(series, is_currency=False)
    assert len(rows) == 1  # second row dropped (sentinel open)
    assert rows[0]["close"] == 105.0
    assert rows[0]["volume"] == 1000


def test_msn_norm_series_currency_nulls_volume() -> None:
    series = {
        "timeStamps": ["2026-06-10T00:00:00Z"],
        "openPrices": [1.1],
        "pricesHigh": [1.2],
        "pricesLow": [1.0],
        "prices": [1.15],
        "volumes": [500],
    }
    rows = msn._norm_series(series, is_currency=True)
    assert rows[0]["volume"] is None


async def test_msn_resolve_apikey_uses_cache() -> None:
    class _FakeRedis:
        async def get(self, key: str) -> str:
            return "cached-key-123"

    key = await msn.resolve_apikey(_FakeRedis())
    assert key == "cached-key-123"
