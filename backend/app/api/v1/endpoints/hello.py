"""Sample hello endpoint — demonstrates a basic versioned API route."""

from fastapi import APIRouter

router = APIRouter(tags=["Hello"])


@router.get(
    "/hello",
    summary="Hello World",
    description="A simple greeting endpoint to verify the API is working.",
)
async def hello() -> dict[str, str]:
    """Return a friendly greeting."""
    return {
        "message": "Hello from IQX API! 🚀",
    }
