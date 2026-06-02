"""Tests for episode progress tracking (upsert, idempotency, list)."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.lesson import Course, Episode, EpisodeProgress
from app.models.user import User, UserRole, UserStatus

pytestmark = pytest.mark.asyncio


# ── Helpers ───────────────────────────────────────────────────────────────────


def _headers(user: User) -> dict[str, str]:
    tok = create_access_token(subject=user.id, extra_claims={"role": user.role.value})
    return {"Authorization": f"Bearer {tok}"}


async def _make_user(db: AsyncSession) -> User:
    u = User(
        email=f"u-{uuid.uuid4().hex[:8]}@x.com",
        hashed_password=hash_password("Test@1234"),
        full_name="Test User".strip(),
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


async def _make_course_and_episode(db: AsyncSession) -> tuple[Course, Episode]:
    course = Course(
        slug=f"c-{uuid.uuid4().hex[:8]}",
        title="Course",
        level="beginner",
        category="test",
        is_premium=False,
        is_published=True,
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)

    ep = Episode(
        course_id=course.id,
        title="Episode",
        content_type="text",
        markdown_body="# Content",
        sort_order=1,
        is_published=True,
    )
    db.add(ep)
    await db.commit()
    await db.refresh(ep)
    return course, ep


# ── Tests ─────────────────────────────────────────────────────────────────────


async def test_post_progress_completed_sets_completed_at(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    course, ep = await _make_course_and_episode(db_session)

    resp = await client.post(
        f"/api/v1/lessons/episodes/{ep.id}/progress",
        json={"completed": True},
        headers=_headers(user),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["completed_at"] is not None
    assert data["episode_id"] == str(ep.id)


async def test_post_progress_position_only(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    course, ep = await _make_course_and_episode(db_session)

    resp = await client.post(
        f"/api/v1/lessons/episodes/{ep.id}/progress",
        json={"last_position_seconds": 42},
        headers=_headers(user),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["last_position_seconds"] == 42
    assert data["completed_at"] is None


async def test_upsert_completed_at_preserved_on_repeat(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Second POST with only last_position_seconds should NOT clear completed_at."""
    user = await _make_user(db_session)
    course, ep = await _make_course_and_episode(db_session)

    # First: mark complete
    r1 = await client.post(
        f"/api/v1/lessons/episodes/{ep.id}/progress",
        json={"completed": True},
        headers=_headers(user),
    )
    assert r1.status_code == 200
    completed_at = r1.json()["completed_at"]
    assert completed_at is not None

    # Second: update position only
    r2 = await client.post(
        f"/api/v1/lessons/episodes/{ep.id}/progress",
        json={"last_position_seconds": 120},
        headers=_headers(user),
    )
    assert r2.status_code == 200
    data = r2.json()
    assert data["last_position_seconds"] == 120
    # completed_at must still be set
    assert data["completed_at"] is not None


async def test_get_my_progress_returns_rows(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    course, ep = await _make_course_and_episode(db_session)

    # Create progress
    await client.post(
        f"/api/v1/lessons/episodes/{ep.id}/progress",
        json={"completed": True},
        headers=_headers(user),
    )

    resp = await client.get(
        f"/api/v1/lessons/me/progress?course_id={course.id}",
        headers=_headers(user),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["episode_id"] == str(ep.id)
    assert data[0]["course_id"] == str(course.id)


async def test_get_my_progress_empty_for_no_progress(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    course, ep = await _make_course_and_episode(db_session)

    resp = await client.get(
        f"/api/v1/lessons/me/progress?course_id={course.id}",
        headers=_headers(user),
    )
    assert resp.status_code == 200
    assert resp.json() == []


async def test_get_my_progress_requires_auth(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    course, ep = await _make_course_and_episode(db_session)
    resp = await client.get(f"/api/v1/lessons/me/progress?course_id={course.id}")
    assert resp.status_code == 401


async def test_post_progress_requires_auth(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    course, ep = await _make_course_and_episode(db_session)
    resp = await client.post(
        f"/api/v1/lessons/episodes/{ep.id}/progress",
        json={"completed": True},
    )
    assert resp.status_code == 401


async def test_progress_multiple_episodes(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    course, ep1 = await _make_course_and_episode(db_session)

    ep2 = Episode(
        course_id=course.id,
        title="Episode 2",
        content_type="text",
        markdown_body="# 2",
        sort_order=2,
        is_published=True,
    )
    db_session.add(ep2)
    await db_session.commit()
    await db_session.refresh(ep2)

    for ep in (ep1, ep2):
        await client.post(
            f"/api/v1/lessons/episodes/{ep.id}/progress",
            json={"completed": True},
            headers=_headers(user),
        )

    resp = await client.get(
        f"/api/v1/lessons/me/progress?course_id={course.id}",
        headers=_headers(user),
    )
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 2
    completed_set = {r["episode_id"] for r in rows if r["completed_at"]}
    assert str(ep1.id) in completed_set
    assert str(ep2.id) in completed_set
