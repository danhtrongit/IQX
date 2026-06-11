"""DNSE bridge — the single connection that feeds Redis pub/sub.

Worker-safety: with ``uvicorn --workers 2`` we must keep exactly ONE DNSE
connection. A Redis lock (``realtime:leader``) elects one worker as leader; only
the leader connects to DNSE. Non-leaders keep trying to acquire the lock so they
can take over if the leader dies (TTL-based failover).

Two transports (``resolve_transport``): legacy MQTT KRX (Entrade JWT) and the
new OpenAPI WS (api_key/secret HMAC). The leader:
- authenticates per transport (cached JWT / HMAC handshake),
- connects (MQTT v5 over WSS, or OpenAPI WS),
- every ~1.5s reconciles subscriptions against live demand,
- normalizes each message and publishes to Redis,
- on disconnect: exponential backoff reconnect; after exhausting retries,
  degrades to VCI polling so clients still get (slower) data.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import random
import ssl
from typing import Any

from app.core.config import get_settings
from app.services.cache.redis_cache import get_redis_client
from app.services.realtime import demand, dnse_auth, normalize, openapi_stream, pubsub, topics
from app.services.realtime.openapi_stream import OpenApiStream, resolve_transport

logger = logging.getLogger(__name__)

_LEADER_KEY = "realtime:leader"
_DEGRADED_KEY = "realtime:degraded"
_WORKER_ID = f"{os.getpid()}-{random.randint(1000, 9999)}"

_MAX_BACKOFF = 60.0
_MAX_RECONNECT_ATTEMPTS = 12


def is_derivative(symbol: str) -> bool:
    """Heuristic: VN30F* / index futures are point-priced (no ×1000)."""
    s = symbol.upper()
    return s.startswith("VN30F") or s.startswith("VN100F") or "F" in s[:6] and s[:2] == "VN" and any(
        c.isdigit() for c in s
    )


def _openapi_is_derivative(raw: dict[str, Any], symbol: str) -> bool:
    """Point-priced (no ×1000)? OpenAPI payloads usually say so explicitly.

    OHLC ``type`` ∈ STOCK|DERIVATIVE|INDEX wins when present — DNSE attaches a
    stock-market ``marketId`` even to some index frames (e.g. ``mi`` carries
    ``marketId: "STO"`` for VNINDEX), so ``type`` is the more reliable signal.
    Then ``marketId == "DVX"`` = derivatives ("STO"/"STX"/"UPX" = stocks).
    Falls back to the symbol heuristic when both fields are absent.
    """
    ohlc_type = str(raw.get("type") or "").upper()
    if ohlc_type:
        return ohlc_type in ("DERIVATIVE", "INDEX")
    market_id = str(raw.get("marketId") or "").upper()
    if market_id:
        return market_id == "DVX"
    return is_derivative(symbol)


def _cap_demand(
    wanted: dict[str, set[str]], max_symbols: int
) -> dict[str, set[str]]:
    """Cap demand deterministically, never evicting index demand.

    Redis-hash order is arbitrary — a naive ``dict(list(...)[:N])`` could drop
    the index channels whenever a few clients open large tabs. Keep index
    entries first, then stock symbols in sorted order up to the cap.
    """
    if len(wanted) <= max_symbols:
        return wanted
    index_entries = {s: ch for s, ch in wanted.items() if normalize.KIND_INDEX in ch}
    rest = sorted(s for s in wanted if s not in index_entries)
    keep = max(0, max_symbols - len(index_entries))
    capped = dict(index_entries)
    for s in rest[:keep]:
        capped[s] = wanted[s]
    return capped


class DnseBridge:
    """Leader-elected MQTT→Redis bridge. One instance per worker process."""

    def __init__(self) -> None:
        self._stop = asyncio.Event()
        self._is_leader = False
        self._task: asyncio.Task | None = None

    # ── lifecycle ───────────────────────────────────
    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="dnse-bridge")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        if self._is_leader:
            await self._release_leader()

    # ── leader election ─────────────────────────────
    async def _try_acquire_leader(self) -> bool:
        redis = get_redis_client()
        if redis is None:
            return False
        settings = get_settings()
        try:
            ok = await redis.set(
                _LEADER_KEY, _WORKER_ID, nx=True, ex=settings.REALTIME_LEADER_LOCK_TTL
            )
            return bool(ok)
        except Exception:  # noqa: BLE001
            logger.debug("leader acquire failed", exc_info=True)
            return False

    async def _renew_leader(self) -> bool:
        """Renew our lock iff we still own it (compare-and-extend)."""
        redis = get_redis_client()
        if redis is None:
            return False
        settings = get_settings()
        try:
            current = await redis.get(_LEADER_KEY)
            if current != _WORKER_ID:
                return False
            await redis.expire(_LEADER_KEY, settings.REALTIME_LEADER_LOCK_TTL)
            return True
        except Exception:  # noqa: BLE001
            return False

    async def _release_leader(self) -> None:
        redis = get_redis_client()
        if redis is None:
            return
        try:
            if await redis.get(_LEADER_KEY) == _WORKER_ID:
                await redis.delete(_LEADER_KEY)
        except Exception:  # noqa: BLE001
            logger.debug("leader release failed", exc_info=True)

    # ── main loop ───────────────────────────────────
    async def _run(self) -> None:
        settings = get_settings()
        while not self._stop.is_set():
            acquired = await self._try_acquire_leader()
            if not acquired:
                self._is_leader = False
                await asyncio.sleep(settings.REALTIME_LEADER_RENEW_SECONDS)
                continue

            self._is_leader = True
            logger.info("realtime: became leader (worker=%s)", _WORKER_ID)
            try:
                await self._lead()
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                logger.warning("realtime leader loop crashed; will re-elect", exc_info=True)
            finally:
                self._is_leader = False
                await self._release_leader()

    async def _lead(self) -> None:
        """Run as leader: keep the DNSE stream connected, reconnect, then degrade."""
        attempt = 0
        while not self._stop.is_set():
            try:
                await self._connect_and_stream()
                attempt = 0  # clean exit (stop requested)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                attempt += 1
                logger.warning(
                    "realtime DNSE disconnected (%s), attempt %d/%d",
                    type(exc).__name__, attempt, _MAX_RECONNECT_ATTEMPTS,
                )
                if attempt >= _MAX_RECONNECT_ATTEMPTS:
                    await self._run_degraded_until_recovery()
                    attempt = 0
                    continue
                delay = min(_MAX_BACKOFF, 2 ** (attempt - 1)) + random.uniform(0, 0.5)
                # keep leadership alive during backoff
                await self._sleep_with_renew(delay)

    async def _sleep_with_renew(self, seconds: float) -> None:
        """Sleep while periodically renewing the leader lock."""
        settings = get_settings()
        remaining = seconds
        while remaining > 0 and not self._stop.is_set():
            step = min(settings.REALTIME_LEADER_RENEW_SECONDS, remaining)
            await asyncio.sleep(step)
            remaining -= step
            if not await self._renew_leader():
                raise RuntimeError("lost leadership during sleep")

    # ── DNSE streaming (transport branch) ───────────
    async def _connect_and_stream(self) -> None:
        """Connect via the resolved transport and pump messages until drop."""
        if resolve_transport(get_settings()) == "openapi":
            await self._stream_openapi()
        else:
            await self._stream_mqtt()

    # ── MQTT streaming (legacy KRX feed) ────────────
    async def _stream_mqtt(self) -> None:
        import aiomqtt

        settings = get_settings()
        tok = await dnse_auth.get_or_refresh()
        ctx = ssl.create_default_context()

        async with aiomqtt.Client(
            hostname=settings.DNSE_MQTT_HOST,
            port=settings.DNSE_MQTT_PORT,
            transport="websockets",
            websocket_path=settings.DNSE_MQTT_WS_PATH,
            username=tok.investor_id,
            password=tok.token,
            identifier=f"iqx-{_WORKER_ID}",
            protocol=aiomqtt.ProtocolVersion.V5,
            tls_context=ctx,
            keepalive=120,
        ) as client:
            logger.info("realtime MQTT connected")
            await self._clear_degraded()
            subscribed: dict[str, set[str]] = {}  # symbol -> {channels}
            recon = asyncio.create_task(self._reconcile_loop(client, subscribed))
            pump = asyncio.create_task(self._pump_mqtt(client))
            await self._race_pump_and_reconcile(pump, recon)

    async def _pump_mqtt(self, client) -> None:
        async for message in client.messages:
            await self._handle_message(str(message.topic), message.payload)

    async def _race_pump_and_reconcile(
        self, pump: asyncio.Task, recon: asyncio.Task
    ) -> None:
        """Run the message pump and the reconcile loop; first failure wins.

        The reconcile loop raising (lost leadership, Redis hiccup) must tear
        down the DNSE connection too — otherwise this ex-leader would keep
        streaming and publishing in parallel with the newly elected leader
        (duplicate messages to every client) until the broker drops it.
        """
        try:
            done, _ = await asyncio.wait({pump, recon}, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
        finally:
            for task in (pump, recon):
                if task.done():
                    # đã xong (có thể cùng lúc với task kia, hoặc khi bị huỷ
                    # giữa chừng): lấy exception ra để tránh asyncio log
                    # "Task exception was never retrieved"
                    if not task.cancelled() and task.exception() is not None:
                        logger.debug("realtime task secondary failure", exc_info=task.exception())
                    continue
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task

    async def _reconcile_loop(self, client, subscribed: dict[str, set[str]]) -> None:
        """Diff live demand vs current subscriptions; (un)subscribe topics."""
        settings = get_settings()
        while not self._stop.is_set():
            if not await self._renew_leader():
                raise RuntimeError("lost leadership")
            wanted = await demand.current()
            wanted = _cap_demand(wanted, settings.REALTIME_MAX_SYMBOLS)

            # subscribe new (symbol, channel) pairs
            for symbol, channels in wanted.items():
                have = subscribed.get(symbol, set())
                for ch in channels - have:
                    topic = topics.mqtt_topic(ch, symbol)
                    if topic:
                        with contextlib.suppress(Exception):
                            await client.subscribe(topic, qos=1)
                subscribed[symbol] = set(channels)

            # unsubscribe dropped symbols/channels
            for symbol in list(subscribed.keys()):
                still = wanted.get(symbol, set())
                for ch in subscribed[symbol] - still:
                    topic = topics.mqtt_topic(ch, symbol)
                    if topic:
                        with contextlib.suppress(Exception):
                            await client.unsubscribe(topic)
                if not still:
                    subscribed.pop(symbol, None)
                else:
                    subscribed[symbol] = still

            await asyncio.sleep(settings.REALTIME_SUBSCRIBE_POLL_SECONDS)

    async def _handle_message(self, topic: str, payload: bytes) -> None:
        kind = normalize.topic_kind(topic)
        if kind is None:
            return
        try:
            raw = json.loads(payload.decode())
        except (ValueError, UnicodeDecodeError):
            return
        symbol = raw.get("symbol") or raw.get("code") or ""
        deriv = is_derivative(str(symbol))
        msg = normalize.normalize(kind, raw, is_derivative=deriv)
        if msg is None:
            return
        channel = topics.redis_channel(kind, str(msg.get("symbol") or msg.get("code") or symbol))
        await pubsub.publish(channel, msg)

    # ── OpenAPI WS streaming (api_key/secret HMAC) ──
    async def _stream_openapi(self) -> None:
        settings = get_settings()
        stream = OpenApiStream(
            settings.DNSE_OPENAPI_WS_URL,
            settings.DNSE_API_KEY,
            settings.DNSE_API_SECRET,
        )
        async with stream:
            logger.info("realtime OpenAPI WS connected")
            await self._clear_degraded()
            subscribed: dict[str, set[str]] = {}  # symbol -> {channels}
            recon = asyncio.create_task(self._reconcile_openapi_loop(stream, subscribed))
            pump = asyncio.create_task(self._pump_openapi(stream))
            await self._race_pump_and_reconcile(pump, recon)

    async def _pump_openapi(self, stream: OpenApiStream) -> None:
        async for raw in stream.messages():
            await self._handle_openapi_message(raw)

    async def _reconcile_openapi_loop(
        self, stream: OpenApiStream, subscribed: dict[str, set[str]]
    ) -> None:
        """Diff live demand vs current subscriptions; send incremental frames."""
        settings = get_settings()
        while not self._stop.is_set():
            if not await self._renew_leader():
                raise RuntimeError("lost leadership")
            wanted = await demand.current()
            wanted = _cap_demand(wanted, settings.REALTIME_MAX_SYMBOLS)

            to_sub: list[openapi_stream.ChannelPair] = []
            to_unsub: list[openapi_stream.ChannelPair] = []

            # new / dropped channels of still-wanted symbols
            for symbol, channels in wanted.items():
                have = subscribed.get(symbol, set())
                for ch in channels - have:
                    pair = openapi_stream.openapi_channel(ch, symbol)
                    if pair:
                        to_sub.append(pair)
                for ch in have - channels:
                    pair = openapi_stream.openapi_channel(ch, symbol)
                    if pair:
                        to_unsub.append(pair)

            # fully dropped symbols
            for symbol in list(subscribed.keys()):
                if symbol not in wanted:
                    for ch in subscribed.pop(symbol):
                        pair = openapi_stream.openapi_channel(ch, symbol)
                        if pair:
                            to_unsub.append(pair)

            for symbol, channels in wanted.items():
                subscribed[symbol] = set(channels)

            if to_sub:
                with contextlib.suppress(Exception):
                    await stream.subscribe(to_sub)
            if to_unsub:
                with contextlib.suppress(Exception):
                    await stream.unsubscribe(to_unsub)

            await asyncio.sleep(settings.REALTIME_SUBSCRIBE_POLL_SECONDS)

    async def _handle_openapi_message(self, raw: dict[str, Any]) -> None:
        kind = openapi_stream.message_kind(raw)
        if kind is None:
            return
        symbol = raw.get("symbol") or raw.get("indexName") or raw.get("code") or ""
        deriv = _openapi_is_derivative(raw, str(symbol))
        msg = normalize.normalize(kind, raw, is_derivative=deriv)
        if msg is None:
            return
        channel = topics.redis_channel(kind, str(msg.get("symbol") or msg.get("code") or symbol))
        await pubsub.publish(channel, msg)

    # ── degraded mode (VCI polling fallback) ────────
    async def _run_degraded_until_recovery(self) -> None:
        """Poll VCI for demanded symbols and publish ticks until DNSE recovers."""
        settings = get_settings()
        await self._set_degraded()
        logger.warning("realtime: entering degraded mode (VCI polling)")
        try:
            while not self._stop.is_set():
                if not await self._renew_leader():
                    raise RuntimeError("lost leadership in degraded mode")
                wanted = await demand.current()
                # Chỉ poll mã có demand cổ phiếu — mã chỉ số (index) không có
                # trên bảng giá VCI và sẽ trả null.
                symbols = [
                    s
                    for s, chans in wanted.items()
                    if chans - {normalize.KIND_INDEX}
                ][: settings.REALTIME_MAX_SYMBOLS]
                if symbols:
                    await self._poll_vci_once(symbols)
                # periodically probe DNSE recovery
                if await self._probe_dnse():
                    logger.info("realtime: DNSE reachable again, leaving degraded mode")
                    return
                await asyncio.sleep(settings.REALTIME_FALLBACK_POLL_SECONDS)
        finally:
            await self._clear_degraded()

    async def _poll_vci_once(self, symbols: list[str]) -> None:
        """Fetch VCI price-board and publish a synthetic tick per symbol."""
        try:
            from app.services.market_data.sources import vietcap

            board = await vietcap.fetch_price_board(symbols)
        except Exception:  # noqa: BLE001
            logger.debug("degraded VCI poll failed", exc_info=True)
            return
        items = board[0] if isinstance(board, tuple) else board
        for it in items or []:
            sym = (it.get("symbol") or "").upper()
            close = it.get("close_price") or it.get("reference_price") or 0
            if not sym or not close:
                continue
            await pubsub.publish(
                topics.redis_channel(normalize.KIND_TICK, sym),
                {
                    "type": "tick",
                    "symbol": sym,
                    "price": float(close),
                    "volume": 0,
                    "side": "unknown",
                    "total_volume": float(it.get("total_volume") or 0),
                    "time": None,
                    "degraded": True,
                },
            )

    async def _probe_dnse(self) -> bool:
        """Quick reachability probe against the ACTIVE transport's endpoint.

        MQTT: re-auth (cheap, cached JWT) + TCP to the broker. OpenAPI: auth is
        a stateless HMAC handshake, so a TCP probe of the WS host suffices.
        """
        settings = get_settings()
        if resolve_transport(settings) == "openapi":
            host, port = openapi_stream.ws_host_port(settings.DNSE_OPENAPI_WS_URL)
        else:
            try:
                await dnse_auth.get_or_refresh()
            except Exception:  # noqa: BLE001
                return False
            host, port = settings.DNSE_MQTT_HOST, settings.DNSE_MQTT_PORT
        try:
            fut = asyncio.open_connection(host, port)
            reader, writer = await asyncio.wait_for(fut, timeout=5)
            writer.close()
            with contextlib.suppress(Exception):
                await writer.wait_closed()
            return True
        except Exception:  # noqa: BLE001
            return False

    async def _set_degraded(self) -> None:
        redis = get_redis_client()
        if redis is not None:
            with contextlib.suppress(Exception):
                await redis.set(_DEGRADED_KEY, "1", ex=300)

    async def _clear_degraded(self) -> None:
        redis = get_redis_client()
        if redis is not None:
            with contextlib.suppress(Exception):
                await redis.delete(_DEGRADED_KEY)


# Module-level singleton (one per worker process).
_bridge: DnseBridge | None = None


def get_bridge() -> DnseBridge:
    global _bridge  # noqa: PLW0603
    if _bridge is None:
        _bridge = DnseBridge()
    return _bridge
