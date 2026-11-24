from dataclasses import asdict, dataclass
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
    compute_weekly_outcome_boundaries,
)
from app.reporting.config import ReportingSettings
from app.reporting.console_guard import StatementRejected
from app.reporting.models import (
    ChannelActivityQuery,
    ChannelFailuresQuery,
    FailureConcentrationQuery,
    RecentFinishedUnitsQuery,
    RecommendationUsageQuery,
    ReplacementActivityQuery,
    RunQuery,
    StationSummaryQuery,
    UnitOutcomesWeeklyQuery,
    UnitStatusQuery,
    UnitTestTimeQuery,
)
from app.reporting.repository import (
    ConsoleQueryError,
    ReportingRepository,
    SqlServerReportingRepository,
)
from app.reporting.schema import COLUMNS, OBJECT_TYPES
from app.schemas import (
    AssignmentHardwareConnectedResponse,
    ChannelActivityConnectedResponse,
    ChannelActivityDayResponse,
    ChannelActivityFilters,
    ChannelActivityPeriodResponse,
    ChannelActivityQueryParams,
    ChannelFailureResponse,
    ChannelFailuresConnectedResponse,
    ChannelFailuresQueryParams,
    DemoRunQuery,
    DemoRunsResponse,
    ErrorResponse,
    FailureConcentrationChannelResponse,
    FailureConcentrationConnectedResponse,
    FailureConcentrationPortResponse,
    FailureConcentrationQueryParams,
    FailureRateConnectedResponse,
    FailureRateCountsResponse,
    FailureRateDayResponse,
    FailureRatePeriodResponse,
    HealthResponse,
    QueryExecuteConnectedResponse,
    QueryExecuteRequest,
    QueryFailedResponse,
    QueryResultColumnResponse,
    QuerySchemaConnectedResponse,
    QuerySchemaObjectResponse,
    RecentFinishedUnitsConnectedResponse,
    RecentFinishedUnitsQueryParams,
    RecommendationUsageAnalyses,
    RecommendationUsageAverageResponse,
    RecommendationUsageConnectedResponse,
    RecommendationUsageCountsResponse,
    RecommendationUsageQueryParams,
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
    StatementRejectedResponse,
    StationCountsResponse,
    StationRowResponse,
    StationSummaryConnectedResponse,
    StationSummaryQueryParams,
    SystemInfo,
    TestTimeByConfigurationConnectedResponse,
    TestTimeByConfigurationFilters,
    TestTimeByConfigurationQueryParams,
    UnitDetailConnectedResponse,
    UnitOutcomesWeeklyConnectedResponse,
    UnitOutcomesWeeklyFilters,
    UnitOutcomesWeeklyQueryParams,
    UnitSearchConnectedResponse,
    UnitSearchQueryParams,
    UnitStatusConnectedResponse,
    UnitStatusFilters,
    UnitStatusPeriodResponse,
    UnitStatusQueryParams,
    UnitTestTimeConnectedResponse,
    UnitTestTimeFilters,
    UnitTestTimePeriodResponse,
    UnitTestTimeQueryParams,
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


def validated_unit_status_query(
    params: Annotated[UnitStatusQueryParams, Query()],
) -> UnitStatusQuery:
    try:
        return UnitStatusQuery(period=params.period, purposes=tuple(params.purpose))
    except ValidationError as exc:
        errors = [
            item | {"loc": ("query", *item["loc"])}
            for item in exc.errors(include_url=False, include_input=False, include_context=False)
        ]
        raise RequestValidationError(errors) from None


def validated_unit_test_time_query(
    params: Annotated[UnitTestTimeQueryParams, Query()],
) -> UnitTestTimeQuery:
    try:
        return UnitTestTimeQuery(period=params.period, purposes=tuple(params.purpose))
    except ValidationError as exc:
        errors = [
            item | {"loc": ("query", *item["loc"])}
            for item in exc.errors(include_url=False, include_input=False, include_context=False)
        ]
        raise RequestValidationError(errors) from None


def validated_recent_finished_units_query(
    params: Annotated[RecentFinishedUnitsQueryParams, Query()],
) -> RecentFinishedUnitsQuery:
    try:
        return RecentFinishedUnitsQuery(period=params.period, purposes=tuple(params.purpose))
    except ValidationError as exc:
        errors = [
            item | {"loc": ("query", *item["loc"])}
            for item in exc.errors(include_url=False, include_input=False, include_context=False)
        ]
        raise RequestValidationError(errors) from None


def validated_unit_outcomes_weekly_query(
    params: Annotated[UnitOutcomesWeeklyQueryParams, Query()],
) -> UnitOutcomesWeeklyQuery:
    try:
        return UnitOutcomesWeeklyQuery(purposes=tuple(params.purpose))
    except ValidationError as exc:
        errors = [
            item | {"loc": ("query", *item["loc"])}
            for item in exc.errors(include_url=False, include_input=False, include_context=False)
        ]
        raise RequestValidationError(errors) from None


def validated_channel_failures_query(
    params: Annotated[ChannelFailuresQueryParams, Query()],
) -> ChannelFailuresQuery:
    try:
        return ChannelFailuresQuery(
            period=params.period,
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


def validated_failure_concentration_query(
    params: Annotated[FailureConcentrationQueryParams, Query()],
) -> FailureConcentrationQuery:
    try:
        return FailureConcentrationQuery(period=params.period, purposes=tuple(params.purpose))
    except ValidationError as exc:
        errors = [
            item | {"loc": ("query", *item["loc"])}
            for item in exc.errors(include_url=False, include_input=False, include_context=False)
        ]
        raise RequestValidationError(errors) from None


def validated_station_summary_query(
    params: Annotated[StationSummaryQueryParams, Query()],
) -> StationSummaryQuery:
    try:
        return StationSummaryQuery(purposes=tuple(params.purpose))
    except ValidationError as exc:
        errors = [
            item | {"loc": ("query", *item["loc"])}
            for item in exc.errors(include_url=False, include_input=False, include_context=False)
        ]
        raise RequestValidationError(errors) from None


def validated_recommendation_usage_query(
    params: Annotated[RecommendationUsageQueryParams, Query()],
) -> RecommendationUsageQuery:
    try:
        return RecommendationUsageQuery(period=params.period, purposes=tuple(params.purpose))
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
    "/query/schema",
    response_model=QuerySchemaConnectedResponse | RunActivityNotConnectedResponse,
    tags=["query"],
)
def query_schema(
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
) -> QuerySchemaConnectedResponse | RunActivityNotConnectedResponse:
    """Reviewed grant contract only; this endpoint never reads the live catalog."""
    if access is None:
        return RunActivityNotConnectedResponse()
    return QuerySchemaConnectedResponse(
        tls=access.tls,
        objects=[
            QuerySchemaObjectResponse(
                name=name,
                kind="view" if OBJECT_TYPES[name] == "V" else "table",
                columns=list(columns),
            )
            for name, columns in COLUMNS.items()
        ],
    )


@router.post(
    "/query/execute",
    response_model=QueryExecuteConnectedResponse | RunActivityNotConnectedResponse,
    responses={
        400: {"model": StatementRejectedResponse},
        422: {"model": QueryFailedResponse | ErrorResponse},
        503: {"model": ReportingFailureResponse},
    },
    tags=["query"],
)
def query_execute(
    request: QueryExecuteRequest,
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
) -> QueryExecuteConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    if access is None:
        return RunActivityNotConnectedResponse()
    try:
        result = access.repository.execute_console_query(request.sql)
    except StatementRejected as exc:
        return JSONResponse(
            status_code=400,
            content={"code": "statement_rejected", "reason": exc.reason},
        )
    except ConsoleQueryError as exc:
        return JSONResponse(
            status_code=422,
            content={
                "code": "query_failed",
                "sql_error_number": exc.sql_error_number,
                "message": exc.message,
            },
        )
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})
    return QueryExecuteConnectedResponse(
        tls=access.tls,
        executed_at_utc=result.executed_at_utc,
        elapsed_ms=result.elapsed_ms,
        columns=[
            QueryResultColumnResponse(name=column.name, type=column.type)
            for column in result.columns
        ],
        rows=[list(row) for row in result.rows],
        row_count=result.row_count,
        truncated=result.truncated,
        multiple_result_sets=result.multiple_result_sets,
    )


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
    "/reporting/channel-failures",
    response_model=ChannelFailuresConnectedResponse | RunActivityNotConnectedResponse,
    responses={503: {"model": ReportingFailureResponse}},
    tags=["reporting"],
)
def channel_failures(
    query: Annotated[ChannelFailuresQuery, Depends(validated_channel_failures_query)],
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
    extracted_at: Annotated[datetime, Depends(get_extracted_at_utc)],
) -> ChannelFailuresConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    """First-observation run-channel failures in one Pacific period, by logical channel."""
    if access is None:
        return RunActivityNotConnectedResponse()
    boundaries = compute_channel_activity_boundaries(extracted_at)
    try:
        metrics = access.repository.get_channel_failures(query, boundaries)
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})
    window = boundaries.periods[query.period]
    return ChannelFailuresConnectedResponse(
        tls=access.tls,
        extracted_at_utc=boundaries.extracted_at_utc,
        period=UnitStatusPeriodResponse(
            key=query.period,
            start_utc=window.start_utc,
            end_utc=window.end_utc,
            partial=window.partial,
        ),
        filters=ChannelActivityFilters(
            purpose=list(query.purposes),
            wavelength_mode=query.wavelength_mode,
            switch_model=query.switch_model,
        ),
        totals=FailureRateCountsResponse(**metrics.totals.model_dump()),
        runs=metrics.runs,
        max_channel=metrics.max_channel,
        channels=[ChannelFailureResponse(**channel.model_dump()) for channel in metrics.channels],
        incomplete=metrics.incomplete,
    )


