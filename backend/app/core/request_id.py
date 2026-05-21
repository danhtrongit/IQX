"""Request-ID middleware. Reads X-Request-ID header or generates a UUID4.
Stored on request.state for downstream consumers (audit log, logs).
"""
from __future__ import annotations

import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

HEADER = "X-Request-ID"


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        req_id = request.headers.get(HEADER) or str(uuid.uuid4())
        request.state.request_id = req_id
        response = await call_next(request)
        response.headers[HEADER] = req_id
        return response
