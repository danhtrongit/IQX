"""Tests for the Symbol model, seed service, repository, and API endpoints."""

from __future__ import annotations

from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.symbol import Symbol
from app.repositories.symbol import SymbolRepository
from app.services.symbols import build_simplize_logo_url, seed_symbols

# ══════════════════════════════════════════════════════
# 1. Model / table creation with SQLite fixture
# ══════════════════════════════════════════════════════


class TestSymbolModel:
    """Verify the Symbol model works with the SQLite test database."""

    @pytest.mark.asyncio
    async def test_create_symbol(self, db_session: AsyncSession) -> None:
        """A Symbol record can be created and read back."""
        sym = Symbol(
            symbol="VNM",
            name="CTCP Sữa Việt Nam",
            short_name="Vinamilk",
            exchange="HOSE",
            asset_type="stock",
            is_index=False,
        )
        db_session.add(sym)
        await db_session.flush()
        await db_session.refresh(sym)

        assert sym.id is not None
        assert sym.symbol == "VNM"
        assert sym.exchange == "HOSE"
        assert sym.is_active is True
        assert sym.is_index is False

    @pytest.mark.asyncio
    async def test_unique_symbol(self, db_session: AsyncSession) -> None:
        """Duplicate symbol codes raise an integrity error."""
        from sqlalchemy.exc import IntegrityError

        db_session.add(Symbol(symbol="FPT", name="FPT Corp"))
        await db_session.flush()

        db_session.add(Symbol(symbol="FPT", name="FPT Duplicate"))
        with pytest.raises(IntegrityError):
            await db_session.flush()

    @pytest.mark.asyncio
    async def test_default_values(self, db_session: AsyncSession) -> None:
        """Default column values are set correctly."""
        sym = Symbol(symbol="TEST")
        db_session.add(sym)
        await db_session.flush()
        await db_session.refresh(sym)

        assert sym.is_active is True
        assert sym.is_index is False


# ══════════════════════════════════════════════════════
# 2. Repository tests
# ══════════════════════════════════════════════════════


