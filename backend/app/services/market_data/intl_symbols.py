"""International market symbol universe for the IQX pre-market pipeline.

Defines the 45-symbol universe across 8 categories used by the international
data pipeline (Yahoo Finance source). Provides convenience lists for phased
fetch scheduling (WAVE2, WAVE3) and critical-alert filtering (CRITICAL).
"""

from __future__ import annotations

# ── 8-category universe ────────────────────────────────────────────────────────
# Each entry is {"symbol": str, "name": str}.

INTL_SYMBOLS: dict[str, list[dict[str, str]]] = {
    "us_index": [
        {"symbol": "^DJI",  "name": "Dow Jones Industrial Average"},
        {"symbol": "^GSPC", "name": "S&P 500"},
        {"symbol": "^IXIC", "name": "NASDAQ Composite"},
        {"symbol": "^RUT",  "name": "Russell 2000"},
        {"symbol": "^VIX",  "name": "CBOE Volatility Index"},
    ],
    "us_futures": [
        {"symbol": "ES=F", "name": "E-mini S&P 500 Futures"},
        {"symbol": "NQ=F", "name": "E-mini NASDAQ 100 Futures"},
        {"symbol": "YM=F", "name": "E-mini Dow Futures"},
    ],
    "asia_index": [
        {"symbol": "^N225",     "name": "Nikkei 225"},
        {"symbol": "^KS11",     "name": "KOSPI Composite"},
        {"symbol": "^HSI",      "name": "Hang Seng Index"},
        {"symbol": "000001.SS", "name": "SSE Composite Index"},
        {"symbol": "399001.SZ", "name": "SZSE Component Index"},
        {"symbol": "^TWII",     "name": "Taiwan Weighted Index"},
        {"symbol": "^STI",      "name": "Straits Times Index"},
        {"symbol": "^AXJO",     "name": "S&P/ASX 200"},
    ],
    "fx": [
        {"symbol": "DX-Y.NYB", "name": "US Dollar Index"},
        {"symbol": "VND=X",    "name": "USD/VND"},
        {"symbol": "CNY=X",    "name": "USD/CNY"},
        {"symbol": "JPY=X",    "name": "USD/JPY"},
        {"symbol": "KRW=X",    "name": "USD/KRW"},
        {"symbol": "EURUSD=X", "name": "EUR/USD"},
    ],
    "commodity": [
        {"symbol": "BZ=F", "name": "Brent Crude Oil"},
        {"symbol": "CL=F", "name": "WTI Crude Oil"},
        {"symbol": "GC=F", "name": "Gold Futures"},
        {"symbol": "SI=F", "name": "Silver Futures"},
        {"symbol": "HG=F", "name": "Copper Futures"},
        {"symbol": "NG=F", "name": "Natural Gas Futures"},
        {"symbol": "SB=F", "name": "Sugar Futures"},
        {"symbol": "KC=F", "name": "Coffee Futures"},
        {"symbol": "ZC=F", "name": "Corn Futures"},
        {"symbol": "ZS=F", "name": "Soybean Futures"},
        {"symbol": "ZW=F", "name": "Wheat Futures"},
    ],
    "bond": [
        {"symbol": "^TNX", "name": "10-Year Treasury Yield"},
        {"symbol": "^IRX", "name": "13-Week Treasury Bill"},
        {"symbol": "^TYX", "name": "30-Year Treasury Yield"},
    ],
    "crypto": [
        {"symbol": "BTC-USD", "name": "Bitcoin USD"},
        {"symbol": "ETH-USD", "name": "Ethereum USD"},
    ],
    "etf": [
        {"symbol": "VNM",  "name": "VanEck Vietnam ETF"},
        {"symbol": "EEM",  "name": "iShares MSCI Emerging Markets ETF"},
        {"symbol": "FM",   "name": "iShares MSCI Frontier and Select EM ETF"},
        {"symbol": "SPY",  "name": "SPDR S&P 500 ETF Trust"},
        {"symbol": "AAXJ", "name": "iShares MSCI All Country Asia ex Japan ETF"},
    ],
}

# ── Flat lists derived from the universe ──────────────────────────────────────

ALL_SYMBOLS: list[str] = [
    item["symbol"]
    for category in INTL_SYMBOLS.values()
    for item in category
]

CATEGORY_BY_SYMBOL: dict[str, str] = {
    item["symbol"]: category
    for category, items in INTL_SYMBOLS.items()
    for item in items
}

# ── Phased fetch lists ─────────────────────────────────────────────────────────

# Wave 1 (implicit): us_index + us_futures — fetched first (not listed separately).

# Wave 2: Asia indices with early opens + all FX + all commodities.
_FX_SYMBOLS: list[str] = [item["symbol"] for item in INTL_SYMBOLS["fx"]]
_COMMODITY_SYMBOLS: list[str] = [item["symbol"] for item in INTL_SYMBOLS["commodity"]]

WAVE2_SYMBOLS: list[str] = ["^N225", "^KS11", "^AXJO"] + _FX_SYMBOLS + _COMMODITY_SYMBOLS

# Wave 3: Late-open Asian markets + Vietnam ETF proxy.
WAVE3_SYMBOLS: list[str] = ["^HSI", "000001.SS", "399001.SZ", "VNM"]

# ── Critical symbols (alert / health-check set) ───────────────────────────────

CRITICAL_SYMBOLS: list[str] = ["^GSPC", "^N225", "DX-Y.NYB", "BZ=F", "GC=F", "VNM"]