@router.get(
    "/reporting/failure-concentration",
    response_model=FailureConcentrationConnectedResponse | RunActivityNotConnectedResponse,
    responses={503: {"model": ReportingFailureResponse}},
    tags=["reporting"],
)
def failure_concentration(
    query: Annotated[FailureConcentrationQuery, Depends(validated_failure_concentration_query)],
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
    extracted_at: Annotated[datetime, Depends(get_extracted_at_utc)],
) -> FailureConcentrationConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    """First-observation failures in one Pacific period, by logical channel and port."""
    if access is None:
        return RunActivityNotConnectedResponse()
    boundaries = compute_channel_activity_boundaries(extracted_at)
    try:
        metrics = access.repository.get_failure_concentration(query, boundaries)
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})
    window = boundaries.periods[query.period]
    return FailureConcentrationConnectedResponse(
        tls=access.tls,
        extracted_at_utc=boundaries.extracted_at_utc,
        period=UnitStatusPeriodResponse(
            key=query.period,
            start_utc=window.start_utc,
            end_utc=window.end_utc,
            partial=window.partial,
        ),
        filters=UnitStatusFilters(purpose=list(query.purposes)),
        totals=FailureRateCountsResponse(**metrics.totals.model_dump()),
        runs=metrics.runs,
        channels=[
            FailureConcentrationChannelResponse(**channel.model_dump())
            for channel in metrics.channels
        ],
        ports=[FailureConcentrationPortResponse(**port.model_dump()) for port in metrics.ports],
        incomplete=metrics.incomplete,
    )


