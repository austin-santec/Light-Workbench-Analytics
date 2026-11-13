from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app import __version__
from app.reporting.adapter import ReportingError, SqlServerAdapter
from app.reporting.channel_activity import (
    PACIFIC_TIMEZONE_NAME,
    PERIOD_KEYS,
    compute_channel_activity_boundaries,
)
from app.reporting.config import ReportingSettings
from app.reporting.models import ChannelActivityQuery, ReplacementActivityQuery, RunQuery
from app.reporting.repository import ReportingRepository, SqlServerReportingRepository
from app.schemas import (
    AssignmentHardwareConnectedResponse,
    ChannelActivityConnectedResponse,
    ChannelActivityDayResponse,
    ChannelActivityFilters,
    ChannelActivityPeriodResponse,
    ChannelActivityQueryParams,
    DemoRunQuery,
    DemoRunsResponse,
    FailureRateConnectedResponse,
    FailureRateDayResponse,
    FailureRatePeriodResponse,
    HealthResponse,
    ReplacementActivityConnectedResponse,
    ReplacementActivityDayResponse,
    ReplacementActivityFilters,
    ReplacementActivityPeriodResponse,
    ReplacementActivityQueryParams,
    ReportingFailureResponse,
    RunActivityConnectedResponse,
    RunActivityFilters,
    RunActivityNotConnectedResponse,
    RunActivityQueryParams,
    RunActivityWindow,
    RunChannelsConnectedResponse,
    RunCountsResponse,
    RunTimingResponse,
    SystemInfo,
    TestTimeByConfigurationConnectedResponse,
    TestTimeByConfigurationFilters,
    TestTimeByConfigurationQueryParams,
    UnitDetailConnectedResponse,
    UnitSearchConnectedResponse,
    UnitSearchQueryParams,
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


def validated_channel_activity_query(
    params: Annotated[ChannelActivityQueryParams, Query()],
) -> ChannelActivityQuery:
    try:
        return ChannelActivityQuery(
            purposes=tuple(params.purpose),
            wavelength_mode=params.wavelength_mode,
            switch_model=params.switch_model,
        )
    except ValidationError as exc:
        errors = [
            item | {"loc": ("query", *item["loc"])}
            for item in exc.errors(include_url=False, include_input=False, include_context=False)
        ]
        raise RequestValidationError(errors) from None


def validated_replacement_activity_query(
    params: Annotated[ReplacementActivityQueryParams, Query()],
) -> ReplacementActivityQuery:
    try:
        return ReplacementActivityQuery(switch_model=params.switch_model)
    except ValidationError as exc:
        errors = [
            item | {"loc": ("query", *item["loc"])}
            for item in exc.errors(include_url=False, include_input=False, include_context=False)
        ]
        raise RequestValidationError(errors) from None


def get_extracted_at_utc() -> datetime:
    return datetime.now(UTC)


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


@router.get(
    "/reporting/channel-activity",
    response_model=ChannelActivityConnectedResponse | RunActivityNotConnectedResponse,
    responses={503: {"model": ReportingFailureResponse}},
    tags=["reporting"],
)
def channel_activity(
    query: Annotated[ChannelActivityQuery, Depends(validated_channel_activity_query)],
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
    extracted_at: Annotated[datetime, Depends(get_extracted_at_utc)],
) -> ChannelActivityConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    """Exact accepted channel activity over Pacific calendar windows."""
    if access is None:
        return RunActivityNotConnectedResponse()
    boundaries = compute_channel_activity_boundaries(extracted_at)
    try:
        metrics = access.repository.get_channel_activity(query, boundaries)
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})

    periods = {}
    for key in PERIOD_KEYS:
        window = boundaries.periods[key]
        periods[key] = ChannelActivityPeriodResponse(
            start_utc=window.start_utc,
            end_utc=window.end_utc,
            partial=window.partial,
            **metrics.periods[key].model_dump(),
        )
    daily = [
        ChannelActivityDayResponse(
            date=window.local_date,
            start_utc=window.start_utc,
            end_utc=window.end_utc,
            partial=window.partial,
            **counts.model_dump(),
        )
        for window, counts in zip(boundaries.daily, metrics.daily, strict=True)
    ]
    return ChannelActivityConnectedResponse(
        tls=access.tls,
        extracted_at_utc=boundaries.extracted_at_utc,
        timezone=PACIFIC_TIMEZONE_NAME,
        filters=ChannelActivityFilters(
            purpose=list(query.purposes),
            wavelength_mode=query.wavelength_mode,
            switch_model=query.switch_model,
        ),
        periods=periods,
        daily=daily,
        incomplete=metrics.incomplete,
    )


