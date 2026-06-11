"""DNSE OpenAPI market-data WebSocket client (transport-only).

Protocol (verified against the official openapi-sdk + developers.dnse.com.vn):
1. Connect ``wss://ws-openapi.dnse.com.vn/v1/stream?encoding=json``.
2. Server sends a welcome frame containing ``session_id`` (or ``sid``).
3. Client sends an HMAC-SHA256 auth frame; success reply has
   ``action == "auth_success"``.
4. Subscribe/unsubscribe per channel:
   ``{"action":"subscribe","channels":[{"name":CH,"symbols":[...]}]}``.
5. Data frames carry a ``T`` discriminator (``t``/``q``/``b``/``mi``...);
   control frames carry ``action`` (``ping`` → reply ``pong``).

Keepalive: server pings every ~3 min and force-closes after 1 min without a
pong; the client also sends its own ping every ~25s (SDK behaviour). Every
connection is force-closed after 8h — the bridge reconnect loop handles that.

This module is transport-only: no Redis/demand logic, so the pure helpers
(auth message, channel names, frame shapes, ``T`` dispatch) are trivially
unit-testable.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import hmac
import json
import logging
import ssl
import time
from collections.abc import AsyncGenerator, Iterable
from typing import TYPE_CHECKING, Any
from urllib.parse import urlparse

from app.services.realtime.normalize import (
    KIND_INDEX,
    KIND_OHLC,
    KIND_ORDERBOOK,
    KIND_TICK,
)

if TYPE_CHECKING:
    from app.core.config import Settings

logger = logging.getLogger(__name__)

# (channel_name, symbols) pairs as sent in subscribe/unsubscribe frames.
ChannelPair = tuple[str, list[str]]

# ``T`` discriminator → canonical kind. ``t`` (Trade) and ``te`` (TradeExtra)
# both normalize as ticks — we subscribe tick_extra for the ``side`` field, but
# accept plain trades too. Other types (sd/e/f/bc) are intentionally ignored
# for now (future: foreign-investor for ĐTNN columns).
_T_KIND = {
    "t": KIND_TICK,
    "te": KIND_TICK,
    "q": KIND_ORDERBOOK,
    "b": KIND_OHLC,
    "mi": KIND_INDEX,
}


class OpenApiAuthError(RuntimeError):
    """Raised when the DNSE OpenAPI WS auth handshake fails."""


def build_auth_message(
    api_key: str,
    api_secret: str,
    *,
    timestamp: int | None = None,
    nonce: str | None = None,
) -> dict[str, Any]:
    """Build the HMAC-SHA256 auth frame.

    Signature = HMAC_SHA256(api_secret, ``{api_key}:{timestamp}:{nonce}``) hex.
    Defaults generate a fresh epoch-seconds timestamp and a microsecond nonce.
    """
    ts = int(time.time()) if timestamp is None else int(timestamp)
    n = str(int(time.time() * 1_000_000)) if nonce is None else str(nonce)
    message = f"{api_key}:{ts}:{n}"
    signature = hmac.new(
        api_secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return {
        "action": "auth",
        "api_key": api_key,
        "signature": signature,
        "timestamp": ts,
        "nonce": n,
    }


def openapi_channel(kind: str, symbol: str) -> ChannelPair | None:
    """Map a canonical (kind, symbol) to the OpenAPI channel subscription.

    Board G1 = lô chẵn (round lot) — matches the legacy ``roundlot`` topics.
    Ticks use ``tick_extra`` (not plain ``tick``): only TradeExtra carries the
    ``side`` field the legacy MQTT feed provides — plain Trade would silently
    degrade every tick to ``side: "unknown"``.
    OHLC resolution ``1`` = 1 minute — matches the legacy ``v2/ohlc/stock/1``.
    Index channels embed the index name and take an empty symbols list.
    """
    s = symbol.upper()
    if kind == KIND_TICK:
        return ("tick_extra.G1.json", [s])
    if kind == KIND_ORDERBOOK:
        return ("top_price.G1.json", [s])
    if kind == KIND_OHLC:
        return ("ohlc.1.json", [s])
    if kind == KIND_INDEX:
        return (f"market_index.{s}.json", [])
    return None


def message_kind(raw: dict[str, Any]) -> str | None:
    """Map an inbound frame to a canonical kind via the ``T`` discriminator.

    Control frames (``action``) and unsupported data types return None.
    """
    if raw.get("action") or raw.get("a"):
        return None
    return _T_KIND.get(str(raw.get("T") or ""))


def subscribe_frame(channel_pairs: Iterable[ChannelPair]) -> dict[str, Any]:
    """Exact subscribe frame shape the OpenAPI server expects."""
    return {
        "action": "subscribe",
        "channels": [{"name": name, "symbols": list(symbols)} for name, symbols in channel_pairs],
    }


def unsubscribe_frame(channel_pairs: Iterable[ChannelPair]) -> dict[str, Any]:
    """Exact unsubscribe frame shape (mirrors subscribe)."""
    return {
        "action": "unsubscribe",
        "channels": [{"name": name, "symbols": list(symbols)} for name, symbols in channel_pairs],
    }


def resolve_transport(settings: Settings) -> str:
    """Resolve the active DNSE transport: ``openapi`` or ``mqtt``.

    Explicit ``DNSE_TRANSPORT`` wins; ``auto`` picks openapi iff both
    DNSE_API_KEY and DNSE_API_SECRET are configured, else legacy mqtt.
    """
    explicit = str(settings.DNSE_TRANSPORT or "auto").strip().lower()
    if explicit in ("openapi", "mqtt"):
        return explicit
    if settings.DNSE_API_KEY and settings.DNSE_API_SECRET:
        return "openapi"
    return "mqtt"


def ws_host_port(url: str) -> tuple[str, int]:
    """Parse (host, port) from a ws(s) URL for TCP reachability probes."""
    parsed = urlparse(url)
    port = parsed.port or (443 if parsed.scheme == "wss" else 80)
    return parsed.hostname or "", port


class OpenApiStream:
    """One authenticated DNSE OpenAPI WS connection (transport-only).

    Usage::

        async with OpenApiStream(url, key, secret) as stream:
            await stream.subscribe([openapi_channel(KIND_TICK, "FPT")])
            async for raw in stream.messages():
                ...

    Replies pong to server pings and sends its own keepalive ping every
    ~25s. Raises ``OpenApiAuthError`` on a failed auth handshake; connection
    drops surface as ``websockets`` exceptions from ``messages()``.
    """

    def __init__(
        self,
        url: str,
        api_key: str,
        api_secret: str,
        *,
        keepalive_seconds: float = 25.0,
        timeout: float = 30.0,
    ) -> None:
        self._url = url if "?" in url else f"{url}?encoding=json"
        self._api_key = api_key
        self._api_secret = api_secret
        self._keepalive_seconds = keepalive_seconds
        self._timeout = timeout
        self._ws: Any = None
        self._keepalive_task: asyncio.Task | None = None
        self.session_id: str | None = None

    # ── lifecycle ───────────────────────────────────
    async def connect(self) -> None:
        """Connect, read welcome, authenticate; raise on auth failure."""
        import websockets

        # ssl chỉ hợp lệ với wss:// (ws:// dùng trong unit/smoke test nội bộ)
        ctx = ssl.create_default_context() if self._url.startswith("wss://") else None
        self._ws = await asyncio.wait_for(
            websockets.connect(
                self._url, ssl=ctx, ping_interval=30, ping_timeout=30, max_queue=512
            ),
            timeout=self._timeout,
        )
        # Nếu handshake (welcome/auth) fail thì phải đóng socket vừa mở —
        # vòng retry của bridge sẽ gọi connect() lại liên tục và rò kết nối TLS.
        try:
            welcome = await self._recv_json()
            self.session_id = str(welcome.get("session_id") or welcome.get("sid") or "")

            await self._send(build_auth_message(self._api_key, self._api_secret))
            reply = await self._recv_json()
            action = reply.get("action") or reply.get("a")
            if action != "auth_success":
                detail = reply.get("message") or reply.get("msg") or action or "unknown"
                raise OpenApiAuthError(f"DNSE OpenAPI auth failed: {detail}")
        except BaseException:
            await self.close()
            raise
        logger.info("DNSE OpenAPI auth ok (session=%s)", self.session_id)

        self._keepalive_task = asyncio.create_task(
            self._keepalive_loop(), name="dnse-openapi-keepalive"
        )

    async def close(self) -> None:
        if self._keepalive_task is not None:
            self._keepalive_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._keepalive_task
            self._keepalive_task = None
        if self._ws is not None:
            with contextlib.suppress(Exception):
                await self._ws.close()
            self._ws = None

    async def __aenter__(self) -> OpenApiStream:
        await self.connect()
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self.close()

    # ── subscriptions ───────────────────────────────
    async def subscribe(self, channel_pairs: Iterable[ChannelPair]) -> None:
        await self._send(subscribe_frame(channel_pairs))

    async def unsubscribe(self, channel_pairs: Iterable[ChannelPair]) -> None:
        await self._send(unsubscribe_frame(channel_pairs))

    # ── streaming ───────────────────────────────────
    async def messages(self) -> AsyncGenerator[dict[str, Any], None]:
        """Yield decoded data frames; handle ping/pong + control frames inline.

        Ends/raises when the connection closes (caller reconnects).
        """
        if self._ws is None:
            raise RuntimeError("OpenApiStream not connected")
        async for frame in self._ws:
            try:
                data = json.loads(frame)
            except (TypeError, ValueError):
                continue
            if not isinstance(data, dict):
                continue
            action = data.get("action") or data.get("a")
            if action is not None:
                if action == "ping":
                    with contextlib.suppress(Exception):
                        await self._send({"action": "pong"})
                elif action == "error":
                    logger.warning(
                        "DNSE OpenAPI server error: %s", data.get("message") or data.get("msg")
                    )
                # subscribed / unsubscribed / pong → control noise, skip
                continue
            yield data

    # ── internals ───────────────────────────────────
    async def _send(self, payload: dict[str, Any]) -> None:
        if self._ws is None:
            raise RuntimeError("OpenApiStream not connected")
        await self._ws.send(json.dumps(payload))

    async def _recv_json(self) -> dict[str, Any]:
        raw = await asyncio.wait_for(self._ws.recv(), timeout=self._timeout)
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}

    async def _keepalive_loop(self) -> None:
        """Client-initiated ping ~25s so NATs/proxies keep the socket open."""
        while True:
            await asyncio.sleep(self._keepalive_seconds)
            try:
                await self._send({"action": "ping"})
            except Exception:  # noqa: BLE001
                logger.debug("OpenAPI keepalive send failed", exc_info=True)
                return