@router.get(
    "/reporting/station-summary",
    response_model=StationSummaryConnectedResponse | RunActivityNotConnectedResponse,
    responses={503: {"model": ReportingFailureResponse}},
    tags=["reporting"],
)
def station_summary(
    query: Annotated[StationSummaryQuery, Depends(validated_station_summary_query)],
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
    extracted_at: Annotated[datetime, Depends(get_extracted_at_utc)],
) -> StationSummaryConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    """Last-30-day station-level failures, retests and elapsed seconds per channel."""
    if access is None:
        return RunActivityNotConnectedResponse()
    boundaries = compute_channel_activity_boundaries(extracted_at)
    try:
        metrics = access.repository.get_station_summary(query, boundaries)
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})
    window = boundaries.periods["last_30_days"]
    return StationSummaryConnectedResponse(
        tls=access.tls,
        extracted_at_utc=boundaries.extracted_at_utc,
        period=UnitStatusPeriodResponse(
            key="last_30_days",
            start_utc=window.start_utc,
            end_utc=window.end_utc,
            partial=window.partial,
        ),
        filters=UnitStatusFilters(purpose=list(query.purposes)),
        stations=[StationRowResponse(**station.model_dump()) for station in metrics.stations],
        totals=StationCountsResponse(**metrics.totals.model_dump()),
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
    "/reporting/unit-status",
    response_model=UnitStatusConnectedResponse | RunActivityNotConnectedResponse,
    responses={503: {"model": ReportingFailureResponse}},
    tags=["reporting"],
)
def unit_status(
    query: Annotated[UnitStatusQuery, Depends(validated_unit_status_query)],
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
    extracted_at: Annotated[datetime, Depends(get_extracted_at_utc)],
) -> UnitStatusConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    """Current effective status for the bounded D08 assignment cohort."""
    if access is None:
        return RunActivityNotConnectedResponse()
    boundaries = compute_channel_activity_boundaries(extracted_at)
    try:
        metrics = access.repository.get_unit_status(query, boundaries)
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})
    window = boundaries.periods[query.period]
    return UnitStatusConnectedResponse(
        tls=access.tls,
        extracted_at_utc=boundaries.extracted_at_utc,
        timezone=PACIFIC_TIMEZONE_NAME,
        period=UnitStatusPeriodResponse(
            key=query.period,
            start_utc=window.start_utc,
            end_utc=window.end_utc,
            partial=window.partial,
        ),
        filters=UnitStatusFilters(purpose=list(query.purposes)),
        counts=metrics.counts,
        units=[
            {
                key: value
                for key, value in asdict(unit).items()
                if key not in {"wavelength_mode", "effective_readings", "fail_limit"}
            }
            for unit in metrics.units
        ],
        incomplete=metrics.incomplete,
    )


