"""Unit tests for the DNSE OpenAPI WS transport helpers (pure, no I/O).

Protocol facts verified against the official openapi-sdk
(``python/dnse/websocket/auth.py``/``client.py``) and connect.md.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from types import SimpleNamespace

from app.services.realtime.bridge import _openapi_is_derivative
from app.services.realtime.openapi_stream import (
    build_auth_message,
    message_kind,
    openapi_channel,
    resolve_transport,
    subscribe_frame,
    unsubscribe_frame,
    ws_host_port,
)


# ── build_auth_message ───────────────────────────────
def test_build_auth_message_fixed_vector():
    msg = build_auth_message(
        "test-key", "test-secret", timestamp=1700000000, nonce="1700000000000000"
    )
    # HMAC_SHA256("test-secret", "test-key:1700000000:1700000000000000")
    assert msg == {
        "action": "auth",
        "api_key": "test-key",
        "signature": "31a315591ef85713e9d8ca741531e1685bf31a82709d69ef064f139e502df4af",
        "timestamp": 1700000000,
        "nonce": "1700000000000000",
    }
    # cross-check against an independent hashlib computation
    expected = hmac.new(
        b"test-secret", b"test-key:1700000000:1700000000000000", hashlib.sha256
    ).hexdigest()
    assert msg["signature"] == expected


def test_build_auth_message_default_ts_nonce():
    before = int(time.time())
    msg = build_auth_message("k", "s")
    after = int(time.time())
    assert before <= msg["timestamp"] <= after
    assert isinstance(msg["timestamp"], int)
    assert isinstance(msg["nonce"], str) and msg["nonce"].isdigit()
    assert len(msg["nonce"]) > len(str(msg["timestamp"]))  # microseconds
    assert len(msg["signature"]) == 64
    assert msg["action"] == "auth"


# ── openapi_channel ──────────────────────────────────
def test_openapi_channel_per_kind():
    # tick_extra (not plain tick): only TradeExtra carries the ``side`` field.
    assert openapi_channel("tick", "fpt") == ("tick_extra.G1.json", ["FPT"])
    assert openapi_channel("orderbook", "vic") == ("top_price.G1.json", ["VIC"])
    assert openapi_channel("ohlc", "hpg") == ("ohlc.1.json", ["HPG"])
    assert openapi_channel("index", "vnindex") == ("market_index.VNINDEX.json", [])
    assert openapi_channel("stockinfo", "FPT") is None
    assert openapi_channel("unknown", "FPT") is None


# ── message_kind (``T`` discriminator) ───────────────
def test_message_kind_data_frames():
    assert message_kind({"T": "t", "symbol": "HPG"}) == "tick"
    assert message_kind({"T": "te", "symbol": "HPG"}) == "tick"  # TradeExtra (side)
    assert message_kind({"T": "q", "symbol": "HPG"}) == "orderbook"
    assert message_kind({"T": "b", "symbol": "HPG"}) == "ohlc"
    assert message_kind({"T": "mi", "indexName": "VNINDEX"}) == "index"


def test_message_kind_ignored_types():
    for t in ("bc", "sd", "e", "f"):
        assert message_kind({"T": t}) is None
    assert message_kind({}) is None


def test_message_kind_control_frames():
    assert message_kind({"action": "ping"}) is None
    assert message_kind({"action": "subscribed"}) is None
    assert message_kind({"action": "error", "T": "t"}) is None
    assert message_kind({"a": "pong"}) is None


# ── subscribe / unsubscribe frame shapes ─────────────
def test_subscribe_frame_shape():
    frame = subscribe_frame(
        [("tick.G1.json", ["FPT", "HPG"]), ("market_index.VNINDEX.json", [])]
    )
    assert frame == {
        "action": "subscribe",
        "channels": [
            {"name": "tick.G1.json", "symbols": ["FPT", "HPG"]},
            {"name": "market_index.VNINDEX.json", "symbols": []},
        ],
    }


def test_unsubscribe_frame_mirrors_subscribe():
    frame = unsubscribe_frame([("top_price.G1.json", ["VIC"])])
    assert frame == {
        "action": "unsubscribe",
        "channels": [{"name": "top_price.G1.json", "symbols": ["VIC"]}],
    }


# ── resolve_transport matrix ─────────────────────────
def _settings(transport: str, key: str = "", secret: str = "") -> SimpleNamespace:
    return SimpleNamespace(
        DNSE_TRANSPORT=transport, DNSE_API_KEY=key, DNSE_API_SECRET=secret
    )


def test_resolve_transport_auto_with_keys_is_openapi():
    assert resolve_transport(_settings("auto", "k", "s")) == "openapi"


def test_resolve_transport_auto_without_keys_is_mqtt():
    assert resolve_transport(_settings("auto")) == "mqtt"
    assert resolve_transport(_settings("auto", key="k")) == "mqtt"
    assert resolve_transport(_settings("auto", secret="s")) == "mqtt"


def test_resolve_transport_explicit_wins():
    assert resolve_transport(_settings("mqtt", "k", "s")) == "mqtt"
    assert resolve_transport(_settings("openapi")) == "openapi"


def test_resolve_transport_case_and_fallback():
    assert resolve_transport(_settings("OPENAPI")) == "openapi"
    assert resolve_transport(_settings(" MQTT ", "k", "s")) == "mqtt"
    assert resolve_transport(_settings("bogus", "k", "s")) == "openapi"  # → auto
    assert resolve_transport(_settings("", "", "")) == "mqtt"


# ── ws_host_port (degraded-mode probe) ───────────────
def test_ws_host_port():
    assert ws_host_port("wss://ws-openapi.dnse.com.vn/v1/stream") == (
        "ws-openapi.dnse.com.vn",
        443,
    )
    assert ws_host_port("ws://localhost:8080/v1/stream") == ("localhost", 8080)
    assert ws_host_port("wss://example.com:8443/x?encoding=json") == ("example.com", 8443)


# ── derivative detection for OpenAPI payloads ────────
def test_openapi_is_derivative_market_id():
    assert _openapi_is_derivative({"marketId": "DVX"}, "41I1G6000") is True
    assert _openapi_is_derivative({"marketId": "STO"}, "HPG") is False
    assert _openapi_is_derivative({"marketId": "STX"}, "SHS") is False
    assert _openapi_is_derivative({"marketId": "UPX"}, "BSR") is False


def test_openapi_is_derivative_ohlc_type():
    assert _openapi_is_derivative({"type": "DERIVATIVE"}, "VN30F1M") is True
    assert _openapi_is_derivative({"type": "INDEX"}, "VNINDEX") is True
    assert _openapi_is_derivative({"type": "STOCK"}, "HPG") is False


def test_openapi_is_derivative_type_wins_over_market_id():
    # DNSE attaches stock marketIds even to index frames (mi has marketId:
    # "STO" for VNINDEX) — ``type`` must take precedence or index OHLC would
    # be ×1000-converted.
    assert _openapi_is_derivative({"type": "INDEX", "marketId": "STO"}, "VNINDEX") is True
    assert _openapi_is_derivative({"type": "STOCK", "marketId": "DVX"}, "HPG") is False


def test_openapi_is_derivative_falls_back_to_heuristic():
    assert _openapi_is_derivative({}, "VN30F1M") is True
    assert _openapi_is_derivative({}, "FPT") is False


# ── demand capping (shared by both transports) ───────
def test_cap_demand_preserves_index_and_is_deterministic():
    from app.services.realtime.bridge import _cap_demand

    wanted = {f"SYM{i:03d}": {"tick"} for i in range(10)}
    wanted["VNINDEX"] = {"index"}
    wanted["VN30"] = {"index"}

    capped = _cap_demand(wanted, 5)
    assert "VNINDEX" in capped and "VN30" in capped  # index không bị đẩy ra
    assert len(capped) == 5
    # phần còn lại cắt theo thứ tự sort — xác định, không phụ thuộc hash order
    assert sorted(s for s in capped if s.startswith("SYM")) == ["SYM000", "SYM001", "SYM002"]

    # dưới cap → giữ nguyên
    assert _cap_demand(wanted, 50) is wanted
