"""User CRUD operations."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate


async def get_user_by_id(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    """Fetch a single user by primary key."""
    return await session.get(User, user_id)


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    """Fetch a single user by email address."""
    result = await session.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_username(session: AsyncSession, username: str) -> User | None:
    """Fetch a single user by username."""
    result = await session.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def list_users(
    session: AsyncSession,
    *,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[User], int]:
    """Return a paginated list of users and total count."""
    total_result = await session.execute(select(func.count(User.id)))
    total = total_result.scalar_one()

    result = await session.execute(
        select(User).order_by(User.created_at.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all()), total


async def create_user(session: AsyncSession, data: UserCreate) -> User:
    """Create a new user with hashed password."""
    user = User(
        email=data.email,
        username=data.username,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=data.role,
        is_active=data.is_active,
    )
    session.add(user)
    await session.flush()
    await session.refresh(user)
    return user


async def update_user(session: AsyncSession, user: User, data: UserUpdate) -> User:
    """Update user fields from a partial update schema."""
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)
    await session.flush()
    await session.refresh(user)
    return user
