"""Kiểm tra OpenAPI tags không bị lặp/đặt nhầm."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

# Tag chung không nên xuất hiện trên bất kỳ operation Market Data nào
# (đã được tách thành tag con như "Dữ liệu thị trường: Tham chiếu", v.v.)
_GENERIC_MARKET_DATA_TAG = "Dữ liệu thị trường"

# Tag chung không nên xuất hiện trên bất kỳ operation Virtual Trading admin nào
# (admin endpoint dùng "Giao dịch ảo (quản trị)" — tag chung sẽ làm trùng lặp).
_GENERIC_VIRTUAL_TRADING_TAG = "Giao dịch ảo"
_ADMIN_VIRTUAL_TRADING_TAG = "Giao dịch ảo (quản trị)"


@pytest.mark.asyncio
async def test_openapi_market_data_no_generic_only_tag(client: AsyncClient):
    """Không operation /market-data nào chỉ mang tag chung 'Dữ liệu thị trường'."""
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    spec = resp.json()

    offending: list[tuple[str, str, list[str]]] = []
    for path, methods in spec["paths"].items():
        if not path.startswith("/api/v1/market-data"):
            continue
        for method, op in methods.items():
            if method.startswith("x-"):
                continue
            tags = op.get("tags") or []
            # Phải có ít nhất một tag con kiểu "Dữ liệu thị trường: ..."
            has_subtag = any(
                t.startswith(f"{_GENERIC_MARKET_DATA_TAG}: ") for t in tags
            )
            if not has_subtag:
                offending.append((path, method, tags))

    assert not offending, (
        f"Các operation Market Data thiếu tag con: {offending}"
    )


@pytest.mark.asyncio
async def test_openapi_market_data_no_duplicate_generic_and_subtag(client: AsyncClient):
    """Operation Market Data không được mang đồng thời tag chung và tag con."""
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    spec = resp.json()

    duplicates: list[tuple[str, str, list[str]]] = []
    for path, methods in spec["paths"].items():
        if not path.startswith("/api/v1/market-data"):
            continue
        for method, op in methods.items():
            if method.startswith("x-"):
                continue
            tags = op.get("tags") or []
            has_generic = _GENERIC_MARKET_DATA_TAG in tags
            has_subtag = any(
                t.startswith(f"{_GENERIC_MARKET_DATA_TAG}: ") for t in tags
            )
            if has_generic and has_subtag:
                duplicates.append((path, method, tags))

    assert not duplicates, (
        f"Các operation Market Data bị trùng tag chung và tag con: {duplicates}"
    )


@pytest.mark.asyncio
async def test_openapi_no_market_data_operation_with_only_generic_tag(client: AsyncClient):
    """Không operation Market Data nào có tag chính xác là 'Dữ liệu thị trường'."""
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    spec = resp.json()

    bad: list[tuple[str, str, list[str]]] = []
    for path, methods in spec["paths"].items():
        if not path.startswith("/api/v1/market-data"):
            continue
        for method, op in methods.items():
            if method.startswith("x-"):
                continue
            tags = op.get("tags") or []
            if _GENERIC_MARKET_DATA_TAG in tags:
                bad.append((path, method, tags))

    assert not bad, (
        f"Operation Market Data không được mang tag chung '{_GENERIC_MARKET_DATA_TAG}': {bad}"
    )


@pytest.mark.asyncio
async def test_openapi_virtual_trading_admin_no_duplicate_tag(client: AsyncClient):
    """Endpoint admin Virtual Trading không được mang đồng thời tag chung và tag admin."""
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    spec = resp.json()

    duplicates: list[tuple[str, str, list[str]]] = []
    for path, methods in spec["paths"].items():
        if not path.startswith("/api/v1/virtual-trading/admin"):
            continue
        for method, op in methods.items():
            if method.startswith("x-"):
                continue
            tags = op.get("tags") or []
            if (
                _GENERIC_VIRTUAL_TRADING_TAG in tags
                and _ADMIN_VIRTUAL_TRADING_TAG in tags
            ):
                duplicates.append((path, method, tags))

    assert not duplicates, (
        f"Operation Virtual Trading admin bị trùng tag: {duplicates}"
    )


@pytest.mark.asyncio
async def test_openapi_no_duplicate_tag_per_operation(client: AsyncClient):
    """Không operation nào mang tag trùng lặp (cùng một tag xuất hiện 2 lần)."""
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    spec = resp.json()

    bad: list[tuple[str, str, list[str]]] = []
    for path, methods in spec["paths"].items():
        for method, op in methods.items():
            if method.startswith("x-"):
                continue
            tags = op.get("tags") or []
            if len(tags) != len(set(tags)):
                bad.append((path, method, tags))

    assert not bad, f"Operation có tag trùng: {bad}"
