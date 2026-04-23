"""Health check response schemas."""

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Service health check payload.

    Used by load balancers, Kubernetes probes, and monitoring systems
    to verify the backend is alive and responding.
    """

    status: str = Field(
        ...,
        description="Service status indicator.",
        examples=["ok"],
    )
    service: str = Field(
        ...,
        description="Name of the service.",
        examples=["backend"],
    )
    version: str = Field(
        ...,
        description="Current deployed version (SemVer).",
        examples=["0.1.0"],
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "status": "ok",
                    "service": "backend",
                    "version": "0.1.0",
                }
            ]
        }
    }