@router.get(
    "/reporting/failure-rate",
    response_model=FailureRateConnectedResponse | RunActivityNotConnectedResponse,
    responses={503: {"model": ReportingFailureResponse}},
    tags=["reporting"],
)
def failure_rate(
    query: Annotated[ChannelActivityQuery, Depends(validated_channel_activity_query)],
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
    extracted_at: Annotated[datetime, Depends(get_extracted_at_utc)],
) -> FailureRateConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    """First-observation run-channel failure fraction over Pacific calendar windows."""
    if access is None:
        return RunActivityNotConnectedResponse()
    boundaries = compute_channel_activity_boundaries(extracted_at)
    try:
        metrics = access.repository.get_failure_rate(query, boundaries)
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})

    periods = {
        key: FailureRatePeriodResponse(
            start_utc=boundaries.periods[key].start_utc,
            end_utc=boundaries.periods[key].end_utc,
            partial=boundaries.periods[key].partial,
            **metrics.periods[key].model_dump(),
        )
        for key in PERIOD_KEYS
    }
    daily = [
        FailureRateDayResponse(
            date=window.local_date,
            start_utc=window.start_utc,
            end_utc=window.end_utc,
            partial=window.partial,
            **counts.model_dump(),
        )
        for window, counts in zip(boundaries.daily, metrics.daily, strict=True)
    ]
    return FailureRateConnectedResponse(
        tls=access.tls,
        extracted_at_utc=boundaries.extracted_at_utc,
        filters={
            "purpose": list(query.purposes),
            "wavelength_mode": query.wavelength_mode,
            "switch_model": query.switch_model,
        },
        periods=periods,
        daily=daily,
        incomplete=metrics.incomplete,
    )


@router.get(
    "/reporting/replacement-activity",
    response_model=ReplacementActivityConnectedResponse | RunActivityNotConnectedResponse,
    responses={503: {"model": ReportingFailureResponse}},
    tags=["reporting"],
)
def replacement_activity(
    query: Annotated[ReplacementActivityQuery, Depends(validated_replacement_activity_query)],
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
    extracted_at: Annotated[datetime, Depends(get_extracted_at_utc)],
) -> ReplacementActivityConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    """Recorded replacement activity over Pacific calendar windows."""
    if access is None:
        return RunActivityNotConnectedResponse()
    boundaries = compute_channel_activity_boundaries(extracted_at)
    try:
        metrics = access.repository.get_replacement_activity(query, boundaries)
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})
    periods = {
        key: ReplacementActivityPeriodResponse(
            start_utc=boundaries.periods[key].start_utc,
            end_utc=boundaries.periods[key].end_utc,
            partial=boundaries.periods[key].partial,
            by_attribution={
                bucket: counts.model_dump() for bucket, counts in metrics.periods[key].items()
            },
        )
        for key in PERIOD_KEYS
    }
    daily = [
        ReplacementActivityDayResponse(
            date=window.local_date,
            start_utc=window.start_utc,
            end_utc=window.end_utc,
            partial=window.partial,
            by_attribution={bucket: value.model_dump() for bucket, value in counts.items()},
        )
        for window, counts in zip(boundaries.daily, metrics.daily, strict=True)
    ]
    return ReplacementActivityConnectedResponse(
        tls=access.tls,
        extracted_at_utc=boundaries.extracted_at_utc,
        filters=ReplacementActivityFilters(switch_model=query.switch_model),
        periods=periods,
        daily=daily,
        administrative_exclusions=metrics.administrative_exclusions,
        incomplete=metrics.incomplete,
    )


@router.get(
    "/units/search",
    response_model=UnitSearchConnectedResponse | RunActivityNotConnectedResponse,
    responses={503: {"model": ReportingFailureResponse}},
    tags=["unit lookup"],
)
def search_units(
    query: Annotated[UnitSearchQueryParams, Query()],
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
) -> UnitSearchConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    if access is None:
        return RunActivityNotConnectedResponse()
    try:
        result = access.repository.search_units(query.q)
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})
    return UnitSearchConnectedResponse(tls=access.tls, **result)


@router.get(
    "/units/{unit_id}",
    response_model=UnitDetailConnectedResponse | RunActivityNotConnectedResponse,
    responses={503: {"model": ReportingFailureResponse}},
    tags=["unit lookup"],
)
def unit_detail(
    unit_id: Annotated[int, Path(gt=0)],
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
) -> UnitDetailConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    if access is None:
        return RunActivityNotConnectedResponse()
    try:
        result = access.repository.get_unit_detail(unit_id)
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})
    if result is None:
        raise HTTPException(status_code=404)
    return UnitDetailConnectedResponse(tls=access.tls, **result)


@router.get(
    "/runs/{run_id}/channels",
    response_model=RunChannelsConnectedResponse | RunActivityNotConnectedResponse,
    responses={503: {"model": ReportingFailureResponse}},
    tags=["unit lookup"],
)
def run_channels(
    run_id: Annotated[int, Path(gt=0)],
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
) -> RunChannelsConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    if access is None:
        return RunActivityNotConnectedResponse()
    try:
        result = access.repository.get_run_channels(run_id)
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})
    if result is None:
        raise HTTPException(status_code=404)
    return RunChannelsConnectedResponse(tls=access.tls, **result)


@router.get(
    "/assignments/{assignment_id}/hardware",
    response_model=AssignmentHardwareConnectedResponse | RunActivityNotConnectedResponse,
    responses={503: {"model": ReportingFailureResponse}},
    tags=["unit lookup"],
)
def assignment_hardware(
    assignment_id: Annotated[int, Path(gt=0)],
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
) -> AssignmentHardwareConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    if access is None:
        return RunActivityNotConnectedResponse()
    try:
        result = access.repository.get_assignment_hardware(assignment_id)
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})
    if result is None:
        raise HTTPException(status_code=404)
    return AssignmentHardwareConnectedResponse(tls=access.tls, **result)