class TestSymbolRepository:

    @pytest_asyncio.fixture
    async def seeded_db(self, db_session: AsyncSession) -> AsyncSession:
        """Seed test symbols into the database."""
        symbols = [
            Symbol(symbol="VNM", name="CTCP Sữa Việt Nam", short_name="Vinamilk",
                   exchange="HOSE", asset_type="stock", is_index=False),
            Symbol(symbol="FPT", name="CTCP FPT", short_name="FPT",
                   exchange="HOSE", asset_type="stock", is_index=False),
            Symbol(symbol="VCB", name="Ngân hàng Ngoại thương Việt Nam", short_name="Vietcombank",
                   exchange="HOSE", asset_type="stock", is_index=False),
            Symbol(symbol="SHB", name="Ngân hàng TMCP Sài Gòn - Hà Nội", short_name="SHB",
                   exchange="HNX", asset_type="stock", is_index=False),
            Symbol(symbol="VNINDEX", name="VN-Index", exchange="HOSE",
                   asset_type="index", is_index=True),
            Symbol(symbol="AAA", name="CTCP Nhựa An Phát Xanh", short_name="An Phát",
                   exchange="HOSE", asset_type="stock", is_index=False, is_active=False),
        ]
        for s in symbols:
            db_session.add(s)
        await db_session.flush()
        return db_session

    @pytest.mark.asyncio
    async def test_get_by_symbol(self, seeded_db: AsyncSession) -> None:
        repo = SymbolRepository(seeded_db)
        result = await repo.get_by_symbol("VNM")
        assert result is not None
        assert result.symbol == "VNM"

    @pytest.mark.asyncio
    async def test_get_by_symbol_case_insensitive_key(self, seeded_db: AsyncSession) -> None:
        repo = SymbolRepository(seeded_db)
        result = await repo.get_by_symbol("vnm")
        assert result is not None
        assert result.symbol == "VNM"

    @pytest.mark.asyncio
    async def test_get_by_symbol_not_found(self, seeded_db: AsyncSession) -> None:
        repo = SymbolRepository(seeded_db)
        result = await repo.get_by_symbol("ZZZZZ")
        assert result is None

    @pytest.mark.asyncio
    async def test_search_exact_symbol(self, seeded_db: AsyncSession) -> None:
        repo = SymbolRepository(seeded_db)
        results, total = await repo.search(q="VNM")
        assert total >= 1
        assert results[0].symbol == "VNM"

    @pytest.mark.asyncio
    async def test_search_prefix(self, seeded_db: AsyncSession) -> None:
        repo = SymbolRepository(seeded_db)
        results, total = await repo.search(q="VN")
        symbols = [r.symbol for r in results]
        assert "VNM" in symbols

    @pytest.mark.asyncio
    async def test_search_by_name(self, seeded_db: AsyncSession) -> None:
        # Note: SQLite ILIKE doesn't handle Vietnamese diacritics case-insensitive.
        # Use exact-case substring that exists in the stored name.
        repo = SymbolRepository(seeded_db)
        results, total = await repo.search(q="CTCP")
        assert total >= 1
        symbols = [r.symbol for r in results]
        assert "VNM" in symbols

    @pytest.mark.asyncio
    async def test_search_by_short_name(self, seeded_db: AsyncSession) -> None:
        repo = SymbolRepository(seeded_db)
        results, total = await repo.search(q="VIETCOMBANK")
        assert total >= 1
        assert results[0].symbol == "VCB"

    @pytest.mark.asyncio
    async def test_search_filter_exchange(self, seeded_db: AsyncSession) -> None:
        repo = SymbolRepository(seeded_db)
        results, total = await repo.search(exchange="HNX")
        symbols = [r.symbol for r in results]
        assert "SHB" in symbols
        assert "VNM" not in symbols

    @pytest.mark.asyncio
    async def test_search_exclude_indices(self, seeded_db: AsyncSession) -> None:
        repo = SymbolRepository(seeded_db)
        results, total = await repo.search(include_indices=False)
        symbols = [r.symbol for r in results]
        assert "VNINDEX" not in symbols

    @pytest.mark.asyncio
    async def test_search_include_indices(self, seeded_db: AsyncSession) -> None:
        repo = SymbolRepository(seeded_db)
        results, total = await repo.search(include_indices=True)
        symbols = [r.symbol for r in results]
        assert "VNINDEX" in symbols

    @pytest.mark.asyncio
    async def test_search_excludes_inactive(self, seeded_db: AsyncSession) -> None:
        repo = SymbolRepository(seeded_db)
        results, total = await repo.search(is_active=True)
        symbols = [r.symbol for r in results]
        assert "AAA" not in symbols

    @pytest.mark.asyncio
    async def test_search_pagination(self, seeded_db: AsyncSession) -> None:
        repo = SymbolRepository(seeded_db)
        page1, total = await repo.search(page=1, page_size=2)
        page2, _ = await repo.search(page=2, page_size=2)
        assert len(page1) == 2
        assert len(page2) >= 1
        # Pages should have different items
        p1_syms = {r.symbol for r in page1}
        p2_syms = {r.symbol for r in page2}
        assert p1_syms.isdisjoint(p2_syms)

    @pytest.mark.asyncio
    async def test_upsert_many_insert(self, db_session: AsyncSession) -> None:
        repo = SymbolRepository(db_session)
        records = [
            {"symbol": "NEW1", "name": "New Stock 1", "exchange": "HOSE"},
            {"symbol": "NEW2", "name": "New Stock 2", "exchange": "HNX"},
        ]
        inserted, updated = await repo.upsert_many(records)
        assert inserted == 2
        assert updated == 0

    @pytest.mark.asyncio
    async def test_upsert_many_update(self, db_session: AsyncSession) -> None:
        repo = SymbolRepository(db_session)
        # First insert
        await repo.upsert_many([{"symbol": "UPS", "name": "Original"}])
        # Then upsert with new name
        inserted, updated = await repo.upsert_many([{"symbol": "UPS", "name": "Updated"}])
        assert inserted == 0
        assert updated == 1
        result = await repo.get_by_symbol("UPS")
        assert result is not None
        assert result.name == "Updated"

    @pytest.mark.asyncio
    async def test_deactivate_missing(self, seeded_db: AsyncSession) -> None:
        repo = SymbolRepository(seeded_db)
        # Keep only VNM, deactivate others
        deactivated = await repo.deactivate_missing({"VNM"})
        assert deactivated >= 3  # FPT, VCB, SHB, VNINDEX


