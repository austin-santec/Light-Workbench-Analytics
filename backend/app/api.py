from typing import Annotated

from fastapi import APIRouter, Query, Request

from app import __version__
from app.schemas import DemoRunQuery, DemoRunsResponse, HealthResponse, SystemInfo
from app.services.demo import list_demo_runs

router = APIRouter(prefix="/api/v1")


@router.get("/health/live", response_model=HealthResponse, tags=["health"])
def health_live() -> HealthResponse:
    """Process liveness only; does not test any external resource."""
    return HealthResponse()


@router.get("/system/info", response_model=SystemInfo, tags=["system"])
def system_info(request: Request) -> SystemInfo:
    settings = request.app.state.settings
    return SystemInfo(
        service=settings.app_name, service_version=__version__, environment=settings.environment
    )


@router.get("/demo/runs", response_model=DemoRunsResponse, tags=["demo"])
def demo_runs(query: Annotated[DemoRunQuery, Query()]) -> DemoRunsResponse:
    """Fictional fixtures only. Filter before slicing a bounded page."""
    return list_demo_runs(query)
