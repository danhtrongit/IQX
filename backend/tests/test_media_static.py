"""Tests for public media file serving."""
from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from httpx import AsyncClient

from app.core.config import get_settings

pytestmark = pytest.mark.asyncio


async def test_media_thumbnail_file_is_served(client: AsyncClient) -> None:
    course_id = uuid.uuid4()
    thumbnail = Path(get_settings().LESSON_MEDIA_DIR) / "courses" / str(course_id) / "thumbnail.jpg"
    thumbnail.parent.mkdir(parents=True, exist_ok=True)
    thumbnail.write_bytes(b"fake-jpeg")

    response = await client.get(f"/media/courses/{course_id}/thumbnail.jpg")

    assert response.status_code == 200
    assert response.content == b"fake-jpeg"
