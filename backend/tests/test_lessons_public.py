"""Tests for public lesson endpoints — catalog browse, course detail."""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.lesson import Course, Episode
from app.models.user import User, UserRole, UserStatus

pytestmark = pytest.mark.asyncio


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _make_course(db: AsyncSession, **kw) -> Course:
    defaults = dict(
        slug=f"pub-course-{uuid.uuid4().hex[:8]}",
        title="Public Course",
        level="beginner",
        category="trading",
        is_premium=False,
        is_published=True,
    )
    defaults.update(kw)
    c = Course(**defaults)
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


async def _make_episode(db: AsyncSession, course: Course, **kw) -> Episode:
    defaults = dict(
        course_id=course.id,
        title="Episode 1",
        content_type="text",
        markdown_body="# Hello",
        sort_order=1,
        is_published=True,
    )
    defaults.update(kw)
    ep = Episode(**defaults)
    db.add(ep)
    await db.commit()
    await db.refresh(ep)
    return ep


@pytest_asyncio.fixture
async def published_course(db_session: AsyncSession) -> Course:
    return await _make_course(db_session, is_published=True)


@pytest_asyncio.fixture
async def unpublished_course(db_session: AsyncSession) -> Course:
    return await _make_course(db_session, is_published=False)


# ── Public catalog list ─────────────────────────────────────────────────────────


async def test_anonymous_can_list_courses(
    client: AsyncClient, published_course: Course
) -> None:
    resp = await client.get("/api/v1/lessons/courses")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert data["total"] >= 1


async def test_catalog_shows_only_published(
    client: AsyncClient,
    db_session: AsyncSession,
    published_course: Course,
    unpublished_course: Course,
) -> None:
    resp = await client.get("/api/v1/lessons/courses")
    assert resp.status_code == 200
    slugs = [item["slug"] for item in resp.json()["items"]]
    assert published_course.slug in slugs
    assert unpublished_course.slug not in slugs


async def test_catalog_filter_by_category(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _make_course(db_session, category="cat-a", slug=f"c-a-{uuid.uuid4().hex[:6]}")
    await _make_course(db_session, category="cat-b", slug=f"c-b-{uuid.uuid4().hex[:6]}")

    resp = await client.get("/api/v1/lessons/courses?category=cat-a")
    assert resp.status_code == 200
    data = resp.json()
    for item in data["items"]:
        assert item["category"] == "cat-a"


async def test_catalog_filter_by_premium(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _make_course(db_session, is_premium=True, slug=f"prem-{uuid.uuid4().hex[:6]}")
    await _make_course(db_session, is_premium=False, slug=f"free-{uuid.uuid4().hex[:6]}")

    resp = await client.get("/api/v1/lessons/courses?is_premium=true")
    assert resp.status_code == 200
    for item in resp.json()["items"]:
        assert item["is_premium"] is True


async def test_catalog_pagination(client: AsyncClient, db_session: AsyncSession) -> None:
    for i in range(5):
        await _make_course(db_session, slug=f"paged-{i}-{uuid.uuid4().hex[:6]}")

    resp = await client.get("/api/v1/lessons/courses?page=1&page_size=2")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) <= 2
    assert "total_pages" in data


# ── Course detail ──────────────────────────────────────────────────────────────


async def test_anonymous_get_course_detail(
    client: AsyncClient, db_session: AsyncSession, published_course: Course
) -> None:
    ep = await _make_episode(db_session, published_course)
    resp = await client.get(f"/api/v1/lessons/courses/{published_course.slug}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["slug"] == published_course.slug
    assert "episodes" in data
    assert len(data["episodes"]) == 1


async def test_course_detail_episodes_have_no_file_url(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Episode listing in course detail must NOT expose file_url or markdown_body."""
    course = await _make_course(db_session)
    ep = Episode(
        course_id=course.id,
        title="PDF Episode",
        content_type="pdf",
        file_url="/media/courses/secret/file.pdf",
        sort_order=1,
        is_published=True,
    )
    db_session.add(ep)
    await db_session.commit()

    resp = await client.get(f"/api/v1/lessons/courses/{course.slug}")
    assert resp.status_code == 200
    episodes = resp.json()["episodes"]
    for ep_data in episodes:
        assert "file_url" not in ep_data
        assert "markdown_body" not in ep_data


async def test_course_detail_episodes_have_no_markdown_body(
    client: AsyncClient, db_session: AsyncSession, published_course: Course
) -> None:
    ep = await _make_episode(
        db_session,
        published_course,
        content_type="text",
        markdown_body="# Secret content",
    )
    resp = await client.get(f"/api/v1/lessons/courses/{published_course.slug}")
    assert resp.status_code == 200
    episodes = resp.json()["episodes"]
    for ep_data in episodes:
        assert "markdown_body" not in ep_data


async def test_course_detail_excludes_unpublished_episodes(
    client: AsyncClient, db_session: AsyncSession, published_course: Course
) -> None:
    pub_ep = await _make_episode(db_session, published_course, sort_order=1, is_published=True)
    unp_ep = await _make_episode(
        db_session,
        published_course,
        sort_order=2,
        title="Hidden Episode",
        is_published=False,
    )

    resp = await client.get(f"/api/v1/lessons/courses/{published_course.slug}")
    assert resp.status_code == 200
    ep_ids = [ep["id"] for ep in resp.json()["episodes"]]
    assert str(pub_ep.id) in ep_ids
    assert str(unp_ep.id) not in ep_ids


async def test_unpublished_course_returns_404(
    client: AsyncClient, unpublished_course: Course
) -> None:
    resp = await client.get(f"/api/v1/lessons/courses/{unpublished_course.slug}")
    assert resp.status_code == 404


async def test_anonymous_get_episode_content_returns_401(
    client: AsyncClient, db_session: AsyncSession, published_course: Course
) -> None:
    ep = await _make_episode(db_session, published_course)
    resp = await client.get(f"/api/v1/lessons/episodes/{ep.id}/content")
    assert resp.status_code == 401
