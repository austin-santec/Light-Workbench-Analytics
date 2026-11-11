from dataclasses import dataclass
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app import __version__
from app.reporting.adapter import ReportingError, SqlServerAdapter
from app.reporting.config import ReportingSettings
from app.reporting.models import RunQuery
from app.reporting.repository import ReportingRepository, SqlServerReportingRepository
from app.schemas import (
    DemoRunQuery,
    DemoRunsResponse,
    HealthResponse,
    ReportingFailureResponse,
    RunActivityConnectedResponse,
    RunActivityFilters,
    RunActivityNotConnectedResponse,
    RunActivityQueryParams,
    RunActivityWindow,
    RunCountsResponse,
    RunTimingResponse,
    SystemInfo,
    TestTimeByConfigurationConnectedResponse,
    TestTimeByConfigurationFilters,
    TestTimeByConfigurationQueryParams,
)
from app.services.demo import list_demo_runs

router = APIRouter(prefix="/api/v1")


@dataclass(frozen=True)
class ReportingAccess:
    repository: ReportingRepository
    tls: Literal["verified", "encrypted_unverified"]


def get_reporting_access() -> ReportingAccess | None:
    try:
        settings = ReportingSettings()
    except ValidationError:
        return None
    if not settings.enabled:
        return None
    return ReportingAccess(
        repository=SqlServerReportingRepository(SqlServerAdapter(settings)),
        tls="encrypted_unverified" if settings.trust_server_certificate else "verified",
    )


def validated_run_activity_query(
    params: Annotated[RunActivityQueryParams, Query()],
) -> RunQuery:
    try:
        return RunQuery(
            started_from=params.started_from,
            started_before=params.started_before,
            switch_model=params.switch_model,
            wavelength_mode=params.wavelength_mode,
            run_purpose=params.purpose,
            selection="all",
        )
    except ValidationError as exc:
        errors = [
            item | {"loc": ("query", *item["loc"])}
            for item in exc.errors(include_url=False, include_input=False, include_context=False)
        ]
        raise RequestValidationError(errors) from None


def validated_test_time_by_configuration_query(
    params: Annotated[TestTimeByConfigurationQueryParams, Query()],
) -> RunQuery:
    try:
        return RunQuery(
            started_from=params.started_from,
            started_before=params.started_before,
            wavelength_mode=params.wavelength_mode,
            run_purpose=params.purpose,
            selection="all",
        )
    except ValidationError as exc:
        errors = [
            item | {"loc": ("query", *item["loc"])}
            for item in exc.errors(include_url=False, include_input=False, include_context=False)
        ]
        raise RequestValidationError(errors) from None


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


@router.get(
    "/reporting/run-activity",
    response_model=RunActivityConnectedResponse | RunActivityNotConnectedResponse,
    responses={503: {"model": ReportingFailureResponse}},
    tags=["reporting"],
)
def run_activity(
    query: Annotated[RunQuery, Depends(validated_run_activity_query)],
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
) -> RunActivityConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    """Aggregate run diagnostics only; never returns row-level identifiers."""
    if access is None:
        return RunActivityNotConnectedResponse()
    try:
        metrics = access.repository.get_run_activity(query)
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})
    return RunActivityConnectedResponse(
        tls=access.tls,
        window=RunActivityWindow(
            started_from=query.started_from, started_before=query.started_before
        ),
        filters=RunActivityFilters(
            purpose=query.run_purpose,
            wavelength_mode=query.wavelength_mode,
            switch_model=query.switch_model,
        ),
        incomplete=metrics.incomplete,
        runs=RunCountsResponse(
            total=metrics.total_runs,
            by_run_purpose=metrics.by_run_purpose,
            by_completion_status=metrics.by_completion_status,
        ),
        timing=RunTimingResponse(
            open_runs=metrics.open_runs,
            by_quality=metrics.by_timing_quality,
            active_seconds=metrics.active_seconds.model_dump(),
            elapsed_seconds=metrics.elapsed_seconds.model_dump(),
            stopped_seconds=metrics.stopped_seconds.model_dump(),
            flagged_over_90_min=metrics.flagged_over_90_min,
        ),
    )


@router.get(
    "/reporting/test-time-by-configuration",
    response_model=TestTimeByConfigurationConnectedResponse | RunActivityNotConnectedResponse,
    responses={503: {"model": ReportingFailureResponse}},
    tags=["reporting"],
)
def test_time_by_configuration(
    query: Annotated[RunQuery, Depends(validated_test_time_by_configuration_query)],
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
) -> TestTimeByConfigurationConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    """Run-level duration diagnostics grouped by historical configuration."""
    if access is None:
        return RunActivityNotConnectedResponse()
    try:
        metrics = access.repository.get_test_time_by_configuration(query)
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})
    return TestTimeByConfigurationConnectedResponse(
        tls=access.tls,
        window=RunActivityWindow(
            started_from=query.started_from, started_before=query.started_before
        ),
        filters=TestTimeByConfigurationFilters(
            purpose=query.run_purpose,
            wavelength_mode=query.wavelength_mode,
        ),
        incomplete=metrics.incomplete,
        configurations=[configuration.model_dump() for configuration in metrics.configurations],
    )
