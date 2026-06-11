"""Realtime market-data WebSocket endpoint.

Protocol (JSON text frames):
  client → server:  {"action":"subscribe","symbols":["FPT"],"channels":["tick","orderbook"]}
                    {"action":"unsubscribe","symbols":["FPT"],"channels":["tick"]}
                    {"action":"ping"}
  server → client:  normalized payloads ({"type":"tick",...}), plus {"type":"pong"}
                    and {"type":"error","detail":...}

Access is public (matches the existing public price-board), but each connection
is capped at ``REALTIME_WS_MAX_SYMBOLS_PER_CONN`` symbols. Symbol demand is
ref-counted in Redis so the leader knows which KRX topics to keep open.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.core.config import get_settings
from app.services.realtime import demand, pubsub
from app.services.realtime.schemas import ClientMessage
from app.services.realtime.topics import redis_channel

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Realtime"])

_CHANNEL_KIND = {"tick": "tick", "orderbook": "orderbook", "ohlc": "ohlc", "index": "index"}


class _Connection:
    """Tracks one client's subscriptions and its Redis pub/sub forwarder."""

    def __init__(self, ws: WebSocket) -> None:
        self.ws = ws
        # (symbol, channel) pairs this connection currently holds.
        self.subs: set[tuple[str, str]] = set()
        self._forward_task: asyncio.Task | None = None
        self._redis_channels: set[str] = set()
        self._lock = asyncio.Lock()

    async def _restart_forwarder(self) -> None:
        """(Re)start the pub/sub forwarder for the current channel set."""
        if self._forward_task is not None:
            self._forward_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._forward_task
            self._forward_task = None
        if not self._redis_channels:
            return
        channels = list(self._redis_channels)
        self._forward_task = asyncio.create_task(self._forward(channels))

    async def _forward(self, channels: list[str]) -> None:
        try:
            async for payload in pubsub.subscribe(channels):
                await self.ws.send_json(payload)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.debug("ws forward stopped", exc_info=True)

    async def subscribe(self, symbols: list[str], channels: list[str]) -> None:
        settings = get_settings()
        async with self._lock:
            for sym in symbols:
                for ch in channels:
                    pair = (sym, ch)
                    if pair in self.subs:
                        continue
                    # enforce per-connection symbol cap (by distinct symbols);
                    # mã chỉ số không tính vào cap — chỉ vài mã, dùng chung cho
                    # mọi client, và không được để tab lớn đẩy chỉ số ra ngoài.
                    distinct = {s for s, c in self.subs if c != "index"}
                    if (
                        ch != "index"
                        and sym not in distinct
                        and len(distinct) >= settings.REALTIME_WS_MAX_SYMBOLS_PER_CONN
                    ):
                        await self.ws.send_json(
                            {"type": "error", "detail": "symbol limit reached"}
                        )
                        continue
                    self.subs.add(pair)
                    self._redis_channels.add(redis_channel(_CHANNEL_KIND[ch], sym))
                    await demand.add(sym, [ch])
            await self._restart_forwarder()

    async def unsubscribe(self, symbols: list[str], channels: list[str]) -> None:
        async with self._lock:
            for sym in symbols:
                for ch in channels:
                    pair = (sym, ch)
                    if pair in self.subs:
                        self.subs.discard(pair)
                        await demand.remove(sym, [ch])
            # rebuild channel set from remaining subs
            self._redis_channels = {
                redis_channel(_CHANNEL_KIND[c], s) for s, c in self.subs
            }
            await self._restart_forwarder()

    async def close(self) -> None:
        if self._forward_task is not None:
            self._forward_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._forward_task
        # release all demand this connection held
        for sym, ch in list(self.subs):
            await demand.remove(sym, [ch])
        self.subs.clear()


@router.websocket("/market-data/ws")
async def market_data_ws(ws: WebSocket) -> None:
    settings = get_settings()
    if not settings.REALTIME_ENABLED:
        await ws.close(code=1013)  # try again later
        return

    await ws.accept()
    conn = _Connection(ws)
    try:
        while True:
            raw = await ws.receive_json()
            try:
                msg = ClientMessage.model_validate(raw)
            except ValidationError:
                await ws.send_json({"type": "error", "detail": "invalid message"})
                continue

            if msg.action == "ping":
                await ws.send_json({"type": "pong"})
            elif msg.action == "subscribe":
                await conn.subscribe(msg.normalized_symbols(), list(msg.channels))
            elif msg.action == "unsubscribe":
                await conn.unsubscribe(msg.normalized_symbols(), list(msg.channels))
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.debug("ws session error", exc_info=True)
    finally:
        await conn.close()