@router.get(
    "/reporting/unit-test-time",
    response_model=UnitTestTimeConnectedResponse | RunActivityNotConnectedResponse,
    responses={503: {"model": ReportingFailureResponse}},
    tags=["reporting"],
)
def unit_test_time(
    query: Annotated[UnitTestTimeQuery, Depends(validated_unit_test_time_query)],
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
    extracted_at: Annotated[datetime, Depends(get_extracted_at_utc)],
) -> UnitTestTimeConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    """Cumulative qualifying-run time for units finished under working rule D17."""
    if access is None:
        return RunActivityNotConnectedResponse()
    boundaries = compute_channel_activity_boundaries(extracted_at)
    try:
        metrics = access.repository.get_unit_test_time(query, boundaries)
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})
    window = boundaries.periods[query.period]
    return UnitTestTimeConnectedResponse(
        tls=access.tls,
        extracted_at_utc=boundaries.extracted_at_utc,
        period=UnitTestTimePeriodResponse(
            key=query.period,
            start_utc=window.start_utc,
            end_utc=window.end_utc,
            partial=window.partial,
        ),
        filters=UnitTestTimeFilters(purpose=list(query.purposes)),
        units=[asdict(unit) for unit in metrics.units],
        finished=metrics.finished.model_dump(),
        excluded=metrics.excluded,
        incomplete=metrics.incomplete,
    )


@router.get(
    "/reporting/recent-finished-units",
    response_model=RecentFinishedUnitsConnectedResponse | RunActivityNotConnectedResponse,
    responses={503: {"model": ReportingFailureResponse}},
    tags=["reporting"],
)
def recent_finished_units(
    query: Annotated[RecentFinishedUnitsQuery, Depends(validated_recent_finished_units_query)],
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
    extracted_at: Annotated[datetime, Depends(get_extracted_at_utc)],
) -> RecentFinishedUnitsConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    """Newest D17-finished units for the selected Pacific summary period."""
    if access is None:
        return RunActivityNotConnectedResponse()
    boundaries = compute_channel_activity_boundaries(extracted_at)
    try:
        metrics = access.repository.get_recent_finished_units(query, boundaries)
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})
    window = boundaries.periods[query.period]
    return RecentFinishedUnitsConnectedResponse(
        tls=access.tls,
        extracted_at_utc=boundaries.extracted_at_utc,
        timezone=PACIFIC_TIMEZONE_NAME,
        period=UnitTestTimePeriodResponse(
            key=query.period,
            start_utc=window.start_utc,
            end_utc=window.end_utc,
            partial=window.partial,
        ),
        filters=UnitTestTimeFilters(purpose=list(query.purposes)),
        units=[asdict(unit) for unit in metrics.units],
        truncated=metrics.truncated,
        incomplete=metrics.incomplete,
    )


