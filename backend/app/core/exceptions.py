"""Standardised application exceptions and error response model."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel


# ── Error response schema for OpenAPI docs ──────────
class ErrorResponse(BaseModel):
    """Standard error body returned by all API error responses."""

    detail: str
    code: str | None = None
    errors: list[dict[str, Any]] | None = None


# ── Domain exceptions ───────────────────────────────
class AppException(HTTPException):
    """Base application exception with an optional error code."""

    def __init__(
        self,
        status_code: int,
        detail: str,
        code: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.code = code


class NotFoundError(AppException):
    def __init__(self, resource: str = "Tài nguyên", detail: str | None = None) -> None:
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail or f"Không tìm thấy {resource}",
            code="NOT_FOUND",
        )


class ConflictError(AppException):
    def __init__(self, detail: str = "Tài nguyên đã tồn tại") -> None:
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
            code="CONFLICT",
        )


class UnauthorizedError(AppException):
    def __init__(self, detail: str = "Thông tin xác thực không hợp lệ") -> None:
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            code="UNAUTHORIZED",
            headers={"WWW-Authenticate": "Bearer"},
        )


class ForbiddenError(AppException):
    def __init__(self, detail: str = "Không đủ quyền truy cập") -> None:
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
            code="FORBIDDEN",
        )


class BadRequestError(AppException):
    def __init__(self, detail: str = "Yêu cầu không hợp lệ") -> None:
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
            code="BAD_REQUEST",
        )


class UnprocessableEntityError(AppException):
    def __init__(self, detail: str = "Dữ liệu không thể xử lý") -> None:
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=detail,
            code="UNPROCESSABLE_ENTITY",
        )


class ServiceUnavailableError(AppException):
    def __init__(self, detail: str = "Dịch vụ tạm thời không khả dụng") -> None:
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
            code="SERVICE_UNAVAILABLE",
        )

