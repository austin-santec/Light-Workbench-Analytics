"""Transport models, deliberately independent of frontend presentation contracts."""

from datetime import UTC
from enum import StrEnum
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator


class HealthResponse(BaseModel):
    status: Literal["alive"] = "alive"
    scope: Literal["process_only"] = "process_only"


class SystemInfo(BaseModel):
    service: str
    service_version: str
    api_version: Literal["v1"] = "v1"
    environment: Literal["development", "test"]
    stage: Literal["development_foundation"] = "development_foundation"
    data_source: Literal["not_connected"] = "not_connected"


class RunPurpose(StrEnum):
    PRODUCTION = "production"
    ENGINEERING = "engineering"
    TRAINING = "training"
    CALIBRATION = "calibration"


class DemoModel(StrEnum):
    A = "DEMO-MODEL-A"
    B = "DEMO-MODEL-B"


class DemoRun(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    run_id: str = Field(pattern=r"^DEMO-RUN-\d{4}$")
    unit_id: str = Field(pattern=r"^DEMO-UNIT-\d{4}$")
    switch_id: str = Field(pattern=r"^DEMO-SWITCH-\d{4}$")
    model: DemoModel
    purpose: RunPurpose
    started_at: AwareDatetime

    @field_validator("started_at")
    @classmethod
    def normalize_utc(cls, value: AwareDatetime) -> AwareDatetime:
        return value.astimezone(UTC)


class DemoRunQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    purpose: RunPurpose | None = None
    model: DemoModel | None = None
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0, le=10000)


class Pagination(BaseModel):
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0, le=10000)
    total: int = Field(ge=0)
    has_more: bool


class DemoRunsResponse(BaseModel):
    synthetic: Literal[True] = True
    items: list[DemoRun]
    pagination: Pagination


class RunActivityQueryParams(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    started_from: AwareDatetime
    started_before: AwareDatetime
    purpose: RunPurpose | None = None
    wavelength_mode: Literal["SM", "MM"] | None = None
    switch_model: str | None = None


class RunActivityWindow(BaseModel):
    started_from: AwareDatetime
    started_before: AwareDatetime


class RunActivityFilters(BaseModel):
    purpose: RunPurpose | None
    wavelength_mode: Literal["SM", "MM"] | None
    switch_model: str | None


class DurationStatisticsResponse(BaseModel):
    n: int = Field(ge=0)
    mean: float | None
    median: float | None
    p90: float | None
    sample_state: Literal["no_data", "small_sample", "ok"]


class StoppedStatisticsResponse(BaseModel):
    n: int = Field(ge=0)
    mean: float | None
    sample_state: Literal["no_data", "small_sample", "ok"]


class RunCountsResponse(BaseModel):
    count_basis: Literal["runs_started_in_window_not_units"] = "runs_started_in_window_not_units"
    total: int = Field(ge=0)
    by_run_purpose: dict[RunPurpose, int]
    by_completion_status: dict[Literal["in_progress", "complete", "stopped", "failed"], int]


class RunTimingResponse(BaseModel):
    open_runs: int = Field(ge=0)
    by_quality: dict[
        Literal[
            "confirmed",
            "checkpoint_estimate",
            "partial",
            "provisional",
            "unavailable",
        ],
        int,
    ]
    active_seconds: DurationStatisticsResponse
    elapsed_seconds: DurationStatisticsResponse
    stopped_seconds: StoppedStatisticsResponse
    flagged_over_90_min: int = Field(ge=0)


class RunActivityConnectedResponse(BaseModel):
    data_source: Literal["test_database"] = "test_database"
    tls: Literal["verified", "encrypted_unverified"]
    window: RunActivityWindow
    filters: RunActivityFilters
    incomplete: bool
    runs: RunCountsResponse
    timing: RunTimingResponse


class RunActivityNotConnectedResponse(BaseModel):
    data_source: Literal["not_connected"] = "not_connected"


class ReportingFailureResponse(BaseModel):
    code: str


class ErrorDetail(BaseModel):
    field: str
    code: str


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    error: ErrorBody
