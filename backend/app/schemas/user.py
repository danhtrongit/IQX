"""User-related Pydantic schemas for request validation and response serialization."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Literal

import phonenumbers
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.user import UserRole, UserStatus


# ──────────────────────────────────────────────────────
# Request schemas
# ──────────────────────────────────────────────────────
class UserCreate(BaseModel):
    """Registration request."""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone_number: str | None = Field(None, max_length=30)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", v):
            raise ValueError("Password must contain at least one special character")
        return v

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        try:
            parsed = phonenumbers.parse(v, None)
            if not phonenumbers.is_valid_number(parsed):
                raise ValueError("Invalid phone number")
        except phonenumbers.NumberParseException:
            raise ValueError("Invalid phone number format. Use E.164 format, e.g. +84901234567") from None
        return v


class UserUpdate(BaseModel):
    """Self-profile update — users can only update these fields."""

    first_name: str | None = Field(None, min_length=1, max_length=100)
    last_name: str | None = Field(None, min_length=1, max_length=100)
    phone_number: str | None = Field(None, max_length=30)
    avatar_url: str | None = Field(None, max_length=2048)
    date_of_birth: date | None = None
    gender: str | None = Field(None, max_length=20)
    country: str | None = Field(None, max_length=100)
    province_state: str | None = Field(None, max_length=100)
    city: str | None = Field(None, max_length=100)
    district: str | None = Field(None, max_length=100)
    ward: str | None = Field(None, max_length=100)
    street_address: str | None = Field(None, max_length=500)
    postal_code: str | None = Field(None, max_length=20)

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        try:
            parsed = phonenumbers.parse(v, None)
            if not phonenumbers.is_valid_number(parsed):
                raise ValueError("Invalid phone number")
        except phonenumbers.NumberParseException:
            raise ValueError("Invalid phone number format. Use E.164 format, e.g. +84901234567") from None
        return v


class AdminUserUpdate(UserUpdate):
    """Admin-level update — admins can change role and status too."""

    role: UserRole | None = None
    status: UserStatus | None = None
    is_email_verified: bool | None = None


class AdminUserCreate(UserCreate):
    """Admin-level user creation — admins can set role and status."""

    role: UserRole = UserRole.USER
    status: UserStatus = UserStatus.ACTIVE


# ──────────────────────────────────────────────────────
# Response schemas
# ──────────────────────────────────────────────────────
class UserResponse(BaseModel):
    """Public user representation — never includes hashed_password."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    full_name: str
    phone_number: str | None = None
    phone_country_code: str | None = None
    phone_national_number: str | None = None
    phone_e164: str | None = None
    phone_verified_at: datetime | None = None
    avatar_url: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    country: str | None = None
    province_state: str | None = None
    city: str | None = None
    district: str | None = None
    ward: str | None = None
    street_address: str | None = None
    postal_code: str | None = None
    role: UserRole
    status: UserStatus
    is_email_verified: bool
    email_verified_at: datetime | None = None
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class UserBriefResponse(BaseModel):
    """Minimal user representation for listings."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    full_name: str
    role: UserRole
    status: UserStatus
    created_at: datetime


# ──────────────────────────────────────────────────────
# Query parameters
# ──────────────────────────────────────────────────────
# Whitelist of columns that can be used for sorting.
SORTABLE_FIELDS = Literal[
    "created_at",
    "updated_at",
    "email",
    "first_name",
    "last_name",
    "role",
    "status",
    "last_login_at",
]


class UserListParams(BaseModel):
    """Query parameters for listing users."""

    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)
    search: str | None = None
    role: UserRole | None = None
    status: UserStatus | None = None
    sort_by: SORTABLE_FIELDS = "created_at"
    sort_order: str = Field("desc", pattern="^(asc|desc)$")
