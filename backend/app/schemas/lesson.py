"""Lesson schemas — Course, Episode, Progress."""
from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.lesson import CourseLevel, EpisodeContentType

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


# ── Course schemas ──────────────────────────────────────────────────────────


class CourseCreate(BaseModel):
    slug: str = Field(..., max_length=120)
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    level: CourseLevel
    category: str = Field(..., min_length=1, max_length=60)
    is_premium: bool = False
    is_published: bool = False

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        if not _SLUG_RE.match(v):
            raise ValueError(
                "Slug chỉ được chứa chữ thường, số và dấu gạch ngang "
                "(phải bắt đầu và kết thúc bằng chữ hoặc số)"
            )
        return v


class CourseUpdate(BaseModel):
    slug: str | None = Field(None, max_length=120)
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    level: CourseLevel | None = None
    category: str | None = Field(None, min_length=1, max_length=60)
    is_premium: bool | None = None
    is_published: bool | None = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str | None) -> str | None:
        if v is not None and not _SLUG_RE.match(v):
            raise ValueError(
                "Slug chỉ được chứa chữ thường, số và dấu gạch ngang "
                "(phải bắt đầu và kết thúc bằng chữ hoặc số)"
            )
        return v


class CourseResponse(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    description: str | None
    thumbnail_url: str | None
    level: str
    category: str
    is_premium: bool
    is_published: bool
    total_episodes: int
    total_duration_seconds: int
    created_by_user_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EpisodeBrief(BaseModel):
    """Episode without content payload — safe for public listing."""

    id: uuid.UUID
    title: str
    description: str | None
    content_type: str
    duration_seconds: int | None
    file_size_bytes: int | None
    sort_order: int
    is_published: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CourseDetailResponse(CourseResponse):
    episodes: list[EpisodeBrief] = []
    progress_summary: CourseProgressSummary | None = None


class CourseAdminDetailResponse(CourseResponse):
    """Admin detail includes full episodes with file_url."""

    episodes: list[EpisodeAdminBrief] = []


# ── Episode schemas ────────────────────────────────────────────────────────


class EpisodeCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    content_type: EpisodeContentType
    markdown_body: str | None = None
    sort_order: int | None = None  # auto-assigned if not provided

    @model_validator(mode="after")
    def validate_content(self) -> "EpisodeCreate":
        if self.content_type == EpisodeContentType.TEXT and not self.markdown_body:
            raise ValueError("Nội dung text yêu cầu markdown_body")
        if self.content_type != EpisodeContentType.TEXT and self.markdown_body:
            raise ValueError("Chỉ nội dung text mới có markdown_body")
        if self.markdown_body and len(self.markdown_body.encode()) > 200 * 1024:
            raise ValueError("Nội dung markdown quá lớn (tối đa 200KB)")
        return self


class EpisodeUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    markdown_body: str | None = None
    sort_order: int | None = None
    is_published: bool | None = None

    @field_validator("markdown_body")
    @classmethod
    def validate_markdown(cls, v: str | None) -> str | None:
        if v is not None and len(v.encode()) > 200 * 1024:
            raise ValueError("Nội dung markdown quá lớn (tối đa 200KB)")
        return v


class EpisodeAdminBrief(BaseModel):
    """Admin episode listing — includes file_url."""

    id: uuid.UUID
    title: str
    description: str | None
    content_type: str
    file_url: str | None
    duration_seconds: int | None
    file_size_bytes: int | None
    sort_order: int
    is_published: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EpisodeContent(BaseModel):
    """Full episode content response for authenticated user."""

    id: uuid.UUID
    course_id: uuid.UUID
    title: str
    description: str | None
    content_type: str
    file_url: str | None
    markdown_body: str | None
    duration_seconds: int | None
    file_size_bytes: int | None
    sort_order: int
    is_published: bool

    model_config = {"from_attributes": True}


# ── Progress schemas ───────────────────────────────────────────────────────


class ProgressUpdate(BaseModel):
    completed: bool | None = None
    last_position_seconds: int | None = Field(None, ge=0)


class ProgressRow(BaseModel):
    episode_id: uuid.UUID
    course_id: uuid.UUID
    completed_at: datetime | None
    last_position_seconds: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CourseProgressSummary(BaseModel):
    completed: int
    total: int
    percent: float


# ── List params ────────────────────────────────────────────────────────────


class CourseListParams(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)
    category: str | None = None
    level: str | None = None
    is_premium: bool | None = None
    search: str | None = None
    # Admin only
    is_published: bool | None = None


# ── Reorder ───────────────────────────────────────────────────────────────


class ReorderItem(BaseModel):
    episode_id: uuid.UUID
    sort_order: int = Field(..., ge=1)


class ReorderRequest(BaseModel):
    items: list[ReorderItem]


# ── Resolve forward refs (needed because of circular class reference above) ──
CourseDetailResponse.model_rebuild()
CourseAdminDetailResponse.model_rebuild()
