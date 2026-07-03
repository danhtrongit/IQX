# backend/tests/test_yahoo_source.py
from app.services.market_data.sources.yahoo import parse_chart_meta

META = {
    "currency": "USD", "symbol": "^GSPC", "shortName": "S&P 500",
    "regularMarketPrice": 6124.85, "chartPreviousClose": 6100.2, "previousClose": 6101.0,
    "regularMarketDayHigh": 6130.1, "regularMarketDayLow": 6090.5,
    "regularMarketVolume": 2500000000, "marketState": "CLOSED",
    "regularMarketTime": 1782950400,
}

def test_parse_chart_meta_fields_and_aliasing():
    p = parse_chart_meta(META, "^GSPC")
    assert p["last_price"] == 6124.85
    assert p["previous_close"] == 6100.2          # chartPreviousClose wins over previousClose
    assert round(p["change_value"], 2) == 24.65
    assert round(p["change_percent"], 4) == round(24.65 / 6100.2 * 100, 4)  # raw percent
    assert p["market_state"] == "CLOSED" and p["currency"] == "USD"
    assert p["name"] == "S&P 500" and p["market_time"].startswith("20")

def test_parse_chart_meta_fallbacks():
    meta = {"regularMarketPrice": 10.0, "previousClose": 8.0}  # no chartPreviousClose, no name
    p = parse_chart_meta(meta, "XX=F")
    assert p["previous_close"] == 8.0 and p["name"] == "XX=F"
    assert p["change_percent"] == 25.0

def test_symbol_universe_counts():
    from app.services.market_data.intl_symbols import INTL_SYMBOLS, ALL_SYMBOLS, CATEGORY_BY_SYMBOL, CRITICAL_SYMBOLS
    assert set(INTL_SYMBOLS) == {"us_index", "us_futures", "asia_index", "fx", "commodity", "bond", "crypto", "etf"}
    assert 40 <= len(ALL_SYMBOLS) <= 50 and len(set(ALL_SYMBOLS)) == len(ALL_SYMBOLS)
    assert CATEGORY_BY_SYMBOL["^GSPC"] == "us_index" and CATEGORY_BY_SYMBOL["VNM"] == "etf"
    assert set(CRITICAL_SYMBOLS) <= set(ALL_SYMBOLS)

def test_wave_symbols():
    from app.services.market_data.intl_symbols import (
        WAVE2_SYMBOLS, WAVE3_SYMBOLS, CRITICAL_SYMBOLS, ALL_SYMBOLS
    )
    assert "^N225" in WAVE2_SYMBOLS and "^KS11" in WAVE2_SYMBOLS and "^AXJO" in WAVE2_SYMBOLS
    assert "DX-Y.NYB" in WAVE2_SYMBOLS  # fx symbol
    assert "BZ=F" in WAVE2_SYMBOLS      # commodity symbol
    assert "^HSI" in WAVE3_SYMBOLS and "000001.SS" in WAVE3_SYMBOLS
    assert "399001.SZ" in WAVE3_SYMBOLS and "VNM" in WAVE3_SYMBOLS
    assert set(WAVE2_SYMBOLS) <= set(ALL_SYMBOLS)
    assert set(WAVE3_SYMBOLS) <= set(ALL_SYMBOLS)
    assert "^GSPC" in CRITICAL_SYMBOLS
    assert "^N225" in CRITICAL_SYMBOLS
    assert "DX-Y.NYB" in CRITICAL_SYMBOLS
    assert "BZ=F" in CRITICAL_SYMBOLS
    assert "GC=F" in CRITICAL_SYMBOLS
    assert "VNM" in CRITICAL_SYMBOLS


def test_parse_chart_meta_zero_chart_previous_close_not_bypassed():
    # Nullish (not falsy) aliasing: an explicit 0.0 chartPreviousClose must win.
    p = parse_chart_meta({"regularMarketPrice": 1.0, "chartPreviousClose": 0.0, "previousClose": 8.0}, "X")
    assert p["previous_close"] == 0.0
    assert p["change_value"] == 1.0 and p["change_percent"] is None  # no div-by-zero
