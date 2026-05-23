"""Tests for admin lesson endpoints — CRUD, audit, reorder."""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.admin_audit import AdminAuditLog
from app.models.lesson import Course, Episode
from app.models.user import User, UserRole, UserStatus

pytestmark = pytest.mark.asyncio


# ── Helpers ───────────────────────────────────────────────────────────────────


def _admin_token(user: User) -> str:
    return create_access_token(subject=user.id, extra_claims={"role": user.role.value})


def _admin_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {_admin_token(user)}"}


def _user_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(subject=user.id, extra_claims={'role': user.role.value})}"}


@pytest_asyncio.fixture
async def admin(db_session: AsyncSession) -> User:
    u = User(
        email="admin-lessons@example.com",
        hashed_password=hash_password("Admin@1234"),
        first_name="Admin",
        last_name="User",
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest_asyncio.fixture
async def regular_user(db_session: AsyncSession) -> User:
    u = User(
        email="user-lessons@example.com",
        hashed_password=hash_password("User@1234"),
        first_name="Regular",
        last_name="User",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


async def _audit_rows(db: AsyncSession, action: str) -> list[AdminAuditLog]:
    result = await db.execute(select(AdminAuditLog).where(AdminAuditLog.action == action))
    return list(result.scalars().all())


async def _create_course_via_api(client: AsyncClient, headers: dict, **kw) -> dict:
    payload = {
        "slug": f"test-course-{uuid.uuid4().hex[:6]}",
        "title": "Test Course",
        "level": "beginner",
        "category": "test",
        "is_premium": False,
        "is_published": False,
        **kw,
    }
    resp = await client.post("/api/v1/admin/lessons/courses", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Course CRUD ────────────────────────────────────────────────────────────────


async def test_create_course_returns_201(
    client: AsyncClient, db_session: AsyncSession, admin: User
) -> None:
    headers = _admin_headers(admin)
    resp = await client.post(
        "/api/v1/admin/lessons/courses",
        json={
            "slug": "my-first-course",
            "title": "My First Course",
            "level": "beginner",
            "category": "trading",
            "is_premium": False,
            "is_published": False,
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["slug"] == "my-first-course"
    assert data["id"] is not None


async def test_create_course_produces_audit_row(
    client: AsyncClient, db_session: AsyncSession, admin: User
) -> None:
    headers = _admin_headers(admin)
    await _create_course_via_api(client, headers)
    rows = await _audit_rows(db_session, "lesson.course.create")
    assert len(rows) >= 1
    assert rows[0].target_entity == "course"


async def test_create_course_slug_conflict_returns_409(
    client: AsyncClient, db_session: AsyncSession, admin: User
) -> None:
    headers = _admin_headers(admin)
    payload = {
        "slug": "conflict-slug",
        "title": "Course",
        "level": "beginner",
        "category": "test",
    }
    r1 = await client.post("/api/v1/admin/lessons/courses", json=payload, headers=headers)
    assert r1.status_code == 201
    r2 = await client.post("/api/v1/admin/lessons/courses", json=payload, headers=headers)
    assert r2.status_code == 409


async def test_patch_course_produces_audit_row(
    client: AsyncClient, db_session: AsyncSession, admin: User
) -> None:
    headers = _admin_headers(admin)
    created = await _create_course_via_api(client, headers)
    course_id = created["id"]

    resp = await client.patch(
        f"/api/v1/admin/lessons/courses/{course_id}",
        json={"title": "Updated Title"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Title"

    rows = await _audit_rows(db_session, "lesson.course.update")
    assert len(rows) >= 1
    row = rows[0]
    assert row.payload_before is not None
    assert row.payload_after is not None


async def test_delete_course_soft_deletes(
    client: AsyncClient, db_session: AsyncSession, admin: User
) -> None:
    headers = _admin_headers(admin)
    created = await _create_course_via_api(client, headers, is_published=True)
    course_id = created["id"]

    resp = await client.delete(
        f"/api/v1/admin/lessons/courses/{course_id}", headers=headers
    )
    assert resp.status_code == 200
    # is_published should be False
    assert resp.json()["is_published"] is False

    # Verify in DB
    result = await db_session.execute(select(Course).where(Course.id == uuid.UUID(course_id)))
    course = result.scalar_one()
    assert course.is_published is False


async def test_delete_course_produces_audit_row(
    client: AsyncClient, db_session: AsyncSession, admin: User
) -> None:
    headers = _admin_headers(admin)
    created = await _create_course_via_api(client, headers)
    await client.delete(
        f"/api/v1/admin/lessons/courses/{created['id']}", headers=headers
    )
    rows = await _audit_rows(db_session, "lesson.course.delete")
    assert len(rows) >= 1


# ── Episode CRUD ───────────────────────────────────────────────────────────────


async def test_create_episode_returns_id_and_sort_order(
    client: AsyncClient, db_session: AsyncSession, admin: User
) -> None:
    headers = _admin_headers(admin)
    course = await _create_course_via_api(client, headers)
    course_id = course["id"]

    resp = await client.post(
        f"/api/v1/admin/lessons/courses/{course_id}/episodes",
        json={
            "title": "Episode 1",
            "content_type": "text",
            "markdown_body": "# Hello World",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["id"] is not None
    assert data["sort_order"] == 1


async def test_episode_sort_order_auto_increments(
    client: AsyncClient, db_session: AsyncSession, admin: User
) -> None:
    headers = _admin_headers(admin)
    course = await _create_course_via_api(client, headers)
    course_id = course["id"]

    r1 = await client.post(
        f"/api/v1/admin/lessons/courses/{course_id}/episodes",
        json={"title": "Ep 1", "content_type": "text", "markdown_body": "# 1"},
        headers=headers,
    )
    r2 = await client.post(
        f"/api/v1/admin/lessons/courses/{course_id}/episodes",
        json={"title": "Ep 2", "content_type": "text", "markdown_body": "# 2"},
        headers=headers,
    )
    assert r1.json()["sort_order"] == 1
    assert r2.json()["sort_order"] == 2


async def test_create_episode_produces_audit_row(
    client: AsyncClient, db_session: AsyncSession, admin: User
) -> None:
    headers = _admin_headers(admin)
    course = await _create_course_via_api(client, headers)
    await client.post(
        f"/api/v1/admin/lessons/courses/{course['id']}/episodes",
        json={"title": "Ep", "content_type": "text", "markdown_body": "# x"},
        headers=headers,
    )
    rows = await _audit_rows(db_session, "lesson.episode.create")
    assert len(rows) >= 1


async def test_patch_episode_produces_audit_row(
    client: AsyncClient, db_session: AsyncSession, admin: User
) -> None:
    headers = _admin_headers(admin)
    course = await _create_course_via_api(client, headers)
    ep_resp = await client.post(
        f"/api/v1/admin/lessons/courses/{course['id']}/episodes",
        json={"title": "Ep", "content_type": "text", "markdown_body": "# x"},
        headers=headers,
    )
    ep_id = ep_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/admin/lessons/episodes/{ep_id}",
        json={"title": "Updated Episode"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Episode"

    rows = await _audit_rows(db_session, "lesson.episode.update")
    assert len(rows) >= 1


async def test_delete_episode_removes_row(
    client: AsyncClient, db_session: AsyncSession, admin: User
) -> None:
    headers = _admin_headers(admin)
    course = await _create_course_via_api(client, headers)
    ep_resp = await client.post(
        f"/api/v1/admin/lessons/courses/{course['id']}/episodes",
        json={"title": "Ep", "content_type": "text", "markdown_body": "# x"},
        headers=headers,
    )
    ep_id = ep_resp.json()["id"]

    del_resp = await client.delete(
        f"/api/v1/admin/lessons/episodes/{ep_id}", headers=headers
    )
    assert del_resp.status_code == 204

    result = await db_session.execute(select(Episode).where(Episode.id == uuid.UUID(ep_id)))
    assert result.scalar_one_or_none() is None


async def test_delete_episode_produces_audit_row(
    client: AsyncClient, db_session: AsyncSession, admin: User
) -> None:
    headers = _admin_headers(admin)
    course = await _create_course_via_api(client, headers)
    ep_resp = await client.post(
        f"/api/v1/admin/lessons/courses/{course['id']}/episodes",
        json={"title": "Ep", "content_type": "text", "markdown_body": "# x"},
        headers=headers,
    )
    ep_id = ep_resp.json()["id"]
    await client.delete(f"/api/v1/admin/lessons/episodes/{ep_id}", headers=headers)
    rows = await _audit_rows(db_session, "lesson.episode.delete")
    assert len(rows) >= 1


# ── Reorder ────────────────────────────────────────────────────────────────────


async def test_reorder_episodes_updates_sort_orders(
    client: AsyncClient, db_session: AsyncSession, admin: User
) -> None:
    headers = _admin_headers(admin)
    course = await _create_course_via_api(client, headers)
    course_id = course["id"]

    ep1 = (
        await client.post(
            f"/api/v1/admin/lessons/courses/{course_id}/episodes",
            json={"title": "Ep A", "content_type": "text", "markdown_body": "# A"},
            headers=headers,
        )
    ).json()
    ep2 = (
        await client.post(
            f"/api/v1/admin/lessons/courses/{course_id}/episodes",
            json={"title": "Ep B", "content_type": "text", "markdown_body": "# B"},
            headers=headers,
        )
    ).json()
    ep3 = (
        await client.post(
            f"/api/v1/admin/lessons/courses/{course_id}/episodes",
            json={"title": "Ep C", "content_type": "text", "markdown_body": "# C"},
            headers=headers,
        )
    ).json()

    # Reverse order
    resp = await client.post(
        f"/api/v1/admin/lessons/courses/{course_id}/reorder",
        json={
            "items": [
                {"episode_id": ep3["id"], "sort_order": 1},
                {"episode_id": ep2["id"], "sort_order": 2},
                {"episode_id": ep1["id"], "sort_order": 3},
            ]
        },
        headers=headers,
    )
    assert resp.status_code == 200

    # Verify DB
    result = await db_session.execute(
        select(Episode).where(Episode.id == uuid.UUID(ep3["id"]))
    )
    ep3_row = result.scalar_one()
    assert ep3_row.sort_order == 1

    result = await db_session.execute(
        select(Episode).where(Episode.id == uuid.UUID(ep1["id"]))
    )
    ep1_row = result.scalar_one()
    assert ep1_row.sort_order == 3


async def test_reorder_produces_audit_row(
    client: AsyncClient, db_session: AsyncSession, admin: User
) -> None:
    headers = _admin_headers(admin)
    course = await _create_course_via_api(client, headers)
    ep = (
        await client.post(
            f"/api/v1/admin/lessons/courses/{course['id']}/episodes",
            json={"title": "Ep", "content_type": "text", "markdown_body": "# x"},
            headers=headers,
        )
    ).json()

    await client.post(
        f"/api/v1/admin/lessons/courses/{course['id']}/reorder",
        json={"items": [{"episode_id": ep["id"], "sort_order": 1}]},
        headers=headers,
    )
    rows = await _audit_rows(db_session, "lesson.episode.reorder")
    assert len(rows) >= 1


# ── Non-admin access ────────────────────────────────────────────────────────────


async def test_non_admin_create_course_returns_403(
    client: AsyncClient, regular_user: User
) -> None:
    headers = _user_headers(regular_user)
    resp = await client.post(
        "/api/v1/admin/lessons/courses",
        json={"slug": "x", "title": "X", "level": "beginner", "category": "t"},
        headers=headers,
    )
    assert resp.status_code == 403


async def test_unauthenticated_create_course_returns_401(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/admin/lessons/courses",
        json={"slug": "x", "title": "X", "level": "beginner", "category": "t"},
    )
    assert resp.status_code == 401


# ── Admin list courses ─────────────────────────────────────────────────────────


async def test_admin_list_includes_unpublished(
    client: AsyncClient, db_session: AsyncSession, admin: User
) -> None:
    headers = _admin_headers(admin)
    await _create_course_via_api(client, headers, is_published=False)
    await _create_course_via_api(client, headers, is_published=True)

    resp = await client.get("/api/v1/admin/lessons/courses", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 2


async def test_admin_get_course_detail_with_episodes(
    client: AsyncClient, db_session: AsyncSession, admin: User
) -> None:
    headers = _admin_headers(admin)
    course = await _create_course_via_api(client, headers)
    await client.post(
        f"/api/v1/admin/lessons/courses/{course['id']}/episodes",
        json={"title": "Ep", "content_type": "text", "markdown_body": "# x"},
        headers=headers,
    )
    resp = await client.get(f"/api/v1/admin/lessons/courses/{course['id']}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["episodes"]) == 1
