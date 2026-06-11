"""DNSE MQTT bridge — the single connection that feeds Redis pub/sub.

Worker-safety: with ``uvicorn --workers 2`` we must keep exactly ONE DNSE
connection. A Redis lock (``realtime:leader``) elects one worker as leader; only
the leader connects to DNSE. Non-leaders keep trying to acquire the lock so they
can take over if the leader dies (TTL-based failover).

The leader:
- authenticates (cached JWT, auto-refresh),
- connects MQTT v5 over WSS,
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

from app.core.config import get_settings
from app.services.cache.redis_cache import get_redis_client
from app.services.realtime import demand, dnse_auth, normalize, pubsub, topics

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
        """Run as leader: keep MQTT connected, reconnect, then degrade."""
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
                    "realtime MQTT disconnected (%s), attempt %d/%d",
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

    # ── MQTT streaming ──────────────────────────────
    async def _connect_and_stream(self) -> None:
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
            try:
                async for message in client.messages:
                    await self._handle_message(str(message.topic), message.payload)
            finally:
                recon.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await recon

    async def _reconcile_loop(self, client, subscribed: dict[str, set[str]]) -> None:
        """Diff live demand vs current subscriptions; (un)subscribe topics."""
        settings = get_settings()
        while not self._stop.is_set():
            if not await self._renew_leader():
                raise RuntimeError("lost leadership")
            wanted = await demand.current()
            # cap total symbols
            if len(wanted) > settings.REALTIME_MAX_SYMBOLS:
                wanted = dict(list(wanted.items())[: settings.REALTIME_MAX_SYMBOLS])

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
                symbols = list(wanted.keys())[: settings.REALTIME_MAX_SYMBOLS]
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
        """Quick reachability probe: re-auth (cheap, cached) + TCP to broker."""
        try:
            await dnse_auth.get_or_refresh()
        except Exception:  # noqa: BLE001
            return False
        settings = get_settings()
        try:
            fut = asyncio.open_connection(settings.DNSE_MQTT_HOST, settings.DNSE_MQTT_PORT)
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
