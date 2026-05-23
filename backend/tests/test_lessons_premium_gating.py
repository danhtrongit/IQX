"""Tests for premium gating on episode content access."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.lesson import Course, Episode
from app.models.premium import PremiumPlan, PremiumSubscription, SubscriptionStatus
from app.models.user import User, UserRole, UserStatus

pytestmark = pytest.mark.asyncio


# ── Helpers ───────────────────────────────────────────────────────────────────


def _token(user: User) -> str:
    return create_access_token(subject=user.id, extra_claims={"role": user.role.value})


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(user)}"}


async def _make_user(db: AsyncSession, role: UserRole = UserRole.USER) -> User:
    u = User(
        email=f"u-{uuid.uuid4().hex[:8]}@x.com",
        hashed_password=hash_password("Test@1234"),
        first_name="Test",
        last_name="User",
        role=role,
        status=UserStatus.ACTIVE,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


async def _make_plan(db: AsyncSession, code: str = "TEST_PLAN") -> PremiumPlan:
    from sqlalchemy import select

    res = await db.execute(select(PremiumPlan).where(PremiumPlan.code == code))
    plan = res.scalar_one_or_none()
    if plan is None:
        plan = PremiumPlan(
            code=code,
            name="Test Plan",
            price_vnd=99000,
            duration_days=30,
            is_active=True,
            sort_order=1,
        )
        db.add(plan)
        await db.commit()
        await db.refresh(plan)
    return plan


async def _subscribe_user(db: AsyncSession, user: User, plan: PremiumPlan) -> None:
    now = datetime.now(UTC)
    sub = PremiumSubscription(
        user_id=user.id,
        current_plan_id=plan.id,
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE,
    )
    db.add(sub)
    await db.commit()


async def _make_course(db: AsyncSession, is_premium: bool = False) -> Course:
    c = Course(
        slug=f"c-{uuid.uuid4().hex[:8]}",
        title="Course",
        level="beginner",
        category="test",
        is_premium=is_premium,
        is_published=True,
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


async def _make_episode(
    db: AsyncSession, course: Course, content_type: str = "text"
) -> Episode:
    kw: dict = dict(
        course_id=course.id,
        title="Episode",
        content_type=content_type,
        sort_order=1,
        is_published=True,
    )
    if content_type == "text":
        kw["markdown_body"] = "# Content"
    else:
        kw["file_url"] = f"/media/courses/{course.id}/ep.pdf"
    ep = Episode(**kw)
    db.add(ep)
    await db.commit()
    await db.refresh(ep)
    return ep


# ── Tests ─────────────────────────────────────────────────────────────────────


async def test_non_premium_user_free_course_returns_200(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    course = await _make_course(db_session, is_premium=False)
    ep = await _make_episode(db_session, course)

    resp = await client.get(
        f"/api/v1/lessons/episodes/{ep.id}/content", headers=_headers(user)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["markdown_body"] == "# Content"


async def test_non_premium_user_premium_course_returns_403(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    course = await _make_course(db_session, is_premium=True)
    ep = await _make_episode(db_session, course)

    resp = await client.get(
        f"/api/v1/lessons/episodes/{ep.id}/content", headers=_headers(user)
    )
    assert resp.status_code == 403


async def test_premium_user_premium_course_returns_200(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    plan = await _make_plan(db_session)
    user = await _make_user(db_session, role=UserRole.PREMIUM)
    await _subscribe_user(db_session, user, plan)

    course = await _make_course(db_session, is_premium=True)
    ep = await _make_episode(db_session, course)

    resp = await client.get(
        f"/api/v1/lessons/episodes/{ep.id}/content", headers=_headers(user)
    )
    assert resp.status_code == 200


async def test_trial_user_premium_course_returns_200(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Trial subscription with is_premium=True via TRIAL_7D plan."""
    from sqlalchemy import select

    res = await db_session.execute(select(PremiumPlan).where(PremiumPlan.code == "TRIAL_7D"))
    plan = res.scalar_one_or_none()
    if plan is None:
        plan = PremiumPlan(
            code="TRIAL_7D",
            name="Dùng thử 7 ngày",
            price_vnd=0,
            duration_days=7,
            is_active=True,
            sort_order=-1,
        )
        db_session.add(plan)
        await db_session.commit()
        await db_session.refresh(plan)

    user = await _make_user(db_session, role=UserRole.PREMIUM)
    await _subscribe_user(db_session, user, plan)

    course = await _make_course(db_session, is_premium=True)
    ep = await _make_episode(db_session, course)

    resp = await client.get(
        f"/api/v1/lessons/episodes/{ep.id}/content", headers=_headers(user)
    )
    assert resp.status_code == 200


async def test_unauthenticated_episode_content_returns_401(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    course = await _make_course(db_session, is_premium=False)
    ep = await _make_episode(db_session, course)

    resp = await client.get(f"/api/v1/lessons/episodes/{ep.id}/content")
    assert resp.status_code == 401


async def test_unpublished_course_episode_returns_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    course = await _make_course(db_session, is_premium=False)
    # Override to unpublished
    course.is_published = False
    await db_session.commit()

    ep = await _make_episode(db_session, course)
    resp = await client.get(
        f"/api/v1/lessons/episodes/{ep.id}/content", headers=_headers(user)
    )
    assert resp.status_code == 404


async def test_unpublished_episode_returns_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    course = await _make_course(db_session, is_premium=False)
    ep = await _make_episode(db_session, course)
    ep.is_published = False
    await db_session.commit()

    resp = await client.get(
        f"/api/v1/lessons/episodes/{ep.id}/content", headers=_headers(user)
    )
    assert resp.status_code == 404