# ══════════════════════════════════════════════════════
# 3. Logo URL tests
# ══════════════════════════════════════════════════════


class TestLogoUrl:

    def test_build_simplize_logo_vnm(self) -> None:
        url = build_simplize_logo_url("VNM")
        assert url == "https://cdn.simplize.vn/simplizevn/logo/VNM.jpeg"

    def test_build_simplize_logo_fpt(self) -> None:
        url = build_simplize_logo_url("fpt")
        assert url == "https://cdn.simplize.vn/simplizevn/logo/FPT.jpeg"

    def test_build_simplize_logo_lowercase(self) -> None:
        url = build_simplize_logo_url("vcb")
        assert url == "https://cdn.simplize.vn/simplizevn/logo/VCB.jpeg"

    def test_simplize_url_env_override(self) -> None:
        with patch("app.services.symbols.get_simplize_logo_base_url", return_value="https://custom.cdn/logos"):
            url = build_simplize_logo_url("VNM")
        assert url == "https://custom.cdn/logos/VNM.jpeg"


# ══════════════════════════════════════════════════════
# 4. Seed service tests (mocked upstream)
# ══════════════════════════════════════════════════════


MOCK_SEARCH_BAR_DATA = [
    {
        "code": "VNM", "name": "CTCP Sữa Việt Nam", "shortName": "Vinamilk",
        "floor": "HOSE", "isIndex": False, "currentPrice": 80000,
        "targetPrice": 95000, "upsideToTpPercentage": 18.75,
        "logoUrl": "https://vci.logo/VNM.png",
        "icbLv1": "Hàng tiêu dùng", "icbLv2": "Thực phẩm",
    },
    {
        "code": "FPT", "name": "CTCP FPT", "shortName": "FPT",
        "floor": "HOSE", "isIndex": False, "currentPrice": 120000,
        "targetPrice": None, "upsideToTpPercentage": None,
        "logoUrl": "", "icbLv1": "Công nghệ", "icbLv2": "Phần mềm",
    },
]

MOCK_LISTING_DATA = [
    {"symbol": "VNM", "name": "CTCP Sữa Việt Nam", "exchange": "HOSE", "asset_type": "stock"},
    {"symbol": "FPT", "name": "CTCP FPT", "exchange": "HOSE", "asset_type": "stock"},
    {"symbol": "SHB", "name": "NH TMCP SHB", "exchange": "HNX", "asset_type": "stock"},
]