@router.get(
    "/reporting/unit-outcomes-weekly",
    response_model=UnitOutcomesWeeklyConnectedResponse | RunActivityNotConnectedResponse,
    responses={503: {"model": ReportingFailureResponse}},
    tags=["reporting"],
)
def unit_outcomes_weekly(
    query: Annotated[UnitOutcomesWeeklyQuery, Depends(validated_unit_outcomes_weekly_query)],
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
    extracted_at: Annotated[datetime, Depends(get_extracted_at_utc)],
) -> UnitOutcomesWeeklyConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    """Finished-unit outcomes over the current and seven prior Pacific weeks."""
    if access is None:
        return RunActivityNotConnectedResponse()
    boundaries = compute_weekly_outcome_boundaries(extracted_at)
    try:
        metrics = access.repository.get_unit_outcomes_weekly(query, boundaries)
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})
    return UnitOutcomesWeeklyConnectedResponse(
        tls=access.tls,
        extracted_at_utc=boundaries.extracted_at_utc,
        timezone=PACIFIC_TIMEZONE_NAME,
        filters=UnitOutcomesWeeklyFilters(purpose=list(query.purposes)),
        weeks=[asdict(week) for week in metrics.weeks],
        units=[asdict(unit) for unit in metrics.units],
        excluded=metrics.excluded,
        incomplete=metrics.incomplete,
    )


@router.get(
    "/reporting/recommendation-usage",
    response_model=RecommendationUsageConnectedResponse | RunActivityNotConnectedResponse,
    responses={503: {"model": ReportingFailureResponse}},
    tags=["reporting"],
)
def recommendation_usage(
    query: Annotated[RecommendationUsageQuery, Depends(validated_recommendation_usage_query)],
    access: Annotated[ReportingAccess | None, Depends(get_reporting_access)],
    extracted_at: Annotated[datetime, Depends(get_extracted_at_utc)],
) -> RecommendationUsageConnectedResponse | RunActivityNotConnectedResponse | JSONResponse:
    """Saved-recommendation linkage and predicted-improvement aggregates."""
    if access is None:
        return RunActivityNotConnectedResponse()
    boundaries = compute_channel_activity_boundaries(extracted_at)
    try:
        metrics = access.repository.get_recommendation_usage(query, boundaries)
    except ReportingError as exc:
        return JSONResponse(status_code=503, content={"code": exc.code})
    window = boundaries.periods[query.period]
    return RecommendationUsageConnectedResponse(
        tls=access.tls,
        extracted_at_utc=boundaries.extracted_at_utc,
        period=UnitStatusPeriodResponse(
            key=query.period,
            start_utc=window.start_utc,
            end_utc=window.end_utc,
            partial=window.partial,
        ),
        filters=UnitStatusFilters(purpose=list(query.purposes)),
        analyses=RecommendationUsageAnalyses(
            cohort=metrics.analyses_cohort,
            with_recommendations=metrics.analyses_with_recommendations,
            on_invalid_runs=metrics.analyses_on_invalid_runs,
        ),
        recommendations=RecommendationUsageCountsResponse(**metrics.recommendations.model_dump()),
        linked=RecommendationUsageCountsResponse(**metrics.linked.model_dump()),
        linked_share=metrics.linked_share,
        avg_improvement_linked_db=RecommendationUsageAverageResponse(
            **metrics.avg_improvement_linked_db.model_dump()
        ),
        avg_improvement_all_db=RecommendationUsageAverageResponse(
            **metrics.avg_improvement_all_db.model_dump()
        ),
        unlinked_events=metrics.unlinked_events,
        unlinked_unattributed=metrics.unlinked_unattributed,
        linked_events_in_period=metrics.linked_events_in_period,
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
