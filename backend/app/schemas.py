"""Transport models, deliberately independent of frontend presentation contracts."""

from datetime import UTC
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    StringConstraints,
    field_validator,
)


def _decimal_json_number(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))


JsonDecimal = Annotated[
    Decimal,
    PlainSerializer(_decimal_json_number, return_type=float, when_used="json"),
]


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


class TestTimeByConfigurationQueryParams(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    started_from: AwareDatetime
    started_before: AwareDatetime
    purpose: RunPurpose | None = None
    wavelength_mode: Literal["SM", "MM"] | None = None


class RunActivityWindow(BaseModel):
    started_from: AwareDatetime
    started_before: AwareDatetime


class RunActivityFilters(BaseModel):
    purpose: RunPurpose | None
    wavelength_mode: Literal["SM", "MM"] | None
    switch_model: str | None


class TestTimeByConfigurationFilters(BaseModel):
    purpose: RunPurpose | None
    wavelength_mode: Literal["SM", "MM"] | None


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


class ConfigurationTestTimeResponse(BaseModel):
    switch_model: str = Field(min_length=1, max_length=30)
    wavelength_mode: Literal["SM", "MM"]
    front_panel_channel_count: int | None = Field(default=None, gt=0)
    runs: int = Field(ge=0)
    open_runs: int = Field(ge=0)
    elapsed_seconds: DurationStatisticsResponse
    active_seconds: DurationStatisticsResponse
    confirmed_timing_runs: int = Field(ge=0)
    unavailable_timing_runs: int = Field(ge=0)
    seconds_per_channel: float | None = Field(default=None, ge=0)
    flagged_over_90_min: int = Field(ge=0)


class TestTimeByConfigurationConnectedResponse(BaseModel):
    data_source: Literal["test_database"] = "test_database"
    tls: Literal["verified", "encrypted_unverified"]
    window: RunActivityWindow
    filters: TestTimeByConfigurationFilters
    incomplete: bool
    configurations: list[ConfigurationTestTimeResponse]


class ReportingFailureResponse(BaseModel):
    code: str


class UnitSearchQueryParams(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    q: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]


class UnitSearchItem(BaseModel):
    unit_id: int = Field(gt=0)
    main_board_serial: str
    part_number: str | None
    unit_model: str | None
    current_switch_serial: str | None
    current_switch_model: str | None
    last_run_started_at_utc: AwareDatetime | None
    run_count: int = Field(ge=0)


class UnitSearchConnectedResponse(BaseModel):
    data_source: Literal["test_database"] = "test_database"
    tls: Literal["verified", "encrypted_unverified"]
    items: list[UnitSearchItem]
    has_more: bool


class UnitDetail(BaseModel):
    unit_id: int = Field(gt=0)
    main_board_serial: str
    part_number: str | None
    unit_model: str | None
    front_panel_channel_count: int | None = Field(default=None, gt=0)
    created_at_utc: AwareDatetime
    updated_at_utc: AwareDatetime


class UnitAssignment(BaseModel):
    assignment_id: int = Field(gt=0)
    switch_serial: str
    switch_model: str
    firmware_version: str | None
    installed_at_utc: AwareDatetime
    installed_by: str
    removed_at_utc: AwareDatetime | None
    removed_by: str | None
    removal_reason: str | None


class RunVoidInfo(BaseModel):
    voided_at_utc: AwareDatetime
    voided_by: str
    reason: str


class RunLimits(BaseModel):
    model: str
    wavelength_mode: Literal["SM", "MM"]
    too_good_below_db: JsonDecimal
    warning_enabled: bool
    warning_above_db: JsonDecimal | None
    fail_above_db: JsonDecimal


class RunTiming(BaseModel):
    quality: Literal["confirmed", "checkpoint_estimate", "partial", "provisional", "unavailable"]
    active_seconds: float | None = Field(default=None, ge=0)
    elapsed_seconds: float = Field(ge=0)
    stopped_seconds: float | None = Field(default=None, ge=0)
    session_count: int = Field(ge=0)


class RunMeasurementCounts(BaseModel):
    logical_channels_measured: int = Field(ge=0)
    failing_channels: int | None = Field(default=None, ge=0)
    warning_channels: int | None = Field(default=None, ge=0)
    extra_candidates_measured: int = Field(ge=0)


class UnitRun(BaseModel):
    run_id: int = Field(gt=0)
    assignment_id: int = Field(gt=0)
    run_number: int = Field(gt=0)
    run_started_at_utc: AwareDatetime
    run_ended_at_utc: AwareDatetime | None
    tested_by: str
    station_number: int | None = Field(default=None, gt=0)
    wavelength_mode: Literal["SM", "MM"]
    operating_band: str
    front_panel_channel_count: int | None = Field(default=None, gt=0)
    part_number_snapshot: str | None
    application_version: str
    completion_status: Literal["in_progress", "complete", "stopped", "failed"]
    run_purpose: RunPurpose
    analysis_status: Literal["pending", "included", "excluded", "superseded"]
    superseded_by_run_id: int | None = Field(default=None, gt=0)
    void_info: RunVoidInfo | None
    limits: RunLimits | None
    timing: RunTiming
    counts: RunMeasurementCounts


class UnitDetailConnectedResponse(BaseModel):
    data_source: Literal["test_database"] = "test_database"
    tls: Literal["verified", "encrypted_unverified"]
    unit: UnitDetail
    assignments: list[UnitAssignment]
    assignments_incomplete: bool
    runs: list[UnitRun]
    has_more: bool


class ChannelAttempt(BaseModel):
    measurement_id: int = Field(gt=0)
    logical_channel: int | None = Field(default=None, gt=0)
    physical_port: int = Field(gt=0)
    attempt_number: int = Field(gt=0)
    wavelength_1_nm: int = Field(gt=0)
    wavelength_1_il_db: JsonDecimal
    wavelength_2_nm: int = Field(gt=0)
    wavelength_2_il_db: JsonDecimal
    written_at_utc: AwareDatetime
    written_by: str
    is_current: bool
    classification: Literal["pass", "warning", "fail", "too_good", "unknown"] | None
    classification_rule: str | None


class RunChannelsConnectedResponse(BaseModel):
    data_source: Literal["test_database"] = "test_database"
    tls: Literal["verified", "encrypted_unverified"]
    run_id: int = Field(gt=0)
    logical_channels: list[ChannelAttempt]
    extra_candidates: list[ChannelAttempt]
    incomplete: bool


class ChannelMapItem(BaseModel):
    logical_channel: int = Field(gt=0)
    initial_physical_port: int = Field(gt=0)
    effective_physical_port: int = Field(gt=0)
    is_replaced: bool
    latest_replaced_at_utc: AwareDatetime | None


class ReplacementItem(BaseModel):
    replacement_id: int = Field(gt=0)
    logical_channel: int = Field(gt=0)
    previous_physical_port: int = Field(gt=0)
    replacement_physical_port: int = Field(gt=0)
    reason: str
    replaced_by: str
    replaced_at_utc: AwareDatetime
    related_run_id: int | None = Field(default=None, gt=0)
    source_recommendation_id: int | None = Field(default=None, gt=0)
    notes: str | None


class ConfirmedExtraPortItem(BaseModel):
    physical_port: int = Field(gt=0)
    wavelength_1_nm: int = Field(gt=0)
    wavelength_1_il_db: JsonDecimal
    wavelength_2_nm: int = Field(gt=0)
    wavelength_2_il_db: JsonDecimal
    attempt_number: int = Field(gt=0)
    run_id: int = Field(gt=0)
    written_at_utc: AwareDatetime
    analysis_status: Literal["pending", "included", "excluded", "superseded"]


class SpareItem(BaseModel):
    spare_event_id: int = Field(gt=0)
    physical_port: int = Field(gt=0)
    action: Literal["designated", "undesignated"]
    recorded_by: str
    recorded_at_utc: AwareDatetime


class AnalysisRecommendationItem(BaseModel):
    recommendation_id: int = Field(gt=0)
    recommendation_rank: int = Field(gt=0)
    category: Literal["required", "optional"]
    logical_channel: int = Field(gt=0)
    current_physical_port: int = Field(gt=0)
    candidate_physical_port: int = Field(gt=0)
    current_wavelength_1_il_db: JsonDecimal
    current_wavelength_2_il_db: JsonDecimal
    candidate_wavelength_1_il_db: JsonDecimal
    candidate_wavelength_2_il_db: JsonDecimal
    current_worst_loss_db: JsonDecimal
    candidate_worst_loss_db: JsonDecimal
    improvement_db: JsonDecimal
    used: bool


class ReplacementAnalysisItem(BaseModel):
    analysis_id: int = Field(gt=0)
    run_id: int = Field(gt=0)
    analyzed_at_utc: AwareDatetime
    analyzed_by: str
    result_status: str
    recommendations: list[AnalysisRecommendationItem]


class AssignmentHardwareConnectedResponse(BaseModel):
    data_source: Literal["test_database"] = "test_database"
    tls: Literal["verified", "encrypted_unverified"]
    assignment_id: int = Field(gt=0)
    channel_map: list[ChannelMapItem]
    replacements: list[ReplacementItem]
    extra_ports: list[ConfirmedExtraPortItem]
    spares: list[SpareItem]
    analyses: list[ReplacementAnalysisItem]
    incomplete: bool


class ErrorDetail(BaseModel):
    field: str
    code: str


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    error: ErrorBody