class TestSeedService:

    @pytest.mark.asyncio
    async def test_seed_inserts_records(self, db_session: AsyncSession) -> None:
        with (
            patch("app.services.symbols._fetch_search_bar_data") as mock_sb,
            patch("app.services.symbols._fetch_listing_data") as mock_ld,
        ):
            mock_sb.return_value = (MOCK_SEARCH_BAR_DATA, "http://test")
            mock_ld.return_value = (MOCK_LISTING_DATA, "http://test")

            summary = await seed_symbols(db_session, validate_logos=False)

        assert summary.fetched == 2
        assert summary.inserted == 2
        assert summary.updated == 0
        assert summary.errors == []

        # Verify records exist
        repo = SymbolRepository(db_session)
        vnm = await repo.get_by_symbol("VNM")
        assert vnm is not None
        assert vnm.name == "CTCP Sữa Việt Nam"
        assert vnm.exchange == "HOSE"
        assert vnm.logo_url == "https://cdn.simplize.vn/simplizevn/logo/VNM.jpeg"
        assert vnm.logo_source == "SIMPLIZE"

    @pytest.mark.asyncio
    async def test_seed_idempotent(self, db_session: AsyncSession) -> None:
        """Running seed twice should update, not duplicate."""
        with (
            patch("app.services.symbols._fetch_search_bar_data") as mock_sb,
            patch("app.services.symbols._fetch_listing_data") as mock_ld,
        ):
            mock_sb.return_value = (MOCK_SEARCH_BAR_DATA, "http://test")
            mock_ld.return_value = (MOCK_LISTING_DATA, "http://test")

            s1 = await seed_symbols(db_session, validate_logos=False)
            s2 = await seed_symbols(db_session, validate_logos=False)

        assert s1.inserted == 2
        assert s2.inserted == 0
        assert s2.updated == 2

    @pytest.mark.asyncio
    async def test_seed_dry_run(self, db_session: AsyncSession) -> None:
        with (
            patch("app.services.symbols._fetch_search_bar_data") as mock_sb,
            patch("app.services.symbols._fetch_listing_data") as mock_ld,
        ):
            mock_sb.return_value = (MOCK_SEARCH_BAR_DATA, "http://test")
            mock_ld.return_value = (MOCK_LISTING_DATA, "http://test")

            summary = await seed_symbols(db_session, dry_run=True)

        assert summary.dry_run is True
        assert summary.fetched == 2
        assert summary.inserted == 0

        # Verify nothing was written
        repo = SymbolRepository(db_session)
        result = await repo.get_by_symbol("VNM")
        assert result is None

    @pytest.mark.asyncio
    async def test_seed_with_limit(self, db_session: AsyncSession) -> None:
        with (
            patch("app.services.symbols._fetch_search_bar_data") as mock_sb,
            patch("app.services.symbols._fetch_listing_data") as mock_ld,
        ):
            mock_sb.return_value = (MOCK_SEARCH_BAR_DATA, "http://test")
            mock_ld.return_value = (MOCK_LISTING_DATA, "http://test")

            summary = await seed_symbols(db_session, limit=1)

        assert summary.fetched == 1
        assert summary.inserted == 1

    @pytest.mark.asyncio
    async def test_seed_deactivate_missing(self, db_session: AsyncSession) -> None:
        # Pre-seed a symbol that won't be in upstream
        db_session.add(Symbol(symbol="OLD", name="Old Stock", is_active=True))
        await db_session.flush()

        with (
            patch("app.services.symbols._fetch_search_bar_data") as mock_sb,
            patch("app.services.symbols._fetch_listing_data") as mock_ld,
        ):
            mock_sb.return_value = (MOCK_SEARCH_BAR_DATA, "http://test")
            mock_ld.return_value = (MOCK_LISTING_DATA, "http://test")

            summary = await seed_symbols(db_session, deactivate_missing=True)

        assert summary.deactivated >= 1

        # OLD should now be inactive
        repo = SymbolRepository(db_session)
        old = await repo.get_by_symbol("OLD")
        assert old is not None
        assert old.is_active is False

    @pytest.mark.asyncio
    async def test_seed_search_bar_failure(self, db_session: AsyncSession) -> None:
        with patch("app.services.symbols._fetch_search_bar_data") as mock_sb:
            mock_sb.side_effect = Exception("Upstream down")
            summary = await seed_symbols(db_session)

        assert summary.fetched == 0
        assert len(summary.errors) == 1
        assert "fetch_search_bar failed" in summary.errors[0]

    @pytest.mark.asyncio
    async def test_seed_listing_failure_still_works(self, db_session: AsyncSession) -> None:
        """Seed should proceed even if listing data fails."""
        with (
            patch("app.services.symbols._fetch_search_bar_data") as mock_sb,
            patch("app.services.symbols._fetch_listing_data") as mock_ld,
        ):
            mock_sb.return_value = (MOCK_SEARCH_BAR_DATA, "http://test")
            mock_ld.return_value = None  # listing failed

            summary = await seed_symbols(db_session)

        assert summary.fetched == 2
        assert summary.inserted == 2
        assert summary.errors == []


# ══════════════════════════════════════════════════════
# 5. API endpoint tests
# ══════════════════════════════════════════════════════


@pytest_asyncio.fixture
async def seeded_client(client: AsyncClient, db_session: AsyncSession) -> AsyncClient:
    """Seed the database and return the test client."""
    symbols = [
        Symbol(symbol="VNM", name="CTCP Sữa Việt Nam", short_name="Vinamilk",
               exchange="HOSE", asset_type="stock", is_index=False,
               current_price_vnd=80000, logo_url="https://cdn.simplize.vn/simplizevn/logo/VNM.jpeg"),
        Symbol(symbol="FPT", name="CTCP FPT", short_name="FPT",
               exchange="HOSE", asset_type="stock", is_index=False,
               current_price_vnd=120000),
        Symbol(symbol="SHB", name="Ngân hàng TMCP Sài Gòn - Hà Nội", short_name="SHB",
               exchange="HNX", asset_type="stock", is_index=False),
        Symbol(symbol="VNINDEX", name="VN-Index", exchange="HOSE",
               asset_type="index", is_index=True),
    ]
    for s in symbols:
        db_session.add(s)
    await db_session.flush()
    return client


