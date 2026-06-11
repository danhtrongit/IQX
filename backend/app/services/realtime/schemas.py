"""Pydantic models for the realtime WebSocket protocol (client <-> server)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# Channels a client may request.
Channel = Literal["tick", "orderbook", "ohlc"]


class ClientMessage(BaseModel):
    """Inbound message from a WS client."""

    action: Literal["subscribe", "unsubscribe", "ping"]
    symbols: list[str] = Field(default_factory=list)
    channels: list[Channel] = Field(default_factory=lambda: ["tick"])

    def normalized_symbols(self) -> list[str]:
        seen: list[str] = []
        for s in self.symbols:
            u = str(s).strip().upper()
            if u and u not in seen:
                seen.append(u)
        return seen
