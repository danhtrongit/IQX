"""Regression for UTC order times previously displayed seven hours early."""

from datetime import UTC, datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.schemas.virtual_trading.order import OrderResponse


@pytest.mark.parametrize("offset", [None, UTC, timezone(timedelta(hours=7))])
def test_order_response_includes_timezone(offset):
    created = datetime(2026, 9, 9, 12, 30, tzinfo=offset)
    order = OrderResponse(
        id=uuid4(), account_id=uuid4(), symbol="VNM", mode="san_tap",
        side="buy", order_type="market", status="filled", quantity=100,
        trading_date=created.date(), created_at=created,
    )
    encoded = order.model_dump(mode="json")["created_at"]
    parsed = datetime.fromisoformat(encoded.replace("Z", "+00:00"))
    expected = created.replace(tzinfo=UTC) if offset is None else created
    assert parsed.tzinfo is not None
    assert parsed == expected