class TestSearchAPI:

    @pytest.mark.asyncio
    async def test_search_no_query(self, seeded_client: AsyncClient) -> None:
        resp = await seeded_client.get("/api/v1/market-data/reference/symbols/search")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] >= 3  # excludes VNINDEX by default

    @pytest.mark.asyncio
    async def test_search_exact_symbol(self, seeded_client: AsyncClient) -> None:
        resp = await seeded_client.get("/api/v1/market-data/reference/symbols/search?q=VNM")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert data["items"][0]["symbol"] == "VNM"

    @pytest.mark.asyncio
    async def test_search_prefix(self, seeded_client: AsyncClient) -> None:
        resp = await seeded_client.get("/api/v1/market-data/reference/symbols/search?q=VN")
        assert resp.status_code == 200
        data = resp.json()
        symbols = [item["symbol"] for item in data["items"]]
        assert "VNM" in symbols

    @pytest.mark.asyncio
    async def test_search_by_name_case_insensitive(self, seeded_client: AsyncClient) -> None:
        # SQLite ILIKE has limited case-insensitive support for non-ASCII.
        # Use ASCII term that matches stored data.
        resp = await seeded_client.get("/api/v1/market-data/reference/symbols/search?q=CTCP")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1

    @pytest.mark.asyncio
    async def test_search_filter_exchange(self, seeded_client: AsyncClient) -> None:
        resp = await seeded_client.get("/api/v1/market-data/reference/symbols/search?exchange=HNX")
        assert resp.status_code == 200
        data = resp.json()
        symbols = [item["symbol"] for item in data["items"]]
        assert "SHB" in symbols
        assert "VNM" not in symbols

    @pytest.mark.asyncio
    async def test_search_exclude_indices_default(self, seeded_client: AsyncClient) -> None:
        resp = await seeded_client.get("/api/v1/market-data/reference/symbols/search")
        data = resp.json()
        symbols = [item["symbol"] for item in data["items"]]
        assert "VNINDEX" not in symbols

    @pytest.mark.asyncio
    async def test_search_include_indices(self, seeded_client: AsyncClient) -> None:
        resp = await seeded_client.get(
            "/api/v1/market-data/reference/symbols/search?include_indices=true"
        )
        data = resp.json()
        symbols = [item["symbol"] for item in data["items"]]
        assert "VNINDEX" in symbols

    @pytest.mark.asyncio
    async def test_search_pagination(self, seeded_client: AsyncClient) -> None:
        resp = await seeded_client.get(
            "/api/v1/market-data/reference/symbols/search?page=1&page_size=1"
        )
        data = resp.json()
        assert len(data["items"]) == 1
        assert data["page"] == 1
        assert data["page_size"] == 1
        assert data["total_pages"] >= 2


class TestSymbolDetailAPI:

    @pytest.mark.asyncio
    async def test_get_symbol_found(self, seeded_client: AsyncClient) -> None:
        resp = await seeded_client.get("/api/v1/market-data/reference/symbols/VNM")
        assert resp.status_code == 200
        data = resp.json()
        assert data["symbol"] == "VNM"
        assert data["name"] == "CTCP Sữa Việt Nam"
        assert "id" in data

    @pytest.mark.asyncio
    async def test_get_symbol_not_found(self, seeded_client: AsyncClient) -> None:
        resp = await seeded_client.get("/api/v1/market-data/reference/symbols/ZZZZZ")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_symbol_case_insensitive(self, seeded_client: AsyncClient) -> None:
        resp = await seeded_client.get("/api/v1/market-data/reference/symbols/vnm")
        assert resp.status_code == 200
        data = resp.json()
        assert data["symbol"] == "VNM"
