"""API v1 router — aggregates all v1 endpoint routers.

To add a new endpoint:
  1. Create a module in ``app/api/v1/endpoints/``.
  2. Define a ``router = APIRouter(...)`` inside it.
  3. Include it below with an appropriate prefix & tags.
"""

from fastapi import APIRouter

from app.api.v1.endpoints import auth, hello, users

router = APIRouter()

router.include_router(hello.router)
router.include_router(auth.router)
router.include_router(users.router)
